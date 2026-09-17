import { errorSchema, type RuntimeError } from "../../contracts/index.js";
const publicBlockers = new Set(["requires_original_session", "universal_update_url_required", "card_template_changed", "card_update_outcome_unknown", "REACTION_COLD_RECOVERY_UNAVAILABLE"]);
export function safeBlockerId(value: unknown): string | undefined {
  return typeof value === "string" && publicBlockers.has(value) ? value : undefined;
}
export function blockerExplanation(value: unknown): string | undefined {
  switch (safeBlockerId(value)) {
    case "requires_original_session": return "Public provider lookup could not restore the original card session.";
    case "universal_update_url_required": return "Updating a universal card layout requires its configured backend URL mapping.";
    case "card_template_changed": return "The configured card template no longer matches the original session.";
    case "card_update_outcome_unknown": return "The earlier card update requires reconciliation before another update.";
    case "REACTION_COLD_RECOVERY_UNAVAILABLE": return "Public provider lookup cannot restore the original bot reaction and its exact parent target.";
  }
}
export class RuntimeFault extends Error {
  constructor(
    readonly code: RuntimeError["code"],
    readonly retry: RuntimeError["retry"] = "never",
    readonly blockerId?: string,
  ) {
    super(code);
  }
}
export function fault(code: RuntimeError["code"]): never {
  throw new RuntimeFault(code);
}
export function publicError(error: unknown): RuntimeError {
  const code = error instanceof RuntimeFault ? error.code : "INTERNAL";
  return errorSchema.parse({
    code,
    message: error instanceof RuntimeFault ? blockerExplanation(error.blockerId) ?? code : code,
    retry: error instanceof RuntimeFault ? error.retry : "never",
    ...(error instanceof RuntimeFault && safeBlockerId(error.blockerId) ? { blockerId: safeBlockerId(error.blockerId) } : {}),
  });
}
