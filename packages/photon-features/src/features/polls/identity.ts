import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  sameScope, idSchema, pollRefSchema,
  type ResourceRef, type Scope, type Transaction, type ReferenceRecord,
} from "../../index.js";

export type PollRef = Extract<ResourceRef, { kind: "poll" }>;
export type OptionRef = Extract<ResourceRef, { kind: "poll-option" }>;
export const scopedId = (kind: string, scope: Scope, ...parts: unknown[]) =>
  `polls:${kind}:${createHash("sha256").update(JSON.stringify([
    scope.projectId, scope.provider, scope.accountId, scope.lineId, scope.spaceId, ...parts,
  ])).digest("hex")}`;

export function referenceOwner(tx: Transaction, ref: ResourceRef): ReferenceRecord {
  const owner = tx.get("references", ref.id);
  if (!owner || !sameScope(owner.scope, ref.scope) ||
      !isDeepStrictEqual(owner.reference, ref)) throw new Error("RESOURCE_NOT_FOUND");
  return owner;
}

/** Native IDs are supplied by an authoritative host lookup, never inferred from labels/indexes.
 * This pure registration step does not supply the advanced lookup absent at F0.
 * Caller must have persisted the originating poll/message ownership first.
 */
export function registerNativeOptions(
  tx: Transaction,
  input: { poll: PollRef; nativePollGuid: string; options: readonly { nativeId: string; label: string }[] },
): OptionRef[] {
  pollRefSchema.parse(input.poll);
  const owner = referenceOwner(tx, input.poll);
  if (owner.providerId !== input.nativePollGuid) throw new Error("POLL_IDENTITY_MISMATCH");
  const stored = tx.get("polls", input.poll.id);
  if (!stored || !sameScope(stored.scope, input.poll.scope)) throw new Error("RESOURCE_NOT_FOUND");
  if (input.options.length > 100 || new Set(input.options.map(o => o.nativeId)).size !== input.options.length)
    throw new Error("AMBIGUOUS_OPTIONS");
  const options = input.options.map(o => {
    idSchema.parse(o.nativeId);
    if (!o.label.trim() || o.label.length > 200) throw new Error("INVALID_OPTION_LABEL");
    const reference: OptionRef = {
      version: 1, kind: "poll-option", scope: input.poll.scope, pollId: input.poll.id,
      id: scopedId("option", input.poll.scope, input.nativePollGuid, o.nativeId),
    };
    const prior = tx.get("references", reference.id);
    if (prior && (prior.providerId !== o.nativeId || prior.taskId !== owner.taskId ||
        prior.generation !== owner.generation || prior.ownedByPrincipalId !== owner.ownedByPrincipalId ||
        !sameScope(prior.scope, owner.scope))) throw new Error("OPTION_IDENTITY_CONFLICT");
    if (!prior) tx.put("references", {
      ...owner, id: reference.id, revision: 0, reference, providerId: o.nativeId,
    }, null);
    return { reference, label: o.label };
  });
  // A partial lookup must not silently erase previously registered native options.
  if (stored.options.some(old => !options.some(o => o.reference.id === old.reference.id)))
    throw new Error("INCOMPLETE_OPTION_LOOKUP");
  if (stored.options.some(old => options.find(o => o.reference.id === old.reference.id)?.label !== old.label))
    throw new Error("CONFLICTING_OPTION_METADATA");
  if (JSON.stringify(stored.options) !== JSON.stringify(options)) tx.put("polls", {
    ...stored, revision: stored.revision + 1, options,
  }, stored.revision);
  return options.map(o => o.reference);
}

export function pollForEvent(tx: Transaction, ref: PollRef) {
  // F0 has no indexed provider lookup or paging. Refuse saturation, never choose a truncated match.
  const polls = tx.list("polls", ref.scope, 1000);
  if (polls.length === 1000) throw new Error("LOOKUP_REQUIRES_PAGINATION");
  const matches = polls.filter(p => {
    const owner = tx.get("references", p.id);
    const message = tx.get("references", p.reference.messageId);
    return owner && message && sameScope(owner.scope, ref.scope) && sameScope(message.scope, ref.scope) &&
      owner.providerId === message.providerId &&
      (ref.id === p.id || ref.id === owner.providerId) &&
      (ref.messageId === p.reference.messageId || ref.messageId === message.providerId);
  });
  if (matches.length !== 1) throw new Error(matches.length ? "AMBIGUOUS_POLL" : "UNKNOWN_POLL");
  return matches[0]!;
}
