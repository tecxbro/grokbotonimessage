import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { bootstrapOrValidateAuthority, validateExistingAuthority } from "../../src/host/authority.js";
import { transitionAuthority } from "../../src/host/authority-admin.js";
import type { TrustedContext } from "../../src/contracts/index.js";
import { privateTestRoot } from "../helpers/private-temp.js";

test("authority renewal and replacement are audited, fence old generations and preserve pending evidence across restart", async t => {
  const root = await privateTestRoot(t, "admin-"); const path = join(root, "state.sqlite");
  let store = new DurableSQLiteStore(path);
  const context: TrustedContext = { version: 1, contextId: "ctx", taskId: "task", principalId: "principal", generation: 1,
    scope: { projectId: "project", accountId: "account", lineId: "line", provider: "imessage", spaceId: "space" },
    permissions: ["text.send"], issuedAt: 1, expiresAt: 10, revokedAt: null };
  bootstrapOrValidateAuthority(store, context, "native-chat", 5);
  store.transaction(tx => tx.put("handoffs", { id: "pending", scope: context.scope, revision: 0,
    taskId: context.taskId, generation: 1, principalId: context.principalId, eventIds: [], state: "pending", claim: null, createdAt: 5 }, null));
  const next = { ...context, contextId: "ctx2", generation: 2, issuedAt: 11, expiresAt: 100 };
  const request = { version: 1 as const, requestId: "renew", mode: "renew" as const, expectedContext: context,
    expectedContextRevision: 0, expectedTaskRevision: 0, nextContext: next, reason: "owner renewal after expiry" };
  assert.deepEqual(transitionAuthority(store, request, "owner", 11), next);
  assert.deepEqual(transitionAuthority(store, request, "owner", 11), next);
  assert.throws(() => transitionAuthority(store, { ...request, requestId: "stale" }, "owner", 11), /STALE_AUTHORITY/);
  assert.throws(() => transitionAuthority(store, request, "different-owner", 11), /ADMIN_REQUEST_CONFLICT/);
  store.close(); store = new DurableSQLiteStore(path);
  validateExistingAuthority(store, next, "native-chat", 12);
  assert.equal(store.transaction(tx => tx.get("handoffs", "pending"))?.generation, 1);
  assert.equal(store.transaction(tx => tx.get("authorityAudits", "renew"))?.previous.contextId, "ctx");
  store.transaction(tx => { const row = tx.get("contexts", "ctx2")!; tx.put("contexts", { ...row, revision: row.revision + 1, context: { ...next, revokedAt: 12 } }, row.revision); });
  const revoked = { ...next, revokedAt: 12 };
  const replace = { ...request, requestId: "replace", expectedContext: revoked, expectedContextRevision: 1, expectedTaskRevision: 1,
    nextContext: { ...next, contextId: "ctx3", taskId: "task3", generation: 3 } };
  assert.throws(() => transitionAuthority(store, replace, "owner", 13), /AUTHORITY_CANNOT_BE_RENEWED/);
  transitionAuthority(store, { ...replace, mode: "replace" }, "owner", 13);
  assert.throws(() => transitionAuthority(store, request, "owner", 14), /STALE_AUTHORITY/);
  assert.equal(store.transaction(tx => tx.get("tasks", "task"))?.cancelledAt, 13);
  assert.equal(store.transaction(tx => tx.get("handoffs", "pending"))?.state, "pending");
  store.close();
});
