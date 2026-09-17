import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { imessage } from 'spectrum-ts/providers/imessage';
import { CardRuntime } from '../../src/features/cards/operations.js';
import { cardCapabilityReport } from '../../src/features/cards/module.js';
import { STATIC_CARD_TEMPLATE_ID } from '../../src/features/cards/sdk.js';
import { decodeSession, encodeCardSession, SESSION_CODEC } from '../../src/features/cards/session-codec.js';
import type { CardOptions } from '../../src/features/cards/configuration.js';
import { DurableSQLiteStore } from '../../src/adapters/state/sqlite.js';
import { publicFixture } from '../lanes/wt-06/unit.test.js';
import { templates } from '../lanes/wt-06/fixture.js';
import { privateTestRoot } from '../helpers/private-temp.js';

test('built-in static URL card needs no Apple identity, registration or HTTPS backend', async () => {
  const f = publicFixture([]), action = f.send('universal');
  if (action.operation !== 'app.send') throw Error();
  action.arguments.templateId = STATIC_CARD_TEMPLATE_ID;
  action.arguments.url = 'https://ordinary.example/card';
  const sent = await f.execute(action);
  assert.equal(sent.status, 'provider-accepted');
  assert.equal(f.native.calls.length, 1);
  const content = f.native.calls[0]!;
  assert.equal(content.type, 'app');
  if (content.type !== 'app') throw Error();
  assert.equal(content.live, false);
  assert.equal(await content.url(), action.arguments.url);
  assert.equal(decodeSession(f.snapshot(sent)).callback, null);
  assert.equal((await f.execute(f.update(sent))).error?.blockerId, 'universal_update_url_required');
  assert.equal(f.native.calls.length, 1);
  const report = cardCapabilityReport({ ...f.options } as unknown as CardOptions);
  assert.equal(report.staticCard.requiresExtension, false);
  assert.equal(report.staticCard.requiresBackend, false);
  assert.deepEqual(report.customizedCard.configuredTemplates, []);
  assert.deepEqual(report.liveRendering.configuredTemplates, []);
  assert.equal(report.authenticatedCallback.backendConfigured, false);
});

test('static path does not bypass configured live evidence, custom identity or origin rules', async () => {
  for (const kind of ['live', 'custom', 'origin'] as const) {
    const config = templates();
    if (kind === 'live') config[0]!.live = { installedExtensionVerified: false, evidence: '' };
    if (kind === 'custom') delete config[1]!.extension;
    const f = publicFixture(config), action = f.send(kind === 'custom' ? 'custom' : 'universal');
    if (kind === 'origin' && action.operation === 'app.send') action.arguments.url = 'https://unapproved.example/card';
    const result = await f.execute(action);
    assert.equal(result.error?.blockerId ?? result.error?.code,
      kind === 'live' ? 'live_extension_unverified' : kind === 'custom' ? 'customized_extension_missing' : 'FORBIDDEN');
    assert.equal(f.native.calls.length, 0);
  }
});

