import { readFile, writeFile, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const completionChecks = Object.freeze([
  'npm run typecheck --workspace=@grokbot/photon-features',
  'npm run photon:test:installed',
  'node scripts/generate-configuration.mjs --check',
  'node scripts/generate-production-inventory.mjs --check',
  'node scripts/prepare-npm-lock.mjs --check',
]);
export const requiredChecks = Object.freeze([
  'npm test', 'npm run photon:test', 'npm run photon:check', 'npm run photon:test:integration',
  'node scripts/generate-skill.mjs --check', ...completionChecks,
]);
export const provenanceModes = Object.freeze(['published-approved', 'owner-local-tested']);
const workflowRun = value => typeof value === 'string' && /^https:\/\/github\.com\/tecxbro\/grokbotonimessage\/actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*)?$/.test(value);
export const packageSupportFiles = Object.freeze([
  'package.json', 'SKILL.md', 'DEPLOYMENT.md', 'INSTALL.md', 'README.md',
  'scripts/generate-skill.mjs', 'scripts/install.mjs', 'scripts/package.mjs',
  'scripts/rollback.mjs', 'scripts/smoke-test.mjs', 'scripts/generate-configuration.mjs',
  'scripts/prepare-npm-lock.mjs', 'scripts/generate-production-inventory.mjs', 'npm-shrinkwrap.json',
]);
export const packagePayloadDirectories = Object.freeze([
  Object.freeze({ source: 'dist/src', archive: 'dist/src/' }),
  Object.freeze({ source: 'schemas', archive: 'schemas/' }),
  Object.freeze({ source: 'examples', archive: 'examples/' }),
  Object.freeze({ source: 'src/state/migrations', archive: 'src/state/migrations/' }),
]);
const safePath = name => typeof name === 'string' && name.length < 500 && !isAbsolute(name) && !name.includes('\\') && name.split('/').every(p => p && p !== '.' && p !== '..') && !/(^|\/)(\.env(?:\..*)?|\.npmrc|\.git|credentials?|.*\.(sqlite|db|pem|key)|runtime\.sock)(\/|$)/i.test(name);
export function encodeArchive(files, metadata) {
  const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, value]) => {
    if (!safePath(path)) throw new Error('UNSAFE_ARCHIVE_PATH');
    const bytes = Buffer.from(value.content ?? value);
    const mode = value.mode ?? (['dist/src/cli/main.js', 'dist/src/host/process.js', 'dist/src/host/task-launcher.js'].includes(path) ? 0o700 : 0o600);
    if (![0o600, 0o700].includes(mode)) throw new Error('UNSAFE_ARCHIVE_MODE');
    return { path, mode, bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64') };
  });
  return gzipSync(Buffer.from(JSON.stringify({ format: 'grok-photon-release-v1', metadata, files: entries }) + '\n'), { level: 9 });
}
export function decodeArchive(bytes, expectedChecksum) {
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || sha256(bytes) !== expectedChecksum) throw new Error('ARTIFACT_CHECKSUM_MISMATCH');
  if (bytes.length > 256 * 1024 * 1024) throw new Error('ARCHIVE_TOO_LARGE');
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }).toString('utf8'));
  if (archive.format !== 'grok-photon-release-v1' || !Array.isArray(archive.files) || archive.files.length > 50000 || Object.keys(archive).sort().join() !== 'files,format,metadata') throw new Error('INVALID_ARCHIVE');
  const seen = new Set();
  for (const f of archive.files) {
    if (Object.keys(f).sort().join() !== 'bytes,content,mode,path,sha256' || !safePath(f.path) || seen.has(f.path) || ![0o600, 0o700].includes(f.mode) || typeof f.content !== 'string') throw new Error('UNSAFE_ARCHIVE_PATH');
    seen.add(f.path); const content = Buffer.from(f.content, 'base64');
    if (content.toString('base64') !== f.content || content.length !== f.bytes || sha256(content) !== f.sha256) throw new Error('ARCHIVE_FILE_CHECKSUM_MISMATCH');
  }
  for (const name of seen) for (let parent = name.substring(0, name.lastIndexOf('/')); parent; parent = parent.substring(0, parent.lastIndexOf('/'))) if (seen.has(parent)) throw new Error('ARCHIVE_PATH_COLLISION');
  return archive;
}
export function validateMetadata(m) {
  if (!m || !provenanceModes.includes(m.provenanceMode) ||
    (m.provenanceMode === 'published-approved' ? !workflowRun(m.workflowRun) : m.workflowRun !== undefined) ||
    m.kind !== 'assembled-tested-candidate' || !/^[a-f0-9]{40}$/.test(m.commit) || !/^[a-f0-9]{64}$/.test(m.f0Digest) ||
    m.node !== '24.13.0' || m.npm !== '10.9.2' || m.stateSchemaVersion !== 1 ||
    !Array.isArray(m.compatibleStateSchemas) || m.compatibleStateSchemas.length !== 1 || m.compatibleStateSchemas[0] !== 1 ||
    !Array.isArray(m.tests) || !m.tests.length || m.tests.some(t => !t || t.exitCode !== 0) ||
    requiredChecks.some(command => !m.tests.some(t => t.command === command)) ||
    !['darwin', 'linux'].includes(m.platform) || !['arm64', 'x64'].includes(m.arch)) throw new Error('UNTESTED_OR_INCOMPATIBLE_ARTIFACT');
  // Both modes attest to the same complete local checks, never a live verification.
  if (m.releaseContract !== 2 || m.completionContract !== 1) throw new Error('UNTESTED_OR_INCOMPATIBLE_ARTIFACT');
  if (m.releaseContract === 2 && (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(m.version) || m.dependencies?.['spectrum-ts'] !== '12.8.0' || m.dependencies?.zod !== '4.5.4' || Object.keys(m.dependencies).sort().join() !== 'spectrum-ts,zod')) throw new Error('UNTESTED_OR_INCOMPATIBLE_ARTIFACT');
}
function validateDependencyLock(bytes) {
  const lock = JSON.parse(bytes.toString('utf8'));
  if (!lock.packages || lock.lockfileVersion !== 3) throw new Error('INVALID_DEPENDENCY_LOCK');
  for (const [name, record] of Object.entries(lock.packages)) {
    if (name && !safePath(name)) throw new Error('SECRET_PATH_IN_CANDIDATE');
    if (record.resolved && /^[a-z][a-z0-9+.-]*:\/\//i.test(record.resolved)) {
      const url = new URL(record.resolved);
      if (url.username || url.password) throw new Error('CREDENTIAL_IN_DEPENDENCY_LOCK');
    }
    if (name.startsWith('packages/photon-features/node_modules/') && !record.dev) throw new Error('NESTED_RUNTIME_DEPENDENCY_REQUIRES_INTEGRATION');
  }
  return lock;
}

