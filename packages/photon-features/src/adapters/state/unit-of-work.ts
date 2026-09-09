import {
  incomingEventSchema,
  sameScope,
  type EventReducer,
  type IncomingEvent,
  type TrustedContext,
  type WakeAdapter,
  type Clock,
} from "../../contracts/index.js";
import type { HandoffRecord, TransactionStore } from "../../state/index.js";
import { digest, canonical } from "../../runtime/core/idempotency.js";
import { fault } from "../../runtime/core/errors.js";
function stableEvent(event: IncomingEvent): unknown {
  const { receivedAt: _, ...identity } = event;
  return identity;
}
export function eventIdentity(event: IncomingEvent): string {
  return digest([
    event.ordering.source,
    event.scope.projectId,
    event.scope.provider,
    event.scope.accountId,
    event.scope.lineId,
    event.providerEventId ?? event.eventId,
  ]);
}
/** Reducer state, inbox disposition and continuation are one F0 synchronous transaction. */
export async function applyInteraction(
  store: TransactionStore,
  eventInput: IncomingEvent,
  context: TrustedContext,
  reducer: EventReducer | undefined,
  wake: WakeAdapter,
  clock: Clock,
): Promise<{
  handoffId: string | null;
  wake: "accepted" | "failed" | "unknown" | "not-needed";
}> {
  const event = incomingEventSchema.parse(eventInput);
  if (!sameScope(event.scope, context.scope)) fault("SCOPE_MISMATCH");
  const id = eventIdentity(event),
    handoffId = digest([
      id,
      context.principalId,
      context.taskId,
      context.generation,
    ]);
  const persisted = store.transaction((tx) => {
    const existing = tx.get("inbox", id);
    if (existing) {
      if (
        canonical(stableEvent(existing.event)) !== canonical(stableEvent(event))
      )
        fault("IDEMPOTENCY_CONFLICT");
      return tx.get("handoffs", handoffId) ?? null;
    }
    const task = tx.get("tasks", context.taskId),
      grant = tx.get("contexts", context.contextId);
    if (
      !task ||
      task.generation !== context.generation ||
      task.cancelledAt !== null ||
      task.principalId !== context.principalId ||
      !sameScope(task.scope, context.scope) ||
      !grant ||
      grant.context.revokedAt !== null ||
      grant.context.principalId !== context.principalId ||
      grant.context.generation !== context.generation ||
      grant.context.taskId !== context.taskId ||
      !sameScope(grant.context.scope, context.scope) ||
      grant.context.issuedAt > clock.now() ||
      grant.context.expiresAt <= clock.now()
    )
      fault("STALE_GENERATION");
    tx.put(
      "inbox",
      {
        id,
        scope: event.scope,
        revision: 0,
        event,
        state: reducer ? "reduced" : "unresolved",
      },
      null,
    );
    if (!reducer) {
      tx.put(
        "unresolved",
        {
          id,
          scope: event.scope,
          revision: 0,
          eventId: id,
          reason: "NO_REGISTERED_REDUCER",
          checkpointId: null,
        },
        null,
      );
      return null;
    }
    if (reducer.type !== event.type) fault("INVALID_REQUEST");
    const reduction: unknown = reducer.reduce(event, tx);
    if (
      reduction !== null &&
      (typeof reduction === "object" || typeof reduction === "function") &&
      "then" in reduction
    ) {
      void Promise.resolve(reduction).catch(() => {});
      fault("INVALID_REQUEST");
    }
    const handoff: HandoffRecord = {
      id: handoffId,
      scope: event.scope,
      revision: 0,
      taskId: context.taskId,
      generation: context.generation,
      principalId: context.principalId,
      eventIds: [id],
      state: "pending",
      claim: null,
      createdAt: event.receivedAt,
    };
    tx.put("handoffs", handoff, null);
    return handoff;
  });
  if (
    !persisted ||
    persisted.state === "acknowledged" ||
    persisted.state === "cancelled"
  )
    return { handoffId: persisted?.id ?? null, wake: "not-needed" };
  try {
    return {
      handoffId,
      wake: (
        await wake.wake({
          handoffId,
          taskId: context.taskId,
          generation: context.generation,
        })
      ).status,
    };
  } catch {
    return { handoffId, wake: "unknown" };
  }
}
