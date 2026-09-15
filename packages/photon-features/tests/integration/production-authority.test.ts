import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContentInput, Message, Space } from "spectrum-ts";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition } from "../../src/host/production.js";
import { privateTestRoot } from "../helpers/private-temp.js";

async function fixture(t: TestContext) {
  const root = await privateTestRoot(t, "gpa-");
  const runtime = join(root, "runtime");
  await mkdir(runtime, { mode: 0o700 });
  await Promise.all(["captures", "staging", "imports"].map(name => mkdir(join(runtime, name), { mode: 0o700 })));
  const projectSecretFile = join(runtime, "project-secret");
  const credentialFile = join(runtime, "local-token");
  await writeFile(projectSecretFile, "secret", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  const now = 50_000;
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1", projectSecretFile,
      accountId: "account-1", lineId: "line-1", phone: "+15555550101",
      conversationId: "conversation-1", dedicated: true,
      availableOperations: ["text.send", "text.stream", "attachment.fetch", "attachment.send", "voice.send"] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile,
      principalId: "principal-1", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 7,
      permissions: ["text.send", "text.stream", "attachment.fetch", "attachment.send", "voice.send"],
      issuedAt: 1_000, expiresAt: 100_000, grokAgentId: "agent-1" },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [],
    runtime: { statePath: join(runtime, "state.sqlite"), captureDirectory: join(runtime, "captures"),
      stagingDirectory: join(runtime, "staging"), importDirectory: join(runtime, "imports") },
  };
  let constructions = 0, sends = 0, grokCalls = 0;
  const stops: Array<() => void> = [];
  const space = { id: configuration.provider.conversationId, __platform: "imessage", phone: configuration.provider.phone,
    send: async (_input: ContentInput) => { sends++; return undefined; } } as unknown as Space;
  const sdkFactory = async (): Promise<OwnedSdk> => {
    constructions++;
    let release!: () => void;
    const stopped = new Promise<void>(resolve => { release = resolve; });
    stops.push(release);
    return {
      messages: () => ({ async *[Symbol.asyncIterator]() { await stopped; } }),
      space: async () => space,
      provider: () => ({ getAttachment: async () => undefined }) as never,
      stop: async () => release(),
    };
  };
  const compose = (config = configuration) => createProductionComposition(config, root, root, {
    now: () => now,
    sdkFactory,
    grokRunner: async () => { grokCalls++; return "accepted"; },
  });
  const startStop = async (config = configuration) => {
    const composition = await compose(config);
    await composition.runtime.start();
    await composition.runtime.stop();
  };
  return { root, runtime, now, configuration, compose, startStop, constructions: () => constructions,
    sends: () => sends, grokCalls: () => grokCalls };
}

function editStore(f: Awaited<ReturnType<typeof fixture>>, edit: (store: DurableSQLiteStore) => void) {
  const store = new DurableSQLiteStore(f.configuration.runtime.statePath, () => f.now);
  try { edit(store); } finally { store.close(); }
}

test("fresh bootstrap is atomic and ordinary restart preserves the original durable grant", async (t) => {
  const f = await fixture(t);
  await f.startStop();
  let before = "";
  editStore(f, store => {
    before = JSON.stringify({
      task: store.transaction(tx => tx.get("tasks", f.configuration.task.taskId)),
      context: store.transaction(tx => tx.get("contexts", f.configuration.task.contextId)),
      space: store.transaction(tx => tx.get("references", f.configuration.provider.conversationId)),
    });
  });
  await f.startStop();
  editStore(f, store => {
    assert.equal(JSON.stringify({
      task: store.transaction(tx => tx.get("tasks", f.configuration.task.taskId)),
      context: store.transaction(tx => tx.get("contexts", f.configuration.task.contextId)),
      space: store.transaction(tx => tx.get("references", f.configuration.provider.conversationId)),
    }), before);
  });
  assert.equal(f.constructions(), 2);
});

for (const denial of ["cancelled", "revoked", "expired"] as const) {
  test(`persisted ${denial} authority blocks restart before SDK construction`, async (t) => {
    const f = await fixture(t);
    await f.startStop();
    editStore(f, store => store.transaction(tx => {
      if (denial === "cancelled") {
        const row = tx.get("tasks", f.configuration.task.taskId)!;
        tx.put("tasks", { ...row, cancelledAt: f.now - 1, revision: row.revision + 1 }, row.revision);
      } else {
        const row = tx.get("contexts", f.configuration.task.contextId)!;
        const context = { ...row.context, ...(denial === "revoked" ? { revokedAt: f.now - 1 } : { expiresAt: f.now }) };
        tx.put("contexts", { ...row, context, revision: row.revision + 1 }, row.revision);
      }
    }));
    const constructed = f.constructions();
    await assert.rejects(f.compose(), new RegExp(`AUTHORITY_${denial.toUpperCase()}`));
    assert.equal(f.constructions(), constructed);
  });
}

