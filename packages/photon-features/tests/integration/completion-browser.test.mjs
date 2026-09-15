import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { webcrypto, randomUUID, verify, createPublicKey } from 'node:crypto';
import { cardBrowserScript } from '../../dist/src/host/card-browser.js';
import { completionChecks, validateMetadata } from '../../scripts/package.mjs';

test('shipped browser producer signs exact wire bytes with a persisted nonextractable key and retries one event', async () => {
  const keys = new Map(), storage = new Map(); let opens = 0, closes = 0;
  // DOM/storage boundaries only. Execute the shipped producer and real WebCrypto.
  const indexedDB = { open() {
    opens++; const request = {};
    request.result = { createObjectStore() {}, close() { closes++; }, transaction() {
      const tx = { objectStore: () => ({
        get(id) { const read = {}; queueMicrotask(() => { read.result = keys.get(id); read.onsuccess(); }); return read; },
        add(value, id) { assert.equal(keys.has(id), false); keys.set(id, value); queueMicrotask(() => tx.oncomplete()); },
      }) }; return tx;
    } };
    queueMicrotask(() => { if (opens === 1) request.onupgradeneeded(); request.onsuccess(); }); return request;
  } };
  const elements = new Map(['status', 'participant', 'enroll', 'key', 'actions'].map(id => [id, { value: '', textContent: '', children: [], append(value) { this.children.push(value); } }]));
  const sent = [];
  const binding = { session: { id: 'session-1' }, scope: { spaceId: 'chat-1' }, taskId: 'task-1', generation: 1, nonce: 'nonce-1', actionIds: ['approve'], expiresAt: Date.now() + 60000 };
  const context = createContext({ binding, indexedDB, TextEncoder, Uint8Array, Date,
    crypto: { subtle: webcrypto.subtle, randomUUID }, btoa: value => Buffer.from(value, 'binary').toString('base64'),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: id => elements.get(id), createElement: () => ({}), querySelectorAll: () => elements.get('actions').children },
    fetch: async (url, request) => { sent.push({ url, request }); if (sent.length === 1) throw new Error('response lost'); return { ok: true, json: async () => ({ status: 'replayed' }) }; },
  });
  runInContext(cardBrowserScript, context);
  await elements.get('enroll').onclick();
  const jwk = JSON.parse(elements.get('key').textContent);
  assert.equal(jwk.crv, 'Ed25519'); assert.equal(keys.get('device').privateKey.extractable, false);
  elements.get('participant').value = 'participant-verified-by-owner';
  const button = elements.get('actions').children[0];
  await button.onclick(); assert.equal(button.disabled, false);
  await button.onclick(); assert.equal(button.disabled, true);
  assert.equal(sent.length, 2); assert.equal(sent[0].request.body, sent[1].request.body);
  assert.equal(sent[0].url, '/interactions');
  const wire = JSON.parse(sent[0].request.body), payload = JSON.parse(wire.payload);
  assert.equal(wire.version, 1); assert.equal(payload.actionId, 'approve');
  assert.deepEqual(payload.scope, binding.scope); assert.equal(payload.participantId, 'participant-verified-by-owner');
  assert.ok(verify(null, Buffer.from('grok-photon:signed-card-v1\n' + wire.payload), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(wire.signature, 'base64url')));
  assert.equal(keys.size, 1); assert.equal(opens, closes);
});

test('completion release metadata requires every new executable and generated-contract check', () => {
  const required = ['npm test', 'npm run photon:test', 'npm run photon:check', 'npm run photon:test:integration', 'node scripts/generate-skill.mjs --check', ...completionChecks];
  const metadata = { kind: 'assembled-tested-candidate', releaseContract: 2, completionContract: 1,
    commit: 'a'.repeat(40), f0Digest: 'b'.repeat(64), node: '24.13.0', npm: '10.9.2',
    stateSchemaVersion: 1, compatibleStateSchemas: [1], platform: process.platform, arch: process.arch,
    version: '0.1.0', dependencies: { 'spectrum-ts': '12.8.0', zod: '4.5.4' }, tests: required.map(command => ({ command, exitCode: 0 })) };
  assert.doesNotThrow(() => validateMetadata(metadata));
  for (const missing of completionChecks) assert.throws(() => validateMetadata({ ...metadata, tests: metadata.tests.filter(row => row.command !== missing) }), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
  assert.throws(() => validateMetadata({ ...metadata, completionContract: 2 }), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
});
