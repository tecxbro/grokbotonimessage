import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Spectrum,
  definePlatform,
  type Message,
  type Space,
} from "spectrum-ts";
import { z } from "zod";
import ts from "typescript";
import type { Action, OperationResult } from "../../src/contracts/index.js";
import type {
  ReactionRef,
  MessageRef,
} from "../../src/contracts/references.js";
import type { ProductionHostConfiguration } from "../../src/host/configuration.js";
import {
  createProductionComposition,
  type ProductionComposition,
} from "../../src/host/production.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import type { OwnedSdk } from "../../src/adapters/transport/spectrum-owner.js";
import type { ReactionReferenceRecord } from "../../src/features/text-messages/sdk.js";
import { privateTestRoot } from "../helpers/private-temp.js";
import { createFeatureModule } from "../../src/features/text-messages/module.js";
import { makeServices } from "../fixtures/runtime-services.js";

type Mode =
  | "restore"
  | "metadata-only"
  | "missing"
  | "wrong-parent"
  | "wrong-part"
  | "wrong-emoji"
  | "inbound"
  | "wrong-chat"
  | "wrong-line"
  | "wrong-id"
  | "removed";

async function fixture(t: TestContext) {
  const root = await privateTestRoot(t, "rfx10-");
  const runtime = join(root, "runtime");
  await mkdir(runtime, { mode: 0o700 });
  const projectSecretFile = join(runtime, "project-secret");
  const credentialFile = join(runtime, "local-token");
  await writeFile(projectSecretFile, "offline-fixture", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  const now = 50_000;
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
      conversationId: "native-chat",
      dedicated: true,
      availableOperations: ["message.react", "reaction.remove"],
    },
    local: {
      socketPath: join(runtime, "runtime.sock"),
      credentialFile,
      principalId: "principal-1",
      credentialId: "credential-1",
    },
    task: {
      contextId: "context-1",
      taskId: "task-1",
      generation: 1,
      permissions: ["message.react", "reaction.remove"],
      issuedAt: 1_000,
      expiresAt: 100_000,
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
      statePath: join(runtime, "state.sqlite"),
      captureDirectory: join(runtime, "captures"),
      stagingDirectory: join(runtime, "staging"),
    },
  };
  let mode: Mode = "restore",
    timeout = false,
    created = false,
    constructions = 0;
  const removals: Message[] = [],
    lookups: string[] = [];
  let lookupSpace: Space;
  // This is an explicitly offline provider registered through public SDK authoring.
  // Spectrum constructs all Message/Space objects; the feature never fabricates a handle.
  const sdkFactory = async (): Promise<OwnedSdk> => {
    constructions++;
    let publicSpace: Space;
    const provider = definePlatform("imessage", {
      config: z.object({}),
      lifecycle: { createClient: async () => ({}) },
      user: { resolve: async ({ input }) => ({ id: input.userID }) },
      space: {
        schema: z.object({
          id: z.string(),
          phone: z.string(),
          type: z.literal("dm"),
        }),
        create: async () => ({
          id: "native-chat",
          phone: configuration.provider.phone,
          type: "dm" as const,
        }),
        get: async ({ input }) => ({
          id: mode === "wrong-chat" ? "other-chat" : input.id,
          phone:
            mode === "wrong-line" ? "other-line" : configuration.provider.phone,
          type: "dm" as const,
        }),
      },
      message: {
        schema: z.object({
          parentId: z.string().optional(),
          partIndex: z.number().optional(),
          reactionRecord: z
            .object({
              reaction: z.object({ kind: z.enum(["love", "like"]) }),
              targetGuid: z.string(),
              targetPartIndex: z.number(),
              selected: z.boolean(),
            })
            .optional(),
        }),
      },
      async *messages() {},
      send: async ({ space, content }) => {
        if (content.type === "reaction") {
          created = true;
          return {
            id: "native-reaction",
            space,
            content,
            direction: "outbound" as const,
            timestamp: new Date(now),
            reactionRecord: {
              reaction: { kind: "love" as const },
              targetGuid: "native-parent",
              targetPartIndex: 2,
              selected: true,
            },
          };
        }
        assert.equal(content.type, "unsend");
        if (content.type === "unsend") removals.push(content.target);
        if (timeout) throw new Error("timeout after provider removal");
        return undefined;
      },
      actions: {
        getMessage: async (_ctx, space, id) => {
          lookups.push(id);
          if (id === "native-part" || id === "other-parent")
            return {
              id,
              space,
              content: { type: "text" as const, text: "parent" },
              direction: "inbound" as const,
              timestamp: new Date(now),
              parentId: "native-parent",
              partIndex: mode === "wrong-part" ? 3 : 2,
            };
          if (id !== "native-reaction" || !created || mode === "missing")
            return undefined;
          const target = await publicSpace.getMessage(
            mode === "wrong-parent" ? "other-parent" : "native-part",
          );
          assert.ok(target);
          return {
            id: mode === "wrong-id" ? "foreign-reaction" : id,
            space: {
              id: mode === "wrong-chat" ? "other-chat" : space.id,
              phone:
                mode === "wrong-line"
                  ? "other-line"
                  : configuration.provider.phone,
              type: "dm" as const,
            },
            direction:
              mode === "inbound" ? ("inbound" as const) : ("outbound" as const),
            timestamp: new Date(now),
            content:
              mode === "metadata-only"
                ? {
                    type: "custom" as const,
                    raw: { imessage_type: "unsupported-message" },
                  }
                : {
                    type: "reaction" as const,
                    emoji: mode === "wrong-emoji" ? "👍" : "❤️",
                    target,
                  },
            reactionRecord: {
              reaction: {
                kind:
                  mode === "wrong-emoji"
                    ? ("like" as const)
                    : ("love" as const),
              },
              targetGuid: "native-parent",
              targetPartIndex: mode === "wrong-part" ? 3 : 2,
              selected: mode !== "removed",
            },
          };
        },
      },
    });
    const app = await Spectrum({
      providers: [provider.config({})],
      telemetry: false,
      options: { logLevel: "silent" },
    });
    publicSpace = await provider(app).space.get("native-chat");
    lookupSpace = publicSpace;
    let release!: () => void;
    const stopped = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      messages: () => ({
        async *[Symbol.asyncIterator]() {
          await stopped;
        },
      }),
      space: async (id) => provider(app).space.get(id),
      provider: () => provider(app) as never,
      stop: async () => {
        release();
        await app.stop();
      },
    };
  };
  const compose = () =>
    createProductionComposition(configuration, root, root, {
      now: () => now,
      sdkFactory,
      grokRunner: async () => {
        throw new Error("no Grok calls permitted");
      },
    });
  let composition = await compose();
  const parent: MessageRef = {
    version: 1,
    kind: "message",
    id: "parent-ref",
    scope: composition.scope,
  };
  function store<T>(fn: (db: DurableSQLiteStore) => T): T {
    const db = new DurableSQLiteStore(
      configuration.runtime.statePath,
      () => now,
    );
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }
  store((db) =>
    db.transaction((tx) =>
      tx.put(
        "references",
        {
          id: parent.id,
          reference: parent,
          scope: parent.scope,
          revision: 0,
          providerId: "native-part",
          ownedByPrincipalId: configuration.local.principalId,
          taskId: configuration.task.taskId,
          generation: 1,
        },
        null,
      ),
    ),
  );
  await composition.runtime.start();
  t.after(async () => {
    await composition.runtime.stop();
  });
  async function settle(action: Action): Promise<OperationResult> {
    const accepted = (await composition.runtime.execute(
      action,
      composition.principal,
    )) as { ok: boolean; result: OperationResult };
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    let result = accepted.result;
    for (let i = 0; result.status === "queued" && i < 200; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const status = (await composition.runtime.status(
        action.contextId,
        result.requestId,
        composition.principal,
      )) as typeof accepted;
      assert.equal(status.ok, true);
      result = status.result;
    }
    assert.notEqual(result.status, "queued");
    return result;
  }
  return {
    store,
    removals,
    lookups,
    constructions: () => constructions,
    mode: (value: Mode) => {
      mode = value;
    },
    timeout: () => {
      timeout = true;
    },
    restart: async () => {
      await composition.runtime.stop();
      composition = await compose();
      await composition.runtime.start();
    },
    create: async () => {
      const result = await settle({
        version: 1,
        contextId: configuration.task.contextId,
        idempotencyKey: "create",
        operation: "message.react",
        arguments: { message: parent, reaction: "love" },
      });
      assert.equal(
        result.status,
        "provider-accepted",
        JSON.stringify({
          result,
          lookups,
          children: store((db) => db.scan("children")),
        }),
      );
      assert.equal(result.references[0]?.kind, "reaction");
      return result.references[0] as ReactionRef;
    },
    remove: (reaction: ReactionRef, key = "remove") =>
      settle({
        version: 1,
        contextId: configuration.task.contextId,
        idempotencyKey: key,
        operation: "reaction.remove",
        arguments: { reaction },
      }),
    submitRemove: (reaction: ReactionRef) =>
      composition.runtime.execute(
        {
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "submit-remove",
          operation: "reaction.remove",
          arguments: { reaction },
        },
        composition.principal,
      ),
    rawRemove: async (reaction: ReactionRef) => {
      const f = makeServices();
      const services = {
        ...f.services,
        context: composition.context,
        resolveResource: async (ref: ReactionRef | MessageRef) => ref,
        transaction: ((run: Parameters<typeof f.services.transaction>[0]) =>
          store((db) =>
            db.transaction((tx) =>
              run({
                get: tx.get,
                put: tx.put,
                createContinuation: () => {
                  throw new Error("unexpected continuation");
                },
              }),
            ),
          )) as typeof f.services.transaction,
      };
      const module = createFeatureModule({
        provider: {
          provider: "imessage",
          scope: composition.scope,
          ready: () => true,
          start: async () => {},
          stop: async () => {},
        },
        binding: () => ({
          scope: composition.scope,
          nativeSpaceId: "native-chat",
          phone: configuration.provider.phone,
        }),
        resources: {
          space: async () => lookupSpace,
          message: async (ref) => {
            const row = store((db) =>
              db.transaction((tx) => tx.get("references", ref.id)),
            )!;
            return (await lookupSpace.getMessage(row.providerId))!;
          },
        },
      });
      return module.handlers["reaction.remove"]!(
        {
          version: 1,
          contextId: configuration.task.contextId,
          idempotencyKey: "raw-remove",
          operation: "reaction.remove",
          arguments: { reaction },
        },
        services,
      );
    },
  };
}

