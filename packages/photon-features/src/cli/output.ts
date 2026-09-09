import type { LocalResponse } from "../host/protocol.js";
export type CliResponse = Extract<LocalResponse, { ok: true }> | { version: 1; ok: false; error: { code: string; requestId?: string } };
export class CliError extends Error {
  constructor(public readonly code: string, public readonly exitCode: number) { super(code); }
}
export const exitForCode = (code: string): number =>
  ["UNAUTHENTICATED", "FORBIDDEN", "CONTEXT_EXPIRED", "CONTEXT_REVOKED", "SCOPE_MISMATCH"].includes(code) ? 4 :
  ["UNAVAILABLE", "HOST_UNAVAILABLE", "HOST_NOT_READY"].includes(code) ? 3 :
  ["INVALID_REQUEST", "INVALID_ARGUMENTS", "INPUT_TOO_LARGE"].includes(code) ? 2 : 5;
export function responseExit(response: CliResponse): number {
  if (!response.ok) return exitForCode(response.error.code);
  const r = response.result;
  if (!Array.isArray(r) && "ready" in r && r.ready === false) return 3;
  if (!Array.isArray(r) && "status" in r && ["blocked", "failed", "cancelled", "unknown-outcome"].includes(r.status)) return 5;
  return 0;
}
