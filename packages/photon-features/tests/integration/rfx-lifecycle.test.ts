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
import { bootstrapOrValidateAuthority, configuredAuthority } from "../../src/host/authority.js";
import { setupProductionInstallation, changeProductionActivation, validateProductionInstallation, processMain } from "../../src/host/process.js";
import { supervisorGuidance } from "../../src/host/supervisor.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { administerAuthority, inspectAuthority } from "../../src/host/authority-admin.js";
import { DurableWork } from "../../src/runtime/core/work-handoff.js";
import { DurableRecovery } from "../../src/runtime/core/recovery.js";
import { requestIdentity } from "../../src/runtime/core/idempotency.js";
import type { Action, ResourceRef } from "../../src/contracts/index.js";
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

// These characterize the existing audited renewal contract; passing them proves
// the lifecycle cannot safely automate it as an identity-preserving extension.
async function renewalFixture(t: Parameters<typeof privateTestRoot>[0], expired: boolean) {
  const f = await fixture(t);
  const config = await loadProductionHostConfiguration(f.root);
  const now = Date.now();
  config.task.issuedAt = now - 120_000;
  config.task.expiresAt = now + (expired ? -60_000 : 60_000);
  const credential = join(f.runtime, "owner-token");
  await writeFile(credential, "d".repeat(64), { mode: 0o600 });
  config.ownerAdministration = { principalId: "owner-admin", credentialFile: credential };
  await writeFile(join(f.runtime, "configuration.json"), JSON.stringify(config), { mode: 0o600 });
  const { context } = configuredAuthority(config);
  const store = new DurableSQLiteStore(config.runtime.statePath);
  const atIssue = context.issuedAt + 1;
  bootstrapOrValidateAuthority(store, context, config.provider.conversationId, atIssue);
  const message: ResourceRef = { version: 1, kind: "message", id: "retained-message", scope: context.scope };
  store.transaction(tx => {
    tx.put("references", { id: message.id, scope: context.scope, revision: 0, reference: message,
      providerId: "offline-provider-message", ownedByPrincipalId: context.principalId,
      taskId: context.taskId, generation: context.generation }, null);
    tx.put("handoffs", { id: "retained-handoff", scope: context.scope, revision: 0,
      taskId: context.taskId, generation: context.generation, principalId: context.principalId,
      eventIds: [], state: "pending", claim: null, createdAt: atIssue }, null);
  });
  const action: Action = { version: 1, contextId: context.contextId, idempotencyKey: "retained-request",
    operation: "text.send", arguments: { space: { version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope }, text: "offline pending work" } };
  const contexts = new DurableContexts(store, { now: () => atIssue });
  const queued = await new DurableSubmission(store, contexts).submit(action, context);
  store.close();
  const inspected = await inspectAuthority(f.root, f.releaseRoot, credential);
  const next = { ...context, contextId: "renewed-context", generation: context.generation + 1,
    issuedAt: now, expiresAt: now + 86_400_000 };
  const request = { version: 1 as const, requestId: "renewal-request", mode: "renew" as const,
    expectedContext: inspected.expectedContext, expectedContextRevision: inspected.expectedContextRevision,
    expectedTaskRevision: inspected.expectedTaskRevision, nextContext: next, reason: "offline renewal contract characterization" };
  const requestFile = join(f.runtime, "authority-request.json");
  return { ...f, config, credential, context, message, action, queued, request, requestFile,
    apply: async (value = request, token = credential) => {
      await writeFile(requestFile, JSON.stringify(value), { mode: 0o600 });
      return administerAuthority(f.root, f.releaseRoot, requestFile, token);
    } };
}

