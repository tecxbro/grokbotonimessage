import type { Scope, Transaction } from "../../index.js";

/** F0 has no exhaustive reference query. Saturation is fail-closed; never assume a truncated scan is complete. */
export function scopeHasConsumers(tx: Transaction, scope: Scope): boolean {
  const outbox = tx.list("outbox", scope, 1000);
  const inbox = tx.list("inbox", scope, 1000);
  const unresolved = tx.list("unresolved", scope, 1000);
  const children = tx.list("children", scope, 1000);
  const checkpoints = tx.list("checkpoints", scope, 1000);
  const handoffs = tx.list("handoffs", scope, 1000);
  if ([outbox, inbox, unresolved, children, checkpoints, handoffs].some(rows => rows.length === 1000)) return true;
  // Conservatively retain every resource in the scope while any operation may still use one.
  return outbox.some(r => !["observed-read", "failed", "cancelled"].includes(r.result.status)) ||
    inbox.some(r => r.state !== "reduced") || unresolved.length > 0 ||
    children.some(r => r.state !== "completed") ||
    handoffs.some(r => !["acknowledged", "cancelled"].includes(r.state)) ||
    checkpoints.some(r => r.codecId !== "wt04.media-metadata");
}

import { sameScope, stagedMediaSchema, type Action, type TrustedContext } from "../../index.js";
import { reject } from "./safety.js";
/** WT-01 must call inside its submission transaction before persisting an action referencing staged media. */
export function assertActionMediaAvailable(tx: Transaction, action: Action, context: TrustedContext): void {
  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if ("stagingId" in value) {
      const media = stagedMediaSchema.parse(value);
      const record = tx.get("stagedMedia", media.stagingId);
      if (!record || record.expiresAt === 0 || !sameScope(record.scope, context.scope) ||
        record.principalId !== context.principalId || record.taskId !== context.taskId ||
        record.generation !== context.generation || record.sha256 !== media.sha256 ||
        record.bytes !== media.bytes || record.mimeType !== media.mimeType) reject("staged resource unavailable");
    } else for (const child of Object.values(value)) walk(child);
  }
  walk(action.arguments);
}
