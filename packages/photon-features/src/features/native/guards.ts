import { isDeepStrictEqual } from "node:util";
import { imessage } from "spectrum-ts/providers/imessage";
import type { Space } from "spectrum-ts";
import {
  sameLineScope, sameScope, type Action, type ExecutionServices,
  type ResourceRef, type RuntimeError,
} from "../../contracts/index.js";
import type { NativeBinding, NativeSpace } from "./sdk.js";

export class NativeError extends Error {
  constructor(readonly code: RuntimeError["code"], message: string) { super(message); }
}
export function requireNative(condition: unknown, code: RuntimeError["code"], message: string): asserts condition {
  if (!condition) throw new NativeError(code, message);
}
export function checkContext(action: Action, services: ExecutionServices): void {
  const { context, claim } = services;
  const now = services.clock.now();
  requireNative(!services.signal.aborted, "CANCELLED", "Native operation cancelled.");
  requireNative(context.contextId === action.contextId, "FORBIDDEN", "Context does not authorize this action.");
  requireNative(context.revokedAt === null, "CONTEXT_REVOKED", "Context was revoked.");
  requireNative(context.issuedAt <= now && context.expiresAt > now, "CONTEXT_EXPIRED", "Context is not current.");
  requireNative(claim.generation === context.generation, "STALE_GENERATION", "Execution generation is stale.");
  requireNative(claim.leaseUntil > now, "STALE_FENCE", "Execution lease expired.");
  requireNative(context.permissions.includes(action.operation), "FORBIDDEN", "Operation permission is required.");
}
export function checkBinding(binding: NativeBinding, services: ExecutionServices, operation: Action["operation"]): void {
  requireNative(sameLineScope(binding.scope, services.context.scope), "SCOPE_MISMATCH", "Provider binding scope mismatch.");
  requireNative(binding.scope.provider === "imessage", "UNSUPPORTED", "Cloud iMessage is required.");
  requireNative(binding.accountReady, "UNAVAILABLE", "The authenticated account is unavailable.");
  requireNative(binding.dedicated ? /^\+[1-9]\d{6,14}$/.test(binding.phone) : binding.phone === "shared",
    "UNAVAILABLE", "The provider route is unavailable.");
  requireNative(binding.availableOperations.includes(operation), "UNAVAILABLE", "Native capability has not been established for this account.");
}
export async function resolveReference(ref: ResourceRef, services: ExecutionServices): Promise<ResourceRef> {
  requireNative(sameLineScope(ref.scope, services.context.scope), "SCOPE_MISMATCH", "Resource line mismatch.");
  if (ref.kind === "stream")
    requireNative(sameScope(ref.scope, services.context.scope), "SCOPE_MISMATCH", "Stream scope mismatch.");
  else if (ref.kind !== "space" && !sameScope(ref.scope, services.context.scope)) {
    // The authoritative resolver must validate both the parent conversation grant
    // and the leaf's complete parent chain before any provider lookup.
    await resolveReference({ version: 1, kind: "space", id: ref.scope.spaceId, scope: ref.scope }, services);
  }
  if (ref.kind === "space")
    requireNative(ref.id === ref.scope.spaceId, "SCOPE_MISMATCH", "Conversation identity mismatch.");
  let resolved: ResourceRef;
  try { resolved = await services.resources.resolve(ref, services.context); }
  catch (error) {
    // Keep authoritative authorization failures distinguishable from provider failures.
    if (error instanceof Error && ["SCOPE_MISMATCH", "RESOURCE_NOT_FOUND", "FORBIDDEN",
      "STALE_GENERATION", "CONTEXT_REVOKED", "CONTEXT_EXPIRED", "CANCELLED"].includes(error.message))
      throw new NativeError(error.message as RuntimeError["code"], error.message);
    throw error;
  }
  requireNative(isDeepStrictEqual(resolved, ref), "SCOPE_MISMATCH", "Resolved resource identity mismatch.");
  return resolved;
}
export function nativeSpace(space: Space, binding: NativeBinding, expectedId?: string): NativeSpace {
  requireNative(imessage.is(space), "UNSUPPORTED", "Cloud iMessage space is required.");
  requireNative(space.phone === binding.phone && (!expectedId || space.id === expectedId),
    "SCOPE_MISMATCH", "Resolved conversation route mismatch.");
  return space;
}
export function requireGroup(space: NativeSpace, binding: NativeBinding): void {
  requireNative(space.type === "group", "UNSUPPORTED", "This operation requires a group conversation.");
  requireNative(binding.dedicated, "UNAVAILABLE", "An existing dedicated line is required for group administration.");
}
export function validatedMembers(members: readonly string[]): string[] {
  // Require canonical handles so authorization and provider dispatch use identical values.
  requireNative(members.every(m => /^\+[1-9]\d{6,14}$/.test(m) ||
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(m)),
  "INVALID_REQUEST", "Recipients must be canonical E.164 numbers or complete email addresses.");
  requireNative(new Set(members.map(m => m.toLowerCase())).size === members.length,
    "INVALID_REQUEST", "Recipient lists must not contain duplicates.");
  return [...members];
}
