// Diagnostic installed-artifact journey. No approval/workflow claims or live credentials.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm, stat, appendFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
const root = realpathSync(await mkdtemp(join(tmpdir(), 'gpci-')));
const archive = resolve(process.env.COMPLETION_ARCHIVE);
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
const release = join(root, 'releases', checksum), runtime = join(root, 'runtime');
let host;
const exec = (args, input, env = {}) => new Promise((resolveResult, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
  child.on('error', reject); child.on('close', code => resolveResult({ code, stdout, stderr }));
  child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
});
const wait = async (predicate, label, limit = 1000) => { for (let i = 0; i < limit; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('TIMEOUT:' + label); };
const waitUntil = async (deadline, label, slackMs = 1000) => {
  const remaining = Math.max(0, deadline - Date.now());
  await wait(() => Date.now() >= deadline, label, Math.ceil((remaining + slackMs) / 10));
};
try {
  for (const path of [release, runtime, join(runtime, 'captures'), join(runtime, 'staging'), join(runtime, 'imports')]) await mkdir(path, { recursive: true, mode: 0o700 });
  const extracted = spawnSync('tar', ['-xzf', archive, '--strip-components=1', '-C', release], { encoding: 'utf8' }); assert.equal(extracted.status, 0, extracted.stderr);
  await chmod(release, 0o700);
  const install = () => spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: release, encoding: 'utf8', timeout: 90000 });
  for (let i = 0; i < 2; i++) { const installed = install(); assert.equal(installed.status, 0, installed.stdout + installed.stderr); }
  assert.equal(await stat(join(release, 'node_modules', 'typescript')).then(() => true, () => false), false, 'no development compiler installed');
  const skill = await readFile(join(release, 'SKILL.md'));
  await writeFile(join(release, 'release-manifest.json'), JSON.stringify({ checksum, files: [{ path: 'SKILL.md', sha256: createHash('sha256').update(skill).digest('hex') }] }), { mode: 0o600 });
  await writeFile(join(root, 'selected-release.json'), JSON.stringify({ version: 1, release: checksum, activation: 'disabled' }), { mode: 0o600 });
  await writeFile(join(runtime, 'project-secret'), 'offline-fixture', { mode: 0o600 });
  await writeFile(join(runtime, 'local-token'), 'c'.repeat(64), { mode: 0o600 });
  await writeFile(join(runtime, 'owner-token'), 'd'.repeat(64), { mode: 0o600 });
  const gateway = join(root, 'offline-gateway'); await writeFile(gateway, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const keyPair = generateKeyPairSync('ed25519'), publicKey = keyPair.publicKey.export({ format: 'jwk' });
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const cardPort = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const config = { version: 2, activation: 'enabled', provider: { kind: 'spectrum-cloud-imessage', projectId: 'project-1', projectSecretFile: join(runtime, 'project-secret'), accountId: 'account-1', lineId: 'line-1', phone: '+15555550101', conversationId: 'iMessage;+;completion-group', dedicated: true, availableOperations: ['text.send', 'text.stream', 'app.send', 'app.sendCustomized', 'app.update', 'space.getAvatar', 'space.create', 'typing.begin', 'typing.end', 'message.get', 'message.reply', 'message.react', 'reaction.remove', 'attachment.send', 'attachment.fetch', 'voice.send', 'poll.create'] },
    local: { socketPath: join(runtime, 'runtime.sock'), credentialFile: join(runtime, 'local-token'), principalId: 'principal-1', credentialId: 'local-v1' },
    task: { contextId: 'context-1', taskId: 'task-1', generation: 1, permissions: ['text.send', 'text.stream', 'app.send', 'app.sendCustomized', 'app.update', 'space.getAvatar', 'space.create', 'typing.begin', 'typing.end', 'message.get', 'message.reply', 'message.react', 'reaction.remove', 'attachment.send', 'attachment.fetch', 'voice.send', 'poll.create'], issuedAt: Date.now() - 1000, expiresAt: Date.now() + 120000, grokAgentId: 'fixture-agent' },
    grok: { executable: gateway, timeoutMs: 1000 }, authorization: { administrativeOperations: ['space.create'], allowedRecipients: ['+15555550202', '+15555550303'], allowNativeContent: false }, cardBackend: { kind: 'signed-card-v1', id: 'backend', origin: 'https://cards.example.invalid', port: cardPort,
      participants: [{ id: 'alice', imessageAddress: '+15555550202', publicKey: { kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x }, enrollmentEvidence: 'offline enrolled-key fixture' }] },
    cards: [{ id: 'universal', kind: 'universal', backendId: 'backend', origins: ['https://cards.example.invalid'],
      interactions: { participantIds: ['alice'], actionIds: ['confirm'], ttlMs: 60000, backendContractId: 'backend' } },
      { id: 'customized', kind: 'customized', backendId: 'backend', origins: ['https://cards.example.invalid'], extension: { appName: 'Fixture', teamId: 'TESTTEAM01', extensionBundleId: 'invalid.example.card' } }],
    textStreaming: { delivery: process.env.COMPLETION_FAILURE_MODE === 'buffered' ? 'buffered' : 'progressive' },
    ownerAdministration: { principalId: 'owner', credentialFile: join(runtime, 'owner-token') },
    runtime: { statePath: join(runtime, 'state.sqlite'), captureDirectory: join(runtime, 'captures'), stagingDirectory: join(runtime, 'staging'), importDirectory: join(runtime, 'imports') } };
  await writeFile(join(runtime, 'configuration.json'), JSON.stringify(config), { mode: 0o600 });
  const hostPath = join(release, 'bin/grok-photon-host');
  const validated = await exec([hostPath, 'validate', '--installation-root', root]); assert.equal(validated.code, 0, validated.stderr);
  const log = join(root, 'boundary.jsonl'); await writeFile(log, '');
  const inputEvents = join(root, 'boundary-input.jsonl'); await writeFile(inputEvents, '');
  let hostErrors = '', hostOutput = '';
  const start = async () => {
    hostOutput = ''; hostErrors = '';
    host = spawn(process.execPath, ['--experimental-test-module-mocks', '--import', resolve(process.env.COMPLETION_BOUNDARY_PRELOAD), hostPath, 'run', '--installation-root', root], { cwd: root, env: { ...process.env, COMPLETION_PACKAGE: release, COMPLETION_BOUNDARY_LOG: log, COMPLETION_CARD_PORT: String(cardPort), COMPLETION_BOUNDARY_INPUT: inputEvents }, stdio: ['ignore', 'pipe', 'pipe'] });
    host.stdout.on('data', bytes => { hostOutput += bytes; }); host.stderr.on('data', bytes => { hostErrors += bytes; });
    await wait(() => { if (host.exitCode !== null) throw new Error(hostErrors); return hostOutput.includes('"status":"ready"'); }, 'host readiness');
  };
  const stop = async () => { const exited = new Promise(resolveExit => host.once('exit', resolveExit)); host.kill('SIGTERM'); await exited; assert.equal(host.exitCode, 0, hostErrors); host = undefined; };
  const cli = async (command, input, extra = []) => {
    const args = [join(release, 'bin/grok-photon-task'), '--installation-root', root, '--task-id', 'task-1', '--generation', '1', command, ...(input !== undefined ? ['--json-stdin'] : [...extra, '--json'])];
    const result = await exec(args, input); const output = JSON.parse(result.stdout); assert.equal(output.ok, true, result.stdout + result.stderr + hostErrors); return output.result;
  };
  const events = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  await start();
  const opened = await cli('stream.open', { version: 1, ttlMs: 30000 });
  const stream = opened.stream;
  const space = { version: 1, kind: 'space', id: stream.scope.spaceId, scope: stream.scope };
  const queued = await cli('execute', { version: 1, contextId: 'context-1', idempotencyKey: 'progressive', operation: 'text.stream', arguments: { space, stream } });
  const append = { version: 1, stream, sequence: 0, text: 'First thought.' };
  await cli('stream.append', append); await cli('stream.append', append);
  const buffered = config.textStreaming.delivery === 'buffered';
  if (buffered) {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await events()).filter(e => e.type === 'send').length, 0, 'explicit buffered fallback waits for source completion');
  } else {
    await wait(async () => (await events()).some(e => e.type === 'send'), 'provider first send before producer close');
    assert.equal((await events()).filter(e => e.type === 'send').length, 1);
  }
  await cli('stream.append', { version: 1, stream, sequence: 1, text: buffered ? ' Second thought.' : 'Second thought.' });
  await cli('stream.close', { version: 1, stream, sequence: 2 });
  let result;
  await wait(async () => { result = await cli('status', undefined, ['--request-id', queued.requestId]); return result.status !== 'queued'; }, 'stream result');
  assert.equal(result.status, 'provider-accepted', JSON.stringify(result));
  const send = (await events()).find(e => e.type === 'send'), edit = (await events()).find(e => e.type === 'edit');
  if (buffered) { assert.equal(edit, undefined); assert.equal(send.value.text, 'First thought. Second thought.'); }
  else { assert.equal(edit.value.guid, send.value.guid); assert.equal(edit.value.text, 'First thought. Second thought.'); }
  const settle = async action => {
    const queued = await cli('execute', action); let value = queued;
    await wait(async () => { value = await cli('status', undefined, ['--request-id', queued.requestId]); return value.status !== 'queued'; }, 'card completion');
    return value;
  };
  // Actual remote subscription -> SDK mapping -> inbox -> claim -> reply -> ack.
  const incoming = { type: 'message.received', sequence: 1, occurredAt: new Date(), message: { guid: 'incoming-1', isFromMe: false,
    sender: { address: '+15555550202', service: 'iMessage' }, dateCreated: new Date(), chatGuids: [config.provider.conversationId], content: { text: 'A human question.', attachments: [] } } };
  await appendFile(inputEvents, JSON.stringify(incoming) + '\n');
  const claimNext = async () => {
    let work; await wait(async () => { work = (await cli('work.list', undefined, ['--limit', '100'])).work; return work.length > 0; }, 'durable incoming handoff');
    return cli('work.claim', undefined, ['--handoff-id', work[0].id, '--lease-ms', '30000']);
  };
  const ack = async claim => cli('work.ack', undefined, ['--handoff-id', claim.handoff.id, '--fence', String(claim.handoff.claim.fence)]);
  const human = await claimNext(); assert.equal(human.events[0].type, 'message');
  await cli('work.heartbeat', undefined, ['--handoff-id', human.handoff.id, '--fence', String(human.handoff.claim.fence), '--lease-ms', '30000']);
  const reply = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'reply-to-human', operation: 'message.reply', arguments: { message: human.events[0].message, content: { type: 'text', text: 'A considered reply.' } } });
  assert.equal(reply.status, 'provider-accepted', JSON.stringify(reply)); await ack(human); await ack(human);
  assert.ok((await events()).some(event => event.type === 'send' && event.value.options?.replyTo));
  const reaction = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'reaction', operation: 'message.react', arguments: { message: human.events[0].message, reaction: 'like' } });
  assert.equal(reaction.status, 'provider-accepted', JSON.stringify(reaction));
  const removed = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'remove-reaction', operation: 'reaction.remove', arguments: { reaction: reaction.references[0] } });
  assert.equal(removed.status, 'executor-completed', JSON.stringify(removed));
  assert.deepEqual((await events()).filter(e => e.type === 'reaction').map(e => e.value.selected), [true, false]);
  // The real stager, installed media.import and actual SDK upload/send path.
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const mp4 = Buffer.from([0,0,0,24,102,116,121,112,77,52,65,32,0,0,0,0,77,52,65,32,109,112,52,50]);
  for (const [name, bytes, mimeType, operation] of [['result.png', png, 'image/png', 'attachment.send'], ['note.m4a', mp4, 'audio/mp4', 'voice.send']]) {
    await writeFile(join(runtime, 'imports', name), bytes, { mode: 0o600 });
    const media = await cli('media.import', { filename: name, metadata: { mimeType, name } });
    const sent = await settle({ version: 1, contextId: 'context-1', idempotencyKey: name, operation, arguments: { space, media } });
    assert.equal(sent.status, 'provider-accepted', JSON.stringify(sent));
  }
  assert.ok((await events()).some(event => event.type === 'attachment-send' && event.value.options?.isAudioMessage === true));
  await appendFile(inputEvents, JSON.stringify({ ...incoming, sequence: 2, message: { ...incoming.message, guid: 'incoming-attachment', content: { text: '', attachments: [{ guid: 'incoming-file', fileName: 'received.png', mimeType: 'image/png', totalBytes: png.length, isHidden: false, isOutgoing: false, isSticker: false, transferState: 'finished', uti: 'public.png' }] } } }) + '\n');
  const attachmentWork = await claimNext();
  const attachment = attachmentWork.events[0].content.media;
  const fetched = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'fetch-received', operation: 'attachment.fetch', arguments: { attachment } });
  assert.equal(fetched.status, 'executor-completed', JSON.stringify(fetched)); assert.equal(fetched.value.media.bytes, png.length); await ack(attachmentWork);
  // Poll creation and a real provider vote event remain separate; never duplicate the human vote.
  for (const [id, labels] of [['one', ['Same', 'Same']], ['two', ['Morning', 'Evening']]]) {
    const poll = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'poll-' + id, operation: 'poll.create', arguments: { space, question: 'Question ' + id + '?', options: labels.map((label, index) => ({ key: 'key-' + index, label })) } });
    assert.equal(poll.status, 'provider-accepted', JSON.stringify(poll));
  }
  const nativePoll = (await events()).filter(event => event.type === 'poll-create')[1].value;
  for (const [index, type] of ['voted', 'unvoted'].entries()) {
    await appendFile(inputEvents, JSON.stringify({ type: 'poll.changed', sequence: 3 + index, occurredAt: new Date(), chatGuid: config.provider.conversationId,
      pollMessageGuid: nativePoll.pollMessageGuid, isFromMe: false, actor: { address: '+15555550202', service: 'iMessage' }, delta: { type, optionIdentifier: 'native-option-0' } }) + '\n');
    const answer = await claimNext(); assert.equal(answer.events[0].type, 'poll-answer'); assert.equal(answer.events[0].selected, type === 'voted'); await ack(answer);
  }
  const typingAction = (id, ttlMs) => ({ version: 1, contextId: 'context-1', idempotencyKey: id, operation: 'typing.begin', arguments: { space, ttlMs } });
  assert.equal((await settle(typingAction('typing-overlap-one', 5000))).status, 'executor-completed');
  assert.equal((await settle(typingAction('typing-overlap-two', 5000))).status, 'executor-completed');
  assert.equal((await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'typing-end', operation: 'typing.end', arguments: { space } })).status, 'executor-completed');
  await settle(typingAction('typing-expiry', 200));
  await wait(async () => (await events()).filter(event => event.type === 'typing' && event.value[1] === false).length >= 2, 'typing expiry');
  const duplicate = await exec([join(release, 'bin/grok-photon-task'), '--installation-root', root, '--task-id', 'task-1', '--generation', '1', 'execute', '--json-stdin'],
    { version: 1, contextId: 'context-1', idempotencyKey: 'duplicate-consumer', operation: 'text.stream', arguments: { space, stream } });
  assert.equal(JSON.parse(duplicate.stdout).ok, false, duplicate.stdout);
  const overflow = (await cli('stream.open', { version: 1, ttlMs: 30000 })).stream;
  for (let sequence = 0; sequence < 2; sequence++) await cli('stream.append', { version: 1, stream: overflow, sequence, text: 'x'.repeat(4096) });
  const invalid = await exec([join(release, 'bin/grok-photon-task'), '--installation-root', root, '--task-id', 'task-1', '--generation', '1', 'stream.append', '--json-stdin'],
    { version: 1, stream: overflow, sequence: 2, text: 'Overflow.' });
  assert.notEqual(invalid.code, 0);
  const overflowResult = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'overflow', operation: 'text.stream', arguments: { space, stream: overflow } });
  assert.equal(overflowResult.status, 'failed');
  const avatar = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'avatar', operation: 'space.getAvatar', arguments: { space } });
  assert.equal(avatar.status, 'executor-completed', JSON.stringify(avatar));
  assert.equal(avatar.value.media.mimeType, 'image/png');
  assert.equal(avatar.value.media.bytes, 12);
  const created = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'create-chat', operation: 'space.create', arguments: { members: ['+15555550202', '+15555550303'] } });
  assert.equal(created.status, 'executor-completed', JSON.stringify(created));
  assert.notEqual(created.references[0].scope.spaceId, space.scope.spaceId);
  assert.equal(created.references[0].scope.lineId, space.scope.lineId);
  let universalSession, universalCard;
  for (const kind of ['universal', 'customized']) {
    const action = { version: 1, contextId: 'context-1', idempotencyKey: kind, operation: kind === 'universal' ? 'app.send' : 'app.sendCustomized',
      arguments: { space, templateId: kind, url: 'https://cards.example.invalid/start', ...(kind === 'customized' ? { layout: { caption: 'First caption' } } : {}) } };
    const cardResult = await settle(action); assert.equal(cardResult.status, 'provider-accepted', JSON.stringify(cardResult));
    const card = cardResult.references.find(ref => ref.kind === 'card'), session = cardResult.references.find(ref => ref.kind === 'card-session');
    if (kind === 'universal') { universalSession = session; universalCard = card; }
    for (let revision = 1; revision <= 2; revision++) {
      const updated = await settle({ version: 1, contextId: 'context-1', idempotencyKey: kind + '-update-' + revision, operation: 'app.update',
        arguments: { card, session, layout: { caption: 'Updated ' + revision } } });
      assert.equal(updated.status, 'executor-completed', JSON.stringify(updated));
    }
  }
  const cardEvents = await events();
  assert.equal(cardEvents.filter(event => event.type === 'card-send').length, 2);
  assert.equal(cardEvents.filter(event => event.type === 'card-update').length, 4);
  const updates = cardEvents.filter(event => event.type === 'card-update');
  assert.equal(updates[1].value.session.targetMessageGuid, updates[0].value.metadata.targetMessageGuid, 'SDK refreshed original session metadata');
  assert.equal(updates[0].value.content.layout.caption, 'Updated 1', 'real OGS parsed the shipped universal backend page');
  const payload = JSON.stringify({ version: 1, eventId: 'installed-callback', session: universalSession, scope: space.scope, taskId: 'task-1', generation: 1,
    participantId: 'alice', nonce: universalSession.id, actionId: 'confirm', selection: [], occurredAt: Date.now() });
  const callback = { version: 1, payload, signature: sign(null, Buffer.from('grok-photon:signed-card-v1\n' + payload), keyPair.privateKey).toString('base64url') };
  const post = () => fetch('http://127.0.0.1:' + cardPort + '/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(callback) });
  const accepted = await post(); assert.equal(accepted.status, 200); assert.equal((await accepted.json()).status, 'committed');
  const replayed = await post(); assert.equal((await replayed.json()).status, 'replayed');
  const orphan = (await cli('stream.open', { version: 1, ttlMs: 30000 })).stream;
  await settle(typingAction('typing-shutdown', 5000));
  await stop(); await start();
  const missingSource = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'orphan-source', operation: 'text.stream', arguments: { space, stream: orphan } });
  assert.equal(missingSource.status, 'failed', JSON.stringify(missingSource));
  assert.equal((await (await post()).json()).status, 'replayed', 'backend replay state survives installed-host restart');
  const replay = await cli('execute', { version: 1, contextId: 'context-1', idempotencyKey: 'progressive', operation: 'text.stream', arguments: { space, stream } });
  assert.equal(replay.status, 'provider-accepted'); assert.equal((await events()).filter(e => e.type === 'send').length, 2);
  if (process.env.COMPLETION_FAILURE_MODE === 'cold-restore') {
  const coldUpdate = await settle({ version: 1, contextId: 'context-1', idempotencyKey: 'cold-update', operation: 'app.update', arguments: { card: universalCard, session: universalSession, layout: { caption: 'After restart' } } });
  assert.equal(coldUpdate.status, 'blocked', JSON.stringify(coldUpdate));
  assert.equal((await events()).filter(e => e.type === 'card-update').length, 4, 'cold restore never manufactures an update handle');
  }
  for (const args of [['scripts/generate-skill.mjs', '--check'], ['scripts/generate-configuration.mjs', '--check']]) {
    const check = await exec([join(release, args[0]), ...args.slice(1)]); assert.equal(check.code, 0, check.stdout + check.stderr);
  }
  const failures = {};
  let expiryTiming;
  for (const mode of (['cold-restore', 'buffered'].includes(process.env.COMPLETION_FAILURE_MODE) ? [] : [process.env.COMPLETION_FAILURE_MODE ?? 'provider-failure'])) {
    // Two published producer-stall windows leave one bounded window for the
    // installed CLI/provider handoff and one for synchronized expiry coverage.
    const ttlMs = mode === 'expiry' ? 10000 : 30000;
    const openedAt = Date.now();
    const openedFailureStream = await cli('stream.open', { version: 1, ttlMs });
    const item = openedFailureStream.stream;
    const openCompletedAt = Date.now();
    const boundaryReadStartedAt = Date.now();
    const before = (await events()).filter(e => e.type === 'send').length;
    const boundaryReadCompletedAt = Date.now();
    const action = { version: 1, contextId: 'context-1', idempotencyKey: mode, operation: 'text.stream', arguments: { space, stream: item } };
    let queued, firstProviderSendObservedAt;
    if (mode === 'expiry') {
      assert.equal(ttlMs, openedFailureStream.stallMs * 2, 'expiry budget is exactly two producer-stall windows');
      assert.ok(item.expiresAt - openCompletedAt >= openedFailureStream.stallMs, 'opened stream retains a full setup window');
      const scheduleDelayMs = Number(process.env.COMPLETION_EXPIRY_SCHEDULE_DELAY_MS ?? 0);
      const cadenceMs = Math.floor(openedFailureStream.stallMs / 2);
      assert.ok(Number.isSafeInteger(scheduleDelayMs) && scheduleDelayMs >= 0 && scheduleDelayMs <= cadenceMs,
        'controlled scheduling delay stays within the producer cadence');
      if (scheduleDelayMs > 0) await waitUntil(Date.now() + scheduleDelayMs, 'controlled expiry scheduling delay');
      const appendStartedAt = Date.now();
      const firstAppendOutcome = await cli('stream.append', { version: 1, stream: item, sequence: 0, text: 'Partial thought.' });
      const appendCompletedAt = Date.now();
      assert.deepEqual(firstAppendOutcome, { accepted: true }, 'initial content is accepted while the stream is valid');
      assert.ok(appendCompletedAt < item.expiresAt, 'initial content precedes absolute stream expiry');
      const executeStartedAt = Date.now();
      queued = await cli('execute', action);
      const executeCompletedAt = Date.now();
      await wait(async () => {
        const observed = (await events()).filter(e => e.type === 'send').length === before + 1;
        if (observed && firstProviderSendObservedAt === undefined) firstProviderSendObservedAt = Date.now();
        return observed;
      }, mode + ' first send', Math.ceil(openedFailureStream.stallMs / 10));
      const keepaliveAppends = [];
      let sequence = 1, lastAppendCompletedAt = appendCompletedAt;
      while (item.expiresAt - lastAppendCompletedAt >= openedFailureStream.stallMs) {
        await waitUntil(lastAppendCompletedAt + cadenceMs, 'expiry producer cadence');
        const startedAt = Date.now();
        const outcome = await cli('stream.append', { version: 1, stream: item, sequence, text: ' Still working.' });
        const completedAt = Date.now();
        assert.deepEqual(outcome, { accepted: true }, 'producer remains valid before expiry');
        keepaliveAppends.push({ sequence, startedAt, completedAt, elapsedMs: completedAt - startedAt });
        sequence++; lastAppendCompletedAt = completedAt;
      }
      const remainingBeforeExpiry = item.expiresAt - Date.now();
      assert.ok(remainingBeforeExpiry > 0 && remainingBeforeExpiry < openedFailureStream.stallMs,
        'last accepted content makes absolute expiry, not producer stall, the next deadline');
      await waitUntil(item.expiresAt, 'absolute stream expiry');
      expiryTiming = { expiresAt: item.expiresAt, openedAt, openCompletedAt, openElapsedMs: openCompletedAt - openedAt,
        boundaryReadStartedAt, boundaryReadCompletedAt, boundaryReadElapsedMs: boundaryReadCompletedAt - boundaryReadStartedAt,
        scheduleDelayMs, appendStartedAt, appendCompletedAt, appendElapsedMs: appendCompletedAt - appendStartedAt,
        firstAppendOutcome, executeStartedAt, executeCompletedAt, executeElapsedMs: executeCompletedAt - executeStartedAt,
        firstProviderSendObservedAt, keepaliveAppends, expiryObservedAt: Date.now() };
    } else {
      queued = await cli('execute', action);
      await cli('stream.append', { version: 1, stream: item, sequence: 0, text: 'Partial thought.' });
      await wait(async () => (await events()).filter(e => e.type === 'send').length === before + 1, mode + ' first send');
    }
    if (mode === 'provider-failure') {
      await cli('stream.append', { version: 1, stream: item, sequence: 1, text: 'BOUNDARY_FAIL' });
      await cli('stream.close', { version: 1, stream: item, sequence: 2 });
    }
    if (mode === 'abort') await cli('stream.abort', { version: 1, stream: item });
    if (mode === 'cancel') await cli('cancel', undefined, ['--request-id', queued.requestId]);
    let result;
    await wait(async () => { result = await cli('status', undefined, ['--request-id', queued.requestId]); return result.status !== 'queued'; }, mode + ' terminal');
    assert.equal(result.status, 'unknown-outcome', mode + ': ' + JSON.stringify(result));
    assert.equal(result.error.retry, 'reconcile-first');
    const replay = await cli('execute', action); assert.equal(replay.status, 'unknown-outcome');
    assert.equal((await events()).filter(e => e.type === 'send').length, before + 1, 'no replacement or replay');
    failures[mode] = result.status;
  }
  await stop();
  const preserved = () => { const db = new DatabaseSync(join(runtime, 'state.sqlite')); try { return db.prepare("select body from outbox where json_extract(body,'$.result.status') in ('unknown-outcome','blocked') order by id").all(); } finally { db.close(); } };
  const pendingEvidence = preserved();
  const denied = await exec([hostPath, 'authority.inspect', '--installation-root', root, '--owner-credential-file', join(runtime, 'local-token')]);
  assert.equal(denied.code, 1); assert.match(denied.stderr, /OWNER_AUTHENTICATION_REQUIRED/);
  const inspection = await exec([hostPath, 'authority.inspect', '--installation-root', root, '--owner-credential-file', join(runtime, 'owner-token')]);
  assert.equal(inspection.code, 0, inspection.stderr); const authority = JSON.parse(inspection.stdout);
  const nextContext = { ...authority.expectedContext, contextId: 'context-2', generation: 2, issuedAt: Date.now() - 100, expiresAt: Date.now() + 60000 };
  const transition = { version: 1, requestId: 'installed-renew', mode: 'renew', reason: 'offline owner renewal fixture',
    expectedContext: authority.expectedContext, expectedContextRevision: authority.expectedContextRevision, expectedTaskRevision: authority.expectedTaskRevision, nextContext };
  const transitionFile = join(runtime, 'renewal.json'); await writeFile(transitionFile, JSON.stringify(transition), { mode: 0o600 });
  const admin = () => exec([hostPath, 'authority.apply', '--installation-root', root, '--request-file', transitionFile, '--owner-credential-file', join(runtime, 'owner-token')]);
  for (let i = 0; i < 2; i++) { const renewed = await admin(); assert.equal(renewed.code, 0, renewed.stderr); }
  await writeFile(transitionFile, JSON.stringify({ ...transition, requestId: 'stale-renew' }), { mode: 0o600 });
  const stale = await admin(); assert.equal(stale.code, 1); assert.match(stale.stderr, /STALE_AUTHORITY_EXPECTATION/);
  await start();
  const oldLauncher = await exec([join(release, 'bin/grok-photon-task'), '--installation-root', root, '--task-id', 'task-1', '--generation', '1', 'doctor', '--json']);
  assert.notEqual(oldLauncher.code, 0);
  const currentLauncher = await exec([join(release, 'bin/grok-photon-task'), '--installation-root', root, '--task-id', 'task-1', '--generation', '2', 'doctor', '--json']);
  assert.equal(currentLauncher.code, 0, currentLauncher.stdout + currentLauncher.stderr);
  assert.equal((await post()).status, 403, 'revoked generation rejects callbacks before replay reduction');
  const stalePayload = JSON.stringify({ ...JSON.parse(payload), eventId: 'new-event-old-generation' });
  const staleCallback = { version: 1, payload: stalePayload, signature: sign(null, Buffer.from('grok-photon:signed-card-v1\n' + stalePayload), keyPair.privateKey).toString('base64url') };
  const deniedCallback = await fetch('http://127.0.0.1:' + cardPort + '/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(staleCallback) });
  assert.equal(deniedCallback.status, 403, 'new old-generation callback cannot act after owner renewal');
  await stop(); assert.deepEqual(preserved(), pendingEvidence, 'renewal and restart preserve unknown/blocked evidence exactly');
  console.log(JSON.stringify({ archive, checksum, installedRoot: root, freshInstall: true, repeatedInstall: true, validation: true, progressiveProducer: !buffered, bufferedFallback: buffered, firstSendBeforeClose: !buffered, sameMessage: true, restartReplay: true, shutdown: true, universalUpdates: true, customizedUpdates: true, participantCallbacks: true, authorityRenewal: true, deniedOwner: true, staleGeneration: true, textClaimReplyAck: true, mediaImportSendFetch: true, voiceSend: true, pollCreateAnswer: true, typingLifecycle: true, avatarRetention: true, createdChatRetention: true, streamFailures: failures, expiryTiming, productionActivation: false, approvedRelease: false }));
} finally { if (host && host.exitCode === null) { const exited = new Promise(resolve => host.once("exit", resolve)); host.kill('SIGTERM'); await exited; } if (!process.env.COMPLETION_KEEP) await rm(root, { recursive: true, force: true }); else console.error('Fixture root: ' + root); }
