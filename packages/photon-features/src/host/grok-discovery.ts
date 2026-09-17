import { spawn } from "node:child_process";

export interface CommandResult { exitCode: number; stdout: string; stderr?: string }
export interface DiscoveryProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Auth/help inspection only: bounded in-memory diagnostics, never normal output. */
  captureStderr?: boolean;
  /** Login only: forward both channels verbatim, retaining neither in memory. */
  stream?: (bytes: Buffer) => void;
}
export type DiscoveryRunner = (executable: string, args: string[]) => Promise<CommandResult>;

/** No shell, bounded capture, no child stderr in exceptions, and no automatic retries. */
export function runDiscoveryProcess(executable: string, args: string[], options: DiscoveryProcessOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("SETUP_CANCELLED")); return; }
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [], errors: Buffer[] = [];
    let size = 0, failure: string | undefined;
    const stop = (code: string) => { failure ??= code; child.kill("SIGKILL"); };
    const abort = () => stop("SETUP_CANCELLED");
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("SETUP_PROCESS_TIMEOUT"), options.timeoutMs ?? 30_000);
    child.stdout.on("data", (bytes: Buffer) => {
      if (options.stream) { options.stream(bytes); return; }
      size += bytes.length;
      if (size > 2 * 1024 * 1024) stop("SETUP_OUTPUT_TOO_LARGE");
      else chunks.push(bytes);
    });
    child.stderr.on("data", (bytes: Buffer) => {
      if (options.stream) { options.stream(bytes); return; }
      if (options.captureStderr) {
        size += bytes.length;
        if (size > 2 * 1024 * 1024) stop("SETUP_OUTPUT_TOO_LARGE");
        else errors.push(bytes);
      }
    });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
    child.on("error", () => { cleanup(); reject(new Error("SETUP_PROCESS_FAILED")); });
    child.on("close", code => {
      cleanup();
      if (failure) reject(new Error(failure));
      else resolve({ exitCode: code ?? 1, stdout: Buffer.concat(chunks).toString("utf8"),
        ...(options.captureStderr ? { stderr: Buffer.concat(errors).toString("utf8") } : {}) });
    });
  });
}

/** Structurally compatible with RFX-02's resolver; no cross-lane import is needed. */
export type GrokCommandStyle = "gateway-flag" | "gateway-subcommand";
export type GrokCommandStyleResolver = (
  executable: string, timeoutMs: number,
  inspect: (executable: string, args: readonly string[], timeoutMs: number) => Promise<string>,
) => Promise<GrokCommandStyle>;

/** Compatibility implementation until composition injects RFX-02's shared resolver. */
export const inspectGrokCommandStyle: GrokCommandStyleResolver = async (executable, timeoutMs, inspect) => {
  const help = await inspect(executable, ["--help"], timeoutMs);
  const flag = /(?:^|\s)--gateway(?=\s|[=,]|$)/m.test(help);
  const subcommand = /(?:^|\n)\s*gateway(?:\s|$)|\b(?:gbot|grok-bot)\s+gateway\s/m.test(help);
  if (flag === subcommand) throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
  const gatewayHelp = await inspect(executable, [flag ? "--gateway" : "gateway", "--help"], timeoutMs);
  if (!/(?:^|\n)\s*send(?:\s|$)|(?:--gateway|\bgateway)\s+send\b/m.test(gatewayHelp))
    throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
  return flag ? "gateway-flag" : "gateway-subcommand";
};

export interface GrokAgentCandidate { id: string; name?: string }
export interface GrokDiscovery {
  executable: string | null;
  version: string | null;
  agentId: string | null;
  candidates: GrokAgentCandidate[];
  evidence: "live-gateway-roster" | null;
  commandStyle: GrokCommandStyle | null;
  commandStyleEvidence: "installed-cli-help" | null;
  unresolved: string[];
}

/** Only semver-like version text is returned; raw tool diagnostics are never exposed. */
export function commandVersion(text: string): string | null {
  return text.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0] ?? null;
}

