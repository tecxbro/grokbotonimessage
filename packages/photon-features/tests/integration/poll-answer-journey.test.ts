import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { resolveContents, type Content, type ContentInput, type Message, type Space } from "spectrum-ts";
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
    for (const waiter of this.waiters.splice(0))
      waiter({ value: undefined, done: true });
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
  return {
    stream: { write: (part: string) => { value += part; return true; } },
    value: () => value,
  };
};

async function waitUntil(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`timeout waiting for ${label}`);
}

type Cli = (args: string[], input?: unknown) => Promise<{code: number; parsed: any; stderr: string}>;
type Settle = (action: Action) => Promise<OperationResult>;

async function createHarness(
  t: TestContext,
  name: string,
  onWake: (tools: {cli: Cli; settle: Settle}) => Promise<"accepted" | "failed" | "unknown">,
) {
  const root = await privateTestRoot(t, name);
  const runtimeDirectory = join(root, "runtime");
  await Promise.all(["captures", "staging", "imports"].map(directory =>
    mkdir(join(runtimeDirectory, directory), { recursive: true, mode: 0o700 })));
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  await writeFile(projectSecretFile, "fixture-project-secret", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  let now = Date.parse("2026-09-12T12:00:00.000Z");
  const operations = ["poll.create", "text.send"] as const;
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
      importDirectory: join(runtimeDirectory, "imports"),
    },
  };

  const queue = new MessageQueue();
  const streams: MessageQueue[] = [];
  const outbound: Content[] = [];
  const messages = new Map<string, Message>();
  const reports: string[] = [];
  let constructions = 0;
  let listeners = 0;
  let stops = 0;
  let wakeCalls = 0;
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
  const sdkFactory = async (): Promise<OwnedSdk> => {
    constructions++;
    const stream = constructions === 1 ? queue : new MessageQueue();
    streams.push(stream);
    return {
      messages: () => { listeners++; return stream; },
      space: async () => space,
      provider: () => ({ space: {} }) as never,
      stop: async () => { stops++; stream.close(); },
    };
  };
  const env = {
    GROK_PHOTON_CONTEXT_ID: configuration.task.contextId,
    GROK_PHOTON_SOCKET: configuration.local.socketPath,
    GROK_PHOTON_CREDENTIAL_FILE: credentialFile,
  };
  const cli: Cli = async (args, input) => {
    const stdout = output();
    const stderr = output();
    const code = await run(args, env,
      Readable.from(input === undefined ? [] : [JSON.stringify(input)]),
      stdout.stream, stderr.stream);
    return { code, parsed: JSON.parse(stdout.value()), stderr: stderr.value() };
  };
  const settle: Settle = async action => {
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
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory,
    report: code => reports.push(code),
    grokCommandStyle: "gateway-flag",
    grokRunner: async () => { wakeCalls++; return onWake({cli, settle}); },
  });
  await composition.runtime.start();
  const local = await composition.startLocalInterface();
  let active = true;
  const stop = async () => {
    if (!active) return;
    active = false;
    await local.close();
    await composition.runtime.stop();
  };
  t.after(stop);
  return {
    root, runtimeDirectory, configuration, composition, queue, streams, outbound,
    reports, space, sdkFactory, cli, settle, stop,
    counts: () => ({ constructions, listeners, stops, wakeCalls }),
    now: () => now,
    setNow(value: number) { now = value; },
  };
}

function pollAnswer(
  space: Space,
  input: {id: string; option: string; selected: boolean; at: number; question?: string; sender?: string},
): Message {
  return {
    id: input.id,
    platform: "imessage",
    space,
    content: {
      type: "poll_option",
      title: input.option,
      option: { title: input.option },
      ...(input.question === undefined ? {} : {
        poll: { type: "poll", title: input.question,
          options: [{ title: input.option }, { title: "Other" }] },
      }),
      selected: input.selected,
    },
    direction: "inbound",
    timestamp: new Date(input.at),
    sender: input.sender === undefined ? undefined : { id: input.sender },
  } as unknown as Message;
}

