import test from "node:test";
import assert from "node:assert/strict";
import type { Message, Space } from "spectrum-ts";
import { resourceRefSchema, resultSchema, type Action, type ResourceRef } from "../../src/contracts/index.js";
import { makeServices, context, scope } from "../fixtures/runtime-services.js";
import { executePollOperation, pollOperations } from "../../src/features/polls/operations.js";
import { reconcilePollState } from "../../src/features/polls/reconciliation.js";
import { scopedId, type PollRef } from "../../src/features/polls/identity.js";
import type { NativePollState, PollManagement, PollProviderBinding } from "../../src/features/polls/sdk.js";
import { resolveNativePollVote, routePollEvent } from "../../src/host/poll-correlations.js";
import { normalizeCaptured } from "../../src/runtime/inbound/normalize.js";
import { ProviderContext } from "../../src/adapters/transport/provider-context.js";
import { snapshotMessage } from "../../src/adapters/transport/snapshot.js";
import { registerPoll, seed, storeFixture } from "../lanes/wt-05/support.js";

function managementFixture() {
  const fixture = makeServices();
  const services = { ...fixture.services, context: { ...context, permissions: [...pollOperations] } };
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1, kind: "space", id: scope.spaceId, scope,
  };
  const poll: PollRef = {
    version: 1, kind: "poll", scope,
    id: scopedId("poll", scope, "native-poll"),
    messageId: scopedId("message", scope, "native-poll"),
  };
  const message: Extract<ResourceRef, { kind: "message" }> = {
    version: 1, kind: "message", scope, id: poll.messageId,
  };
  for (const ref of [spaceRef, poll, message]) fixture.resources.set(ref.id, resourceRefSchema.parse(ref));
  const options = services.transaction(unit => {
    unit.put("references", { id: spaceRef.id, scope, revision: 0, reference: spaceRef,
      providerId: "native-chat", ownedByPrincipalId: context.principalId,
      taskId: context.taskId, generation: context.generation }, null);
    for (const ref of [poll, message]) unit.put("references", { id: ref.id, scope, revision: 0,
      reference: ref, providerId: "native-poll", ownedByPrincipalId: context.principalId,
      taskId: context.taskId, generation: context.generation }, null);
    unit.put("polls", { id: poll.id, scope, revision: 0, reference: poll,
      question: "Pick?", options: [] }, null);
    const registered = reconcilePollState(unit, context, { poll, nativePollGuid: "native-poll", options: [
      { nativeId: "native-a", label: "Same" }, { nativeId: "native-b", label: "Same" },
    ] });
    if (registered.status !== "registered") throw new Error("registration failed");
    return registered.options;
  });
  for (const ref of options) fixture.resources.set(ref.id, resourceRefSchema.parse(ref));
  let state: NativePollState = {
    pollMessageGuid: "native-poll", chatGuid: "native-chat", title: "Pick?",
    options: [
      { optionIdentifier: "native-a", text: "Same" },
      { optionIdentifier: "native-b", text: "Same" },
    ],
    votes: [
      { optionIdentifier: "native-a", participant: { address: "alice@example.com", service: "iMessage" } },
      { optionIdentifier: "native-a", participant: { address: "bob@example.com", service: "iMessage" } },
    ],
  };
  const calls: unknown[][] = [];
  const management: PollManagement = {
    get: async guid => { calls.push(["get", guid]); return state; },
    vote: async (guid, optionIdentifier) => { calls.push(["vote", guid, optionIdentifier]); return state; },
    unvote: async guid => { calls.push(["unvote", guid]); return state; },
    addOption: async (guid, text) => {
      calls.push(["addOption", guid, text]);
      state = { ...state, options: [...state.options, { optionIdentifier: "native-c", text }] };
      return state;
    },
  };
  const binding: PollProviderBinding = {
    resolveSpace: async () => { throw new Error("create not used"); },
    binding: () => ({ scope, phone: "+15550000000", conversationId: "native-chat" }),
    management: async () => management,
  };
  const action = (operation: "poll.get" | "poll.vote" | "poll.unvote" | "poll.addOption"): Action => ({
    version: 1, contextId: context.contextId, idempotencyKey: operation, operation,
    arguments: operation === "poll.get" ? { poll }
      : operation === "poll.addOption" ? { poll, option: { key: "local-c", label: "Third" } }
        : { poll, option: options[1]! },
  } as Action);
  return { ...fixture, services, poll, options, calls, management, binding, action,
    setState(value: NativePollState) { state = value; } };
}

