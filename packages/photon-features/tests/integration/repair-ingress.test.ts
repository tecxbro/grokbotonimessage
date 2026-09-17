import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { IncomingEvent, Scope } from "../../src/contracts/index.js";
import type { Message, Space } from "spectrum-ts";
import { FileCaptureStore } from "../../src/adapters/transport/capture.js";
import { ProviderContext } from "../../src/adapters/transport/provider-context.js";
import { SpectrumOwner } from "../../src/adapters/transport/spectrum-owner.js";
import { SpectrumEventSource } from "../../src/adapters/transport/event-source.js";
import { processCapturedMessage } from "../../src/adapters/transport/message-events.js";
import { incomingReferenceBindings, messageRef, normalizeCaptured } from "../../src/runtime/inbound/normalize.js";
import { recoverCaptures } from "../../src/runtime/inbound/recovery.js";
import { InboundRouter } from "../../src/runtime/inbound/router.js";
import { TextBatcher } from "../../src/runtime/inbound/batching.js";
import { TypingLeases } from "../../src/runtime/typing/leases.js";
import { createTypingModule } from "../../src/runtime/typing/operations.js";
import { registerIncomingReferences } from "../../src/host/incoming-resources.js";
import { productionCapability } from "../../src/host/capabilities.js";
import { fixture, context, scope } from "../lanes/wt-01/fixture.js";

const phone = "+15555550101";
const routes = new ProviderContext(scope.projectId, [
  { accountId: scope.accountId, lineId: scope.lineId, dedicated: true, servingPhone: phone },
]);
const inboundScope = routes.inbound(phone, scope.spaceId);
const ingressContext = {
  ...context,
  contextId: "ingress-context",
  taskId: "ingress-task",
  scope: inboundScope,
};
function seedIngress(f: ReturnType<typeof fixture>) {
  f.store.transaction(tx => {
    tx.put("contexts", { id: ingressContext.contextId, scope: inboundScope, revision: 0, context: ingressContext }, null);
    tx.put("tasks", { id: ingressContext.taskId, scope: inboundScope, revision: 0,
      principalId: ingressContext.principalId, generation: ingressContext.generation, cancelledAt: null }, null);
    tx.put("references", { id: inboundScope.spaceId, scope: inboundScope, revision: 0,
      reference: { version: 1, kind: "space", id: inboundScope.spaceId, scope: inboundScope },
      providerId: scope.spaceId, ownedByPrincipalId: ingressContext.principalId,
      taskId: ingressContext.taskId, generation: ingressContext.generation }, null);
  });
}
const rawMessage = (
  id: string,
  content: Record<string, unknown>,
  direction: "inbound" | "outbound" = "inbound",
) => ({
  id,
  platform: "imessage",
  direction,
  timestamp: "2026-09-11T20:00:00.000Z",
  sender: { id: "+15555550999" },
  space: { id: scope.spaceId, platform: "imessage", phone },
  content,
});
function owner(messages: AsyncIterable<[Space, Message]> = (async function* () {})()) {
  return new SpectrumOwner(
    { inbound: "photon-stream", outbound: "imessage", wake: "existing-grok-task-handoff" },
    routes,
    async () => ({ messages: () => messages, space: async () => { throw new Error("unused"); }, stop: async () => {} }),
  );
}

test("typing declarations make only the implemented operations capability-consumable", () => {
  const leases = new TypingLeases({ now: () => 10_000 }, async () => ({
    startTyping: async () => {}, stopTyping: async () => {},
  }));
  const module = createTypingModule(leases, () => ({
    requestId: "typing-request", resultRevision: 0, expiresAt: 20_000, assertCurrent() {},
  }));
  assert.deepEqual(module.capabilities.map(value => value.operation), ["typing.begin", "typing.end"]);
  for (const operation of ["typing.begin", "typing.end"] as const) {
    const trusted = { ...context, permissions: [operation] };
    const capability = productionCapability(operation, trusted, {
      scope, ownerReady: true, configuredOperations: new Set([operation]),
      registeredHandlers: new Set([operation]), administrativeOperations: new Set(),
      allowNativeContent: false, configuredCardTemplates: 0, resources: true,
      media: true, streams: true, checkedAt: 10_000,
    }, module.capabilities.find(value => value.operation === operation));
    assert.equal(capability.implementation, "implemented");
    assert.equal(capability.availability.conversation, "available");
    assert.deepEqual(capability.evidence, []);
  }
  leases.shutdown();
});

