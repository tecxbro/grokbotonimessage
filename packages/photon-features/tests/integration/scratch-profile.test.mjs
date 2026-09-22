import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { reconcileHostOwnership } from '../../dist/src/host/owner-lock.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { resolveContents } from 'spectrum-ts';
import { GrokWebhookTaskHandoff, grokWebhookBindingSchema, webhookBindingId } from '../../dist/src/host/grok-webhook.js';
import { generateInitialOwnerConfiguration, writeInitialConfiguration } from '../../dist/src/host/setup-configuration.js';
import { normalizeProductionHostConfiguration, loadNormalizedHostConfiguration } from '../../dist/src/host/configuration.js';
import { createProductionComposition } from '../../dist/src/host/production.js';
import { configuredAuthority, bootstrapOrValidateAuthority } from '../../dist/src/host/authority.js';
import { validateProductionInstallation } from '../../dist/src/host/process.js';
import { DurableSQLiteStore } from '../../dist/src/adapters/state/sqlite.js';
import { DurableContexts } from '../../dist/src/runtime/core/authorization.js';
import { DurableWork } from '../../dist/src/runtime/core/work-handoff.js';
import { DurableSubmission } from '../../dist/src/runtime/core/submission.js';
import { TypingLeases } from '../../dist/src/runtime/typing/leases.js';
import { WorkTyping } from '../../dist/src/host/work-typing.js';
import { callRuntime } from '../../dist/src/cli/local-client.js';
import { operations } from '../../dist/src/contracts/actions.js';
import { setupDiscovery } from '../../dist/src/cli/setup.js';
import { ChildSupervisor } from '../../scratch-setup/service.mjs';
import { bindWebhook, connect, accountArguments, accountResult } from '../../scratch-setup/setup.mjs';
import { dispatch } from '../../scratch-setup/cli.mjs';
import { parseArgs, inputJson, ensureLauncher } from '../../scratch-setup/common.mjs';