test("scoped management invokes exact provider signatures and returns authoritative poll state", async () => {
  for (const operation of ["poll.get", "poll.vote", "poll.unvote", "poll.addOption"] as const) {
    const f = managementFixture();
    const result = await executePollOperation(f.action(operation), f.services, f.binding);
    resultSchema.parse(result);
    assert.equal(result.status, operation === "poll.get" ? "executor-completed" : "provider-accepted");
    assert.equal(result.value?.type, "poll");
    if (result.value?.type !== "poll") throw new Error("missing poll value");
    assert.equal(result.value.options[0]!.votes, 2);
    const expected = operation === "poll.get" ? ["get", "native-poll"]
      : operation === "poll.vote" ? ["vote", "native-poll", "native-b"]
        : operation === "poll.unvote" ? ["unvote", "native-poll"]
          : ["addOption", "native-poll", "Third"];
    assert.deepEqual(f.calls, [expected]);
    if (operation === "poll.addOption") {
      assert.equal(result.value.options.at(-1)?.label, "Third");
      assert.equal(f.services.transaction(unit => unit.get("references",
        scopedId("option", scope, "native-poll", "native-c"))?.providerId), "native-c");
    }
  }
});

test("management rejects cross-poll options and native chat mismatches before or after the provider boundary", async () => {
  const f = managementFixture();
  const other: PollRef = { ...f.poll, id: scopedId("poll", scope, "other"), messageId: scopedId("message", scope, "other") };
  const cross = { ...f.action("poll.vote"), arguments: { poll: other, option: f.options[0] } } as Action;
  assert.equal((await executePollOperation(cross, f.services, f.binding)).error?.code, "INVALID_REQUEST");
  assert.equal(f.calls.length, 0);
  f.setState({ pollMessageGuid: "native-poll", chatGuid: "other-chat", title: "Pick?",
    options: [{ optionIdentifier: "native-a", text: "Same" }, { optionIdentifier: "native-b", text: "Same" }], votes: [] });
  const read = await executePollOperation(f.action("poll.get"), f.services, f.binding);
  assert.equal(read.error?.code, "SCOPE_MISMATCH");
});

test("unknown mutation outcome is recorded by the child and never blindly retried", async () => {
  const f = managementFixture();
  let calls = 0;
  f.binding.management = async () => ({ ...f.management,
    vote: async () => { calls++; throw new Error("transport timeout after dispatch"); },
  });
  const action = f.action("poll.vote");
  const first = await executePollOperation(action, f.services, f.binding);
  const replay = await executePollOperation(action, f.services, f.binding);
  assert.equal(first.status, "unknown-outcome");
  assert.equal(first.error?.retry, "reconcile-first");
  assert.equal(replay.status, "unknown-outcome");
  assert.equal(calls, 1);
});

test("authoritative correlation separates duplicate labels and routes to each originating task", () => {
  const f = storeFixture();
  try {
    seed(f.store);
    const first = registerPoll(f.store, "poll-a", "origin-a");
    const second = registerPoll(f.store, "poll-b", "origin-b");
    for (const [poll, nativeOption] of [[first, "native-option-b"], [second, "native-option-a"]] as const) {
      const resolved = f.store.transaction(tx => resolveNativePollVote(tx, scope, {
        pollMessageGuid: poll.guid, optionIdentifier: nativeOption,
      }));
      assert.equal(resolved?.poll.id, poll.ref.id);
      assert.equal(resolved?.route.taskId, poll === first ? "origin-a" : "origin-b");
      const event = {
        version: 1 as const, type: "poll" as const, eventId: `event-${poll.guid}`,
        providerEventId: `provider-${poll.guid}`, scope, direction: "inbound" as const,
        occurredAt: 1, receivedAt: 2, ordering: { source: "native.polls", sequence: "7" },
        targets: [resolved!.poll, resolved!.option], poll: resolved!.poll, option: resolved!.option,
        actorId: "alice", change: "vote" as const,
      };
      assert.equal(f.store.transaction(tx => routePollEvent(event, tx)?.taskId), resolved?.route.taskId);
      const answer = {
        ...event,
        type: "poll-answer" as const,
        ordering: { source: "spectrum.messages" },
        targets: [resolved!.poll, resolved!.option],
        senderId: "alice",
        question: "Pick?",
        optionText: "Same",
        selected: true,
        answerText: "[Poll response]\nQuestion: Pick?\nSelected: Same",
        captureId: `capture-${poll.guid}`,
        correlation: { poll: resolved!.poll, option: resolved!.option },
      };
      assert.equal(f.store.transaction(tx => routePollEvent(answer, tx)?.taskId), resolved?.route.taskId);
    }
  } finally { f.close(); }
});

