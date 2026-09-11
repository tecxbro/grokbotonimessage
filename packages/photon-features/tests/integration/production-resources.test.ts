import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { attachment, resolveContents, type Content, type ContentInput, type Message, type Space } from "spectrum-ts";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import type { Action, OperationResult, ResourceRef } from "../../src/contracts/index.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition } from "../../src/host/production.js";
import { privateTestRoot } from "../helpers/private-temp.js";

async function fixture(t: TestContext, options: { stalledAttachment?: boolean; unknownSend?: boolean } = {}) {
  const root = await privateTestRoot(t, "gpr-");
  const runtime = join(root, "runtime");
  await mkdir(runtime, { mode: 0o700 });
  await Promise.all(["captures", "staging", "imports"].map(name => mkdir(join(runtime, name), { mode: 0o700 })));
  const projectSecretFile = join(runtime, "project-secret"), credentialFile = join(runtime, "local-token");
  await writeFile(projectSecretFile, "secret", { mode: 0o600 });
  await writeFile(credentialFile, "d".repeat(64), { mode: 0o600 });
  const now = 50_000;
  const operations = ["text.stream", "attachment.fetch", "attachment.send", "voice.send", "content.compose", "space.setAvatar"] as const;
  const configuration: ProductionHostConfiguration = {
    version: 2, activation: "enabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1", projectSecretFile,
      accountId: "account-1", lineId: "line-1", phone: "+15555550101",
      conversationId: "conversation-1", dedicated: true, availableOperations: [...operations] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile,
      principalId: "principal-1", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 4, permissions: [...operations],
      issuedAt: 1_000, expiresAt: 100_000, grokAgentId: "agent-1" },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: { administrativeOperations: ["space.setAvatar"], allowedRecipients: [], allowNativeContent: true },
    cards: [], runtime: { statePath: join(runtime, "state.sqlite"), captureDirectory: join(runtime, "captures"),
      stagingDirectory: join(runtime, "staging"), importDirectory: join(runtime, "imports") },
  };
  const sent: Content[] = [];
  let attachmentStreams = 0, constructions = 0;
  let signalAttachmentStarted!: () => void;
  const attachmentStarted = new Promise<void>(resolve => { signalAttachmentStarted = resolve; });
  let attachmentCancelled = false;
  let releaseAttachment: () => void = () => {};
  const png = Buffer.from([137,80,78,71,13,10,26,10, 0,0,0,0]);
  const nativeAttachment = await attachment(png, { id: "native-attachment-1", name: "photo.png", mimeType: "image/png" }).build();
  if (nativeAttachment.type !== "attachment") throw new Error("attachment builder mismatch");
  const space = {
    id: configuration.provider.conversationId, __platform: "imessage", phone: configuration.provider.phone, type: "dm",
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!;
      sent.push(content);
      if (options.unknownSend) return undefined;
      return { id: `sent-${sent.length}`, platform: "imessage", space, content,
        direction: "outbound", timestamp: new Date(now) } as unknown as Message;
    },
    getMessage: async (id: string) => id === "native-message-1" ? parent : undefined,
  } as unknown as Space & { phone: string };
  const parent = { id: "native-message-1", platform: "imessage", space, content: nativeAttachment,
    direction: "inbound", timestamp: new Date(now - 1), sender: undefined } as unknown as Message;
  const sdkFactory = async (): Promise<OwnedSdk> => {
    constructions++;
    let release!: () => void;
    const stopped = new Promise<void>(resolve => { release = resolve; });
    return {
      messages: () => ({ async *[Symbol.asyncIterator]() { await stopped; } }),
      space: async () => space,
      provider: () => ({ getAttachment: async (id: string) => {
        if (id !== nativeAttachment.id) return undefined;
        return { ...nativeAttachment, stream: async () => {
          attachmentStreams++;
          return new ReadableStream<Uint8Array>({
            start(controller) {
              signalAttachmentStarted();
              releaseAttachment = () => { controller.enqueue(png); controller.close(); };
              if (!options.stalledAttachment) releaseAttachment();
            },
            cancel() { attachmentCancelled = true; },
          });
        } };
      } }) as never,
      stop: async () => release(),
    };
  };
  const compose = () => createProductionComposition(configuration, root, root,
    { now: () => now, sdkFactory, grokRunner: async () => "accepted" });
  return { root, runtime, now, configuration, compose, sent, png,
    streams: () => attachmentStreams, constructions: () => constructions,
    attachmentStarted, releaseAttachment: () => releaseAttachment(), attachmentCancelled: () => attachmentCancelled };
}

