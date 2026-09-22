import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, open, lstat } from 'node:fs/promises';
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function check(condition, code) { if (!condition) throw new Error(code); }
export function errorCode(error) { return /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? '') ? error.code : /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.message ?? '') ? error.message : 'SETUP_FAILED'; }
export function parseArgs(argv) {
  const [command, ...args] = argv, options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; check(/^--[a-z][a-z0-9-]*$/.test(flag) && !Object.hasOwn(options, flag), 'INVALID_ARGUMENTS');
    if (flag === '--json-stdin' || flag === '--next') options[flag] = true;
    else { check(args[i+1] && !args[i+1].startsWith('--'), 'MISSING_ARGUMENT'); options[flag] = args[++i]; }
  }
  check(typeof options['--root'] === 'string' && isAbsolute(options['--root']) && resolve(options['--root']) !== '/', 'ABSOLUTE_INSTALL_ROOT_REQUIRED');
  return { command, options, root: resolve(options['--root']) };
}
export function only(options, names) { check(Object.keys(options).every(k => ['--root', ...names].includes(k)), 'UNKNOWN_ARGUMENT'); }
export async function inputJson(stream = process.stdin) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += Buffer.byteLength(chunk); check(size <= 256 * 1024, 'INPUT_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('INVALID_JSON'); }
}
export async function privateWrite(filename, value) {
  const file = await open(filename, 'wx', 0o600);
  try { await file.writeFile(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
  finally { await file.close(); }
}
export async function exists(filename) { try { await lstat(filename); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function selected(root) {
  const { readPrivateFile, assertPrivateDirectory } = await import('../dist/src/host/configuration.js');
  await assertPrivateDirectory(root);
  const pointer = JSON.parse(await readPrivateFile(join(root, 'selected-release.json')));
  check(pointer.version === 1 && /^[a-f0-9]{64}$/.test(pointer.release), 'INVALID_RELEASE_POINTER');
  const releaseRoot = join(root, 'releases', pointer.release);
  const { assertSelectedRelease } = await import('../dist/src/host/selected-release.js');
  await assertSelectedRelease(root, releaseRoot);
  return { releaseRoot, load: name => import(pathToFileURL(join(releaseRoot, 'dist/src', name + '.js')).href) };
}
/** No client-selected authority: the selected private installation supplies all four ports. */
export async function runtimeClient(root) {
  const release = await selected(root);
  const { loadNormalizedHostConfiguration } = await release.load('host/configuration');
  const config = await loadNormalizedHostConfiguration(root);
  check(config.grok.mode === 'webhook', 'WEBHOOK_PROFILE_REQUIRED');
  const { callRuntime } = await release.load('cli/local-client');
  const call = async request => {
    const result = await callRuntime(request, { socket: config.local.socketPath, credentialFile: config.local.credentialFile });
    if (!result.ok) throw new Error(result.error.code);
    return result.result;
  };
  const scoped = (method, data = {}) => call({ version: 1, method, contextId: config.task.contextId, ...data });
  const { createPhotonFeatureClient } = await import(pathToFileURL(join(release.releaseRoot, 'features-only/client.mjs')).href);
  const features = await createPhotonFeatureClient({ contextId: () => config.task.contextId,
    capabilities: () => scoped('capabilities'), submit: action => call({ version: 1, method: 'submit', action }),
    status: requestId => scoped('status', { requestId }) });
  return { config, release, features, scoped };
}
export const launcherSource = `import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const selection = JSON.parse(await readFile(join(root, 'selected-release.json'), 'utf8'));
if (selection.version !== 1 || !/^[a-f0-9]{64}$/.test(selection.release)) throw new Error('INVALID_RELEASE_POINTER');
const { main } = await import(pathToFileURL(join(root, 'releases', selection.release, 'scratch-setup/cli.mjs')).href);
process.exitCode = await main([...process.argv.slice(2), '--root', root]);
`;
export async function ensureLauncher(root) {
  const path = join(root, 'photon.mjs');
  if (await exists(path)) {
    const stat = await lstat(path);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o600 &&
      await readFile(path, 'utf8') === launcherSource, 'EXISTING_LAUNCHER_REQUIRES_REVIEW');
  } else await privateWrite(path, launcherSource);
  return path;
}
