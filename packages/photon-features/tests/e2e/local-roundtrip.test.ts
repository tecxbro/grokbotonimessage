import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableSQLiteStore } from '../../src/adapters/state/sqlite.js';
import { runtime, action, context } from '../lanes/wt-09/harness.js';

test('concurrent IPC duplicates produce one durable request and survive a second DB connection', async t => {
  const r = runtime(); t.after(() => r.close()); const socket = await r.socket(); t.after(() => socket.close());
  const replies = await Promise.all(Array.from({length: 24}, () => socket.request({version: 1, method: 'submit', action: action()})));
  assert.ok(replies.every(reply => reply.ok));
  assert.equal(new Set(replies.map(reply => reply.result.requestId)).size, 1);
  assert.equal(r.store.scan('outbox').length, 1);
  const reopened = new DurableSQLiteStore(r.path);
  try { assert.deepEqual(reopened.scan('outbox')[0]!.result, replies[0]!.result); } finally { reopened.close(); }
});

test('same key with changed content conflicts and preserves original content', async t => {
  const r = runtime(); t.after(() => r.close()); const a = action('text.send');
  await r.submission.submit(a, context);
  if (a.operation !== 'text.send') throw new Error('fixture'); a.arguments.text = 'different';
  await assert.rejects(r.submission.submit(a, context), /IDEMPOTENCY_CONFLICT/);
  assert.equal(r.store.scan('outbox').length, 1);
  assert.deepEqual(r.store.scan('outbox')[0]!.action, action());
});

test('pre-dispatch cancellation is durable and a duplicate cannot resurrect it', async t => {
  const r = runtime(); t.after(() => r.close()); const result = await r.submission.submit(action(), context);
  assert.equal((await r.submission.cancel(result.requestId, context)).status, 'cancelled');
  assert.equal((await r.submission.submit(action(), context)).status, 'cancelled');
  assert.equal(r.store.scan('attempts').length, 0);
});