const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const binding = { version: 1, url: 'https://routine.example.com/private/wake', key: 'fixture-webhook-key', routineId: 'actual-routine-fixture' };
const pointer = { handoffId: 'handoff:batch-1', taskId: 'task-1', generation: 0 };
async function until(check, ms = 5000) { const deadline = Date.now() + ms; while (Date.now() < deadline) { if (await check()) return; await delay(15); } assert.fail('condition timed out'); }
async function fixture(t) {
  const root = await mkdtemp(join(await (await import('node:fs/promises')).realpath(tmpdir()), 'sp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'runtime'); await mkdir(runtime, { mode: 0o700 });
  const release = 'b'.repeat(64), releaseRoot = join(root, 'releases', release);
  await mkdir(releaseRoot, { recursive: true, mode: 0o700 });
  const skill = 'fixture selected-release integrity marker\n';
  await writeFile(join(releaseRoot, 'SKILL.md'), skill, { mode: 0o600 });
  await writeFile(join(releaseRoot, 'release-manifest.json'), JSON.stringify({ checksum: release, files: [{ path: 'SKILL.md', sha256: createHash('sha256').update(skill).digest('hex') }] }), { mode: 0o600 });
  await writeFile(join(root, 'selected-release.json'), JSON.stringify({ version: 1, release, activation: 'disabled' }), { mode: 0o600 });
  // Test-only selected-release fixture; NOT installed-archive evidence. Execution
  // resolves the actual compiled modules, not mocks of internal services.
  await symlink(join(packageRoot, 'dist'), join(releaseRoot, 'dist'), 'dir');
  await symlink(join(packageRoot, 'features-only'), join(releaseRoot, 'features-only'), 'dir');
  await symlink(join(packageRoot, 'scratch-setup'), join(releaseRoot, 'scratch-setup'), 'dir');
  const secretFile = join(runtime, 'project-secret.json'), webhookFile = join(runtime, 'grok-wake.json');
  await writeFile(secretFile, JSON.stringify({ version: 1, projectId: 'project-1', projectSecret: 'offline-only-project-secret' }), { mode: 0o600 });
  await writeFile(webhookFile, JSON.stringify(binding), { mode: 0o600 });
  const user = { id: 'user-1', accountId: 'account-1', phoneNumber: '+15555550202' };
  const discovery = { version: 1, kind: 'setup-discovery', installationRoot: root,
    project: { id: 'project-1' }, projectCandidates: [{ id: 'project-1' }],
    spectrum: { mode: 'shared', user, userCandidates: [user], servingE164: null, dedicatedLineId: null, lineCandidates: [] },
    secretFile: { path: secretFile, mode: '0600', format: 'photon-project-secret-v1' },
    grok: { executable: null, agentId: null, candidates: [], evidence: null, commandStyle: null, commandStyleEvidence: null, unresolved: [] }, unresolved: [] };
  const input = { version: 2, discovery, webhookFile, choices: { initialAddress: user.phoneNumber, initialConversationId: 'any;-;+15555550202' } };
  const config = await generateInitialOwnerConfiguration(input); await writeInitialConfiguration(root, config);
  return { root, runtime, releaseRoot, config, input, discovery, webhookFile };
}
function database(t, f) {
  const time = { value: Date.now() }, store = new DurableSQLiteStore(f.config.runtime.statePath, () => time.value);
  t.after(() => store.close());
  const authority = configuredAuthority(f.config), { context } = bootstrapOrValidateAuthority(store, authority.context, authority.conversationId, time.value);
  const contexts = new DurableContexts(store, { now: () => time.value }), work = new DurableWork(store, contexts), submission = new DurableSubmission(store, contexts);
  const event = { version: 1, eventId: 'event-1', direction: 'inbound', scope: context.scope, occurredAt: time.value, receivedAt: time.value,
    ordering: { source: 'spectrum.messages' }, targets: [], type: 'message', senderId: '+15555550202',
    message: { version: 1, kind: 'message', id: 'message-1', scope: context.scope }, content: { type: 'text', text: 'hello' }, change: 'created' };
  const h = { id: 'handoff-1', scope: context.scope, revision: 0, principalId: context.principalId,
    taskId: context.taskId, generation: context.generation, eventIds: [event.eventId], state: 'pending', claim: null, createdAt: time.value };
  store.transaction(tx => { tx.put('inbox', { id: event.eventId, scope: context.scope, revision: 0, event, state: 'pending' }, null); tx.put('handoffs', h, null); });
  const action = { version: 1, contextId: context.contextId, operation: 'text.send', idempotencyKey: 'final-1',
    arguments: { space: { version: 1, kind: 'space', id: context.scope.spaceId, scope: context.scope }, text: 'answer' } };
  return { store, context, contexts, work, submission, time, action, event };
}

for (const url of ['http://routine.example.com/wake', 'https://user:pass@routine.example.com/wake', 'https://127.0.0.1/wake', 'https://[::1]/wake', 'https://localhost/wake', 'https://service.internal/wake', 'https://routine.example.com:8080/wake', 'https://routine.example.com/wake#secret']) {
  test('binding rejects unsafe target ' + url.replace('user:pass', '[credentials]'), () => assert.equal(grokWebhookBindingSchema.safeParse({ ...binding, url }).success, false));
}
test('webhook body contains only durable pointer, never message or credentials', async () => {
  let observed;
  const adapter = new GrokWebhookTaskHandoff(binding, { taskId: 'task-1', generation: 0, timeoutMs: 1000 }, async (url, init) => { observed = { url, init }; return new Response('', { status: 202 }); });
  assert.equal(await adapter.notifyExistingTask(pointer), 'accepted');
  assert.deepEqual(JSON.parse(observed.init.body), { batchId: pointer.handoffId });
  assert.equal(observed.init.redirect, 'error'); assert.equal(observed.init.headers.authorization, 'Bearer ' + binding.key);
  assert.ok(observed.init.signal instanceof AbortSignal); assert.ok(!observed.init.body.includes(binding.key));
});
test('concurrent wakes share one HTTP request', async () => {
  let release, calls = 0; const wait = new Promise(resolve => release = resolve);
  const adapter = new GrokWebhookTaskHandoff(binding, { taskId: 'task-1', generation: 0, timeoutMs: 1000 }, async () => { calls++; await wait; return new Response(null, { status: 204 }); });
  const a = adapter.notifyExistingTask(pointer), b = adapter.notifyExistingTask(pointer); release(); await Promise.all([a,b]); assert.equal(calls, 1);
});
test('wrong task, generation and malicious pointer perform no network call', async () => {
  let calls = 0; const adapter = new GrokWebhookTaskHandoff(binding, { taskId: 'task-1', generation: 0, timeoutMs: 1000 }, async () => { calls++; return new Response(); });
  for (const extra of [{ taskId: 'other' }, { generation: 1 }, { handoffId: '../private' }]) assert.equal(await adapter.notifyExistingTask({ ...pointer, ...extra }), 'failed');
  assert.equal(calls, 0);
});
for (const status of [401,403,404,410]) test('HTTP ' + status + ' suspends rapid wake retries without leaking endpoint', async () => {
  let calls = 0; const adapter = new GrokWebhookTaskHandoff(binding, { taskId: 'task-1', generation: 0, timeoutMs: 1000 }, async () => { calls++; return new Response(binding.key, { status }); });
  for (let i = 0; i < 2; i++) await assert.rejects(adapter.notifyExistingTask(pointer), /GROK_WAKE_TARGET_UNAVAILABLE/);
  assert.equal(calls, 1);
});
test('lost HTTP response is unknown, never reported as delivery or failed send', async () => {
  const adapter = new GrokWebhookTaskHandoff(binding, { taskId: 'task-1', generation: 0, timeoutMs: 1000 }, async () => { throw new Error(binding.key); });
  assert.equal(await adapter.notifyExistingTask(pointer), 'unknown');
});
test('fresh generator binds all operation permissions without a Grok executable or serving phone', async t => {
  const f = await fixture(t);
  assert.equal(f.config.grok.mode, 'webhook'); assert.equal('executable' in f.config.grok, false);
  assert.equal(f.config.provider.phone, undefined); assert.equal(f.config.provider.dedicated, false);
  assert.deepEqual(f.config.task.permissions, [...operations]); assert.equal(f.config.task.grokAgentId, webhookBindingId(binding));
  const validated = await validateProductionInstallation(f.root, f.releaseRoot, { grokHelpInspector: () => { throw new Error('GATEWAY_MUST_NOT_BE_CALLED'); } });
  assert.equal(validated.activation, 'disabled');
});
test('repeat connect validates existing authority rather than rotating token/state', async t => {
  const f = await fixture(t); const token = await readFile(f.config.local.credentialFile, 'utf8');
  const a = await connect(f.root), b = await connect(f.root); assert.equal(a.reused, true); assert.equal(b.reused, true);
  assert.equal(await readFile(f.config.local.credentialFile, 'utf8'), token);
  assert.equal((await loadNormalizedHostConfiguration(f.root)).task.contextId, f.config.task.contextId);
  await assert.rejects(connect(f.root, { projectId: 'different' }), /IDENTITY_MISMATCH/);
});
test('binding replay is idempotent but different routine is an explicit migration', async t => {
  const f = await fixture(t); assert.equal((await bindWebhook(f.root, binding)).configured, true);
  await assert.rejects(bindWebhook(f.root, { ...binding, url: 'https://other.example.com/wake' }), /MIGRATION/);
});
test('public webhook file is rejected without printing its contents', async t => {
  const f = await fixture(t); await chmod(f.webhookFile, 0o644);
  await assert.rejects(validateProductionInstallation(f.root, f.releaseRoot), { message: 'INVALID_GROK_WEBHOOK_BINDING' });
});
test('webhook outside installation is rejected and existing configuration cannot be overwritten', async t => {
  const f = await fixture(t), value = structuredClone(f.config); value.grok.bindingFile = '/tmp/not-our-binding';
  await writeFile(join(f.runtime, 'configuration.json'), JSON.stringify(value), { mode: 0o600 });
  await assert.rejects(loadNormalizedHostConfiguration(f.root), /RUNTIME_PATH_OUTSIDE_INSTALLATION/);
  await assert.rejects(generateInitialOwnerConfiguration(f.input), /EXISTING_INSTALLATION_REQUIRES_MIGRATION/);
});
test('atomic completion persists output before ack and repeated identical completion produces one operation', async t => {
  const f = await fixture(t), d = database(t, f), claimed = d.work.change(d.context, 'handoff-1', 'claim', undefined, 60000);
  const a = d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [d.action], d.submission);
  d.time.value += 120000;
  const b = d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [d.action], d.submission);
  assert.equal(a.handoff.state, 'acknowledged'); assert.deepEqual(a.handoff.completion, b.handoff.completion);
  assert.equal(d.store.scan('outbox').length, 1);
  assert.throws(() => d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [{ ...d.action, arguments: { ...d.action.arguments, text: 'different' } }], d.submission), /IDEMPOTENCY_CONFLICT/);
});
test('failed final admission rolls back every output and leaves batch claimed', async t => {
  const f = await fixture(t), d = database(t, f), claimed = d.work.change(d.context, 'handoff-1', 'claim', undefined, 60000);
  const bad = { ...d.action, idempotencyKey: 'bad', arguments: { ...d.action.arguments, space: { ...d.action.arguments.space, id: 'not-authorized' } } };
  assert.throws(() => d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [d.action, bad], d.submission));
  assert.equal(d.store.scan('outbox').length, 0); assert.equal(d.store.scan('handoffs')[0].state, 'claimed');
});
test('expired claim and wrong fence cannot submit a final reply', async t => {
  const f = await fixture(t), d = database(t, f), claimed = d.work.change(d.context, 'handoff-1', 'claim', undefined, 1000);
  assert.throws(() => d.work.complete(d.context, 'handoff-1', 100, [d.action], d.submission), /STALE_FENCE/);
  d.time.value += 1001; assert.throws(() => d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [d.action], d.submission), /STALE_FENCE/);
  assert.equal(d.store.scan('outbox').length, 0);
});
test('explicit no-reply completion closes work without sending', async t => {
  const f = await fixture(t), d = database(t, f), claimed = d.work.change(d.context, 'handoff-1', 'claim', undefined, 60000);
  const result = d.work.complete(d.context, 'handoff-1', claimed.handoff.claim.fence, [], d.submission);
  assert.equal(result.handoff.state, 'acknowledged'); assert.deepEqual(result.handoff.completion.requestIds, []); assert.equal(d.store.scan('outbox').length, 0);
});

