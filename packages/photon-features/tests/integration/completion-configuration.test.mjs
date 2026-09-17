import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, chmod, symlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateConfiguration, profiles, generateProfiles, sharedLogicalLineId } from '../../scripts/generate-configuration.mjs';
import { configurationBlockers } from '../../dist/src/host/configuration-inventory.js';
import { productionHostConfigurationSchema, normalizedHostConfigurationSchema, normalizeProductionHostConfiguration, loadProductionHostConfiguration, loadNormalizedHostConfiguration, readConfiguredProjectSecret } from '../../dist/src/host/configuration.js';
import { resolveInitialConversation, validateInitialConversationPrerequisites, activationAfterValidationRequested } from '../../dist/src/host/initial-conversation.js';
import { SpectrumOwner } from '../../dist/src/adapters/transport/spectrum-owner.js';
import { ProviderContext } from '../../dist/src/adapters/transport/provider-context.js';
import { acquireHostOwnership } from '../../dist/src/host/owner-lock.js';
import { authenticateOwner } from '../../dist/src/host/authority-admin.js';
import { operations } from '../../dist/src/contracts/actions.js';
import { localRequestSchema, streamProducerInputSchemas } from '../../dist/src/contracts/protocol.js';

test('generated permission profiles and host validation cover the unchanged 44-operation registry without implicit grants', async () => {
  const input = { version: 1, profile: 'minimal-text', enable: ['text.send'],
    configuration: JSON.parse(await readFile(new URL('../../examples/minimal-text.configuration.json', import.meta.url), 'utf8')) };
  assert.equal(operations.length, 44);
  assert.equal(profiles.administrative.length, 40);
  await generateProfiles(true);
  const config = generateConfiguration(input);
  assert.deepEqual(config.task.permissions, ['text.send']); assert.equal(config.activation, 'disabled');
  assert.deepEqual(config.authorization.administrativeOperations, []);
  assert.throws(() => generateConfiguration({ ...input, enable: ['space.leave'] }), /OUTSIDE_PROFILE/);
  assert.throws(() => generateConfiguration({ ...input, profile: 'administrative', enable: ['space.leave'] }), /EXPLICIT_TASK_GRANT/);
  assert.throws(() => generateConfiguration({ ...input, profile: 'administrative', enable: ['poll.vote'] }), /OUTSIDE_PROFILE/);
  assert.equal(productionHostConfigurationSchema.safeParse({ ...config, provider: { ...config.provider, availableOperations: ['app.update'] } }).success, false);
  assert.equal(productionHostConfigurationSchema.safeParse({ ...config, ownerAdministration: { principalId: 'owner', credentialFile: config.local.credentialFile } }).success, false);
  const missing = configurationBlockers(config);
  assert.equal(missing['app.send'], undefined, 'built-in static card needs no backend or template');
  for (const op of ['poll.get', 'poll.vote', 'poll.unvote', 'poll.addOption', 'app.sendCustomized', 'app.update', 'custom.send']) assert.ok(missing[op]?.length, op);
  const custom = { id: 'example', kind: 'customized', origins: ['https://cards.example.invalid'], extension: { appName: 'Example', teamId: 'EXAMPLE001', extensionBundleId: 'invalid.example.card' } };
  assert.equal(configurationBlockers({ ...config, cards: [custom] })['app.update'], undefined);
  assert.equal(productionHostConfigurationSchema.safeParse({ ...config, cards: [{ ...custom, updateUrl: '() => execute()' }] }).success, false);
  const inventory = JSON.parse(await readFile(new URL('../../examples/production-inventory.json', import.meta.url), 'utf8'));
  assert.deepEqual(inventory.operations.map(row => row.operation), operations);
  for (const row of inventory.operations) for (const key of ['handler', 'implementationFile', 'sdkCall', 'startup', 'prerequisites', 'requiredResourceReferences', 'launcher', 'evidence', 'blockers']) assert.ok(key in row, row.operation + '.' + key);
});