test("production Spectrum snapshot becomes a conversational answer with optional trusted identity", () => {
  const space = { __platform: "imessage", id: "native-chat", phone: "line-phone",
    send: async () => undefined } as unknown as Space;
  const message = { __platform: "imessage", id: "opaque-spectrum-event", platform: "imessage", direction: "inbound",
    timestamp: new Date(1), sender: { id: "alice" }, space,
    content: { type: "poll_option", option: { title: "Same" },
      poll: { type: "poll", title: "Pick?", options: [{ title: "Same" }, { title: "Same" }] },
      selected: true, title: "Same" },
  } as unknown as Message;
  const snapshot = snapshotMessage(message);
  assert.equal(JSON.stringify(snapshot).includes("optionIdentifier"), false);
  assert.equal(JSON.stringify(snapshot).includes("pollMessageGuid"), false);
  const routes = new ProviderContext(scope.projectId, [{ accountId: scope.accountId, lineId: scope.lineId, dedicated: true, servingPhone: "line-phone" }]);
  const conversational = normalizeCaptured(snapshot, "capture-1", routes, 10);
  assert.equal(conversational.type, "poll-answer");
  if (conversational.type !== "poll-answer") throw new Error("poll answer not normalized");
  assert.equal(conversational.question, "Pick?");
  assert.equal(conversational.optionText, "Same");
  assert.equal(conversational.selected, true);
  assert.equal(conversational.answerText, "[Poll response]\nQuestion: Pick?\nSelected: Same");
  assert.equal(conversational.correlation, null);
  const captureScope = routes.inbound("line-phone", "native-chat");
  const poll: PollRef = { version: 1, kind: "poll", scope: captureScope,
    id: scopedId("poll", captureScope, "native-poll"),
    messageId: scopedId("message", captureScope, "native-poll") };
  const option = { version: 1 as const, kind: "poll-option" as const, scope: captureScope,
    pollId: poll.id, id: scopedId("option", captureScope, "native-poll", "native-option-b") };
  const replayed = normalizeCaptured(snapshot, "capture-1", routes, 10, { poll: () => ({ poll, option }) });
  assert.equal(replayed.type, "poll-answer");
  if (replayed.type !== "poll-answer" || !replayed.correlation) throw new Error("poll replay not resolved");
  assert.equal(replayed.correlation.poll.id, poll.id);
  assert.equal(replayed.correlation.option.id, option.id);
  assert.deepEqual(replayed.targets, [poll, option]);
});

test("conversational answers preserve deselection and explicit unknown question semantics", () => {
  const routes = new ProviderContext(scope.projectId, [{ accountId: scope.accountId, lineId: scope.lineId, dedicated: true, servingPhone: "line-phone" }]);
  const raw = {
    id: "vote-without-question", platform: "imessage", direction: "inbound",
    timestamp: new Date(2).toISOString(), sender: { id: "alice" },
    space: { id: "native-chat", platform: "imessage", phone: "line-phone" },
    content: { type: "poll_option", title: "Red", option: { title: "Red" }, selected: false },
  };
  const event = normalizeCaptured(raw, "capture-unknown-question", routes, 10);
  assert.equal(event.type, "poll-answer");
  if (event.type !== "poll-answer") throw new Error("poll answer not normalized");
  assert.equal(event.question, null);
  assert.equal(event.selected, false);
  assert.equal(event.answerText,
    "[Poll response]\nDeselected: Red\nSource question: not identified by the received event.");
  const malformed = normalizeCaptured({ ...raw, content: {
    ...raw.content, title: "Blue",
  } }, "capture-malformed", routes, 11);
  assert.equal(malformed.type, "unresolved");
  const wrongPollType = normalizeCaptured({ ...raw, content: {
    ...raw.content, poll: { type: "text", title: "Invented?" },
  } }, "capture-wrong-poll-type", routes, 12);
  assert.equal(wrongPollType.type, "unresolved");
});