async function typingFixture(t) {
  const f = await fixture(t), d = database(t, f), calls = [], diagnostics = [];
  const space = { async startTyping() { calls.push('start'); }, async stopTyping() { calls.push('stop'); } };
  const leases = new TypingLeases({ now: () => d.time.value }, async () => space);
  const controller = new WorkTyping(d.store, d.contexts, d.context, leases, { message: async () => ({ read: async () => calls.push('read') }) }, () => d.time.value, code => diagnostics.push(code));
  t.after(async () => { controller.stop(); leases.shutdown(); await leases.drain(); });
  return { ...d, calls, diagnostics, leases, controller };
}
test('90-second work with real heartbeat reports maintains typing and finish stops it', async t => {
  const d = await typingFixture(t), h = d.work.change(d.context, 'handoff-1', 'claim', undefined, 60000);
  for (let i = 0; i < 12; i++) {
    d.work.change(d.context, h.handoff.id, 'heartbeat', h.handoff.claim.fence, 60000);
    d.controller.tick(); await d.leases.drain(); d.time.value += 8000;
  }
  assert.ok(d.calls.filter(value => value === 'start').length >= 10, JSON.stringify(d)); assert.equal(d.calls.includes('stop'), false);
  d.work.complete(d.context, h.handoff.id, h.handoff.claim.fence, [], d.submission);
  d.controller.tick(); await d.leases.drain(); assert.equal(d.calls.at(-1), 'stop');
});
test('daemon refresh does not extend work liveness', async t => {
  const d = await typingFixture(t); d.work.change(d.context, 'handoff-1', 'claim', undefined, 1000);
  d.controller.tick(); await d.leases.drain(); d.time.value += 1001; d.controller.tick(); await d.leases.drain(); assert.equal(d.calls.at(-1), 'stop');
});
test('restart does not replay an old active typing start without a new activity report', async t => {
  const d = await typingFixture(t); const h = d.work.change(d.context, 'handoff-1', 'claim', undefined, 60000); d.time.value += 1;
  const restarted = new WorkTyping(d.store, d.contexts, d.context, d.leases, {}, () => d.time.value);
  restarted.tick(); await d.leases.drain(); assert.equal(d.calls.length, 0);
  d.work.change(d.context, h.handoff.id, 'heartbeat', h.handoff.claim.fence, 60000); restarted.tick(); await d.leases.drain(); assert.ok(d.calls.includes('start')); restarted.stop();
});

