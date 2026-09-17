import test from 'node:test';
import { privateTestRoot } from '../../dist/tests/helpers/private-temp.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setupAndRun } from '../../dist/src/cli/setup.js';
import { runProductionHost } from '../../dist/src/host/process.js';
import { loadNormalizedHostConfiguration } from '../../dist/src/host/configuration.js';
import { DurableSQLiteStore } from '../../dist/src/adapters/state/sqlite.js';

// Fresh owner setup and host lifecycle use the real generator/config/locks/SQLite.
// External SDK/Grok boundaries are controlled. Packaging mechanics are additionally
// covered by tests/artifact/rfx-owner-package.test.mjs and completion-installed.test.mjs.
test('one setup discovers, configures, activates and runs a shared owner; restart preserves the route', async t => {
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
  await writeFile(executable, `#!${process.execPath}
const args = process.argv.slice(2).join(' ');
if (args === '--version') console.log('gbot 1.2.3');
else if (args === '--help') console.log('  --gateway --json bots list');
else if (args === '--gateway --help') console.log('  send <agent> <message>');
else if (args === '--gateway --json bots list') console.log(JSON.stringify([{id:'agent-1'}]));
else process.exitCode = 1;
`, { mode: 0o700 });
  const user = { id: 'user-1', accountId: 'account-1', phoneNumber: '+15555550102' };
  const photon = join(root, 'photon');
  await writeFile(photon, `#!${process.execPath}
const responses = {
  '--version': 'photon 2.2.0', whoami: 'Offline owner', '--help': '  auth\\n  projects',
  'auth --help': '  status', 'auth status --help': '--json',
  'auth status --json': [{url:'https://app.photon.codes',loggedIn:true,user:{id:'owner-1'}}],
  'projects ls --json': [{id:'project-1'}], 'projects --help': '  secret', 'projects secret --help': '--json',
  'projects secret project-1 --json': {id:'project-1',projectSecret:'offline-only'},
  'spectrum users ls --project project-1 --json': [${JSON.stringify(user)}],
  'spectrum lines ls --project project-1 --json': []
};
const value = responses[process.argv.slice(2).join(' ')];
if (value === undefined) process.exitCode = 1;
else console.log(typeof value === 'string' ? value : JSON.stringify(value));
`, { mode: 0o700 });
  const options = { installationRoot: root, photonExecutable: photon, grokExecutable: executable };
  const services = { platform: 'linux', releaseRoot, env: { HOME: root } };
  let config;
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
    let completed = false;
    const running = (lifetime === 1 ? setupAndRun(options, { ...services, hostDependencies: dependencies })
      : runProductionHost(root, releaseRoot, dependencies)).then(result => { completed = true; assert.equal(result, undefined, JSON.stringify(result)); }).catch(error => { failure = error; });
    try {
      let socket = false;
      for (let i = 0; i < 500; i++) {
        if (failure) throw failure;
        assert.equal(completed, false, "setup must stay alive until shutdown");
        try { socket = (await lstat(join(runtime, 'runtime.sock'))).isSocket(); } catch {}
        if (ready && socket) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(ready && socket, 'real host reaches ready local interface');
      config ??= await loadNormalizedHostConfiguration(root);
      assert.equal(config.activation, 'enabled');
      assert.equal(config.task.expiresAt, Number.MAX_SAFE_INTEGER);
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
  assert.equal((await readFile(config.provider.projectSecretFile, 'utf8')).includes('offline-only'), true);
  const original = await readFile(join(runtime, 'configuration.json'), 'utf8');
  await assert.rejects(setupAndRun(options, services), { code: 'EXISTING_INSTALLATION_REQUIRES_MIGRATION' });
  assert.equal(await readFile(join(runtime, 'configuration.json'), 'utf8'), original);
});
