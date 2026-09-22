import { fork, spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connect as netConnect } from 'node:net';
import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { check, selected, parseArgs, only, errorCode, privateWrite, exists } from './common.mjs';
const execute = promisify(execFile), delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A process supervisor, not an agent. It observes an IPC heartbeat independently
 * of the receiving child. Quiet message traffic is never treated as failure. */
export class ChildSupervisor {
  constructor({ createChild, beforeStart = async () => {}, onState = () => {}, intervalMs = 1000,
    healthMs = 30000, startupMs = 60000, stopMs = 3000, restartMs = 2000, maxFailures = 5 }) {
    Object.assign(this, { createChild, beforeStart, onState, intervalMs, healthMs, startupMs, stopMs, restartMs, maxFailures });
    this.state = { status: 'stopped', ready: false, restarts: 0, childPid: null, code: null };
    this.stopping = false; this.failures = []; this.child = undefined; this.starting = false;
  }
  update(values) { this.state = { ...this.state, ...values }; this.onState(this.state); }
  async start() {
    check(!this.stopping && !this.child && !this.starting, 'SUPERVISOR_ALREADY_STARTED'); this.starting = true;
    try {
      await this.beforeStart(); if (this.stopping) return;
      this.startedAt = this.lastHeartbeat = Date.now();
      this.update({ status: 'starting', ready: false, childPid: null, code: null });
      const child = this.createChild(); this.child = child;
      this.update({ childPid: child.pid ?? null });
      child.on('message', message => {
        if (this.child !== child || this.stopping || message?.type !== 'photon-health') return;
        if (message.ready === true) { this.lastHeartbeat = Date.now(); this.update({ status: 'running', ready: true, code: null }); }
      });
      const ended = () => {
        if (this.child !== child) return;
        this.child = undefined; clearInterval(this.watchdog);
        this.update({ ready: false, childPid: null });
        if (!this.stopping) this.failed('RUNTIME_EXITED');
      };
      child.once('exit', ended); child.once('error', ended);
      this.watchdog = setInterval(() => {
        if (this.stopping || this.child !== child || this.terminating) return;
        const expired = this.state.ready ? Date.now() - this.lastHeartbeat > this.healthMs : Date.now() - this.startedAt > this.startupMs;
        if (expired) {
          this.update({ status: 'unhealthy', ready: false, code: 'RUNTIME_HEARTBEAT_EXPIRED' });
          this.terminating = this.terminate(child).catch(() => {
            this.stopping = true; this.update({ status: 'failed', ready: false, code: 'CHILD_TERMINATION_UNVERIFIED' });
          }).finally(() => { this.terminating = undefined; });
        }
      }, this.intervalMs);
    } catch (error) { this.failed(errorCode(error)); }
    finally { this.starting = false; }
  }
  failed(code) {
    if (this.stopping) return;
    const now = Date.now(); this.failures = this.failures.filter(time => now - time < 300000); this.failures.push(now);
    if (this.failures.length >= this.maxFailures) { this.update({ status: 'failed', ready: false, code }); return; }
    this.update({ status: 'backoff', ready: false, code, restarts: this.state.restarts + 1 });
    this.retry = setTimeout(() => { this.retry = undefined; if (!this.stopping) void this.start(); }, Math.min(60000, this.restartMs * 2 ** (this.failures.length - 1)));
  }
  async terminate(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    if (await Promise.race([exited.then(() => true), delay(this.stopMs).then(() => false)])) return;
    child.kill('SIGKILL');
    check(await Promise.race([exited.then(() => true), delay(this.stopMs).then(() => false)]), 'CHILD_TERMINATION_UNVERIFIED');
  }
  async stop() {
    this.stopping = true; clearTimeout(this.retry); clearInterval(this.watchdog);
    if (this.child) await this.terminate(this.child);
    if (this.terminating) await this.terminating;
    this.update({ status: 'stopped', ready: false, childPid: null });
  }
}

