import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Action, OperationResult, ResourceRef } from "../../src/contracts/index.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition, type ProductionComposition } from "../../src/host/production.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import { authenticateInteraction, createInteractionAdapter } from "../../src/features/cards/interaction-adapter.js";
import { CardRuntime } from "../../src/features/cards/operations.js";
import { applyCardInteraction } from "../../src/features/cards/reducer.js";
import { encodeCardSession, decodeSession, type CardSession } from "../../src/features/cards/session-codec.js";
import { createExecutionServices } from "../../src/runtime/core/execution-services.js";
import { FakeSpace, fixture as legacyFixture } from "../lanes/wt-06/fixture.js";
import { publicFixture } from "../lanes/wt-06/unit.test.js";
import { context as runtimeContext, fixture as runtimeFixture, noNetwork, scope as runtimeScope } from "../lanes/wt-01/fixture.js";
import { privateTestRoot } from "../helpers/private-temp.js";

type RuntimeResponse =
  | { version: 1; ok: true; result: OperationResult }
  | { version: 1; ok: false; error: { code: string } };

async function settle(composition: ProductionComposition, action: Action): Promise<OperationResult> {
  const submitted = await composition.runtime.execute(action, composition.principal) as RuntimeResponse;
  assert.equal(submitted.ok, true, JSON.stringify(submitted));
  if (!submitted.ok) throw new Error("production submit rejected");
  let result = submitted.result;
  for (let attempt = 0; result.status === "queued" && attempt < 200; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const status = await composition.runtime.status(
      composition.context.contextId,
      result.requestId,
      composition.principal,
    ) as RuntimeResponse;
    assert.equal(status.ok, true, JSON.stringify(status));
    if (!status.ok) throw new Error("production status rejected");
    result = status.result;
  }
  assert.notEqual(result.status, "queued", "production card request did not settle");
  return result;
}

