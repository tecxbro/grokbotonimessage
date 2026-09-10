import { spawnSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { verifyLane, validateTestResult } from "./verify-lane.mjs";
import { verifyWorktree } from "./verify-worktree.mjs";

const root = process.cwd();
const branch = execFileSync("git", ["-C", root, "branch", "--show-current"], {
  encoding: "utf8",
}).trim();

function run(name, command, args, tests = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 360_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0 || result.error) throw new Error(`${name}:COMMAND_FAILED`);
  const count = tests ? validateTestResult(result) : undefined;
  console.log(`${name}: PASS${count ? ` (${count} tests)` : ""}`);
  return result;
}

try {
  if (branch !== "photon-v3/integration") {
    verifyLane(root, "wt-00");
    if (process.argv.includes("--mode=f0"))
      console.log("F0 passed; assembled product, installation and live verification excluded.");
    else throw new Error("INTEGRATION_WORKTREE_REQUIRED");
  } else {
    const identity = verifyWorktree(root, "integration");
    console.log(`worktree: PASS (${identity.path})`);
    run("existing-cli", "npm", ["test"], true);
    run("foundation", "npm", ["run", "photon:test"], true);
    run("schema-drift", "npm", ["run", "photon:check"]);
    run("assembled-integration", "npm", ["run", "photon:test:integration"], true);
    run("skill-drift", process.execPath, ["packages/photon-features/scripts/generate-skill.mjs", "--check"]);
    run("ownership", process.execPath, ["scripts/verify-ownership.mjs", "integration"]);
    run("docs", process.execPath, ["scripts/verify-docs.mjs", "integration"]);
    const packed = run("package-dry-run", "npm", ["pack", "--workspace=@grokbot/photon-features", "--dry-run", "--json", "--ignore-scripts"]);
    const files = JSON.parse(packed.stdout)[0]?.files?.map(file => file.path) ?? [];
    for (const required of ["dist/src/host/main.js", "dist/src/integration/assembly.js", "dist/src/cli/main.js", "schemas/action.schema.json", "src/state/migrations/0001-initial.sql"])
      if (!files.includes(required)) throw new Error(`PACKAGE_INCOMPLETE:${required}`);
    if (!existsSync("packages/photon-features/dist/tests/integration/assembly.test.js"))
      throw new Error("ASSEMBLY_TEST_MISSING");
    console.log("assembled-local: PASS; installed/activated: NO; live verification: NOT AUTHORIZED");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
