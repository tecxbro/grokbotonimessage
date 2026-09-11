import { constants } from "node:fs";
import { open, lstat, realpath, rename } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { idSchema } from "../contracts/resources.js";
import { operations } from "../contracts/actions.js";

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
  origins: unique(z.string().url().refine(value => new URL(value).protocol === "https:" && new URL(value).origin === value), 32).min(1),
  extension: z.strictObject({
    appName: z.string().min(1).max(200),
    teamId: z.string().regex(/^[A-Z0-9]{10}$/),
    extensionBundleId: z.string().min(3).max(200).regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
    appStoreId: z.number().int().positive().optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.kind === "customized" && !value.extension)
    context.addIssue({ code: "custom", message: "customized template extension required" });
});

export const productionHostConfigurationSchema = z.strictObject({
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
  cards: z.array(cardTemplate).max(64).refine(values => new Set(values.map(value => value.id)).size === values.length, "duplicate card template"),
  runtime: z.strictObject({
    statePath: absolutePath,
    captureDirectory: absolutePath,
    stagingDirectory: absolutePath,
  }),
}).superRefine((value, context) => {
  if (value.task.expiresAt <= value.task.issuedAt)
    context.addIssue({ code: "custom", path: ["task", "expiresAt"], message: "context expiry must follow issue time" });
  const permissions = new Set(value.task.permissions);
  for (const item of value.provider.availableOperations)
    if (!permissions.has(item)) context.addIssue({ code: "custom", path: ["provider", "availableOperations"], message: "available operation requires task permission" });
  for (const item of value.authorization.administrativeOperations)
    if (!permissions.has(item)) context.addIssue({ code: "custom", path: ["authorization", "administrativeOperations"], message: "administrative operation requires task permission" });
});

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
  for (const path of [config.provider.projectSecretFile, config.local.socketPath, config.local.credentialFile,
    config.runtime.statePath, config.runtime.captureDirectory, config.runtime.stagingDirectory])
    if (!beneath(runtime, resolve(path))) throw new Error("RUNTIME_PATH_OUTSIDE_INSTALLATION");
  if (config.local.socketPath !== join(runtime, "runtime.sock") || config.runtime.statePath !== join(runtime, "state.sqlite"))
    throw new Error("CANONICAL_RUNTIME_PATH_REQUIRED");
  return config;
}

/** Change only the activation bit; callers separately coordinate host/install ownership. */
export async function writeActivation(root: string, activation: "disabled" | "enabled"): Promise<ProductionHostConfiguration> {
  const config = await loadProductionHostConfiguration(root);
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
