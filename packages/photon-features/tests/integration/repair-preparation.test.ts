import test from "node:test";
import assert from "node:assert/strict";
import { fixture, context, scope } from "../lanes/wt-01/fixture.js";
import { productionCapability } from "../../src/host/capabilities.js";
import { localRequestSchema } from "../../src/contracts/protocol.js";
import type { Action, ResourceRef } from "../../src/contracts/index.js";

function seedCard(f: ReturnType<typeof fixture>) {
  const message = { version: 1, kind: "message", id: "message-1", scope } as const;
  const card = { version: 1, kind: "card", id: "card-1", messageId: message.id, scope } as const;
  const session = { version: 1, kind: "card-session", id: "session-1", cardId: card.id, scope } as const;
  f.store.transaction(tx => {
    const oldContext = tx.get("contexts", context.contextId)!;
    tx.put("contexts", { ...oldContext, revision: oldContext.revision + 1, context: { ...context, permissions: ["app.update"] } }, oldContext.revision);
    for (const reference of [message, card, session] as ResourceRef[]) tx.put("references", {
      id: reference.id, scope, revision: 0, reference, providerId: "native-card-1",
      ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation,
    }, null);
    tx.put("cards", { id: card.id, scope, revision: 0, reference: card, templateId: "template-1" }, null);
    tx.put("sessions", { id: session.id, scope, revision: 0, reference: session,
      allowedActionIds: [], expiresAt: context.expiresAt, generation: context.generation }, null);
  });
  return { card, session, cardContext: { ...context, permissions: ["app.update" as const] } };
}

test("missing implementation declaration cannot become operational through registration", () => {
  const report = productionCapability("typing.begin", context, {
    scope, ownerReady: true, configuredOperations: new Set(["typing.begin"]),
    registeredHandlers: new Set(["typing.begin"]), administrativeOperations: new Set(),
    allowNativeContent: false, configuredCardTemplates: 0, resources: true, media: true, streams: true, checkedAt: 10000,
  });
  assert.equal(report.implementation, "unimplemented");
  assert.equal(report.availability.conversation, "unavailable");
});

test("local protocol accepts bounded media import without action filesystem payloads", () => {
  assert.equal(localRequestSchema.safeParse({ version: 1, method: "media.import", contextId: context.contextId,
    filename: "report.png", metadata: { mimeType: "image/png" } }).success, true);
  for (const filename of ["../report.png", "/tmp/report.png", "..", "a\\b"]) {
    assert.equal(localRequestSchema.safeParse({ version: 1, method: "media.import", contextId: context.contextId,
      filename, metadata: { mimeType: "image/png" } }).success, false);
  }
});

test("card revision is captured at admission and idempotent replay never refreshes it", async t => {
  const f = fixture(t), { card, session, cardContext } = seedCard(f);
  const action: Action = { version: 1, contextId: context.contextId, idempotencyKey: "card-update-1",
    operation: "app.update", arguments: { card, session, layout: { caption: "updated" } } };
  const result = await f.submission.submit(action, cardContext);
  const metadata = () => f.store.transaction(tx => tx.get("outbox", result.requestId)) as unknown as
    { admission?: { cardUpdate?: { cardId: string; sessionId: string; expectedRevision: number } } };
  assert.deepEqual(metadata().admission?.cardUpdate, { cardId: card.id, sessionId: session.id, expectedRevision: 0 });
  f.store.transaction(tx => {
    const current = tx.get("cards", card.id)!;
    tx.put("cards", { ...current, revision: 1 }, 0);
    tx.put("cards", { ...current, revision: 2 }, 1);
  });
  await f.submission.submit(action, cardContext);
  assert.equal(metadata().admission?.cardUpdate?.expectedRevision, 0);
});

import { registerIncomingReferences } from "../../src/host/incoming-resources.js";
import { resolveNativePollVote, createPollCorrelations } from "../../src/host/poll-correlations.js";
import { registerNativeOptions, scopedId } from "../../src/features/polls/identity.js";
import { createExecutionServices } from "../../src/runtime/core/execution-services.js";
import { noNetwork, components } from "../lanes/wt-01/fixture.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { DurableLocalProtocol } from "../../src/runtime/core/local-server.js";
import { principal } from "../fixtures/harness.js";

test("incoming references become authorized, replay identically and reject collision atomically", t => {
  const f = fixture(t);
  const message = { version: 1, kind: "message", id: "incoming-1", scope } as const;
  const attachment = { version: 1, kind: "attachment", id: "attachment-1", messageId: message.id, scope } as const;
  assert.throws(() => f.store.transaction(tx => f.contexts.reference(tx, context, message)), /RESOURCE_NOT_FOUND/);
  const bindings = [{ reference: attachment, providerId: "native-attachment" }, { reference: message, providerId: "native-message" }];
  for (let i = 0; i < 2; i++) f.store.transaction(tx => registerIncomingReferences(tx, context, bindings, f.clock.now()));
  f.store.transaction(tx => { f.contexts.reference(tx, context, message); f.contexts.reference(tx, context, attachment); });
  assert.equal(f.store.transaction(tx => tx.get("references", attachment.id)!.revision), 0);
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, context, [
    { reference: { ...message, id: "must-rollback" }, providerId: "new-message" },
    { reference: message, providerId: "conflicting-native-id" },
  ], f.clock.now())), /IDEMPOTENCY_CONFLICT/);
  assert.equal(f.store.transaction(tx => tx.get("references", "must-rollback")), undefined);
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, context,
    [{ reference: { ...attachment, messageId: "missing" }, providerId: "x" }], f.clock.now())), /RESOURCE_NOT_FOUND/);
  const wrong = { ...message, scope: { ...scope, lineId: "other-line" } };
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, context,
    [{ reference: wrong, providerId: "x" }], f.clock.now())), /INVALID_REQUEST/);
});

