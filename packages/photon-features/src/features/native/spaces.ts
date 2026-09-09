import { createHash } from "node:crypto";
import { sameScope, type ExecutionServices, type ResourceRef } from "../../contracts/index.js";
import { nativeSpace, requireNative, resolveReference } from "./guards.js";
import type { NativeBinding, NativeSpace } from "./sdk.js";

export async function getSpace(ref: ResourceRef, services: ExecutionServices, binding: NativeBinding, beforeRead: () => void): Promise<NativeSpace> {
  beforeRead();
  await resolveReference(ref, services);
  beforeRead();
  const resolved = nativeSpace(await services.resources.space(ref, services.context), binding);
  beforeRead();
  // Always pass the serving phone. SDK omission can select a random/first line.
  return nativeSpace(await binding.provider.space.get(resolved.id, { phone: binding.phone }), binding, resolved.id);
}

/** Durable opaque IDs avoid putting Apple chat GUIDs (containing semicolons) in F0 IDs. */
export function remember(
  kind: "space" | "message", providerId: string, services: ExecutionServices,
  newConversation = false,
): ResourceRef {
  const context = services.context;
  const digest = createHash("sha256").update(JSON.stringify([kind, context.scope, providerId])).digest("hex");
  const id = `native-${kind}-${digest}`;
  const scope = { ...context.scope, ...(newConversation ? { spaceId: id } : {}) };
  const reference: ResourceRef = { version: 1, kind, id, scope };
  services.transactions.transaction(tx => {
    const previous = tx.get("references", id);
    if (previous) {
      requireNative(previous.providerId === providerId && previous.ownedByPrincipalId === context.principalId &&
        previous.taskId === context.taskId && previous.generation === context.generation &&
        sameScope(previous.scope, scope) && sameScope(previous.reference.scope, scope) &&
        previous.reference.kind === kind && previous.reference.id === id,
      "FORBIDDEN", "Resource is owned by a different execution context.");
      return;
    }
    tx.put("references", { id, scope, revision: 0, reference, providerId,
      ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation }, null);
  });
  return reference;
}
