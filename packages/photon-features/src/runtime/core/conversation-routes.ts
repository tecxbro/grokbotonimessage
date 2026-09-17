import {
  sameLineScope, sameScope, type ResourceRef, type Scope, type TrustedContext,
} from "../../contracts/index.js";
import type { Transaction } from "../../state/index.js";
import { canonical } from "./idempotency.js";

/** Authority is always supplied by the host's current task/context, never an action. */
export type ConversationOwner = Pick<TrustedContext, "scope" | "principalId" | "taskId" | "generation">;

/** Exact durable identity and ownership; matching line or ID alone grants nothing. */
export function ownsReference(tx: Transaction, owner: ConversationOwner, ref: ResourceRef): boolean {
  const row = tx.get("references", ref.id);
  return !!row && row.id === ref.id &&
    row.ownedByPrincipalId === owner.principalId && row.taskId === owner.taskId &&
    row.generation === owner.generation && sameScope(row.scope, ref.scope) &&
    canonical(row.reference) === canonical(ref);
}

/** A secondary conversation is an allowlist entry only while its exact space row
 * belongs to this task generation. Callers must also check current task authority
 * in this transaction; this structural helper does not refresh a context. */
export function authorizedConversation(tx: Transaction, owner: ConversationOwner, scope: Scope): boolean {
  if (!sameLineScope(owner.scope, scope)) return false;
  if (sameScope(owner.scope, scope)) return true;
  return ownsReference(tx, owner, { version: 1, kind: "space", id: scope.spaceId, scope });
}

/** Validate the complete parent chain in one snapshot. Every parent has the same
 * conversation and owner; an owned leaf cannot adopt a foreign message/poll/card.
 * Host-local streams use their separate registration authority. */
export function authorizedResource(tx: Transaction, owner: ConversationOwner, ref: ResourceRef): boolean {
  if (ref.kind === "stream" || !authorizedConversation(tx, owner, ref.scope) ||
      !ownsReference(tx, owner, ref)) return false;
  if (ref.kind === "space") return ref.id === ref.scope.spaceId;
  const parentId = "messageId" in ref ? ref.messageId :
    "pollId" in ref ? ref.pollId : "cardId" in ref ? ref.cardId : undefined;
  if (!parentId) return true;
  const parent = tx.get("references", parentId)?.reference;
  const kind = "messageId" in ref ? "message" : "pollId" in ref ? "poll" : "card";
  return !!parent && parent.id === parentId && parent.kind === kind &&
    sameScope(parent.scope, ref.scope) && authorizedResource(tx, owner, parent);
}