/** Package an exact clean commit; owner-local changes approval policy only, never checks. */
export async function packageCandidate({ candidate, approval, output, provenanceMode = 'published-approved' }) {
  if (!provenanceModes.includes(provenanceMode)) throw new Error('UNSUPPORTED_PROVENANCE_MODE');
  if (provenanceMode === 'owner-local-tested' && (approval !== undefined || !isAbsolute(candidate ?? '') || !isAbsolute(output ?? ''))) throw new Error('USAGE_OWNER_LOCAL_ABSOLUTE_CANDIDATE_ABSOLUTE_OUTPUT');
  candidate = await realpath(candidate);
  const commands = [];
  const execute = (executable, args, cwd = candidate) => {
    const result = spawnSync(executable, args, { cwd, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
    const command = (executable === process.execPath ? 'node' : executable) + ' ' + args.join(' ');
    commands.push({ command, executable, args, cwd, exitCode: result.status, signal: result.signal ?? null,
      stdoutSha256: sha256(result.stdout ?? ''), stderrSha256: sha256(result.stderr ?? '') });
    if (result.error || result.signal || result.status !== 0) throw new Error('PACKAGING_COMMAND_FAILED');
    return Buffer.from(result.stdout ?? '');
  };
  const git = (...args) => execute('git', args).toString('utf8').trim();
  if (git('rev-parse', '--show-toplevel') !== candidate || git('status', '--porcelain', '--untracked-files=all')) throw new Error('CLEAN_ASSEMBLED_CANDIDATE_REQUIRED');
  const commit = git('rev-parse', 'HEAD');
  let authorization;
  if (provenanceMode === 'published-approved') {
    try { authorization = JSON.parse(await readFile(approval, 'utf8')); }
    catch { throw new Error('INTEGRATION_APPROVAL_REQUIRED'); }
    if (!authorization || authorization.kind !== 'assembled-candidate-approval' || authorization.commit !== commit || !workflowRun(authorization.workflowRun) || authorization.approved !== true) throw new Error('INTEGRATION_APPROVAL_REQUIRED');
  }
  const outputRelative = relative(candidate, resolve(output));
  if (!outputRelative.startsWith('..' + '/') && !isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_CANDIDATE');
  const root = join(candidate, 'packages/photon-features');
  const foundation = JSON.parse(await readFile(join(candidate, 'docs/worktrees/foundation.json'), 'utf8'));
  const legacyFoundation = JSON.parse(await readFile(join(candidate, 'docs/photon-features/foundation.json'), 'utf8'));
  if (authorization && authorization.f0Digest !== foundation.contractDigest) throw new Error('FOUNDATION_DIGEST_MISMATCH');
  if (legacyFoundation.runtime.node !== '24.13.0' || legacyFoundation.runtime.npm !== '10.9.2' || process.versions.node !== legacyFoundation.runtime.node || execute('npm', ['--version']).toString('utf8').trim() !== legacyFoundation.runtime.npm) throw new Error('PINNED_TOOLCHAIN_REQUIRED');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const aggregate = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
  if (pkg.bin?.['grok-photon'] !== 'dist/src/cli/main.js' ||
    pkg.bin?.['grok-photon-host'] !== 'dist/src/host/process.js' ||
    pkg.bin?.['grok-photon-task'] !== 'dist/src/host/task-launcher.js' ||
    !aggregate.scripts?.['photon:test:integration']) throw new Error('WT00_INTEGRATION_REQUIRED');
  // Reject credential-bearing lock URLs before npm uses them, including standalone installs.
  validateDependencyLock(await readFile(join(candidate, 'package-lock.json')));
  validateDependencyLock(await readFile(join(root, 'npm-shrinkwrap.json')));
  // Fresh dependency tree prevents including arbitrary files from a developer node_modules.
  execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  await rm(join(root, 'dist'), { recursive: true, force: true });
  const tests = [];
  for (const args of [['run', 'typecheck', '--workspace=@grokbot/photon-features'], ['test'], ['run', 'photon:test'], ['run', 'photon:check'], ['run', 'photon:test:integration'], ['run', 'photon:test:installed']]) {
    const log = execute('npm', args);
    tests.push({ command: 'npm ' + args.join(' '), exitCode: 0, logSha256: sha256(log) });
  }
  const docLog = execute(process.execPath, ['scripts/generate-skill.mjs', '--check'], root);
  tests.push({ command: 'node scripts/generate-skill.mjs --check', exitCode: 0, logSha256: sha256(docLog) });
  for (const name of ['generate-configuration', 'generate-production-inventory', 'prepare-npm-lock']) {
    const log = execute(process.execPath, ['scripts/' + name + '.mjs', '--check'], root);
    tests.push({ command: 'node scripts/' + name + '.mjs --check', exitCode: 0, logSha256: sha256(log) });
  }
  // Release runtime contains only production dependencies. No source checkout or
  // development compiler is required by the installed program.
  execute('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
  execute('npm', ['ls', '--omit=dev', '--all', '--json']);
  if (git('status', '--porcelain', '--untracked-files=all') || git('rev-parse', 'HEAD') !== commit) throw new Error('CANDIDATE_CHANGED');
  const files = {};
  async function collect(directory, prefix, dependency = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (dependency && entry.name === '.bin') continue;
      const source = join(directory, entry.name), name = prefix + entry.name;
      if (entry.isSymbolicLink()) {
        // npm workspace link points back to the package already captured below.
        if (dependency && name === 'node_modules/@grokbot/photon-features' && await realpath(source) === root) continue;
        throw new Error('SYMLINK_IN_CANDIDATE');
      }
      if (entry.isDirectory()) await collect(source, name + '/', dependency);
      else if (entry.isFile()) { if (!safePath(name)) throw new Error('SECRET_PATH_IN_CANDIDATE'); files[name] = { content: await readFile(source), mode: ((await lstat(source)).mode & 0o111) ? 0o700 : 0o600 }; }
      else throw new Error('NONREGULAR_CANDIDATE_FILE');
    }
  }
  for (const { source, archive } of packagePayloadDirectories) await collect(join(root, source), archive);
  await collect(join(candidate, 'node_modules'), 'node_modules/', true);
  for (const name of packageSupportFiles) files[name] = await readFile(join(root, name));
  files['bin/grok-photon'] = { content: Buffer.from("#!/usr/bin/env node\nimport { run } from '../dist/src/cli/main.js';\nprocess.exitCode = await run(process.argv.slice(2));\n"), mode: 0o700 };
  files['bin/grok-photon-host'] = { content: Buffer.from("#!/usr/bin/env node\nimport { processMain } from '../dist/src/host/process.js';\nprocess.exitCode = await processMain(process.argv.slice(2));\n"), mode: 0o700 };
  files['bin/grok-photon-task'] = { content: Buffer.from("#!/usr/bin/env node\nimport { taskLauncherMain } from '../dist/src/host/task-launcher.js';\nprocess.exitCode = await taskLauncherMain(process.argv.slice(2));\n"), mode: 0o700 };
  files['dependency-lock.json'] = await readFile(join(candidate, 'package-lock.json'));
  const lock = validateDependencyLock(files['dependency-lock.json']);
  validateDependencyLock(files['npm-shrinkwrap.json']);
  if (files['node_modules/.package-lock.json']) validateDependencyLock(files['node_modules/.package-lock.json'].content);
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    const installed = files['node_modules/' + name + '/package.json'];
    if (!installed || JSON.parse(installed.content.toString('utf8')).version !== version || lock.packages['node_modules/' + name]?.version !== version) throw new Error('PACKAGE_DEPENDENCY_MISMATCH');
  }
  files['foundation.json'] = await readFile(join(candidate, 'docs/worktrees/foundation.json'));
  const metadata = { kind: 'assembled-tested-candidate', provenanceMode, releaseContract: 2, completionContract: 1, commit, f0Digest: foundation.contractDigest, node: legacyFoundation.runtime.node, npm: legacyFoundation.runtime.npm,
    platform: process.platform, arch: process.arch, version: pkg.version, dependencies: pkg.dependencies, stateSchemaVersion: 1, compatibleStateSchemas: [1], ...(authorization ? { workflowRun: authorization.workflowRun } : {}), tests };
  validateMetadata(metadata);
  const archive = encodeArchive(files, metadata);
  decodeArchive(archive, sha256(archive));
  // Collection is asynchronous: recheck identity after the entire payload has been read.
  if (git('status', '--porcelain', '--untracked-files=all') || git('rev-parse', 'HEAD') !== commit) throw new Error('CANDIDATE_CHANGED');
  // O_EXCL prevents silently replacing any existing artifact or checksum.
  await writeFile(output, archive, { flag: 'wx', mode: 0o600 });
  decodeArchive(await readFile(output), sha256(archive));
  await writeFile(output + '.sha256', sha256(archive) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(output + '.provenance.json', JSON.stringify({ ...metadata, archiveSha256: sha256(archive), commands }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { artifact: output, sha256: sha256(archive), commit, provenanceMode, files: Object.keys(files).length };
}
export async function buildPackage(options) { return packageCandidate(options); }
/** Parse the two supported invocations without inferring a mode from files or paths. */
export function parsePackageArgs(args) {
  if (args[0] === '--owner-local') {
    if (args.length !== 3 || !args.slice(1).every(value => isAbsolute(value))) throw new Error('USAGE_OWNER_LOCAL_ABSOLUTE_CANDIDATE_ABSOLUTE_OUTPUT');
    return { candidate: args[1], output: args[2], provenanceMode: 'owner-local-tested' };
  }
  if (args.length !== 3 || args.some(value => !value || value.startsWith('--'))) throw new Error('USAGE_CANDIDATE_APPROVAL_OUTPUT');
  return { candidate: args[0], approval: args[1], output: args[2], provenanceMode: 'published-approved' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await packageCandidate(parsePackageArgs(process.argv.slice(2)))));
  } catch (e) { console.error('grok-photon packaging failed: ' + (/^[A-Z_]+$/.test(e.message) ? e.message : 'VALIDATION_FAILED')); process.exitCode = 1; }
}
