#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { main as clientMain } from "../cli/main.js";
import { loadProductionHostConfiguration } from "./configuration.js";
import { assertSelectedRelease } from "./selected-release.js";

export async function taskLauncherMain(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout,
  stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr,
  releaseRoot = fileURLToPath(new URL("../../../", import.meta.url)),
): Promise<number> {
  try {
    const [rootFlag, root, taskFlag, taskId, generationFlag, generationValue, ...command] = argv;
    if (rootFlag !== "--installation-root" || !root || taskFlag !== "--task-id" || !taskId ||
      generationFlag !== "--generation" || !generationValue || !/^\d+$/.test(generationValue) || !command.length)
      throw new Error("INVALID_TASK_LAUNCH");
    const selected = await assertSelectedRelease(root, releaseRoot);
    const config = await loadProductionHostConfiguration(root);
    const generation = Number(generationValue);
    const now = Date.now();
    if (config.activation !== "enabled" || config.task.taskId !== taskId || config.task.generation !== generation ||
      config.task.issuedAt > now || config.task.expiresAt <= now) throw new Error("STALE_TASK_BINDING");
    return clientMain(command, {
      ...env,
      PATH: `${selected.releaseRoot}/bin${env.PATH ? `:${env.PATH}` : ""}`,
      GROK_PHOTON_CONTEXT_ID: config.task.contextId,
      GROK_PHOTON_SOCKET: config.local.socketPath,
      GROK_PHOTON_CREDENTIAL_FILE: config.local.credentialFile,
    }, stdin, stdout, stderr);
  } catch {
    stdout.write(JSON.stringify({ version: 1, ok: false, error: { code: "INVALID_CONFIGURATION" } }) + "\n");
    stderr.write("grok-photon-task: INVALID_CONFIGURATION\n");
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  process.exitCode = await taskLauncherMain();
