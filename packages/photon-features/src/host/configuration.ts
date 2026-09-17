import { administrativeOperations } from "./configuration-inventory.js";
import { cardBackendConfigurationSchema } from "./card-backend-configuration.js";
import { constants } from "node:fs";
import { open, lstat, realpath, rename } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { idSchema } from "../contracts/resources.js";
import { operations } from "../contracts/actions.js";

/** Permanent owner grant; finite delegated task expiry remains enforced. */
export const INSTALLATION_OWNER_EXPIRES_AT = Number.MAX_SAFE_INTEGER;

const operation = z.enum(operations as [typeof operations[number], ...typeof operations[number][]]);
const absolutePath = z.string().min(1).max(1024).refine(isAbsolute, "absolute path required");
const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);
const recipient = z.string().min(3).max(254).refine(
  value => /^\+[1-9]\d{6,14}$/.test(value) ||
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value),
  "canonical E.164 number or email required",
);
const unique = <T extends z.ZodTypeAny>(item: T, maximum: number) =>
  z.array(item).max(maximum).refine(values => new Set(values.map(String)).size === values.length, "duplicates forbidden");

const cardTemplate = z.strictObject({
  id: idSchema,
  kind: z.enum(["universal", "customized"]),
  backendId: idSchema.optional(),
  origins: unique(z.string().url().refine(value => new URL(value).protocol === "https:" && new URL(value).origin === value), 32).min(1),
  extension: z.strictObject({
    appName: z.string().min(1).max(200),
    teamId: z.string().regex(/^[A-Z0-9]{10}$/),
    extensionBundleId: z.string().min(3).max(200).regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
    appStoreId: z.number().int().positive().optional(),
  }).optional(),
  live: z.strictObject({
    installedExtensionVerified: z.literal(true),
    evidence: z.string().min(1).max(1000),
  }).optional(),
  interactions: z.strictObject({
    participantIds: unique(idSchema, 32).min(1),
    actionIds: unique(idSchema, 32).min(1),
    ttlMs: z.number().int().positive().max(86_400_000),
    backendContractId: idSchema,
  }).optional(),
}).superRefine((value, context) => {
  if (value.kind === "customized" && !value.extension)
    context.addIssue({ code: "custom", message: "customized template extension required" });
});

const hostConfigurationShape = z.strictObject({
  version: z.literal(2),
  activation: z.enum(["disabled", "enabled"]),
  provider: z.strictObject({
    kind: z.literal("spectrum-cloud-imessage"),
    projectId: idSchema,
    projectSecretFile: absolutePath,
    accountId: idSchema,
    lineId: idSchema,
    phone: e164,
    conversationId: z.string().min(1).max(1000),
    dedicated: z.boolean(),
    availableOperations: unique(operation, operations.length).min(1),
  }),
  local: z.strictObject({
    socketPath: absolutePath,
    credentialFile: absolutePath,
    principalId: idSchema,
    credentialId: idSchema,
  }),
  task: z.strictObject({
    contextId: idSchema,
    taskId: idSchema,
    generation: z.number().int().nonnegative(),
    permissions: unique(operation, operations.length).min(1),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    grokAgentId: idSchema,
  }),
  grok: z.strictObject({
    executable: absolutePath,
    timeoutMs: z.number().int().min(1000).max(60000).default(15000),
  }),
  authorization: z.strictObject({
    administrativeOperations: unique(operation, operations.length),
    allowedRecipients: unique(recipient, 64),
    allowNativeContent: z.boolean(),
  }),
  cardBackend: cardBackendConfigurationSchema.optional(),
  cards: z.array(cardTemplate).max(64).refine(values => new Set(values.map(value => value.id)).size === values.length, "duplicate card template"),
  ownerAdministration: z.strictObject({ principalId: idSchema, credentialFile: absolutePath }).optional(),
  textStreaming: z.strictObject({ delivery: z.enum(["progressive", "buffered"]) }).optional(),
  runtime: z.strictObject({
    statePath: absolutePath,
    captureDirectory: absolutePath,
    stagingDirectory: absolutePath,
    importDirectory: absolutePath.optional(),
  }),
});

type ConfigurationChecks = Pick<z.infer<typeof hostConfigurationShape>, "task" | "cards" | "cardBackend" | "authorization"> & {
  provider: { availableOperations: typeof operations[number][] };
};
function validateConfiguration(value: ConfigurationChecks, context: z.RefinementCtx) {
  if (value.task.expiresAt <= value.task.issuedAt)
    context.addIssue({ code: "custom", path: ["task", "expiresAt"], message: "context expiry must follow issue time" });
  for (const template of value.cards) {
    if (template.backendId && (!value.cardBackend || template.backendId !== value.cardBackend.id || !template.origins.includes(value.cardBackend.origin)))
      context.addIssue({ code: "custom", path: ["cards", template.id], message: "matching cardBackend and origin required" });
    if (template.interactions && (!value.cardBackend || template.backendId !== value.cardBackend.id || template.interactions.backendContractId !== value.cardBackend.id ||
      template.interactions.participantIds.some(id => !value.cardBackend!.participants.some(p => p.id === id))))
      context.addIssue({ code: "custom", path: ["cards", template.id, "interactions"], message: "matching backend and verified participant key enrollment required" });
  }
  const permissions = new Set(value.task.permissions);
  for (const item of value.provider.availableOperations)
    if (!permissions.has(item)) context.addIssue({ code: "custom", path: ["provider", "availableOperations"], message: "available operation requires task permission" });
  for (const item of value.authorization.administrativeOperations)
    if (!permissions.has(item) || !administrativeOperations.includes(item))
      context.addIssue({ code: "custom", path: ["authorization", "administrativeOperations"], message: "a recognized administrative operation and its task permission are required" });
}