async function resultOf(
  composition: Awaited<ReturnType<typeof createProductionComposition>>,
  action: Action,
): Promise<OperationResult> {
  const accepted = await composition.runtime.execute(action, composition.principal) as { ok: true; result: OperationResult };
  assert.equal(accepted.ok, true);
  let result = accepted.result;
  for (let count = 0; result.status === "queued" && count < 200; count++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const status = await composition.runtime.status(action.contextId, result.requestId, composition.principal) as { ok: true; result: OperationResult };
    assert.equal(status.ok, true);
    result = status.result;
  }
  return result;
}

function rememberAttachment(
  f: Awaited<ReturnType<typeof fixture>>,
  scope: Awaited<ReturnType<typeof createProductionComposition>>["scope"],
) {
  const message: Extract<ResourceRef, { kind: "message" }> = { version: 1, kind: "message", id: "message-1", scope };
  const media: Extract<ResourceRef, { kind: "attachment" }> = { version: 1, kind: "attachment", id: "attachment-1", messageId: message.id, scope };
  const store = new DurableSQLiteStore(f.configuration.runtime.statePath, () => f.now);
  store.transaction(tx => {
    for (const [reference, providerId] of [[message, "native-message-1"], [media, "native-attachment-1"]] as const)
      tx.put("references", { id: reference.id, scope, revision: 0, reference, providerId,
        ownedByPrincipalId: f.configuration.local.principalId, taskId: f.configuration.task.taskId,
        generation: f.configuration.task.generation }, null);
  });
  store.close();
  return media;
}

test("production native fetch stages once and its durable descriptor sends attachment bytes", async (t) => {
  const f = await fixture(t);
  const bootstrap = await f.compose();
  await bootstrap.runtime.start();
  await bootstrap.runtime.stop();
  const scope = bootstrap.scope;
  const media = rememberAttachment(f, scope);
  const composition = await f.compose();
  await composition.runtime.start();
  try {
    const fetched = await resultOf(composition, { version: 1, idempotencyKey: "fetch-1",
      contextId: f.configuration.task.contextId, operation: "attachment.fetch", arguments: { attachment: media } });
    assert.equal(fetched.status, "executor-completed", JSON.stringify(fetched));
    assert.equal(fetched.value?.type, "media");
    if (fetched.value?.type !== "media" || !fetched.value.media) throw new Error("missing staged media");
    const sent = await resultOf(composition, { version: 1, idempotencyKey: "send-1",
      contextId: f.configuration.task.contextId, operation: "attachment.send",
      arguments: { space: { version: 1, kind: "space", id: scope.spaceId, scope }, media: fetched.value.media } });
    assert.equal(sent.status, "provider-accepted", JSON.stringify(sent));
    assert.equal((await resultOf(composition, { version: 1, idempotencyKey: "send-1",
      contextId: f.configuration.task.contextId, operation: "attachment.send",
      arguments: { space: { version: 1, kind: "space", id: scope.spaceId, scope }, media: fetched.value.media } })).status,
    "provider-accepted");
    assert.equal(f.streams(), 1);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent.at(-1)?.type, "attachment");
  } finally { await composition.runtime.stop(); }
});

test("authenticated generated-file import feeds voice and shared media consumers", async (t) => {
  const f = await fixture(t);
  const wav = Buffer.alloc(44); wav.write("RIFF", 0, "ascii"); wav.write("WAVE", 8, "ascii");
  await writeFile(join(f.runtime, "imports", "voice.wav"), wav, { mode: 0o600 });
  const composition = await f.compose();
  const forged = { ...composition.principal, credentialId: "other" };
  await assert.rejects(composition.importMediaFile(forged, "voice.wav", { mimeType: "audio/wav" }), /FORBIDDEN/);
  const media = await composition.importMediaFile(composition.principal, "voice.wav",
    { mimeType: "audio/wav", name: "voice.wav", duration: 1.5 });
  await composition.runtime.start();
  await composition.runtime.stop();
  const reopened = await f.compose();
  await reopened.runtime.start();
  try {
    const result = await resultOf(reopened, { version: 1, idempotencyKey: "voice-1",
      contextId: f.configuration.task.contextId, operation: "voice.send",
      arguments: { space: { version: 1, kind: "space", id: reopened.scope.spaceId, scope: reopened.scope }, media } });
    assert.equal(result.status, "provider-accepted", JSON.stringify(result));
    assert.equal(f.sent.at(-1)?.type, "voice");
  } finally { await reopened.runtime.stop(); }
});

