import { readFile, writeFile, mkdir, open, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve, dirname } from 'node:path';
import { authorityTransitionSchema } from '../dist/src/host/authority-admin.js';
import { streamProducerInputSchemas, localRequestSchema } from '../dist/src/contracts/protocol.js';
import { operations } from '../dist/src/contracts/actions.js';
import { productionHostConfigurationSchema, normalizedHostConfigurationSchema, readConfiguredProjectSecret, assertPrivateDirectory } from '../dist/src/host/configuration.js';
import { administrativeOperations, upstreamPollOperations, configurationBlockers } from '../dist/src/host/configuration-inventory.js';

// Legacy v1 examples only. Normal product setup uses discovery and full-owner grants.
const administrative = new Set([...administrativeOperations, 'custom.send']);
const supported = operations.filter(op => !upstreamPollOperations.includes(op));
export const profiles = Object.freeze({
  'minimal-text': ['typing.begin', 'typing.end', 'text.send', 'message.get', 'message.reply', 'message.markRead'],
  messaging: supported.filter(op => !administrative.has(op)),
  administrative: supported,
});
const inputSchema = z.strictObject({ version: z.literal(1), profile: z.enum(Object.keys(profiles)),
  enable: z.array(z.enum(operations)).min(1).refine(items => new Set(items).size === items.length),
  configuration: z.unknown(),
});
/** v1 stays synchronous for legacy callers; v2 discovery input returns a Promise.
 * Always await this entry point in the product setup/lifecycle path. */
export function generateConfiguration(input) {
  if (input?.version === 2) return generateOwnerConfiguration(input);
  const parsed = inputSchema.parse(input);
  if (parsed.enable.some(op => !profiles[parsed.profile].includes(op))) throw new Error('OPERATION_OUTSIDE_PROFILE');
  // Require a schema-valid owner-authored baseline so recipients, native-content
  // intent, identifiers, time limits, backend and filesystem roots are explicit.
  const baseline = productionHostConfigurationSchema.parse(parsed.configuration);
  if (parsed.enable.some(op => !baseline.task.permissions.includes(op))) throw new Error('EXPLICIT_TASK_GRANT_REQUIRED');
  const configuration = productionHostConfigurationSchema.parse({ ...baseline, activation: 'disabled',
    task: { ...baseline.task, permissions: parsed.enable },
    provider: { ...baseline.provider, availableOperations: parsed.enable },
    authorization: { ...baseline.authorization,
      administrativeOperations: baseline.authorization.administrativeOperations.filter(op => parsed.enable.includes(op)) },
  });
  const blockers = configurationBlockers(configuration);
  for (const op of parsed.enable) if (blockers[op]?.length) throw new Error(op + ': ' + blockers[op].join(' '));
  return configuration;
}
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
  cards: normalizedHostConfigurationSchema.shape.cards.default([]),
  cardBackend: normalizedHostConfigurationSchema.shape.cardBackend,
});

const identitySchema = z.object({ id: z.string().min(1), name: z.string().optional(), email: z.string().optional() });
const spectrumUserSchema = identitySchema.extend({ accountId: z.string().min(1).optional(),
  phoneNumber: z.string().optional(), assignedPhoneNumber: z.string().optional() });
const candidates = schema => z.array(schema).max(1000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'duplicate discovery identity');
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

function resolveSetupDiscovery(input, choices) {
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
    [row.phoneNumber, row.email].some(address => address?.toLowerCase() === choices.initialAddress.toLowerCase())) : [];
  const user = selectedUser ? spectrum.userCandidates.find(row => row.id === selectedUser)
    : matchingUsers.length === 1 ? matchingUsers[0] : spectrum.userCandidates.length === 1 ? spectrum.userCandidates[0] : undefined;
  if (!user) throw new Error('INITIAL_USER_ADDRESS_REQUIRED');
  if (spectrum.user && JSON.stringify(spectrumUserSchema.parse(spectrum.user)) !== JSON.stringify(user))
    throw new Error('SPECTRUM_USER_IDENTITY_MISMATCH');
  const agentId = choices.grokAgentId ?? grok.agentId ?? (grok.candidates.length === 1 ? grok.candidates[0].id : undefined);
  if (!agentId) throw new Error('GROK_AGENT_SELECTION_REQUIRED');
  if (!grok.executable || grok.evidence !== 'live-gateway-roster' || !grok.candidates.some(row => row.id === agentId))
    throw new Error('LIVE_GROK_AGENT_REQUIRED');
  if (!grok.commandStyle || grok.commandStyleEvidence !== 'installed-cli-help') throw new Error('GROK_WAKE_COMMAND_STYLE_UNAVAILABLE');
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
export function sharedLogicalLineId(projectId, accountId) {
  return 'shared:' + createHash('sha256').update(JSON.stringify([projectId, accountId])).digest('hex');
}

