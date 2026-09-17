import {
  localRequestSchema,
  mediaImportInputSchema,
  streamProducerInputSchemas,
  parseAction,
  type LocalRequest,
} from "../contracts/index.js";
import { CliError, type CliResponse } from "./output.js";
export function commandRequest(argv: string[], contextId: string | undefined, input?: unknown): LocalRequest {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]!;
    if (!key.startsWith("--") || flags.has(key)) throw new CliError("INVALID_ARGUMENTS", 2);
    if (["--json", "--json-stdin"].includes(key)) flags.set(key, true);
    else { const value = rest[++i]; if (!value || value.startsWith("--")) throw new CliError("INVALID_ARGUMENTS", 2); flags.set(key, value); }
  }
  const definitions: Record<string, [string, string[]]> = {
    capabilities: ["capabilities", ["--json"]], doctor: ["diagnostics", ["--json"]],
    status: ["status", ["--request-id", "--json"]], cancel: ["request.cancel", ["--request-id", "--json"]],
    "work.list": ["work.list", ["--limit", "--json"]],
    "work.claim": ["work.claim", ["--handoff-id", "--lease-ms", "--json"]],
    "work.heartbeat": ["work.heartbeat", ["--handoff-id", "--fence", "--lease-ms", "--json"]],
    "work.ack": ["work.ack", ["--handoff-id", "--fence", "--json"]],
    execute: ["submit", ["--json-stdin"]],
    "stream.open": ["stream.open", ["--json-stdin"]],
    "stream.append": ["stream.append", ["--json-stdin"]],
    "stream.close": ["stream.close", ["--json-stdin"]],
    "stream.abort": ["stream.abort", ["--json-stdin"]],
    "media.import": ["media.import", ["--json-stdin"]],
  };
  const def = definitions[command ?? ""];
  const readsStdin = command === "execute" || command === "media.import" || command?.startsWith("stream.");
  if (!def || [...flags.keys()].some(k => !def[1].includes(k)) || !flags.has(readsStdin ? "--json-stdin" : "--json")) throw new CliError("INVALID_ARGUMENTS", 2);
  if (!contextId) throw new CliError("INVALID_CONFIGURATION", 2);
  try {
    if (command === "execute") {
      const action = parseAction(input);
      if (!contextId || action.contextId !== contextId) throw new CliError("CONTEXT_MISMATCH", 4);
      return localRequestSchema.parse({ version: 1, method: "submit", action });
    }
    if (command && command in streamProducerInputSchemas) {
      const producer = streamProducerInputSchemas[command as keyof typeof streamProducerInputSchemas].parse(input);
      return localRequestSchema.parse({ ...producer, method: command, contextId });
    }
    if (command === "media.import") {
      const media = mediaImportInputSchema.parse(input);
      return localRequestSchema.parse({ version: 1, method: "media.import", contextId, ...media });
    }
    const request: Record<string, unknown> = { version: 1, method: def[0], contextId };
    const names = { "--request-id": "requestId", "--handoff-id": "handoffId", "--fence": "fence", "--lease-ms": "leaseMs", "--limit": "limit" };
    for (const [flag, name] of Object.entries(names)) if (flags.has(flag)) {
      const value = flags.get(flag);
      if (["fence", "leaseMs", "limit"].includes(name)) {
        if (typeof value !== "string" || !/^\d+$/.test(value)) throw new CliError("INVALID_ARGUMENTS", 2);
        request[name] = Number(value);
      } else request[name] = value;
    }
    if (def[0] === "work.list" && !flags.has("--limit")) request.limit = 20;
    return localRequestSchema.parse(request);
  } catch (e) { if (e instanceof CliError) throw e; throw new CliError("INVALID_REQUEST", 2); }
}


/** Parse one supported command and dispatch exactly one authenticated local request. */
export async function executeCommand(
  argv: string[],
  contextId: string | undefined,
  call: (request: LocalRequest) => Promise<CliResponse>,
  input?: unknown,
): Promise<CliResponse> {
  return call(commandRequest(argv, contextId, input));
}

/** Setup is VM-local discovery and never enters the authenticated runtime socket. */
export function setupCommandOptions(argv: string[], env: NodeJS.ProcessEnv): import("./setup.js").SetupOptions {
  if (argv[0] !== "setup") throw new CliError("INVALID_ARGUMENTS", 2);
  const flags = new Map<string, string | true>();
  const values = ["--installation-root", "--project", "--tool-root", "--photon-executable", "--grok-executable"];
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i]!;
    if (flags.has(key)) throw new CliError("INVALID_ARGUMENTS", 2);
    if (key === "--json") flags.set(key, true);
    else {
      if (!values.includes(key)) throw new CliError("INVALID_ARGUMENTS", 2);
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new CliError("INVALID_ARGUMENTS", 2);
      flags.set(key, value);
    }
  }
  const installationRoot = flags.get("--installation-root");
  if (!flags.has("--json") || typeof installationRoot !== "string") throw new CliError("INVALID_ARGUMENTS", 2);
  return { installationRoot, projectId: flags.get("--project") as string | undefined,
    toolRoot: flags.get("--tool-root") as string | undefined ?? env.GROK_PHOTON_TOOL_ROOT,
    photonExecutable: flags.get("--photon-executable") as string | undefined ?? env.GROK_PHOTON_PHOTON_EXECUTABLE,
    grokExecutable: flags.get("--grok-executable") as string | undefined ?? env.GROK_PHOTON_GROK_EXECUTABLE };
}