/** Read-only discovery. Never consult profiles, invoke send, or fall back to files. */
export async function discoverGrok(executable: string | null, run: DiscoveryRunner, resolveStyle: GrokCommandStyleResolver = inspectGrokCommandStyle): Promise<GrokDiscovery> {
  const result: GrokDiscovery = { executable, version: null, agentId: null, candidates: [], evidence: null, commandStyle: null, commandStyleEvidence: null, unresolved: [] };
  if (!executable) { result.unresolved.push("grok.executable"); return result; }
  try {
    const version = await run(executable, ["--version"]);
    if (version.exitCode === 0) result.version = commandVersion(version.stdout);
    const help = await run(executable, ["--help"]);
    try {
      const inspected = new Set<string>();
      const style = await resolveStyle(executable, 30_000, async (path, args) => {
        // Even an injected resolver receives a help-only capability, never a send runner.
        if (path !== executable || !(args.length === 1 && args[0] === "--help" ||
          args.length === 2 && ["--gateway", "gateway"].includes(args[0]!) && args[1] === "--help"))
          throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
        const response = args.length === 1 ? help : await run(path, [...args]);
        if (response.exitCode !== 0) throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
        inspected.add(args.join(" "));
        return `${response.stdout}\n${response.stderr ?? ""}`;
      });
      if (style !== "gateway-flag" && style !== "gateway-subcommand") throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
      if (!inspected.has("--help") || !inspected.has(`${style === "gateway-flag" ? "--gateway" : "gateway"} --help`))
        throw new Error("GROK_WAKE_COMMAND_STYLE_UNAVAILABLE");
      result.commandStyle = style;
      result.commandStyleEvidence = "installed-cli-help";
    } catch { result.unresolved.push("grok.commandStyle"); }
    // This known adapter forces the live backend. Merely listing files is not live evidence.
    if (help.exitCode !== 0 || !/\bbots\s+list\b/.test(help.stdout) ||
      !/(?:^|\s)--gateway(?:\s|$)/m.test(help.stdout) || !/--json\b/.test(help.stdout)) {
      result.unresolved.push("grok.liveRosterUnsupported"); return result;
    }
    const roster = await run(executable, ["--gateway", "--json", "bots", "list"]);
    if (roster.exitCode !== 0) { result.unresolved.push("grok.liveRosterUnavailable"); return result; }
    const value: unknown = JSON.parse(roster.stdout);
    if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || typeof row.id !== "string" || !row.id)) {
      result.unresolved.push("grok.liveRosterInvalid"); return result;
    }
    result.evidence = "live-gateway-roster";
    result.candidates = value.filter(row => (row.kind === undefined || row.kind === "bot") && row.isGroup !== true &&
      row.archived !== true && row.deleted !== true && row.hiddenFromSidebar !== true &&
      !["deleted", "archived", "offline", "stopped"].includes(row.status)).map(row => ({
        id: row.id, ...(typeof row.name === "string" ? { name: row.name } : {}),
      }));
    if (new Set(result.candidates.map(row => row.id)).size !== result.candidates.length) {
      result.candidates = []; result.evidence = null;
      result.unresolved.push("grok.liveRosterInvalid"); return result;
    }
    if (result.candidates.length === 1) result.agentId = result.candidates[0]!.id;
    else if (/\bbots\s+current\b/.test(help.stdout)) {
      // Only use current-bot evidence if this installed CLI advertises it and it
      // identifies a candidate in the live roster just read from the same backend.
      const current = await run(executable, ["--gateway", "--json", "bots", "current"]);
      if (current.exitCode === 0) {
        const row: unknown = JSON.parse(current.stdout);
        if (row && typeof row === "object" && "id" in row &&
          result.candidates.some(candidate => candidate.id === row.id)) result.agentId = row.id as string;
      }
    }
    if (!result.agentId) result.unresolved.push("grok.agentId");
  } catch { result.unresolved.push("grok.liveRosterUnavailable"); }
  return result;
}
