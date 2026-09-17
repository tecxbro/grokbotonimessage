import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveContents, type Content, type ContentInput, type Message, type Space } from "spectrum-ts";
import { privateTestRoot } from "../helpers/private-temp.js";
import { createProductionComposition } from "../../src/host/production.js";
import type { NormalizedHostConfiguration } from "../../src/host/configuration.js";
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
for (const servingPhone of ["+15555550101", undefined]) test(`Core Usability Gate: shared inbound to same-conversation reply (serving metadata ${servingPhone ? "present" : "absent"})`, async t => {
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
      availableOperations: ["text.send"] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile, principalId: "owner-1", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 1, permissions: ["text.send"],
      issuedAt: now - 1000, expiresAt: now + 120000, grokAgentId: "grok-1" },
    grok: { executable: "/fixture/gbot", timeoutMs: 1000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false }, cards: [],
    runtime: { statePath: join(runtime, "state.sqlite"), captureDirectory: join(runtime, "captures"), stagingDirectory: join(runtime, "staging") },
  };
  const sent: Content[] = [], lookups: Array<{ id: string; route: unknown }> = [], wakes: string[][] = [];
  const queue: Array<[Space, Message]> = [];
  let notify: (() => void) | undefined, closed = false, constructions = 0, listeners = 0;
  const space = { id: configuration.provider.conversationId!, __platform: "imessage", platform: "imessage", phone: "shared", type: "dm",
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!; sent.push(content);
      return { id: "outbound-1", platform: "imessage", space, content, direction: "outbound", timestamp: new Date(now) } as unknown as Message;
    }, getMessage: async () => undefined,
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
    provider: () => ({ space: {}, getMembers: async () => [], getAttachment: async () => undefined }) as never,
    stop: async () => { closed = true; notify?.(); },
  };
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now, sdkFactory: async () => { constructions++; return sdk; },
    grokCommandStyle: "gateway-flag", grokRunner: async (_executable, args) => { wakes.push([...args]); return "accepted"; },
  });
  const observer = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
  const rows = () => observer.transaction(tx => tx.list("handoffs", composition.scope, 100));
  const request = async <T>(value: LocalRequest): Promise<T> => {
    const response = validateResponse(await composition.executor.dispatch(value, composition.principal), value);
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.result as T;
  };
  try {
    await composition.runtime.start();
    const original = { id: "inbound-1", platform: "imessage", space, direction: "inbound", timestamp: new Date(now),
      sender: { id: "+15555550999" }, content: { type: "text", text: "Please reply here." } } as unknown as Message;
    queue.push([space, original]); notify?.();
    await eventually(() => observer.transaction(tx => tx.list("inbox", composition.scope, 100)).length === 1, "durable inbox capture");
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
    assert.deepEqual(event.scope, composition.scope);
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
    const replay = await request<OperationResult>({ version: 1, method: "submit", action });
    assert.equal(replay.requestId, admitted.requestId);
    assert.equal(sent.length, 1);
    assert.ok(lookups.length > 0);
    assert.deepEqual(sent[0], { type: "text", text: "Reply from the same host." });
    const ack = await request<{ handoff: HandoffRecord }>({ version: 1, method: "work.ack", contextId: "context-1", handoffId: claimed.handoff.id, fence: claimed.handoff.claim!.fence });
    assert.equal(ack.handoff.state, "acknowledged");
    assert.equal(observer.transaction(tx => tx.list("inbox", composition.scope, 100)).length, 1);
    assert.equal(rows().length, 1);
    assert.deepEqual({ constructions, listeners, wakes: wakes.length }, { constructions: 1, listeners: 1, wakes: 1 });
  } finally { await composition.runtime.stop(); observer.close(); }
});