test("forged and tampered descriptors fail while composed content uses the same guarded port", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.runtime, "imports", "photo.png"), f.png, { mode: 0o600 });
  const composition = await f.compose();
  await assert.rejects(composition.importMediaFile(composition.principal, "../photo.png", { mimeType: "image/png" }),
    /FORBIDDEN/);
  const media = await composition.importMediaFile(composition.principal, "photo.png", { mimeType: "image/png", name: "photo.png" });
  const space = { version: 1 as const, kind: "space" as const, id: composition.scope.spaceId, scope: composition.scope };
  await composition.runtime.start();
  try {
    const forged = await composition.runtime.execute({ version: 1, idempotencyKey: "forged-media",
      contextId: f.configuration.task.contextId, operation: "attachment.send",
      arguments: { space, media: { ...media, sha256: "b".repeat(64) } } }, composition.principal);
    assert.equal(forged.ok, false, JSON.stringify(forged));
    assert.equal(f.sent.length, 0);
    const composed = await resultOf(composition, { version: 1, idempotencyKey: "composed-media",
      contextId: f.configuration.task.contextId, operation: "content.compose",
      arguments: { space, content: { type: "compose", items: [{ type: "text", text: "photo" },
        { type: "attachment", media }] } } });
    assert.equal(composed.status, "provider-accepted", JSON.stringify(composed));
    assert.equal(f.sent.length, 2);
    const store = new DurableSQLiteStore(f.configuration.runtime.statePath, () => f.now);
    const row = store.transaction(tx => tx.get("stagedMedia", media.stagingId))!;
    store.close();
    await writeFile(join(f.configuration.runtime.stagingDirectory, row.relativePath), Buffer.from("tampered"), { mode: 0o600 });
    const tampered = await resultOf(composition, { version: 1, idempotencyKey: "tampered-media",
      contextId: f.configuration.task.contextId, operation: "attachment.send", arguments: { space, media } });
    assert.equal(tampered.status, "blocked", JSON.stringify(tampered));
    assert.equal(f.sent.length, 2);
  } finally { await composition.runtime.stop(); }
});

test("production stream registration reserves once, buffers honestly, replays without reopening, and survives restart closed", async (t) => {
  const f = await fixture(t);
  const composition = await f.compose();
  let opens = 0;
  const source = { async *[Symbol.asyncIterator]() { opens++; yield "Hello "; yield "world"; } };
  const ref = await composition.registerTextStream(composition.principal, source, f.now + 10_000);
  await composition.runtime.start();
  const action = { version: 1 as const, idempotencyKey: "stream-1", contextId: f.configuration.task.contextId,
    operation: "text.stream" as const,
    arguments: { space: { version: 1 as const, kind: "space" as const, id: composition.scope.spaceId, scope: composition.scope }, stream: ref } };
  try {
    const firstResult = await resultOf(composition, action);
    assert.equal(firstResult.status, "provider-accepted", JSON.stringify(firstResult));
    assert.equal((await resultOf(composition, action)).status, "provider-accepted");
    assert.equal(opens, 1);
    assert.deepEqual(f.sent.filter(item => item.type === "text").map(item => item.type === "text" && item.text), ["hello world"]);
  } finally { await composition.runtime.stop(); }
  const reopened = await f.compose();
  await reopened.runtime.start();
  try {
    assert.equal((await resultOf(reopened, action)).status, "provider-accepted");
    assert.equal(opens, 1);
  } finally { await reopened.runtime.stop(); }
});

