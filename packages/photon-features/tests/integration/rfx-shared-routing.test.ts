import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Spectrum, definePlatform, type Message, type Space } from "spectrum-ts";
import { z } from "zod";
import type { IncomingEvent, Scope } from "../../src/contracts/index.js";
import type { ReceiptObservation } from "../../src/contracts/receipts.js";
import { ProviderContext, opaqueId, type LineBinding } from "../../src/adapters/transport/provider-context.js";
import { SpectrumOwner, type OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import { processCapturedMessage, subscribeMessageEvents, UnresolvedCapturedMessage } from "../../src/adapters/transport/message-events.js";
import { observeReceipt } from "../../src/runtime/inbound/receipt-observer.js";

const projectId = "rfx-project";
const conversationId = "any;-;+15555550999";
const shared = { accountId: "shared-account", lineId: "shared-logical-line", dedicated: false, servingPhone: "+15555550101" } satisfies LineBinding;
const dedicated = { accountId: "dedicated-account", lineId: "dedicated-logical-line", dedicated: true, servingPhone: "+15555550102" } satisfies LineBinding;
const scope = (line: LineBinding): Scope => ({ projectId, provider: "imessage", accountId: line.accountId, lineId: line.lineId, spaceId: opaqueId("space", conversationId) });
const routes = () => new ProviderContext(projectId, [shared, dedicated]);
const snapshot = (phone = "shared", content: Record<string, unknown> = { type: "text", text: "hello" }) => ({
  id: "provider-message", platform: "imessage", direction: "inbound",
  timestamp: "2026-09-16T20:00:00.000Z", sender: { id: "+15555550999" },
  space: { id: conversationId, platform: "imessage", phone }, content,
});
const dimensions = { inbound: "photon-stream", outbound: "imessage", wake: "existing-grok-task-handoff" } as const;
const unusedSdk: OwnedSdk = { messages: async function* () {}, space: async () => { throw new Error("unused"); }, stop: async () => {} };

test("shared inbound text reaches accept with exact durable scope and provider phone preserved", async () => {
  const owner = new SpectrumOwner(dimensions, routes(), async () => unusedSdk);
  const accepted: IncomingEvent[] = [];
  const input = snapshot();
  const event = await processCapturedMessage({ snapshot: input, captureId: "capture-1", owner, capturedAt: 1000,
    accept: async event => { accepted.push(event); },
    processing: { registerReferences: async (raw, event) => { assert.equal(raw, input); assert.deepEqual(event.scope, scope(shared)); },
      receipts: { writer: { recordReceipt: () => assert.fail("text is not a receipt") } } },
  });
  assert.deepEqual(accepted, [event]);
  assert.equal(event.type, "message");
  if (event.type === "message") assert.deepEqual(event.content, { type: "text", text: "hello" });
  assert.equal(input.space.phone, "shared");
  assert.deepEqual(event.scope, scope(shared));
});

test("shared read receipt uses the same scope and persists before acceptance", async () => {
  const owner = new SpectrumOwner(dimensions, routes(), async () => unusedSdk);
  const observations: ReceiptObservation[] = [];
  const order: string[] = [];
  const event = await processCapturedMessage({ snapshot: snapshot("shared", { type: "read", target: { id: "outbound-target" } }),
    captureId: "capture-read", owner, capturedAt: 1000,
    accept: async () => { order.push("accept"); },
    processing: { registerReferences: async () => { order.push("references"); },
      receipts: { writer: { recordReceipt: value => { observations.push(value); order.push("receipt"); } } } },
  });
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0]!.scope, scope(shared));
  assert.deepEqual(event.scope, observations[0]!.scope);
  assert.equal(observations[0]!.kind, "read");
  assert.equal(observations[0]!.providerTargetId, "outbound-target");
  assert.equal(observations[0]!.readerId, "+15555550999");
  assert.deepEqual(order, ["references", "receipt", "accept"]);
});

test("dedicated inbound exact-matches its own E.164, including multiple dedicated lines", () => {
  const other = { ...dedicated, accountId: "other-account", lineId: "other-line", servingPhone: "+15555550103" };
  const context = new ProviderContext(projectId, [shared, dedicated, other]);
  assert.deepEqual(context.inbound(dedicated.servingPhone, conversationId), scope(dedicated));
  assert.deepEqual(context.inbound(other.servingPhone, conversationId), scope(other));
  assert.deepEqual(context.inbound("shared", conversationId), scope(shared));
});

