import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, writeFile, mkdir, rm, chmod, symlink, lstat } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { releaseDependencies, packageCandidate, parsePackageArgs, requiredChecks, packageSupportFiles, packagePayloadDirectories,
  validateMetadata, encodeArchive, decodeArchive, sha256 } from '../../scripts/package.mjs';
import { installRelease } from '../../scripts/install.mjs';
import { rollbackInstallation } from '../../scripts/rollback.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const originalSpawn = childProcess.spawnSync;
const dependencies = releaseDependencies;
const digest = 'b'.repeat(64);
const workflow = 'https://github.com/tecxbro/grokbotonimessage/actions/runs/123';
const npmCommands = [
  'npm ci --ignore-scripts --no-audit --no-fund',
  'npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
  'npm ls --omit=dev --all --json',
];
const payload = {
  'dist/src/cli/main.js': 'export {};', 'dist/src/host/process.js': 'export {};',
  'dist/src/host/task-launcher.js': 'export {};', 'dist/src/index.d.ts': 'export {};',
  'dist/src/host/text-producer.js': 'export {};', 'dist/src/host/card-backend.js': 'export {};',
  'dist/src/host/card-browser.js': 'export {};', 'dist/src/host/authority-admin.js': 'export {};',
  ...Object.fromEntries(['protocol', 'host-configuration-v2', 'authority-transition-v1',
    'stream.open', 'stream.append', 'stream.close', 'stream.abort'].map(name => ['schemas/' + name + '.json', '{}'])),
  'examples/production-inventory.json': '{}', 'src/state/migrations/0001-initial.sql': '-- fixture\n',
};
function put(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
}
function git(candidate, ...args) {
  const result = originalSpawn('git', args, { cwd: candidate, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function fixture(t) {
  await mkdir(join(workspace, '.photon-local'), { recursive: true });
  const directory = await mkdtemp(join(workspace, '.photon-local/rfx-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = join(directory, 'candidate'), root = join(candidate, 'packages/photon-features');
  await mkdir(root, { recursive: true });
  put(join(candidate, '.gitignore'), 'node_modules/\ndist/\n');
  put(join(candidate, 'package.json'), { scripts: { 'photon:test:integration': 'fixture' } });
  for (const name of packageSupportFiles) put(join(root, name), 'fixture only\n');
  put(join(root, 'package.json'), { name: '@grokbot/photon-features', version: '0.1.0', dependencies,
    bin: { 'grok-photon': 'dist/src/cli/main.js', 'grok-photon-host': 'dist/src/host/process.js', 'grok-photon-task': 'dist/src/host/task-launcher.js' } });
  const lock = { lockfileVersion: 3, packages: Object.fromEntries(Object.entries(dependencies).map(([name, version]) => ['node_modules/' + name, { version, resolved: 'https://registry.npmjs.org/' + name + '/-/' + name + '-' + version + '.tgz' }])) };
  put(join(candidate, 'package-lock.json'), lock);
  put(join(root, 'npm-shrinkwrap.json'), lock);
  put(join(candidate, 'docs/worktrees/foundation.json'), { contractDigest: digest });
  put(join(candidate, 'docs/photon-features/foundation.json'), { runtime: { node: '24.13.0', npm: '10.9.2' } });
  for (const { source } of packagePayloadDirectories) await mkdir(join(root, source), { recursive: true });
  for (const [path, bytes] of Object.entries(payload)) put(join(root, path), bytes);
  git(candidate, 'init', '--quiet');
  git(candidate, 'add', '.');
  git(candidate, '-c', 'user.name=RFX artifact fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'offline fixture');
  const commit = git(candidate, 'rev-parse', 'HEAD');
  const approval = join(directory, 'approval.json');
  const authorization = { kind: 'assembled-candidate-approval', approved: true, commit, f0Digest: digest, workflowRun: workflow };
  await writeFile(approval, JSON.stringify(authorization));
  return { directory, candidate, root, output: join(directory, 'release.gz'), approval, authorization,
    commit, options: { candidate, output: join(directory, 'release.gz'), provenanceMode: 'owner-local-tested' } };
}
// Only subprocess boundaries are mocked. Git identity, archive IO, checksums,
// metadata, private install roots, SQLite state and rollback use real implementations.
function mockChecks(t, f, { fail, onCommand, onGit, npmVersion } = {}) {
  const calls = [];
  const mock = t.mock.method(childProcess, 'spawnSync', (executable, args, options) => {
    const command = (executable === process.execPath ? 'node' : executable) + ' ' + args.join(' ');
    calls.push({ command, executable, args, cwd: options.cwd });
    if (executable === 'git') { onGit?.(command); return originalSpawn(executable, args, options); }
    if (command === 'npm --version') return npmVersion ? { status: 0, stdout: Buffer.from(npmVersion) } : originalSpawn(executable, args, options);
    assert.ok([...requiredChecks, ...npmCommands].includes(command), 'unexpected command: ' + command);
    if (command === requiredChecks.find(value => value.includes('typecheck'))) {
      for (const [path, bytes] of Object.entries(payload)) if (path.startsWith('dist/')) put(join(f.root, path), bytes);
    }
    if (command === npmCommands[1]) for (const [name, version] of Object.entries(dependencies)) put(join(f.candidate, 'node_modules/' + name + '/package.json'), { name, version });
    onCommand?.(command);
    return { status: command === fail ? 1 : 0, signal: null, stdout: Buffer.from('explicit mocked command result\n'), stderr: Buffer.alloc(0) };
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  return calls;
}
async function archiveFor(f) {
  const bytes = await readFile(f.output);
  return decodeArchive(bytes, sha256(bytes));
}
async function assertNoArtifact(f) {
  for (const suffix of ['', '.sha256', '.provenance.json']) await assert.rejects(readFile(f.output + suffix), { code: 'ENOENT' });
}

test('owner-local runs every check and records every subprocess without approval paperwork', async t => {
  const f = await fixture(t), calls = mockChecks(t, f);
  await rm(f.approval);
  const result = await packageCandidate(f.options);
  assert.equal(result.commit, f.commit);
  assert.equal(result.provenanceMode, 'owner-local-tested');
  const archive = await archiveFor(f);
  assert.equal(archive.metadata.provenanceMode, 'owner-local-tested');
  assert.equal('workflowRun' in archive.metadata, false);
  assert.deepEqual(new Set(archive.metadata.tests.map(row => row.command)), new Set(requiredChecks));
  assert.doesNotThrow(() => validateMetadata(archive.metadata));
  assert.equal((await readFile(f.output + '.sha256', 'utf8')).trim(), result.sha256);
  const provenance = JSON.parse(await readFile(f.output + '.provenance.json', 'utf8'));
  assert.equal(provenance.archiveSha256, result.sha256);
  assert.equal(provenance.provenanceMode, 'owner-local-tested');
  assert.equal('workflowRun' in provenance, false);
  assert.deepEqual(provenance.commands.map(({ command, executable, args, cwd }) => ({ command, executable, args, cwd })), calls);
  for (const row of provenance.commands) {
    assert.equal(row.exitCode, 0); assert.equal(row.signal, null);
    assert.match(row.stdoutSha256, /^[a-f0-9]{64}$/); assert.match(row.stderrSha256, /^[a-f0-9]{64}$/);
  }
  for (const command of ['npm --version', ...requiredChecks, ...npmCommands]) assert.ok(calls.some(row => row.command === command), command);
});

test('every failed required check or dependency command blocks owner-local output', async t => {
  for (const fail of [...requiredChecks, ...npmCommands]) await t.test(fail, async t => {
    const f = await fixture(t), calls = mockChecks(t, f, { fail });
    await assert.rejects(packageCandidate(f.options), /PACKAGING_COMMAND_FAILED/);
    assert.equal(calls.at(-1).command, fail);
    await assertNoArtifact(f);
  });
});

test('metadata and installer reject missing checks, unsupported modes and incompatible state for both modes', async t => {
  const f = await fixture(t); mockChecks(t, f); await packageCandidate(f.options);
  const archive = await archiveFor(f);
  for (const provenanceMode of ['owner-local-tested', 'published-approved']) {
    const metadata = { ...archive.metadata, provenanceMode, ...(provenanceMode === 'published-approved' ? { workflowRun: workflow } : {}) };
    assert.doesNotThrow(() => validateMetadata(metadata));
    const invalid = [
      ...requiredChecks.map(command => ({ ...metadata, tests: metadata.tests.filter(row => row.command !== command) })),
      ...requiredChecks.map(command => ({ ...metadata, tests: metadata.tests.map(row => row.command === command ? { ...row, exitCode: 1 } : row) })),
      { ...metadata, completionContract: undefined }, { ...metadata, releaseContract: undefined },
      { ...metadata, provenanceMode: undefined }, { ...metadata, provenanceMode: 'live-verified' },
      { ...metadata, stateSchemaVersion: 2 }, { ...metadata, compatibleStateSchemas: ['1'] },
      { ...metadata, node: '24.19.0' }, { ...metadata, npm: '11.0.0' },
      { ...metadata, dependencies: { ...dependencies, zod: '4.5.5' } },
      { ...metadata, workflowRun: provenanceMode === 'owner-local-tested' ? workflow : undefined },
    ];
    for (const m of invalid) {
      assert.throws(() => validateMetadata(m), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
      const bytes = encodeArchive(Object.fromEntries(archive.files.map(row => [row.path, { content: Buffer.from(row.content, 'base64'), mode: row.mode }])), m);
      const archivePath = join(f.directory, 'invalid.gz'); await writeFile(archivePath, bytes);
      await assert.rejects(installRelease({ archivePath, checksum: sha256(bytes), root: join(f.directory, 'invalid-install') }), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
    }
  }
});

test('dirty candidates fail before commands are run', async t => {
  for (const kind of ['unstaged', 'staged', 'untracked']) await t.test(kind, async t => {
    const f = await fixture(t), calls = mockChecks(t, f);
    put(join(f.candidate, kind === 'untracked' ? 'new-file' : 'package.json'), 'dirty');
    if (kind === 'staged') git(f.candidate, 'add', 'package.json');
    await assert.rejects(packageCandidate(f.options), /CLEAN_ASSEMBLED_CANDIDATE_REQUIRED/);
    assert.ok(calls.every(row => row.executable === 'git'));
    await assertNoArtifact(f);
  });
});

test('changed HEAD and dirt introduced during packaging fail', async t => {
  for (const change of ['commit', 'dirty']) await t.test(change, async t => {
    const f = await fixture(t);
    mockChecks(t, f, { onCommand(command) {
      if (command !== 'npm run photon:test:installed') return;
      if (change === 'commit') git(f.candidate, '-c', 'user.name=RFX', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'changed during checks');
      else put(join(f.candidate, 'dirty-during-checks'), 'changed');
    } });
    await assert.rejects(packageCandidate(f.options), /CANDIDATE_CHANGED/); await assertNoArtifact(f);
  });
  await t.test('HEAD changes after payload collection', async t => {
    const f = await fixture(t); let statusChecks = 0;
    mockChecks(t, f, { onGit(command) {
      if (command !== 'git status --porcelain --untracked-files=all' || ++statusChecks !== 3) return;
      git(f.candidate, '-c', 'user.name=RFX', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'changed during collection');
    } });
    await assert.rejects(packageCandidate(f.options), /CANDIDATE_CHANGED/); await assertNoArtifact(f);
  });
});

test('credential paths, lock credentials and wrong installed dependencies fail', async t => {
  for (const path of ['node_modules/.env', 'node_modules/provider/credentials/token', 'node_modules/provider/key.pem']) await t.test(path, async t => {
    const f = await fixture(t);
    mockChecks(t, f, { onCommand(command) { if (command === npmCommands[1]) put(join(f.candidate, path), 'secret fixture'); } });
    await assert.rejects(packageCandidate(f.options), /SECRET_PATH_IN_CANDIDATE/); await assertNoArtifact(f);
  });
  for (const path of ['package-lock.json', 'packages/photon-features/npm-shrinkwrap.json']) await t.test(path, async t => {
    const f = await fixture(t);
    const lockPath = join(f.candidate, path), lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.packages['node_modules/zod'].resolved = 'https://fixture:secret@registry.npmjs.org/zod.tgz';
    put(lockPath, lock); git(f.candidate, 'add', path);
    git(f.candidate, '-c', 'user.name=RFX', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'credential fixture');
    const calls = mockChecks(t, f);
    await assert.rejects(packageCandidate(f.options), /CREDENTIAL_IN_DEPENDENCY_LOCK/);
    assert.ok(!calls.some(row => row.command.startsWith('npm ci'))); await assertNoArtifact(f);
  });
  await t.test('installed dependency version mismatch', async t => {
    const f = await fixture(t);
    mockChecks(t, f, { onCommand(command) { if (command === npmCommands[1]) put(join(f.candidate, 'node_modules/zod/package.json'), { version: '0.0.0' }); } });
    await assert.rejects(packageCandidate(f.options), /PACKAGE_DEPENDENCY_MISMATCH/); await assertNoArtifact(f);
  });
});

test('formal invocation retains approval binding and produces distinguishable provenance', async t => {
  const f = await fixture(t); mockChecks(t, f);
  const options = parsePackageArgs([f.candidate, f.approval, f.output]);
  const result = await packageCandidate(options);
  assert.equal(result.provenanceMode, 'published-approved');
  const archive = await archiveFor(f);
  assert.equal(archive.metadata.provenanceMode, 'published-approved');
  assert.equal(archive.metadata.workflowRun, workflow);
  assert.deepEqual(new Set(archive.metadata.tests.map(row => row.command)), new Set(requiredChecks));
  const provenance = JSON.parse(await readFile(f.output + '.provenance.json', 'utf8'));
  assert.equal(provenance.provenanceMode, 'published-approved');
  assert.equal(provenance.workflowRun, workflow);
  assert.equal((await installRelease({ archivePath: f.output, checksum: result.sha256, root: join(f.directory, 'published-install') })).activation, 'disabled');
});

test('formal approval rejects invalid JSON, fake URLs, wrong commit/digest and nonapproval', async t => {
  const mutations = [null, {}, { approved: false }, { approved: 'true' }, { kind: 'owner-local-tested' },
    { commit: '0'.repeat(40) }, { f0Digest: '0'.repeat(64) }, { workflowRun: undefined },
    { workflowRun: 'https://github.com/tecxbro/grokbotonimessage/actions/runs/fake' },
    { workflowRun: 'https://github.com/tecxbro/grokbotonimessage/actions/runs/123/../../fake' },
    { workflowRun: 'https://github.com.evil.invalid/tecxbro/grokbotonimessage/actions/runs/123' }, 'malformed'];
  for (const mutation of mutations) await t.test(JSON.stringify(mutation), async t => {
    const f = await fixture(t), calls = mockChecks(t, f);
    await writeFile(f.approval, mutation === 'malformed' ? '{' : JSON.stringify(mutation === null ? null : Object.keys(mutation).length ? { ...f.authorization, ...mutation } : {}));
    await assert.rejects(packageCandidate({ candidate: f.candidate, approval: f.approval, output: f.output }), /INTEGRATION_APPROVAL_REQUIRED|FOUNDATION_DIGEST_MISMATCH/);
    assert.ok(calls.every(row => row.executable === 'git')); await assertNoArtifact(f);
  });
});

test('pinned toolchain, explicit mode and outside output remain mandatory', async t => {
  const f = await fixture(t); mockChecks(t, f, { npmVersion: '11.0.0' });
  await assert.rejects(packageCandidate(f.options), /PINNED_TOOLCHAIN_REQUIRED/);
  await assert.rejects(packageCandidate({ ...f.options, provenanceMode: 'skip-tests' }), /UNSUPPORTED_PROVENANCE_MODE/);
  await assert.rejects(packageCandidate({ ...f.options, approval: f.approval }), /USAGE_OWNER_LOCAL/);
  await assert.rejects(packageCandidate({ ...f.options, output: join(f.candidate, 'artifact.gz') }), /OUTPUT_MUST_BE_OUTSIDE_CANDIDATE/);
  await assertNoArtifact(f);
});

test('CLI rejects ambiguous and incomplete invocations deterministically', () => {
  assert.deepEqual(parsePackageArgs(['--owner-local', '/candidate', '/output']), { candidate: '/candidate', output: '/output', provenanceMode: 'owner-local-tested' });
  for (const args of [[], ['--unknown', '/candidate', '/output'], ['/candidate', '/approval'], ['/candidate', '/approval', '/output', 'extra']]) {
    assert.throws(() => parsePackageArgs(args), /USAGE_CANDIDATE_APPROVAL_OUTPUT/);
  }
  for (const args of [['--owner-local'], ['--owner-local', 'relative', '/output'], ['--owner-local', '/candidate', 'relative'], ['--owner-local', '/candidate', '/output', 'approval']]) {
    assert.throws(() => parsePackageArgs(args), /USAGE_OWNER_LOCAL_ABSOLUTE_CANDIDATE_ABSOLUTE_OUTPUT/);
    const result = originalSpawn(process.execPath, [resolve(workspace, 'packages/photon-features/scripts/package.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'grok-photon packaging failed: USAGE_OWNER_LOCAL_ABSOLUTE_CANDIDATE_ABSOLUTE_OUTPUT');
  }
});

test('owner-local installs privately and inactive; checksum, competing ownership and unsafe roots fail', async t => {
  const f = await fixture(t); mockChecks(t, f); const packed = await packageCandidate(f.options);
  const root = join(f.directory, 'install'), options = { archivePath: f.output, checksum: packed.sha256, root };
  await assert.rejects(installRelease({ ...options, checksum: '0'.repeat(64) }), /ARTIFACT_CHECKSUM_MISMATCH/);
  const installed = await installRelease(options);
  assert.equal(installed.activation, 'disabled');
  await assert.rejects(lstat(join(root, 'runtime/configuration.json')), { code: 'ENOENT' });
  for (const path of ['.install-lock', 'runtime/host.lock', 'runtime/runtime.sock']) {
    await writeFile(join(root, path), 'another owner');
    await assert.rejects(installRelease(options), /INSTALL_OWNER_EXISTS|HOST_OWNER_OR_SOCKET_EXISTS/);
    await assert.rejects(rollbackInstallation({ root, release: installed.release }), /INSTALL_OWNER_EXISTS|HOST_OWNER_OR_SOCKET_EXISTS/);
    await rm(join(root, path));
  }
  await writeFile(join(root, 'runtime/configuration.json'), JSON.stringify({ activation: 'enabled' }), { mode: 0o600 });
  await assert.rejects(installRelease(options), /DEACTIVATION_REQUIRED/);
  await assert.rejects(rollbackInstallation({ root, release: installed.release }), /DEACTIVATION_REQUIRED/);
  const link = join(f.directory, 'link'); await symlink(root, link);
  await assert.rejects(installRelease({ ...options, root: link }), /PRIVATE_DIRECTORY_REQUIRED/);
  await chmod(root, 0o755);
  await assert.rejects(installRelease(options), /PRIVATE_DIRECTORY_REQUIRED/);
});

test('repeat install and compatible rollback preserve state; incompatible rollback preserves state and selection', async t => {
  const f = await fixture(t); mockChecks(t, f); const packed = await packageCandidate(f.options);
  const root = join(f.directory, 'install'), options = { archivePath: f.output, checksum: packed.sha256, root };
  const first = await installRelease(options), state = join(root, 'runtime/state.sqlite');
  let db = new DatabaseSync(state);
  db.exec("PRAGMA user_version=1; CREATE TABLE work(id TEXT, status TEXT); INSERT INTO work VALUES('one','queued'),('two','unknown-outcome');"); db.close(); await chmod(state, 0o600);
  const before = await readFile(state);
  assert.deepEqual(await installRelease(options), first);
  assert.deepEqual(await readFile(state), before);
  const archive = await archiveFor(f);
  const files = Object.fromEntries(archive.files.map(row => [row.path, { content: Buffer.from(row.content, 'base64'), mode: row.mode }]));
  files['SKILL.md'] = 'second fixture release';
  const second = encodeArchive(files, { ...archive.metadata, commit: 'c'.repeat(40) }), secondPath = join(f.directory, 'second.gz');
  await writeFile(secondPath, second);
  await installRelease({ ...options, archivePath: secondPath, checksum: sha256(second) });
  assert.equal((await rollbackInstallation({ root, release: first.release })).statePreserved, true);
  assert.deepEqual(await readFile(state), before);
  db = new DatabaseSync(state); db.exec('PRAGMA user_version=2'); db.close();
  const upgraded = await readFile(state), selection = await readFile(join(root, 'selected-release.json'));
  await assert.rejects(rollbackInstallation({ root, release: first.release }), /INCOMPATIBLE_DOWNGRADE/);
  await assert.rejects(installRelease(options), /INCOMPATIBLE_DOWNGRADE/);
  assert.deepEqual(await readFile(state), upgraded);
  assert.deepEqual(await readFile(join(root, 'selected-release.json')), selection);
});