test("registered stream without its post-restart source fails explicitly and is not reopened", async (t) => {
  const f = await fixture(t);
  const first = await f.compose();
  const ref = await first.registerTextStream(first.principal, (async function* () { yield "lost"; })(), f.now + 10_000);
  await first.runtime.start();
  await first.runtime.stop();
  const second = await f.compose();
  await second.runtime.start();
  try {
    const result = await resultOf(second, { version: 1, idempotencyKey: "missing-source",
      contextId: f.configuration.task.contextId, operation: "text.stream",
      arguments: { space: { version: 1, kind: "space", id: second.scope.spaceId, scope: second.scope }, stream: ref } });
    assert.equal(result.status, "failed", JSON.stringify(result));
    assert.equal(result.error?.retry, "never");
  } finally { await second.runtime.stop(); }
});

test("production stream registration rejects wrong owner/expiry and one reservation excludes concurrent requests", async (t) => {
  const f = await fixture(t);
  const composition = await f.compose();
  await assert.rejects(composition.registerTextStream({ ...composition.principal, id: "other" },
    (async function* () { yield "no"; })(), f.now + 10_000), /FORBIDDEN/);
  await assert.rejects(composition.registerTextStream(composition.principal,
    (async function* () { yield "late"; })(), f.now), /CONTEXT_EXPIRED/);
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  const source = { [Symbol.asyncIterator]() { return {
    next: () => { signalStarted(); return new Promise<IteratorResult<string>>(() => {}); },
    return: async () => ({ done: true as const, value: undefined }),
  }; } };
  const ref = await composition.registerTextStream(composition.principal, source, f.now + 10_000);
  const space = { version: 1 as const, kind: "space" as const, id: composition.scope.spaceId, scope: composition.scope };
  const first: Action = { version: 1, idempotencyKey: "stream-owner", contextId: f.configuration.task.contextId,
    operation: "text.stream", arguments: { space, stream: ref } };
  await composition.runtime.start();
  try {
    const submitted = await composition.runtime.execute(first, composition.principal) as { ok: true; result: OperationResult };
    await started;
    const concurrent = await composition.runtime.execute({ ...first, idempotencyKey: "stream-other-request" }, composition.principal);
    assert.equal(concurrent.ok, false);
    await composition.executor.dispatch({ version: 1, method: "request.cancel", contextId: first.contextId,
      requestId: submitted.result.requestId }, composition.principal);
    assert.equal((await resultOf(composition, first)).status, "cancelled");
  } finally { await composition.runtime.stop(); }
});

for (const mode of ["invalid", "failed", "oversized", "deadline"] as const) {
  test(`production stream ${mode} source fails before send`, async (t) => {
    const f = await fixture(t);
    const composition = await f.compose();
    const source: AsyncIterable<string> = mode === "invalid"
      ? { async *[Symbol.asyncIterator]() { yield 7 as unknown as string; } }
      : mode === "failed" ? { async *[Symbol.asyncIterator]() { throw new Error("producer failed"); } }
      : mode === "oversized" ? { async *[Symbol.asyncIterator]() { yield "x".repeat(16_001); } }
      : { [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<string>>(() => {}),
        return: async () => ({ done: true as const, value: undefined }) }; } };
    const ref = await composition.registerTextStream(composition.principal, source,
      f.now + (mode === "deadline" ? 20 : 10_000));
    const action: Action = { version: 1, idempotencyKey: `stream-${mode}`,
      contextId: f.configuration.task.contextId, operation: "text.stream",
      arguments: { space: { version: 1, kind: "space", id: composition.scope.spaceId, scope: composition.scope }, stream: ref } };
    await composition.runtime.start();
    try {
      const result = await resultOf(composition, action);
      assert.ok(["failed", "blocked", "cancelled"].includes(result.status), JSON.stringify(result));
      assert.notEqual(result.status, "unknown-outcome");
      assert.equal(f.sent.length, 0);
    } finally { await composition.runtime.stop(); }
  });
}

