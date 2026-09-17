import { lstat, open, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SpectrumOwner } from "../adapters/transport/spectrum-owner.js";
import type { HostOwnership } from "./owner-lock.js";
import { loadNormalizedHostConfiguration, normalizeProductionHostConfiguration, readPrivateFile,
  type ProductionHostConfiguration, type NormalizedHostConfiguration } from "./configuration.js";

/** Offline startup validation permits an unresolved address only on a fresh install.
 * It neither connects a provider nor creates/renews durable authority. */
export async function validateInitialConversationPrerequisites(
  input: ProductionHostConfiguration | NormalizedHostConfiguration,
  now = Date.now(),
): Promise<NormalizedHostConfiguration> {
  const config = normalizeProductionHostConfiguration(input);
  if (config.task.issuedAt > now || config.task.expiresAt <= now) throw new Error("EXPIRED_TASK_BINDING");
  if (!config.provider.conversationId) {
    if (config.ownerModel !== "installation-owner" || !config.provider.initialAddress)
      throw new Error("INITIAL_CONVERSATION_UNRESOLVED");
    for (const path of [config.runtime.statePath, `${config.runtime.statePath}-wal`, `${config.runtime.statePath}-shm`]) {
      try { await lstat(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      throw new Error("UNRESOLVED_CONVERSATION_WITH_EXISTING_STATE");
    }
  }
  return config;
}

/** An omitted host option adopts persisted intent; an explicit false overrides it.
 * This decision alone never changes activation or starts the provider. */
export function activationAfterValidationRequested(
  input: ProductionHostConfiguration | NormalizedHostConfiguration,
  explicit?: boolean,
): boolean {
  return explicit ?? normalizeProductionHostConfiguration(input).activateAfterValidation;
}

export type InitialConversationConfiguration = NormalizedHostConfiguration & {
  provider: NormalizedHostConfiguration["provider"] & { conversationId: string };
};
const initialResolutions = new Set<string>();
const resolvedDmSchema = z.object({
  __platform: z.literal("imessage"), id: z.string().min(1).max(1000),
  type: z.literal("dm"), phone: z.string().min(1),
});
/** Spectrum 12.8.0 DM peer IDs follow <service>;-;<address>. Inspect only the
 * returned ID to bind the intended peer; never manufacture a provider ID. */
function matchesAddress(id: string, address: string): boolean {
  const separator = id.indexOf(";-;");
  return separator > 0 && !id.includes(";+;") &&
    id.slice(separator + 3).toLowerCase() === address.toLowerCase();
}
const resolutionLockSchema = z.object({
  version: z.literal(1), pid: z.number().int().positive(), uid: z.number().int().nonnegative(),
  release: z.string().min(1), nonce: z.string().min(1), startedAt: z.number().finite(),
});

/** Resolve once through the already-authenticated installation owner, then persist
 * only its exact native DM ID. Caller holds the host lock and selected release;
 * this helper never starts/stops an owner, reads messages, sends, or retries.
 * The lock serializes cooperating processes; snapshot checks fence stale input
 * and same-user edits across provider awaits, not hostile filesystem writers. */
export async function resolveInitialConversation(
  root: string,
  expected: ProductionHostConfiguration | NormalizedHostConfiguration,
  owner: Pick<SpectrumOwner, "ready" | "provider" | "routes">,
  ownership: HostOwnership,
): Promise<InitialConversationConfiguration> {
  if (!isAbsolute(root)) throw new Error("ABSOLUTE_INSTALL_ROOT_REQUIRED");
  root = resolve(root);
  if (initialResolutions.has(root)) throw new Error("INITIAL_CONVERSATION_RESOLUTION_IN_PROGRESS");
  initialResolutions.add(root);
  try {
    // Load/path-check before any provider call. Exact snapshot equality prevents
    // a provider opened for an old project/configuration from binding a new one.
    const configuration = await loadNormalizedHostConfiguration(root);
    if (!isDeepStrictEqual(configuration, normalizeProductionHostConfiguration(expected)))
      throw new Error("INITIAL_CONVERSATION_CONFIGURATION_CHANGED");
    if (configuration.provider.conversationId)
      return { ...configuration, provider: { ...configuration.provider, conversationId: configuration.provider.conversationId } };
    await validateInitialConversationPrerequisites(configuration);
    if (configuration.activation !== "enabled") throw new Error("ACTIVATION_REQUIRED");
    const lockPath = join(root, "runtime", "host.lock");
    if (ownership.path !== lockPath) throw new Error("HOST_OWNERSHIP_REQUIRED");
    const lockText = await readPrivateFile(lockPath);
    const lock = resolutionLockSchema.safeParse(JSON.parse(lockText));
    if (!lock.success || lock.data.pid !== process.pid || lock.data.uid !== process.getuid?.())
      throw new Error("HOST_OWNERSHIP_REQUIRED");
    if (!owner.ready()) throw new Error("OWNER_NOT_READY");
    if (owner.routes.projectId !== configuration.provider.projectId ||
        owner.routes.evidence().filter(line => line.accountId === configuration.provider.accountId &&
          line.lineId === configuration.provider.lineId).length !== 1)
      throw new Error("INITIAL_CONVERSATION_OWNER_MISMATCH");
    const path = join(root, "runtime", "configuration.json");
    const original = await readPrivateFile(path, 128 * 1024);
    if (!isDeepStrictEqual(normalizeProductionHostConfiguration(JSON.parse(original)), configuration))
      throw new Error("INITIAL_CONVERSATION_CONFIGURATION_CHANGED");
    const assertUnchanged = async () => {
      if (!owner.ready() || await readPrivateFile(lockPath) !== lockText) throw new Error("HOST_OWNERSHIP_CHANGED");
      if (await readPrivateFile(path, 128 * 1024) !== original) throw new Error("INITIAL_CONVERSATION_CONFIGURATION_CHANGED");
      await validateInitialConversationPrerequisites(configuration);
    };
    const assertOwnerRoute = (space: z.infer<typeof resolvedDmSchema>) => {
      let scope;
      try { scope = owner.routes.inbound(space.phone, space.id); }
      catch { throw new Error("INITIAL_CONVERSATION_ROUTE_MISMATCH"); }
      if (scope.projectId !== configuration.provider.projectId || scope.provider !== "imessage" ||
          scope.accountId !== configuration.provider.accountId || scope.lineId !== configuration.provider.lineId)
        throw new Error("INITIAL_CONVERSATION_ROUTE_MISMATCH");
    };
    const provider = owner.provider();
    const address = configuration.provider.initialAddress!;
    const phone = configuration.provider.dedicated ? configuration.provider.phone! : "shared";
    // These are the pinned public Spectrum space APIs. Shared mode omits the
    // dedicated route parameter entirely; never construct a native chat GUID.
    const created = resolvedDmSchema.safeParse(configuration.provider.dedicated
      ? await provider.space.create(address, { phone }) : await provider.space.create(address));
    if (!created.success || created.data.phone !== phone || !matchesAddress(created.data.id, address)) throw new Error("INITIAL_CONVERSATION_ROUTE_MISMATCH");
    assertOwnerRoute(created.data);
    await assertUnchanged();
    const loaded = resolvedDmSchema.safeParse(configuration.provider.dedicated
      ? await provider.space.get(created.data.id, { phone }) : await provider.space.get(created.data.id));
    if (!loaded.success || loaded.data.phone !== phone || loaded.data.id !== created.data.id || !matchesAddress(loaded.data.id, address))
      throw new Error("INITIAL_CONVERSATION_ROUTE_MISMATCH");
    assertOwnerRoute(loaded.data);
    await assertUnchanged();
    // Preserve the on-disk representation and every authority/identity field.
    const raw = JSON.parse(original);
    const updated = { ...raw, provider: { ...raw.provider, conversationId: loaded.data.id } };
    const result = normalizeProductionHostConfiguration(updated);
    const temporary = join(dirname(path), `.initial-conversation-${randomUUID()}`);
    const file = await open(temporary, "wx", 0o600);
    try {
      try { await file.chmod(0o600); await file.writeFile(JSON.stringify(updated) + "\n"); await file.sync(); }
      finally { await file.close(); }
      await assertUnchanged();
      await rename(temporary, path);
      const directory = await open(dirname(path), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    return { ...result, provider: { ...result.provider, conversationId: loaded.data.id } };
  } finally { initialResolutions.delete(root); }
}
