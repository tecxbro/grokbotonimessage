import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
// Run separately from source tests which deliberately mutate SKILL.md to test drift.
test('real archive installs without source/dev dependencies and runs production journeys across independent failure fixtures', { timeout: 600000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'completion-pack-'));
  // Maintainer evidence runs may retain the exact tested diagnostic archive.
  if (process.env.COMPLETION_KEEP_ARCHIVE !== '1') t.after(() => rm(directory, { recursive: true, force: true }));
  const packed = spawnSync('npm', ['pack', '--workspace=@grokbot/photon-features', '--ignore-scripts', '--json', '--pack-destination', directory], { encoding: 'utf8', timeout: 30000 });
  assert.equal(packed.status, 0, packed.stderr);
  const info = JSON.parse(packed.stdout)[0];
  const packedSkill = spawnSync('tar', ['-xOf', join(directory, info.filename), 'package/SKILL.md']);
  assert.equal(packedSkill.status, 0, packedSkill.stderr.toString());
  assert.deepEqual(packedSkill.stdout, await readFile(resolve('packages/photon-features/SKILL.md')),
    'the packaged skill must contain the complete reviewed manual guidance byte-for-byte');
  const names = new Set(info.files.map(file => file.path));
  for (const name of ['bin/grok-photon-task', 'bin/grok-photon-host', 'dist/src/host/text-producer.js', 'dist/src/host/card-backend.js',
    'dist/src/host/card-browser.js', 'dist/src/host/authority-admin.js', 'schemas/protocol.json', 'schemas/stream.open.json',
    'schemas/authority-transition-v1.json', 'npm-shrinkwrap.json', 'SKILL.md', 'DEPLOYMENT.md', 'examples/production-inventory.json']) assert.ok(names.has(name), name);
  const modes = ['provider-failure', 'abort', 'cancel', 'expiry', 'stall', 'cold-restore', 'buffered'];
  const run = mode => new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve('packages/photon-features/tests/helpers/completion-installed-runner.mjs')], {
      env: { ...process.env, COMPLETION_FAILURE_MODE: mode, COMPLETION_ARCHIVE: join(directory, info.filename),
        COMPLETION_BOUNDARY_PRELOAD: resolve('packages/photon-features/tests/helpers/completion-boundary.mjs') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
    child.on('error', reject); child.on('close', code => resolveResult({ mode, code, output }));
  });
  for (let i = 0; i < modes.length; i += 2) {
    const results = await Promise.all(modes.slice(i, i + 2).map(run));
    for (const result of results) { assert.equal(result.code, 0, result.mode + '\n' + result.output); t.diagnostic(result.output.trim()); }
  }
});
