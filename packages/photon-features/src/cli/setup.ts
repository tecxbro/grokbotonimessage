import { fileURLToPath } from "node:url";
import { generateInitialOwnerConfiguration, writeInitialConfiguration } from "../host/setup-configuration.js";
import { setupProductionInstallation } from "../host/process.js";
import { assertSelectedRelease } from "../host/selected-release.js";
import type { ProductionCompositionDependencies } from "../host/production.js";
import { chmod, lstat, mkdtemp, open } from "node:fs/promises";
import { homedir } from "node:os";
import { constants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { CliError } from "./output.js";
import { commandVersion, discoverGrok, runDiscoveryProcess, type CommandResult, type DiscoveryRunner, type GrokDiscovery, type GrokCommandStyleResolver } from "../host/grok-discovery.js";

export interface SetupOptions { installationRoot: string; projectId?: string; toolRoot?: string; photonExecutable?: string; grokExecutable?: string; wakeMode?: "webhook" }
export interface SetupServices {
  env?: NodeJS.ProcessEnv;
  /** Host injection for fixture tests only; main always uses the real process platform. */
  platform?: NodeJS.Platform;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  signal?: AbortSignal;
  /** RFX-00 may inject RFX-02 discoverGrokCommandStyle without a missing branch import. */
  discoverGrokCommandStyle?: GrokCommandStyleResolver;
}
export interface Identity { id: string; name?: string; email?: string }
export interface ProjectCandidate { id: string; name?: string }
export interface SpectrumUserCandidate extends Identity { accountId?: string; phoneNumber?: string; assignedPhoneNumber?: string }
export interface LineCandidate { id: string; platform?: string; phoneNumber?: string }
export interface SetupDiscovery {
  version: 1;
  kind: "setup-discovery";
  status: "discovered" | "needs-input";
  installationRoot: string;
  photon: { executable: string; version: string; source: "configured" | "path" | "private" | "installed"; identity: Identity | null; authStatus: "verified" | "unsupported" };
  project: ProjectCandidate | null;
  projectCandidates: ProjectCandidate[];
  spectrum: { mode: "shared" | "dedicated" | null; user: SpectrumUserCandidate | null; userCandidates: SpectrumUserCandidate[]; servingE164: string | null; dedicatedLineId: string | null; lineCandidates: LineCandidate[] };
  secretFile: { path: string; mode: "0600"; format: "photon-project-secret-v1" } | null;
  grok: GrokDiscovery;
  unresolved: string[];
  nextDecision: { field: string; action: string } | null;
}
interface Installer {
  privateDirectory(path: string): Promise<string>;
  findExecutable(name: string, env: NodeJS.ProcessEnv): Promise<string | null>;
  resolvePhotonCli(options: { configured?: string; toolRoot: string; env: NodeJS.ProcessEnv; run: DiscoveryRunner; platform: NodeJS.Platform; preferPrivate?: boolean }): Promise<{ path: string; source: SetupDiscovery["photon"]["source"] }>;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliError("SETUP_INVALID_RESPONSE", 5);
  return value as Record<string, unknown>;
};
const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const e164 = (value: unknown): string | undefined => typeof value === "string" && /^\+[1-9]\d{1,14}$/.test(value) ? value : undefined;
function identity(value: unknown): Identity {
  const row = object(value), id = string(row.id);
  if (!id) throw new CliError("SETUP_INVALID_RESPONSE", 5);
  return { id, ...(string(row.name) ? { name: string(row.name) } : {}), ...(string(row.email) ? { email: string(row.email) } : {}) };
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new CliError("SETUP_INVALID_RESPONSE", 5);
  const rows = value.map(object);
  const ids = rows.map(row => identity(row).id);
  if (new Set(ids).size !== ids.length) throw new CliError("SETUP_INVALID_RESPONSE", 5);
  return rows;
}
function parseJson(result: CommandResult, code: string): unknown {
  if (result.exitCode !== 0) throw new CliError(code, 5);
  try { return JSON.parse(result.stdout); } catch { throw new CliError("SETUP_INVALID_RESPONSE", 5); }
}
function hasCommand(help: string, command: string): boolean {
  return new RegExp(`^\\s+${command}(?:[\\s|\\[]|$)`, "m").test(help);
}
function nextDecision(unresolved: string[]): SetupDiscovery["nextDecision"] {
  const field = unresolved[0];
  if (!field) return null;
  const actions: Record<string, string> = {
    project: "Choose one projectCandidates ID and rerun setup with --project ID.",
    "spectrum.user": "Choose one userCandidates ID for the configuration handoff.",
    "spectrum.dedicatedLineId": "Choose one lineCandidates ID for the configuration handoff.",
    "grok.agentId": "Choose one live Grok candidate ID for the configuration handoff.",
    "project.secret": "The installed CLI did not return an existing project secret; resolve CLI access without rotating it.",
  };
  return { field, action: actions[field] ?? "Resolve the reported discovery field before generating configuration." };
}

/** Import only the selected VM backend credential; the original CLI store is read-only. */
async function importVmSession(env: NodeJS.ProcessEnv, destination: string, installer: Installer): Promise<void> {
  const origin = new URL(env.PHOTON_API_HOST ?? "https://app.photon.codes").origin;
  const url = new URL(origin);
  const key = origin === "https://app.photon.codes" ? "production" :
    url.hostname.toLowerCase().replace(/[[\]]/g, "").replace(/[.:%]/g, "_") + (url.port ? `_${url.port}` : "");
  if (!/^[a-z0-9_][a-z0-9_-]{0,63}$/.test(key)) throw new CliError("SETUP_INVALID_BACKEND", 2);
  const configBase = env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), ".config");
  let source = env.PHOTON_CONFIG_DIR ?? env.DASHBOARD_CONFIG_DIR ?? join(configBase, "photon");
  if (!isAbsolute(source)) throw new CliError("SETUP_INVALID_ROOT", 2);
  if (!env.PHOTON_CONFIG_DIR && !env.DASHBOARD_CONFIG_DIR) {
    try { await lstat(source); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") source = join(configBase, "photon-dashboard"); else throw error; }
  }
  await installer.privateDirectory(join(destination, "credentials"));
  const target = join(destination, "credentials", `${key}.json`);
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new CliError("SETUP_UNSAFE_ROOT", 2);
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (resolve(source) === resolve(destination)) return;
  let sourceFile;
  try { sourceFile = await open(join(source, "credentials", `${key}.json`), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return; throw error; }
  try {
    const stat = await sourceFile.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new CliError("PHOTON_SESSION_INVALID", 4);
    let credential: Record<string, unknown>;
    try { credential = object(JSON.parse(await sourceFile.readFile("utf8"))); }
    catch { return; } // Corrupt cached state is not authenticated; let whoami require login.
    if (credential.apiUrl !== origin || credential.envName !== key || !string(credential.accessToken)) return;
    const user = identity(credential.user);
    const file = await open(target, "wx", 0o600);
    try { await file.writeFile(JSON.stringify({ accessToken: credential.accessToken, user, envName: key, apiUrl: origin,
      ...(string(credential.issuedAt) ? { issuedAt: credential.issuedAt } : {}),
      ...(string(credential.expiresAt) ? { expiresAt: credential.expiresAt } : {}) }) + "\n"); }
    finally { await file.close(); }
  } finally { await sourceFile.close(); }
}

/** Discovery only: no runtime configuration, activation, resource creation, or messaging. */
export async function setupDiscovery(options: SetupOptions, services: SetupServices = {}): Promise<SetupDiscovery> {
  const platform = services.platform ?? process.platform;
  if (platform !== "linux") throw new CliError("SETUP_VM_REQUIRED", 2);
  if (!isAbsolute(options.installationRoot) || options.installationRoot === "/" ||
    (options.toolRoot !== undefined && (!isAbsolute(options.toolRoot) || options.toolRoot === "/"))) throw new CliError("SETUP_INVALID_ROOT", 2);
  const installationRoot = resolve(options.installationRoot);
  const toolRoot = resolve(options.toolRoot ?? join(installationRoot, "tools"));
  const moduleUrl = new URL("../../../scripts/install-photon-cli.mjs", import.meta.url).href;
  const installer = await import(moduleUrl) as Installer;
  try {
    const runtime = await installer.privateDirectory(join(installationRoot, "runtime", "setup"));
    await chmod(runtime, 0o700);
    const session = await mkdtemp(join(runtime, "discovery-"));
    const childHome = await installer.privateDirectory(join(runtime, "home"));
    const photonConfig = await installer.privateDirectory(join(runtime, "photon-config"));
    await chmod(photonConfig, 0o700);
    const env: NodeJS.ProcessEnv = { ...(services.env ?? process.env) };
    await importVmSession(env, photonConfig, installer);
    // Reuse copied/private CLI credentials while preventing external writes or token overrides.
    for (const key of Object.keys(env)) if (/^npm_config_/i.test(key) ||
      ["PHOTON_TOKEN", "PHOTON_PROJECT_ID", "PHOTON_CONFIG_DIR", "NODE_OPTIONS", "NODE_PATH", "BUN_OPTIONS"].includes(key)) delete env[key];
    Object.assign(env, { HOME: childHome, XDG_CONFIG_HOME: join(childHome, ".config"), XDG_CACHE_HOME: join(childHome, ".cache"),
      XDG_DATA_HOME: join(childHome, ".local", "share"), XDG_STATE_HOME: join(childHome, ".local", "state"),
      TMPDIR: session, TMP: session, TEMP: session, PHOTON_CONFIG_DIR: photonConfig,
      PHOTON_NO_UPDATE_NOTIFIER: "1", NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", FORCE_COLOR: "0" });
    const run: DiscoveryRunner = (executable, args) => runDiscoveryProcess(executable, args, {
      cwd: session, env, signal: services.signal, timeoutMs: args[0] === "install" ? 180_000 : 30_000,
      captureStderr: args[0] === "whoami" || args.at(-1) === "--help",
    });
    const cli = await installer.resolvePhotonCli({ configured: options.photonExecutable, toolRoot, env, run, platform, preferPrivate: options.wakeMode === "webhook" });
    const versionResult = await run(cli.path, ["--version"]);
    const version = versionResult.exitCode === 0 ? commandVersion(versionResult.stdout) : null;
    if (!version) throw new CliError("PHOTON_VERSION_UNAVAILABLE", 5);
    if (options.wakeMode === "webhook" && version !== "2.2.0") throw new CliError("PHOTON_VERSION_MISMATCH", 5);
    const existing = await run(cli.path, ["whoami"]);
    if (existing.exitCode !== 0) {
      // Public Photon 2.2.0 error messages distinguish missing/expired auth from
      // network and other failures. Unknown failures must not initiate fresh login.
      if (!/\b(?:not authenticated|session expired)\b/i.test(`${existing.stdout}\n${existing.stderr ?? ""}`))
        throw new CliError("PHOTON_AUTHENTICATION_FAILED", 4);
      const login = await runDiscoveryProcess(cli.path, ["login", "--no-browser"], {
        cwd: session, env, signal: services.signal, timeoutMs: 15 * 60_000,
        stream: bytes => { (services.stderr ?? process.stderr).write(bytes); },
      });
      if (login.exitCode !== 0) throw new CliError("PHOTON_LOGIN_FAILED", 4);
      const whoami = await run(cli.path, ["whoami"]);
      if (whoami.exitCode !== 0) throw new CliError("PHOTON_AUTHENTICATION_FAILED", 4);
    }
    const rootHelp = await run(cli.path, ["--help"]);
    if (rootHelp.exitCode !== 0) throw new CliError("PHOTON_HELP_UNAVAILABLE", 5);
    let authenticated: Identity | null = null;
    let authStatus: SetupDiscovery["photon"]["authStatus"] = "unsupported";
    if (hasCommand(rootHelp.stdout, "auth")) {
      const authHelp = await run(cli.path, ["auth", "--help"]);
      if (authHelp.exitCode === 0 && hasCommand(authHelp.stdout, "status")) {
        const statusHelp = await run(cli.path, ["auth", "status", "--help"]);
        if (statusHelp.exitCode === 0 && /--json\b/.test(statusHelp.stdout)) {
          const statuses = parseJson(await run(cli.path, ["auth", "status", "--json"]), "PHOTON_AUTH_STATUS_FAILED");
          if (!Array.isArray(statuses)) throw new CliError("SETUP_INVALID_RESPONSE", 5);
          const activeUrl = new URL(env.PHOTON_API_HOST ?? "https://app.photon.codes").origin;
          const rows = statuses.map(object).filter(row => string(row.url)?.replace(/\/$/, "") === activeUrl);
          if (rows.length !== 1 || rows[0]!.loggedIn !== true || rows[0]!.corrupt === true) throw new CliError("PHOTON_AUTHENTICATION_FAILED", 4);
          authenticated = identity(rows[0]!.user);
          authStatus = "verified";
        }
      }
    }
    const projects = list(parseJson(await run(cli.path, ["projects", "ls", "--json"]), "PHOTON_PROJECT_DISCOVERY_FAILED"));
    const projectCandidates = projects.map(row => ({ id: identity(row).id, ...(string(row.name) ? { name: string(row.name) } : {}) }));
    const selected = options.projectId ? projectCandidates.find(row => row.id === options.projectId) : projectCandidates.length === 1 ? projectCandidates[0] : undefined;
    if (options.projectId && !selected) throw new CliError("PHOTON_PROJECT_NOT_FOUND", 2);
    const unresolved: string[] = selected ? [] : ["project"];
    const result: SetupDiscovery = {
      version: 1, kind: "setup-discovery", status: "needs-input", installationRoot,
      photon: { executable: cli.path, version, source: cli.source, identity: authenticated, authStatus },
      project: selected ?? null, projectCandidates,
      spectrum: { mode: null, user: null, userCandidates: [], servingE164: null, dedicatedLineId: null, lineCandidates: [] },
      secretFile: null, grok: { executable: null, version: null, agentId: null, candidates: [], evidence: null, commandStyle: null, commandStyleEvidence: null, unresolved: [] },
      unresolved, nextDecision: null,
    };
    if (selected) {
      const projectHelp = await run(cli.path, ["projects", "--help"]);
      if (projectHelp.exitCode !== 0) throw new CliError("PHOTON_HELP_UNAVAILABLE", 5);
      const secretCommand = hasCommand(projectHelp.stdout, "secret") ? "secret" : hasCommand(projectHelp.stdout, "show") ? "show" : null;
      let secret: string | undefined;
      if (secretCommand) {
        const secretHelp = await run(cli.path, ["projects", secretCommand, "--help"]);
        if (secretHelp.exitCode === 0 && /--json\b/.test(secretHelp.stdout)) {
          const value = object(parseJson(await run(cli.path, ["projects", secretCommand, selected.id, "--json"]), "PHOTON_SECRET_DISCOVERY_FAILED"));
          if (value.id !== selected.id) throw new CliError("PHOTON_PROJECT_IDENTITY_MISMATCH", 5);
          secret = string(value.projectSecret);
        }
      }
      if (secret) {
        const path = join(session, "project-secret.json");
        const file = await open(path, "wx", 0o600);
        try { await file.writeFile(JSON.stringify({ version: 1, projectId: selected.id, projectSecret: secret }) + "\n"); }
        finally { await file.close(); }
        result.secretFile = { path, mode: "0600", format: "photon-project-secret-v1" };
      } else unresolved.push("project.secret");
      const scope = ["--project", selected.id, "--json"];
      const users = list(parseJson(await run(cli.path, ["spectrum", "users", "ls", ...scope]), "PHOTON_USERS_DISCOVERY_FAILED"));
      result.spectrum.userCandidates = users.map(row => ({ ...identity(row),
        ...(string(row.accountId) ? { accountId: string(row.accountId) } : {}),
        ...(e164(row.phoneNumber) ? { phoneNumber: e164(row.phoneNumber) } : {}),
        ...(e164(row.assignedPhoneNumber) ? { assignedPhoneNumber: e164(row.assignedPhoneNumber) } : {}),
      }));
      const lines = list(parseJson(await run(cli.path, ["spectrum", "lines", "ls", ...scope]), "PHOTON_LINES_DISCOVERY_FAILED"));
      result.spectrum.lineCandidates = lines.filter(row => row.platform === "imessage").map(row => ({ id: identity(row).id,
        platform: "imessage", ...(e164(row.phoneNumber) ? { phoneNumber: e164(row.phoneNumber) } : {}),
      }));
      result.spectrum.mode = lines.length === 0 ? "shared" : result.spectrum.lineCandidates.length > 0 ? "dedicated" : null;
      if (!result.spectrum.mode) unresolved.push("spectrum.mode");
      if (result.spectrum.userCandidates.length === 1) result.spectrum.user = result.spectrum.userCandidates[0]!;
      else unresolved.push("spectrum.user");
      if (result.spectrum.mode === "dedicated") {
        if (result.spectrum.lineCandidates.length === 1) {
          const line = result.spectrum.lineCandidates[0]!;
          result.spectrum.dedicatedLineId = line.id;
          result.spectrum.servingE164 = line.phoneNumber ?? null;
        } else unresolved.push("spectrum.dedicatedLineId");
      } else if (result.spectrum.mode === "shared") {
        // phoneNumber is the user's own number; only assignedPhoneNumber is serving evidence.
        result.spectrum.servingE164 = result.spectrum.user?.assignedPhoneNumber ?? null;
      }
      if (result.spectrum.mode === "dedicated" && !result.spectrum.servingE164) unresolved.push("spectrum.servingE164");
    }
    if (!authenticated) unresolved.push("photon.identity");
    if (options.wakeMode !== "webhook") {
      const grokExecutable = await installer.findExecutable(options.grokExecutable ?? "gbot", env);
      result.grok = await discoverGrok(grokExecutable, run, services.discoverGrokCommandStyle);
      unresolved.push(...result.grok.unresolved);
    }
    result.status = unresolved.length ? "needs-input" : "discovered";
    result.nextDecision = nextDecision(unresolved);
    return result;
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = error instanceof Error && /^(?:SETUP|PHOTON|NPM)_[A-Z_]+$/.test(error.message) ? error.message : "SETUP_FAILED";
    throw new CliError(code, 5);
  }
}

export interface SetupRunServices extends SetupServices {
  /** Programmatic fixture boundaries only; the installed CLI supplies neither. */
  hostDependencies?: ProductionCompositionDependencies;
  releaseRoot?: string;
}

/** Discover, exclusively configure, validate, activate and run a fresh owner.
 * Ambiguous discovery returns unchanged before creating authority. Successful
 * setup owns the foreground host until shutdown; repeat setup never resets it. */
export async function setupAndRun(options: SetupOptions, services: SetupRunServices = {}): Promise<SetupDiscovery | void> {
  const discovery = await setupDiscovery(options, services);
  if (discovery.status !== "discovered" || discovery.unresolved.length || discovery.grok.unresolved.length) return discovery;
  const releaseRoot = services.releaseRoot ?? fileURLToPath(new URL("../../../", import.meta.url));
  try {
    await assertSelectedRelease(options.installationRoot, releaseRoot);
    const configuration = await generateInitialOwnerConfiguration({ version: 2, discovery, activateAfterValidation: true });
    await writeInitialConfiguration(options.installationRoot, configuration);
    const lifecycle = await setupProductionInstallation(options.installationRoot, releaseRoot,
      { activateAfterValidation: true }, services.hostDependencies);
    await lifecycle.start();
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "SETUP_FAILED";
    throw new CliError(code, 5);
  }
}
