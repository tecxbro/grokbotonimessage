import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { acquireHostOwnership, reconcileHostOwnership } from "../../src/host/owner-lock.js";
import { loadProductionHostConfiguration } from "../../src/host/configuration.js";
import { configuredAuthority } from "../../src/host/authority.js";
import { setupProductionInstallation, changeProductionActivation, validateProductionInstallation, processMain } from "../../src/host/process.js";
import { supervisorGuidance } from "../../src/host/supervisor.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { DurableSubmission } from "../../src/runtime/core/submission.js";
import { DurableContexts } from "../../src/runtime/core/authorization.js";
import { privateTestRoot } from "../helpers/private-temp.js";

async function fixture(t: Parameters<typeof privateTestRoot>[0]) {
  const root = await privateTestRoot(t, "rfx-");
  const runtime = join(root, "runtime"), releases = join(root, "releases");
  await mkdir(runtime, { mode: 0o700 });
  await mkdir(releases, { mode: 0o700 });
  await mkdir(join(runtime, "captures"), { mode: 0o700 });
  await mkdir(join(runtime, "staging"), { mode: 0o700 });
  const release = "b".repeat(64), releaseRoot = join(releases, release);
  await mkdir(releaseRoot, { mode: 0o700 });
  const skill = "release-pinned-skill\n";
  await writeFile(join(releaseRoot, "SKILL.md"), skill, { mode: 0o600 });
  await writeFile(join(releaseRoot, "release-manifest.json"), JSON.stringify({ checksum: release,
    files: [{ path: "SKILL.md", mode: 0o600,
      sha256: createHash("sha256").update(skill).digest("hex") }] }) + "\n", { mode: 0o600 });
  await writeFile(join(root, "selected-release.json"), JSON.stringify({ version: 1, release,
    activation: "disabled" }) + "\n", { mode: 0o600 });
  const secret = join(runtime, "project-secret"), credential = join(runtime, "local-token");
  await writeFile(secret, "project-secret\n", { mode: 0o600 });
  await writeFile(credential, "c".repeat(64) + "\n", { mode: 0o600 });
  const now = Date.now();
  await writeFile(join(runtime, "configuration.json"), JSON.stringify({ version: 2, activation: "disabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1", projectSecretFile: secret,
      accountId: "account-1", lineId: "line-1", phone: "+15555550101",
      conversationId: "conversation-1", dedicated: true, availableOperations: ["text.send", "typing.begin", "typing.end"] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile: credential,
      principalId: "grok-photon", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 1, permissions: ["text.send", "typing.begin", "typing.end"],
      issuedAt: now - 10_000, expiresAt: now + 600_000, grokAgentId: "agent-1" },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [], runtime: { statePath: join(runtime, "state.sqlite"),
      captureDirectory: join(runtime, "captures"), stagingDirectory: join(runtime, "staging") } }) + "\n",
  { mode: 0o600 });
  return { root, runtime, release, releaseRoot };
}

async function until(check: () => boolean, diagnostic: () => string = () => "condition timed out") {
  for (let i = 0; i < 500; i++) { if (check()) return; await delay(10); }
  assert.fail(diagnostic());
}

