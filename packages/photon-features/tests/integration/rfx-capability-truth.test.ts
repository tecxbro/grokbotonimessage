import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { capabilitySchema, operations, parseAction, type Action, type Capability, type Operation, type ResourceRef,
  type Scope, type TrustedContext } from "../../src/contracts/index.js";
import { productionCapability, type ProductionCapabilityInventory } from "../../src/host/capabilities.js";
import { configurationBlockers, pollManagementBlocker, sharedGroupCreationBlocker } from "../../src/host/configuration-inventory.js";
import { productionHostConfigurationSchema } from "../../src/host/configuration.js";

const scope: Scope = { projectId: "project-1", provider: "imessage", accountId: "account-1", lineId: "line-1", spaceId: "space-1" };
const context: TrustedContext = { version: 1, contextId: "context-1", principalId: "principal-1", scope,
  taskId: "task-1", generation: 1, permissions: [...operations], issuedAt: 1, expiresAt: 10_000, revokedAt: null };
const space = { version: 1 as const, kind: "space" as const, id: scope.spaceId, scope };
const message = { version: 1 as const, kind: "message" as const, id: "message-1", scope };
const staticTemplate = { id: "static", kind: "universal" as const, origins: ["https://example.com"] };
const configuration = productionHostConfigurationSchema.parse(JSON.parse(readFileSync(
  "packages/photon-features/examples/configuration-input.json", "utf8")).configuration);
function inventory(patch: Partial<ProductionCapabilityInventory> = {}): ProductionCapabilityInventory {
  return { scope, ownerReady: true, configuredOperations: new Set(operations), registeredHandlers: new Set(operations),
    administrativeOperations: new Set(operations), allowNativeContent: true, configuredCardTemplates: 1,
    resources: true, media: true, streams: true, checkedAt: 5000, routeMode: "shared", routeReady: true,
    cardTemplates: [staticTemplate], cardBackendReady: false, requestResources: [{ reference: space, available: true }], ...patch };
}
function declaration(operation: Operation, blockers: string[] = []): Capability {
  return { operation, providerSupport: "native", implementation: "implemented", sdkVersion: "12.8.0",
    availability: { account: "unknown", conversation: "unknown", checkedAt: null },
    direction: { inbound: "not-applicable", outbound: "implemented" }, evidence: [], sources: ["npm:spectrum-ts@12.8.0"], blockers };
}
function action(operation: Operation, args: unknown): Action {
  return parseAction({ version: 1, idempotencyKey: "rfx-07", contextId: context.contextId, operation, arguments: args });
}
function report(operation: Operation, patch: Partial<ProductionCapabilityInventory> = {}, request?: Action, blockers: string[] = []) {
  const result = productionCapability(operation, context, inventory(patch), declaration(operation, blockers), request);
  capabilitySchema.parse(result);
  return result;
}
function state(capability: Capability): Record<string, unknown> {
  const entry = capability.evidence.find(row => row.reference.startsWith('{"type":"capability-state/v1"'));
  assert.ok(entry, "structured capability state must survive the public schema");
  return JSON.parse(entry.reference);
}
const text = action("text.send", { space, text: "hello" });

test("RFX-07 shared text route has no account blocker or invented live proof", () => {
  const result = report("text.send", {}, text);
  assert.equal(result.availability.conversation, "available");
  assert.deepEqual(result.blockers, []);
  assert.equal(state(result).runtimeReady, true);
  for (const field of ["providerAccepted", "deviceObserved", "liveVerified"]) assert.equal(state(result)[field], false);
  assert.equal(state(result).inboundGroupEvents, "unsupported");
});

test("RFX-07 shared group creation is blocked for the exact documented reason; shared DM creation is allowed", () => {
  const group = action("space.create", { members: ["+15555550100", "+15555550101"] });
  const result = report("space.create", {}, group);
  assert.equal(result.availability.conversation, "unavailable");
  assert.deepEqual(result.blockers, [sharedGroupCreationBlocker]);
  assert.equal(result.providerSupport, "native");
  const dm = action("space.create", { members: ["+15555550100"] });
  assert.equal(report("space.create", { operationBlockers: { "space.create": [sharedGroupCreationBlocker] } }, dm).availability.conversation, "available");
  const config = { ...configuration, provider: { ...configuration.provider, dedicated: false },
    authorization: { ...configuration.authorization, administrativeOperations: ["space.create" as const], allowedRecipients: ["+15555550100"] } };
  assert.deepEqual(configurationBlockers(config)["space.create"], [sharedGroupCreationBlocker]);
  assert.equal(configurationBlockers(config, {}, dm)["space.create"], undefined);
});

test("RFX-07 dedicated group creation may execute; missing actual mode fails closed", () => {
  const group = action("space.create", { members: ["+15555550100", "+15555550101"] });
  assert.equal(report("space.create", { routeMode: "dedicated" }, group).availability.conversation, "available");
  const missing = report("space.create", { routeMode: "unknown" }, group);
  assert.equal(missing.availability.conversation, "unavailable");
  assert.match(missing.blockers.join(), /actual provider account mode/);
});

