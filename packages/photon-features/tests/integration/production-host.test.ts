import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { resolveContents, type ContentInput, type Message, type Space } from "spectrum-ts";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import { createProductionComposition } from "../../src/host/production.js";
import { GrokGatewayTaskHandoff } from "../../src/host/grok-wake.js";
import { run } from "../../src/cli/main.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import type { OperationResult } from "../../src/contracts/index.js";
import { privateTestRoot } from "../helpers/private-temp.js";

const output = () => {
  let value = "";
  return { stream: { write: (part: string) => { value += part; return true; } }, value: () => value };
};

test("production composition owns one provider, durable store, authenticated socket and recovery path", async (t) => {
  const root = await privateTestRoot(t, "gpp-");
  const runtimeDirectory = join(root, "runtime");
  await mkdir(runtimeDirectory, { mode: 0o700 });
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  await writeFile(projectSecretFile, "project-secret", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  const now = Date.now();
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1",
      projectSecretFile, accountId: "account-1", lineId: "line-1", phone: "+15555550101",
      conversationId: "conversation-1", dedicated: true, availableOperations: ["text.send"] },
    local: { socketPath: join(runtimeDirectory, "runtime.sock"), credentialFile,
      principalId: "grok-principal", credentialId: "local-token-v1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 7,
      permissions: ["text.send"], issuedAt: now - 1000, expiresAt: now + 60_000,
      grokAgentId: "grok-agent" },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [],
    runtime: { statePath: join(runtimeDirectory, "state.sqlite"),
      captureDirectory: join(runtimeDirectory, "captures"), stagingDirectory: join(runtimeDirectory, "staging") },
  };
  let constructions = 0, listeners = 0, stops = 0, sends = 0, releaseStream!: () => void;
  const stopped = new Promise<void>(resolve => { releaseStream = resolve; });
  const offlineSpace = { id: configuration.provider.conversationId, __platform: "imessage",
    phone: configuration.provider.phone,
    send: async (input: ContentInput) => {
      sends++;
      const content = (await resolveContents([input]))[0]!;
      return { id: "provider-message-1", platform: "imessage", space: offlineSpace,
        content, direction: "outbound", timestamp: new Date(now), sender: undefined } as Message;
    } } as unknown as Space;
  const sdk: OwnedSdk = {
    messages: () => ({ async *[Symbol.asyncIterator]() { listeners++; await stopped; } }),
    space: async () => offlineSpace,
    provider: () => ({ space: {}, getMembers: async () => [], getAttachment: async () => undefined }) as never,
    stop: async () => { stops++; releaseStream(); },
  };
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory: async () => { constructions++; return sdk; },
    grokRunner: async () => "accepted",
  });
  let local: { close(): Promise<void> } | undefined;
  try {
    await composition.runtime.start();
    local = await composition.startLocalInterface();
    assert.equal(composition.runtime.doctor().ready, true);
    assert.deepEqual({ constructions, listeners }, { constructions: 1, listeners: 1 });
    const action = { version: 1, idempotencyKey: "production-text-1", contextId: configuration.task.contextId,
      operation: "text.send", arguments: { space: { version: 1, kind: "space", id: composition.scope.spaceId,
        scope: composition.scope }, text: "offline production path" } };
    const stdout = output(), stderr = output();
    const code = await run(["execute", "--json-stdin"], {
      GROK_PHOTON_CONTEXT_ID: configuration.task.contextId,
      GROK_PHOTON_SOCKET: configuration.local.socketPath,
      GROK_PHOTON_CREDENTIAL_FILE: credentialFile,
    }, Readable.from([JSON.stringify(action)]), stdout.stream, stderr.stream);
    assert.equal(code, 0, stdout.value() + stderr.value());
    const requestId = JSON.parse(stdout.value()).result.requestId as string;
    let result = await composition.runtime.status(configuration.task.contextId, requestId, composition.principal) as
      { ok: true; result: OperationResult } | { ok: false; error: unknown };
    for (let attempt = 0; result.ok && result.result.status === "queued" && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      result = await composition.runtime.status(configuration.task.contextId, requestId, composition.principal) as
        { ok: true; result: OperationResult } | { ok: false; error: unknown };
    }
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("status failed");
    assert.equal(result.result.status, "provider-accepted", JSON.stringify(result));
    assert.equal(sends, 1);
  } finally {
    await local?.close();
    await composition.runtime.stop();
  }
  assert.equal(stops, 1);
});

test("Grok wake sends an exact pointer-only gateway command for the release-pinned launcher", async () => {
  let invocation: { executable: string; args: readonly string[]; timeout: number } | undefined;
  const handoff = new GrokGatewayTaskHandoff({ executable: "/opt/grok/bin/gbot", agentId: "agent-1",
    taskId: "task-1", generation: 3, installationRoot: "/opt/grok-photon",
    releaseRoot: "/opt/grok-photon/releases/" + "a".repeat(64), timeoutMs: 15000 },
  async (executable, args, timeout) => { invocation = { executable, args, timeout }; return "accepted"; });
  assert.equal(await handoff.notifyExistingTask({ handoffId: "handoff-1", taskId: "task-1", generation: 3 }), "accepted");
  assert.equal(invocation?.executable, "/opt/grok/bin/gbot");
  assert.deepEqual(invocation?.args.slice(0, 3), ["--gateway", "send", "agent-1"]);
  const prompt = invocation?.args[3] ?? "";
  assert.match(prompt, /handoff-1/);
  assert.match(prompt, /grok-photon-task/);
  assert.match(prompt, /pointer only/);
  assert.doesNotMatch(prompt, /project-secret|local-token|message body:/i);
  assert.equal(await handoff.notifyExistingTask({ handoffId: "handoff-2", taskId: "other", generation: 3 }), "failed");
});
