import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExistingGrokTaskHandoff } from "../adapters/legacy/index.js";

const executeFile = promisify(execFile);
const shellWord = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

export type GrokCommandStyle = "gateway-flag" | "gateway-subcommand";

export interface GrokWakeBinding {
  executable: string;
  agentId: string;
  taskId: string;
  generation: number;
  installationRoot: string;
  releaseRoot: string;
  timeoutMs: number;
  /** Verified deployment binding; otherwise non-sending help inspection is cached. */
  commandStyle?: GrokCommandStyle;
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
    const output = error !== null && typeof error === "object"
      ? ["stdout", "stderr"].map(key => key in error ? String((error as Record<string, unknown>)[key]) : "").join("\n")
      : "";
    if (/\b(?:agent|target)\b[^\n]{0,160}\b(?:not found|does not exist|deleted|unknown)\b|\b(?:unknown|no such) (?:agent|target)\b/i.test(output))
      throw new Error("GROK_WAKE_TARGET_UNAVAILABLE");
    const uncertain = error !== null && typeof error === "object" &&
      (("killed" in error && error.killed === true) || ("signal" in error && error.signal != null));
    return uncertain ? "unknown" : "failed";
  }
};

/** Inspect help only. The runner is separate from the sending runner so syntax
 * discovery can never send a real pointer as a probe. */
export type GrokHelpInspector = (
  executable: string, args: readonly string[], timeoutMs: number,
) => Promise<string>;

export const inspectGrokHelp: GrokHelpInspector = async (executable, args, timeoutMs) => {
  const result = await executeFile(executable, [...args], {
    timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  return `${result.stdout}\n${result.stderr}`;
};

/** Fail closed on missing/ambiguous help; deployment may inject a verified style.
 * Never infer syntax from a version number or retry a send using another style. */
export async function discoverGrokCommandStyle(
  executable: string, timeoutMs: number, inspect: GrokHelpInspector = inspectGrokHelp,
): Promise<GrokCommandStyle> {
  try {
    const help = await inspect(executable, ["--help"], timeoutMs);
    const flag = /(?:^|\s)--gateway(?=\s|[=,]|$)/m.test(help);
    const subcommand = /(?:^|\n)\s*gateway(?:\s|$)|\b(?:gbot|grok-bot)\s+gateway\s/m.test(help);
    if (flag === subcommand) throw new Error("AMBIGUOUS_GATEWAY_HELP");
    const prefix = flag ? "--gateway" : "gateway";
    const gatewayHelp = await inspect(executable, [prefix, "--help"], timeoutMs);
    if (!/(?:^|\n)\s*send(?:\s|$)|(?:--gateway|\bgateway)\s+send\b/m.test(gatewayHelp))
      throw new Error("MISSING_GATEWAY_SEND_HELP");
    return flag ? "gateway-flag" : "gateway-subcommand";
  } catch {
    throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
  }
}

/** Pointer-only binding to the existing Grok gateway. The prompt contains no
 * message body, provider secret, local credential, or arbitrary shell text. */
export class GrokGatewayTaskHandoff implements ExistingGrokTaskHandoff {
  private commandStyle?: Promise<GrokCommandStyle>;
  constructor(
    private readonly binding: GrokWakeBinding,
    private readonly run: GrokCommandRunner = runGrokCommand,
    private readonly inspect: GrokHelpInspector = inspectGrokHelp,
  ) {}

  async notifyExistingTask(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): Promise<"accepted" | "failed" | "unknown"> {
    if (pointer.taskId !== this.binding.taskId || pointer.generation !== this.binding.generation)
      return "failed";
    // Cache the promise (including rejection) so concurrent/repeated notifications
    // inspect once. A deployment binding change requires constructing a new adapter.
    const style = await (this.commandStyle ??= this.binding.commandStyle
      ? Promise.resolve(this.binding.commandStyle)
      : discoverGrokCommandStyle(this.binding.executable, this.binding.timeoutMs, this.inspect));
    if (style !== "gateway-flag" && style !== "gateway-subcommand")
      throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
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
      [style === "gateway-flag" ? "--gateway" : "gateway", "send", this.binding.agentId, prompt],
      this.binding.timeoutMs,
    );
  }
}
