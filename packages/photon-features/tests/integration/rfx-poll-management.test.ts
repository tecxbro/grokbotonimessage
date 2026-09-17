import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { ConnectionError, IMessageError } from "@photon-ai/advanced-imessage/grpc";
import type { Action, IncomingEvent, ResourceRef } from "../../src/contracts/index.js";
import { createAdvancedPollManagement } from "../../src/features/polls/advanced-adapter.js";
import { createFeatureModule, createPollModule } from "../../src/features/polls/module.js";
import { pollOperations } from "../../src/features/polls/operations.js";
import { scopedId, type PollRef, type OptionRef } from "../../src/features/polls/identity.js";
import { createPollReducer } from "../../src/features/polls/reducer.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { executeOperation } from "../../src/runtime/core/executor.js";
import { resolveNativePollVote, routePollEvent } from "../../src/host/poll-correlations.js";
import { components, seed, context, scope, noNetwork } from "../lanes/wt-01/fixture.js";
import { advancedClientFixture } from "../lanes/wt-05/advanced-support.js";

/** Actual durable outbox/child executor and SQLite, with only provider RPCs doubled. */
function fixture(t: TestContext) {
  const output = resolve(".photon-local/rfx-08"); mkdirSync(output, { recursive: true });
  const directory = mkdtempSync(join(output, "management-")), path = join(directory, "state.sqlite");
  let store = new DurableSQLiteStore(path), runtime = components(store);
  const trusted = { ...context, permissions: [...pollOperations] };
  seed(store, trusted);
  store.transaction(tx => {
    const space = tx.get("references", scope.spaceId)!;
    tx.put("references", { ...space, revision: space.revision + 1, providerId: "native-chat" }, space.revision);
  });
  const provider = advancedClientFixture();
  let constructions = 0;
  const construct = () => createAdvancedPollManagement({ address: "unused.invalid:443", token: "offline" }, options => {
    constructions++; assert.equal(options.retry, false); return provider.client;
  });
  let adapter = construct();
  const feature = createFeatureModule({ resolveSpace: noNetwork.resources.space,
    binding: () => ({ scope, phone: "+15550000000", conversationId: "native-chat" }),
    management: async () => adapter });
  t.after(async () => { await adapter.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });

  function poll(guid = "native-poll") {
    provider.seed(guid);
    const ref: PollRef = { version: 1, kind: "poll", scope, id: scopedId("poll", scope, guid),
      messageId: scopedId("message", scope, guid) };
    const message: ResourceRef = { version: 1, kind: "message", scope, id: ref.messageId };
    store.transaction(tx => {
      for (const reference of [ref, message]) tx.put("references", { id: reference.id, scope, revision: 0,
        reference, providerId: guid, ownedByPrincipalId: trusted.principalId,
        taskId: trusted.taskId, generation: trusted.generation }, null);
      tx.put("polls", { id: ref.id, scope, revision: 0, reference: ref, question: "Choose?", options: [] }, null);
    });
    return ref;
  }
  function action(operation: typeof pollOperations[number], poll: PollRef, option?: OptionRef, key: string = operation): Action {
    if (operation === "poll.create") throw new Error("fixture creates native identity directly");
    return { version: 1, contextId: trusted.contextId, idempotencyKey: key, operation,
      arguments: operation === "poll.get" ? { poll }
        : operation === "poll.addOption" ? { poll, option: { key: "local-added", label: "Same" } }
          : { poll, option: option! } } as Action;
  }
  async function run(action: Action) {
    const queued = await runtime.submission.submit(action, trusted);
    await executeOperation({ claims: runtime.claims, requestId: queued.requestId,
      handler: (input, services) => {
        switch (input.operation) {
          case "poll.get": return feature.handlers!["poll.get"]!(input, services);
          case "poll.vote": return feature.handlers!["poll.vote"]!(input, services);
          case "poll.unvote": return feature.handlers!["poll.unvote"]!(input, services);
          case "poll.addOption": return feature.handlers!["poll.addOption"]!(input, services);
          default: throw new Error("unexpected operation");
        }
      },
      capability: () => ({ ...createPollModule({ management: "available", voteIngress: "unknown",
        reduction: { orderedSources: [] } }).capabilities.find(c => c.operation === action.operation)!,
        availability: { account: "available", conversation: "available", checkedAt: runtime.clock.now() } }),
      resources: noNetwork.resources });
    return store.transaction(tx => tx.get("outbox", queued.requestId)!.result);
  }
  function options(poll: PollRef) {
    return store.transaction(tx => tx.get("polls", poll.id)!.options.map(o => o.reference));
  }
  return { provider, poll, action, run, options, trusted,
    get store() { return store; }, get runtime() { return runtime; }, constructions: () => constructions,
    async restart() {
      await adapter.close(); store.close();
      store = new DurableSQLiteStore(path); runtime = components(store); adapter = construct();
      runtime.recovery.recover();
    } };
}

