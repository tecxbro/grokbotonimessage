import { randomUUID } from "node:crypto";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { assertPrivateDirectory } from "./configuration.js";

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
  try { await file.writeFile(body); await file.sync(); }
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