test("configuration cannot widen permissions, extend expiry or change generation/context identity", async (t) => {
  for (const mode of ["permissions", "expiry", "generation-higher", "generation-lower", "context"] as const) {
    const f = await fixture(t);
    await f.startStop();
    const config = structuredClone(f.configuration);
    if (mode === "permissions") {
      editStore(f, store => store.transaction(tx => {
        const row = tx.get("contexts", config.task.contextId)!;
        tx.put("contexts", { ...row, revision: row.revision + 1,
          context: { ...row.context, permissions: ["text.send"] } }, row.revision);
      }));
    } else if (mode === "expiry") {
      editStore(f, store => store.transaction(tx => {
        const row = tx.get("contexts", config.task.contextId)!;
        tx.put("contexts", { ...row, revision: row.revision + 1,
          context: { ...row.context, expiresAt: f.now + 1 } }, row.revision);
      }));
    } else if (mode === "generation-higher") config.task.generation += 1;
    else if (mode === "generation-lower") config.task.generation -= 1;
    else config.task.contextId = "replacement-context";
    await assert.rejects(f.compose(config), /AUTHORITY_(CONFIGURATION_MISMATCH|BINDING_CONFLICT)/);
  }
});

test("partial durable identity fails atomically without filling missing authority", async (t) => {
  const f = await fixture(t);
  editStore(f, store => store.transaction(tx => tx.put("tasks", {
    id: f.configuration.task.taskId, scope: {
      projectId: f.configuration.provider.projectId, provider: "imessage",
      accountId: f.configuration.provider.accountId, lineId: f.configuration.provider.lineId,
      spaceId: f.configuration.provider.conversationId,
    }, revision: 0, principalId: f.configuration.local.principalId,
    generation: f.configuration.task.generation, cancelledAt: f.now - 1,
  }, null)));
  await assert.rejects(f.compose(), /AUTHORITY_BINDING_CONFLICT/);
  editStore(f, store => {
    assert.equal(store.transaction(tx => tx.get("contexts", f.configuration.task.contextId)), undefined);
    assert.equal(store.transaction(tx => tx.get("references", f.configuration.provider.conversationId)), undefined);
  });
  assert.equal(f.constructions(), 0);
});

test("a replacement context cannot bypass a denied task and denial leaves operation evidence unchanged", async (t) => {
  const f = await fixture(t);
  const composition = await f.compose();
  await composition.runtime.start();
  const action = { version: 1 as const, idempotencyKey: "unknown-before-denial", contextId: f.configuration.task.contextId,
    operation: "text.send" as const, arguments: { space: { version: 1 as const, kind: "space" as const,
      id: composition.scope.spaceId, scope: composition.scope }, text: "offline unknown" } };
  const submitted = await composition.runtime.execute(action, composition.principal) as { ok: true; result: { requestId: string; status: string } };
  let status = submitted.result;
  for (let count = 0; status.status === "queued" && count < 200; count++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const response = await composition.runtime.status(action.contextId, status.requestId, composition.principal) as typeof submitted;
    status = response.result;
  }
  await composition.runtime.stop();
  let before = "";
  editStore(f, store => store.transaction(tx => {
    const outbox = tx.get("outbox", status.requestId)!;
    tx.put("outbox", { ...outbox, revision: outbox.revision + 1, result: { ...outbox.result,
      status: "unknown-outcome", error: { code: "UNKNOWN_OUTCOME", message: "UNKNOWN_OUTCOME",
        retry: "reconcile-first" } } }, outbox.revision);
    const task = tx.get("tasks", f.configuration.task.taskId)!;
    tx.put("tasks", { ...task, revision: task.revision + 1, cancelledAt: f.now }, task.revision);
    before = JSON.stringify(tx.get("outbox", status.requestId));
  }));
  const config = structuredClone(f.configuration);
  config.task.contextId = "replacement-context";
  const constructions = f.constructions(), sends = f.sends(), wakes = f.grokCalls();
  await assert.rejects(f.compose(config), /AUTHORITY_BINDING_CONFLICT/);
  editStore(f, store => {
    assert.equal(store.transaction(tx => tx.get("contexts", config.task.contextId)), undefined);
    assert.equal(JSON.stringify(store.transaction(tx => tx.get("outbox", status.requestId))), before);
  });
  assert.deepEqual([f.constructions(), f.sends(), f.grokCalls()], [constructions, sends, wakes]);
});
