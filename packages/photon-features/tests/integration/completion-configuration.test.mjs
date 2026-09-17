import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, chmod, symlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateConfiguration, profiles, generateProfiles, sharedLogicalLineId } from '../../scripts/generate-configuration.mjs';
import { configurationBlockers } from '../../dist/src/host/configuration-inventory.js';
import { productionHostConfigurationSchema, normalizedHostConfigurationSchema, normalizeProductionHostConfiguration, loadProductionHostConfiguration, loadNormalizedHostConfiguration, readConfiguredProjectSecret } from '../../dist/src/host/configuration.js';
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
