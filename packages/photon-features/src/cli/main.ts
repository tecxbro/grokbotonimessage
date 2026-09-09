#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MAX_REQUEST_BYTES } from "../contracts/actions.js";
import { commandRequest } from "./commands.js";
import { localRequest } from "./local-client.js";
import { CliError, responseExit } from "./output.js";
export async function readJson(input: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new CliError("INPUT_TOO_LARGE", 2);
    chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new CliError("INVALID_REQUEST", 2); }
}
export async function run(argv: string[], env = process.env, stdin: NodeJS.ReadableStream = process.stdin,
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout, stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr): Promise<number> {
  try {
    const input = argv[0] === "execute" ? await readJson(stdin) : undefined;
    const request = commandRequest(argv, env.GROK_PHOTON_CONTEXT_ID, input);
    if (!env.GROK_PHOTON_SOCKET || !env.GROK_PHOTON_CREDENTIAL_FILE) throw new CliError("INVALID_CONFIGURATION", 2);
    const response = await localRequest(request, { socket: env.GROK_PHOTON_SOCKET, credentialFile: env.GROK_PHOTON_CREDENTIAL_FILE });
    const exit = responseExit(response);
    stdout.write(JSON.stringify(response) + "\n");
    if (exit) stderr.write("grok-photon: request requires attention; inspect JSON result\n");
    return exit;
  } catch (e) {
    const error = e instanceof CliError ? e : new CliError("INTERNAL", 5);
    stdout.write(JSON.stringify({ version: 1, ok: false, error: { code: error.code } }) + "\n");
    stderr.write(`grok-photon: ${error.code}\n`);
    return error.exitCode;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await run(process.argv.slice(2));
