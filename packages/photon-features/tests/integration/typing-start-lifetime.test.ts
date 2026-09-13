import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  resolveContents,
  type ContentInput,
  type Message,
  type Space,
} from "spectrum-ts";
import type {
  Action,
  Capability,
  Operation,
  OperationResult,
  ResourceRef,
  TrustedContext,
} from "../../src/contracts/index.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { ProviderContext } from "../../src/adapters/transport/provider-context.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import { createFeatureModule as createTextFeature } from "../../src/features/text-messages/module.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition } from "../../src/host/production.js";
import { HostTypingBinding } from "../../src/host/typing-binding.js";
import { DurableContexts } from "../../src/runtime/core/authorization.js";
import { ExecutionClaims } from "../../src/runtime/core/claims.js";
import { executeOperation } from "../../src/runtime/core/executor.js";
import { DurableRecovery } from "../../src/runtime/core/recovery.js";
import { DurableSubmission } from "../../src/runtime/core/submission.js";
import { TypingLeases } from "../../src/runtime/typing/leases.js";
import { executeTypingOperation } from "../../src/runtime/typing/operations.js";
import { FixedClock } from "../fixtures/harness.js";
import { privateTestRoot } from "../helpers/private-temp.js";
import { deferred, settle } from "../lanes/wt-02/helpers.js";

type TypingAction = Extract<
  Action,
  { operation: "typing.begin" | "typing.end" }
>;

const capability = (operation: Operation): Capability => ({
  operation,
  implementation: "implemented",
  providerSupport: "native",
  availability: {
    account: "available",
    conversation: "available",
    checkedAt: 10000,
  },
  direction: { inbound: "not-applicable", outbound: "implemented" },
  evidence: [],
  sdkVersion: "12.8.0",
  sources: [],
  blockers: ["Offline controlled provider double; no device evidence."],
});

async function fixture(t: TestContext) {
  const root = await privateTestRoot(t, "typing-life-");
  const clock = new FixedClock(10000);
  const phone = "+15555550101";
  const conversationId = "conversation-1";
  const routes = new ProviderContext("project-1", [
    { accountId: "account-1", lineId: "line-1", phone },
  ]);
  const scope = routes.inbound(phone, conversationId);
  const context: TrustedContext = {
    version: 1,
    contextId: "context-1",
    principalId: "principal-1",
    scope,
    taskId: "task-1",
    generation: 1,
    permissions: ["typing.begin", "typing.end", "text.send"],
    issuedAt: 1000,
    expiresAt: 20000,
    revokedAt: null,
  };
  const store = new DurableSQLiteStore(join(root, "state.sqlite"), () => clock.now());
  t.after(() => store.close());
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1,
    kind: "space",
    id: scope.spaceId,
    scope,
  };
  store.transaction((tx) => {
    tx.put("tasks", {
      id: context.taskId,
      scope,
      revision: 0,
      principalId: context.principalId,
      generation: context.generation,
      cancelledAt: null,
    }, null);
    tx.put("contexts", {
      id: context.contextId,
      scope,
      revision: 0,
      context,
    }, null);
    tx.put("references", {
      id: spaceRef.id,
      scope,
      revision: 0,
      reference: spaceRef,
      providerId: conversationId,
      ownedByPrincipalId: context.principalId,
      taskId: context.taskId,
      generation: context.generation,
    }, null);
  });
  const contexts = new DurableContexts(store, clock);
  const submission = new DurableSubmission(store, contexts);
  const claims = new ExecutionClaims(store, contexts);
  const bindings = new HostTypingBinding(claims, routes, {
    scope,
    conversationId,
    phone,
  });
  let replies = 0;
  const sdkSpace = {
    id: conversationId,
    __platform: "imessage",
    phone,
    send: async (input: ContentInput) => {
      replies++;
      const content = (await resolveContents([input]))[0]!;
      return {
        id: `reply-${replies}`,
        platform: "imessage",
        space: sdkSpace,
        content,
        direction: "outbound",
        timestamp: new Date(clock.now()),
      } as unknown as Message;
    },
  } as unknown as Space;
  const resources = {
    resolve: async (reference: ResourceRef) => reference,
    space: async () => sdkSpace,
    message: async () => {
      throw new Error("UNEXPECTED_MESSAGE");
    },
  };
  const media = {
    resolve: async (): Promise<never> => {
      throw new Error("UNEXPECTED_MEDIA");
    },
  };
  const streams = {
    open: async (): Promise<never> => {
      throw new Error("UNEXPECTED_STREAM");
    },
  };
  const begin = (key = "typing-begin", ttlMs = 1000): Extract<
    Action,
    { operation: "typing.begin" }
  > => ({
    version: 1,
    contextId: context.contextId,
    idempotencyKey: key,
    operation: "typing.begin",
    arguments: { space: spaceRef, ttlMs },
  });
  const end = (key = "typing-end"): Extract<
    Action,
    { operation: "typing.end" }
  > => ({
    version: 1,
    contextId: context.contextId,
    idempotencyKey: key,
    operation: "typing.end",
    arguments: { space: spaceRef },
  });
  const text = (key = "text-reply"): Extract<
    Action,
    { operation: "text.send" }
  > => ({
    version: 1,
    contextId: context.contextId,
    idempotencyKey: key,
    operation: "text.send",
    arguments: { space: spaceRef, text: "reply while typing is unresolved" },
  });
  return {
    clock,
    phone,
    conversationId,
    routes,
    scope,
    context,
    store,
    contexts,
    submission,
    claims,
    bindings,
    resources,
    media,
    streams,
    replies: () => replies,
    begin,
    end,
    text,
  };
}

