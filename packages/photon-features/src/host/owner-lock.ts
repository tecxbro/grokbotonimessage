import { randomUUID } from "node:crypto";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";
import { assertPrivateDirectory, readPrivateFile } from "./configuration.js";

async function absent(path: string, code: string): Promise<void> {
  try { await lstat(path); throw new Error(code); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export interface HostOwnership {
  path: string;
  release(): Promise<void>;
}

/** O_EXCL ownership is intentionally conservative: a stale lock requires an
 * operator to verify process identity before recovery; startup never deletes it. */
export async function acquireHostOwnership(runtimeDirectory: string, release: string): Promise<HostOwnership> {
  await assertPrivateDirectory(runtimeDirectory);
  await absent(join(runtimeDirectory, "..", ".install-lock"), "INSTALL_IN_PROGRESS");
  await absent(join(runtimeDirectory, ".recovery-lock"), "RECOVERY_IN_PROGRESS");
  await absent(join(runtimeDirectory, "runtime.sock"), "SOCKET_PATH_EXISTS");
  const path = join(runtimeDirectory, "host.lock");
  const nonce = randomUUID();
  const body = JSON.stringify({
    version: 1,
    pid: process.pid,
    uid: process.getuid?.(),
    release,
    nonce,
    startedAt: Date.now(),
  }) + "\n";
  const file = await open(path, "wx", 0o600).catch(() => { throw new Error("HOST_OWNER_EXISTS"); });
  try {
    // Close the check/create race against an explicit local recovery command.
    await absent(join(runtimeDirectory, ".recovery-lock"), "RECOVERY_IN_PROGRESS");
    await file.writeFile(body); await file.sync();
  }
  catch (error) { await file.close(); await unlink(path).catch(() => undefined); throw error; }
  await file.close();
  const directory = await open(runtimeDirectory, "r");
  try { await directory.sync(); } finally { await directory.close(); }
  let released = false;
  return {
    path,
    release: async () => {
      if (released) return;
      const current = await readFile(path, "utf8").catch(() => "");
      if (current !== body) throw new Error("HOST_OWNERSHIP_CHANGED");
      await unlink(path);
      const parent = await open(runtimeDirectory, "r");
      try { await parent.sync(); } finally { await parent.close(); }
      released = true;
    },
  };
}

interface OwnerRecord {
  version: 1;
  pid: number;
  uid: number;
  release: string;
  nonce: string;
  startedAt: number;
}

function liveness(pid: number): "live" | "dead" | "unknown" {
  try { process.kill(pid, 0); return "live"; }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown";
  }
}

async function socketLiveness(path: string): Promise<"live" | "dead" | "unknown"> {
  return new Promise(resolve => {
    const socket = createConnection(path);
    const done = (state: "live" | "dead" | "unknown") => { socket.destroy(); resolve(state); };
    socket.once("connect", () => done("live"));
    socket.once("error", error => done((error as NodeJS.ErrnoException).code === "ECONNREFUSED" ? "dead" : "unknown"));
    socket.setTimeout(1000, () => done("unknown"));
  });
}

async function optionalStat(path: string) {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; }
}

/** Read-only by default. Only the explicit local recovery command may remove a
 * well-formed same-user dead owner's artifacts. Unknown PID identity, EPERM,
 * orphan sockets and malformed locks fail closed; PID reuse counts as live.
 * This serializes cooperating host/recovery processes, not hostile same-user edits. */
export async function reconcileHostOwnership(runtimeDirectory: string,
  options: { recoverStale?: boolean } = {}) {
  await assertPrivateDirectory(runtimeDirectory);
  await absent(join(runtimeDirectory, "..", ".install-lock"), "INSTALL_IN_PROGRESS");
  const lockPath = join(runtimeDirectory, "host.lock"), socketPath = join(runtimeDirectory, "runtime.sock");
  const guardPath = join(runtimeDirectory, ".recovery-lock");
  const guard = options.recoverStale ? await open(guardPath, "wx", 0o600)
    .catch(() => { throw new Error("RECOVERY_IN_PROGRESS"); }) : undefined;
  try {
    const lock = await optionalStat(lockPath), socket = await optionalStat(socketPath);
    const result = (status: "absent" | "live" | "stale" | "unknown" | "recovered", pid?: number) =>
      ({ status, pid, lockPresent: !!lock, socketPresent: !!socket,
        recoveryRequired: status === "stale", recoveryCommand: "recover-stale" });
    if (!lock) {
      if (socket && options.recoverStale) throw new Error("STALE_OWNERSHIP_UNPROVEN");
      return result(socket ? "unknown" : "absent");
    }
    let body: string, owner: OwnerRecord;
    try {
      body = await readPrivateFile(lockPath);
      owner = JSON.parse(body);
      if (!owner || owner.version !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
        owner.uid !== process.getuid?.() || typeof owner.release !== "string" ||
        typeof owner.nonce !== "string" || !owner.nonce || !Number.isFinite(owner.startedAt)) throw new Error();
    } catch {
      if (options.recoverStale) throw new Error("STALE_OWNERSHIP_UNPROVEN");
      return result("unknown");
    }
    const status = liveness(owner.pid);
    const socketState = !socket ? "dead" : socket.isSocket() && socket.uid === owner.uid
      ? await socketLiveness(socketPath) : "unknown";
    const stale = status === "dead" && socketState === "dead";
    if (!options.recoverStale) return result(status === "live" || socketState === "live" ? "live" : stale ? "stale" : "unknown", owner.pid);
    if (!stale) throw new Error(status === "live" || socketState === "live" ? "HOST_OWNER_LIVE" : "STALE_OWNERSHIP_UNPROVEN");
    const unchanged = async (path: string, before: NonNullable<Awaited<ReturnType<typeof optionalStat>>>) => {
      const current = await optionalStat(path);
      if (!current || current.dev !== before.dev || current.ino !== before.ino || current.mtimeMs !== before.mtimeMs)
        throw new Error("HOST_OWNERSHIP_CHANGED");
    };
    await unchanged(lockPath, lock);
    if (await readPrivateFile(lockPath) !== body || liveness(owner.pid) !== "dead") throw new Error("HOST_OWNERSHIP_CHANGED");
    if (socket) {
      await unchanged(socketPath, socket);
      if (await socketLiveness(socketPath) !== "dead") throw new Error("HOST_OWNERSHIP_CHANGED");
      await unlink(socketPath);
    }
    await unchanged(lockPath, lock);
    if (liveness(owner.pid) !== "dead") throw new Error("HOST_OWNER_LIVE");
    await unlink(lockPath);
    const directory = await open(runtimeDirectory, "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return { ...result("recovered", owner.pid), lockPresent: false, socketPresent: false };
  } finally {
    if (guard) { await guard.close(); await unlink(guardPath); }
  }
}
