import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { assertPrivateDirectory, readPrivateFile } from "./configuration.js";

export interface SelectedRelease {
  release: string;
  releaseRoot: string;
  skillPath: string;
  skillSha256: string;
}

/** Bind the running host/task launcher to the immutable selected release. */
export async function assertSelectedRelease(root: string, executingReleaseRoot: string): Promise<SelectedRelease> {
  root = resolve(root);
  const releaseRoot = await realpath(executingReleaseRoot);
  await assertPrivateDirectory(releaseRoot);
  const selected = JSON.parse(await readPrivateFile(join(root, "selected-release.json"), 4096)) as unknown;
  if (!selected || typeof selected !== "object" || Array.isArray(selected) ||
    Object.keys(selected).sort().join() !== "activation,release,version" ||
    !(/^[a-f0-9]{64}$/.test(String((selected as { release?: unknown }).release))) ||
    (selected as { version?: unknown }).version !== 1 || (selected as { activation?: unknown }).activation !== "disabled")
    throw new Error("INVALID_RELEASE_POINTER");
  const release = String((selected as { release: string }).release);
  const expected = await realpath(join(root, "releases", release));
  if (expected !== releaseRoot || basename(releaseRoot) !== release) throw new Error("SELECTED_RELEASE_MISMATCH");
  const manifest = JSON.parse(await readPrivateFile(join(releaseRoot, "release-manifest.json"), 16 * 1024 * 1024)) as {
    checksum?: unknown;
    files?: { path?: unknown; sha256?: unknown }[];
  };
  if (manifest.checksum !== release || !Array.isArray(manifest.files)) throw new Error("INVALID_RELEASE_MANIFEST");
  const skill = manifest.files.find(file => file.path === "SKILL.md");
  if (!skill || typeof skill.sha256 !== "string") throw new Error("SKILL_NOT_IN_RELEASE");
  const skillPath = join(releaseRoot, "SKILL.md");
  const skillSha256 = createHash("sha256").update(await readFile(skillPath)).digest("hex");
  if (skillSha256 !== skill.sha256) throw new Error("INSTALLED_SKILL_MODIFIED");
  return { release, releaseRoot, skillPath, skillSha256 };
}
