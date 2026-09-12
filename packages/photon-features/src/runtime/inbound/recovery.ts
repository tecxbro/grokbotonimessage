import type { Clock, IncomingEvent } from "../../contracts/index.js";
import type { CaptureStore } from "../../adapters/transport/capture.js";
import type { ProviderContext } from "../../adapters/transport/provider-context.js";
import { normalizeCaptured, type Correlations } from "./normalize.js";
import { processCapturedMessage, UnresolvedCapturedMessage, type CaptureProcessing } from "../../adapters/transport/message-events.js";
import type { SpectrumOwner } from "../../adapters/transport/spectrum-owner.js";

/** Replay local captures after a crash between capture and SQLite commit.
 * Does not read transcripts or request undocumented provider recovery. */
export async function recoverCaptures(
  ids: Iterable<string>,
  captures: CaptureStore,
  routes: ProviderContext,
  clock: Clock,
  accept: (event: IncomingEvent) => Promise<void>,
  correlations: Correlations = {},
  processing?: {
    owner: SpectrumOwner;
    receipts: CaptureProcessing["receipts"];
    registerReferences: CaptureProcessing["registerReferences"];
  },
): Promise<string[]> {
  const unresolved: string[] = [];
  for (const id of ids) {
    const raw = captures.read(id);
    const input =
      raw !== null && typeof raw === "object" && "message" in raw
        ? raw.message
        : raw;
    const capturedAt =
      raw !== null &&
      typeof raw === "object" &&
      "capturedAt" in raw &&
      typeof raw.capturedAt === "number"
        ? raw.capturedAt
        : clock.now();
    if (processing) {
      try {
        await processCapturedMessage({
          snapshot: input,
          captureId: id,
          owner: processing.owner,
          capturedAt,
          accept,
          processing: {
            receipts: processing.receipts,
            registerReferences: processing.registerReferences,
            correlations,
          },
        });
      } catch (error) {
        if (!(error instanceof UnresolvedCapturedMessage)) throw error;
        unresolved.push(id);
      }
    } else {
      // Coordinator must pass the production processing services. Retain the
      // positional compatibility path only until that read-only wiring lands.
      let event: IncomingEvent;
      try {
        event = normalizeCaptured(input, id, routes, capturedAt, correlations);
      } catch {
        unresolved.push(id);
        continue;
      }
      await accept(event);
    }
  }
  return unresolved;
}
