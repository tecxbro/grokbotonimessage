import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { SQLiteStore } from "../../src/state/sqlite.js";
import type { HandoffRecord } from "../../src/state/ports.js";
import type { WakeAdapter } from "../../src/contracts/index.js";
import { DurableContexts } from "../../src/runtime/core/authorization.js";
import { DurableWork } from "../../src/runtime/core/work-handoff.js";
import { InboundPump } from "../../src/runtime/inbound/pump.js";
import { InboundRouter } from "../../src/runtime/inbound/router.js";
import { TextBatcher } from "../../src/runtime/inbound/batching.js";
import { WakeDispatcher, configuredGrokWake, wakeRetryDelayMs } from "../../src/runtime/inbound/wake-dispatcher.js";
import { GrokGatewayTaskHandoff, discoverGrokCommandStyle, runGrokCommand,
  type GrokWakeBinding } from "../../src/host/grok-wake.js";
import { context, scope, FixedClock, seedHandoff } from "../fixtures/harness.js";
import { deferred } from "../lanes/wt-02/helpers.js";

const route = { taskId: context.taskId, principalId: context.principalId, generation: context.generation };
function fixture() {
  const root = resolve(".photon-local/tests");
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "rfx-wake-"));
  const path = join(dir, "state.sqlite");
  let store = new SQLiteStore(path);
  const clock = new FixedClock();
  store.transaction(tx => {
    tx.put("tasks", { id: route.taskId, scope, revision: 0, ...route, cancelledAt: null }, null);
    tx.put("contexts", { id: context.contextId, scope, revision: 0,
      context: { ...context, expiresAt: Number.MAX_SAFE_INTEGER } }, null);
  });
  seedHandoff(store); // A legacy row without wake metadata.
  store.transaction(tx => {
    const inbox = tx.get("inbox", "event-1")!;
    tx.put("inbox", { ...inbox, state: "reduced", revision: inbox.revision + 1 }, inbox.revision);
  });
  return {
    clock, path,
    get store() { return store; },
    get work() { return new DurableWork(store, new DurableContexts(store, clock)); },
    row(id = "handoff-1") { return store.transaction(tx => tx.get("handoffs", id)!); },
    dispatcher(wake: WakeAdapter) { return new WakeDispatcher(store, clock, wake, "agent-1"); },
    reopen() { store.close(); store = new SQLiteStore(path); },
    close() { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

for (const status of ["failed", "unknown", "accepted"] as const) {
  test(`${status}: first wake reserves before I/O, +1s is quiet, retry uses exact durable deadline`, async () => {
    const f = fixture(); let calls = 0;
    try {
      const dispatcher = f.dispatcher({ async wake(pointer) {
        calls++;
        const row = f.row();
        assert.equal(row.wake?.attempts, calls);
        assert.equal(row.wake?.lastAttemptAt, f.clock.now());
        assert.equal(row.wake?.lastStatus, null);
        assert.ok(row.wake!.nextAttemptAt > f.clock.now());
        assert.deepEqual(pointer, { handoffId: row.id, taskId: route.taskId, generation: 1 });
        return { status };
      } });
      assert.equal((await dispatcher.tick(scope, route))[0]?.status, status);
      const first = f.row();
      assert.equal(first.state, "pending");
      assert.equal(first.wake?.targetId, "agent-1");
      assert.equal(first.wake?.lastStatus, status);
      assert.equal(first.wake!.nextAttemptAt - f.clock.now(), status === "accepted" ? 30_000 : 2_000);
      f.clock.advance(1_000);
      assert.deepEqual(await dispatcher.tick(scope, route), []);
      f.clock.advance(first.wake!.nextAttemptAt - f.clock.now() - 1);
      assert.deepEqual(await dispatcher.tick(scope, route), []);
      f.clock.advance(1);
      assert.equal((await dispatcher.tick(scope, route)).length, 1);
      assert.equal(calls, 2);
    } finally { f.close(); }
  });
}

test("backoff grows deterministically and caps, including large attempt histories", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 100, Number.MAX_SAFE_INTEGER].map(wakeRetryDelayMs),
    [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000]);
  for (const invalid of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => wakeRetryDelayMs(invalid));
  const f = fixture();
  try {
    const dispatcher = f.dispatcher({ wake: async () => ({ status: "failed" }) });
    for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
      assert.equal((await dispatcher.tick(scope, route)).length, 1);
      assert.equal(f.row().wake!.nextAttemptAt - f.clock.now(), delay);
      f.clock.advance(delay);
    }
    assert.equal(f.row().wake?.attempts, 7);
  } finally { f.close(); }
});