test("warm create/remove uses real SDK handles and persists complete multipart reaction identity", async (t) => {
  const f = await fixture(t);
  const ref = await f.create();
  const record = f.store((db) =>
    db.transaction((tx) => tx.get("references", ref.id)),
  ) as ReactionReferenceRecord;
  assert.deepEqual(record.reactionIdentity, {
    version: 1,
    providerId: "native-reaction",
    parentProviderId: "native-part",
    parentNativeId: "native-parent",
    parentPartIndex: 2,
    parentDirection: "inbound",
    spaceId: "native-chat",
    phone: "+15555550101",
    direction: "outbound",
    emoji: "❤️",
    nativeReaction: {
      reaction: { kind: "love" },
      targetGuid: "native-parent",
      targetPartIndex: 2,
      selected: true,
    },
  });
  assert.equal(record.ownedByPrincipalId, "principal-1");
  assert.equal((await f.remove(ref)).status, "executor-completed");
  assert.equal(f.removals.length, 1);
  assert.equal(f.removals[0]!.content.type, "reaction");
});

test("SQLite reopen and a fresh SDK owner restore via public getMessage then remove exactly once", async (t) => {
  const f = await fixture(t);
  const ref = await f.create();
  await f.restart();
  assert.equal(f.constructions(), 2);
  f.lookups.length = 0;
  assert.equal((await f.remove(ref)).status, "executor-completed");
  assert.ok(f.lookups.includes("native-reaction"));
  assert.ok(f.lookups.includes("native-part"));
  assert.equal((await f.remove(ref)).status, "executor-completed");
  assert.equal(f.removals.length, 1);
});

