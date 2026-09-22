import { mkdir, open, lstat } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { readGrokWebhookBinding, webhookBindingId } from "./grok-webhook.js";
import { operations } from "../contracts/actions.js";
import { administrativeOperations, upstreamPollOperations } from "./configuration-inventory.js";
import { INSTALLATION_OWNER_EXPIRES_AT, normalizedHostConfigurationSchema,
  readConfiguredProjectSecret, assertPrivateDirectory, type NormalizedHostConfiguration } from "./configuration.js";

const supported = operations.filter(op => !upstreamPollOperations.includes(op));
const choicesSchema = z.strictObject({
  projectId: z.string().min(1).optional(),
  grokAgentId: z.string().min(1).optional(),
  initialAddress: z.string().min(3).max(254).optional(),
  initialConversationId: z.string().min(1).max(1000).optional(),
});
const setupInputSchema = z.strictObject({
  version: z.literal(2), discovery: z.unknown(),
  choices: choicesSchema.default({}),
  activateAfterValidation: z.boolean().default(false),
  webhookFile: z.string().refine(isAbsolute).optional(),
  cards: normalizedHostConfigurationSchema.shape.cards.default([]),
  cardBackend: normalizedHostConfigurationSchema.shape.cardBackend,
});

const identitySchema = z.object({ id: z.string().min(1), name: z.string().optional(), email: z.string().optional() });
const spectrumUserSchema = identitySchema.extend({ accountId: z.string().min(1).optional(),
  phoneNumber: z.string().optional(), assignedPhoneNumber: z.string().optional() });
const candidates = <T extends z.ZodType<{ id: string }>>(schema: T) => z.array(schema).max(1000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'duplicate discovery identity');
// RFX-04 SetupDiscovery v1. Metadata is inert; only resolved, cross-checked identities enter config.
const discoverySchema = z.object({
  version: z.literal(1), kind: z.literal('setup-discovery'),
  installationRoot: z.string().refine(isAbsolute),
  project: identitySchema.nullable(), projectCandidates: candidates(identitySchema),
  spectrum: z.object({ mode: z.enum(['shared', 'dedicated']).nullable(),
    user: spectrumUserSchema.nullable(), userCandidates: candidates(spectrumUserSchema),
    servingE164: z.string().nullable(), dedicatedLineId: z.string().nullable(),
    lineCandidates: candidates(z.object({ id: z.string().min(1), platform: z.string().optional(), phoneNumber: z.string().optional() })) }),
  secretFile: z.object({ path: z.string().refine(isAbsolute), mode: z.literal('0600'), format: z.literal('photon-project-secret-v1') }).nullable(),
  grok: z.object({ executable: z.string().refine(isAbsolute).nullable(), agentId: z.string().nullable(),
    candidates: candidates(identitySchema), evidence: z.literal('live-gateway-roster').nullable(), commandStyle: z.enum(['gateway-flag', 'gateway-subcommand']).nullable(), commandStyleEvidence: z.literal('installed-cli-help').nullable(), unresolved: z.array(z.string()) }),
  unresolved: z.array(z.string()),
});

