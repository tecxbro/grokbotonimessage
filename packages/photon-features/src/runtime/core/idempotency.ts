import { createHash } from "node:crypto";
import type { Action, TrustedContext } from "../../contracts/index.js";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("INVALID_JSON");
  return encoded;
}
export const digest = (value: unknown): string =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const requestIdentity = (action: Action, c: TrustedContext): string =>
  digest([
    c.principalId,
    c.scope,
    c.taskId,
    c.generation,
    action.idempotencyKey,
  ]);
export const argumentDigest = (a: Action): string =>
  digest([a.version, a.operation, a.arguments]);
export const childIdentity = (requestId: string, index: number): string =>
  digest([requestId, "child", index]);
