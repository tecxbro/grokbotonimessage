#!/usr/bin/env node
import { constants, realpathSync } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireHostOwnership } from "./owner-lock.js";
import {
  loadProductionHostConfiguration,
  readPrivateFile,
  writeActivation,
} from "./configuration.js";
import { createProductionComposition } from "./production.js";
import { assertSelectedRelease } from "./selected-release.js";

type HostCommand = "validate" | "enable" | "disable" | "run";

function parse(argv: readonly string[]): { command: HostCommand; root: string } {
  const [command, flag, root, ...extra] = argv;
  if (!(["validate", "enable", "disable", "run"] as const).includes(command as HostCommand) ||
    flag !== "--installation-root" || !root || extra.length)
    throw new Error("USAGE_COMMAND_INSTALLATION_ROOT");
  return { command: command as HostCommand, root: resolve(root) };
}

export async function validateProductionInstallation(root: string, releaseRoot: string): Promise<{
  release: string;
  activation: "disabled" | "enabled";
  taskId: string;
  generation: number;
}> {
  const selected = await assertSelectedRelease(root, releaseRoot);
  const configuration = await loadProductionHostConfiguration(root);
  const projectSecret = (await readPrivateFile(configuration.provider.projectSecretFile, 16 * 1024)).trim();
  const localToken = (await readPrivateFile(configuration.local.credentialFile, 128)).trim();
  if (!projectSecret || projectSecret.length > 8192) throw new Error("INVALID_PROJECT_SECRET");
  if (!/^[a-fA-F0-9]{64}$/.test(localToken)) throw new Error("INVALID_LOCAL_CREDENTIAL");
  const executable = await realpath(configuration.grok.executable);
  const stat = await lstat(executable);
  if (!stat.isFile()) throw new Error("INVALID_GROK_EXECUTABLE");
  await access(executable, constants.X_OK);
  const now = Date.now();
  if (configuration.task.issuedAt > now || configuration.task.expiresAt <= now)
    throw new Error("EXPIRED_TASK_BINDING");
  return {
    release: selected.release,
    activation: configuration.activation,
    taskId: configuration.task.taskId,
    generation: configuration.task.generation,
  };
}

async function requireInactive(root: string): Promise<void> {
  for (const name of ["host.lock", "runtime.sock"]) {
    try {
      await lstat(join(root, "runtime", name));
      throw new Error("HOST_MUST_BE_STOPPED");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function runProductionHost(root: string, releaseRoot: string): Promise<void> {
  const validated = await validateProductionInstallation(root, releaseRoot);
  const selected = await assertSelectedRelease(root, releaseRoot);
  const configuration = await loadProductionHostConfiguration(root);
  if (validated.activation !== "enabled" || configuration.activation !== "enabled") throw new Error("ACTIVATION_REQUIRED");
  const ownership = await acquireHostOwnership(join(root, "runtime"), selected.release);
  let local: { close(): Promise<void> } | undefined;
  let composition: Awaited<ReturnType<typeof createProductionComposition>> | undefined;
  let started = false;
  let signalRequested = false;
  let resolveSignal!: () => void;
  const signal = new Promise<void>(resolveValue => { resolveSignal = resolveValue; });
  const requestStop = () => { signalRequested = true; resolveSignal(); };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  const stop = async (): Promise<void> => {
    const failures: unknown[] = [];
    if (local) try { await local.close(); } catch (error) { failures.push(error); }
    if (started && composition) try { await composition.runtime.stop(); } catch (error) { failures.push(error); }
    try { await ownership.release(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "HOST_SHUTDOWN_FAILED");
  };
  try {
    composition = await createProductionComposition(configuration, root, releaseRoot,
      { report: code => process.stderr.write(`grok-photon-host: ${code}\n`) });
    await composition.runtime.start();
    started = true;
    if (signalRequested) return;
    local = await composition.startLocalInterface();
    process.stdout.write(JSON.stringify({ version: 1, status: "ready", release: selected.release,
      taskId: configuration.task.taskId, generation: configuration.task.generation,
      socketPath: configuration.local.socketPath }) + "\n");
    await Promise.race([signal, new Promise<void>((_resolve, reject) => {
      const monitor = setInterval(() => {
        if (!composition?.runtime.doctor().ready) {
          clearInterval(monitor);
          reject(new Error("HOST_LOST_READINESS"));
        }
      }, 1000);
      monitor.unref();
      signal.finally(() => clearInterval(monitor)).catch(() => undefined);
    })]);
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
    await stop();
  }
}

export async function processMain(
  argv: string[] = process.argv.slice(2),
  releaseRoot = fileURLToPath(new URL("../../../", import.meta.url)),
): Promise<number> {
  try {
    const { command, root } = parse(argv);
    if (command === "validate") {
      process.stdout.write(JSON.stringify({ version: 1, valid: true, ...await validateProductionInstallation(root, releaseRoot) }) + "\n");
      return 0;
    }
    await assertSelectedRelease(root, releaseRoot);
    if (command === "enable" || command === "disable") {
      await requireInactive(root);
      if (command === "enable") await validateProductionInstallation(root, releaseRoot);
      const configuration = await writeActivation(root, command === "enable" ? "enabled" : "disabled");
      process.stdout.write(JSON.stringify({ version: 1, activation: configuration.activation }) + "\n");
      return 0;
    }
    await runProductionHost(root, releaseRoot);
    return 0;
  } catch (error) {
    const message = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message : "HOST_FAILED";
    process.stderr.write(`grok-photon-host: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  process.exitCode = await processMain();