function resolveSetupDiscovery(input: unknown, choices: z.infer<typeof choicesSchema>, webhookTargetId?: string) {
  const discovery = discoverySchema.parse(input);
  const projectId = choices.projectId ?? discovery.project?.id;
  if (!projectId) throw new Error('PROJECT_SELECTION_REQUIRED');
  if (!discovery.projectCandidates.some(row => row.id === projectId)) throw new Error('PROJECT_NOT_DISCOVERED');
  // RFX-04 must rerun resource/secret discovery after a project decision. Never
  // attach another project's credentials/resources to a newly selected ID.
  if (discovery.project?.id !== projectId) throw new Error('PROJECT_DISCOVERY_REQUIRED');
  const { spectrum, grok } = discovery;
  if (!discovery.secretFile) throw new Error('PROJECT_SECRET_DISCOVERY_REQUIRED');
  if (!spectrum.mode) throw new Error('SPECTRUM_MODE_DISCOVERY_REQUIRED');
  const selectedUser = spectrum.user?.id;
  const matchingUsers = choices.initialAddress ? spectrum.userCandidates.filter(row =>
    [row.phoneNumber, row.email].some(address => address?.toLowerCase() === choices.initialAddress!.toLowerCase())) : [];
  const user = selectedUser ? spectrum.userCandidates.find(row => row.id === selectedUser)
    : matchingUsers.length === 1 ? matchingUsers[0] : spectrum.userCandidates.length === 1 ? spectrum.userCandidates[0] : undefined;
  if (!user) throw new Error('INITIAL_USER_ADDRESS_REQUIRED');
  if (spectrum.user && JSON.stringify(spectrumUserSchema.parse(spectrum.user)) !== JSON.stringify(user))
    throw new Error('SPECTRUM_USER_IDENTITY_MISMATCH');
  if (webhookTargetId && choices.grokAgentId) throw new Error('WEBHOOK_HAS_NO_GATEWAY_AGENT');
  const agentId = webhookTargetId ?? choices.grokAgentId ?? grok.agentId ?? (grok.candidates.length === 1 ? grok.candidates[0]!.id : undefined);
  if (!agentId) throw new Error('GROK_AGENT_SELECTION_REQUIRED');
  if (!webhookTargetId && (!grok.executable || grok.evidence !== 'live-gateway-roster' || !grok.candidates.some(row => row.id === agentId)))
    throw new Error('LIVE_GROK_AGENT_REQUIRED');
  if (!webhookTargetId && (!grok.commandStyle || grok.commandStyleEvidence !== 'installed-cli-help')) throw new Error('GROK_WAKE_COMMAND_STYLE_UNAVAILABLE');
  const resolvable = new Set(['project', 'spectrum.user', 'spectrum.servingE164', 'grok.agentId']);
  if ([...discovery.unresolved, ...grok.unresolved].some(field => !resolvable.has(field)))
    throw new Error('SETUP_DISCOVERY_INCOMPLETE');
  const dedicated = spectrum.mode === 'dedicated';
  let phone = spectrum.servingE164 ?? undefined;
  if (dedicated) {
    const line = spectrum.lineCandidates.find(row => row.id === spectrum.dedicatedLineId && row.platform === 'imessage');
    if (!line || !line.phoneNumber || (phone && phone !== line.phoneNumber)) throw new Error('DEDICATED_LINE_DISCOVERY_REQUIRED');
    phone = line.phoneNumber;
  } else {
    if (spectrum.dedicatedLineId || spectrum.lineCandidates.length) throw new Error('SHARED_DISCOVERY_LINE_CONFLICT');
    if (phone && user.assignedPhoneNumber && phone !== user.assignedPhoneNumber) throw new Error('SHARED_SERVING_PHONE_MISMATCH');
    phone ??= user.assignedPhoneNumber;
  }
  const initialAddress = choices.initialAddress ?? user.phoneNumber ?? user.email;
  if (!initialAddress && !choices.initialConversationId) throw new Error('INITIAL_CONVERSATION_OR_ADDRESS_REQUIRED');
  return { installationRoot: discovery.installationRoot, projectId,
    projectSecretFile: discovery.secretFile.path, accountId: user.accountId ?? user.id,
    dedicated, lineId: dedicated ? spectrum.dedicatedLineId : undefined, phone,
    initialAddress, conversationId: choices.initialConversationId,
    grokAgentId: agentId, grokExecutable: grok.executable, commandStyle: grok.commandStyle, commandStyleEvidence: grok.commandStyleEvidence };
}

/** Internal project/account identity, not a provider-issued line identifier. */
export function sharedLogicalLineId(projectId: string, accountId: string) {
  return 'shared:' + createHash('sha256').update(JSON.stringify([projectId, accountId])).digest('hex');
}

/** Refuse migration or overwrite of an existing installation artifact. */
export async function assertAbsent(path: string) {
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error('EXISTING_INSTALLATION_REQUIRES_MIGRATION');
}