async function startTypingExecution(
  f: Awaited<ReturnType<typeof fixture>>,
  leases: TypingLeases,
  action: TypingAction,
  afterScheduled?: (result: OperationResult) => Promise<OperationResult>,
) {
  const submitted = await f.submission.submit(action, f.context);
  const execution = executeOperation({
    claims: f.claims,
    requestId: submitted.requestId,
    capability: () => capability(action.operation),
    resources: f.resources,
    media: f.media,
    streams: f.streams,
    leaseMs: 1000,
    deadlineMs: 1000,
    handler: async (request, services) => {
      const result = await executeTypingOperation(
        leases,
        request as TypingAction,
        services,
        f.bindings.bind(request as TypingAction, services),
      );
      return afterScheduled ? afterScheduled(result) : result;
    },
  });
  return { submitted, execution };
}

async function executeText(
  f: Awaited<ReturnType<typeof fixture>>,
  action = f.text(),
): Promise<OperationResult | null> {
  const provider = {
    provider: "imessage" as const,
    scope: f.scope,
    ready: () => true,
    start: async () => {},
    stop: async () => {},
  };
  const feature = createTextFeature({
    provider,
    binding: () => ({
      scope: f.scope,
      phone: f.phone,
      nativeSpaceId: f.conversationId,
    }),
    resources: f.resources,
  });
  const submitted = await f.submission.submit(action, f.context);
  return executeOperation({
    claims: f.claims,
    requestId: submitted.requestId,
    capability: () => capability("text.send"),
    resources: f.resources,
    media: f.media,
    streams: f.streams,
    leaseMs: 1000,
    deadlineMs: 1000,
    handler: feature.handlers["text.send"]!,
  });
}

test("a delayed typing lookup dispatches after its scheduling claim is released and does not block a reply", async (t) => {
  const f = await fixture(t);
  const lookup = deferred<{
    startTyping(): Promise<void>;
    stopTyping(): Promise<void>;
  }>();
  let starts = 0;
  let stops = 0;
  const leases = new TypingLeases(f.clock, () => lookup.promise);
  t.after(() => leases.shutdown());

  const scheduled = await startTypingExecution(f, leases, f.begin());
  const result = await scheduled.execution;
  assert.equal(result?.status, "executor-completed");
  assert.equal(f.store.scan("outbox")[0]?.claim, null);

  const reply = await executeText(f);
  assert.equal(reply?.status, "provider-accepted");
  assert.equal(f.replies(), 1);

  lookup.resolve({
    startTyping: async () => {
      starts++;
    },
    stopTyping: async () => {
      stops++;
    },
  });
  await settle();
  assert.equal(starts, 1, "the exact issued lease must reach startTyping");
  assert.equal(stops, 0);
});

test("typing.end before lookup completion prevents a late typing flash", async (t) => {
  const f = await fixture(t);
  const lookup = deferred<{
    startTyping(): Promise<void>;
    stopTyping(): Promise<void>;
  }>();
  let starts = 0;
  let stops = 0;
  const leases = new TypingLeases(f.clock, () => lookup.promise);
  t.after(() => leases.shutdown());
  assert.equal((await (await startTypingExecution(f, leases, f.begin())).execution)?.status,
    "executor-completed");
  assert.equal((await (await startTypingExecution(f, leases, f.end())).execution)?.status,
    "executor-completed");
  lookup.resolve({
    startTyping: async () => { starts++; },
    stopTyping: async () => { stops++; },
  });
  await settle();
  assert.deepEqual({ starts, stops }, { starts: 0, stops: 0 });
});

