import { readFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
// No socket, credentials, provider connection, service start or outbound message.
export async function smoke(root) {
  const main = join(resolve(root), 'dist/src/cli/main.js');
  if (!(await lstat(main)).isFile()) throw new Error('EXECUTABLE_MISSING');
  for (const name of ['dist/src/host/process.js', 'dist/src/host/task-launcher.js', 'dist/src/host/supervisor.js'])
    if (!(await lstat(join(resolve(root), name))).isFile()) throw new Error('EXECUTABLE_MISSING');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  for (const args of [['doctor', '--json'], ['capabilities', '--json'], ['execute', '--json-stdin']]) {
    const result = spawnSync(process.execPath, [main, ...args], { env, input: '{}', encoding: 'utf8', timeout: 5000 });
    if (result.status !== 2 || !result.stderr || result.stdout.trim().split('\n').length !== 1) throw new Error('SMOKE_FAILED');
    const output = JSON.parse(result.stdout);
    if (output.ok !== false || !['INVALID_CONFIGURATION', 'INVALID_REQUEST'].includes(output.error.code)) throw new Error('SMOKE_FAILED');
  }
  // No root or activation authorization: all host entrypoints must fail closed.
  const host = join(resolve(root), 'dist/src/host/process.js');
  for (const command of ['setup', 'enable', 'run', 'supervisor', 'reconcile', 'recover-stale']) {
    const result = spawnSync(process.execPath, [host, command], { env, encoding: 'utf8', timeout: 5000 });
    if (result.status !== 1 || result.stdout || !result.stderr.includes('USAGE_COMMAND_INSTALLATION_ROOT'))
      throw new Error('HOST_SMOKE_FAILED');
  }
  return { offlineSmoke: 'passed', activated: false, liveVerified: false };
}
export async function verifyInstallation(root) { return smoke(root); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await smoke(process.argv[2] ?? new URL('../', import.meta.url).pathname))); }
  catch { console.error('grok-photon: offline smoke failed'); process.exitCode = 1; }
}