/** Generate fresh owner authority without activation or overwriting existing state. */
export async function generateInitialOwnerConfiguration(input: unknown) {
  const parsed = setupInputSchema.parse(input);
  const webhook = parsed.webhookFile ? await readGrokWebhookBinding(parsed.webhookFile) : undefined;
  const resolved = resolveSetupDiscovery(parsed.discovery, parsed.choices, webhook ? webhookBindingId(webhook) : undefined);
  const root = resolve(resolved.installationRoot), runtime = join(root, 'runtime');
  await assertPrivateDirectory(root);
  await assertPrivateDirectory(runtime);
  const secretPath = resolve(resolved.projectSecretFile);
  const secretRelative = relative(runtime, secretPath);
  if (!secretRelative || secretRelative.startsWith('..') || isAbsolute(secretRelative))
    throw new Error('RUNTIME_PATH_OUTSIDE_INSTALLATION');
  if (parsed.webhookFile) {
    const wakeRelative = relative(runtime, resolve(parsed.webhookFile));
    if (!wakeRelative || wakeRelative.startsWith('..') || isAbsolute(wakeRelative)) throw new Error('RUNTIME_PATH_OUTSIDE_INSTALLATION');
  }
  // Never rotate/copy the provider secret, overwrite credentials, or reset state.
  for (const name of ['configuration.json', 'local-token', 'state.sqlite', 'runtime.sock'])
    await assertAbsent(join(runtime, name));
  const issuedAt = Date.now();
  const configuration = normalizedHostConfigurationSchema.parse({
    version: 3, ownerModel: 'installation-owner', activation: 'disabled',
    activateAfterValidation: parsed.activateAfterValidation,
    provider: { kind: 'spectrum-cloud-imessage', projectId: resolved.projectId,
      projectSecretFile: secretPath, projectSecretFormat: 'photon-project-secret-v1', accountId: resolved.accountId,
      lineId: resolved.dedicated ? resolved.lineId : sharedLogicalLineId(resolved.projectId, resolved.accountId),
      ...(resolved.phone ? { phone: resolved.phone } : {}),
      ...(resolved.conversationId ? { conversationId: resolved.conversationId } : {}),
      ...(resolved.initialAddress ? { initialAddress: resolved.initialAddress } : {}), dedicated: resolved.dedicated,
      availableOperations: supported },
    local: { socketPath: join(runtime, 'runtime.sock'), credentialFile: join(runtime, 'local-token'),
      principalId: randomUUID(), credentialId: randomUUID() },
    task: { contextId: randomUUID(), taskId: randomUUID(), generation: 0, permissions: [...operations],
      issuedAt, expiresAt: INSTALLATION_OWNER_EXPIRES_AT, grokAgentId: resolved.grokAgentId },
    grok: parsed.webhookFile ? { mode: 'webhook', bindingFile: parsed.webhookFile, timeoutMs: 10000 } :
      { executable: resolved.grokExecutable, timeoutMs: 15000, commandStyle: resolved.commandStyle, commandStyleEvidence: resolved.commandStyleEvidence },
    authorization: { administrativeOperations: [...administrativeOperations],
      allowedRecipients: resolved.initialAddress ? [resolved.initialAddress] : [], allowNativeContent: true },
    cards: parsed.cards, ...(parsed.cardBackend ? { cardBackend: parsed.cardBackend } : {}),
    textStreaming: { delivery: 'progressive' },
    runtime: { statePath: join(runtime, 'state.sqlite'), captureDirectory: join(runtime, 'captures'),
      stagingDirectory: join(runtime, 'staging'), importDirectory: join(runtime, 'imports') },
  });
  await readConfiguredProjectSecret(configuration);
  for (const path of [configuration.runtime.captureDirectory, configuration.runtime.stagingDirectory, configuration.runtime.importDirectory]) {
    if (!path) continue;
    await mkdir(path, { mode: 0o700, recursive: true });
    await assertPrivateDirectory(path);
  }
  // Exclusive creation fences concurrent generators; the winning token stays private.
  const file = await open(configuration.local.credentialFile, 'wx', 0o600);
  try {
    await file.chmod(0o600);
    await file.writeFile(randomBytes(32).toString('hex') + '\n');
    await file.sync();
  } finally { await file.close(); }
  return configuration;
}

/** Persist the initial configuration exclusively; existing authority is never replaced. */
export async function writeInitialConfiguration(root: string, configuration: NormalizedHostConfiguration): Promise<void> {
  const runtime = join(resolve(root), "runtime");
  await assertPrivateDirectory(resolve(root));
  await assertPrivateDirectory(runtime);
  const file = await open(join(runtime, "configuration.json"), "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(configuration, null, 2) + "\n");
    await file.sync();
  } finally { await file.close(); }
}
