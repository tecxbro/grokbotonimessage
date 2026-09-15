import {
  MAX_REQUEST_BYTES,
  parseAction,
  parseActionRequest,
  resourceRefSchema,
  type Action,
  type ResourceRef,
} from "../../contracts/index.js";
import { isDeepStrictEqual } from "node:util";
import { sameScope, type TrustedContext } from "../../contracts/index.js";
import type { Transaction } from "../../state/ports.js";
import type { AdmissionMetadata } from "../../contracts/services.js";
import { fault } from "./errors.js";
export function admit(input: unknown): Action {
  try {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_REQUEST_BYTES)
      fault("INVALID_REQUEST");
    const action = parseAction(input);
    walk(action.arguments, (value) => {
      if (value.type === "poll" && Array.isArray(value.options)) {
        const keys = value.options.map((o) => (o as { key: string }).key);
        if (new Set(keys).size !== keys.length) fault("INVALID_REQUEST");
      }
    });
    return action;
  } catch {
    return fault("INVALID_REQUEST");
  }
}
/** Public admission boundary. Validation completes before authority lookup or I/O. */
export function admitRequest(input: unknown): Action {
  try {
    return parseActionRequest(input);
  } catch {
    return fault("INVALID_REQUEST");
  }
}
export function walk(
  value: unknown,
  visit: (value: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === "object") {
    visit(value as Record<string, unknown>);
    for (const child of Object.values(value)) walk(child, visit);
  }
}
export function references(action: Action): ResourceRef[] {
  const refs: ResourceRef[] = [];
  walk(action.arguments, (value) => {
    if ("kind" in value && "scope" in value)
      refs.push(resourceRefSchema.parse(value));
  });
  return refs;
}

/** Called after authorization, inside the transaction that inserts the first outbox row.
 * Idempotent submissions return the prior row before this function is reached. */
export function captureAdmission(tx: Transaction, action: Action, context: TrustedContext, now: number): AdmissionMetadata {
  if (action.operation !== "app.update") return {};
  const card = tx.get("cards", action.arguments.card.id);
  const session = tx.get("sessions", action.arguments.session.id);
  if (!card || !session || !isDeepStrictEqual(card.reference, action.arguments.card) ||
      !isDeepStrictEqual(session.reference, action.arguments.session) ||
      !sameScope(card.scope, context.scope) || !sameScope(session.scope, context.scope) ||
      session.reference.cardId !== card.id) fault("RESOURCE_NOT_FOUND");
  if (session.generation !== context.generation) fault("STALE_GENERATION");
  if (session.expiresAt <= now) fault("CONTEXT_EXPIRED");
  if (!Number.isSafeInteger(card.revision) || card.revision < 0 ||
      card.revision > Number.MAX_SAFE_INTEGER - 2 || card.revision % 2 !== 0) fault("UNAVAILABLE");
  return { cardUpdate: { cardId: card.id, sessionId: session.id, expectedRevision: card.revision } };
}