for (const denial of [
  "cancellation",
  "revocation",
  "expiry",
  "permissions",
  "ownership",
  "generation",
] as const) {
  test(`${denial} invalidates a delayed issued lease before provider dispatch`, async (t) => {
    const f = await fixture(t);
    const lookup = deferred<{
      startTyping(): Promise<void>;
      stopTyping(): Promise<void>;
    }>();
    const reports: string[] = [];
    let starts = 0;
    let stops = 0;
    const leases = new TypingLeases(
      f.clock,
      () => lookup.promise,
      undefined,
      (code) => reports.push(code),
    );
    t.after(() => leases.shutdown());
    assert.equal((await (await startTypingExecution(f, leases, f.begin())).execution)?.status,
      "executor-completed");
    f.store.transaction((tx) => {
      if (denial === "cancellation" || denial === "generation") {
        const row = tx.get("tasks", f.context.taskId)!;
        tx.put("tasks", {
          ...row,
          revision: row.revision + 1,
          ...(denial === "cancellation"
            ? { cancelledAt: f.clock.now() }
            : { generation: row.generation + 1 }),
        }, row.revision);
      } else if (
        denial === "revocation" ||
        denial === "expiry" ||
        denial === "permissions"
      ) {
        const row = tx.get("contexts", f.context.contextId)!;
        tx.put("contexts", {
          ...row,
          revision: row.revision + 1,
          context: {
            ...row.context,
            ...(denial === "revocation"
              ? { revokedAt: f.clock.now() }
              : denial === "expiry"
                ? { expiresAt: f.clock.now() }
                : { permissions: ["typing.end", "text.send"] as Operation[] }),
          },
        }, row.revision);
      } else {
        const row = tx.get("references", f.scope.spaceId)!;
        tx.put("references", {
          ...row,
          revision: row.revision + 1,
          ownedByPrincipalId: "replacement-principal",
        }, row.revision);
      }
    });
    lookup.resolve({
      startTyping: async () => { starts++; },
      stopTyping: async () => { stops++; },
    });
    await settle();
    assert.deepEqual({ starts, stops }, { starts: 0, stops: 0 });
    assert.ok(reports.includes("TYPING_AUTHORIZATION_REJECTED"));
    assert.ok(!reports.includes("TYPING_PROVIDER_FAILURE"));
  });
}

test("recovery and reassignment cannot reactivate the old owner's lease", async (t) => {
  const f = await fixture(t);
  const lookup = deferred<{
    startTyping(): Promise<void>;
    stopTyping(): Promise<void>;
  }>();
  const confirmed = deferred();
  const finish = deferred();
  const reports: string[] = [];
  let starts = 0;
  let stops = 0;
  const leases = new TypingLeases(
    f.clock,
    () => lookup.promise,
    undefined,
    (code) => reports.push(code),
  );
  t.after(() => leases.shutdown());
  const begin = f.begin();
  const first = await startTypingExecution(f, leases, begin, async (result) => {
    confirmed.resolve();
    await finish.promise;
    return result;
  });
  await confirmed.promise;
  f.store.transaction((tx) => {
    const row = tx.get("outbox", first.submitted.requestId)!;
    assert.ok(row.claim);
    tx.put("outbox", {
      ...row,
      revision: row.revision + 1,
      claim: { ...row.claim!, leaseUntil: f.clock.now() },
    }, row.revision);
  });
  assert.equal(new DurableRecovery(f.store, f.contexts).recover().requeued, 1);
  const replacement = await startTypingExecution(f, leases, begin);
  assert.equal((await replacement.execution)?.status, "executor-completed");
  finish.resolve();
  assert.equal(await first.execution, null);

  lookup.resolve({
    startTyping: async () => { starts++; },
    stopTyping: async () => { stops++; },
  });
  await settle();
  assert.deepEqual({ starts, stops }, { starts: 0, stops: 0 });
  assert.ok(reports.includes("TYPING_AUTHORIZATION_REJECTED"));
});

