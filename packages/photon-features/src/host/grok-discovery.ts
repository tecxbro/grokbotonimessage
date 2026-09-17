import { spawn } from "node:child_process";

export interface CommandResult { exitCode: number; stdout: string }
export interface DiscoveryProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Login only: forward both channels verbatim, retaining neither in memory. */
  stream?: (bytes: Buffer) => void;
}
export type DiscoveryRunner = (executable: string, args: string[]) => Promise<CommandResult>;

/** No shell, bounded capture, no child stderr in exceptions, and no automatic retries. */
export function runDiscoveryProcess(executable: string, args: string[], options: DiscoveryProcessOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("SETUP_CANCELLED")); return; }
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
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
    child.stderr.on("data", (bytes: Buffer) => { if (options.stream) options.stream(bytes); });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
    child.on("error", () => { cleanup(); reject(new Error("SETUP_PROCESS_FAILED")); });
    child.on("close", code => {
      cleanup();
      if (failure) reject(new Error(failure));
      else resolve({ exitCode: code ?? 1, stdout: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

export interface GrokAgentCandidate { id: string; name?: string }
export interface GrokDiscovery {
  executable: string | null;
  version: string | null;
  agentId: string | null;
  candidates: GrokAgentCandidate[];
  evidence: "live-gateway-roster" | null;
  unresolved: string[];
}

/** Only semver-like version text is returned; raw tool diagnostics are never exposed. */
export function commandVersion(text: string): string | null {
  return text.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0] ?? null;
}

/** Read-only discovery. Never consult profiles, invoke send, or fall back to files. */
export async function discoverGrok(executable: string | null, run: DiscoveryRunner): Promise<GrokDiscovery> {
  const result: GrokDiscovery = { executable, version: null, agentId: null, candidates: [], evidence: null, unresolved: [] };
  if (!executable) { result.unresolved.push("grok.executable"); return result; }
  try {
    const version = await run(executable, ["--version"]);
    if (version.exitCode === 0) result.version = commandVersion(version.stdout);
    const help = await run(executable, ["--help"]);
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
