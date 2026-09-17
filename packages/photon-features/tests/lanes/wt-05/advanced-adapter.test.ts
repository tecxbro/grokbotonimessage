import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { ConnectionError, IMessageError, type ClientOptions } from "@photon-ai/advanced-imessage/grpc";
import { createAdvancedPollManagement } from "../../../src/features/polls/advanced-adapter.js";
import { PollManagementRejected } from "../../../src/features/polls/sdk.js";
import { advancedClientFixture } from "./advanced-support.js";

const configuration = { address: "unused.invalid:443", token: "offline-fixture" };
const execution = { childKey: "polls:child:stable-fixture" };

test("one host client handles all management calls, disables retries and closes once", async () => {
  const f = advancedClientFixture(); f.seed();
  const constructions: ClientOptions[] = [];
  const adapter = createAdvancedPollManagement(configuration, options => { constructions.push(options); return f.client; });
  const fetched = await adapter.get("native-poll");
  assert.equal(fetched.votes.length, 2);
  assert.equal("creatorHandle" in fetched.options[0]!, false);
  assert.equal("country" in fetched.votes[0]!.participant, false);
  await adapter.vote("native-poll", "native-b", execution);
  await adapter.unvote("native-poll", { childKey: "unvote-child" });
  const added = await adapter.addOption("native-poll", "Same", { childKey: "add-child" });
  assert.equal(added.options.at(-1)?.optionIdentifier, "native-added-2");
  assert.equal(constructions.length, 1);
  assert.equal(constructions[0]!.retry, false);
  assert.equal(constructions[0]!.autoIdempotency, false);
  assert.deepEqual(f.calls[0], ["get", "native-poll"]);
  assert.deepEqual(f.calls[1], ["vote", "native-poll", "native-b", {
    clientMessageId: `photon-poll-${createHash("sha256").update(execution.childKey).digest("hex")}` }]);
  const close = adapter.close();
  assert.equal(adapter.close(), close);
  await close;
  await assert.rejects(adapter.get("native-poll"), /POLL_MANAGEMENT_CLOSED/);
  assert.equal(f.closes(), 1);
  assert.equal(f.calls.length, 4);
});

test("the same child produces the same provider key across host restarts; distinct children differ", async () => {
  const f = advancedClientFixture(); f.seed();
  for (const childKey of [execution.childKey, execution.childKey, "different-child"]) {
    const adapter = createAdvancedPollManagement(configuration, () => f.client);
    await adapter.vote("native-poll", "native-b", { childKey });
    await adapter.close();
  }
  const keys = f.calls.map(call => (call[3] as { clientMessageId: string }).clientMessageId);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test("invalid native option IDs and missing child identity fail without label resolution", async () => {
  const f = advancedClientFixture(); f.seed();
  const adapter = createAdvancedPollManagement(configuration, () => f.client);
  await assert.rejects(adapter.vote("native-poll", "Same", execution), error =>
    error instanceof PollManagementRejected && error.code === "INVALID_REQUEST");
  await assert.rejects(adapter.unvote("native-poll", { childKey: "" }), /INVALID_REQUEST/);
  assert.equal(f.calls.length, 1);
  await adapter.close();
});

test("timeouts, duplicate writes and unknown errors are never automatically retried", async () => {
  for (const error of [
    new ConnectionError("timeout", { code: "timeout", grpcCode: 4, retryable: true }),
    new IMessageError("duplicate", { code: "duplicateMessage", grpcCode: 6, retryable: false }),
    new Error("future transport failure"),
  ]) {
    const f = advancedClientFixture(); f.seed(); f.afterWrite(() => { throw error; });
    const adapter = createAdvancedPollManagement(configuration, () => f.client);
    await assert.rejects(adapter.addOption("native-poll", "Same", execution), value => value === error);
    assert.equal(f.calls.length, 1);
    assert.equal(f.states.get("native-poll")!.options.length, 3);
    await adapter.close();
  }
});

test("wrong poll IDs and malformed native snapshots cannot enter durable state", async () => {
  const f = advancedClientFixture(); const state = f.seed();
  const adapter = createAdvancedPollManagement(configuration, () => f.client);
  f.states.set("native-poll", { ...state, pollMessageGuid: "other" });
  await assert.rejects(adapter.get("native-poll"), /POLL_IDENTITY_MISMATCH/);
  f.states.set("native-poll", { ...state, options: [state.options[0]!, state.options[0]!] });
  await assert.rejects(adapter.get("native-poll"), /AMBIGUOUS_OPTIONS/);
  f.states.set("native-poll", { ...state, votes: [{ ...state.votes[0]!, optionIdentifier: "unknown" }] });
  await assert.rejects(adapter.get("native-poll"), /UNKNOWN_NATIVE_OPTION/);
  await adapter.close();
});

test("poll source uses public Spectrum imports and adapter opens no event subscription", () => {
  const root = new URL("../../../../src/features/polls/", import.meta.url);
  for (const file of readdirSync(root).filter(file => file.endsWith(".ts"))) {
    const source = readFileSync(new URL(file, root), "utf8");
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.includes("spectrum"))
          assert.ok(["spectrum-ts", "spectrum-ts/providers/imessage"].includes(specifier), specifier);
      }
      if (file === "advanced-adapter.ts" && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
        assert.notEqual(node.expression.name.text, "subscribeEvents");
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
});