test("default production composition sends one explicit poll and Grok claims its conversational answer", async t => {
  let claimed: Extract<IncomingEvent, {type: "poll-answer"}> | undefined;
  let completed!: () => void;
  const done = new Promise<void>(resolve => { completed = resolve; });
  const h = await createHarness(t, "pa-", async ({cli, settle}) => {
    try {
      const listed = await cli(["work.list", "--limit", "20", "--json"]);
      assert.equal(listed.code, 0, listed.stderr);
      const handoffId = listed.parsed.result.work[0].id as string;
      const result = await cli(["work.claim", "--handoff-id", handoffId, "--lease-ms", "30000", "--json"]);
      assert.equal(result.code, 0, result.stderr);
      const event = result.parsed.result.events[0] as IncomingEvent;
      assert.equal(event.type, "poll-answer");
      if (event.type !== "poll-answer") throw new Error("missing poll answer");
      claimed = event;
      const spaceRef: Extract<ResourceRef, {kind: "space"}> = {
        version: 1, kind: "space", id: event.scope.spaceId, scope: event.scope,
      };
      const sent = await settle({
        version: 1, contextId: h.configuration.task.contextId,
        idempotencyKey: "answer-understood", operation: "text.send",
        arguments: { space: spaceRef, text: "Got it. I'll continue with red." },
      });
      assert.equal(sent.status, "provider-accepted");
      const fence = result.parsed.result.handoff.claim.fence as number;
      const ack = await cli(["work.ack", "--handoff-id", handoffId, "--fence", String(fence), "--json"]);
      assert.equal(ack.code, 0, ack.stderr);
    } finally {
      completed();
    }
    return "accepted";
  });

  const spaceRef: Extract<ResourceRef, {kind: "space"}> = {
    version: 1, kind: "space", id: h.composition.scope.spaceId, scope: h.composition.scope,
  };
  const action: Action = {
    version: 1,
    contextId: h.configuration.task.contextId,
    idempotencyKey: "explicit-poll",
    operation: "poll.create",
    arguments: { space: spaceRef, question: "Which color?", options: [
      { key: "red", label: "Red" }, { key: "blue", label: "Blue" },
    ] },
  };
  assert.equal((await h.settle(action)).status, "provider-accepted");
  assert.equal((await h.settle(action)).status, "provider-accepted");
  assert.equal(h.outbound.length, 1, "idempotent replay must not create a second poll");
  const created = h.outbound[0];
  assert.equal(created?.type, "poll");
  if (created?.type !== "poll") throw new Error("poll was not sent");
  assert.equal(created.title, "Which color?");
  assert.deepEqual(created.options.map(option => option.title), ["Red", "Blue"]);

  const inbound = pollAnswer(h.space, {
    id: "provider-vote-red-1", option: "Red", selected: true,
    question: "Which color?", sender: "+15555550999", at: Date.parse("2026-09-12T12:00:01.000Z"),
  });
  h.queue.push([h.space, inbound]);
  await Promise.race([done, new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Grok boundary timeout")), 5_000))]);
  assert.equal(claimed?.answerText, "[Poll response]\nQuestion: Which color?\nSelected: Red");
  assert.equal(claimed?.correlation, null);
  assert.deepEqual(h.counts(), { constructions: 1, listeners: 1, stops: 0, wakeCalls: 1 });
  assert.equal(h.outbound.filter(content => content.type === "poll").length, 1);
  assert.equal(h.outbound.filter(content => content.type === "text").length, 1);

  h.queue.push([h.space, inbound]);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await h.cli(["work.list", "--limit", "20", "--json"])).parsed.result.work.length, 0);
  assert.equal(h.counts().wakeCalls, 1, "duplicate delivery must not create another handoff");
  await h.stop();

  const reopened = await createProductionComposition(h.configuration, h.root, h.root, {
    now: h.now,
    sdkFactory: h.sdkFactory,
    grokCommandStyle: "gateway-flag",
    grokRunner: async () => { throw new Error("acknowledged capture replay must not wake"); },
  });
  await reopened.runtime.start();
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    const observer = new DurableSQLiteStore(h.configuration.runtime.statePath);
    try {
      assert.equal(observer.transaction(tx => tx.listWork(reopened.scope,
        h.configuration.local.principalId, h.configuration.task.taskId,
        h.configuration.task.generation, Date.now(), 20)).length, 0);
    } finally { observer.close(); }
    assert.equal(h.outbound.filter(content => content.type === "poll").length, 1,
      "restart recovery must not resend the poll");
  } finally {
    await reopened.runtime.stop();
  }
});