test("successful claim suppresses wakes until expiry and preserves attempt history/backoff", async () => {
  const f = fixture();
  try {
    const dispatcher = f.dispatcher({ wake: async () => ({ status: "accepted" }) });
    await dispatcher.tick(scope, route);
    const metadata = f.row().wake;
    const claimed = f.work.change(context, "handoff-1", "claim", undefined, 1000);
    assert.equal(claimed.handoff.state, "claimed");
    assert.deepEqual(claimed.handoff.wake, metadata);
    assert.deepEqual(f.work.list(context, 100), []);
    assert.deepEqual(await dispatcher.tick(scope, route), []);
    f.clock.advance(1000);
    assert.equal(f.work.list(context, 100).length, 1);
    assert.deepEqual(await dispatcher.tick(scope, route), []);
    f.clock.advance(metadata!.nextAttemptAt - f.clock.now());
    assert.equal((await dispatcher.tick(scope, route)).length, 1);
    assert.equal(f.row().wake?.attempts, 2);
  } finally { f.close(); }
});

test("active claim suppresses a due wake; ack remains excluded after lease, retry deadline and restart", async () => {
  const f = fixture();
  try {
    const wake: WakeAdapter = { wake: async () => ({ status: "failed" }) };
    await f.dispatcher(wake).tick(scope, route);
    const claimed = f.work.change(context, "handoff-1", "claim", undefined, 60000).handoff;
    f.clock.advance(30000);
    assert.deepEqual(await f.dispatcher(wake).tick(scope, route), []);
    f.work.change(context, claimed.id, "ack", claimed.claim!.fence);
    f.clock.advance(1_000_000);
    f.reopen();
    assert.deepEqual(await f.dispatcher(wake).tick(scope, route), []);
    assert.deepEqual(f.work.list(context, 100), []);
    assert.equal(f.row().state, "acknowledged");
    assert.equal(f.row().wake?.attempts, 1);
  } finally { f.close(); }
});

test("SQLite close/reopen and a new dispatcher respect persisted nextAttemptAt", async () => {
  const f = fixture(); let calls = 0;
  const wake: WakeAdapter = { async wake() { calls++; return { status: "unknown" }; } };
  try {
    await f.dispatcher(wake).tick(scope, route);
    const metadata = f.row().wake;
    f.reopen(); f.clock.advance(1000);
    assert.deepEqual(await f.dispatcher(wake).tick(scope, route), []);
    assert.deepEqual(f.row().wake, metadata);
    f.clock.advance(1000);
    await f.dispatcher(wake).tick(scope, route);
    assert.equal(calls, 2);
    assert.equal(f.row().wake?.attempts, 2);
  } finally { f.close(); }
});

test("another connection sees the reservation while the gateway is pending", async () => {
  const f = fixture(); const gate = deferred<{ status: "accepted" }>();
  const observer = new SQLiteStore(f.path); let calls = 0;
  try {
    const wake: WakeAdapter = { wake() { calls++; return gate.promise; } };
    const pending = f.dispatcher(wake).tick(scope, route);
    const second = new WakeDispatcher(observer, f.clock, wake, "agent-1");
    assert.deepEqual(await second.tick(scope, route), []);
    assert.equal(calls, 1);
    assert.equal(observer.transaction(tx => tx.get("handoffs", "handoff-1"))!.wake!.lastStatus, null);
    gate.resolve({ status: "accepted" }); await pending;
  } finally { gate.resolve({ status: "accepted" }); observer.close(); f.close(); }
});