for (const expired of [false, true]) {
  const phase = expired ? "after expiry" : "before expiry";
  test(`renewal blocker ${phase}: authenticated same-identity extension is refused without mutation`, async t => {
    const f = await renewalFixture(t, expired);
    const before = await readFile(join(f.runtime, "configuration.json"), "utf8");
    await assert.rejects(f.apply({ ...f.request, nextContext: { ...f.context, expiresAt: f.request.nextContext.expiresAt } }), /INVALID_AUTHORITY_SUCCESSOR/);
    assert.equal(await readFile(join(f.runtime, "configuration.json"), "utf8"), before);
    const store = new DurableSQLiteStore(f.config.runtime.statePath);
    try {
      assert.deepEqual(store.transaction(tx => tx.get("contexts", f.context.contextId))?.context, f.context);
      assert.equal(store.scan("authorityAudits").length, 0);
      assert.equal(store.transaction(tx => tx.get("handoffs", "retained-handoff"))?.state, "pending");
      assert.equal(store.transaction(tx => tx.get("outbox", f.queued.requestId))?.result.status, "queued");
    } finally { store.close(); }
  });

  test(`renewal blocker ${phase}: audited generation rotation fences existing resources and work`, async t => {
    const f = await renewalFixture(t, expired);
    await assert.rejects(f.apply(f.request, f.config.local.credentialFile), /OWNER_AUTHENTICATION_REQUIRED/);
    assert.equal((await f.apply()).generation, f.context.generation + 1);
    assert.equal((await f.apply()).generation, f.context.generation + 1, "exact audited request replay is idempotent");
    const store = new DurableSQLiteStore(f.config.runtime.statePath);
    try {
      const next = f.request.nextContext;
      const contexts = new DurableContexts(store, { now: Date.now });
      const work = new DurableWork(store, contexts);
      assert.equal(store.scan("authorityAudits").length, 1);
      assert.equal(store.transaction(tx => tx.get("tasks", f.context.taskId))?.generation, next.generation);
      assert.equal(store.transaction(tx => tx.get("contexts", f.context.contextId))?.context.revokedAt !== null, true);
      assert.deepEqual(work.list(next, 100), [], "pending old-generation work is hidden from successor");
      assert.throws(() => work.change(next, "retained-handoff", "claim"), /RESOURCE_NOT_FOUND/);
      assert.throws(() => store.transaction(tx => contexts.reference(tx, next, f.message)), /RESOURCE_NOT_FOUND/);
      assert.throws(() => store.transaction(tx => contexts.owned(tx, f.queued.requestId, next)), /RESOURCE_NOT_FOUND/);
      assert.notEqual(requestIdentity(f.action, f.context), requestIdentity({ ...f.action, contextId: next.contextId }, next),
        "resubmitting the same key under the successor does not preserve request identity");
      new DurableRecovery(store, contexts).recover();
      assert.equal(store.transaction(tx => tx.get("outbox", f.queued.requestId))?.result.status, "blocked");
      assert.equal(store.transaction(tx => tx.get("outbox", f.queued.requestId))?.result.error?.code, "CONTEXT_REVOKED");
      assert.equal(store.transaction(tx => tx.get("handoffs", "retained-handoff"))?.state, "pending");
      assert.equal(store.transaction(tx => tx.get("references", f.message.id))?.generation, f.context.generation);
    } finally { store.close(); }
  });
}

for (const invalidation of ["revoked", "cancelled"] as const) {
  test(`renewal safeguards: authenticated ${invalidation} authority cannot renew`, async t => {
    const f = await renewalFixture(t, true);
    const store = new DurableSQLiteStore(f.config.runtime.statePath);
    try {
      store.transaction(tx => {
        if (invalidation === "revoked") {
          const row = tx.get("contexts", f.context.contextId)!;
          tx.put("contexts", { ...row, revision: row.revision + 1,
            context: { ...row.context, revokedAt: Date.now() } }, row.revision);
        } else {
          const row = tx.get("tasks", f.context.taskId)!;
          tx.put("tasks", { ...row, revision: row.revision + 1, cancelledAt: Date.now() }, row.revision);
        }
      });
      const inspected = await inspectAuthority(f.root, f.releaseRoot, f.credential);
      await assert.rejects(f.apply({ ...f.request, expectedContext: inspected.expectedContext,
        expectedContextRevision: inspected.expectedContextRevision, expectedTaskRevision: inspected.expectedTaskRevision }), /AUTHORITY_CANNOT_BE_RENEWED/);
      assert.equal(store.scan("authorityAudits").length, 0);
      assert.equal(store.transaction(tx => tx.get("handoffs", "retained-handoff"))?.generation, f.context.generation);
    } finally { store.close(); }
  });
}

test("renewal safeguards: expired legacy authority is not auto-renewed or reseeded by setup/start", async t => {
  const f = await renewalFixture(t, true);
  await assert.rejects(setupProductionInstallation(f.root, f.releaseRoot, { activateAfterValidation: true }), /EXPIRED_TASK_BINDING/);
  const h = host(t, f);
  assert.deepEqual(await h.exited, [1, null]);
  assert.match(h.stderr(), /EXPIRED_TASK_BINDING/);
  assert.doesNotMatch(h.stdout(), /sdk-start|ready/);
  const store = new DurableSQLiteStore(f.config.runtime.statePath);
  try {
    assert.deepEqual(store.transaction(tx => tx.get("contexts", f.context.contextId))?.context, f.context);
    assert.equal(store.scan("authorityAudits").length, 0);
    assert.equal(store.transaction(tx => tx.get("handoffs", "retained-handoff"))?.state, "pending");
  } finally { store.close(); }
  assert.equal((await loadProductionHostConfiguration(f.root)).activation, "disabled");
});
