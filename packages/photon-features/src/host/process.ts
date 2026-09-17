#!/usr/bin/env node
import { configurationBlockers } from "./configuration-inventory.js";
import { z } from "zod";
import { administerAuthority, inspectAuthority } from "./authority-admin.js";
import { constants, realpathSync } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireHostOwnership, reconcileHostOwnership } from "./owner-lock.js";
import {
  loadNormalizedHostConfiguration,
  readPrivateFile,
  readConfiguredProjectSecret,
  writeActivation,
} from "./configuration.js";
import { createProductionComposition, type ProductionCompositionDependencies } from "./production.js";
import { validateInitialConversationPrerequisites, resolveInitialConversation, activationAfterValidationRequested } from "./initial-conversation.js";
import { SpectrumOwner, cloudSdkFactory } from "../adapters/transport/spectrum-owner.js";
import { ProviderContext } from "../adapters/transport/provider-context.js";
import { discoverGrokCommandStyle, type GrokHelpInspector } from "./grok-wake.js";
import { supervisorGuidance } from "./supervisor.js";
import { assertSelectedRelease } from "./selected-release.js";
import { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import { bootstrapOrValidateAuthority, configuredAuthority } from "./authority.js";

type HostCommand = "validate" | "enable" | "disable" | "run" | "setup" | "supervisor" | "reconcile" | "recover-stale";

function parse(argv: readonly string[]): { command: HostCommand; root: string; activateAfterValidation: boolean | undefined } {
  const [command, flag, root, ...extra] = argv;
  if (!(["validate", "enable", "disable", "run", "setup", "supervisor", "reconcile", "recover-stale"] as const).includes(command as HostCommand) ||
    flag !== "--installation-root" || !root || (extra.length > 0 &&
      !(command === "setup" && extra.length === 1 && extra[0] === "--activate-after-validation")))
    throw new Error("USAGE_COMMAND_INSTALLATION_ROOT");
  return { command: command as HostCommand, root: resolve(root), activateAfterValidation: extra.length === 1 ? true : undefined };
}

export async function validateProductionInstallation(root: string, releaseRoot: string,
  dependencies: { grokHelpInspector?: GrokHelpInspector } = {}): Promise<{
  release: string;
  activation: "disabled" | "enabled";
  taskId: string;
  generation: number;
  operationBlockers: ReturnType<typeof configurationBlockers>;
}> {
  const selected = await assertSelectedRelease(root, releaseRoot);
  const configuration = await loadNormalizedHostConfiguration(root);
  const projectSecret = await readConfiguredProjectSecret(configuration);
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
  await validateInitialConversationPrerequisites(configuration, now);
  if (configuration.ownerModel === "installation-owner" && configuration.grok.commandStyle) {
    const style = await discoverGrokCommandStyle(executable, configuration.grok.timeoutMs, dependencies.grokHelpInspector);
    if (style !== configuration.grok.commandStyle) throw new Error("GROK_WAKE_COMMAND_STYLE_CHANGED");
  }
  if (configuration.provider.conversationId) {
  const authority = configuredAuthority(configuration);
  const store = new DurableSQLiteStore(configuration.runtime.statePath, () => now);
  try {
    bootstrapOrValidateAuthority(store, authority.context, authority.conversationId, now);
  } finally {
    store.close();
  }
  }
  return {
    release: selected.release,
    activation: configuration.activation,
    taskId: configuration.task.taskId,
    generation: configuration.task.generation,
    operationBlockers: configurationBlockers(configuration),
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

export async function changeProductionActivation(
  root: string,
  releaseRoot: string,
  activation: "disabled" | "enabled",
): Promise<"disabled" | "enabled"> {
  const selected = await assertSelectedRelease(root, releaseRoot);
  await requireInactive(root);
  const ownership = await acquireHostOwnership(join(root, "runtime"), selected.release);
  try {
    if (activation === "enabled") await validateProductionInstallation(root, releaseRoot);
    return (await writeActivation(root, activation)).activation;
  } finally { await ownership.release(); }
}

/** Caller authorization is carried once, explicitly. Validation never grants
 * activation by itself; start revalidates and acquires the same owner lock. */
export async function setupProductionInstallation(root: string, releaseRoot: string,
  options: { activateAfterValidation?: boolean } = {}) {
  const validated = await validateProductionInstallation(root, releaseRoot);
  const configuration = await loadNormalizedHostConfiguration(root);
  const activation = activationAfterValidationRequested(configuration, options.activateAfterValidation)
    ? await changeProductionActivation(root, releaseRoot, "enabled") : validated.activation;
  return { ...validated, activation, supervisor: supervisorGuidance(root, releaseRoot),
    start: () => runProductionHost(root, releaseRoot) };
}

/** Foreground lifecycle. Dependency injection is programmatic only, for offline
 * verification; installed CLI always constructs the production SDK owner. */
export async function runProductionHost(root: string, releaseRoot: string,
  dependencies: ProductionCompositionDependencies = {}): Promise<void> {
  const selected = await assertSelectedRelease(root, releaseRoot);
  const ownership = await acquireHostOwnership(join(root, "runtime"), selected.release);
  let initialOwner: SpectrumOwner | undefined;
  let cardBackend: { close(): Promise<void> } | undefined;
  let local: { close(): Promise<void> } | undefined;
  let composition: Awaited<ReturnType<typeof createProductionComposition>> | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  let startupCleanupFailure: unknown;
  let signalRequested = false;
  let resolveSignal!: () => void;
  const signal = new Promise<void>(resolveValue => { resolveSignal = resolveValue; });
  const requestStop = () => { signalRequested = true; resolveSignal(); };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
  const stop = async (): Promise<void> => {
    const failures: unknown[] = startupCleanupFailure ? [startupCleanupFailure] : [];
    if (cardBackend) try { await cardBackend.close(); } catch (error) { failures.push(error); }
    if (local) try { await local.close(); } catch (error) { failures.push(error); }
    if (composition) try { await composition.runtime.stop(); } catch (error) { failures.push(error); }
    if (initialOwner) try { await initialOwner.stop(); } catch (error) { failures.push(error); }
    // Failed cleanup retains ownership so a supervisor cannot create a second
    // owner while a provider or local interface might still be alive.
    if (!failures.length) try { await ownership.release(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "HOST_SHUTDOWN_FAILED");
  };
  try {
    const validated = await validateProductionInstallation(root, releaseRoot, dependencies);
    let configuration = await loadNormalizedHostConfiguration(root);
    if (validated.activation !== "enabled" || configuration.activation !== "enabled") throw new Error("ACTIVATION_REQUIRED");
    if (signalRequested) return;
    if (!configuration.provider.conversationId) {
      initialOwner = new SpectrumOwner(
        { inbound: "photon-stream", outbound: "imessage", wake: "existing-grok-task-handoff" },
        new ProviderContext(configuration.provider.projectId, [{ accountId: configuration.provider.accountId,
          lineId: configuration.provider.lineId, dedicated: configuration.provider.dedicated, servingPhone: configuration.provider.phone }]),
        dependencies.sdkFactory ?? cloudSdkFactory({ projectId: configuration.provider.projectId,
          projectSecret: await readConfiguredProjectSecret(configuration) }));
      await initialOwner.start();
      configuration = await resolveInitialConversation(root, configuration, initialOwner, ownership);
      if (signalRequested) return;
    }
    composition = await createProductionComposition(configuration, root, releaseRoot,
      { report: code => process.stderr.write(`grok-photon-host: ${code}\n`), ...dependencies,
        ...(initialOwner ? { startedOwner: initialOwner } : {}) });
    initialOwner = undefined; // Composition now owns cleanup of this same instance.
    try { await composition.runtime.start(); }
    catch (error) {
      // Runtime.start rolls back itself. Its aggregate includes the original
      // failure followed by cleanup failures; stop() on a failed runtime is inert.
      if (error instanceof AggregateError && error.message === "HOST_START_FAILED" && error.errors.length > 1)
        startupCleanupFailure = error;
      throw error;
    }
    if (signalRequested) return;
    cardBackend = await composition.startCardBackend();
    if (signalRequested) return;
    local = await composition.startLocalInterface();
    if (signalRequested) return;
    if (!composition.runtime.doctor().ready) throw new Error("HOST_LOST_READINESS");
    process.stdout.write(JSON.stringify({ version: 1, status: "ready", release: selected.release,
      taskId: configuration.task.taskId, generation: configuration.task.generation,
      socketPath: configuration.local.socketPath }) + "\n");
    await Promise.race([signal, new Promise<void>((_resolve, reject) => {
      monitor = setInterval(() => {
        if (!composition?.runtime.doctor().ready) {
          clearInterval(monitor);
          reject(new Error("HOST_LOST_READINESS"));
        }
      }, 1000);
    })]);
  } finally {
    clearInterval(monitor);
    try { await stop(); }
    finally {
      process.off("SIGINT", requestStop);
      process.off("SIGTERM", requestStop);
    }
  }
}

export async function processMain(
  argv: string[] = process.argv.slice(2),
  releaseRoot = fileURLToPath(new URL("../../../", import.meta.url)),
): Promise<number> {
  try {
    if (argv[0] === "authority.inspect") {
      const [, rootFlag, root, credentialFlag, credentialFile, ...extra] = argv;
      if (rootFlag !== "--installation-root" || !root || credentialFlag !== "--owner-credential-file" || !credentialFile || extra.length)
        throw new Error("INVALID_ADMIN_COMMAND");
      process.stdout.write(JSON.stringify({ version: 1, ...await inspectAuthority(resolve(root), releaseRoot, credentialFile) }) + "\n");
      return 0;
    }
    if (argv[0] === "authority.apply") {
      const [, rootFlag, root, requestFlag, requestFile, credentialFlag, credentialFile, ...extra] = argv;
      if (rootFlag !== "--installation-root" || !root || requestFlag !== "--request-file" || !requestFile ||
        credentialFlag !== "--owner-credential-file" || !credentialFile || extra.length) throw new Error("INVALID_ADMIN_COMMAND");
      process.stdout.write(JSON.stringify({ version: 1, ...await administerAuthority(resolve(root), releaseRoot, requestFile, credentialFile) }) + "\n");
      return 0;
    }
    const { command, root, activateAfterValidation } = parse(argv);
    if (command === "setup") {
      const { start: _start, ...result } = await setupProductionInstallation(root, releaseRoot, { activateAfterValidation });
      process.stdout.write(JSON.stringify({ version: 1, valid: true, ...result }) + "\n");
      return 0;
    }
    if (command === "supervisor") {
      await assertSelectedRelease(root, releaseRoot);
      process.stdout.write(JSON.stringify({ version: 1, ...supervisorGuidance(root, releaseRoot) }) + "\n");
      return 0;
    }
    if (command === "reconcile" || command === "recover-stale") {
      await assertSelectedRelease(root, releaseRoot);
      const result = await reconcileHostOwnership(join(root, "runtime"), { recoverStale: command === "recover-stale" });
      process.stdout.write(JSON.stringify({ version: 1, ...result }) + "\n");
      return 0;
    }
    if (command === "validate") {
      process.stdout.write(JSON.stringify({ version: 1, valid: true, ...await validateProductionInstallation(root, releaseRoot) }) + "\n");
      return 0;
    }
    if (command === "enable" || command === "disable") {
      const activation = await changeProductionActivation(root, releaseRoot, command === "enable" ? "enabled" : "disabled");
      process.stdout.write(JSON.stringify({ version: 1, activation }) + "\n");
      return 0;
    }
    await runProductionHost(root, releaseRoot);
    return 0;
  } catch (error) {
    if (error instanceof z.ZodError) {
      process.stderr.write("grok-photon-host: CONFIGURATION_INVALID " + error.issues.map(issue =>
        issue.path.map(String).join(".") + ": " + issue.message).join("; ") + "\n");
      return 1;
    }
    const message = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message : "HOST_FAILED";
    process.stderr.write(`grok-photon-host: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  process.exitCode = await processMain();