test("an actual provider start failure is cleaned up without blocking text delivery", async (t) => {
  const f = await fixture(t);
  const calls: string[] = [];
  const reports: string[] = [];
  const leases = new TypingLeases(
    f.clock,
    async () => ({
      startTyping: async () => {
        calls.push("start");
        throw new Error("provider rejected after dispatch began");
      },
      stopTyping: async () => {
        calls.push("stop");
      },
    }),
    undefined,
    (code) => reports.push(code),
  );
  t.after(() => leases.shutdown());
  assert.equal((await (await startTypingExecution(f, leases, f.begin())).execution)?.status,
    "executor-completed");
  await settle();
  assert.deepEqual(calls, ["start", "stop"]);
  assert.ok(reports.includes("TYPING_PROVIDER_FAILURE"));
  assert.equal((await executeText(f))?.status, "provider-accepted");
  assert.equal(f.replies(), 1);
});

test("shutdown invalidates a pending start, bounds cleanup, and a fresh manager does not replay it", async (t) => {
  const f = await fixture(t);
  const lookup = deferred<{
    startTyping(): Promise<void>;
    stopTyping(): Promise<void>;
  }>();
  const reports: string[] = [];
  let starts = 0;
  let stops = 0;
  const leases = new TypingLeases(
    f.clock,
    () => lookup.promise,
    undefined,
    (code) => reports.push(code),
  );
  assert.equal((await (await startTypingExecution(f, leases, f.begin())).execution)?.status,
    "executor-completed");
  f.bindings.shutdown();
  leases.shutdown();
  assert.equal(await leases.drain(10), false);
  assert.ok(reports.includes("TYPING_SHUTDOWN_INCOMPLETE"));
  lookup.resolve({
    startTyping: async () => { starts++; },
    stopTyping: async () => { stops++; },
  });
  await settle();
  assert.deepEqual({ starts, stops }, { starts: 0, stops: 0 });

  const fresh = new TypingLeases(f.clock, async () => ({
    startTyping: async () => { starts++; },
    stopTyping: async () => { stops++; },
  }));
  fresh.expire();
  await settle();
  assert.deepEqual({ starts, stops }, { starts: 0, stops: 0 });
  fresh.shutdown();
});

async function waitForProductionResult(
  composition: Awaited<ReturnType<typeof createProductionComposition>>,
  action: Action,
): Promise<OperationResult> {
  const accepted = await composition.runtime.execute(
    action,
    composition.principal,
  ) as { ok: true; result: OperationResult };
  assert.equal(accepted.ok, true);
  let result = accepted.result;
  for (let turn = 0; result.status === "queued" && turn < 200; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const status = await composition.runtime.status(
      action.contextId,
      result.requestId,
      composition.principal,
    ) as { ok: true; result: OperationResult };
    assert.equal(status.ok, true);
    result = status.result;
  }
  assert.notEqual(result.status, "queued", JSON.stringify(result));
  return result;
}