test("captured parent, grouped children and attachments register exact provider identities before handoff", async t => {
  const f = fixture(t);
  seedIngress(f);
  const sdk = owner();
  const accepted: IncomingEvent[] = [];
  const input = rawMessage("provider-parent", {
    type: "group",
    items: [
      rawMessage("provider-child-a", { type: "attachment", id: "p:0/GUID-A", name: "same.jpg", mimeType: "image/jpeg" }),
      rawMessage("provider-child-b", { type: "attachment", id: "p:0/GUID-B", name: "same.jpg", mimeType: "image/jpeg" }),
    ],
  });
  await processCapturedMessage({
    snapshot: input, captureId: "capture-parent", owner: sdk,
    capturedAt: f.clock.now(), accept: async event => { accepted.push(event); },
    processing: {
      receipts: { writer: { recordReceipt: observation => f.store.recordReceipt(observation) } },
      registerReferences: async (snapshot, event) => f.store.transaction(tx =>
        registerIncomingReferences(tx, ingressContext, incomingReferenceBindings(snapshot, event), f.clock.now())),
    },
  });
  assert.equal(accepted.length, 1);
  const event = accepted[0]!;
  assert.equal(event.type, "message");
  const rows = f.store.scan("references").filter(row => row.reference.kind !== "space");
  assert.deepEqual(rows.map(row => row.providerId).sort(), [
    "p:0/GUID-A", "p:0/GUID-B", "provider-child-a", "provider-child-b", "provider-parent",
  ]);
  if (event.type !== "message" || event.content.type !== "group") return;
  const attachments = event.content.items.filter(item => item.type === "attachment");
  assert.equal(attachments.length, 2);
  for (const [index, item] of attachments.entries()) {
    if (item.type !== "attachment" || !("kind" in item.media)) continue;
    const media = item.media;
    const expectedParent = messageRef(inboundScope, `provider-child-${index === 0 ? "a" : "b"}`);
    assert.equal(media.messageId, expectedParent.id);
    assert.equal(f.store.transaction(tx => tx.get("references", media.id))!.providerId, `p:0/GUID-${index === 0 ? "A" : "B"}`);
    assert.doesNotThrow(() => f.store.transaction(tx => f.contexts.reference(tx, ingressContext, media)));
  }
  const root = messageRef(inboundScope, "provider-parent");
  assert.doesNotThrow(() => f.store.transaction(tx => f.contexts.reference(tx, ingressContext, root)));
  const collision = incomingReferenceBindings(input, event).map(binding =>
    binding.reference.kind === "attachment" && binding.providerId === "p:0/GUID-A"
      ? { ...binding, providerId: "p:0/OTHER" }
      : binding);
  assert.throws(() => f.store.transaction(tx =>
    registerIncomingReferences(tx, ingressContext, collision, f.clock.now())), /IDEMPOTENCY_CONFLICT/);
  const attachmentBinding = incomingReferenceBindings(input, event).find(binding => binding.reference.kind === "attachment")!;
  if (attachmentBinding.reference.kind !== "attachment") throw new Error("attachment fixture missing");
  const wrongParent = {
    providerId: attachmentBinding.providerId,
    reference: { ...attachmentBinding.reference, messageId: root.id },
  };
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(
    tx, ingressContext, [wrongParent], f.clock.now())), /IDEMPOTENCY_CONFLICT/);
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, ingressContext, [{
    ...incomingReferenceBindings(input, event)[0]!,
    reference: { ...incomingReferenceBindings(input, event)[0]!.reference,
      scope: { ...inboundScope, lineId: "wrong-line" } },
  }], f.clock.now())), /INVALID_REQUEST/);
  assert.throws(() => f.store.transaction(tx => f.contexts.reference(tx,
    { ...ingressContext, taskId: "wrong-task" }, root)), /FORBIDDEN|RESOURCE_NOT_FOUND/);
  f.store.transaction(tx => {
    const task = tx.get("tasks", ingressContext.taskId)!;
    tx.put("tasks", { ...task, revision: task.revision + 1, generation: task.generation + 1 }, task.revision);
  });
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, ingressContext,
    incomingReferenceBindings(input, event), f.clock.now())), /STALE_GENERATION/);
});

