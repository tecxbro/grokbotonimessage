import { sameScope, type Scope } from "../../contracts/index.js";
import type { Transaction } from "../../state/index.js";

/** An ingestion barrier, NOT a provider resume token. Call only in the transaction
 * persisting the events. SDK 12.8.0 exposes no host-managed iMessage recovery cursor. */
export function contiguousDurablePrefix(
  tx: Transaction,
  scope: Scope,
  precedingEventIds: readonly string[],
): number {
  let count = 0;
  for (const id of precedingEventIds) {
    const row = tx.get("inbox", id);
    if (!row || !sameScope(scope, row.scope)) break;
    count++;
  }
  return count;
}
export const recoveryEvidence = Object.freeze({
  sdkVersion: "12.8.0",
  publicResumeCursor: false,
  publicConnectionState: false,
  withinProcess:
    "provider internally reconnects and catches up from its volatile cursor",
  restart:
    "replay local durable captures/inbox; provider gap remains unrecoverable through public Spectrum API",
  order:
    "only explicitly supplied ordering is authoritative; do not parse sequences out of synthetic IDs",
});
