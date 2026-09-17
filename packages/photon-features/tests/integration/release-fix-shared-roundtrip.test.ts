import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveContents, type Content, type ContentInput, type Message, type Space } from "spectrum-ts";
import { privateTestRoot } from "../helpers/private-temp.js";
import { createProductionComposition } from "../../src/host/production.js";
import type { NormalizedHostConfiguration } from "../../src/host/configuration.js";
import { FileCaptureStore } from "../../src/adapters/transport/capture.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import type { IncomingEvent, LocalRequest, OperationResult } from "../../src/contracts/index.js";
import type { HandoffRecord } from "../../src/state/ports.js";
import { validateResponse } from "../../src/cli/local-client.js";

async function eventually(check: () => boolean, label: string) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(label);
}

// External SDK stream/send and gateway calls are controlled boundaries. All
// normalization, SQLite, batching, wake, work claim and execution are production.
for (const [servingPhone, secondary] of [["+15555550101", false], [undefined, false], [undefined, true]] as const)
  test(secondary ? "RFX-03 production: create secondary DM, restart, receive, claim and reply through its durable grant" :
    `Core Usability Gate: shared inbound to same-conversation reply (serving metadata ${servingPhone ? "present" : "absent"})`, async t => {
  const root = await privateTestRoot(t, "rfx-core-");
  const runtime = join(root, "runtime");
  await mkdir(runtime, { mode: 0o700 });
  const projectSecretFile = join(runtime, "secret.json"), credentialFile = join(runtime, "token");
  await writeFile(projectSecretFile, JSON.stringify({ version: 1, projectId: "project-1", projectSecret: "offline-fixture" }), { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  let now = Date.now();
  const configuration: NormalizedHostConfiguration = {
    version: 3, ownerModel: "installation-owner", activateAfterValidation: true, activation: "enabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1", projectSecretFile,
      projectSecretFormat: "photon-project-secret-v1", accountId: "account-1", lineId: "shared-line-1",
      ...(servingPhone ? { phone: servingPhone } : {}), conversationId: "authenticated-native-conversation", dedicated: false,
      availableOperations: secondary ? ["text.send", "space.create", "space.get", "typing.begin", "typing.end"] : ["text.send", "app.send"] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile, principalId: "owner-1", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 1, permissions: secondary ? ["text.send", "space.create", "space.get", "typing.begin", "typing.end"] : ["text.send", "app.send"],
      issuedAt: now - 1000, expiresAt: now + 120000, grokAgentId: "grok-1" },
    grok: { executable: "/fixture/gbot", timeoutMs: 1000 },
    authorization: { administrativeOperations: secondary ? ["space.create"] : [], allowedRecipients: secondary ? ["+15555550777"] : [], allowNativeContent: false }, cards: [],
    runtime: { statePath: join(runtime, "state.sqlite"), captureDirectory: join(runtime, "captures"), stagingDirectory: join(runtime, "staging") },
  };
  const sent: Content[] = [], lookups: Array<{ id: string; route: unknown }> = [], wakes: string[][] = [];
  const queue: Array<[Space, Message]> = [];
  let typingStarts = 0;
  let notify: (() => void) | undefined, closed = false, constructions = 0, listeners = 0;
  const space = { id: secondary ? "created-secondary-dm" : configuration.provider.conversationId!, __platform: "imessage", platform: "imessage", phone: "shared", type: "dm",
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!; sent.push(content);
      return { id: `outbound-${sent.length}`, platform: "imessage", sender: undefined, space, content, direction: "outbound", timestamp: new Date(now) } as unknown as Message;
    }, getMessage: async () => undefined,
    startTyping: async () => { typingStarts++; }, stopTyping: async () => undefined,
  } as unknown as Space;
  const sdk: OwnedSdk = {
    messages: () => ({ async *[Symbol.asyncIterator]() {
      listeners++;
      while (!closed) {
        if (queue.length) yield queue.shift()!;
        else await new Promise<void>(resolve => { notify = resolve; });
      }
    } }),
    space: async (id, route) => { lookups.push({ id, route }); assert.equal(id, space.id); assert.equal(route, undefined); return space; },
    provider: () => ({ space: {
      create: async (recipient: string, route: { phone: string }) => {
        assert.equal(recipient, "+15555550777"); assert.deepEqual(route, { phone: "shared" }); return space;
      },
      get: async (id: string, route: { phone: string }) => {
        assert.equal(id, space.id); assert.deepEqual(route, { phone: "shared" }); return space;
      },
    }, getMembers: async () => [], getAttachment: async () => undefined }) as never,
    stop: async () => { closed = true; notify?.(); },
  };
  const diagnostics: string[] = [];
  const compose = () => createProductionComposition(configuration, root, root, {
    report: code => diagnostics.push(code),
    now: () => now, sdkFactory: async () => { constructions++; closed = false; return sdk; },
    grokCommandStyle: "gateway-flag", grokRunner: async (_executable, args) => { wakes.push([...args]); return "accepted"; },
  });
  let composition = await compose();
  let conversationScope = composition.scope;
  const observer = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
  const rows = () => observer.transaction(tx => tx.list("handoffs", conversationScope, 100));
  const request = async <T>(value: LocalRequest): Promise<T> => {
    const response = validateResponse(await composition.executor.dispatch(value, composition.principal), value);
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.result as T;
  };
  try {
    await composition.runtime.start();
    if (secondary) {
      const created = await request<OperationResult>({ version: 1, method: "submit", action: { version: 1,
        contextId: "context-1", idempotencyKey: "create-dm", operation: "space.create", arguments: { members: ["+15555550777"] } } });
      await eventually(() => {
        const row = observer.transaction(tx => tx.get("outbox", created.requestId));
        return !!row && !["queued", "running"].includes(row.result.status);
      }, "secondary creation completes");
      const result = observer.transaction(tx => tx.get("outbox", created.requestId))!.result;
      assert.equal(result.status, "executor-completed", JSON.stringify(result));
      const ref = result.references.find(ref => ref.kind === "space")!;
      assert.ok(ref); assert.notDeepEqual(ref.scope, composition.scope);
      conversationScope = ref.scope;
      await composition.runtime.stop();
      composition = await compose();
      await composition.runtime.start();
      const foreign = { ...ref, id: "guessed-chat", scope: { ...ref.scope, spaceId: "guessed-chat" } };
      const denied = await composition.executor.dispatch({ version: 1, method: "submit", action: { version: 1,
        contextId: "context-1", idempotencyKey: "foreign", operation: "text.send", arguments: { space: foreign as never, text: "denied" } } }, composition.principal);
      assert.equal(denied.ok, false); assert.equal(sent.length, 0);
      const unknownSpace = { ...space, id: "unknown-native-dm" } as Space;
      queue.push([unknownSpace, { id: "unknown-event", platform: "imessage", space: unknownSpace,
        direction: "inbound", timestamp: new Date(now), sender: { id: "+15555550888" },
        content: { type: "text", text: "Unauthorized inbound" } } as unknown as Message]); notify?.();
      await eventually(() => diagnostics.includes("UNRESOLVED_ROUTE"), "unknown inbound remains unresolved");
      const captures = new FileCaptureStore(configuration.runtime.captureDirectory);
      assert.ok([...captures.ids()].some(id => JSON.stringify(captures.read(id)).includes("unknown-native-dm")));
      assert.equal(observer.scan("inbox", "").length, 0);
      assert.equal(observer.scan("handoffs", "").length, 0);
      assert.equal(wakes.length, 0);
      const typing = await request<OperationResult>({ version: 1, method: "submit", action: { version: 1,
        contextId: "context-1", idempotencyKey: "secondary-typing", operation: "typing.begin", arguments: { space: ref as never, ttlMs: 10000 } } });
      await eventually(() => observer.transaction(tx => tx.get("outbox", typing.requestId))?.result.status === "executor-completed",
        "secondary typing admitted and scheduled");
      await eventually(() => typingStarts === 1, "typing resolves secondary route");
    }
    const original = { id: "inbound-1", platform: "imessage", space, direction: "inbound", timestamp: new Date(now),
      sender: { id: "+15555550999" }, content: { type: "text", text: "Please reply here." } } as unknown as Message;
    queue.push([space, original]); notify?.();
    await eventually(() => observer.transaction(tx => tx.list("inbox", conversationScope, 100)).length === 1, "durable inbox capture");
    // Text batching is real; advance its clock without changing its policy.
    now += 2000;
    await eventually(() => wakes.length === 1 && rows()[0]?.wake?.lastStatus === "accepted", "one accepted wake");
    assert.equal(rows().length, 1);
    assert.equal(rows()[0]!.wake!.attempts, 1);
    assert.equal(rows()[0]!.wake!.targetId, "grok-1");
    assert.deepEqual(wakes[0]!.slice(0, 3), ["--gateway", "send", "grok-1"]);
    assert.ok(!wakes[0]![3]!.includes("Please reply here."));
    now += 1000;
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(wakes.length, 1, "accepted wake must not repeat on the next one-second pump tick");
    const listed = await request<{ work: HandoffRecord[] }>({ version: 1, method: "work.list", contextId: "context-1", limit: 100 });
    assert.equal(listed.work.length, 1);
    const claimed = await request<{ handoff: HandoffRecord; events: IncomingEvent[] }>({ version: 1, method: "work.claim", contextId: "context-1", handoffId: listed.work[0]!.id, leaseMs: 60000 });
    assert.equal(claimed.events.length, 1);
    const event = claimed.events[0]!;
    assert.equal(event.type, "message");
    if (event.type !== "message") throw new Error("expected original message event");
    assert.deepEqual(event.content, { type: "text", text: "Please reply here." });
    assert.deepEqual(event.scope, conversationScope);
    assert.deepEqual(claimed.handoff.eventIds, [event.eventId]);
    const action = { version: 1 as const, contextId: "context-1", idempotencyKey: "reply-1", operation: "text.send" as const,
      arguments: { space: { version: 1 as const, kind: "space" as const, id: event.scope.spaceId, scope: event.scope }, text: "Reply from the same host." } };
    const caps = await composition.executor.dispatch({ version: 1, method: "capabilities", contextId: "context-1" }, composition.principal);
    assert.equal(caps.ok, true);
    const admitted = await request<OperationResult>({ version: 1, method: "submit", action });
    assert.ok(["queued", "running", "provider-accepted"].includes(admitted.status), JSON.stringify(admitted));
    await eventually(() => {
      const result = observer.transaction(tx => tx.get("outbox", admitted.requestId))?.result;
      return !!result && !["queued", "running"].includes(result.status);
    }, "outbound execution completes");
    const completed = observer.transaction(tx => tx.get("outbox", admitted.requestId))!.result;
    assert.equal(completed.status, "provider-accepted", JSON.stringify(completed));
    assert.equal(sent.length, 1, "same-host outbound text dispatch");
    assert.ok(completed.references.every(ref => JSON.stringify(ref.scope) === JSON.stringify(conversationScope)));
    const replay = await request<OperationResult>({ version: 1, method: "submit", action });
    assert.equal(replay.requestId, admitted.requestId);
    assert.equal(sent.length, 1);
    assert.ok(lookups.length > 0);
    assert.deepEqual(sent[0], { type: "text", text: "Reply from the same host." });
    const ack = await request<{ handoff: HandoffRecord }>({ version: 1, method: "work.ack", contextId: "context-1", handoffId: claimed.handoff.id, fence: claimed.handoff.claim!.fence });
    assert.equal(ack.handoff.state, "acknowledged");
    assert.equal(observer.transaction(tx => tx.list("inbox", conversationScope, 100)).length, 1);
    assert.equal(rows().length, 1);
    assert.deepEqual({ constructions, listeners, wakes: wakes.length }, { constructions: secondary ? 2 : 1, listeners: secondary ? 2 : 1, wakes: 1 });
    if (!secondary) {
      const card = await request<OperationResult>({ version: 1, method: "submit", action: { version: 1,
        contextId: "context-1", idempotencyKey: "static-card", operation: "app.send",
        arguments: { space: action.arguments.space, templateId: "universal-static", url: "https://ordinary.example/card" } } });
      await eventually(() => {
        const status = observer.transaction(tx => tx.get("outbox", card.requestId))?.result.status;
        return !!status && !["queued", "running"].includes(status);
      }, "built-in static card completes without templates or backend");
      const completedCard = observer.transaction(tx => tx.get("outbox", card.requestId))!.result;
      assert.equal(completedCard.status, "provider-accepted", JSON.stringify(completedCard));
      assert.equal(sent.length, 2);
      assert.equal(sent[1]!.type, "app");
      if (sent[1]!.type === "app") assert.equal(sent[1]!.live, false);
      assert.equal(wakes.length, 1);
    }
  } finally { await composition.runtime.stop(); observer.close(); }
});