for (const mode of [
  "wrong-parent",
  "wrong-part",
  "wrong-emoji",
  "inbound",
  "wrong-chat",
  "wrong-line",
  "wrong-id",
  "removed",
] as const) {
  test(`restored ${mode} reaction blocks before removal`, async (t) => {
    const f = await fixture(t);
    const ref = await f.create();
    await f.restart();
    f.mode(mode);
    const result = await f.remove(ref);
    assert.ok(
      [
        "FORBIDDEN",
        "SCOPE_MISMATCH",
        "RESOURCE_NOT_FOUND",
        "UNAVAILABLE",
      ].includes(result.error?.code ?? ""),
      JSON.stringify(result),
    );
    assert.equal(f.removals.length, 0);
  });
}

test("foreign principal cannot remove a reaction even with a valid provider handle", async (t) => {
  const f = await fixture(t);
  const ref = await f.create();
  f.store((db) =>
    db.transaction((tx) => {
      const row = tx.get("references", ref.id)!;
      tx.put(
        "references",
        { ...row, ownedByPrincipalId: "human", revision: row.revision + 1 },
        row.revision,
      );
    }),
  );
  f.lookups.length = 0;
  assert.equal((await f.rawRemove(ref)).error?.code, "FORBIDDEN");
  const result = (await f.submitRemove(ref)) as {
    ok: boolean;
    error: { code: string };
  };
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "RESOURCE_NOT_FOUND");
  assert.equal(f.lookups.length, 0);
  assert.equal(f.removals.length, 0);
});