test('producer protocol accepts only bounded versioned inert frames', () => {
  assert.equal(streamProducerInputSchemas['stream.open'].safeParse({ version: 1, ttlMs: 30000 }).success, true);
  for (const input of [{ version: 2, ttlMs: 30000 }, { version: 1, ttlMs: 30001 }, { version: 1, ttlMs: 30000, source: 'shell' }]) assert.equal(streamProducerInputSchemas['stream.open'].safeParse(input).success, false);
  assert.equal(localRequestSchema.safeParse({ version: 1, method: 'stream.open', contextId: 'ctx', ttlMs: 1000 }).success, true);
  assert.equal(localRequestSchema.safeParse({ version: 1, method: 'authority.apply', contextId: 'ctx' }).success, false);
});

// Matches RFX-04's SetupDiscovery v1, including its private JSON secret descriptor.
async function discovered(t, mode = 'shared') {
  const base = resolve('.photon-local/rfx-05-tests');
  await mkdir(base, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(base, 'install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'runtime');
  await mkdir(runtime, { mode: 0o700 });
  const projectSecret = 'fixture-secret-must-never-appear-in-output';
  const secretPath = join(runtime, 'project-secret.json');
  await writeFile(secretPath, JSON.stringify({ version: 1, projectId: 'project-1', projectSecret }), { mode: 0o600 });
  const user = { id: 'user-1', accountId: 'account-1', phoneNumber: '+15555550102', assignedPhoneNumber: '+15555550101' };
  const discovery = {
    version: 1, kind: 'setup-discovery', status: 'discovered', installationRoot: root,
    photon: { executable: join(root, 'photon'), version: '1.0.0', source: 'configured', identity: { id: 'owner-1' }, authStatus: 'verified' },
    project: { id: 'project-1', name: 'Example' }, projectCandidates: [{ id: 'project-1', name: 'Example' }],
    spectrum: { mode, user, userCandidates: [user], servingE164: '+15555550101',
      dedicatedLineId: mode === 'dedicated' ? 'dedicated-1' : null,
      lineCandidates: mode === 'dedicated' ? [{ id: 'dedicated-1', platform: 'imessage', phoneNumber: '+15555550101' }] : [] },
    secretFile: { path: secretPath, mode: '0600', format: 'photon-project-secret-v1' },
    grok: { executable: join(root, 'gbot'), version: '1.0.0', agentId: 'live-agent-1',
      candidates: [{ id: 'live-agent-1' }], evidence: 'live-gateway-roster', commandStyle: 'gateway-flag', commandStyleEvidence: 'installed-cli-help', unresolved: [] },
    unresolved: [], nextDecision: null,
  };
  return { root, runtime, projectSecret, discovery, input: { version: 2, discovery } };
}

for (const mode of ['shared', 'dedicated']) test(`RFX-04 ${mode} discovery generates complete owner configuration without internal inputs`, async t => {
  const fixture = await discovered(t, mode);
  const before = await readFile(fixture.discovery.secretFile.path, 'utf8');
  const config = await generateConfiguration({ ...fixture.input, activateAfterValidation: true });
  assert.equal(normalizedHostConfigurationSchema.safeParse(config).success, true);
  assert.deepEqual(config.task.permissions, operations);
  assert.deepEqual(config.provider.availableOperations, profiles.administrative);
  assert.equal(config.ownerModel, 'installation-owner');
  assert.equal(config.ownerAdministration, undefined);
  assert.equal(config.provider.dedicated, mode === 'dedicated');
  assert.equal(config.provider.phone, '+15555550101');
  assert.equal(config.provider.initialAddress, '+15555550102');
  assert.equal(config.provider.conversationId, undefined, 'no invented native chat ID');
  assert.equal(config.provider.lineId, mode === 'dedicated' ? 'dedicated-1' : sharedLogicalLineId('project-1', 'account-1'));
  assert.match(config.task.contextId, /^[0-9a-f-]{36}$/);
  assert.match(config.task.taskId, /^[0-9a-f-]{36}$/);
  assert.notEqual(config.task.contextId, config.task.taskId);
  assert.equal(config.task.generation, 0);
  assert.ok(config.task.expiresAt > config.task.issuedAt);
  assert.equal(config.activation, 'disabled');
  assert.equal(config.activateAfterValidation, true);
  assert.equal(config.grok.commandStyle, 'gateway-flag');
  assert.equal(config.grok.commandStyleEvidence, 'installed-cli-help');
  assert.equal(await readConfiguredProjectSecret(config), fixture.projectSecret);
  assert.equal(await readFile(fixture.discovery.secretFile.path, 'utf8'), before);
  assert.equal(JSON.stringify(config).includes(fixture.projectSecret), false);
  const token = (await readFile(config.local.credentialFile, 'utf8')).trim();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(config).includes(token), false);
  assert.equal((await stat(config.local.credentialFile)).mode & 0o777, 0o600);
  for (const directory of [fixture.root, fixture.runtime, config.runtime.captureDirectory, config.runtime.stagingDirectory, config.runtime.importDirectory])
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal(await authenticateOwner(config, config.local.credentialFile), config.local.principalId);
  await writeFile(join(fixture.runtime, 'configuration.json'), JSON.stringify(config), { mode: 0o600 });
  assert.deepEqual(await loadNormalizedHostConfiguration(fixture.root), config);
});

test('shared discovery needs neither a dedicated record nor a serving phone; logical ID stays stable', async t => {
  const a = await discovered(t), b = await discovered(t);
  for (const fixture of [a, b]) {
    fixture.discovery.spectrum.servingE164 = null;
    delete fixture.discovery.spectrum.user.assignedPhoneNumber;
    fixture.discovery.unresolved = ['spectrum.servingE164'];
    fixture.discovery.status = 'needs-input';
  }
  const first = await generateConfiguration(a.input), second = await generateConfiguration(b.input);
  assert.equal(first.provider.phone, undefined);
  assert.equal(first.provider.dedicated, false);
  assert.equal(first.provider.lineId, second.provider.lineId);
  assert.notEqual(first.task.contextId, second.task.contextId);
  assert.notEqual(await readFile(first.local.credentialFile, 'utf8'), await readFile(second.local.credentialFile, 'utf8'));
  assert.notEqual(sharedLogicalLineId('another-project', 'account-1'), first.provider.lineId);
});

test('only actual configured customized/live card prerequisites block; empty cards allow full-owner text setup', async t => {
  const fixture = await discovered(t);
  const card = { id: 'card', kind: 'customized', origins: ['https://cards.example.invalid'] };
  await assert.rejects(generateConfiguration({ ...fixture.input, cards: [card] }), /extension required/);
  await assert.rejects(generateConfiguration({ ...fixture.input, cards: [{ ...card, kind: 'universal', live: { installedExtensionVerified: true, evidence: 'fixture' } }] }), /extension required/);
  assert.equal((await readdir(fixture.runtime)).includes('local-token'), false);
  const config = await generateConfiguration(fixture.input);
  assert.ok(config.task.permissions.includes('text.send'));
  assert.ok(config.task.permissions.includes('app.sendCustomized'));
  assert.deepEqual(config.cards, []);
});

test('valid advanced card input is preserved without a separate native-content selection', async t => {
  const fixture = await discovered(t);
  const cards = [{ id: 'card', kind: 'customized', origins: ['https://cards.example.invalid'],
    extension: { appName: 'Example', teamId: 'ABCDE12345', extensionBundleId: 'com.example.card' },
    live: { installedExtensionVerified: true, evidence: 'fixture installation' } }];
  const config = await generateConfiguration({ ...fixture.input, cards });
  assert.deepEqual(config.cards, cards);
  assert.equal(config.authorization.allowNativeContent, true);
});

test('existing v2 config loads and normalizes deterministically without broadening or renewing authority', async t => {
  const fixture = await discovered(t);
  const legacy = JSON.parse(await readFile(new URL('../../examples/minimal-text.configuration.json', import.meta.url), 'utf8'));
  const mapped = JSON.parse(JSON.stringify(legacy).replaceAll('/absolute/private-root', fixture.root));
  mapped.cards = [{ id: 'legacy-live', kind: 'universal', origins: ['https://legacy.example.invalid'],
    live: { installedExtensionVerified: true, evidence: 'preserved legacy configuration' } }];
  const snapshot = structuredClone(mapped);
  await writeFile(join(fixture.runtime, 'configuration.json'), JSON.stringify(mapped), { mode: 0o600 });
  assert.deepEqual(await loadProductionHostConfiguration(fixture.root), mapped);
  const normalized = normalizeProductionHostConfiguration(mapped);
  assert.deepEqual(normalizeProductionHostConfiguration(mapped), normalized);
  assert.deepEqual(normalizeProductionHostConfiguration(normalized), normalized);
  assert.deepEqual(normalized.task, mapped.task);
  assert.deepEqual(normalized.authorization, mapped.authorization);
  assert.deepEqual(normalized.local, mapped.local);
  assert.equal(normalized.activation, mapped.activation);
  assert.equal(normalized.ownerModel, 'legacy-task');
  assert.equal(normalized.activateAfterValidation, false);
  assert.deepEqual(mapped, snapshot);
  assert.deepEqual(await loadNormalizedHostConfiguration(fixture.root), normalized);
  await assert.rejects(authenticateOwner(mapped, mapped.local.credentialFile), /OWNER_ADMINISTRATION_NOT_CONFIGURED/);
  assert.deepEqual(JSON.parse(await readFile(join(fixture.runtime, 'configuration.json'), 'utf8')), mapped);
});

test('legacy independent owner token boundary remains enforced', async t => {
  const fixture = await discovered(t);
  const config = await generateConfiguration(fixture.input);
  const legacy = { ...config, version: 2, ownerAdministration: { principalId: 'legacy-owner', credentialFile: join(fixture.runtime, 'owner-token') } };
  delete legacy.ownerModel; delete legacy.activateAfterValidation;
  delete legacy.grok.commandStyle; delete legacy.grok.commandStyleEvidence;
  delete legacy.provider.initialAddress; delete legacy.provider.projectSecretFormat;
  legacy.provider.conversationId = 'existing-native-conversation';
  const parsed = productionHostConfigurationSchema.parse(legacy);
  await writeFile(parsed.ownerAdministration.credentialFile, 'a'.repeat(64), { mode: 0o600 });
  assert.equal(await authenticateOwner(parsed, parsed.ownerAdministration.credentialFile), 'legacy-owner');
  await assert.rejects(authenticateOwner(parsed, parsed.local.credentialFile), /OWNER_AUTHENTICATION_REQUIRED/);
  await writeFile(parsed.ownerAdministration.credentialFile, await readFile(parsed.local.credentialFile));
  await assert.rejects(authenticateOwner(parsed, parsed.ownerAdministration.credentialFile), /OWNER_AUTHENTICATION_REQUIRED/);
});

test('rejects private secret permission, symlink, identity and path failures before creating a token', async t => {
  const fixture = await discovered(t), path = fixture.discovery.secretFile.path;
  await chmod(path, 0o644);
  await assert.rejects(generateConfiguration(fixture.input), /PRIVATE_FILE_REQUIRED/);
  await chmod(path, 0o600);
  await writeFile(path, JSON.stringify({ version: 1, projectId: 'other-project', projectSecret: fixture.projectSecret }));
  await assert.rejects(generateConfiguration(fixture.input), /PROJECT_SECRET_IDENTITY_MISMATCH/);
  fixture.discovery.secretFile.path = join(fixture.root, 'outside-runtime');
  await assert.rejects(generateConfiguration(fixture.input), /RUNTIME_PATH_OUTSIDE_INSTALLATION/);
  fixture.discovery.secretFile.path = join(fixture.runtime, 'linked-secret');
  await symlink(path, fixture.discovery.secretFile.path);
  await assert.rejects(generateConfiguration(fixture.input), /ELOOP/);
  assert.equal((await readdir(fixture.runtime)).includes('local-token'), false);
});

test('refuses to reset existing credentials or state and never overwrites installation data', async t => {
  const fixture = await discovered(t);
  const state = join(fixture.runtime, 'state.sqlite');
  await writeFile(state, 'preserved state', { mode: 0o600 });
  await assert.rejects(generateConfiguration(fixture.input), /EXISTING_INSTALLATION_REQUIRES_MIGRATION/);
  assert.equal(await readFile(state, 'utf8'), 'preserved state');
  const other = await discovered(t);
  const config = await generateConfiguration(other.input);
  const token = await readFile(config.local.credentialFile, 'utf8');
  await assert.rejects(generateConfiguration(other.input), /EXISTING_INSTALLATION_REQUIRES_MIGRATION/);
  assert.equal(await readFile(config.local.credentialFile, 'utf8'), token);
});

test('project and live agent ambiguities require the smallest product decision', async t => {
  const fixture = await discovered(t);
  fixture.discovery.grok.agentId = null;
  fixture.discovery.grok.candidates.push({ id: 'live-agent-2' });
  fixture.discovery.grok.unresolved = ['grok.agentId'];
  await assert.rejects(generateConfiguration(fixture.input), /GROK_AGENT_SELECTION_REQUIRED/);
  await assert.rejects(generateConfiguration({ ...fixture.input, choices: { grokAgentId: 'stale-profile' } }), /LIVE_GROK_AGENT_REQUIRED/);
  fixture.discovery.projectCandidates.push({ id: 'project-2' });
  await assert.rejects(generateConfiguration({ ...fixture.input, choices: { projectId: 'project-2', grokAgentId: 'live-agent-2' } }), /PROJECT_DISCOVERY_REQUIRED/);
  const config = await generateConfiguration({ ...fixture.input, choices: { grokAgentId: 'live-agent-2' } });
  assert.equal(config.task.grokAgentId, 'live-agent-2');
});

test('ambiguous Spectrum users are resolved by intended address without manual account IDs', async t => {
  const fixture = await discovered(t);
  fixture.discovery.spectrum.user = null;
  fixture.discovery.spectrum.servingE164 = null;
  fixture.discovery.spectrum.userCandidates.push({ id: 'user-2', phoneNumber: '+15555550103', assignedPhoneNumber: '+15555550104' });
  fixture.discovery.unresolved = ['spectrum.user', 'spectrum.servingE164'];
  await assert.rejects(generateConfiguration(fixture.input), /INITIAL_USER_ADDRESS_REQUIRED/);
  const config = await generateConfiguration({ ...fixture.input, choices: { initialAddress: '+15555550103' } });
  assert.equal(config.provider.accountId, 'user-2');
  assert.equal(config.provider.phone, '+15555550104');
});

test('generator CLI emits no secrets and invokes no provisioning, secret rotation or Grok commands', async t => {
  const fixture = await discovered(t);
  const marker = join(fixture.root, 'external-command-called');
  for (const filename of ['photon', 'gbot', 'npm']) await writeFile(join(fixture.root, filename),
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'called'); process.exit(99);\n`, { mode: 0o700 });
  const inputFile = join(fixture.root, 'input.json'), outputFile = join(fixture.runtime, 'configuration.json');
  await writeFile(inputFile, JSON.stringify(fixture.input), { mode: 0o600 });
  const child = spawnSync(process.execPath, [new URL('../../scripts/generate-configuration.mjs', import.meta.url).pathname, inputFile, outputFile],
    { encoding: 'utf8', env: { ...process.env, PATH: fixture.root } });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(await readFile(outputFile, 'utf8'));
  const token = (await readFile(output.local.credentialFile, 'utf8')).trim();
  for (const text of [child.stdout, child.stderr, JSON.stringify(output)]) {
    assert.equal(text.includes(fixture.projectSecret), false);
    assert.equal(text.includes(token), false);
  }
  await assert.rejects(stat(marker), { code: 'ENOENT' });
  assert.equal(JSON.parse(child.stdout).activation, 'disabled');
  assert.equal((await stat(outputFile)).mode & 0o777, 0o600);
});


test('normal setup rejects manual permission profiles and missing discovery prerequisites', async t => {
  const fixture = await discovered(t);
  await assert.rejects(generateConfiguration({ ...fixture.input, enable: ['text.send'] }), /Unrecognized key/);
  await assert.rejects(generateConfiguration({ ...fixture.input, profile: 'minimal-text' }), /Unrecognized key/);
  fixture.discovery.grok.evidence = null;
  await assert.rejects(generateConfiguration(fixture.input), /LIVE_GROK_AGENT_REQUIRED/);
  fixture.discovery.grok.evidence = 'live-gateway-roster';
  delete fixture.discovery.spectrum.user.phoneNumber;
  await assert.rejects(generateConfiguration(fixture.input), /INITIAL_CONVERSATION_OR_ADDRESS_REQUIRED/);
  const config = await generateConfiguration({ ...fixture.input, choices: { initialAddress: 'owner@example.test' } });
  assert.equal(config.provider.initialAddress, 'owner@example.test');
});


test('owner setup requires observed Grok command shape and evidence', async t => {
  const fixture = await discovered(t);
  for (const grok of [
    { ...fixture.discovery.grok, commandStyle: null },
    { ...fixture.discovery.grok, commandStyleEvidence: null },
  ]) await assert.rejects(generateConfiguration({ ...fixture.input,
    discovery: { ...fixture.discovery, grok } }), /GROK_WAKE_COMMAND_STYLE_UNAVAILABLE/);
  const config = await generateConfiguration({ ...fixture.input,
    discovery: { ...fixture.discovery, grok: { ...fixture.discovery.grok, commandStyle: 'gateway-subcommand' } } });
  assert.equal(config.grok.commandStyle, 'gateway-subcommand');
});

async function routeFixture(t, mode = 'shared') {
  const f = await discovered(t, mode);
  const config = { ...await generateConfiguration({ ...f.input, activateAfterValidation: true }), activation: 'enabled' };
  const path = join(f.runtime, 'configuration.json');
  await writeFile(path, JSON.stringify(config) + '\n', { mode: 0o600 });
  const ownership = await acquireHostOwnership(f.runtime, 'fixture-release');
  const calls = { factories: 0, creates: [], gets: [], listeners: 0, stops: 0 };
  const space = { __platform: 'imessage', id: `${mode === 'shared' ? 'any' : 'iMessage'};-;${config.provider.initialAddress}`,
    type: 'dm', phone: mode === 'shared' ? 'shared' : config.provider.phone };
  const results = { create: async () => space, get: async () => space };
  const provider = { space: {
    create: async (...args) => { calls.creates.push(args); return results.create(); },
    get: async (...args) => { calls.gets.push(args); return results.get(); },
  } };
  const owner = new SpectrumOwner({ inbound: 'photon-stream', outbound: 'imessage', wake: 'existing-grok-task-handoff' },
    new ProviderContext(config.provider.projectId, [{ accountId: config.provider.accountId, lineId: config.provider.lineId, dedicated: mode === 'dedicated', servingPhone: config.provider.phone }]),
    async () => { calls.factories++; return { provider: () => provider,
      messages: () => { calls.listeners++; return (async function* () {})(); },
      stop: async () => { calls.stops++; },
      space: () => { throw new Error('unresolved route must use public provider namespace'); },
    }; });
  t.after(() => owner.stop());
  return { ...f, config, path, owner, ownership, calls, space, results,
    resolve: () => resolveInitialConversation(f.root, config, owner, ownership) };
}

test('fresh address-only configuration validates offline without SDK, activation, or durable state', async t => {
  const f = await routeFixture(t);
  const disabled = { ...f.config, activation: 'disabled' };
  const result = await validateInitialConversationPrerequisites(disabled);
  assert.equal(result.provider.conversationId, undefined);
  assert.equal(result.activation, 'disabled');
  assert.equal(f.calls.factories, 0);
  assert.equal(f.calls.listeners, 0);
  await assert.rejects(stat(f.config.runtime.statePath), { code: 'ENOENT' });
});

for (const mode of ['shared', 'dedicated']) test(`${mode} initial DM resolution uses the same owner and atomically persists only the exact returned ID`, async t => {
  const f = await routeFixture(t, mode);
  const original = JSON.parse(await readFile(f.path, 'utf8'));
  const inode = (await stat(f.path)).ino;
  const token = await readFile(f.config.local.credentialFile, 'utf8');
  const secret = await readFile(f.config.provider.projectSecretFile, 'utf8');
  await f.owner.start();
  const result = await f.resolve();
  assert.equal(result.provider.conversationId, f.space.id);
  assert.deepEqual(f.calls.creates, mode === 'shared' ? [[f.config.provider.initialAddress]]
    : [[f.config.provider.initialAddress, { phone: f.config.provider.phone }]]);
  assert.deepEqual(f.calls.gets, mode === 'shared' ? [[f.space.id]] : [[f.space.id, { phone: f.config.provider.phone }]]);
  const persisted = JSON.parse(await readFile(f.path, 'utf8'));
  assert.deepEqual(persisted, { ...original, provider: { ...original.provider, conversationId: f.space.id } });
  assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  assert.notEqual((await stat(f.path)).ino, inode, 'configuration is atomically replaced, not edited in place');
  assert.deepEqual(persisted.task, original.task);
  assert.deepEqual(persisted.local, original.local);
  assert.equal(await readFile(f.config.local.credentialFile, 'utf8'), token);
  assert.equal(await readFile(f.config.provider.projectSecretFile, 'utf8'), secret);
  await assert.rejects(stat(f.config.runtime.statePath), { code: 'ENOENT' });
  assert.ok((await readdir(f.runtime)).includes('host.lock'));
  assert.equal((await readdir(f.runtime)).some(name => name.startsWith('.initial-conversation-')), false);
  assert.deepEqual(await resolveInitialConversation(f.root, result, f.owner, f.ownership), result);
  assert.equal(f.calls.creates.length, 1, 'restart does not resolve an already persisted native ID');
  await f.owner.start();
  f.owner.stream('runtime-listener');
  assert.equal(f.calls.factories, 1);
  assert.equal(f.calls.listeners, 1);
  assert.throws(() => f.owner.stream('second-listener'), /COMPETING_RECEIVE_PATH/);
});

test('activation, host ownership, and a ready matching owner are required before provider resolution', async t => {
  const f = await routeFixture(t);
  const disabled = { ...f.config, activation: 'disabled' };
  await writeFile(f.path, JSON.stringify(disabled));
  await assert.rejects(resolveInitialConversation(f.root, disabled, f.owner, f.ownership), /ACTIVATION_REQUIRED/);
  await writeFile(f.path, JSON.stringify(f.config));
  await assert.rejects(resolveInitialConversation(f.root, f.config, f.owner, { ...f.ownership, path: join(f.runtime, 'other.lock') }), /HOST_OWNERSHIP_REQUIRED/);
  await assert.rejects(f.resolve(), /OWNER_NOT_READY/);
  await f.owner.start();
  const otherOwner = { ready: () => true, provider: () => { throw new Error('must not access mismatched owner'); },
    routes: { projectId: 'wrong-project', evidence: () => [] } };
  await assert.rejects(resolveInitialConversation(f.root, f.config, otherOwner, f.ownership), /INITIAL_CONVERSATION_OWNER_MISMATCH/);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.gets.length, 0);
});

test('existing state or expired authority blocks unresolved onboarding without renewal or provider calls', async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  await writeFile(f.config.runtime.statePath, 'must preserve', { mode: 0o600 });
  await assert.rejects(validateInitialConversationPrerequisites(f.config), /UNRESOLVED_CONVERSATION_WITH_EXISTING_STATE/);
  await assert.rejects(f.resolve(), /UNRESOLVED_CONVERSATION_WITH_EXISTING_STATE/);
  assert.equal(await readFile(f.config.runtime.statePath, 'utf8'), 'must preserve');
  const expired = { ...f.config, task: { ...f.config.task, issuedAt: 0, expiresAt: 1 } };
  await writeFile(f.path, JSON.stringify(expired));
  await assert.rejects(resolveInitialConversation(f.root, expired, f.owner, f.ownership), /EXPIRED_TASK_BINDING/);
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')).task, expired.task);
  assert.equal(f.calls.creates.length, 0);
});

for (const stage of ['create', 'get']) test(`resolution rejects non-iMessage, group, wrong-peer, missing-ID and wrong-route ${stage} results`, async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  const original = await readFile(f.path, 'utf8');
  for (const patch of [{ __platform: 'local_imessage' }, { type: 'group' }, { id: 'any;-;+15555550999' },
    { id: '' }, { id: 'opaque-without-peer-evidence' }, { phone: '+15555550888' }, { id: 'any;+;group' }]) {
    f.results[stage] = async () => ({ ...f.space, ...patch });
    await assert.rejects(f.resolve(), /INITIAL_CONVERSATION_ROUTE_MISMATCH/);
    assert.equal(await readFile(f.path, 'utf8'), original);
    assert.equal((await readdir(f.runtime)).some(name => name.startsWith('.initial-conversation-')), false);
  }
});

test('provider failures do not retry, activate, or persist a fabricated fallback', async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  const original = await readFile(f.path, 'utf8');
  f.results.create = async () => { throw new Error('PROVIDER_RESOLUTION_FAILED'); };
  await assert.rejects(f.resolve(), /PROVIDER_RESOLUTION_FAILED/);
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.calls.gets.length, 0);
  assert.equal(await readFile(f.path, 'utf8'), original);
  assert.equal(f.calls.listeners, 0);
});

test('stale configuration and lock changes across provider awaits cannot overwrite authority', async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  const original = await readFile(f.path, 'utf8');
  const changed = { ...f.config, task: { ...f.config.task, generation: 1 } };
  await writeFile(f.path, JSON.stringify(changed));
  await assert.rejects(f.resolve(), /INITIAL_CONVERSATION_CONFIGURATION_CHANGED/);
  assert.equal(f.calls.creates.length, 0);
  await writeFile(f.path, original);
  f.results.create = async () => { await writeFile(f.path, JSON.stringify(changed)); return f.space; };
  await assert.rejects(f.resolve(), /INITIAL_CONVERSATION_CONFIGURATION_CHANGED/);
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), changed);
  await writeFile(f.path, original);
  f.results.create = async () => {
    const lock = JSON.parse(await readFile(f.ownership.path, 'utf8'));
    await writeFile(f.ownership.path, JSON.stringify({ ...lock, nonce: 'replacement-owner' }));
    return f.space;
  };
  await assert.rejects(f.resolve(), /HOST_OWNERSHIP_CHANGED/);
  assert.equal(await readFile(f.path, 'utf8'), original);
});

test('concurrent resolution on one installation is fenced and preserves the first native result', async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  let entered, release;
  const entry = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.results.create = async () => { entered(); await gate; return f.space; };
  const first = f.resolve();
  await entry;
  try { await assert.rejects(f.resolve(), /INITIAL_CONVERSATION_RESOLUTION_IN_PROGRESS/); }
  finally { release(); }
  assert.equal((await first).provider.conversationId, f.space.id);
  assert.equal(f.calls.creates.length, 1);
});

test('setup activation decision adopts generated intent only when the host option is omitted', async t => {
  const f = await discovered(t);
  const config = await generateConfiguration({ ...f.input, activateAfterValidation: true });
  assert.equal(activationAfterValidationRequested(config), true);
  assert.equal(activationAfterValidationRequested(config, false), false);
  assert.equal(activationAfterValidationRequested({ ...config, activateAfterValidation: false }, true), true);
  assert.equal(activationAfterValidationRequested({ ...config, activateAfterValidation: false }), false);
  assert.equal(config.activation, 'disabled');
});


test('shared email resolution preserves the returned ID even without displayed serving metadata', async t => {
  const f = await routeFixture(t);
  delete f.config.provider.phone;
  f.config.provider.initialAddress = 'Owner@Example.test';
  f.space.id = 'any;-;owner@example.test';
  await writeFile(f.path, JSON.stringify(f.config));
  await f.owner.start();
  const result = await f.resolve();
  assert.equal(result.provider.conversationId, 'any;-;owner@example.test');
  assert.equal(result.provider.phone, undefined);
  assert.deepEqual(f.calls.creates, [['Owner@Example.test']]);
});

test('lock held by a different PID and a mismatched native ID read both fail closed', async t => {
  const f = await routeFixture(t);
  await f.owner.start();
  const lock = await readFile(f.ownership.path, 'utf8');
  await writeFile(f.ownership.path, JSON.stringify({ ...JSON.parse(lock), pid: process.pid + 1 }));
  await assert.rejects(f.resolve(), /HOST_OWNERSHIP_REQUIRED/);
  assert.equal(f.calls.creates.length, 0);
  await writeFile(f.ownership.path, lock);
  f.results.get = async () => ({ ...f.space, id: `iMessage;-;${f.config.provider.initialAddress}` });
  await assert.rejects(f.resolve(), /INITIAL_CONVERSATION_ROUTE_MISMATCH/);
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).provider.conversationId, undefined);
});


test('returned route must bind through the existing owner route table, not only match config text', async t => {
  const f = await routeFixture(t, 'dedicated');
  await f.owner.start();
  const wrongRouteOwner = { ready: () => f.owner.ready(), provider: () => f.owner.provider(),
    routes: new ProviderContext(f.config.provider.projectId, [{ accountId: f.config.provider.accountId,
      lineId: f.config.provider.lineId, dedicated: true, servingPhone: '+15555550999' }]) };
  await assert.rejects(resolveInitialConversation(f.root, f.config, wrongRouteOwner, f.ownership), /INITIAL_CONVERSATION_ROUTE_MISMATCH/);
  assert.equal(f.calls.gets.length, 0);
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).provider.conversationId, undefined);
});

test('generated installation owner validates beyond 24 hours without renewal', async t => {
  const f = await discovered(t);
  const config = await generateConfiguration(f.input);
  assert.equal(config.task.expiresAt, Number.MAX_SAFE_INTEGER);
  await validateInitialConversationPrerequisites(config, config.task.issuedAt + 2 * 86_400_000);
});
