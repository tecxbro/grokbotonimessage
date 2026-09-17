import { isDeepStrictEqual } from "node:util";
import { resourceRefSchema, sameScope, type ResourceRef, type TrustedContext } from "../contracts/index.js";
import type { Transaction } from "../state/ports.js";
import { authorizedConversation } from "../runtime/core/conversation-routes.js";
import { fault } from "../runtime/core/errors.js";

export interface IncomingResourceBinding {
  reference: Extract<ResourceRef, { kind: "message" | "attachment" }>;
  /** Exact captured provider ID; never a title, synthesized option ID or action argument. */
  providerId: string;
}

/** Trusted ingress only. Call on both live capture and replay, before exposing any handoff.
 * The caller derives bindings from captured SDK fields and supplies the durable routed context.
 * This function never authorizes a caller-chosen reference through the local action protocol. */
export function registerIncomingReferences(tx: Transaction, context: TrustedContext,
  bindings: readonly IncomingResourceBinding[], now: number): void {
  const grant = tx.get("contexts", context.contextId), task = tx.get("tasks", context.taskId);
  if (!grant || !isDeepStrictEqual(grant.context, context) || !task ||
      task.principalId !== context.principalId || !sameScope(task.scope, context.scope)) fault("FORBIDDEN");
  if (context.revokedAt !== null) fault("CONTEXT_REVOKED");
  if (context.issuedAt > now || context.expiresAt <= now) fault("CONTEXT_EXPIRED");
  if (task.generation !== context.generation) fault("STALE_GENERATION");
  if (task.cancelledAt !== null) fault("CANCELLED");
  if (bindings.length > 256) fault("INVALID_REQUEST");
  const authorized = (ref: ResourceRef) => {
    const row = tx.get("references", ref.id);
    return row && isDeepStrictEqual(row.reference, ref) && sameScope(row.scope, ref.scope) &&
      row.ownedByPrincipalId === context.principalId && row.taskId === context.taskId && row.generation === context.generation;
  };

  // Parents are persisted before attachments regardless of input order. Any collision rolls back the transaction.
  for (const binding of [...bindings].sort((a, b) => Number(a.reference.kind === "attachment") - Number(b.reference.kind === "attachment"))) {
    const reference = resourceRefSchema.parse(binding.reference);
    if ((reference.kind !== "message" && reference.kind !== "attachment") ||
        typeof binding.providerId !== "string" || binding.providerId.length < 1 || binding.providerId.length > 1000 ||
        !authorizedConversation(tx, context, reference.scope)) fault("INVALID_REQUEST");
    if (!authorized({ version: 1, kind: "space", id: reference.scope.spaceId, scope: reference.scope })) fault("RESOURCE_NOT_FOUND");
    if (reference.kind === "attachment" && !authorized({ version: 1, kind: "message", id: reference.messageId, scope: reference.scope }))
      fault("RESOURCE_NOT_FOUND");
    const prior = tx.get("references", reference.id);
    if (prior) {
      if (!authorized(reference) || prior.providerId !== binding.providerId) fault("IDEMPOTENCY_CONFLICT");
      continue;
    }
    tx.put("references", { id: reference.id, reference, scope: reference.scope, revision: 0,
      providerId: binding.providerId, ownedByPrincipalId: context.principalId,
      taskId: context.taskId, generation: context.generation }, null);
  }
}
