import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExistingGrokTaskHandoff } from "../adapters/legacy/index.js";

const executeFile = promisify(execFile);
const shellWord = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

export interface GrokWakeBinding {
  executable: string;
  agentId: string;
  taskId: string;
  generation: number;
  installationRoot: string;
  releaseRoot: string;
  timeoutMs: number;
}

export type GrokCommandRunner = (
  executable: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<"accepted" | "failed" | "unknown">;

export const runGrokCommand: GrokCommandRunner = async (executable, args, timeoutMs) => {
  try {
    await executeFile(executable, [...args], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return "accepted";
  } catch (error) {
    const uncertain = error !== null && typeof error === "object" &&
      (("killed" in error && error.killed === true) || ("signal" in error && error.signal !== undefined));
    return uncertain ? "unknown" : "failed";
  }
};

/** Pointer-only binding to the existing Grok gateway. The prompt contains no
 * message body, provider secret, local credential, or arbitrary shell text. */
export class GrokGatewayTaskHandoff implements ExistingGrokTaskHandoff {
  constructor(
    private readonly binding: GrokWakeBinding,
    private readonly run: GrokCommandRunner = runGrokCommand,
  ) {}

  async notifyExistingTask(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): Promise<"accepted" | "failed" | "unknown"> {
    if (pointer.taskId !== this.binding.taskId || pointer.generation !== this.binding.generation)
      return "failed";
    const launcher = `${this.binding.releaseRoot}/bin/grok-photon-task`;
    const skill = `${this.binding.releaseRoot}/SKILL.md`;
    const prompt = [
      "A durable Photon iMessage handoff is ready. This notification is a pointer only; it contains no message content.",
      `Load and follow the release-pinned operating skill at ${skill}.`,
      `Retrieve and claim handoff ${pointer.handoffId} for task ${pointer.taskId} generation ${pointer.generation} with:`,
      `${shellWord(launcher)} --installation-root ${shellWord(this.binding.installationRoot)} --task-id ${shellWord(pointer.taskId)} --generation ${pointer.generation} work.claim --handoff-id ${shellWord(pointer.handoffId)} --lease-ms 30000 --json`,
      "Persist acceptance by handoff ID before acknowledging it. Use the same launcher for heartbeat, ack, and any resulting operation.",
    ].join("\n");
    return this.run(
      this.binding.executable,
      ["--gateway", "send", this.binding.agentId, prompt],
      this.binding.timeoutMs,
    );
  }
}