/** Original v2 parser stays available for historical consumers and artifacts. */
export const productionHostConfigurationSchema = hostConfigurationShape.superRefine((value, context) => {
  validateConfiguration(value, context);
  if (value.ownerAdministration?.credentialFile === value.local.credentialFile)
    context.addIssue({ code: "custom", path: ["ownerAdministration", "credentialFile"], message: "a separate owner credential file is required" });
});

/** v3 describes installation-owner intent; permission grants do not imply provider capability. */
export const normalizedHostConfigurationSchema = hostConfigurationShape.extend({
  version: z.literal(3),
  grok: hostConfigurationShape.shape.grok.extend({
    commandStyle: z.enum(["gateway-flag", "gateway-subcommand"]).optional(),
    commandStyleEvidence: z.literal("installed-cli-help").optional(),
  }),
  ownerModel: z.enum(["installation-owner", "legacy-task"]),
  activateAfterValidation: z.boolean(),
  provider: hostConfigurationShape.shape.provider.extend({
    phone: e164.optional(),
    conversationId: hostConfigurationShape.shape.provider.shape.conversationId.optional(),
    initialAddress: recipient.optional(),
    projectSecretFormat: z.enum(["raw", "photon-project-secret-v1"]).default("raw"),
  }),
}).superRefine((value, context) => {
  validateConfiguration(value, context);
  if (Boolean(value.grok.commandStyle) !== Boolean(value.grok.commandStyleEvidence))
    context.addIssue({ code: "custom", path: ["grok"], message: "command style requires installed CLI help evidence" });
  for (const template of value.cards)
    if (value.ownerModel === "installation-owner" && template.live && !template.extension)
      context.addIssue({ code: "custom", path: ["cards", template.id, "live"], message: "live template extension required" });
  if (!value.provider.conversationId && !value.provider.initialAddress)
    context.addIssue({ code: "custom", path: ["provider"], message: "initial conversation or user address required" });
  if (value.provider.dedicated && !value.provider.phone)
    context.addIssue({ code: "custom", path: ["provider", "phone"], message: "dedicated serving phone required" });
  if (value.ownerAdministration?.credentialFile === value.local.credentialFile &&
      (value.ownerModel !== "installation-owner" || value.ownerAdministration.principalId !== value.local.principalId))
    context.addIssue({ code: "custom", path: ["ownerAdministration"], message: "shared credential must identify the installation owner" });
});
export type NormalizedHostConfiguration = z.infer<typeof normalizedHostConfigurationSchema>;

/** Pure migration: never changes tokens, grants, identities, expiry, activation or durable state. */
export function normalizeProductionHostConfiguration(input: unknown): NormalizedHostConfiguration {
  if (typeof input === "object" && input !== null && "version" in input && input.version === 3)
    return normalizedHostConfigurationSchema.parse(input);
  const legacy = productionHostConfigurationSchema.parse(input);
  return normalizedHostConfigurationSchema.parse({ ...legacy, version: 3,
    ownerModel: "legacy-task", activateAfterValidation: false });
}

/** Read a private discovery descriptor without copying its secret into configuration or logs. */
export async function readConfiguredProjectSecret(config: ProductionHostConfiguration | NormalizedHostConfiguration): Promise<string> {
  const value = (await readPrivateFile(config.provider.projectSecretFile, 16 * 1024)).trim();
  let secret = value;
  if ("projectSecretFormat" in config.provider && config.provider.projectSecretFormat === "photon-project-secret-v1") {
    let descriptor: unknown;
    try { descriptor = JSON.parse(value); } catch { throw new Error("INVALID_PROJECT_SECRET_DESCRIPTOR"); }
    const result = z.strictObject({ version: z.literal(1), projectId: idSchema, projectSecret: z.string().min(1).max(8192) }).safeParse(descriptor);
    if (!result.success || result.data.projectId !== config.provider.projectId) throw new Error("PROJECT_SECRET_IDENTITY_MISMATCH");
    secret = result.data.projectSecret.trim();
  }
  if (!secret || secret.length > 8192) throw new Error("INVALID_PROJECT_SECRET");
  return secret;
}

/** New installs authenticate administration with the same private installation-owner token.
 * Existing explicit owner credentials retain their previous authority boundary. */
