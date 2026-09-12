import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { Action, OperationResult, TrustedContext } from "../../src/contracts/index.js";
import type { TypingSpace } from "../../src/runtime/typing/leases.js";
import { TypingLeases } from "../../src/runtime/typing/leases.js";
import { executeTypingOperation, typingCapabilities } from "../../src/runtime/typing/operations.js";
import { bindProductionTyping } from "../../src/host/typing-binding.js";
import { executeOperation } from "../../src/runtime/core/executor.js";
import { createExecutionServices } from "../../src/runtime/core/execution-services.js";
import { fixture, context, scope, space, noNetwork, deferred, action as textAction, binding } from "../lanes/wt-01/fixture.js";

function setup(t: TestContext) {
  const f = fixture(t);
  const trusted: TrustedContext = { ...context, permissions: ["text.send", "typing.begin", "typing.end"] };
  f.store.transaction(tx => {
    const row = tx.get("contexts", context.contextId)!;
    tx.put("contexts", { ...row, revision: row.revision + 1, context: trusted }, row.revision);
  });
  const lookup = deferred<TypingSpace>();
  const calls: string[] = [];
  const reports: string[] = [];
  const provider: TypingSpace = {
    startTyping: async () => { calls.push("start"); },
    stopTyping: async () => { calls.push("stop"); },
  };
  const leases = new TypingLeases(f.clock, () => lookup.promise, undefined, code => reports.push(code));
  t.after(async () => {
    leases.shutdown();
    lookup.resolve(provider);
    await leases.drain();
  });
  const request: Extract<Action, { operation: "typing.begin" }> = {
    version: 1, contextId: trusted.contextId, idempotencyKey: "typing-lifetime",
    operation: "typing.begin", arguments: { space: space as Extract<typeof space, { kind: "space" }>, ttlMs: 1000 },
  };
  const run = async () => {
    const queued = await f.submission.submit(request, trusted);
    const result = await executeOperation({
      claims: f.claims,
      requestId: queued.requestId,
      resources: noNetwork.resources,
      capability: () => ({ ...typingCapabilities()[0]!, blockers: [],
        availability: { account: "available", conversation: "available", checkedAt: f.clock.now() } }),
      handler: (_action, services) => executeTypingOperation(leases, request, services,
        bindProductionTyping(f.claims, queued.requestId, request, services)),
    });
    assert.equal(result?.status, "executor-completed");
    assert.equal(f.store.transaction(tx => tx.get("outbox", queued.requestId))!.claim, null);
    return result!;
  };
  const resolve = async () => { lookup.resolve(provider); assert.equal(await leases.drain(), true); };
  return { ...f, trusted, request, leases, calls, reports, run, resolve };
}

test("a delayed typing start remains authorized after the real executor releases its claim", async t => {
  const f = setup(t);
  const result = await f.run();
  assert.deepEqual(f.calls, []);
  assert.deepEqual(result.observations, []); // Scheduled, not device-visible evidence.
  await f.resolve();
  assert.deepEqual(f.calls, ["start"]);
  assert.deepEqual(f.reports, []);
  f.leases.end({ scope, generation: f.trusted.generation });
  await f.leases.drain();
  assert.deepEqual(f.calls, ["start", "stop"]);
});

test("an unresolved typing lookup does not keep the outbox claim ahead of a reply", async t => {
  const f = setup(t);
  await f.run();
  const request = textAction("reply-after-typing");
  const queued = await f.submission.submit(request, f.trusted);
  const result = await executeOperation({
    claims: f.claims, requestId: queued.requestId, resources: noNetwork.resources,
    capability: () => binding().capability(f.trusted),
    handler: (_action, services) => services.executeChild({
      index: 0, key: "reply", argumentsDigest: "a".repeat(64),
      dispatch: async (): Promise<OperationResult> => {
        services.assertActiveClaim();
        f.calls.push("reply");
        return { version: 1, requestId: queued.requestId, revision: 0,
          updatedAt: f.clock.now(), status: "executor-completed", references: [],
          observations: [], value: { type: "void" } };
      },
    }),
  });
  assert.equal(result?.status, "executor-completed");
  assert.deepEqual(f.calls, ["reply"]);
  // The reply phase ends before lookup returns: no late typing flash.
  f.leases.end({ scope, generation: f.trusted.generation });
  await f.resolve();
  assert.deepEqual(f.calls, ["reply"]);
});

const invalidations = {
  "task cancellation": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("tasks", f.trusted.taskId)!;
    tx.put("tasks", { ...row, revision: row.revision + 1, cancelledAt: f.clock.now() }, row.revision);
  }),
  "context revocation": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("contexts", f.trusted.contextId)!;
    tx.put("contexts", { ...row, revision: row.revision + 1,
      context: { ...row.context, revokedAt: f.clock.now() } }, row.revision);
  }),
  "narrowed permissions": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("contexts", f.trusted.contextId)!;
    tx.put("contexts", { ...row, revision: row.revision + 1,
      context: { ...row.context, permissions: ["text.send"] } }, row.revision);
  }),
  "new task generation": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("tasks", f.trusted.taskId)!;
    tx.put("tasks", { ...row, revision: row.revision + 1, generation: row.generation + 1 }, row.revision);
  }),
  "changed resource ownership": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("references", scope.spaceId)!;
    tx.put("references", { ...row, revision: row.revision + 1, ownedByPrincipalId: "another-principal" }, row.revision);
  }),
  "shortened context expiry": (f: ReturnType<typeof setup>) => f.store.transaction(tx => {
    const row = tx.get("contexts", f.trusted.contextId)!;
    tx.put("contexts", { ...row, revision: row.revision + 1,
      context: { ...row.context, expiresAt: f.clock.now() } }, row.revision);
  }),
};
for (const [name, invalidate] of Object.entries(invalidations)) {
  test(`${name} still prevents a delayed start after scheduling completed`, async t => {
    const f = setup(t);
    await f.run();
    invalidate(f);
    await f.resolve();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.reports, ["TYPING_LEASE_INVALID"]);
  });
}

test("expiry and shutdown discard pending starts rather than replaying them", async t => {
  for (const mode of ["expiry", "shutdown"] as const) {
    await t.test(mode, async t => {
      const f = setup(t);
      await f.run();
      if (mode === "expiry") { f.clock.advance(1001); f.leases.expire(); }
      else f.leases.shutdown();
      await f.resolve();
      assert.deepEqual(f.calls, []);
      assert.deepEqual(f.reports, []);
    });
  }
});

test("a host cannot mint a typing lease from a completed or mismatched execution claim", async t => {
  const f = setup(t);
  const queued = await f.submission.submit(f.request, f.trusted);
  const claim = f.claims.acquire(queued.requestId, "original-owner", 1000)!;
  assert.ok(claim);
  const controller = new AbortController();
  const services = createExecutionServices({ claims: f.claims, requestId: queued.requestId,
    claim, controller, deadlineMs: 1000, resources: noNetwork.resources });
  const lease = bindProductionTyping(f.claims, queued.requestId, f.request, services);
  assert.throws(() => bindProductionTyping(f.claims, "other-request", f.request, services));
  f.store.transaction(tx => {
    const row = tx.get("outbox", queued.requestId)!;
    tx.put("outbox", { ...row, revision: row.revision + 1,
      claim: { ...claim, owner: "replacement-owner", fence: claim.fence + 1 } }, row.revision);
  });
  assert.throws(() => lease.assertLeaseCurrent!(), /STALE_FENCE/);
  assert.throws(() => bindProductionTyping(f.claims, queued.requestId, f.request, services), /STALE_FENCE/);
});