test("incoming registration cannot resurrect cancellation or revoked grants", t => {
  const f = fixture(t);
  f.store.transaction(tx => { const task = tx.get("tasks", context.taskId)!;
    tx.put("tasks", { ...task, revision: 1, cancelledAt: f.clock.now() }, 0); });
  assert.throws(() => f.store.transaction(tx => registerIncomingReferences(tx, context, [], f.clock.now())), /CANCELLED/);
});

test("poll correlation uses authoritative IDs and original owner, never duplicate labels", t => {
  const f = fixture(t), native = "native-poll";
  const message = { version: 1, kind: "message", id: scopedId("message", scope, native), scope } as const;
  const poll = { version: 1, kind: "poll", id: scopedId("poll", scope, native), messageId: message.id, scope } as const;
  f.store.transaction(tx => {
    for (const reference of [message, poll]) tx.put("references", { id: reference.id, scope, revision: 0,
      reference, providerId: native, ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation }, null);
    tx.put("polls", { id: poll.id, scope, revision: 0, reference: poll, question: "Pick one", options: [] }, null);
    registerNativeOptions(tx, { poll, nativePollGuid: native, options: [{ nativeId: "one", label: "same" }, { nativeId: "two", label: "same" }] });
  });
  const lookup = (optionIdentifier: string) => f.store.transaction(tx => resolveNativePollVote(tx, scope, { pollMessageGuid: native, optionIdentifier }));
  assert.equal(lookup("one")?.option.id, scopedId("option", scope, native, "one"));
  assert.equal(lookup("two")?.route.taskId, context.taskId);
  assert.equal(lookup("same"), undefined);
  const correlations = createPollCorrelations(f.store, () => undefined);
  assert.equal(correlations.poll?.({ id: "synthetic-poll-event", space: { id: "x" }, content: { type: "poll_option", title: "same", selected: true } }, scope), undefined);
  f.store.transaction(tx => { const task = tx.get("tasks", context.taskId)!;
    tx.put("tasks", { ...task, revision: 1, generation: task.generation + 1 }, 0); });
  assert.equal(lookup("one"), undefined);
});

test("admitted revision survives reopening and execution facade is immutable", async t => {
  const f = fixture(t), { card, session, cardContext } = seedCard(f);
  const action: Action = { version: 1, contextId: context.contextId, idempotencyKey: "reopen-card",
    operation: "app.update", arguments: { card, session, layout: { caption: "new" } } };
  const result = await f.submission.submit(action, cardContext);
  const reopened = new DurableSQLiteStore(f.path);
  try {
    const next = components(reopened), claim = next.claims.acquire(result.requestId, "reopened-owner", 30000)!;
    assert.ok(claim);
    const services = createExecutionServices({ claims: next.claims, claim, requestId: result.requestId,
      controller: new AbortController(), deadlineMs: 1000, resources: noNetwork.resources });
    assert.equal(services.admission?.cardUpdate?.expectedRevision, 0);
    assert.ok(Object.isFrozen(services.admission?.cardUpdate));
    assert.throws(() => { (services.admission!.cardUpdate as { expectedRevision: number }).expectedRevision = 2; }, TypeError);
    await next.submission.cancel(result.requestId, cardContext);
    assert.throws(() => services.assertActiveClaim(), /CANCELLED/);
  } finally { reopened.close(); }
});

test("card admission rejects unresolved revision and expired session without enqueuing", async t => {
  const f = fixture(t), { card, session, cardContext } = seedCard(f);
  f.store.transaction(tx => { const row = tx.get("cards", card.id)!; tx.put("cards", { ...row, revision: 1 }, 0); });
  const action: Action = { version: 1, contextId: context.contextId, idempotencyKey: "odd-card",
    operation: "app.update", arguments: { card, session, layout: { caption: "update" } } };
  await assert.rejects(f.submission.submit(action, cardContext), /UNAVAILABLE/);
  assert.equal(f.store.scan("outbox").length, 0);
  f.store.transaction(tx => {
    const row = tx.get("cards", card.id)!; tx.put("cards", { ...row, revision: 2 }, 1);
    const old = tx.get("sessions", session.id)!;
    tx.put("sessions", { ...old, revision: 1, expiresAt: f.clock.now() }, 0);
  });
  await assert.rejects(f.submission.submit(action, cardContext), /CONTEXT_EXPIRED/);
  assert.equal(f.store.scan("outbox").length, 0);
});

test("media import authenticates context before delegating and rejects missing ports", async t => {
  const f = fixture(t);
  const input = { version: 1, method: "media.import", contextId: context.contextId,
    filename: "report.png", metadata: { mimeType: "image/png" } };
  let calls = 0;
  const result = { stagingId: "stage-1", sha256: "a".repeat(64), mimeType: "image/png", bytes: 12 };
  const protocol = new DurableLocalProtocol({ contexts: f.contexts, submission: f.submission, work: f.work,
    capabilities: () => [], diagnostics: () => ({ ready: false, activation: "disabled" }),
    importMedia: async (caller, contextId, request) => { calls++; assert.equal(caller.id, principal.id);
      assert.equal(contextId, context.contextId); assert.equal(request.filename, "report.png"); return result; } });
  assert.deepEqual(await protocol.dispatch(input, principal), { version: 1, ok: true, result });
  const denied = await protocol.dispatch(input, { ...principal, id: "wrong-principal" }) as { ok: boolean };
  assert.equal(denied.ok, false); assert.equal(calls, 1);
  assert.equal((await f.protocol.dispatch(input, principal) as { error: { code: string } }).error.code, "UNAVAILABLE");
});