test('full stream → native webhook → authenticated helper → existing feature executor round trip', async t => {
  const f = await fixture(t), clock = { value: Date.now() }, counts = { owner: 0, sends: 0, wakes: 0 }, diagnostics = [], controls = [];
  f.config.activation = 'enabled'; await writeFile(join(f.runtime, 'configuration.json'), JSON.stringify(f.config), { mode: 0o600 });
  let stop, emit; const stopped = new Promise(resolve => stop = resolve), ready = new Promise(resolve => emit = resolve);
  const incoming = { id: 'native-incoming-1', platform: 'imessage', direction: 'inbound', sender: { id: '+15555550202' }, timestamp: new Date(clock.value), content: { type: 'text', text: 'hello' } };
  const space = { id: f.config.provider.conversationId, __platform: 'imessage', phone: 'shared',
    async startTyping() { controls.push('start'); }, async stopTyping() { controls.push('stop'); },
    getMessage: async () => ({ ...incoming, space, read: async () => controls.push('read') }),
    send: async input => { counts.sends++; return { id: 'outgoing-1', platform: 'imessage', space, direction: 'outbound', timestamp: new Date(), content: (await resolveContents([input]))[0] }; } };
  incoming.space = space; let batchId;
  const c = await createProductionComposition(f.config, f.root, f.releaseRoot, { now: () => clock.value,
    sdkFactory: async () => { counts.owner++; return { messages: () => ({ async *[Symbol.asyncIterator]() { await ready; yield [space, incoming]; await stopped; } }), space: async () => space,
      provider: () => ({ space: {}, getMembers: async () => [] }), stop: async () => stop() }; },
    grokRunner: () => { throw new Error('NO_GATEWAY'); }, grokHelpInspector: () => { throw new Error('NO_GATEWAY'); },
    webhookFetch: async (_url, init) => { counts.wakes++; const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body), ['batchId']); batchId = body.batchId; return new Response(null, { status: 204 }); },
    report: code => diagnostics.push(code),
  });
  let local;
  try {
    await c.runtime.start(); local = await c.startLocalInterface(); emit(); await delay(50); clock.value += 3000;
    try { await until(() => batchId, 7000); } catch (error) { throw new Error(JSON.stringify({diagnostics, counts, captures: await (await import("node:fs/promises")).readdir(f.config.runtime.captureDirectory)}), {cause:error}); }
    const pickup = await dispatch(['read-batch', '--batch-id', batchId, '--root', f.root]); assert.equal(pickup.events[0].content.text, 'hello');
    assert.equal((await dispatch(['capabilities', '--root', f.root])).length, 44);
    const spec = { operation: 'text.send', arguments: { space: { version: 1, kind: 'space', id: c.scope.spaceId, scope: c.scope }, text: 'actual existing feature path' }, idempotencyKey: batchId + ':final' };
    const argv = ['respond', '--batch-id', batchId, '--fence', String(pickup.handoff.claim.fence), '--json-stdin', '--root', f.root];
    const completed = await dispatch(argv, async () => spec); await until(() => counts.sends === 1);
    await dispatch(argv, async () => spec); await delay(50);
    assert.equal(completed.handoff.state, 'acknowledged'); assert.equal(counts.owner, 1); assert.equal(counts.sends, 1);
    assert.equal((await dispatch(['status', '--request-id', completed.handoff.completion.requestIds[0], '--root', f.root])).status, 'provider-accepted');
    assert.ok(controls.includes('start')); await until(() => controls.includes('stop'));
  } finally { await local?.close(); stop(); await c.runtime.stop(); }
});