async function assertAbsent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('EXISTING_INSTALLATION_REQUIRES_MIGRATION');
}

async function generateOwnerConfiguration(input) {
  const parsed = setupInputSchema.parse(input);
  const resolved = resolveSetupDiscovery(parsed.discovery, parsed.choices);
  const root = resolve(resolved.installationRoot), runtime = join(root, 'runtime');
  await assertPrivateDirectory(root);
  await assertPrivateDirectory(runtime);
  const secretPath = resolve(resolved.projectSecretFile);
  const secretRelative = relative(runtime, secretPath);
  if (!secretRelative || secretRelative.startsWith('..') || isAbsolute(secretRelative))
    throw new Error('RUNTIME_PATH_OUTSIDE_INSTALLATION');
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
      issuedAt, expiresAt: issuedAt + 86_400_000, grokAgentId: resolved.grokAgentId },
    grok: { executable: resolved.grokExecutable, timeoutMs: 15000, commandStyle: resolved.commandStyle, commandStyleEvidence: resolved.commandStyleEvidence },
    authorization: { administrativeOperations: [...administrativeOperations],
      allowedRecipients: resolved.initialAddress ? [resolved.initialAddress] : [], allowNativeContent: true },
    cards: parsed.cards, ...(parsed.cardBackend ? { cardBackend: parsed.cardBackend } : {}),
    textStreaming: { delivery: 'progressive' },
    runtime: { statePath: join(runtime, 'state.sqlite'), captureDirectory: join(runtime, 'captures'),
      stagingDirectory: join(runtime, 'staging'), importDirectory: join(runtime, 'imports') },
  });
  await readConfiguredProjectSecret(configuration);
  for (const path of [configuration.runtime.captureDirectory, configuration.runtime.stagingDirectory, configuration.runtime.importDirectory]) {
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

export async function generateProfiles(check = false, { schemas: includeSchemas = true } = {}) {
  const directory = new URL('../examples/profiles/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, allowedOperations] of Object.entries(profiles)) {
    const content = JSON.stringify({ version: 1, legacy: true, profile: name, allowedOperations,
      defaultEnabledOperations: [], explicitOwnerSelectionRequired: true,
      upstreamReleaseBlockers: upstreamPollOperations,
      note: 'Legacy v1 compatibility example only. Normal setup consumes discovery with version 2 input and full-owner grants; generation does not activate.' }, null, 2) + '\n';
    const target = new URL(name + '.json', directory);
    if (check) { if (await readFile(target, 'utf8') !== content) throw new Error('PROFILE_DRIFT'); }
    else await writeFile(target, content);
  }
  const schemas = { 'host-configuration-v2': productionHostConfigurationSchema, 'host-configuration-v3': normalizedHostConfigurationSchema, 'authority-transition-v1': authorityTransitionSchema,
    protocol: localRequestSchema, ...streamProducerInputSchemas };
  for (const [name, schema] of Object.entries(includeSchemas ? schemas : {})) {
    const target = new URL('../schemas/' + name + '.json', import.meta.url);
    const content = JSON.stringify(z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'throw' }), null, 2) + '\n';
    if (check) { if (await readFile(target, 'utf8') !== content) throw new Error('CONFIGURATION_SCHEMA_DRIFT'); }
    else await writeFile(target, content);
  }
  return { profiles: Object.keys(profiles).length, registryOperations: operations.length, supportedOperations: supported.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--profiles', '--check'].includes(args[0])) console.log(JSON.stringify(await generateProfiles(args[0] === '--check')));
    else {
      if (args.length !== 2) throw new Error('USAGE_INPUT_JSON_OUTPUT_JSON');
      await assertAbsent(resolve(args[1]));
      await assertPrivateDirectory(dirname(resolve(args[1])));
      const config = await generateConfiguration(JSON.parse(await readFile(args[0], 'utf8')));
      await writeFile(args[1], JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ generated: args[1], activation: 'disabled', activateAfterValidation: config.activateAfterValidation ?? false, operations: config.task.permissions.length }));
    }
  } catch (error) { console.error('Configuration generation failed: ' + error.message); process.exitCode = 1; }
}
