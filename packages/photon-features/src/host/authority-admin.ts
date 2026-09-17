import { timingSafeEqual, randomUUID } from "node:crypto";
import { open, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { idSchema, contextSchema, sameScope } from "../contracts/index.js";
import { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import { configuredAuthority } from "./authority.js";
import { loadCompatibleHostConfiguration, normalizeProductionHostConfiguration, installationOwnerCredential, readPrivateFile } from "./configuration.js";
import { acquireHostOwnership } from "./owner-lock.js";
import { assertSelectedRelease } from "./selected-release.js";
import { canonical } from "../runtime/core/idempotency.js";

export const authorityTransitionSchema = z.strictObject({
  version: z.literal(1), requestId: idSchema, mode: z.enum(["renew", "replace"]),
  expectedContext: contextSchema,
  expectedContextRevision: z.number().int().nonnegative(),
  expectedTaskRevision: z.number().int().nonnegative(),
  nextContext: contextSchema,
  reason: z.string().min(1).max(1000),
});
type Transition = z.infer<typeof authorityTransitionSchema>;
/** All authority edits and the audit commit atomically. Old work remains fenced
 * under its original generation, including queued and unknown-outcome evidence. */
export function transitionAuthority(store: DurableSQLiteStore, request: Transition, ownerId: string, now: number) {
  request = authorityTransitionSchema.parse(request);
  const json = canonical(request);
  return store.transaction(tx => {
    const replay = tx.get("authorityAudits", request.requestId);
    if (replay) {
      if (replay.requestJson !== json || replay.ownerId !== ownerId) throw new Error("ADMIN_REQUEST_CONFLICT");
      const current = tx.get("contexts", replay.next.contextId), task = tx.get("tasks", replay.next.taskId);
      if (!current || canonical(current.context) !== canonical(replay.next) || task?.generation !== replay.next.generation || task.cancelledAt !== null)
        throw new Error("STALE_AUTHORITY_EXPECTATION");
      return replay.next;
    }
    const old = request.expectedContext, next = request.nextContext;
    const context = tx.get("contexts", old.contextId), task = tx.get("tasks", old.taskId);
    if (!context || !task || canonical(context.context) !== canonical(old) ||
      context.revision !== request.expectedContextRevision || task.revision !== request.expectedTaskRevision ||
      task.generation !== old.generation || task.principalId !== old.principalId || !sameScope(task.scope, old.scope))
      throw new Error("STALE_AUTHORITY_EXPECTATION");
    if (!sameScope(old.scope, next.scope) || next.contextId === old.contextId || tx.get("contexts", next.contextId) ||
      next.generation !== old.generation + 1 || next.revokedAt !== null || next.issuedAt > now || next.expiresAt <= now)
      throw new Error("INVALID_AUTHORITY_SUCCESSOR");
    if (request.mode === "renew" && (old.revokedAt !== null || task.cancelledAt !== null || next.taskId !== old.taskId || next.principalId !== old.principalId))
      throw new Error("AUTHORITY_CANNOT_BE_RENEWED");
    if (request.mode === "replace" && (next.taskId === old.taskId || tx.get("tasks", next.taskId)))
      throw new Error("NEW_TASK_REQUIRED");
    const space = tx.get("references", old.scope.spaceId);
    if (!space || space.taskId !== old.taskId || space.generation !== old.generation ||
      space.ownedByPrincipalId !== old.principalId || !sameScope(space.scope, old.scope)) throw new Error("AUTHORITY_BINDING_CONFLICT");
    tx.put("contexts", { ...context, revision: context.revision + 1, context: { ...old, revokedAt: old.revokedAt ?? now } }, context.revision);
    if (request.mode === "replace") {
      tx.put("tasks", { ...task, revision: task.revision + 1, cancelledAt: task.cancelledAt ?? now }, task.revision);
      tx.put("tasks", { id: next.taskId, scope: next.scope, revision: 0, principalId: next.principalId, generation: next.generation, cancelledAt: null }, null);
    } else tx.put("tasks", { ...task, revision: task.revision + 1, generation: next.generation }, task.revision);
    tx.put("contexts", { id: next.contextId, scope: next.scope, revision: 0, context: next }, null);
    tx.put("references", { ...space, revision: space.revision + 1, taskId: next.taskId,
      generation: next.generation, ownedByPrincipalId: next.principalId }, space.revision);
    tx.put("authorityAudits", { id: request.requestId, revision: 0, scope: old.scope,
      requestJson: json, previous: old, next, ownerId, occurredAt: now }, null);
    return next;
  });
}

/** Authenticate an explicitly invoked stopped-host owner command; never expose it on the socket. */
export async function authenticateOwner(config: import("./configuration.js").ProductionHostConfiguration | import("./configuration.js").NormalizedHostConfiguration, credentialFile: string) {
  const owner = installationOwnerCredential(config);
  const token = (await readPrivateFile(credentialFile, 128)).trim();
  const expected = (await readPrivateFile(owner.credentialFile, 128)).trim();
  if (!/^[a-f0-9]{64}$/i.test(token) || token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new Error("OWNER_AUTHENTICATION_REQUIRED");
  // A historical independent admin credential must still differ from the task token.
  if (owner.credentialFile !== config.local.credentialFile &&
      expected === (await readPrivateFile(config.local.credentialFile, 128)).trim())
    throw new Error("OWNER_AUTHENTICATION_REQUIRED");
  return owner.principalId;
}

/** Explicit owner readout; legacy task credentials retain their restricted role. */
export async function inspectAuthority(root: string, releaseRoot: string, credentialFile: string) {
  const selected = await assertSelectedRelease(root, releaseRoot);
  const config = await loadCompatibleHostConfiguration(root);
  await authenticateOwner(config, credentialFile);
  const ownership = await acquireHostOwnership(join(root, "runtime"), selected.release);
  let store: DurableSQLiteStore | undefined;
  try {
    store = new DurableSQLiteStore(config.runtime.statePath);
    return store.transaction(tx => {
      const context = tx.get("contexts", config.task.contextId), task = tx.get("tasks", config.task.taskId);
      if (!context || !task) throw new Error("EXISTING_AUTHORITY_REQUIRED");
      return { expectedContext: context.context, expectedContextRevision: context.revision,
        expectedTaskRevision: task.revision, taskCancelledAt: task.cancelledAt };
    });
  } finally { store?.close(); await ownership.release(); }
}

/** Stopped-host owner procedure, authenticated by the installation owner.
 * A crash between DB commit and config replacement is repaired by replaying the
 * exact administration request; startup never reseeds or broadens authority. */
export async function administerAuthority(root: string, releaseRoot: string, requestFile: string, credentialFile: string) {
  const selected = await assertSelectedRelease(root, releaseRoot);
  const config = await loadCompatibleHostConfiguration(root);
  const ownerId = await authenticateOwner(config, credentialFile);
  const request = authorityTransitionSchema.parse(JSON.parse(await readPrivateFile(requestFile, 32768)));
  const ownership = await acquireHostOwnership(join(root, "runtime"), selected.release);
  let store: DurableSQLiteStore | undefined;
  try {
    store = new DurableSQLiteStore(config.runtime.statePath);
    const configured = configuredAuthority(config).context;
    if (canonical(configured) !== canonical({ ...request.expectedContext, revokedAt: configured.revokedAt }) && canonical(configured) !== canonical(request.nextContext))
      throw new Error("AUTHORITY_CONFIGURATION_MISMATCH");
    const next = request.nextContext;
    const updated = { ...config, local: { ...config.local, principalId: next.principalId }, task: { ...config.task,
      contextId: next.contextId, taskId: next.taskId, generation: next.generation, permissions: next.permissions,
      issuedAt: next.issuedAt, expiresAt: next.expiresAt } };
    // Availability cannot silently exceed the new task grant. Operator changes
    // provider policy separately after this explicit durable authority transition.
    updated.provider = { ...config.provider, availableOperations: config.provider.availableOperations.filter(op => next.permissions.includes(op)) };
    updated.authorization = { ...config.authorization,
      administrativeOperations: config.authorization.administrativeOperations.filter(op => next.permissions.includes(op)) };
    normalizeProductionHostConfiguration(updated);
    transitionAuthority(store, request, ownerId, Date.now());
    const path = join(root, "runtime", "configuration.json"), temporary = join(root, "runtime", `.authority-${randomUUID()}`);
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(updated) + "\n"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    const dir = await open(join(root, "runtime"), "r"); try { await dir.sync(); } finally { await dir.close(); }
    return { requestId: request.requestId, taskId: next.taskId, generation: next.generation };
  } finally { store?.close(); await ownership.release(); }
}