async function supervised(t, code, settings = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sup-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'child.mjs'); await writeFile(file, code); let count = 0;
  const manager = new ChildSupervisor({ createChild: () => { count++; return fork(file, [], { stdio: ['ignore','ignore','ignore','ipc'], execArgv: [] }); },
    intervalMs: 10, healthMs: 100, startupMs: 500, stopMs: 100, restartMs: 30, ...settings });
  t.after(() => manager.stop()); await manager.start(); return { manager, count: () => count };
}
const healthyChild = `setInterval(() => process.send?.({type:'photon-health',ready:true}), 15); process.on('SIGTERM',()=>process.exit(0)); process.on('disconnect',()=>process.exit(0));`;
test('supervisor survives child death and starts one replacement', async t => {
  const s = await supervised(t, healthyChild); await until(() => s.manager.state.ready); const pid = s.manager.state.childPid;
  s.manager.child.kill('SIGKILL'); await until(() => s.manager.state.ready && s.manager.state.childPid !== pid);
  assert.equal(s.count(), 2); await s.manager.stop(); await delay(100); assert.equal(s.count(), 2);
});
test('healthy idle listener is not restarted because no iMessages arrive', async t => {
  const s = await supervised(t, healthyChild); await until(() => s.manager.state.ready); await delay(250); assert.equal(s.count(), 1);
});
test('hung event loop is detected by the independent parent', async t => {
  const s = await supervised(t, `process.send({type:'photon-health',ready:true}); setTimeout(()=>{while(true){}},10);`, { maxFailures: 2 });
  await until(() => s.count() === 2); await until(() => s.manager.state.status === 'failed'); assert.equal(s.manager.state.ready, false);
});
test('permanent startup failure is bounded rather than an infinite restart loop', async t => {
  const s = await supervised(t, 'process.exit(1)', { maxFailures: 3 }); await until(() => s.manager.state.status === 'failed'); await delay(150); assert.equal(s.count(), 3);
});
test('new helper rejects unknown args, duplicate flags and oversized JSON', async () => {
  assert.throws(() => parseArgs(['x','--root','/tmp/a','--root','/tmp/b']), /INVALID_ARGUMENTS/);
  await assert.rejects(inputJson((async function* () { yield 'a'.repeat(256*1024+1); })()), /INPUT_TOO_LARGE/);
  await assert.rejects(inputJson((async function* () { yield '{bad'; })()), /INVALID_JSON/);
});

