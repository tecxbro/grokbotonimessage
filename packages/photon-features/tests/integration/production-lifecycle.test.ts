import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireHostOwnership } from "../../src/host/owner-lock.js";
import { loadProductionHostConfiguration, writeActivation } from "../../src/host/configuration.js";
import { validateProductionInstallation } from "../../src/host/process.js";
import { assertSelectedRelease } from "../../src/host/selected-release.js";

async function fixture() {
  const root = await mkdtemp("/private/tmp/grok-photon-lifecycle-");
  await chmod(root, 0o700);
  const runtime = join(root, "runtime"), releases = join(root, "releases");
  await mkdir(runtime, { mode: 0o700 });
  await mkdir(releases, { mode: 0o700 });
  await mkdir(join(runtime, "captures"), { mode: 0o700 });
  await mkdir(join(runtime, "staging"), { mode: 0o700 });
  const release = "b".repeat(64), releaseRoot = join(releases, release);
  await mkdir(releaseRoot, { mode: 0o700 });
  const skill = "release-pinned-skill\n";
  await writeFile(join(releaseRoot, "SKILL.md"), skill, { mode: 0o600 });
  await writeFile(join(releaseRoot, "release-manifest.json"), JSON.stringify({ checksum: release,
    files: [{ path: "SKILL.md", mode: 0o600,
      sha256: createHash("sha256").update(skill).digest("hex") }] }) + "\n", { mode: 0o600 });
  await writeFile(join(root, "selected-release.json"), JSON.stringify({ version: 1, release,
    activation: "disabled" }) + "\n", { mode: 0o600 });
  const secret = join(runtime, "project-secret"), credential = join(runtime, "local-token");
  await writeFile(secret, "project-secret\n", { mode: 0o600 });
  await writeFile(credential, "c".repeat(64) + "\n", { mode: 0o600 });
  const now = Date.now();
  await writeFile(join(runtime, "configuration.json"), JSON.stringify({ version: 2, activation: "disabled",
    provider: { kind: "spectrum-cloud-imessage", projectId: "project-1", projectSecretFile: secret,
      accountId: "account-1", lineId: "line-1", phone: "+15555550101",
      conversationId: "conversation-1", dedicated: true, availableOperations: ["text.send"] },
    local: { socketPath: join(runtime, "runtime.sock"), credentialFile: credential,
      principalId: "grok-photon", credentialId: "credential-1" },
    task: { contextId: "context-1", taskId: "task-1", generation: 1, permissions: ["text.send"],
      issuedAt: now - 1000, expiresAt: now + 60_000, grokAgentId: "agent-1" },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: { administrativeOperations: [], allowedRecipients: [], allowNativeContent: false },
    cards: [], runtime: { statePath: join(runtime, "state.sqlite"),
      captureDirectory: join(runtime, "captures"), stagingDirectory: join(runtime, "staging") } }) + "\n",
  { mode: 0o600 });
  return { root, runtime, release, releaseRoot, close: () => rm(root, { recursive: true, force: true }) };
}

test("selected release, strict configuration, explicit activation and exclusive host ownership fail closed", async () => {
  const f = await fixture();
  try {
    const selected = await assertSelectedRelease(f.root, f.releaseRoot);
    assert.equal(selected.release, f.release);
    assert.equal((await validateProductionInstallation(f.root, f.releaseRoot)).activation, "disabled");
    assert.equal((await writeActivation(f.root, "enabled")).activation, "enabled");
    assert.equal((await loadProductionHostConfiguration(f.root)).activation, "enabled");
    const owner = await acquireHostOwnership(f.runtime, f.release);
    await assert.rejects(acquireHostOwnership(f.runtime, f.release), /HOST_OWNER_EXISTS/);
    await owner.release();
    const replacement = await acquireHostOwnership(f.runtime, f.release);
    await replacement.release();
    await writeFile(join(f.releaseRoot, "SKILL.md"), "modified\n", { mode: 0o600 });
    await assert.rejects(assertSelectedRelease(f.root, f.releaseRoot), /INSTALLED_SKILL_MODIFIED/);
  } finally {
    await f.close();
  }
});
