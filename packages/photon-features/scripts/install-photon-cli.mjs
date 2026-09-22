import { access, lstat, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, parse, resolve } from 'node:path';

/** Refuse symlinked write roots; never chmod or replace caller-owned ancestors. */
export async function privateDirectory(path) {
  if (!isAbsolute(path) || resolve(path) === parse(path).root) throw new Error('SETUP_INVALID_ROOT');
  let cursor = parse(path).root;
  for (const component of resolve(path).slice(cursor.length).split('/')) {
    cursor = join(cursor, component);
    try { await mkdir(cursor, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw new Error('SETUP_ROOT_UNWRITABLE'); }
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('SETUP_UNSAFE_ROOT');
  }
  return resolve(path);
}

/** Locate without invoking a shell or consulting shell aliases. */
export async function findExecutable(name, env) {
  const paths = name.includes('/') ? (isAbsolute(name) ? [name] : []) :
    (env.PATH ?? '').split(delimiter).filter(isAbsolute).map(dir => join(dir, name));
  for (const path of paths) {
    try { await access(path, constants.X_OK); if (!(await lstat(path)).isDirectory()) return path; }
    catch { /* Keep searching PATH. */ }
  }
  return null;
}

/** VM-only, private npm prefix; run is supplied by setup's bounded spawn adapter. */
export async function resolvePhotonCli({ configured, toolRoot, env, run, platform = process.platform, preferPrivate = false }) {
  if (platform !== 'linux') throw new Error('SETUP_VM_REQUIRED');
  if (configured) {
    const path = await findExecutable(configured, env);
    if (!path) throw new Error('PHOTON_EXECUTABLE_NOT_FOUND');
    return { path, source: 'configured' };
  }
  const onPath = preferPrivate ? null : await findExecutable('photon', env);
  if (onPath) return { path: onPath, source: 'path' };
  const prefix = join(toolRoot, 'photon-cli');
  await privateDirectory(prefix);
  const local = join(prefix, 'node_modules', '.bin', 'photon');
  // A package's normal .bin symlink is allowed; write-root symlinks are not.
  const existing = await findExecutable(local, env);
  if (existing) return { path: existing, source: 'private' };
  // Do not overwrite a caller's existing npm project or partial installation.
  for (const name of ['package.json', 'node_modules', 'package-lock.json']) {
    try { await lstat(join(prefix, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('PHOTON_PRIVATE_PREFIX_OCCUPIED');
  }
  const npm = await findExecutable('npm', env);
  if (!npm) throw new Error('NPM_EXECUTABLE_NOT_FOUND');
  const cache = await privateDirectory(join(toolRoot, 'npm-cache'));
  const result = await run(npm, ['install', '--prefix', prefix, '--cache', cache,
    '--userconfig', '/dev/null', '--globalconfig', '/dev/null', '--ignore-scripts',
    '--no-audit', '--no-fund', '--package-lock=true', '@photon-ai/cli@2.2.0']);
  if (result.exitCode !== 0 || !await findExecutable(local, env)) throw new Error('PHOTON_INSTALL_FAILED');
  return { path: local, source: 'installed' };
}
