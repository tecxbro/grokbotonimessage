import test from "node:test";
import assert from "node:assert/strict";
import type { Action, Capability, Operation, Scope, TrustedContext } from "../../src/contracts/index.js";
import { productionCapability, type ProductionCapabilityInventory } from "../../src/host/capabilities.js";

const scope: Scope = { projectId: "project-1", provider: "imessage", accountId: "account-1", lineId: "line-1", spaceId: "space-1" };
const context: TrustedContext = { version: 1, contextId: "context-1", principalId: "principal-1", scope,
  taskId: "task-1", generation: 2, permissions: ["content.compose", "text.stream"], issuedAt: 1, expiresAt: 10_000, revokedAt: null };
const base: Capability = { operation: "content.compose", providerSupport: "native", implementation: "implemented",
  availability: { account: "unknown", conversation: "unknown", checkedAt: null },
  direction: { inbound: "not-applicable", outbound: "implemented" }, evidence: [], sdkVersion: "12.8.0",
  sources: ["npm:spectrum-ts@12.8.0"], blockers: ["Host registration, authoritative bindings and resource adapters require integration."] };

function inventory(overrides: Partial<ProductionCapabilityInventory> = {}): ProductionCapabilityInventory {
  return { scope, ownerReady: true, configuredOperations: new Set<Operation>(["content.compose", "text.stream"]),
    registeredHandlers: new Set<Operation>(["content.compose", "text.stream"]), administrativeOperations: new Set(),
    allowNativeContent: false, configuredCardTemplates: 0, resources: true, media: true, streams: true,
    checkedAt: 5_000, ...overrides };
}

const space = { version: 1 as const, kind: "space" as const, id: scope.spaceId, scope };
const textAction: Action = { version: 1, idempotencyKey: "text-only", contextId: context.contextId,
  operation: "content.compose", arguments: { space, content: { type: "compose", items: [{ type: "text", text: "hello" }] } } };
const mediaAction: Action = { version: 1, idempotencyKey: "with-media", contextId: context.contextId,
  operation: "content.compose", arguments: { space, content: { type: "compose", items: [{ type: "attachment",
    media: { stagingId: "stage-1", sha256: "a".repeat(64), mimeType: "image/png", bytes: 12 } }] } } };

test("production capability dependency inventory is shared, action-aware, and preserves useful blockers", () => {
  const restored = productionCapability("content.compose", context, inventory(), base, mediaAction);
  assert.equal(restored.availability.conversation, "available");
  assert.ok(!restored.blockers.some(value => value.includes("Host registration")));
  assert.ok(restored.blockers.some(value => value.includes("not provider delivery")));

  const missingMedia = productionCapability("content.compose", context, inventory({ media: false }), base, mediaAction);
  assert.equal(missingMedia.availability.conversation, "unavailable");
  assert.ok(missingMedia.blockers.some(value => value.includes("media staging port")));
  assert.equal(productionCapability("content.compose", context, inventory({ media: false }), base, textAction)
    .availability.conversation, "available");

  const missingStream = productionCapability("text.stream", context, inventory({ streams: false }),
    { ...base, operation: "text.stream", providerSupport: "fallback" });
  assert.equal(missingStream.availability.conversation, "unavailable");
  assert.ok(missingStream.blockers.some(value => value.includes("registered-stream")));
});

test("unregistered, unconfigured, and unauthorized operations report unavailable before dispatch", () => {
  const operation = "space.setAvatar" as const;
  const report = productionCapability(operation, { ...context, permissions: [operation] }, inventory({
    configuredOperations: new Set([operation]), registeredHandlers: new Set(), administrativeOperations: new Set(),
  }), { ...base, operation }, { version: 1, idempotencyKey: "avatar", contextId: context.contextId,
    operation, arguments: { space, media: { stagingId: "stage-1", sha256: "a".repeat(64), mimeType: "image/png", bytes: 12 } } });
  assert.equal(report.implementation, "unimplemented");
  assert.equal(report.availability.conversation, "unavailable");
  assert.ok(report.blockers.some(value => value.includes("No public")));
  assert.ok(report.blockers.some(value => value.includes("Administrative intent")));
});
