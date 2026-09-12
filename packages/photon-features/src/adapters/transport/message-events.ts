import type { Clock, IncomingEvent } from "../../contracts/index.js";
import type { CaptureStore } from "./capture.js";
import type { SpectrumOwner } from "./spectrum-owner.js";
import { snapshotMessage } from "./snapshot.js";
import { normalizeInboundEvent, type Correlations } from "../../runtime/inbound/normalize.js";
import { observeReceipt, type ReceiptAcquisition } from "../../runtime/inbound/receipt-observer.js";

export type RegisterIncomingReferences = (
  snapshot: unknown,
  event: IncomingEvent,
) => Promise<void>;
export interface CaptureProcessing {
  receipts: ReceiptAcquisition;
  registerReferences: RegisterIncomingReferences;
  correlations?: Correlations;
  /** Single-route hosts reject foreign conversations after authenticated
   * normalization but before any reference or inbox authorization is granted. */
  authorize?(event: IncomingEvent): boolean;
}
export class UnresolvedCapturedMessage extends Error {}

/** One ordered post-capture path for live streams, webhooks and replay. Reference
 * registration and receipt persistence complete before inbox acceptance exposes
 * the event to a handoff. */
export async function processCapturedMessage(options: {
  snapshot: unknown;
  captureId: string;
  owner: SpectrumOwner;
  capturedAt: number;
  accept(event: IncomingEvent): Promise<void>;
  processing: CaptureProcessing;
}): Promise<IncomingEvent> {
  const { snapshot, captureId, owner, capturedAt, accept, processing } = options;
  let event: IncomingEvent;
  try {
    event = normalizeInboundEvent(
      snapshot,
      captureId,
      owner.routes,
      capturedAt,
      processing.correlations,
    );
  } catch (error) {
    throw new UnresolvedCapturedMessage("UNRESOLVED_ROUTE", { cause: error });
  }
  if (processing.authorize && !processing.authorize(event))
    throw new UnresolvedCapturedMessage("UNRESOLVED_ROUTE");
  await processing.registerReferences(snapshot, event);
  await observeReceipt(snapshot, owner.routes, capturedAt, processing.receipts);
  await accept(event);
  return event;
}

/** The only subscription for this owner; accepts sequentially after raw capture.
 * completion rejects on persistence or provider failure, so the host can stop and
 * recover captures. No fire-and-forget durability claim or independent receipts feed. */
export function subscribeMessageEvents(options: {
  owner: SpectrumOwner; captures: CaptureStore; clock: Clock;
  accept(event: IncomingEvent): Promise<void>;
  receipts: ReceiptAcquisition;
  registerReferences: RegisterIncomingReferences;
  correlations?: Correlations;
  report(code: string): void;
}) {
  const {owner, captures, clock, accept, receipts, registerReferences, correlations, report} = options;
  const stream = owner.stream("wt-02.messages");
  let stopping = false;
  report("RESTART_GAP");
  const completion = (async () => {
    try {
      for await (const [, message] of stream) {
        const snapshot = snapshotMessage(message);
        const capturedAt = clock.now();
        const captureId = captures.put({capturedAt, message: snapshot});
        try {
          await processCapturedMessage({
            snapshot, captureId, owner, capturedAt, accept,
            processing: {receipts, registerReferences, correlations},
          });
        } catch (error) {
          if (!(error instanceof UnresolvedCapturedMessage)) throw error;
          report("UNRESOLVED_ROUTE");
          if (stopping) break;
          continue;
        }
        if (stopping) break;
      }
      if (!stopping) throw new Error("UNEXPECTED_STREAM_END");
    } catch (error) {
      owner.receiveFailed(); report("RECEIVE_FAILED"); throw error;
    }
  })();
  // Attach rejection handling immediately; callers still receive the rejecting promise.
  void completion.catch(() => undefined);
  return {completion, async stop() { stopping = true; await owner.stop(); await completion; }};
}