async function environment(root) {
  const release = await selected(root), configuration = await release.load('host/configuration');
  const config = await configuration.loadNormalizedHostConfiguration(root);
  check(config.grok.mode === 'webhook' && config.activation === 'enabled', 'ENABLED_WEBHOOK_CONFIGURATION_REQUIRED');
  const directory = join(root, 'runtime', 'supervisor');
  await mkdir(directory, { recursive: true, mode: 0o700 }); await configuration.assertPrivateDirectory(directory);
  const socketPath = join(directory, 'runtime.sock'); check(Buffer.byteLength(socketPath) <= 100, 'INSTALL_ROOT_TOO_LONG_FOR_SOCKET');
  return { release, config, directory, socketPath, configuration };
}

async function control(root, command) {
  const env = await environment(root);
  const stat = await lstat(env.socketPath); check(stat.isSocket() && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o600, 'INVALID_SUPERVISOR_SOCKET');
  const token = (await env.configuration.readPrivateFile(env.config.local.credentialFile, 128)).trim();
  return new Promise((resolve, reject) => {
    const socket = netConnect(env.socketPath); let bytes = Buffer.alloc(0), finished = false;
    const fail = () => { if (!finished) { finished = true; socket.destroy(); reject(new Error('SUPERVISOR_UNAVAILABLE')); } };
    socket.setTimeout(3000, fail); socket.once('error', fail);
    socket.once('connect', () => socket.write(JSON.stringify({ token, request: { command } }) + '\n'));
    socket.on('data', chunk => { if (bytes.length + chunk.length > 16384) return fail(); bytes = Buffer.concat([bytes, chunk]); });
    socket.once('end', () => {
      if (finished) return; finished = true; socket.destroy();
      try { const result = JSON.parse(bytes.toString('utf8')); check(result.ok === true, 'SUPERVISOR_COMMAND_FAILED'); resolve(result.state); }
      catch { reject(new Error('INVALID_SUPERVISOR_RESPONSE')); }
    });
  });
}

export async function runManager(root) {
  const env = await environment(root), { reconcileHostOwnership, acquireHostOwnership } = await env.release.load('host/owner-lock');
  await reconcileHostOwnership(env.directory, { recoverStale: true });
  const ownership = await acquireHostOwnership(env.directory, 'photon-process-supervisor');
  let local, supervisor, closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    try { await supervisor?.stop(); await local?.close(); await ownership.release(); process.exitCode = 0; }
    catch { process.exitCode = 1; } // Unproven child cleanup deliberately retains ownership.
  };
  process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
  try {
    supervisor = new ChildSupervisor({
      beforeStart: async () => {
        check(!await exists(join(root, '.install-lock')), 'INSTALL_IN_PROGRESS');
        await reconcileHostOwnership(join(root, 'runtime'), { recoverStale: true });
        const { validateProductionInstallation } = await env.release.load('host/process');
        await validateProductionInstallation(root, env.release.releaseRoot);
      },
      createChild: () => fork(join(env.release.releaseRoot, 'dist/src/host/process.js'), ['run', '--installation-root', root], {
        cwd: env.release.releaseRoot, execPath: process.execPath, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS','NODE_PATH'].includes(key))),
      }),
    });
    const { listenDurableLocal } = await env.release.load('runtime/core/local-server');
    local = await listenDurableLocal(env.socketPath, [{ token: (await env.configuration.readPrivateFile(env.config.local.credentialFile, 128)).trim(),
      principal: { id: env.config.local.principalId, osUid: process.getuid(), credentialId: env.config.local.credentialId, authenticatedAt: Date.now() } }], {
      dispatch: async request => {
        if (!request || Object.keys(request).length !== 1 || !['status', 'stop'].includes(request.command)) return { ok: false };
        if (request.command === 'stop') setTimeout(() => void close(), 25);
        return { ok: true, state: { ...supervisor.state, managerPid: process.pid, bootPersistence: 'not-established-by-detached-supervision' } };
      },
    });
    await supervisor.start();
  } catch (error) { await close(); throw error; }
}