test("prepared production binding preserves admission revision and original card across two void edits", async t => {
  const root = await privateTestRoot(t, "repair-cards-");
  const runtimeDirectory = join(root, "runtime");
  await mkdir(runtimeDirectory, { mode: 0o700 });
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  await writeFile(projectSecretFile, "fixture-project-secret", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });

  const native = new FakeSpace();
  const now = Date.now();
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: {
      kind: "spectrum-cloud-imessage",
      projectId: "project-1",
      projectSecretFile,
      accountId: "account-1",
      lineId: "line-1",
      phone: native.phone,
      conversationId: native.id,
      dedicated: true,
      availableOperations: ["app.sendCustomized", "app.update"],
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
      permissions: ["app.sendCustomized", "app.update"],
      issuedAt: now - 1_000,
      expiresAt: now + 60_000,
      grokAgentId: "grok-agent",
    },
    grok: { executable: "/usr/bin/false", timeoutMs: 1_000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [{
      id: "fixture-card",
      kind: "customized",
      origins: ["https://fixture.invalid"],
      extension: {
        appName: "Fixture",
        teamId: "TESTTEAM01",
        extensionBundleId: "invalid.fixture.messages",
      },
    }],
    runtime: {
      statePath: join(runtimeDirectory, "state.sqlite"),
      captureDirectory: join(runtimeDirectory, "captures"),
      stagingDirectory: join(runtimeDirectory, "staging"),
    },
  };

  let stopStream!: () => void;
  const stopped = new Promise<void>(resolve => { stopStream = resolve; });
  const sdk: OwnedSdk = {
    messages: () => ({ async *[Symbol.asyncIterator]() { await stopped; } }),
    space: async () => native,
    provider: () => ({ space: {}, getMembers: async () => [], getAttachment: async () => undefined }) as never,
    stop: async () => stopStream(),
  };
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory: async () => sdk,
    grokRunner: async () => "accepted",
  });

  try {
    await composition.runtime.start();
    const capabilities = await composition.executor.dispatch({
      version: 1,
      method: "capabilities",
      contextId: composition.context.contextId,
    }, composition.principal) as { ok: true; result: Array<{ operation: string; availability: { conversation: string }; blockers: string[] }> };
    const sendCapability = capabilities.result.find(capability => capability.operation === "app.sendCustomized");
    assert.equal(sendCapability?.availability.conversation, "available", JSON.stringify(sendCapability));
    const space: Extract<ResourceRef, { kind: "space" }> = {
      version: 1,
      kind: "space",
      id: composition.scope.spaceId,
      scope: composition.scope,
    };
    const send: Action = {
      version: 1,
      contextId: composition.context.contextId,
      idempotencyKey: "repair-card-send",
      operation: "app.sendCustomized",
      arguments: {
        space,
        templateId: "fixture-card",
        url: "https://fixture.invalid/card",
        layout: { caption: "Preparing" },
      },
    };
    const sent = await settle(composition, send);
    assert.equal(sent.status, "provider-accepted", JSON.stringify({ sent, calls: native.calls }));
    const card = sent.references.find((ref): ref is Extract<ResourceRef, { kind: "card" }> => ref.kind === "card");
    const session = sent.references.find((ref): ref is Extract<ResourceRef, { kind: "card-session" }> => ref.kind === "card-session");
    assert.ok(card && session);
    const original = [...native.messages.values()][0]!;

    const firstUpdate: Action = {
      version: 1,
      contextId: composition.context.contextId,
      idempotencyKey: "repair-card-update-1",
      operation: "app.update",
      arguments: { card, session, layout: { caption: "Ready" } },
    };
    const first = await settle(composition, firstUpdate);
    assert.equal(first.status, "executor-completed");
    assert.deepEqual(first.value, { type: "void" });

    const secondUpdate: Action = {
      ...firstUpdate,
      idempotencyKey: "repair-card-update-2",
      arguments: { card, session, layout: { caption: "Collected" } },
    };
    const second = await settle(composition, secondUpdate);
    assert.equal(second.status, "executor-completed");
    assert.deepEqual(second.value, { type: "void" });

    const replay = await settle(composition, firstUpdate);
    assert.deepEqual(replay, first);
    assert.equal(native.messages.size, 1);
    assert.equal(native.calls.length, 3);
    for (const edit of native.calls.slice(1)) {
      assert.equal(edit.type, "edit");
      if (edit.type === "edit") assert.equal(edit.target, original);
    }
  } finally {
    await composition.runtime.stop();
  }
});

test("same admitted revision serializes once and a cold runtime never refreshes or replaces it", async () => {
  const f = publicFixture();
  const sent = await f.execute(f.send());
  const first = f.update(sent, 0);
  const second = f.update(sent, 0);
  const results = await Promise.all([f.execute(first), f.execute(second)]);
  assert.deepEqual(results.map(result => result.status), ["executor-completed", "failed"]);
  assert.equal(results[1]!.error?.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.native.calls.length, 2);

  const cold = new CardRuntime(f.options);
  const restarted = await f.execute(f.update(sent, 2), cold);
  assert.equal(restarted.error?.blockerId, "requires_original_session");
  assert.equal(f.native.calls.length, 2);
});

test("callback availability stays false without an actual backend contract", async t => {
  const f = publicFixture();
  const legacy = legacyFixture();
  t.after(() => legacy.close());
  const sent = await f.execute(f.send());
  const data = decodeSession(f.snapshot(sent));
  const request = { body: new Uint8Array([1]), headers: {} };
  await assert.rejects(authenticateInteraction(request), /not configured/);
  const adapter = createInteractionAdapter({
    transactions: legacy.s.transactions,
    clock: legacy.clock,
    wake: { wake: async () => { throw new Error("must not wake"); } },
  });
  assert.deepEqual(await adapter.accept(request), {
    status: "blocked",
    blockerId: "app_backend_contract_missing",
  });
  assert.ok(data.callback, "fixture session demonstrates only the internal binding shape");
  assert.equal(f.continuations.length, 0);
});

