import { isDeepStrictEqual } from "node:util";
import type { Action } from "../contracts/index.js";
import type { ExecutionServices } from "../contracts/services.js";
import type { ExecutionClaims } from "../runtime/core/claims.js";
import type { TypingExecutionBinding } from "../runtime/typing/operations.js";

type TypingAction = Extract<Action, { operation: "typing.begin" | "typing.end" }>;

/** Issue authority for one transient typing lease while its request is claimed.
 * The scheduling operation remains fenced. A later start may outlive successful
 * scheduling, but never its expiry, admitted action, scope or current task grant.
 * Private execution records stay in the host; feature code receives validators.
 * No grant is persisted and no delayed start is recreated on process restart. */
export function bindProductionTyping(
  claims: ExecutionClaims,
  requestId: string,
  action: TypingAction,
  services: ExecutionServices,
): TypingExecutionBinding {
  services.assertActiveClaim();
  const admitted = structuredClone(action);
  const context = structuredClone(services.context);
  const claim = { ...services.claim };
  const expiresAt = Math.min(context.expiresAt, claim.leaseUntil);
  claims.store.transaction(tx => {
    const { row } = claims.writable(tx, requestId, claim);
    if (!isDeepStrictEqual(row.action, admitted)) throw new Error("FORBIDDEN");
  });

  return {
    requestId,
    resultRevision: 0,
    expiresAt,
    assertCurrent: () => services.assertActiveClaim(),
    assertLeaseCurrent: () => {
      if (services.signal.aborted) throw new Error("CANCELLED");
      if (services.clock.now() >= expiresAt) throw new Error("TYPING_WORK_EXPIRED");
      claims.store.transaction(tx => {
        // These checks read durable state on every dispatch. They reject task
        // cancellation, revoked/expired contexts, changed generations, narrowed
        // permissions and moved/removed conversation references.
        const current = claims.contexts.action(tx, context, admitted);
        const row = claims.contexts.owned(tx, requestId, current);
        if (!isDeepStrictEqual(row.action, admitted)) throw new Error("FORBIDDEN");
        if (row.cancellationRequestedAt !== null) throw new Error("CANCELLED");
        if (row.result.status === "queued") {
          // Before successful scheduling commits, the original fence must still
          // own the request. Recovery/reassignment must not authorize an old job.
          claims.writable(tx, requestId, claim);
        } else if (row.result.status !== "executor-completed" || row.claim !== null) {
          // Failed, cancelled, blocked or uncertain work grants no deferred start.
          throw new Error("STALE_FENCE");
        }
      });
    },
  };
}
