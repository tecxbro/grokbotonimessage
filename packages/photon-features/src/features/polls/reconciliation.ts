import type { EventReducer, Scope, Transaction, TransactionStore } from "../../index.js";
import { registerNativeOptions } from "./identity.js";

/** Retry retained events after authoritative identity registration, within bounded UoW work.
 * No SDK calls; missing native lookup/order/actor remains explicitly unresolved at F0.
 * Network reads, once approved, must happen before this transaction and be version checked.
 */
export function reconcilePollEvents(store: TransactionStore, scope: Scope, reducer: EventReducer) {
  return store.transaction(tx => reconcileInTransaction(tx, scope, reducer));
}

/** Use after an approved native metadata read. Registration and pending option/vote continuations commit together. */
export function registerAndReconcilePollOptions(store: TransactionStore,
  input: Parameters<typeof registerNativeOptions>[1], reducer: EventReducer) {
  return store.transaction(tx => {
    registerNativeOptions(tx, input);
    return reconcileInTransaction(tx, input.poll.scope, reducer);
  });
}

function reconcileInTransaction(tx: Transaction, scope: Scope, reducer: EventReducer) {
    const rows = tx.list("inbox", scope, 1000);
    if (rows.length === 1000) throw new Error("RECONCILIATION_REQUIRES_PAGINATION");
    let resolved = 0;
    let unresolved = 0;
    for (const row of rows) {
      if (row.event.type !== "poll" || row.state === "reduced") continue;
      reducer.reduce(row.event, tx);
      if (tx.get("inbox", row.id)?.state === "reduced") resolved++;
      else unresolved++;
    }
    return { resolved, unresolved };
}
