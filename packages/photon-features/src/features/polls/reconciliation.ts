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

import type { UnitOfWork } from "../../contracts/store.js";
import type { TrustedContext } from "../../contracts/context.js";
import type { IncomingEvent } from "../../contracts/events.js";
import type { OperationResult } from "../../contracts/results.js";
import type { PollRecord } from "../../state/ports.js";
import { resolvePollIdentity, type PollRef } from "./identity.js";
import { applyPollEvent, type PollEventPolicy } from "./reducer.js";
import { parseNativePollState, type NativePollState } from "./sdk.js";

/** Data from a shared-owner authoritative lookup, never derived from labels or caller choice keys.
 * Full options are required so a partial/stale snapshot cannot remove known identities.
 * This snapshot registers metadata only, not provider vote state or delivery evidence.
 */
export interface NativePollIdentitySnapshot {
  poll: PollRef;
  nativePollGuid: string;
  options: readonly {nativeId: string; label: string}[];
}

export interface ReconciledNativePollState {
  poll: PollRecord;
  references: OperationResult["references"];
  value: Extract<NonNullable<OperationResult["value"]>, { type: "poll" }>;
}

/** Validate a full authoritative provider snapshot, retain every native option ID,
 * and project only observed vote counts into the public result. Participant
 * identities are not converted into incoming events or impersonated actions.
 */
export function reconcileNativePollState(unit: UnitOfWork, context: Readonly<TrustedContext>, input: {
  poll: PollRef;
  conversationId: string;
  state: NativePollState;
}): ReconciledNativePollState {
  const state = parseNativePollState(input.state);
  const poll = resolvePollIdentity(unit, input.poll, context);
  if (state.chatGuid !== input.conversationId) throw new Error("SCOPE_MISMATCH");
  const owner = unit.get("references", poll.id);
  if (!owner || owner.providerId !== state.pollMessageGuid) throw new Error("POLL_IDENTITY_MISMATCH");
  const references = registerNativeOptions(unit, {
    poll: poll.reference,
    nativePollGuid: state.pollMessageGuid,
    options: state.options.map(value => ({ nativeId: value.optionIdentifier, label: value.text })),
  });
  let stored = unit.get("polls", poll.id)!;
  if (stored.question !== state.title) {
    unit.put("polls", { ...stored, revision: stored.revision + 1, question: state.title }, stored.revision);
    stored = unit.get("polls", poll.id)!;
  }
  const counts = new Map<string, number>();
  for (const vote of state.votes) counts.set(vote.optionIdentifier, (counts.get(vote.optionIdentifier) ?? 0) + 1);
  const options = stored.options.map(option => {
    const native = unit.get("references", option.reference.id);
    if (!native) throw new Error("NATIVE_OPTION_LOOKUP_REQUIRED");
    return { reference: option.reference, label: option.label, votes: counts.get(native.providerId) ?? 0 };
  });
  return {
    poll: stored,
    references: [stored.reference, ...references],
    value: { type: "poll", question: stored.question, options },
  };
}

/** Registration only: network lookup must finish before opening this UoW.
 * The host rechecks active claim and task generation around lookup and transaction.
 * Without a snapshot F0 cannot do a native lookup; return an explicit shared blocker.
 */
export function reconcilePollState(unit: UnitOfWork, context: Readonly<TrustedContext>,
  snapshot?: NativePollIdentitySnapshot) {
  if (!snapshot) return { status: "blocked" as const, blockerId: "wt-05-advanced-polls" };
  const poll = resolvePollIdentity(unit, snapshot.poll, context);
  const options = registerNativeOptions(unit, { ...snapshot, poll: poll.reference });
  return { status: "registered" as const, options };
}

/** Reprocess a bounded batch loaded from the shared durable inbox after identity registration.
 * This function does not claim to persist unresolved events: caller must retain each unresolved
 * disposition and atomically acknowledge successful ones. Exceptions roll back the whole batch.
 */
export function retryUnresolvedPollEvents(events: readonly IncomingEvent[], unit: UnitOfWork,
  context: Readonly<TrustedContext>, policy: PollEventPolicy) {
  if (events.length > 100) throw new Error("POLL_RECONCILIATION_BATCH_TOO_LARGE");
  return events.map(event => ({ eventId: event.eventId, ...applyPollEvent(event, unit, context, policy) }));
}