// Exercises the actual process coordinator, SQLite, pump and Unix socket. Only
// provider/Grok boundaries are offline; no production config accepts these hooks.
function host(t: Parameters<typeof privateTestRoot>[0], f: Awaited<ReturnType<typeof fixture>>,
  mode = "normal") {
  const script = `
    import { runProductionHost } from ${JSON.stringify(new URL("../../src/host/process.js", import.meta.url).href)};
    import { resolveContents } from "spectrum-ts";
    const emit = event => console.log(JSON.stringify({event}));
    let finish;
    const stopped = new Promise(resolve => finish = resolve);
    const space = { id: "conversation-1", __platform: "imessage", phone: "+15555550101",
      startTyping: async () => emit("typing-start"), stopTyping: async () => emit("typing-stop"),
      send: async input => { emit("send"); return { id: "offline-receipt", platform: "imessage", space,
        content: (await resolveContents([input]))[0], direction: "outbound", timestamp: new Date() }; } };
    try {
      await runProductionHost(${JSON.stringify(f.root)}, ${JSON.stringify(f.releaseRoot)}, {
        sdkFactory: async () => {
          emit("sdk-start");
          if (${JSON.stringify(mode)} === "start-failure") throw new Error("OFFLINE_START_FAILURE");
          return { messages: () => {
              if (${JSON.stringify(mode)} === "rollback-failure") throw new Error("OFFLINE_INGRESS_FAILURE");
              return { async *[Symbol.asyncIterator]() { await stopped; } };
            },
            space: async () => space, provider: () => ({ space: {}, getMembers: async () => [] }),
            stop: async () => { emit("sdk-stopping"); await new Promise(r => setTimeout(r, 100)); finish(); emit("sdk-stop");
              if (["stop-failure", "rollback-failure"].includes(${JSON.stringify(mode)})) throw new Error("OFFLINE_STOP_FAILURE"); } };
        },
        grokCommandStyle: "gateway-flag",
        grokRunner: async () => { emit("wake"); return "failed"; }
      });
      emit("stopped");
    } catch (error) { console.error(error); process.exitCode = 1; }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const exited = once(child, "exit");
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; } });
  return { child, exited, stdout: () => stdout, stderr: () => stderr,
    ready: () => until(() => stdout.includes('"status":"ready"'), () => stdout + stderr),
    event: (name: string) => until(() => stdout.includes(JSON.stringify({event: name})), () => stdout + stderr),
    stop: async (signal: NodeJS.Signals = "SIGTERM") => {
      child.kill(signal);
      assert.deepEqual(await exited, [0, null], stderr);
    } };
}

async function request(f: Awaited<ReturnType<typeof fixture>>, value: unknown): Promise<any> {
  const socket = createConnection(join(f.runtime, "runtime.sock"));
  socket.setEncoding("utf8");
  await once(socket, "connect");
  socket.write(JSON.stringify({ token: "c".repeat(64), request: value }) + "\n");
  let body = "";
  for await (const part of socket) body += part;
  return JSON.parse(body);
}

const absent = (path: string) => assert.rejects(lstat(path), { code: "ENOENT" });

test("validate -> enable -> run -> ready, single owner, SIGTERM drains typing/socket/SDK", async t => {
  const f = await fixture(t);
  assert.equal((await validateProductionInstallation(f.root, f.releaseRoot)).activation, "disabled");
  await changeProductionActivation(f.root, f.releaseRoot, "enabled");
  const h = host(t, f);
  await h.ready();
  assert.equal((await reconcileHostOwnership(f.runtime)).status, "live");
  await assert.rejects(acquireHostOwnership(f.runtime, f.release), /SOCKET_PATH_EXISTS|HOST_OWNER_EXISTS/);
  await assert.rejects(reconcileHostOwnership(f.runtime, { recoverStale: true }), /HOST_OWNER_LIVE/);
  const competitor = host(t, f);
  assert.deepEqual(await competitor.exited, [1, null]);
  assert.doesNotMatch(competitor.stdout(), /sdk-start|ready/);
  const c = await loadProductionHostConfiguration(f.root);
  const { context } = configuredAuthority(c);
  const result = await request(f, { version: 1, method: "submit", action: { version: 1,
    contextId: context.contextId, idempotencyKey: "typing-before-stop", operation: "typing.begin",
    arguments: { space: { version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope }, ttlMs: 30000 } } });
  assert.equal(result.ok, true, JSON.stringify(result));
  await h.event("typing-start");
  h.child.kill("SIGTERM");
  await h.event("sdk-stopping");
  h.child.kill("SIGTERM"); // second signal must not terminate cleanup
  assert.deepEqual(await h.exited, [0, null], h.stderr());
  assert.ok(h.stdout().indexOf('"typing-stop"') < h.stdout().indexOf('"sdk-stop"'));
  assert.match(h.stdout(), /"typing-stop"/);
  await absent(join(f.runtime, "host.lock"));
  await absent(join(f.runtime, "runtime.sock"));
  assert.ok((await lstat(join(f.runtime, "state.sqlite"))).isFile());
});

test("authorized setup enables without another prompt; default setup stays disabled and invalid config cannot enable", async t => {
  const f = await fixture(t);
  assert.equal((await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: false })).activation, "disabled");
  const setup = await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  assert.equal(setup.activation, "enabled");
  assert.equal(typeof setup.start, "function");
  assert.ok(setup.supervisor.argv.includes("run"));
  await changeProductionActivation(f.root, f.releaseRoot, "disabled");
  await writeFile(join(f.runtime, "local-token"), "invalid", { mode: 0o600 });
  await assert.rejects(setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true }), /INVALID_LOCAL_CREDENTIAL/);
  assert.equal((await loadProductionHostConfiguration(f.root)).activation, "disabled");
  assert.equal(await processMain(["setup", "--installation-root", f.root, "--activate-after-validation"], f.releaseRoot), 1);
});

test("same-state restart preserves pending handoff and drains queued outbox once", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const c = await loadProductionHostConfiguration(f.root), { context } = configuredAuthority(c);
  const store = new DurableSQLiteStore(c.runtime.statePath);
  store.transaction(tx => tx.put("handoffs", { id: "pending-before-start", scope: context.scope, revision: 0,
    taskId: context.taskId, generation: context.generation, principalId: context.principalId,
    eventIds: [], state: "pending", claim: null, createdAt: Date.now() }, null));
  const submission = new DurableSubmission(store, new DurableContexts(store, { now: Date.now },
    { administrativeIntent: () => false, recipientsAllowed: () => false }));
  const queued = await submission.submit({ version: 1, contextId: context.contextId, idempotencyKey: "restart-send",
    operation: "text.send", arguments: { space: { version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope }, text: "offline" } }, context);
  store.close();
  const inode = (await lstat(c.runtime.statePath)).ino;
  for (let attempt = 0; attempt < 2; attempt++) {
    const h = host(t, f); await h.ready();
    // RFX-02 owns wake retry timing: restart must not demand an immediate re-wake.
    if (attempt === 0) { await h.event("wake"); await h.event("send"); }
    await h.stop(attempt === 0 ? "SIGTERM" : "SIGINT");
    if (attempt === 1) assert.doesNotMatch(h.stdout(), /"event":"send"/);
    const reopened = new DurableSQLiteStore(c.runtime.statePath);
    try {
      assert.equal(reopened.transaction(tx => tx.get("handoffs", "pending-before-start"))?.state, "pending");
      assert.equal(reopened.transaction(tx => tx.get("outbox", queued.requestId))?.result.status, "provider-accepted");
      assert.deepEqual(reopened.transaction(tx => tx.get("contexts", context.contextId))?.context, context);
    } finally { reopened.close(); }
    assert.equal((await lstat(c.runtime.statePath)).ino, inode);
    await absent(join(f.runtime, "host.lock")); await absent(join(f.runtime, "runtime.sock"));
  }
});

test("stale owner/socket survive startup and reconcile; explicit recovery removes only dead artifacts", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const h = host(t, f); await h.ready(); h.child.kill("SIGKILL"); await h.exited;
  const state = await readFile(join(f.runtime, "state.sqlite"));
  assert.equal((await reconcileHostOwnership(f.runtime)).status, "stale");
  await assert.rejects(acquireHostOwnership(f.runtime, f.release), /SOCKET_PATH_EXISTS/);
  assert.ok((await lstat(join(f.runtime, "host.lock"))).isFile());
  assert.ok((await lstat(join(f.runtime, "runtime.sock"))).isSocket());
  assert.equal(await processMain(["recover-stale", "--installation-root", f.root], f.releaseRoot), 0);
  await absent(join(f.runtime, "host.lock")); await absent(join(f.runtime, "runtime.sock"));
  assert.deepEqual(await readFile(join(f.runtime, "state.sqlite")), state);
  const replacement = host(t, f); await replacement.ready(); await replacement.stop();
});

test("malformed, foreign owner and orphan artifacts cannot be recovered", async t => {
  const f = await fixture(t), lock = join(f.runtime, "host.lock");
  for (const body of ["{}", JSON.stringify({version: 1, pid: process.pid, uid: -1, release: f.release, nonce: "n", startedAt: 1})]) {
    await writeFile(lock, body, { mode: 0o600 });
    assert.equal((await reconcileHostOwnership(f.runtime)).status, "unknown");
    await assert.rejects(reconcileHostOwnership(f.runtime, { recoverStale: true }), /STALE_OWNERSHIP_UNPROVEN/);
    assert.equal(await readFile(lock, "utf8"), body);
  }
  await unlink(lock);
  await writeFile(join(f.runtime, "runtime.sock"), "not a socket", { mode: 0o600 });
  assert.equal((await reconcileHostOwnership(f.runtime)).status, "unknown");
  await assert.rejects(reconcileHostOwnership(f.runtime, { recoverStale: true }), /STALE_OWNERSHIP_UNPROVEN/);
  assert.equal(await readFile(join(f.runtime, "runtime.sock"), "utf8"), "not a socket");
});

test("startup failure never announces ready and releases clean ownership", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const h = host(t, f, "start-failure");
  assert.deepEqual(await h.exited, [1, null]);
  assert.doesNotMatch(h.stdout(), /"status":"ready"/);
  await absent(join(f.runtime, "host.lock")); await absent(join(f.runtime, "runtime.sock"));
});

test("supervisor guidance covers macOS, systemd VMs, containers and other VMs without installation", () => {
  for (const [platform, container, systemd, manager] of [
    ["darwin", false, false, "launchd"], ["linux", false, true, "systemd-user"],
    ["linux", true, true, "container"], ["linux", false, false, "portable"],
  ] as const) {
    const guidance = supervisorGuidance("/tmp/install with ' quote", "/tmp/release", { platform, container, systemd });
    assert.equal(guidance.manager, manager);
    assert.equal(guidance.uid, process.getuid?.());
    assert.equal(guidance.stopSignal, "SIGTERM");
    assert.deepEqual(guidance.argv.slice(-3), ["run", "--installation-root", "/tmp/install with ' quote"]);
    assert.equal(guidance.statePath, "/tmp/install with ' quote/runtime/state.sqlite");
  }
});

test("shutdown failure retains owner lock and fails instead of reporting a clean stop", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const h = host(t, f, "stop-failure"); await h.ready(); h.child.kill("SIGTERM");
  assert.deepEqual(await h.exited, [1, null]);
  assert.match(h.stderr(), /HOST_SHUTDOWN_FAILED/);
  assert.ok((await lstat(join(f.runtime, "host.lock"))).isFile());
  await absent(join(f.runtime, "runtime.sock"));
  assert.equal((await reconcileHostOwnership(f.runtime)).status, "stale");
});

test("startup recovers a pending inbox event into one durable handoff across restart", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const c = await loadProductionHostConfiguration(f.root), { context } = configuredAuthority(c);
  const store = new DurableSQLiteStore(c.runtime.statePath);
  store.transaction(tx => tx.put("inbox", { id: "pending-inbox", scope: context.scope, revision: 0, state: "pending",
    event: { version: 1, eventId: "pending-inbox", scope: context.scope, direction: "inbound", occurredAt: Date.now(),
      receivedAt: Date.now() - 3000, ordering: { source: "offline" }, targets: [], type: "message", senderId: "sender",
      message: { version: 1, kind: "message", id: "message", scope: context.scope }, content: { type: "text", text: "pending input" }, change: "created" }
  }, null));
  store.close();
  let handoffId: string | undefined;
  for (let i = 0; i < 2; i++) {
    const h = host(t, f); await h.ready(); await h.stop();
    const reopened = new DurableSQLiteStore(c.runtime.statePath);
    try {
      assert.equal(reopened.transaction(tx => tx.get("inbox", "pending-inbox"))?.state, "reduced");
      const handoffs = reopened.scan("handoffs");
      assert.equal(handoffs.length, 1);
      assert.deepEqual(handoffs[0]!.eventIds, ["pending-inbox"]);
      if (handoffId) assert.equal(handoffs[0]!.id, handoffId);
      handoffId = handoffs[0]!.id;
    } finally { reopened.close(); }
  }
});

test("setup CLI accepts prior activation authorization and prints supervisor guidance", async t => {
  const f = await fixture(t);
  assert.equal(await processMain(["setup", "--installation-root", f.root, "--activate-after-validation"], f.releaseRoot), 0);
  assert.equal((await loadProductionHostConfiguration(f.root)).activation, "enabled");
  assert.equal(await processMain(["supervisor", "--installation-root", f.root], f.releaseRoot), 0);
  assert.equal(await processMain(["reconcile", "--installation-root", f.root], f.releaseRoot), 0);
  await absent(join(f.runtime, "host.lock")); await absent(join(f.runtime, "runtime.sock"));
});

test("failed startup rollback retains ownership for explicit reconciliation", async t => {
  const f = await fixture(t);
  await setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true });
  const h = host(t, f, "rollback-failure");
  assert.deepEqual(await h.exited, [1, null]);
  assert.match(h.stderr(), /HOST_SHUTDOWN_FAILED/);
  assert.doesNotMatch(h.stdout(), /"status":"ready"/);
  assert.ok((await lstat(join(f.runtime, "host.lock"))).isFile());
});