test("production poll answers preserve deltas and reject foreign or unauthorized input without stopping reception", async t => {
  const h = await createHarness(t, "ps-", async () => "accepted");
  const base = Date.parse("2026-09-12T12:10:00.000Z");
  const foreignLine = { ...h.space, phone: "+15555550102" } as unknown as Space;
  const foreignConversation = { ...h.space, id: "conversation-foreign" } as unknown as Space;
  h.queue.push([foreignLine, pollAnswer(foreignLine, {
    id: "wrong-line", option: "Same", selected: true, question: "Wrong?", sender: "actor", at: base,
  })]);
  h.queue.push([foreignConversation, pollAnswer(foreignConversation, {
    id: "wrong-conversation", option: "Same", selected: true, question: "Wrong?", sender: "actor", at: base + 1,
  })]);
  h.queue.push([h.space, pollAnswer(h.space, {
    id: "missing-sender", option: "Same", selected: true, question: "Q1", at: base + 2,
  })]);
  const malformed = pollAnswer(h.space, {
    id: "malformed", option: "Same", selected: true, question: "Q1", sender: "actor", at: base + 3,
  }) as unknown as {content: {title: string}};
  malformed.content.title = "Different";
  h.queue.push([h.space, malformed as unknown as Message]);

  const accepted = [
    { id: "select-1", option: "Same", selected: true, question: "Q1", at: base + 10 },
    { id: "deselect-1", option: "Same", selected: false, question: "Q1", at: base + 11 },
    { id: "select-2", option: "Same", selected: true, question: "Q1", at: base + 12 },
    { id: "multiple", option: "Other", selected: true, question: "Q1", at: base + 13 },
    { id: "duplicate-label-other-poll", option: "Same", selected: true, question: "Q2", at: base + 14 },
    { id: "unknown-question", option: "Same", selected: false, at: base + 15 },
  ].map(input => pollAnswer(h.space, { ...input, sender: "actor" }));
  for (const message of accepted) h.queue.push([h.space, message]);
  h.queue.push([h.space, accepted[0]!]);

  await waitUntil(async () =>
    (await h.cli(["work.list", "--limit", "20", "--json"])).parsed.result.work.length === accepted.length,
  "all poll-answer handoffs");
  const listed = await h.cli(["work.list", "--limit", "20", "--json"]);
  const answers: Extract<IncomingEvent, {type: "poll-answer"}>[] = [];
  for (const work of listed.parsed.result.work as Array<{id: string}>) {
    const claim = await h.cli(["work.claim", "--handoff-id", work.id, "--lease-ms", "30000", "--json"]);
    assert.equal(claim.code, 0, claim.stderr);
    const event = claim.parsed.result.events[0] as IncomingEvent;
    assert.equal(event.type, "poll-answer");
    if (event.type !== "poll-answer") throw new Error("missing poll answer");
    answers.push(event);
    const fence = claim.parsed.result.handoff.claim.fence as number;
    assert.equal((await h.cli(["work.ack", "--handoff-id", work.id,
      "--fence", String(fence), "--json"])).code, 0);
  }
  assert.equal(new Set(answers.map(answer => answer.eventId)).size, accepted.length);
  assert.equal(answers.filter(answer => answer.selected).length, 4);
  assert.equal(answers.filter(answer => !answer.selected).length, 2);
  assert.ok(answers.some(answer => answer.question === "Q2" && answer.optionText === "Same"));
  assert.ok(answers.every(answer => answer.correlation === null && answer.targets.length === 0),
    "questions and duplicate labels must not be promoted to native correlation");
  assert.ok(answers.some(answer => answer.question === null && answer.answerText.includes("not identified")));
  assert.equal(h.outbound.length, 0, "a tap alone must not auto-send provider content");
  assert.equal(h.reports.includes("RECEIVE_FAILED"), false,
    "foreign and malformed events must not terminate the one receiver");

  const state = new DurableSQLiteStore(h.configuration.runtime.statePath);
  try {
    assert.ok(state.scan("unresolved").length >= 2,
      "senderless and malformed authorized-conversation captures stay unresolved");
    state.transaction(tx => {
      const task = tx.get("tasks", h.configuration.task.taskId)!;
      tx.put("tasks", { ...task, cancelledAt: base + 20, revision: task.revision + 1 }, task.revision);
    });
  } finally { state.close(); }
  h.queue.push([h.space, pollAnswer(h.space, {
    id: "denied-after-cancel", option: "Same", selected: true,
    question: "Q1", sender: "actor", at: base + 21,
  })]);
  await waitUntil(() =>
    h.reports.filter(code => code === "UNRESOLVED_ROUTE").length >= 3,
  "denied cancelled-task poll answer");
  const observer = new DurableSQLiteStore(h.configuration.runtime.statePath);
  try {
    assert.equal(observer.scan("handoffs").length, accepted.length,
      "denied task input must not create unauthorized work");
  } finally { observer.close(); }
  assert.equal(h.reports.includes("RECEIVE_FAILED"), false);
  assert.equal(h.counts().constructions, 1);
  assert.equal(h.counts().listeners, 1);
  assert.equal(h.counts().stops, 0);
});