// Pinned CLI command inputs; fixtures are data, never real account mutations.
test('new project uses the actual 2.2.0 CLI platforms flag and no billing/invite arguments', () => {
  assert.deepEqual(accountArguments({ operation: 'project.create', name: 'Test project' }),
    ['projects','create','--name','Test project','--platforms','imessage','--json']);
  assert.deepEqual(accountArguments({ operation: 'imessage.enable', projectId: 'project-1' }),
    ['spectrum','platforms','enable','imessage','--project','project-1','--json']);
});
test('enrollment requires all actual contact inputs and rejects backend/token overrides', () => {
  const input = { operation: 'user.add', projectId: 'project-1', firstName: 'First', lastName: 'Last', email: 'owner@example.com', phone: '+15555550202' };
  assert.deepEqual(accountArguments(input), ['spectrum','users','add','--project','project-1','--first-name','First','--last-name','Last','--email','owner@example.com','--phone','+15555550202','--json']);
  for (const key of ['firstName','lastName','email','phone']) { const missing = { ...input }; delete missing[key]; assert.throws(() => accountArguments(missing)); }
  for (const key of ['apiHost','token','invite','args']) assert.throws(() => accountArguments({ ...input, [key]: 'untrusted' }), /UNKNOWN_ACCOUNT_FIELD/);
  assert.throws(() => accountArguments({ operation: 'billing.upgrade' }), /NOT_ALLOWED/);
});
test('account results never disclose returned provider secrets or capability tokens', () => {
  const result = accountResult({ id: 'project-1', name: 'Test', projectSecret: 'NEVER_PRINT', accessToken: 'NEVER_PRINT', token: 'NEVER_PRINT', warning: { code: 'owner_phone_missing', message: 'NEVER_PRINT' } });
  assert.equal(JSON.stringify(result).includes('NEVER_PRINT'), false); assert.equal(result.result.warning, 'owner_phone_missing');
});