async function installUserService(root) {
  check(process.platform === 'linux', 'USER_SERVICE_REQUIRES_LINUX');
  const env = await environment(root);
  await execute('systemctl', ['--user', 'show-environment'], { timeout: 5000, maxBuffer: 65536 }).catch(() => { throw new Error('USER_SERVICE_MANAGER_UNAVAILABLE'); });
  try { await control(root, 'status'); throw new Error('STOP_SUPERVISOR_BEFORE_INSTALL'); }
  catch (error) { if (error.message === 'STOP_SUPERVISOR_BEFORE_INSTALL') throw error; }
  const directory = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd', 'user');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory); check(stat.isDirectory() && stat.uid === process.getuid?.() && await realpath(directory) === resolve(directory), 'UNSAFE_USER_SERVICE_DIRECTORY');
  const quote = value => { check(/^[A-Za-z0-9_./ -]+$/.test(value), 'UNSUPPORTED_SERVICE_PATH'); return '"' + value + '"'; };
  const unitName = 'photon-imessage-' + createHash('sha256').update(root).digest('hex').slice(0, 12) + '.service';
  const unit = '[Unit]\nDescription=Photon hosted iMessage runtime\nStartLimitIntervalSec=300\nStartLimitBurst=5\n\n[Service]\nType=simple\nUMask=0077\nWorkingDirectory=' + quote(env.release.releaseRoot) + '\nExecStart=' + quote(process.execPath) + ' ' + quote(join(env.release.releaseRoot, 'scratch-setup/service.mjs')) + ' run --root ' + quote(root) + '\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=15\nKillMode=control-group\n\n[Install]\nWantedBy=default.target\n';
  const path = join(directory, unitName);
  if (await exists(path)) { const s = await lstat(path); check(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid?.() && await readFile(path, 'utf8') === unit, 'EXISTING_USER_SERVICE_REQUIRES_REVIEW'); }
  else await privateWrite(path, unit);
  await execute('systemctl', ['--user', 'daemon-reload'], { timeout: 10000 });
  await execute('systemctl', ['--user', 'enable', '--now', unitName], { timeout: 15000 });
  await execute('systemctl', ['--user', 'is-active', unitName], { timeout: 5000 });
  return { unit: unitName, enabled: true, bootPersistence: 'depends-on-host-user-manager-and-VM-lifecycle', next: 'service-status' };
}

export async function serviceCommand(command, root) {
  if (command === 'install-user-service') return installUserService(root);
  if (command === 'service-status') return control(root, 'status');
  if (command === 'stop' || command === 'restart') {
    await control(root, 'stop');
    for (let i = 0; i < 100; i++) { if (!await exists(join(root, 'runtime/supervisor/host.lock'))) break; await delay(100); }
    check(!await exists(join(root, 'runtime/supervisor/host.lock')), 'SUPERVISOR_STOP_UNVERIFIED');
    if (command === 'stop') return { status: 'stopped' };
  }
  check(command === 'start' || command === 'restart', 'INVALID_SERVICE_COMMAND');
  try { const state = await control(root, 'status'); return { ...state, reused: true }; }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code) && error.message !== 'SUPERVISOR_UNAVAILABLE') throw error; }
  const env = await environment(root);
  const { reconcileHostOwnership } = await env.release.load('host/owner-lock');
  await reconcileHostOwnership(env.directory, { recoverStale: true });
  const child = spawn(process.execPath, [join(env.release.releaseRoot, 'scratch-setup/service.mjs'), 'run', '--root', root], {
    cwd: env.release.releaseRoot, detached: true, stdio: 'ignore', shell: false,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS','NODE_PATH'].includes(key))),
  });
  let spawnError = false; child.once('error', () => { spawnError = true; }); child.unref();
  let last;
  for (let i = 0; i < 150 && !spawnError; i++) {
    await delay(100);
    try { last = await control(root, 'status'); if (last.ready || last.status === 'failed') return last; } catch {}
  }
  if (last) return last; throw new Error('SUPERVISOR_START_UNVERIFIED');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const { command, root, options } = parseArgs(process.argv.slice(2)); only(options, []); check(command === 'run', 'INVALID_SERVICE_COMMAND'); await runManager(root); }
  catch (error) { console.error(errorCode(error)); process.exitCode = 1; }
}