test("RFX-07 absent poll management blocks only management; actual binding removes the old release blocker", () => {
  const old = "Spectrum 12.8.0 exports no public native poll management API through the shared owner; upstream release blocker.";
  for (const op of ["poll.get", "poll.vote", "poll.unvote", "poll.addOption"] as const) {
    assert.ok(report(op).blockers.includes(pollManagementBlocker));
    const ready = report(op, { pollManagement: true, operationBlockers: { [op]: [old] } });
    assert.deepEqual(ready.blockers, []);
    assert.equal(ready.availability.conversation, "available");
    assert.equal(configurationBlockers(configuration, { pollManagement: true })[op], undefined);
  }
  assert.equal(report("poll.create", { pollManagement: false }).availability.conversation, "available");
  assert.equal(report("text.send", { pollManagement: false }).availability.conversation, "available");
  assert.equal(report("poll.get", { operationBlockers: { "poll.get": [] } }).availability.conversation, "available");
});

test("RFX-07 static URL card requires neither backend nor live extension", () => {
  const send = action("app.send", { space, templateId: "static", url: "https://example.com/card" });
  const result = report("app.send", {}, send, ["Host template registration required; device rendering unverified."]);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.availability.conversation, "available");
  assert.equal(state(result).deviceObserved, false);
  assert.equal(configurationBlockers({ ...configuration, cards: [staticTemplate] })["app.send"], undefined);
  const missing = report("app.send", { cardTemplates: [], configuredCardTemplates: 99 }, send);
  assert.equal(missing.availability.conversation, "unavailable");
});

test("RFX-07 customized, live, backend, requested template and URL prerequisites stay separate", () => {
  const customized = action("app.sendCustomized", { space, templateId: "static", url: "https://example.com/card", layout: { caption: "hi" } });
  assert.match(report("app.sendCustomized", { cardTemplates: [{ ...staticTemplate, kind: "customized" }] }, customized).blockers.join(), /Apple extension/);
  const send = action("app.send", { space, templateId: "static", url: "https://example.com/card" });
  assert.match(report("app.send", { cardTemplates: [{ ...staticTemplate, live: { installedExtensionVerified: true, evidence: " " } }] }, send).blockers.join(), /live card/);
  assert.match(report("app.send", { cardTemplates: [{ ...staticTemplate, backendId: "backend" }] }, send).blockers.join(), /bound card backend/);
  assert.equal(report("app.send", { cardTemplates: [{ ...staticTemplate, backendId: "backend" }], cardBackendReady: true }, send).availability.conversation, "available");
  assert.match(report("app.send", {}, action("app.send", { space, templateId: "absent", url: "https://example.com/card" })).blockers.join(), /template ID/);
  assert.match(report("app.send", {}, action("app.send", { space, templateId: "static", url: "https://other.example/card" })).blockers.join(), /HTTPS origin/);
});

test("RFX-07 verification caveats are notes, while unknown execution blockers remain blocking", () => {
  const result = report("text.send", {}, text, ["not live verified", "Device rendering is unverified.", "Provider delivery not observed."]);
  assert.equal(result.availability.conversation, "available");
  assert.deepEqual(result.blockers, []);
  assert.ok(result.evidence.some(row => row.reference.includes("not live verified")));
  assert.equal(report("text.send", {}, text, ["Required production dependency absent."]).availability.conversation, "unavailable");
  assert.equal(report("poll.create", {}, undefined, ["Conversational poll-answer ingress is unavailable or unverified."]).availability.conversation, "available");
});

test("RFX-07 card updates require an actual session/revision hook and a universal URL backend", () => {
  const card = { version: 1 as const, kind: "card" as const, id: "card-1", messageId: "message-1", scope };
  const session = { version: 1 as const, kind: "card-session" as const, id: "session-1", cardId: "card-1", scope };
  const update = action("app.update", { card, session, layout: { caption: "updated" } });
  const resources = [{ reference: card, available: true }, { reference: session, available: true }];
  const prerequisite = "Original SDK session and admission revision binding required. Universal layout changes need a configured backend URL mapping.";
  assert.equal(report("app.update", { requestResources: resources, cardBackendReady: true }, update, [prerequisite]).availability.conversation, "unavailable");
  assert.equal(report("app.update", { requestResources: resources, cardBackendReady: true, cardUpdateReady: true }, update, [prerequisite]).availability.conversation, "available");
  assert.match(report("app.update", { requestResources: resources, cardUpdateReady: true }, update, [prerequisite]).blockers.join(), /bound card backend/);
  assert.equal(report("app.update", { requestResources: resources, cardBackendReady: true, cardUpdateReady: false }, update).availability.conversation, "unavailable");
});

test("RFX-07 callback enrollment alone does not block static card sending", () => {
  const template = { ...staticTemplate, interactions: { participantIds: ["participant-1"], actionIds: ["confirm"],
    ttlMs: 1000, backendContractId: "callback-contract" } };
  const send = action("app.send", { space, templateId: "static", url: "https://example.com/card" });
  assert.equal(report("app.send", { cardTemplates: [template] }, send).availability.conversation, "available");
  assert.equal(state(report("app.send", { cardTemplates: [template] }, send)).liveVerified, false);
});

