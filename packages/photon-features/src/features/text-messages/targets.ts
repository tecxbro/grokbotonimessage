import { equivalent } from "./identity.js";
import type { Message, Space } from "spectrum-ts";
import {
  assertScope,
  sameScope,
  type ExecutionServices,
  type ResourceRef,
  type ReferenceRecord,
} from "../../index.js";
import { checkMessage, checkSpace, type TextMessageOptions } from "./sdk.js";
import { requireThat } from "./errors.js";
const handles = new WeakMap<
  ExecutionServices["resources"],
  Map<string, Message>
>();
export function remember(
  services: ExecutionServices,
  ref: ResourceRef,
  message: Message,
): void {
  let map = handles.get(services.resources);
  if (!map) {
    map = new Map();
    handles.set(services.resources, map);
  }
  // Durable records remain authoritative. Eviction falls back to the host resolver.
  if (map.size >= 1000) map.delete(map.keys().next().value!);
  map.set(ref.id, message);
}
export async function recordFor(
  ref: ResourceRef,
  s: ExecutionServices,
): Promise<ReferenceRecord> {
  assertScope(ref, s.context.scope);
  const resolved = await s.resources.resolve(ref, s.context);
  requireThat(
    equivalent(resolved, ref),
    "SCOPE_MISMATCH",
    "Resolved reference differs from requested resource.",
  );
  const record = s.transactions.transaction((tx) =>
    tx.get("references", ref.id),
  );
  requireThat(
    record &&
      sameScope(record.scope, ref.scope) &&
      equivalent(record.reference, ref),
    "RESOURCE_NOT_FOUND",
    "Authoritative resource mapping is unavailable.",
  );
  return record;
}
export async function targetSpace(
  ref: ResourceRef,
  s: ExecutionServices,
  options: TextMessageOptions,
): Promise<Space> {
  const record = await recordFor(ref, s);
  requireThat(
    ref.kind === "space",
    "INVALID_REQUEST",
    "Expected a space reference.",
  );
  const space = await s.resources.space(ref, s.context);
  checkSpace(space, s, options);
  requireThat(
    space.id === record.providerId,
    "SCOPE_MISMATCH",
    "Resolved SDK space differs from its mapping.",
  );
  return space;
}
export async function targetMessage(
  ref: ResourceRef,
  s: ExecutionServices,
  options: TextMessageOptions,
  owned = false,
): Promise<Message> {
  const record = await recordFor(ref, s);
  requireThat(
    ref.kind === "message" || ref.kind === "reaction",
    "INVALID_REQUEST",
    "Expected a message or reaction reference.",
  );
  if (owned)
    requireThat(
      record.ownedByPrincipalId === s.context.principalId,
      "FORBIDDEN",
      "This principal does not own the target.",
    );
  const message =
    handles.get(s.resources)?.get(ref.id) ??
    (await s.resources.message(ref, s.context));
  requireThat(
    message,
    "RESOURCE_NOT_FOUND",
    "The actual SDK target handle is unavailable.",
  );
  checkMessage(message, s, options);
  requireThat(
    message.id === record.providerId,
    "SCOPE_MISMATCH",
    "SDK target does not match its authoritative mapping.",
  );
  if (owned)
    requireThat(
      message.direction === "outbound",
      "FORBIDDEN",
      "Only bot-owned outbound targets can be mutated.",
    );
  if (ref.kind === "reaction") {
    requireThat(
      message.content.type === "reaction",
      "UNAVAILABLE",
      "Actual reaction handle and target metadata are required.",
    );
    const parent = await recordFor(
      { version: 1, kind: "message", id: ref.messageId, scope: ref.scope },
      s,
    );
    checkMessage(message.content.target, s, options);
    requireThat(
      message.content.target.id === parent.providerId,
      "SCOPE_MISMATCH",
      "Reaction target differs from its authorized parent.",
    );
  }
  return message;
}
