import { errorSchema, type RuntimeError } from "../../contracts/index.js";
const publicBlockers = new Set(["requires_original_session", "universal_update_url_required", "card_template_changed", "card_update_outcome_unknown", "REACTION_COLD_RECOVERY_UNAVAILABLE"]);
export function safeBlockerId(value: unknown): string | undefined {
  return typeof value === "string" && publicBlockers.has(value) ? value : undefined;
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
    message: code,
    retry: error instanceof RuntimeFault ? error.retry : "never",
    ...(error instanceof RuntimeFault && safeBlockerId(error.blockerId) ? { blockerId: safeBlockerId(error.blockerId) } : {}),
  });
}
