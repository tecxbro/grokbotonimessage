import test from 'node:test';
import { privateTestRoot } from '../../dist/tests/helpers/private-temp.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { generateConfiguration } from '../../scripts/generate-configuration.mjs';
import { validateProductionInstallation, setupProductionInstallation, runProductionHost } from '../../dist/src/host/process.js';
import { loadNormalizedHostConfiguration } from '../../dist/src/host/configuration.js';
import { DurableSQLiteStore } from '../../dist/src/adapters/state/sqlite.js';

// Fresh owner setup and host lifecycle use the real generator/config/locks/SQLite.
// External SDK/Grok boundaries are controlled. Packaging mechanics are additionally
// covered by tests/artifact/rfx-owner-package.test.mjs and completion-installed.test.mjs.
test('fresh discovered shared owner validates offline, honors persisted activation and resolves once with one owner', async t => {
  const root = await privateTestRoot(t, 'rfx-setup-');
  const runtime = join(root, 'runtime'), releaseId = 'd'.repeat(64), releaseRoot = join(root, 'releases', releaseId);
  await mkdir(runtime, { mode: 0o700 });
  await mkdir(releaseRoot, { recursive: true, mode: 0o700 });
  const skill = 'Offline fixture release-pinned skill';
  await writeFile(join(releaseRoot, 'SKILL.md'), skill, { mode: 0o600 });
  await writeFile(join(releaseRoot, 'release-manifest.json'), JSON.stringify({ checksum: releaseId,
    files: [{ path: 'SKILL.md', sha256: createHash('sha256').update(skill).digest('hex') }] }), { mode: 0o600 });
  await writeFile(join(root, 'selected-release.json'), JSON.stringify({ version: 1, release: releaseId, activation: 'disabled' }), { mode: 0o600 });
  const executable = join(root, 'gbot');
  await writeFile(executable, '#!/bin/sh\nif [ "$1" = "--help" ]; then echo "  --gateway"; elif [ "$1" = "--gateway" ] && [ "$2" = "--help" ]; then echo "  send AGENT POINTER"; else exit 1; fi\n', { mode: 0o700 });
  const secret = join(runtime, 'project-secret.json');
  await writeFile(secret, JSON.stringify({ version: 1, projectId: 'project-1', projectSecret: 'offline-only' }), { mode: 0o600 });
  const user = { id: 'user-1', accountId: 'account-1', phoneNumber: '+15555550102' };
  const discovery = { version: 1, kind: 'setup-discovery', installationRoot: root,
    project: { id: 'project-1' }, projectCandidates: [{ id: 'project-1' }],
    spectrum: { mode: 'shared', user, userCandidates: [user], servingE164: null, dedicatedLineId: null, lineCandidates: [] },
    secretFile: { path: secret, mode: '0600', format: 'photon-project-secret-v1' },
    grok: { executable, agentId: 'agent-1', candidates: [{ id: 'agent-1' }], evidence: 'live-gateway-roster',
      commandStyle: 'gateway-flag', commandStyleEvidence: 'installed-cli-help', unresolved: [] }, unresolved: [] };
  const config = await generateConfiguration({ version: 2, discovery, activateAfterValidation: true });
  await writeFile(join(runtime, 'configuration.json'), JSON.stringify(config), { mode: 0o600 });
  assert.equal((await validateProductionInstallation(root, releaseRoot)).activation, 'disabled');
  await assert.rejects(lstat(config.runtime.statePath), { code: 'ENOENT' });
  assert.equal((await setupProductionInstallation(root, releaseRoot)).activation, 'enabled');
  await assert.rejects(lstat(config.runtime.statePath), { code: 'ENOENT' });
  let owners = 0, listeners = 0, stops = 0, ready = false;
  const calls = [];
  const space = { __platform: 'imessage', id: 'iMessage;-;+15555550102', phone: 'shared', type: 'dm' };
  const dependencies = { sdkFactory: async () => {
    owners++;
    let finish;
    const stopped = new Promise(resolve => { finish = resolve; });
    return { messages: () => ({ async *[Symbol.asyncIterator]() { listeners++; ready = true; await stopped; } }),
      space: async (id, route) => { assert.equal(id, space.id); assert.equal(route, undefined); return space; },
      provider: () => ({ space: {
        create: async (address, route) => { calls.push('create'); assert.equal(address, user.phoneNumber); assert.equal(route, undefined); return space; },
        get: async (id, route) => { calls.push('get'); assert.equal(id, space.id); assert.equal(route, undefined); return space; },
      } }), stop: async () => { stops++; finish(); } };
  }, grokRunner: async () => { assert.fail('no inbound event means no wake'); } };
  for (let lifetime = 1; lifetime <= 2; lifetime++) {
    ready = false;
    let failure;
    const running = runProductionHost(root, releaseRoot, dependencies).catch(error => { failure = error; });
    try {
      let socket = false;
      for (let i = 0; i < 500; i++) {
        if (failure) throw failure;
        try { socket = (await lstat(config.local.socketPath)).isSocket(); } catch {}
        if (ready && socket) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(ready && socket, 'real host reaches ready local interface');
    } finally { process.emit('SIGTERM'); await running; }
    if (failure) throw failure;
    assert.equal(owners, lifetime); assert.equal(listeners, lifetime); assert.equal(stops, lifetime);
    assert.deepEqual(calls, ['create', 'get'], 'repeat startup preserves the native route');
  }
  const persisted = await loadNormalizedHostConfiguration(root);
  assert.equal(persisted.provider.conversationId, space.id);
  assert.equal(persisted.provider.phone, undefined);
  assert.deepEqual(persisted.task, config.task);
  assert.deepEqual(persisted.local, config.local);
  assert.equal((await lstat(join(runtime, 'configuration.json'))).mode & 0o777, 0o600);
  const store = new DurableSQLiteStore(config.runtime.statePath);
  try { assert.equal(store.scan('handoffs').length, 0); assert.equal(store.scan('outbox').length, 0); }
  finally { store.close(); }
  assert.equal((await readFile(secret, 'utf8')).includes('offline-only'), true);
});
