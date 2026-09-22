import { createHash } from "node:crypto";
import { actionSchema, type Action } from "../../contracts/actions.js";
import type { DurableSubmission } from "./submission.js";
import {
  sameScope,
  type Scope,
  type TrustedContext,
  type IncomingEvent,
} from "../../contracts/index.js";
import type { TransactionStore, HandoffRecord } from "../../state/index.js";
import { authorizedConversation } from "./conversation-routes.js";
import type { Transaction } from "../../state/ports.js";
import { DurableContexts } from "./authorization.js";
import { fault } from "./errors.js";
export class DurableWork {
  constructor(
    private readonly store: TransactionStore,
    private readonly contexts: DurableContexts,
    private readonly scopes: (tx: Transaction, context: TrustedContext) => Scope[] = (_tx, context) => [context.scope],
  ) {}
  list(c: TrustedContext, limit: number): HandoffRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fault("INVALID_REQUEST");
    return this.store.transaction((tx) => {
      const current = this.contexts.refresh(tx, c);
      return this.scopes(tx, current).filter(scope => authorizedConversation(tx, current, scope)).flatMap(scope => tx.listWork(
        scope,
        current.principalId,
        current.taskId,
        current.generation,
        this.contexts.clock.now(),
        limit,
      )).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, limit);
    });
  }

  /** Atomically admit final operations and close the exact claim. Replays of an
   * identical completion return the same work; changed payloads fail closed. */
  complete(c: TrustedContext, id: string, fence: number, inputs: Action[], submission: DurableSubmission) {
    if (!Array.isArray(inputs) || inputs.length > 16) fault("INVALID_REQUEST");
    const actions = inputs.map(value => actionSchema.parse(value));
    if (actions.some(action => action.contextId !== c.contextId)) fault("FORBIDDEN");
    const digest = createHash("sha256").update(JSON.stringify(actions)).digest("hex");
    return this.store.transaction(tx => {
      c = this.contexts.refresh(tx, c);
      const h = tx.get("handoffs", id), now = this.contexts.clock.now();
      if (!h || h.principalId !== c.principalId || h.taskId !== c.taskId || h.generation !== c.generation ||
          !authorizedConversation(tx, c, h.scope)) return fault("RESOURCE_NOT_FOUND");
      if (h.state === "cancelled") fault("CANCELLED");
      if (!h.claim || h.claim.owner !== c.principalId || h.claim.fence !== fence || h.claim.generation !== c.generation)
        fault("STALE_FENCE");
      if (h.completion) {
        if (h.completion.digest !== digest) fault("IDEMPOTENCY_CONFLICT");
      } else {
        if (h.state !== "claimed" || h.claim.leaseUntil <= now) fault("STALE_FENCE");
        const requestIds = actions.map(action => submission.submitInTransaction(tx, action, c).requestId);
        h.completion = { digest, requestIds, finishedAt: now };
        h.state = "acknowledged";
        const revision = h.revision++;
        tx.put("handoffs", h, revision);
      }
      const events = h.eventIds.map(id => {
        const row = tx.get("inbox", id);
        if (!row || !sameScope(row.scope, h.scope)) return fault("RESOURCE_NOT_FOUND");
        return row.event;
      });
      return { handoff: h, events };
    });
  }

  change(
    c: TrustedContext,
    id: string,
    method: "claim" | "heartbeat" | "ack",
    fence?: number,
    leaseMs = 1000,
  ): { handoff: HandoffRecord; events: IncomingEvent[] } {
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 60000)
      fault("INVALID_REQUEST");
    return this.store.transaction((tx) => {
      c = this.contexts.refresh(tx, c);
      const h = tx.get("handoffs", id),
        now = this.contexts.clock.now();
      if (
        !h ||
        h.principalId !== c.principalId ||
        h.taskId !== c.taskId ||
        h.generation !== c.generation ||
        !authorizedConversation(tx, c, h.scope)
      )
        return fault("RESOURCE_NOT_FOUND");
      if (h.state === "cancelled") fault("CANCELLED");
      const matches =
        h.claim &&
        h.claim.owner === c.principalId &&
        h.claim.fence === fence &&
        h.claim.generation === c.generation;
      // A repeated ack of the exact completed claim is safe even after its lease expired.
      const repeat = method === "ack" && h.state === "acknowledged" && matches;
      if (!repeat) {
        if (h.state === "acknowledged") fault("STALE_FENCE");
        if (method === "claim") {
          if (h.claim && h.claim.leaseUntil > now) fault("UNAVAILABLE");
          h.claim = {
            owner: c.principalId,
            fence: (h.claim?.fence ?? 0) + 1,
            generation: c.generation,
            leaseUntil: now + leaseMs,
          };
          h.state = "claimed";
        } else {
          if (!matches || !h.claim || h.claim.leaseUntil <= now)
            fault("STALE_FENCE");
          if (method === "ack") h.state = "acknowledged";
          else h.claim.leaseUntil = now + leaseMs;
        }
        if (method !== "ack") h.activityUpdatedAt = now;
        const rev = h.revision;
        h.revision++;
        tx.put("handoffs", h, rev);
      }
      const events = h.eventIds.map((eventId) => {
        const e = tx.get("inbox", eventId);
        if (
          !e ||
          !sameScope(e.scope, h.scope) ||
          !sameScope(e.event.scope, h.scope)
        )
          return fault("RESOURCE_NOT_FOUND");
        return e.event;
      });
      return { handoff: h, events };
    });
  }
}

/** Claim durable work and return its persisted events; wake acceptance alone is never acknowledgement. */
export function claimWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  leaseMs: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "claim", undefined, leaseMs);
}

/** Extend only the exact current handoff fence. */
export function heartbeatWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  fence: number,
  leaseMs: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "heartbeat", fence, leaseMs);
}

/** Acknowledge durably processed work; repeating the same completed fence is idempotent. */
export function acknowledgeWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  fence: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "ack", fence);
}
