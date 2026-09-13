import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateConfiguration, profiles, generateProfiles } from '../../scripts/generate-configuration.mjs';
import { configurationBlockers } from '../../dist/src/host/configuration-inventory.js';
import { productionHostConfigurationSchema } from '../../dist/src/host/configuration.js';
import { operations } from '../../dist/src/contracts/actions.js';
import { localRequestSchema, streamProducerInputSchemas } from '../../dist/src/contracts/protocol.js';

test('generated permission profiles and host validation cover the unchanged 44-operation registry without implicit grants', async () => {
  const input = JSON.parse(await readFile(new URL('../../examples/configuration-input.json', import.meta.url), 'utf8'));
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
  for (const op of ['poll.get', 'poll.vote', 'poll.unvote', 'poll.addOption', 'app.send', 'app.sendCustomized', 'app.update', 'custom.send']) assert.ok(missing[op]?.length, op);
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