export function installationOwnerCredential(input: ProductionHostConfiguration | NormalizedHostConfiguration) {
  const config = normalizeProductionHostConfiguration(input);
  if (config.ownerAdministration) return config.ownerAdministration;
  if (config.ownerModel === "installation-owner")
    return { principalId: config.local.principalId, credentialFile: config.local.credentialFile };
  throw new Error("OWNER_ADMINISTRATION_NOT_CONFIGURED");
}

export type ProductionHostConfiguration = z.infer<typeof productionHostConfigurationSchema>;

function beneath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export async function assertPrivateDirectory(path: string): Promise<void> {
  const canonical = await realpath(path);
  if (canonical !== resolve(path)) throw new Error("SYMLINKED_RUNTIME_DIRECTORY");
  const stat = await lstat(canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700)
    throw new Error("PRIVATE_DIRECTORY_REQUIRED");
}

export async function readPrivateFile(path: string, maximum = 4096): Promise<string> {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_PRIVATE_FILE_REQUIRED");
  await assertPrivateDirectory(dirname(path));
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > maximum)
      throw new Error("PRIVATE_FILE_REQUIRED");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export async function loadProductionHostConfiguration(root: string): Promise<ProductionHostConfiguration> {
  if (!isAbsolute(root)) throw new Error("ABSOLUTE_INSTALL_ROOT_REQUIRED");
  root = resolve(root);
  await assertPrivateDirectory(root);
  const runtime = join(root, "runtime");
  await assertPrivateDirectory(runtime);
  const config = productionHostConfigurationSchema.parse(JSON.parse(await readPrivateFile(join(runtime, "configuration.json"), 128 * 1024)));
  assertRuntimePaths(config, root);
  return config;
}

function assertRuntimePaths(config: ProductionHostConfiguration | NormalizedHostConfiguration, root: string): void {
  const runtime = join(root, "runtime");
  for (const path of [...(config.ownerAdministration ? [config.ownerAdministration.credentialFile] : []), config.provider.projectSecretFile, config.local.socketPath, config.local.credentialFile,
    config.runtime.statePath, config.runtime.captureDirectory, config.runtime.stagingDirectory,
    config.runtime.importDirectory ?? join(runtime, "imports")])
    if (!beneath(runtime, resolve(path))) throw new Error("RUNTIME_PATH_OUTSIDE_INSTALLATION");
  if (config.local.socketPath !== join(runtime, "runtime.sock") || config.runtime.statePath !== join(runtime, "state.sqlite"))
    throw new Error("CANONICAL_RUNTIME_PATH_REQUIRED");
}

/** Read either persisted version for the integrated v3 production/lifecycle path. */
export async function loadCompatibleHostConfiguration(root: string): Promise<ProductionHostConfiguration | NormalizedHostConfiguration> {
  if (!isAbsolute(root)) throw new Error("ABSOLUTE_INSTALL_ROOT_REQUIRED");
  root = resolve(root);
  await assertPrivateDirectory(root);
  await assertPrivateDirectory(join(root, "runtime"));
  const raw = JSON.parse(await readPrivateFile(join(root, "runtime", "configuration.json"), 128 * 1024));
  const config = raw.version === 2 ? productionHostConfigurationSchema.parse(raw) : normalizeProductionHostConfiguration(raw);
  assertRuntimePaths(config, root);
  return config;
}

/** Deterministic read-only v2/v3 normalization for production integration. */
export async function loadNormalizedHostConfiguration(root: string): Promise<NormalizedHostConfiguration> {
  return normalizeProductionHostConfiguration(await loadCompatibleHostConfiguration(root));
}

/** Change only the activation bit; callers separately coordinate host/install ownership. */
export async function writeActivation(root: string, activation: "disabled" | "enabled"): Promise<ProductionHostConfiguration | NormalizedHostConfiguration> {
  const config = await loadCompatibleHostConfiguration(root);
  const path = join(resolve(root), "runtime", "configuration.json");
  const temporary = join(dirname(path), `.configuration-${randomUUID()}`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify({ ...config, activation }) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
  return { ...config, activation };
}

/** Provider route identity is distinct from optional displayed serving metadata. */
export function providerRoutePhone(config: ProductionHostConfiguration | NormalizedHostConfiguration): string {
  if (!config.provider.dedicated) return "shared";
  if (!config.provider.phone) throw new Error("DEDICATED_SERVING_PHONE_REQUIRED");
  return config.provider.phone;
}
export type RoutedHostConfiguration = NormalizedHostConfiguration & {
  provider: NormalizedHostConfiguration["provider"] & { conversationId: string };
};
/** Native conversation identity must come from configuration or authenticated provider resolution. */
export function requireRoutedConfiguration(input: ProductionHostConfiguration | NormalizedHostConfiguration): RoutedHostConfiguration {
  const configuration = normalizeProductionHostConfiguration(input);
  const conversationId = configuration.provider.conversationId;
  if (!conversationId) throw new Error("INITIAL_CONVERSATION_UNRESOLVED");
  return { ...configuration, provider: { ...configuration.provider, conversationId } };
}