async function fakePhoton(t, f, version = '2.2.0') {
  const dir = join(f.root, 'fake-cli'); await mkdir(dir, { mode: 0o700 });
  const file = join(dir, 'photon'), log = join(f.root, 'cli-calls.jsonl');
  const code = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2); appendFileSync(${JSON.stringify(log)}, JSON.stringify(args)+'\\n');
const a=args.join(' ');
if(a==='--version') console.log(${JSON.stringify(version)});
else if(a==='whoami') console.log('authenticated');
else if(a==='--help') console.log('  auth  auth commands');
else if(a==='auth --help') console.log('  status  status commands');
else if(a==='auth status --help') console.log('--json');
else if(a==='auth status --json') console.log(JSON.stringify([{url:'https://app.photon.codes',loggedIn:true,user:{id:'owner-1'}}]));
else if(a==='projects ls --json') console.log(JSON.stringify([{id:'project-1',name:'Test'}]));
else if(a==='projects --help') console.log('  secret [id]');
else if(a==='projects secret --help') console.log('--json');
else if(a==='projects secret project-1 --json') console.log(JSON.stringify({id:'project-1',projectSecret:'fake-private-secret'}));
else if(a==='spectrum users ls --project project-1 --json') console.log(JSON.stringify([{id:'user-1',accountId:'account-1',phoneNumber:'+15555550202',email:'owner@example.com',accessToken:'SECRET_USER_TOKEN'}]));
else if(a==='spectrum lines ls --project project-1 --json') console.log('[]');
else { console.error('UNEXPECTED_COMMAND'); process.exitCode=1; }
`;
  await writeFile(file, code, { mode: 0o700 });
  return { file, log, env: { PATH: dir, HOME: dir, PHOTON_API_HOST: 'https://app.photon.codes' } };
}
test('real discovery subprocesses in webhook mode never invoke or require a Grok gateway', async t => {
  const f = await fixture(t), photon = await fakePhoton(t, f);
  const result = await setupDiscovery({ installationRoot: f.root, wakeMode: 'webhook', photonExecutable: photon.file }, { platform: 'linux', env: photon.env });
  assert.equal(result.status, 'discovered'); assert.deepEqual(result.unresolved, []); assert.equal(result.grok.executable, null); assert.equal(result.grok.candidates.length, 0);
  assert.equal(JSON.stringify(result).includes('SECRET_USER_TOKEN'), false); assert.equal(JSON.stringify(result).includes('fake-private-secret'), false);
  const calls = (await readFile(photon.log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(args => !args.some(value => /gateway|bots/.test(value))));
  const saved = JSON.parse(await readFile(result.secretFile.path, 'utf8')); assert.equal(saved.projectSecret, 'fake-private-secret');
});
test('webhook setup refuses a different CLI version rather than guessing command compatibility', async t => {
  const f = await fixture(t), photon = await fakePhoton(t, f, '3.0.0');
  await assert.rejects(setupDiscovery({ installationRoot: f.root, wakeMode: 'webhook', photonExecutable: photon.file }, { platform: 'linux', env: photon.env }), /PHOTON_VERSION_MISMATCH/);
});

test('real production child recovers its dead owner lock and receives a fresh message after SIGKILL', async t => {
  const f = await fixture(t); f.config.activation = 'enabled';
  await writeFile(join(f.runtime, 'configuration.json'), JSON.stringify(f.config), { mode: 0o600 });
  const filename = join(f.root, 'host-child.mjs');
  await writeFile(filename, `