test("voice without a public provider attachment id remains unresolved", t => {
  const f = fixture(t);
  const captures = new FileCaptureStore(join(f.dir, "voice-captures"));
  const raw = rawMessage("voice-message", { type: "voice", name: "memo.m4a", mimeType: "audio/mp4" });
  const event = normalizeCaptured(raw, captures.put(raw), routes, f.clock.now());
  assert.equal(event.type, "unresolved");
  assert.deepEqual(incomingReferenceBindings(raw, event), []);
});

test("the active event source captures, registers and records receipts before acceptance", async t => {
  const f = fixture(t);
  const raw = rawMessage("read-event", { type: "read", target: { id: "provider-outbound" } });
  const nativeSpace = { ...raw.space, __platform: "imessage" } as unknown as Space;
  const message = { ...raw, __platform: "imessage", space: nativeSpace,
    timestamp: new Date(raw.timestamp) } as unknown as Message;
  const sdk = owner((async function* (): AsyncGenerator<[Space, Message]> {
    yield [nativeSpace, message];
  })());
  const order: string[] = [];
  let accepted!: () => void;
  const acceptance = new Promise<void>(resolve => { accepted = resolve; });
  await sdk.start();
  const source = new SpectrumEventSource(sdk, new FileCaptureStore(join(f.dir, "live-captures")), f.clock, () => {}, {}, {
    receipts: {
      writer: { recordReceipt(observation) { order.push("receipt"); f.store.recordReceipt(observation); } },
      resolveTarget: (_eventScope: Scope, providerTargetId: string) => ({
        providerId: providerTargetId,
        reference: messageRef(inboundScope, providerTargetId),
      }),
    },
    registerReferences: async () => { order.push("register"); },
  }, () => raw);
  await source.start(async event => { order.push("accept"); assert.equal(event.type, "receipt"); accepted(); });
  await Promise.race([acceptance, new Promise((_, reject) => setTimeout(() => reject(new Error("accept-timeout")), 1000))]);
  assert.deepEqual(order, ["register", "receipt", "accept"]);
  assert.equal(f.store.listReceipts(inboundScope).length, 1);
  await source.stop();
});

test("capture replay uses the same registration and receipt acquisition idempotently", async t => {
  const f = fixture(t);
  const captures = new FileCaptureStore(join(f.dir, "replay-captures"));
  const input = rawMessage("read-replay", { type: "read", target: { id: "provider-outbound" } });
  const captureId = captures.put({ capturedAt: f.clock.now(), message: input });
  const sdk = owner();
  let registrations = 0;
  const processing = {
    owner: sdk,
    receipts: {
      writer: { recordReceipt: (observation: Parameters<typeof f.store.recordReceipt>[0]) => f.store.recordReceipt(observation) },
      resolveTarget: (_eventScope: Scope, providerTargetId: string) => ({ providerId: providerTargetId, reference: messageRef(inboundScope, providerTargetId) }),
    },
    registerReferences: async () => { registrations++; },
  };
  for (let i = 0; i < 2; i++)
    assert.deepEqual(await recoverCaptures([captureId], captures, routes, f.clock, async () => {}, {}, processing), []);
  assert.equal(registrations, 2);
  assert.equal(f.store.listReceipts(inboundScope).length, 1);
});

