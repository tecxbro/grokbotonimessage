import { chmod, lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

// Conservative across Darwin/Linux sockaddr_un limits, including the final
// production runtime/runtime.sock suffix and terminating byte.
export const MAX_TEST_SOCKET_PATH_BYTES = 100;

export async function privateTestRoot(
  test: TestContext,
  prefix = "gp-",
  base = process.env.PHOTON_TEST_TMPDIR ?? tmpdir(),
): Promise<string> {
  const canonicalBase = await realpath(base);
  const root = await mkdtemp(join(canonicalBase, prefix));
  test.after(async () => { await rm(root, { recursive: true, force: true }); });
  await chmod(root, 0o700);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700)
    throw new Error("PRIVATE_TEST_DIRECTORY_REQUIRED");
  const socket = join(root, "runtime", "runtime.sock");
  if (Buffer.byteLength(socket) > MAX_TEST_SOCKET_PATH_BYTES)
    throw new Error("TEST_SOCKET_PATH_TOO_LONG");
  return root;
}