test("durable cancellation aborts stalled production stream work before provider dispatch", async (t) => {
  const f = await fixture(t);
  const composition = await f.compose();
  let signalStarted!: () => void, closed = false;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  const source = { [Symbol.asyncIterator]() { return {
    next: () => { signalStarted(); return new Promise<IteratorResult<string>>(() => {}); },
    return: async () => { closed = true; return { done: true as const, value: undefined }; },
  }; } };
  const ref = await composition.registerTextStream(composition.principal, source, f.now + 10_000);
  const action: Action = { version: 1, idempotencyKey: "cancel-stream", contextId: f.configuration.task.contextId,
    operation: "text.stream", arguments: { space: { version: 1, kind: "space", id: composition.scope.spaceId,
      scope: composition.scope }, stream: ref } };
  await composition.runtime.start();
  try {
    const submitted = await composition.runtime.execute(action, composition.principal) as { ok: true; result: OperationResult };
    await started;
    await composition.executor.dispatch({ version: 1, method: "request.cancel", contextId: action.contextId,
      requestId: submitted.result.requestId }, composition.principal);
    const result = await resultOf(composition, action);
    assert.equal(result.status, "cancelled", JSON.stringify(result));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, true);
    assert.equal(f.sent.length, 0);
  } finally { await composition.runtime.stop(); }
});

test("durable cancellation aborts stalled production attachment retrieval before provider dispatch", async (t) => {
  const f = await fixture(t, { stalledAttachment: true });
  const bootstrap = await f.compose();
  await bootstrap.runtime.start();
  await bootstrap.runtime.stop();
  const media = rememberAttachment(f, bootstrap.scope);
  const composition = await f.compose();
  const action: Action = { version: 1, idempotencyKey: "cancel-media", contextId: f.configuration.task.contextId,
    operation: "attachment.fetch", arguments: { attachment: media } };
  await composition.runtime.start();
  try {
    const submitted = await composition.runtime.execute(action, composition.principal) as { ok: true; result: OperationResult };
    await f.attachmentStarted;
    await composition.executor.dispatch({ version: 1, method: "request.cancel", contextId: action.contextId,
      requestId: submitted.result.requestId }, composition.principal);
    const result = await resultOf(composition, action);
    assert.equal(result.status, "cancelled", JSON.stringify(result));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.attachmentCancelled(), true);
    assert.equal(f.sent.length, 0);
  } finally { await composition.runtime.stop(); }
});

test("durable revocation during production media resolution fences the provider send", async (t) => {
  const f = await fixture(t, { stalledAttachment: true });
  const bootstrap = await f.compose();
  await bootstrap.runtime.start();
  await bootstrap.runtime.stop();
  const media = rememberAttachment(f, bootstrap.scope);
  const composition = await f.compose();
  const action: Action = { version: 1, idempotencyKey: "revoke-media", contextId: f.configuration.task.contextId,
    operation: "attachment.send", arguments: { space: { version: 1, kind: "space", id: composition.scope.spaceId,
      scope: composition.scope }, media } };
  await composition.runtime.start();
  const observer = new DurableSQLiteStore(f.configuration.runtime.statePath, () => f.now);
  try {
    const submitted = await composition.runtime.execute(action, composition.principal) as { ok: true; result: OperationResult };
    await f.attachmentStarted;
    observer.transaction(tx => {
      const row = tx.get("contexts", f.configuration.task.contextId)!;
      tx.put("contexts", { ...row, revision: row.revision + 1,
        context: { ...row.context, revokedAt: f.now } }, row.revision);
    });
    f.releaseAttachment();
    let result = submitted.result;
    for (let count = 0; result.status === "queued" && count < 200; count++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      result = observer.transaction(tx => tx.get("outbox", submitted.result.requestId))!.result;
    }
    assert.equal(result.status, "blocked", JSON.stringify(result));
    assert.equal(result.error?.code, "CONTEXT_REVOKED");
    assert.equal(f.sent.length, 0);
  } finally { observer.close(); await composition.runtime.stop(); }
});

test("ambiguous production media outcome is durable and never blindly resent", async (t) => {
  const f = await fixture(t, { unknownSend: true });
  await writeFile(join(f.runtime, "imports", "photo.png"), f.png, { mode: 0o600 });
  const composition = await f.compose();
  const media = await composition.importMediaFile(composition.principal, "photo.png", { mimeType: "image/png" });
  const action: Action = { version: 1, idempotencyKey: "unknown-media", contextId: f.configuration.task.contextId,
    operation: "attachment.send", arguments: { space: { version: 1, kind: "space", id: composition.scope.spaceId,
      scope: composition.scope }, media } };
  await composition.runtime.start();
  try {
    assert.equal((await resultOf(composition, action)).status, "unknown-outcome");
    assert.equal((await resultOf(composition, action)).status, "unknown-outcome");
    assert.equal(f.sent.length, 1);
  } finally { await composition.runtime.stop(); }
});