test('module restart reads a reopened SQLite checkpoint and edits the publicly restored original', async t => {
  const f = publicFixture(), sent = await f.execute(f.send());
  const original = [...f.native.messages.values()][0]!;
  // First warm edit refreshes provider metadata; persist that exact refreshed identity.
  assert.equal((await f.execute(f.update(sent))).status, 'executor-completed');
  const json = f.snapshot(sent), data = decodeSession(json);
  const path = join(await privateTestRoot(t, 'rfx-card-'), 'checkpoint.sqlite');
  const disk = new DurableSQLiteStore(path, () => f.services.clock.now());
  disk.transaction(tx => tx.put('checkpoints', { id: 'card-checkpoint', scope: data.card.scope, revision: 0,
    requestId: sent.requestId, codecId: SESSION_CODEC.id, codecVersion: SESSION_CODEC.version,
    payloadJson: json, nextChildIndex: 0, claim: f.services.claim }, null));
  disk.close();
  const reopened = new DurableSQLiteStore(path, () => f.services.clock.now());
  t.after(() => reopened.close());
  let reads = 0;
  f.native.getMessage = async id => { reads++; assert.equal(id, original.id); return original; };
  const cold = new CardRuntime({ ...f.options,
    loadSession: async ref => {
      assert.deepEqual(ref, data.session);
      return reopened.scan('checkpoints')[0]!.payloadJson;
    },
  });
  assert.deepEqual(await cold.updateCapability(data.session, f.services), { available: true });
  const updated = await f.execute(f.update(sent, 2), cold);
  assert.equal(updated.status, 'executor-completed');
  assert.deepEqual(updated.value, { type: 'void' });
  assert.deepEqual(updated.references, sent.references);
  assert.equal(reads, 1);
  assert.equal(f.native.messages.size, 1);
  assert.equal(f.native.calls.length, 3);
  for (const call of f.native.calls.slice(1)) {
    assert.equal(call.type, 'edit');
    if (call.type === 'edit') assert.equal(call.target, original);
  }
  assert.equal(decodeSession(cold.snapshot(data.session.id)!).cardRevision, 4);
  assert.equal((await f.execute(f.update(sent, 2), cold)).error?.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(f.native.calls.length, 3);
});

for (const lost of ['missing', 'no-metadata', 'chatGuid', 'sessionId', 'messageGuid', 'targetMessageGuid', 'read-error'] as const) {
  test(`cold public refetch ${lost} reports a blocker before dispatch and never replaces the bubble`, async () => {
    const f = publicFixture(), sent = await f.execute(f.send()), json = f.snapshot(sent), data = decodeSession(json);
    const original = [...f.native.messages.values()][0]!;
    if (lost === 'missing') f.native.getMessage = async () => undefined;
    else if (lost === 'read-error') f.native.getMessage = async () => { throw Error('provider unavailable'); };
    else if (lost === 'no-metadata') delete imessage(original).miniAppCardSession;
    else imessage(original).miniAppCardSession![lost] = 'different';
    const cold = new CardRuntime({ ...f.options, loadSession: async () => json });
    assert.deepEqual(await cold.updateCapability(data.session, f.services), { available: false, blockerId: 'requires_original_session' });
    const result = await f.execute(f.update(sent), cold);
    assert.equal(result.status, 'blocked');
    assert.equal(result.error?.blockerId, 'requires_original_session');
    assert.equal(f.native.calls.length, 1);
    assert.equal(f.native.messages.size, 1);
    if (lost === 'no-metadata') assert.equal(imessage(original).miniAppCardSession, undefined);
  });
}

for (const invalid of ['generation', 'phase', 'revision', 'session'] as const) {
  test(`cold checkpoint ${invalid} mismatch cannot trigger a provider read or edit`, async () => {
    const f = publicFixture(), sent = await f.execute(f.send()), data = decodeSession(f.snapshot(sent));
    if (invalid === 'generation') data.generation++;
    if (invalid === 'phase') data.phase = 'unknown';
    if (invalid === 'revision') data.cardRevision += 2;
    if (invalid === 'session') data.session.id = 'another-session';
    const cold = new CardRuntime({ ...f.options, loadSession: async () => encodeCardSession(data) });
    let reads = 0;
    f.native.getMessage = async () => { reads++; return [...f.native.messages.values()][0]; };
    const result = await f.execute(f.update(sent), cold);
    assert.equal(result.error?.blockerId ?? result.error?.code,
      invalid === 'generation' ? 'STALE_GENERATION' : invalid === 'phase' ? 'card_update_outcome_unknown' :
        invalid === 'revision' ? 'IDEMPOTENCY_CONFLICT' : 'SCOPE_MISMATCH');
    assert.equal(reads, 0);
    assert.equal(f.native.calls.length, 1);
  });
}

for (const change of ['extension', 'missing-digest'] as const) {
  test(`cold restore cannot adopt changed or unrecorded template identity: ${change}`, async () => {
    const f = publicFixture(), sent = await f.execute(f.send()), data = decodeSession(f.snapshot(sent));
    if (change === 'extension') f.options.templates[1]!.extension!.extensionBundleId = 'different.extension';
    else delete data.templateDigest;
    const cold = new CardRuntime({ ...f.options, loadSession: async () => encodeCardSession(data) });
    let reads = 0;
    f.native.getMessage = async () => { reads++; return [...f.native.messages.values()][0]; };
    assert.equal((await f.execute(f.update(sent), cold)).error?.blockerId, 'card_template_changed');
    assert.equal(reads, 0);
    assert.equal(f.native.calls.length, 1);
  });
}

test('revision changed during public refetch cannot be cached or dispatched', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), json = f.snapshot(sent), data = decodeSession(json);
  const cold = new CardRuntime({ ...f.options, loadSession: async () => json });
  f.native.getMessage = async () => {
    f.services.transaction(unit => {
      const card = unit.get('cards', data.card.id)!;
      unit.put('cards', { ...card, revision: 1 }, 0);
      unit.put('cards', { ...card, revision: 2 }, 1);
    });
    return [...f.native.messages.values()][0];
  };
  assert.equal((await f.execute(f.update(sent), cold)).error?.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(cold.snapshot(data.session.id), undefined);
  assert.equal(f.native.calls.length, 1);
});