test("get exact poll registers provider option IDs; vote/unvote/addOption use them through the durable executor", async t => {
  const f = fixture(t), poll = f.poll();
  assert.equal(f.options(poll).length, 0);
  const fetched = await f.run(f.action("poll.get", poll));
  assert.equal(fetched.status, "executor-completed");
  assert.deepEqual(f.provider.calls, [["get", "native-poll"]]);
  const [a, b] = f.options(poll);
  assert.notEqual(a!.id, b!.id);
  assert.equal(fetched.value?.type, "poll");
  if (fetched.value?.type !== "poll") throw new Error("missing poll");
  assert.deepEqual(fetched.value.options.map(o => [o.label, o.votes]), [["Same", 2], ["Same", 0]]);
  for (const operation of ["poll.vote", "poll.unvote", "poll.addOption"] as const) {
    const action = f.action(operation, poll, b);
    const result = await f.run(action);
    assert.equal(result.status, "provider-accepted", JSON.stringify(result));
    const call: unknown[] = f.provider.calls.at(-1)!;
    assert.equal(call[1], "native-poll");
    if (operation === "poll.vote") assert.equal(call[2], "native-b");
    if (operation === "poll.unvote") assert.equal(call.length, 3);
    if (operation === "poll.addOption") assert.equal(call[2], "Same");
    assert.match((call.at(-1) as { clientMessageId: string }).clientMessageId, /^photon-poll-[a-f0-9]{64}$/);
    const before: number = f.provider.calls.length;
    assert.equal((await f.run(action)).status, "provider-accepted");
    assert.equal(f.provider.calls.length, before);
  }
  assert.equal(f.options(poll).length, 3);
  assert.equal(f.store.scan("children").length, 3);
  assert.equal(f.constructions(), 1);
});

test("two polls in one chat keep distinct identities and management mappings survive host restart", async t => {
  const f = fixture(t), a = f.poll("poll-a"), b = f.poll("poll-b");
  await f.run(f.action("poll.get", a, undefined, "get-a"));
  await f.run(f.action("poll.get", b, undefined, "get-b"));
  const optionA = f.options(a)[1]!, optionB = f.options(b)[1]!;
  assert.notEqual(optionA.id, optionB.id);
  await f.restart();
  assert.deepEqual(f.options(a)[1], optionA);
  assert.deepEqual(f.options(b)[1], optionB);
  assert.equal((await f.run(f.action("poll.vote", a, optionA, "vote-a"))).status, "provider-accepted");
  assert.equal((await f.run(f.action("poll.vote", b, optionB, "vote-b"))).status, "provider-accepted");
  assert.deepEqual(f.provider.calls.slice(-2).map(call => call.slice(0, 3)),
    [["vote", "poll-a", "native-b"], ["vote", "poll-b", "native-b"]]);
});

test("two voters and an unvote correlate to durable native identity and dedupe after restart", async t => {
  const f = fixture(t), poll = f.poll();
  await f.run(f.action("poll.get", poll));
  const reducer = createPollReducer({ orderedSources: ["verified-delta-fixture"], selectionSemantics: "independent-option-deltas" });
  function event(actorId: string, change: "vote" | "unvote", sequence: string): IncomingEvent {
    const identity = f.store.transaction(tx => resolveNativePollVote(tx, scope, {
      pollMessageGuid: "native-poll", optionIdentifier: "native-b" }));
    assert.ok(identity);
    return { version: 1, type: "poll", scope, eventId: `event-${sequence}`, providerEventId: `provider-${sequence}`,
      direction: "inbound", occurredAt: 100, receivedAt: 101,
      ordering: { source: "verified-delta-fixture", sequence }, actorId, change,
      poll: identity.poll, option: identity.option, targets: [identity.poll, identity.option] };
  }
  const events = [event("alice", "vote", "1"), event("bob", "vote", "2"), event("alice", "unvote", "3")];
  for (const event of events) f.store.transaction(tx => {
    assert.equal(routePollEvent(event, tx)?.taskId, context.taskId); reducer.reduce(event, tx);
  });
  await f.restart();
  for (const event of events) f.store.transaction(tx => reducer.reduce(event, tx));
  assert.equal(f.store.scan("votes").length, 2);
  assert.equal(f.store.scan("votes").find(v => v.actorId === "alice")!.active, false);
  assert.equal(f.store.scan("votes").find(v => v.actorId === "bob")!.active, true);
  assert.equal(f.store.scan("handoffs").filter(h => h.eventIds.some(id => id.startsWith("event-"))).length, 3);
});

for (const failure of ["timeout", "duplicate"] as const) {
  test(`${failure} after dispatch remains unknown through database reopen and cannot be retried`, async t => {
    const f = fixture(t), poll = f.poll();
    f.provider.afterWrite(() => { throw failure === "timeout"
      ? new ConnectionError("deadline after write", { code: "timeout", grpcCode: 4, retryable: true })
      : new IMessageError("duplicate", { code: "duplicateMessage", grpcCode: 6, retryable: false }); });
    const action = f.action("poll.addOption", poll);
    const result = await f.run(action);
    assert.equal(result.status, "unknown-outcome");
    assert.equal(result.error?.retry, "reconcile-first");
    assert.equal(f.store.scan("children")[0]!.state, "unknown");
    assert.equal(f.provider.states.get("native-poll")!.options.length, 3);
    await f.restart();
    assert.equal((await f.run(action)).status, "unknown-outcome");
    assert.throws(() => f.runtime.recovery.retry(result.requestId, f.trusted));
    assert.equal(f.provider.calls.length, 1);
    assert.equal(f.options(poll).length, 0);
  });
}

test("an option ID invalidated at the provider returns a definitive failure, not acceptance", async t => {
  const f = fixture(t), poll = f.poll();
  await f.run(f.action("poll.get", poll));
  const option = f.options(poll)[1]!;
  const state = f.provider.states.get("native-poll")!;
  f.provider.states.set("native-poll", { ...state, options: [state.options[0]!, { optionIdentifier: "replacement", text: "Same" }] });
  const result = await f.run(f.action("poll.vote", poll, option));
  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "INVALID_REQUEST");
  assert.equal(result.error?.retry, "never");
  assert.equal(result.observations.length, 0);
});
