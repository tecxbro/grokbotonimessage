import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SupervisorEnvironment {
  platform: NodeJS.Platform;
  container: boolean;
  systemd: boolean;
}

/** Detection is advisory only: never installs a service or changes OS users. */
export function detectSupervisorEnvironment(): SupervisorEnvironment {
  let init = "";
  try { init = readFileSync("/proc/1/comm", "utf8").trim(); } catch { /* not Linux procfs */ }
  return { platform: process.platform,
    container: existsSync("/.dockerenv") || existsSync("/run/.containerenv"),
    systemd: init === "systemd" || existsSync("/run/systemd/system") };
}

/** argv is authoritative; the quoted command is for a POSIX shell. Every
 * supervisor must run the foreground process as the installation's OS user. */
export function supervisorGuidance(root: string, releaseRoot: string,
  environment = detectSupervisorEnvironment()) {
  const argv = [process.execPath, join(resolve(releaseRoot), "dist/src/host/process.js"),
    "run", "--installation-root", resolve(root)];
  const manager = environment.container ? "container" : environment.platform === "darwin" ? "launchd" :
    environment.platform === "linux" && environment.systemd ? "systemd-user" : "portable";
  const instructions = {
    container: "Use this argv as the container foreground command with a restart policy. Persist the entire installation runtime directory on a volume with the same UID.",
    launchd: "Use this argv as ProgramArguments in a per-user LaunchAgent with RunAtLoad and KeepAlive. Restart through launchctl after graceful shutdown.",
    "systemd-user": "Use this command as ExecStart in a user service with Restart=on-failure and RestartSec=5. For boot persistence, arrange a persistent user manager. Restart through systemctl --user.",
    portable: "Configure the VM's user-level process supervisor to run this argv in the foreground and restart on failure with a delay. Stop with SIGTERM, wait for exit, then start the same command.",
  };
  return { manager, argv, command: argv.map(value => "'" + value.replaceAll("'", "'\\''") + "'").join(" "),
    uid: process.getuid?.(), statePath: join(resolve(root), "runtime/state.sqlite"),
    stopSignal: "SIGTERM", restartDelaySeconds: 5,
    instructions: instructions[manager],
    recovery: "Startup never removes stale ownership. Run reconcile, then recover-stale explicitly if ownership is provably dead. Preserve the database and all runtime credentials; never run a second owner." };
}