import { runProductionHost } from ${JSON.stringify(new URL('../../dist/src/host/process.js', import.meta.url).href)};
const root = ${JSON.stringify(f.root)}, release = ${JSON.stringify(f.releaseRoot)};
let quit, receive; const stopped = new Promise(resolve => quit = resolve);
const next = new Promise(resolve => receive = resolve);
process.on('message', message => { if(message?.type==='test-inbound') receive(); });
const space = { id: ${JSON.stringify(f.config.provider.conversationId)}, __platform: 'imessage', phone: 'shared',
  async startTyping(){}, async stopTyping(){}, getMessage: async()=>({...incoming,space,read:async()=>{}}),
  send: async input => { process.send?.({type:'test-sent'}); return {id:'result-after-restart',space,direction:'outbound',platform:'imessage',timestamp:new Date(),content:{type:'text',text:'answer'}}; } };
const incoming={id:'new-after-restart',platform:'imessage',direction:'inbound',space,sender:{id:'+15555550202'},timestamp:new Date(),content:{type:'text',text:'fresh after crash'}};
await runProductionHost(root, release, {
 sdkFactory: async()=>({ messages:()=>({async *[Symbol.asyncIterator](){await next;incoming.timestamp=new Date();yield[space,incoming];await stopped;}}),space:async()=>space,provider:()=>({space:{},getMembers:async()=>[]}),stop:async()=>quit() }),
 webhookFetch:async(_url,init)=>{process.send?.({type:'test-wake',body:JSON.parse(init.body)});return new Response(null,{status:204});}
});
`);
  let children=0, batchId, sent=0;
  const supervisor=new ChildSupervisor({
    beforeStart: async()=>{await reconcileHostOwnership(f.runtime,{recoverStale:true});await validateProductionInstallation(f.root,f.releaseRoot);},
    createChild:()=>{children++;const child=fork(filename,[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:[]});child.on('message',m=>{if(m.type==='test-wake')batchId=m.body.batchId;if(m.type==='test-sent')sent++;});return child;},
    intervalMs:100, startupMs:10000, healthMs:3000, stopMs:1500, restartMs:100,
  });
  t.after(()=>supervisor.stop());
  try {
    await supervisor.start();await until(()=>supervisor.state.ready,10000);const first=supervisor.child.pid;
    supervisor.child.kill('SIGKILL');await until(()=>supervisor.state.ready&&supervisor.child?.pid!==first,10000);
    assert.equal(children,2);const lock=JSON.parse(await readFile(join(f.runtime,'host.lock'),'utf8'));assert.equal(lock.pid,supervisor.child.pid);
    const diag=await dispatch(['doctor','--root',f.root]);assert.equal(diag.ready,true);
    supervisor.child.send({type:'test-inbound'});await until(()=>batchId,10000);
    const work=await dispatch(['read-batch','--batch-id',batchId,'--root',f.root]);assert.equal(work.events[0].content.text,'fresh after crash');
    const scope=work.handoff.scope;
    await dispatch(['respond','--batch-id',batchId,'--fence',String(work.handoff.claim.fence),'--json-stdin','--root',f.root],async()=>({operation:'text.send',idempotencyKey:batchId+':result',arguments:{space:{version:1,kind:'space',id:scope.spaceId,scope},text:'after restart'}}));
    await until(()=>sent===1);assert.equal(children,2);
  } finally { await supervisor.stop(); }
  assert.equal((await reconcileHostOwnership(f.runtime)).status,'absent');
});

test('scratch default resolves a private pinned CLI rather than a different global installation', async t => {
  const f=await fixture(t), {resolvePhotonCli}=await import('../../scripts/install-photon-cli.mjs');
  const global=await fakePhoton(t,f,'3.0.0'), root=join(f.root,'tools'), bin=join(root,'photon-cli/node_modules/.bin');
  await mkdir(bin,{recursive:true,mode:0o700});await writeFile(join(bin,'photon'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  const choice=await resolvePhotonCli({toolRoot:root,env:global.env,platform:'linux',preferPrivate:true,run:()=>{throw new Error('UNEXPECTED_INSTALL');}});
  assert.equal(choice.source,'private');assert.equal(choice.path,join(bin,'photon'));
});