test("foreign and missing provider phones never authorize shared or dedicated ingress or receipts", async () => {
  for (const line of [shared, dedicated]) {
    const context = new ProviderContext(projectId, [line]);
    const owner = new SpectrumOwner(dimensions, context, async () => unusedSdk);
    for (const phone of ["+15555550888", "", ...(line.dedicated ? ["shared"] : [line.servingPhone])]) {
      assert.throws(() => context.inbound(phone, conversationId), /UNBOUND_PROVIDER_ROUTE/);
      await assert.rejects(processCapturedMessage({ snapshot: snapshot(phone), captureId: "foreign", owner, capturedAt: 1000,
        accept: async () => assert.fail("foreign accept"), processing: {
          registerReferences: async () => assert.fail("foreign reference"),
          receipts: { writer: { recordReceipt: () => assert.fail("foreign receipt") } },
        },
      }), error => error instanceof UnresolvedCapturedMessage && error.message === "UNRESOLVED_ROUTE" && error.cause instanceof Error);
      await assert.rejects(observeReceipt(snapshot(phone, { type: "read", target: { id: "foreign" } }), context, 1000,
        { writer: { recordReceipt: () => assert.fail("foreign receipt") } }), /UNBOUND_PROVIDER_ROUTE/);
    }
  }
});

test("empty conversation IDs fail for shared and dedicated routes", () => {
  for (const line of [shared, dedicated]) {
    const context = new ProviderContext(projectId, [line]);
    assert.throws(() => context.inbound(line.dedicated ? line.servingPhone : "shared", ""), /UNBOUND_PROVIDER_ROUTE/);
    assert.throws(() => context.outbound({ ...scope(line), spaceId: opaqueId("space", "") }, ""), /SCOPE_MISMATCH/);
  }
});

test("ambiguous shared and dedicated bindings fail closed independent of ordering", () => {
  for (const line of [shared, dedicated]) {
    const other = { ...line, accountId: "other-account", lineId: "other-line",
      servingPhone: line.dedicated ? line.servingPhone : "+15555550777" };
    for (const bindings of [[line, other], [other, line]])
      assert.throws(() => new ProviderContext(projectId, bindings), /AMBIGUOUS_LINE_BINDINGS/);
  }
});

test("provider identity stays separate from serving phone and binding mutation cannot alter routing", () => {
  assert.throws(() => new ProviderContext(projectId, [{ ...shared, servingPhone: "shared" }]), /INVALID_SERVING_PHONE/);
  assert.throws(() => new ProviderContext(projectId, [{ ...dedicated, servingPhone: "" }]), /INVALID_SERVING_PHONE/);
  const mutable: LineBinding = { ...shared };
  const context = new ProviderContext(projectId, [mutable]);
  mutable.dedicated = true;
  assert.deepEqual(context.inbound("shared", conversationId), scope(shared));
  assert.throws(() => context.inbound(shared.servingPhone, conversationId), /UNBOUND_PROVIDER_ROUTE/);
  assert.throws(() => new ProviderContext(projectId, [{ accountId: "old-account", lineId: "old-line", phone: "+15555550101" } as unknown as LineBinding]), /INVALID_LINE_MODE/);
});

test("outbound shared lookup omits phone pin, dedicated lookup pins exact phone, one SDK construction", async () => {
  const calls: { id: string; route: { phone?: string } | undefined }[] = [];
  let constructed = 0, stopped = 0;
  const owner = new SpectrumOwner(dimensions, routes(), async () => {
    constructed++;
    return { ...unusedSdk, space: async (id, route) => { calls.push({ id, route }); return { id } as Space; }, stop: async () => { stopped++; } };
  });
  try {
    await Promise.all([owner.start(), owner.start(), owner.start()]);
    await owner.space(scope(shared), conversationId);
    await owner.space(scope(dedicated), conversationId);
    assert.deepEqual(calls, [{ id: conversationId, route: undefined }, { id: conversationId, route: { phone: dedicated.servingPhone } }]);
    for (const changed of [{ projectId: "foreign" }, { accountId: "foreign" }, { lineId: "foreign" }, { spaceId: "foreign" }, { provider: "foreign" }])
      await assert.rejects(owner.space({ ...scope(shared), ...changed } as Scope, conversationId), /SCOPE_MISMATCH/);
    assert.equal(calls.length, 2);
    assert.equal(constructed, 1);
  } finally { await Promise.all([owner.stop(), owner.stop()]); }
  assert.equal(stopped, 1);
});

