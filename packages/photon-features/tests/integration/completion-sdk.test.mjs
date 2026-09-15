import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
test('actual pinned Spectrum streaming implementation crosses controlled transport boundary', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-completion-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = join(directory, 'boundary.jsonl'); await writeFile(log, '');
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import',
    resolve('packages/photon-features/tests/helpers/completion-boundary.mjs'),
    resolve('packages/photon-features/tests/helpers/completion-stream-runner.mjs')], {
    env: { ...process.env, COMPLETION_PACKAGE: resolve('packages/photon-features'), COMPLETION_BOUNDARY_LOG: log },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