test("RFX-07 media-containing composition needs media; text-only composition does not", () => {
  const plain = action("content.compose", { space, content: { type: "compose", items: [{ type: "text", text: "hi" }] } });
  const media = action("content.compose", { space, content: { type: "compose", items: [{ type: "group", items: [{ type: "voice",
    media: { stagingId: "stage-1", sha256: "a".repeat(64), mimeType: "audio/mp4", bytes: 12 } }] }] } });
  assert.equal(report("content.compose", { media: false }, plain).availability.conversation, "available");
  assert.match(report("content.compose", { media: false }, media).blockers.join(), /media staging port/);
  assert.equal(report("content.compose", { media: true }, media).availability.conversation, "available");
});

test("RFX-07 missing request resources stay resource failures, never provider unsupported", () => {
  const request = action("message.get", { message });
  const result = report("message.get", { requestResources: [{ reference: message, available: false, reason: "not retained" }] }, request);
  assert.equal(result.providerSupport, "native");
  assert.equal(result.availability.conversation, "unavailable");
  assert.match(result.blockers.join(), /Request resource message:message-1 is unavailable: not retained/);
  assert.equal(report("message.get", { requestResources: [{ reference: message, available: true }] }, request).availability.conversation, "available");
  const crossScope: ResourceRef = { ...message, scope: { ...scope, lineId: "other-line" } };
  assert.equal(report("message.get", { requestResources: [{ reference: crossScope, available: true }] }, request).availability.conversation, "unavailable");
  const unknown = report("message.get", { requestResources: undefined }, request);
  assert.equal(state(unknown).runtimeReady, false);
  assert.equal(state(unknown).requestResources, "unchecked");
});

test("RFX-07 owner, route, handlers, grants, resources and streams independently gate availability", () => {
  for (const patch of [{ ownerReady: false }, { routeReady: false }, { registeredHandlers: new Set<Operation>() },
    { configuredOperations: new Set<Operation>() }, { resources: false }]) {
    assert.equal(report("text.send", patch, text).availability.conversation, "unavailable");
  }
  assert.match(report("text.stream", { streams: false }).blockers.join(), /registered-stream/);
  const denied = productionCapability("text.send", { ...context, permissions: [] }, inventory(), declaration("text.send"), text);
  assert.equal(denied.availability.conversation, "unavailable");
  assert.equal(state(denied).granted, false);
  for (const support of ["unsupported", "unknown"] as const)
    assert.equal(productionCapability("text.send", context, inventory(), { ...declaration("text.send"), providerSupport: support }).availability.conversation, "unavailable");
});

test("RFX-07 live stages require independent explicit evidence, with no promotion from old test evidence", () => {
  const proof = { tier: "live" as const, reference: "fixture://explicit-observation", sdkVersion: "12.8.0", observedAt: 4000 };
  const result = report("text.send", { verification: { "text.send": { providerAccepted: proof } } }, text);
  assert.equal(state(result).providerAccepted, true);
  assert.equal(state(result).deviceObserved, false);
  assert.equal(state(result).liveVerified, false);
  assert.equal(state(report("text.send", { verification: { "text.send": { deviceObserved: proof, liveVerified: proof } } }, text)).liveVerified, true);
  for (const invalid of [{ ...proof, tier: "unit" as const }, { ...proof, observedAt: 6000 }, { ...proof, sdkVersion: "other" }])
    assert.equal(state(report("text.send", { verification: { "text.send": { liveVerified: invalid } } }, text)).liveVerified, false);
  const old = productionCapability("text.send", context, inventory(), { ...declaration("text.send"), evidence: [proof] }, text);
  assert.equal(state(old).providerAccepted, false);
});

test("RFX-07 capability evaluation performs no network sends and preserves the strict public schema", t => {
  let sends = 0;
  const forbidden = () => { sends++; throw new Error("CAPABILITY_NETWORK_SEND"); };
  t.mock.method(globalThis, "fetch", forbidden);
  t.mock.method(Socket.prototype, "connect", forbidden);
  for (const operation of operations) capabilitySchema.parse(report(operation));
  configurationBlockers(configuration);
  assert.equal(sends, 0);
});

test("RFX-07 generated source inventory never presents configured or live readiness as registration", () => {
  const generated = JSON.parse(readFileSync("packages/photon-features/examples/production-inventory.json", "utf8"));
  assert.equal(generated.inventoryKind, "source-prerequisites");
  assert.deepEqual(generated.operations.map((row: { operation: string }) => row.operation), operations);
  for (const row of generated.operations) {
    assert.equal(row.state.configured, "not-evaluated");
    assert.equal(row.state.runtimeReady, "not-evaluated");
    assert.equal(row.state.liveVerified, false);
    assert.deepEqual(row.blockers, []);
    assert.ok(row.verificationNotes.length);
  }
  assert.equal(generated.accountModes.shared.groupCreation, false);
  assert.equal(generated.accountModes.dedicated.groupCreation, true);
});
