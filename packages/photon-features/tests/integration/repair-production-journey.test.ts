import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { attachment, resolveContents, type Content, type ContentInput, type Message, type Space } from "spectrum-ts";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import type { Action, IncomingEvent, OperationResult, ResourceRef } from "../../src/contracts/index.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition } from "../../src/host/production.js";
import { run } from "../../src/cli/main.js";
import { privateTestRoot } from "../helpers/private-temp.js";

type Pair = [Space, Message];

class MessageQueue implements AsyncIterable<Pair> {
  private values: Pair[] = [];
  private waiters: Array<(value: IteratorResult<Pair>) => void> = [];
  private closed = false;
  push(value: Pair): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }
  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<Pair> {
    return {
      next: async () => {
        const value = this.values.shift();
        if (value) return { value, done: false };
        if (this.closed) return { value: undefined, done: true };
        return new Promise<IteratorResult<Pair>>(resolve => this.waiters.push(resolve));
      },
    };
  }
}

const output = () => {
  let value = "";
  return { stream: { write: (part: string) => { value += part; return true; } }, value: () => value };
};

async function waitUntil(check: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`timeout waiting for ${label}`);
}

test("automated production path retrieves durable work and acts only through captured references", async t => {
  const root = await privateTestRoot(t, "rpjourney-");
  const runtimeDirectory = join(root, "runtime");
  const importDirectory = join(runtimeDirectory, "imports");
  await Promise.all([runtimeDirectory, importDirectory, join(runtimeDirectory, "captures"), join(runtimeDirectory, "staging")]
    .map(directory => mkdir(directory, { recursive: true, mode: 0o700 })));
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  const generated = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await writeFile(projectSecretFile, "fixture-project-secret", { mode: 0o600 });
  await writeFile(credentialFile, "e".repeat(64), { mode: 0o600 });
  await writeFile(join(importDirectory, "generated.png"), generated, { mode: 0o600 });

  let now = Date.parse("2026-09-11T18:00:00.000Z");
  const operations = ["text.send", "message.reply", "attachment.fetch", "attachment.send"] as const;
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: {
      kind: "spectrum-cloud-imessage",
      projectId: "project-1",
      projectSecretFile,
      accountId: "account-1",
      lineId: "line-1",
      phone: "+15555550101",
      conversationId: "conversation-1",
      dedicated: true,
      availableOperations: [...operations],
    },
    local: {
      socketPath: join(runtimeDirectory, "runtime.sock"),
      credentialFile,
      principalId: "grok-principal",
      credentialId: "local-token-v1",
    },
    task: {
      contextId: "context-1",
      taskId: "task-1",
      generation: 7,
      permissions: [...operations],
      issuedAt: now - 1_000,
      expiresAt: now + 60_000,
      grokAgentId: "grok-agent",
    },
    grok: { executable: "/usr/bin/false", timeoutMs: 1_000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [],
    runtime: {
      statePath: join(runtimeDirectory, "state.sqlite"),
      captureDirectory: join(runtimeDirectory, "captures"),
      stagingDirectory: join(runtimeDirectory, "staging"),
      importDirectory,
    },
  };

  const queue = new MessageQueue();
  const outbound: Content[] = [];
  const messages = new Map<string, Message>();
  let constructions = 0;
  let listeners = 0;
  let stops = 0;
  let wakeCalls = 0;
  let runnerFinished!: () => void;
  const runnerDone = new Promise<void>(resolve => { runnerFinished = resolve; });

  const space = {
    id: configuration.provider.conversationId,
    __platform: "imessage",
    platform: "imessage",
    phone: configuration.provider.phone,
    type: "group",
    getMessage: async (id: string) => messages.get(id),
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!;
      outbound.push(content);
      const sent = {
        id: `provider-outbound-${outbound.length}`,
        platform: "imessage",
        space,
        content,
        direction: "outbound",
        timestamp: new Date(now),
      } as unknown as Message;
      messages.set(sent.id, sent);
      return sent;
    },
  } as unknown as Space & { phone: string };

  const nativeAttachment = await attachment(generated, {
    id: "provider-attachment-1",
    name: "question.png",
    mimeType: "image/png",
  }).build();
  if (nativeAttachment.type !== "attachment") throw new Error("attachment fixture mismatch");
  const childText = {
    id: "provider-child-text",
    platform: "imessage",
    space,
    content: { type: "text", text: "Reply to this and send generated.png" },
    direction: "inbound",
    timestamp: new Date(now),
    sender: { id: "+15555550999" },
  } as unknown as Message;
  const childAttachment = {
    id: "provider-child-attachment",
    platform: "imessage",
    space,
    content: nativeAttachment,
    direction: "inbound",
    timestamp: new Date(now),
    sender: { id: "+15555550999" },
  } as unknown as Message;
  const inbound = {
    id: "provider-inbound-group",
    platform: "imessage",
    space,
    content: { type: "group", items: [childText, childAttachment] },
    direction: "inbound",
    timestamp: new Date(now),
    sender: { id: "+15555550999" },
    reply: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!;
      const reply = { type: "reply", target: inbound, content } as unknown as Content;
      outbound.push(reply);
      const sent = {
        id: `provider-outbound-${outbound.length}`,
        platform: "imessage",
        space,
        content: reply,
        direction: "outbound",
        timestamp: new Date(now),
      } as unknown as Message;
      messages.set(sent.id, sent);
      return sent;
    },
  } as unknown as Message;
  for (const message of [inbound, childText, childAttachment]) messages.set(message.id, message);

  const sdkFactory = async (): Promise<OwnedSdk> => {
    constructions++;
    const stream = constructions === 1 ? queue : new MessageQueue();
    return {
      messages: () => {
        listeners++;
        return stream;
      },
      space: async () => space,
      provider: () => ({
        getAttachment: async (id: string) => id === nativeAttachment.id ? nativeAttachment : undefined,
        getMembers: async () => [],
        space: {},
      }) as never,
      stop: async () => { stops++; stream.close(); },
    };
  };

  const env = {
    GROK_PHOTON_CONTEXT_ID: configuration.task.contextId,
    GROK_PHOTON_SOCKET: configuration.local.socketPath,
    GROK_PHOTON_CREDENTIAL_FILE: credentialFile,
  };
  const cli = async (args: string[], input?: unknown) => {
    const stdout = output();
    const stderr = output();
    const code = await run(args, env, Readable.from(input === undefined ? [] : [JSON.stringify(input)]), stdout.stream, stderr.stream);
    const parsed = JSON.parse(stdout.value()) as any;
    return { code, parsed, stderr: stderr.value() };
  };
  const settle = async (action: Action): Promise<OperationResult> => {
    const submitted = await cli(["execute", "--json-stdin"], action);
    assert.equal(submitted.code, 0, submitted.stderr + JSON.stringify(submitted.parsed));
    let result = submitted.parsed.result as OperationResult;
    for (let attempt = 0; result.status === "queued" && attempt < 300; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      const status = await cli(["status", "--request-id", result.requestId, "--json"]);
      assert.equal(status.code, 0, status.stderr + JSON.stringify(status.parsed));
      result = status.parsed.result;
    }
    assert.notEqual(result.status, "queued", JSON.stringify(result));
    return result;
  };

  let runnerError: unknown;
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory,
    grokRunner: async () => {
      wakeCalls++;
      if (wakeCalls > 1) return "accepted";
      try {
        const listed = await cli(["work.list", "--limit", "20", "--json"]);
        assert.equal(listed.code, 0, listed.stderr + JSON.stringify(listed.parsed));
        assert.equal(listed.parsed.result.work.length, 1);
        const handoffId = listed.parsed.result.work[0].id as string;
        const claimed = await cli(["work.claim", "--handoff-id", handoffId, "--lease-ms", "30000", "--json"]);
        assert.equal(claimed.code, 0, claimed.stderr + JSON.stringify(claimed.parsed));
        const fence = claimed.parsed.result.handoff.claim.fence as number;
        const events = claimed.parsed.result.events as IncomingEvent[];
        assert.equal(events.length, 1);
        const event = events[0];
        assert.equal(event?.type, "message");
        if (!event || event.type !== "message") throw new Error("missing message event");
        const references: ResourceRef[] = [];
        const collect = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          if ("version" in value && "kind" in value && "id" in value && "scope" in value)
            references.push(value as ResourceRef);
          for (const child of Object.values(value)) collect(child);
        };
        collect(event);
        const target = event.message;
        const attachmentRef = references.find((ref): ref is Extract<ResourceRef, { kind: "attachment" }> => ref.kind === "attachment");
        assert.ok(attachmentRef, JSON.stringify(event));

        const heartbeat = await cli(["work.heartbeat", "--handoff-id", handoffId, "--fence", String(fence), "--lease-ms", "30000", "--json"]);
        assert.equal(heartbeat.code, 0, heartbeat.stderr);
        const stale = await cli(["work.ack", "--handoff-id", handoffId, "--fence", String(fence + 1), "--json"]);
        assert.equal(stale.parsed.error.code, "STALE_FENCE");

        const fetched = await settle({
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "journey-fetch",
          operation: "attachment.fetch",
          arguments: { attachment: attachmentRef },
        });
        assert.equal(fetched.status, "executor-completed", JSON.stringify(fetched));
        assert.equal(fetched.value?.type, "media");

        const imported = await cli(["media.import", "--json-stdin"], {
          filename: "generated.png",
          metadata: { mimeType: "image/png", name: "generated.png" },
        });
        assert.equal(imported.code, 0, imported.stderr + JSON.stringify(imported.parsed));
        const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
          version: 1,
          kind: "space",
          id: event.scope.spaceId,
          scope: event.scope,
        };
        const prose = await settle({
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "journey-prose",
          operation: "text.send",
          arguments: { space: spaceRef, text: "Hello — ready?" },
        });
        assert.equal(prose.status, "provider-accepted", JSON.stringify(prose));
        const sent = await settle({
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "journey-send-import",
          operation: "attachment.send",
          arguments: { space: spaceRef, media: imported.parsed.result },
        });
        assert.equal(sent.status, "provider-accepted", JSON.stringify(sent));
        const reply = await settle({
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "journey-reply",
          operation: "message.reply",
          arguments: { message: target, content: { type: "text", text: "I used the captured message reference." } },
        });
        assert.equal(reply.status, "provider-accepted", JSON.stringify(reply));

        const acked = await cli(["work.ack", "--handoff-id", handoffId, "--fence", String(fence), "--json"]);
        assert.equal(acked.code, 0, acked.stderr + JSON.stringify(acked.parsed));
        assert.equal((await cli(["work.list", "--limit", "20", "--json"])).parsed.result.work.length, 0);
      } catch (error) {
        runnerError = error;
      } finally {
        runnerFinished();
      }
      return "accepted";
    },
  });

  let local: { close(): Promise<void> } | undefined;
  try {
    await composition.runtime.start();
    local = await composition.startLocalInterface();
    queue.push([space, inbound]);
    await Promise.race([runnerDone, new Promise((_, reject) => setTimeout(() => reject(new Error("runner timeout")), 5_000))]);
    if (runnerError) throw runnerError;
    assert.deepEqual({ constructions, listeners }, { constructions: 1, listeners: 1 });
    assert.equal(outbound.filter(content => content.type === "attachment").length, 1);
    assert.equal(outbound.filter(content => content.type === "reply").length, 1);
    assert.equal(outbound.filter(content => content.type === "poll").length, 0,
      "ordinary inbound text must not create a poll");
    assert.equal(outbound.find(content => content.type === "text")?.type === "text" &&
      outbound.find(content => content.type === "text")?.text, "hello, ready?");

    const sentRef = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
    const providerTarget = sentRef.transaction(tx => tx.list("references", composition.scope, 1000))
      .find(row => row.providerId === "provider-outbound-1")?.providerId;
    sentRef.close();
    assert.equal(providerTarget, "provider-outbound-1");
    const receipt = {
      id: "provider-read-event",
      platform: "imessage",
      space,
      content: { type: "read", target: { id: providerTarget } },
      direction: "inbound",
      timestamp: new Date(now + 1),
      sender: { id: "+15555550999" },
    } as unknown as Message;
    queue.push([space, receipt]);
    await waitUntil(() => {
      const observer = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
      try { return observer.listReceipts(composition.scope).length === 1; }
      finally { observer.close(); }
    }, "durable receipt");

    const pollVote = {
      id: "provider-poll-vote",
      platform: "imessage",
      space,
      content: {
        type: "poll_option",
        option: { title: "Same" },
        poll: { type: "poll", title: "Pick?", options: [{ title: "Same" }, { title: "Same" }] },
        selected: true,
        title: "Same",
      },
      direction: "inbound",
      timestamp: new Date(now + 2),
      sender: { id: "+15555550999" },
    } as unknown as Message;
    queue.push([space, pollVote]);
    await waitUntil(() => wakeCalls === 2, "poll-answer wake");
    const pollWork = await cli(["work.list", "--limit", "20", "--json"]);
    assert.equal(pollWork.code, 0, pollWork.stderr);
    assert.equal(pollWork.parsed.result.work.length, 1);
    const pollHandoffId = pollWork.parsed.result.work[0].id as string;
    const pollClaim = await cli(["work.claim", "--handoff-id", pollHandoffId,
      "--lease-ms", "30000", "--json"]);
    assert.equal(pollClaim.code, 0, pollClaim.stderr);
    const pollEvent = pollClaim.parsed.result.events[0] as IncomingEvent;
    assert.equal(pollEvent.type, "poll-answer");
    if (pollEvent.type !== "poll-answer") throw new Error("missing poll answer");
    assert.equal(pollEvent.answerText, "[Poll response]\nQuestion: Pick?\nSelected: Same");
    assert.equal(pollEvent.correlation, null);
    const pollFence = pollClaim.parsed.result.handoff.claim.fence as number;
    const pollAck = await cli(["work.ack", "--handoff-id", pollHandoffId,
      "--fence", String(pollFence), "--json"]);
    assert.equal(pollAck.code, 0, pollAck.stderr);
  } finally {
    await local?.close();
    await composition.runtime.stop();
  }

  const sendsBeforeRestart = outbound.length;
  const reopened = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory,
    grokRunner: async () => { wakeCalls++; return "accepted"; },
  });
  await reopened.runtime.start();
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(outbound.length, sendsBeforeRestart, "capture replay must not duplicate effects");
    const observer = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
    try {
      assert.equal(observer.listReceipts(reopened.scope).length, 1);
      assert.equal(observer.transaction(tx => tx.listWork(reopened.scope, configuration.local.principalId,
        configuration.task.taskId, configuration.task.generation, now, 20)).length, 0);
    } finally { observer.close(); }
  } finally {
    await reopened.runtime.stop();
  }
  assert.equal(stops, 2);
  assert.equal(wakeCalls, 2, "acknowledged work must not wake again after restart");
});