test("valid shared DM stream is captured and accepted without UNRESOLVED_ROUTE", async () => {
  const offline = definePlatform("imessage", {
    config: z.object({}), lifecycle: { createClient: async () => ({}) },
    user: { resolve: async ({ input }) => ({ id: input.userID }) },
    space: { schema: z.object({ id: z.string(), phone: z.string() }), create: async () => ({ id: conversationId, phone: "shared" }) },
    async *messages() {}, send: async () => undefined,
  });
  const app = await Spectrum({ providers: [offline.config()] });
  const space = await offline(app).space.create("reader");
  const message = { ...snapshot(), space, timestamp: new Date(snapshot().timestamp) } as unknown as Message;
  const reports: string[] = [], captures: unknown[] = [], accepted: IncomingEvent[] = [];
  const owner = new SpectrumOwner(dimensions, routes(), async () => ({ ...unusedSdk,
    messages: async function* () { yield [space, message] as [Space, Message]; },
  }));
  try {
    await owner.start();
    const subscription = subscribeMessageEvents({ owner, clock: { now: () => 1000 },
      captures: { put: value => { captures.push(value); return "capture-stream"; }, read: () => captures[0] },
      accept: async event => { assert.equal(captures.length, 1); accepted.push(event); },
      receipts: { writer: { recordReceipt: () => assert.fail("unexpected receipt") } },
      registerReferences: async () => {}, report: code => { reports.push(code); },
    });
    // The finite fixture ends unexpectedly; retain that real lifecycle failure.
    await assert.rejects(subscription.completion, /UNEXPECTED_STREAM_END/);
    assert.equal(accepted.length, 1);
    assert.deepEqual(accepted[0]!.scope, scope(shared));
    assert.deepEqual(reports, ["RESTART_GAP", "RECEIVE_FAILED"]);
    assert.equal((captures[0] as { message: { space: { phone: string } } }).message.space.phone, "shared");
  } finally { await owner.stop(); await app.stop(); }
});

test("cloud factory calls shared space.get without params and dedicated space.get with its pin", () => {
  // Module mocks run in a subprocess so the regular integration runner needs no
  // experimental flags and other tests retain their real public Spectrum imports.
  const moduleUrl = new URL("../../src/adapters/transport/spectrum-owner.js", import.meta.url).href;
  const contextUrl = new URL("../../src/adapters/transport/provider-context.js", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { mock } from "node:test";
    let constructed = 0, stopped = 0;
    const calls = [];
    const provider = { space: { get: async (...args) => { calls.push(args); return { id: args[0] }; } } };
    const app = { messages: (async function* () {})(), stop: async () => { stopped++; } };
    const imessage = Object.assign(() => provider, { config: () => ({}) });
    mock.module("spectrum-ts", { namedExports: { Spectrum: async () => { constructed++; return app; } } });
    mock.module("spectrum-ts/providers/imessage", { namedExports: { imessage } });
    const { SpectrumOwner, cloudSdkFactory } = await import(${JSON.stringify(moduleUrl)});
    const { ProviderContext } = await import(${JSON.stringify(contextUrl)});
    const routes = new ProviderContext(${JSON.stringify(projectId)}, ${JSON.stringify([shared, dedicated])});
    const owner = new SpectrumOwner(${JSON.stringify(dimensions)}, routes,
      cloudSdkFactory({ projectId: ${JSON.stringify(projectId)}, projectSecret: "fixture-only" }));
    try {
      await Promise.all([owner.start(), owner.start()]);
      await owner.space(${JSON.stringify(scope(shared))}, ${JSON.stringify(conversationId)});
      await owner.space(${JSON.stringify(scope(dedicated))}, ${JSON.stringify(conversationId)});
      assert.deepEqual(calls, [[${JSON.stringify(conversationId)}], [${JSON.stringify(conversationId)}, { phone: ${JSON.stringify(dedicated.servingPhone)} }]]);
      assert.equal(constructed, 1);
      assert.equal(owner.provider(), provider);
    } finally { await owner.stop(); mock.restoreAll(); }
    assert.equal(stopped, 1);
  `], { encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