function historicalEvent(id: string, receivedAt: number): IncomingEvent {
  return {
    version: 1, eventId: id, direction: "inbound", scope, occurredAt: receivedAt,
    receivedAt, ordering: { source: "repair-test" }, targets: [], type: "message",
    senderId: "sender-1", message: { version: 1, kind: "message", id: `message-${id}`, scope },
    content: { type: "text", text: "historical" }, change: "created",
  };
}
function unresolvedEvent(id: string, receivedAt: number): IncomingEvent {
  return {
    version: 1, eventId: id, direction: "inbound", scope, occurredAt: receivedAt,
    receivedAt, ordering: { source: "repair-test" }, targets: [], type: "unresolved",
    reason: "unknown-target", quarantineId: `capture-${id}`,
  };
}

test("999, 1000, 1001 and 10000 reduced rows cannot hide new pending work", t => {
  for (const count of [999, 1000, 1001, 10_000]) {
    const f = fixture(t);
    f.store.transaction(tx => {
      for (let i = 0; i < count; i++) {
        const id = `history-${count}-${String(i).padStart(5, "0")}`;
        tx.put("inbox", { id, scope, revision: 0, event: historicalEvent(id, i), state: "reduced" }, null);
      }
      const id = `new-${count}`;
      tx.put("inbox", { id, scope, revision: 0, event: historicalEvent(id, count + 1), state: "pending" }, null);
    });
    const router = new InboundRouter(f.store, f.clock, { route: () => ({
      taskId: context.taskId, principalId: context.principalId, generation: context.generation,
    }) }, []);
    assert.deepEqual(router.pending(scope).map(row => row.id), [`new-${count}`]);
  }
});

test("unresolved pages do not starve new work and restart creates no duplicate execution", t => {
  const f = fixture(t);
  f.store.transaction(tx => {
    for (let i = 0; i < 1100; i++) {
      const id = `unresolved-${String(i).padStart(4, "0")}`;
      tx.put("inbox", { id, scope, revision: 0, event: unresolvedEvent(id, i), state: "unresolved" }, null);
    }
    const id = "fresh-pending";
    tx.put("inbox", { id, scope, revision: 0, event: historicalEvent(id, 1), state: "pending" }, null);
  });
  const policy = { route: () => ({ taskId: context.taskId, principalId: context.principalId, generation: context.generation }) };
  const first = new InboundRouter(f.store, f.clock, policy, []);
  assert.equal(first.pending(scope)[0]!.id, "fresh-pending");
  f.clock.advance(20_000);
  assert.equal(new TextBatcher(first).tick(scope).length, 1);
  const restarted = new InboundRouter(f.store, f.clock, policy, []);
  new TextBatcher(restarted).tick(scope);
  assert.equal(f.store.scan("handoffs").length, 1);
  assert.equal(f.store.transaction(tx => tx.get("inbox", "fresh-pending"))!.state, "reduced");
});

test("pending and unresolved backlogs both receive bounded fair progress", t => {
  const f = fixture(t);
  f.store.transaction(tx => {
    for (let i = 0; i < 1100; i++) {
      const suffix = String(i).padStart(4, "0");
      const pendingId = `fair-pending-${suffix}`;
      const unresolvedId = `fair-unresolved-${suffix}`;
      tx.put("inbox", { id: pendingId, scope, revision: 0,
        event: historicalEvent(pendingId, i), state: "pending" }, null);
      tx.put("inbox", { id: unresolvedId, scope, revision: 0,
        event: unresolvedEvent(unresolvedId, i), state: "unresolved" }, null);
    }
  });
  const page = f.store.pendingInbox(scope);
  assert.equal(page.length, 1000);
  assert.equal(page.filter(row => row.state === "pending").length, 500);
  assert.equal(page.filter(row => row.state === "unresolved").length, 500);
});