for (const acknowledge of [false, true]) {
  test(`concurrent ${acknowledge ? "ack" : "claim"} during gateway call is not overwritten`, async () => {
    const f = fixture(); let afterClaim: HandoffRecord | undefined;
    try {
      const dispatcher = f.dispatcher({ async wake() {
        afterClaim = f.work.change(context, "handoff-1", "claim", undefined, 60000).handoff;
        if (acknowledge) afterClaim = f.work.change(context, afterClaim.id, "ack", afterClaim.claim!.fence).handoff;
        return { status: "accepted" };
      } });
      await dispatcher.tick(scope, route);
      assert.deepEqual(f.row(), afterClaim);
      assert.deepEqual(await dispatcher.tick(scope, route), []);
    } finally { f.close(); }
  });
}

test("an old in-flight result cannot overwrite a newer reserved attempt", async () => {
  const f = fixture(); const gate = deferred<{ status: "accepted" }>();
  try {
    const pending = f.dispatcher({ wake: () => gate.promise }).tick(scope, route);
    f.clock.advance(2000);
    await f.dispatcher({ wake: async () => ({ status: "failed" }) }).tick(scope, route);
    const newer = f.row();
    gate.resolve({ status: "accepted" }); await pending;
    assert.deepEqual(f.row(), newer);
    assert.equal(newer.wake?.attempts, 2);
    assert.equal(newer.wake?.lastStatus, "failed");
  } finally { gate.resolve({ status: "accepted" }); f.close(); }
});

test("two handoffs remain independently retryable", async () => {
  const f = fixture(); const calls: string[] = [];
  try {
    const dispatcher = f.dispatcher({ async wake(p) { calls.push(p.handoffId); return { status: "failed" }; } });
    await dispatcher.tick(scope, route);
    f.clock.advance(1000);
    f.store.transaction(tx => tx.put("handoffs", {
      id: "handoff-2", scope, revision: 0, ...route, eventIds: ["event-1"],
      state: "pending", claim: null, createdAt: f.clock.now() }, null));
    await dispatcher.tick(scope, route);
    assert.deepEqual(calls, ["handoff-1", "handoff-2"]);
    f.clock.advance(1000);
    await dispatcher.tick(scope, route);
    assert.deepEqual(calls, ["handoff-1", "handoff-2", "handoff-1"]);
    assert.equal(f.row("handoff-2").wake?.attempts, 1);
  } finally { f.close(); }
});

test("cancelled or changed task route is never notified", async () => {
  for (const change of [{ cancelledAt: 10000 }, { generation: 2 }, { principalId: "other" }]) {
    const f = fixture();
    try {
      f.store.transaction(tx => {
        const task = tx.get("tasks", route.taskId)!;
        tx.put("tasks", { ...task, ...change, revision: task.revision + 1 }, task.revision);
      });
      assert.deepEqual(await f.dispatcher({ wake: async () => { throw new Error("must not send"); } }).tick(scope, route), []);
      assert.equal(f.row().wake, undefined);
    } finally { f.close(); }
  }
});

const binding: GrokWakeBinding = {
  executable: "/fixture/gbot", agentId: "agent-1", taskId: route.taskId, generation: 1,
  installationRoot: "/fixture/install", releaseRoot: "/fixture/release", timeoutMs: 1000,
};
const pointer = { handoffId: "handoff-1", taskId: route.taskId, generation: 1 };