test("legacy records without durable identity block explicitly before any removal", async (t) => {
  const f = await fixture(t);
  const ref = await f.create();
  f.store((db) =>
    db.transaction((tx) => {
      const row = tx.get("references", ref.id)! as ReactionReferenceRecord;
      delete row.reactionIdentity;
      tx.put(
        "references",
        { ...row, revision: row.revision + 1 },
        row.revision,
      );
    }),
  );
  const result = await f.rawRemove(ref);
  assert.equal(result.status, "blocked");
  assert.equal(result.error?.blockerId, "REACTION_COLD_RECOVERY_UNAVAILABLE");
  assert.match(result.error!.message, /durable reaction identity is missing/);
  assert.equal(f.removals.length, 0);
});

for (const mode of ["missing", "metadata-only"] as const) {
  test(`${mode} cold handle exposes a precise blocker without dispatch or synthetic restoration`, async (t) => {
    const f = await fixture(t);
    const ref = await f.create();
    await f.restart();
    f.mode(mode);
    const raw = await f.rawRemove(ref);
    assert.equal(raw.error?.blockerId, "REACTION_COLD_RECOVERY_UNAVAILABLE");
    assert.match(raw.error!.message, /public lookup/);
    const result = await f.remove(ref);
    assert.equal(result.status, "blocked", JSON.stringify(result));
    assert.equal(result.error?.code, "UNAVAILABLE");
    // RFX-00 integration request: shared cleanResult currently strips precise blocker metadata.
    assert.equal(result.error?.blockerId, undefined);
    assert.equal(f.removals.length, 0);
    const rows = f.store((db) => db.scan("children"));
    assert.equal(
      rows.length,
      1,
      "only creation crossed a child dispatch boundary",
    );
  });
}

test("timeout after removal remains reconcile-first across retries and SQLite/SDK restart", async (t) => {
  const f = await fixture(t);
  const ref = await f.create();
  f.timeout();
  const first = await f.remove(ref);
  assert.equal(first.status, "unknown-outcome", JSON.stringify(first));
  assert.equal(first.error?.retry, "reconcile-first");
  assert.equal((await f.remove(ref)).status, "unknown-outcome");
  await f.restart();
  assert.equal((await f.remove(ref)).status, "unknown-outcome");
  assert.equal(f.removals.length, 1);
});

test("reaction code cannot construct/cast synthetic SDK Messages or import private SDK caches", async () => {
  for (const name of ["targets", "reactions", "sdk"]) {
    const source = await readFile(
      new URL(
        `../../../src/features/text-messages/${name}.ts`,
        import.meta.url,
      ),
      "utf8",
    );
    const parsed = ts.createSourceFile(
      `${name}.ts`,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        const path = (node.moduleSpecifier as ts.StringLiteral).text;
        if (path.includes("spectrum"))
          assert.ok(
            ["spectrum-ts", "spectrum-ts/providers/imessage"].includes(path),
          );
      }
      if (ts.isNewExpression(node))
        assert.doesNotMatch(node.expression.getText(parsed), /Message/);
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
        assert.doesNotMatch(node.type.getText(parsed), /\bMessage\b/);
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      )
        assert.doesNotMatch(node.type?.getText(parsed) ?? "", /\bMessage\b/);
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
});