for (const rejectTypingStart of [false, true]) {
test(
  `production typing: ${rejectTypingStart ? "provider failure" : "success"}, diagnostics, replies, cleanup and restart`,
  { timeout: 10_000 },
  async (t) => {
  const root = await privateTestRoot(t, "typing-prod-");
  const runtimeDirectory = join(root, "runtime");
  await Promise.all([
    runtimeDirectory,
    join(runtimeDirectory, "captures"),
    join(runtimeDirectory, "staging"),
  ].map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  await writeFile(projectSecretFile, "offline-secret", { mode: 0o600 });
  await writeFile(credentialFile, "f".repeat(64), { mode: 0o600 });
  const now = 10000;
  const operations = ["typing.begin", "typing.end", "text.send"] as const;
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: {
      kind: "spectrum-cloud-imessage",
      projectId: "project-1",
      projectSecretFile,
      accountId: "account-1",
      lineId: "line-1",
      phone: "+15555550101",
      conversationId: "conversation-1",
      dedicated: true,
      availableOperations: [...operations],
    },
    local: {
      socketPath: join(runtimeDirectory, "runtime.sock"),
      credentialFile,
      principalId: "principal-1",
      credentialId: "credential-1",
    },
    task: {
      contextId: "context-1",
      taskId: "task-1",
      generation: 1,
      permissions: [...operations],
      issuedAt: 1000,
      expiresAt: 20000,
      grokAgentId: "agent-1",
    },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: {
      administrativeOperations: [],
      allowedRecipients: [],
      allowNativeContent: false,
    },
    cards: [],
    runtime: {
      statePath: join(runtimeDirectory, "state.sqlite"),
      captureDirectory: join(runtimeDirectory, "captures"),
      stagingDirectory: join(runtimeDirectory, "staging"),
    },
  };
  const lookup = deferred<Space>();
  const lookupStarted = deferred();
  const typingStarted = deferred();
  const calls: string[] = [];
  let starts = 0;
  let replies = 0;
  let blockFirstLookup = true;
  const space = {
    id: configuration.provider.conversationId,
    __platform: "imessage",
    phone: configuration.provider.phone,
    startTyping: async () => {
      starts++;
      calls.push("typing-start");
      typingStarted.resolve();
      if (rejectTypingStart) throw new Error("OFFLINE_TYPING_START_REJECTED");
    },
    stopTyping: async () => {
      calls.push("typing-stop");
    },
    send: async (input: ContentInput) => {
      replies++;
      const content = (await resolveContents([input]))[0]!;
      return {
        id: `production-reply-${replies}`,
        platform: "imessage",
        space,
        content,
        direction: "outbound",
        timestamp: new Date(now),
      } as unknown as Message;
    },
  } as unknown as Space;
  const sdkFactory = async (): Promise<OwnedSdk> => {
    const stopped = deferred();
    return {
      messages: () => ({
        async *[Symbol.asyncIterator]() {
          await stopped.promise;
        },
      }),
      space: async () => {
        if (blockFirstLookup) {
          blockFirstLookup = false;
          lookupStarted.resolve();
          return lookup.promise;
        }
        return space;
      },
      provider: () => ({ getMembers: async () => [], space: {} }) as never,
      stop: async () => {
        calls.push("sdk-stop");
        stopped.resolve();
      },
    };
  };
  const reports: string[] = [];
  const compose = () => createProductionComposition(
    configuration,
    root,
    root,
    {
      now: () => now,
      sdkFactory,
      grokRunner: async () => "accepted",
      report: (code) => reports.push(code),
    },
  );
  let composition = await compose();
  await composition.runtime.start();
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1,
    kind: "space",
    id: composition.scope.spaceId,
    scope: composition.scope,
  };
  try {
    const typingResult = await waitForProductionResult(composition, {
      version: 1,
      contextId: composition.context.contextId,
      idempotencyKey: "production-typing",
      operation: "typing.begin",
      arguments: { space: spaceRef, ttlMs: 1000 },
    });
    assert.equal(typingResult.status, "executor-completed");
    await lookupStarted.promise;
    assert.equal(starts, 0);
    const replyResult = await waitForProductionResult(composition, {
      version: 1,
      contextId: composition.context.contextId,
      idempotencyKey: "production-reply",
      operation: "text.send",
      arguments: { space: spaceRef, text: "reply is independent" },
    });
    assert.equal(replyResult.status, "provider-accepted");
    assert.equal(replies, 1);
    lookup.resolve(space);
    await typingStarted.promise;
    await settle();
    assert.equal(starts, 1);
    if (rejectTypingStart) {
      assert.deepEqual(
        reports.filter(code => code === "TYPING_PROVIDER_FAILURE"),
        ["TYPING_PROVIDER_FAILURE"],
        "typing diagnostics must reach the production report callback",
      );
      assert.ok(calls.includes("typing-stop"), "failed start must attempt cleanup");
      const replyAfterFailure = await waitForProductionResult(composition, {
        version: 1,
        contextId: composition.context.contextId,
        idempotencyKey: "production-reply-after-typing-failure",
        operation: "text.send",
        arguments: { space: spaceRef, text: "reply survives typing failure" },
      });
      assert.equal(replyAfterFailure.status, "provider-accepted");
      assert.equal(replies, 2);
    } else {
      assert.ok(!reports.includes("TYPING_PROVIDER_FAILURE"));
    }
    await composition.runtime.stop();
    assert.ok(calls.indexOf("typing-stop") >= 0);
    assert.ok(calls.indexOf("typing-stop") < calls.indexOf("sdk-stop"));
  } finally {
    if (composition.runtime.doctor().state !== "stopped")
      await composition.runtime.stop();
  }

  const startsBeforeRestart = starts;
  composition = await compose();
  await composition.runtime.start();
  try {
    await settle();
    assert.equal(starts, startsBeforeRestart, "restart must not replay typing.begin");
  } finally {
    await composition.runtime.stop();
  }
  assert.ok(!reports.includes("TYPING_AUTHORIZATION_REJECTED"));
});
}