for (const style of ["gateway-flag", "gateway-subcommand"] as const) {
  test(`${style}: non-sending help discovery is cached and sends exactly once per notification`, async () => {
    const inspected: string[][] = [];
    const sends: string[][] = [];
    const prefix = style === "gateway-flag" ? "--gateway" : "gateway";
    const adapter = new GrokGatewayTaskHandoff(binding, async (_exe, args) => {
      sends.push([...args]); return "accepted";
    }, async (_exe, args) => {
      inspected.push([...args]);
      return args.length === 1 ? `${prefix}  Manage gateway` : "Commands:\n  send <agent> <prompt>";
    });
    await Promise.all([adapter.notifyExistingTask(pointer), adapter.notifyExistingTask(pointer)]);
    assert.deepEqual(inspected, [["--help"], [prefix, "--help"]]);
    assert.equal(sends.length, 2);
    for (const args of sends) {
      assert.deepEqual(args.slice(0, 3), [prefix, "send", "agent-1"]);
      assert.match(args[3]!, /pointer only/);
      assert.match(args[3]!, /work.claim --handoff-id 'handoff-1'/);
    }
  });
  test(`${style}: explicit binding bypasses inspection`, async () => {
    let sends = 0;
    const adapter = new GrokGatewayTaskHandoff({ ...binding, commandStyle: style }, async () => {
      sends++; return "accepted";
    }, async () => { throw new Error("inspection forbidden"); });
    assert.equal(await adapter.notifyExistingTask(pointer), "accepted");
    assert.equal(sends, 1);
    assert.equal(await adapter.notifyExistingTask({ ...pointer, generation: 2 }), "failed");
    assert.equal(sends, 1);
  });
}

test("unknown/ambiguous command style is cached as failure and never probed with a real send", async () => {
  for (const help of ["version 123", "--gateway legacy\ngateway modern"]) {
    let inspections = 0, sends = 0;
    const adapter = new GrokGatewayTaskHandoff(binding, async () => { sends++; return "accepted"; },
      async () => { inspections++; return help; });
    await assert.rejects(adapter.notifyExistingTask(pointer), /GROK_WAKE_COMMAND_STYLE_UNAVAILABLE/);
    await assert.rejects(adapter.notifyExistingTask(pointer), /GROK_WAKE_COMMAND_STYLE_UNAVAILABLE/);
    assert.equal(inspections, 1); assert.equal(sends, 0);
  }
  await assert.rejects(discoverGrokCommandStyle("/fixture/gbot", 1000, async () => "--gateway manage"),
    /GROK_WAKE_COMMAND_STYLE_UNAVAILABLE/);
});

test("send failure never tries a second command syntax", async () => {
  const sends: string[][] = [];
  const adapter = new GrokGatewayTaskHandoff({ ...binding, commandStyle: "gateway-subcommand" },
    async (_exe, args) => { sends.push([...args]); return "failed"; });
  assert.equal(await adapter.notifyExistingTask(pointer), "failed");
  assert.equal(sends.length, 1);
  assert.equal(sends[0]![0], "gateway");
});

test("command runner classifies missing targets, generic failure and timeout without live gateway", async () => {
  await assert.rejects(runGrokCommand(process.execPath,
    ["-e", 'console.error("Agent agent-1 not found"); process.exit(1)'], 5000), /GROK_WAKE_TARGET_UNAVAILABLE/);
  assert.equal(await runGrokCommand(process.execPath, ["-e", "process.exit(1)"], 5000), "failed");
  assert.equal(await runGrokCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], 100), "unknown");
  assert.equal(await runGrokCommand(process.execPath, ["-e", "process.exit(0)"], 5000), "accepted");
});

test("deleted target preserves work, reports stable diagnostic through pump and throttles retries", async () => {
  const f = fixture(); const reports: string[] = []; let calls = 0;
  try {
    const adapter = new GrokGatewayTaskHandoff({ ...binding, commandStyle: "gateway-flag" }, async () => {
      calls++; throw new Error("GROK_WAKE_TARGET_UNAVAILABLE");
    });
    const dispatcher = f.dispatcher(configuredGrokWake(adapter));
    const pump = new InboundPump(() => [{ scope, task: route }],
      new TextBatcher(new InboundRouter(f.store, f.clock, { route: () => route }, [])), dispatcher,
      code => reports.push(code));
    await pump.tick();
    f.clock.advance(1000); await pump.tick();
    assert.deepEqual(reports, ["GROK_WAKE_TARGET_UNAVAILABLE"]);
    assert.equal(calls, 1);
    assert.equal(f.row().state, "pending");
    assert.equal(f.row().wake?.lastStatus, "failed");
    assert.deepEqual(f.row().eventIds, ["event-1"]);
    f.clock.advance(1000); await pump.tick();
    assert.equal(calls, 2);
    assert.equal(f.row().wake?.attempts, 2);
    await pump.stop();
  } finally { f.close(); }
});