test("test-double authenticated interaction commits through the real public SQLite transaction", async t => {
  const f = runtimeFixture(t);
  const context = { ...runtimeContext, permissions: ["app.update" as const] };
  const message = { version: 1, kind: "message", id: "callback-message", scope: runtimeScope } as const;
  const card = { version: 1, kind: "card", id: "callback-card", messageId: message.id, scope: runtimeScope } as const;
  const session = { version: 1, kind: "card-session", id: "callback-session", cardId: card.id, scope: runtimeScope } as const;
  const expiresAt = f.clock.now() + 5_000;
  const data: CardSession = {
    version: 1,
    sdkVersion: "12.8.0",
    card,
    session,
    message,
    providerMessageId: "native-callback-card",
    templateId: "callback-template",
    kind: "customized",
    taskId: context.taskId,
    principalId: context.principalId,
    generation: context.generation,
    cardRevision: 0,
    url: "https://fixture.invalid/card",
    phase: "ready",
    metadata: {
      chatGuid: runtimeScope.spaceId,
      messageGuid: "native-callback-card",
      sessionId: "native-session",
      targetMessageGuid: "native-callback-card",
    },
    callback: {
      backendContractId: "test-backend-v1",
      nonce: "test-nonce",
      participantIds: ["participant-1"],
      actionIds: ["confirm"],
      expiresAt,
    },
  };
  f.store.transaction(tx => {
    const prior = tx.get("contexts", context.contextId)!;
    tx.put("contexts", { ...prior, revision: prior.revision + 1, context }, prior.revision);
    for (const reference of [message, card, session]) tx.put("references", {
      id: reference.id,
      scope: runtimeScope,
      revision: 0,
      reference,
      providerId: data.providerMessageId,
      ownedByPrincipalId: context.principalId,
      taskId: context.taskId,
      generation: context.generation,
    }, null);
    tx.put("cards", { id: card.id, scope: runtimeScope, revision: 0, reference: card, templateId: data.templateId }, null);
    tx.put("sessions", { id: session.id, scope: runtimeScope, revision: 0, reference: session,
      allowedActionIds: ["confirm"], expiresAt, generation: context.generation }, null);
  });
  const action: Action = {
    version: 1,
    contextId: context.contextId,
    idempotencyKey: "callback-execution",
    operation: "app.update",
    arguments: { card, session, layout: { caption: "unused callback claim" } },
  };
  const queued = await f.submission.submit(action, context);
  const claim = f.claims.acquire(queued.requestId, "callback-worker", 30_000);
  assert.ok(claim);
  const committedPointers: string[] = [];
  const services = createExecutionServices({
    claims: f.claims,
    requestId: queued.requestId,
    claim,
    controller: new AbortController(),
    deadlineMs: 1_000,
    resources: noNetwork.resources,
    media: noNetwork.media,
    streams: noNetwork.streams,
    afterCommit: pointer => committedPointers.push(pointer.handoffId),
  });
  const assertion = await authenticateInteraction({ body: new Uint8Array([1]), headers: {} }, {
    id: "test-backend-v1",
    source: "test-double:repair-cards-v1",
    authenticate: async () => ({
      version: 1,
      eventId: "callback-event-1",
      session,
      scope: runtimeScope,
      taskId: context.taskId,
      generation: context.generation,
      participantId: "participant-1",
      nonce: "test-nonce",
      actionId: "confirm",
      selection: ["yes"],
      occurredAt: f.clock.now(),
    }),
  });
  const result = await applyCardInteraction(assertion, encodeCardSession(data), services, async event => {
    f.store.transaction(tx => tx.put("inbox", {
      id: event.eventId,
      scope: event.scope,
      revision: 0,
      state: "pending",
      event: {
        version: 1,
        type: "app-interaction",
        eventId: event.eventId,
        direction: "inbound",
        scope: event.scope,
        occurredAt: event.occurredAt,
        receivedAt: f.clock.now(),
        ordering: { source: "test-backend-v1" },
        targets: [event.session],
        interactionId: event.eventId,
        session: event.session,
        actionId: event.actionId,
        selection: event.selection,
      },
    }, null));
    return true;
  });
  assert.equal(result.status, "committed");
  assert.equal(committedPointers.length, 1);
  assert.equal(f.store.transaction(tx => tx.get("sessions", session.id))?.revision, 1);
  assert.equal(f.store.scan("handoffs").length, 1);
});
