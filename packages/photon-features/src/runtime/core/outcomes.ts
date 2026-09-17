import {
  capabilitySchema,
  resultSchema,
  type Capability,
  type OperationHandler,
  type OperationResult,
  type TrustedContext,
} from "../../contracts/index.js";
import { fault, safeBlockerId, blockerExplanation } from "./errors.js";
/** Host-owned certification; never accepted in action JSON. No implicit unsafe handler fallback. */
export interface ExecutionBinding {
  handler: OperationHandler;
  boundary: "single-call" | "durable-children";
  capability(context: TrustedContext): Capability;
}
export function checkedCapability(
  binding: ExecutionBinding,
  c: TrustedContext,
): Capability {
  const capability = capabilitySchema.parse(binding.capability(c));
  if (
    capability.operation !== binding.handler.operation ||
    capability.implementation !== "implemented"
  )
    fault("UNIMPLEMENTED");
  if (capability.providerSupport === "unsupported") fault("UNSUPPORTED");
  if (
    capability.providerSupport === "unknown" ||
    capability.availability.account !== "available" ||
    capability.availability.conversation !== "available"
  )
    fault("UNAVAILABLE");
  return capability;
}
export function cleanResult(raw: OperationResult): OperationResult {
  const r = resultSchema.parse(raw);
  if (r.error)
    r.error = {
      code: r.error.code,
      message: blockerExplanation(r.error.blockerId) ?? r.error.code,
      retry: r.error.retry,
      ...(safeBlockerId(r.error.blockerId) ? { blockerId: safeBlockerId(r.error.blockerId) } : {}),
    };
  r.observations = r.observations.map(
    ({ providerCode: _, ...observation }) => observation,
  );
  delete r.capability;
  return r;
}
export class ChildOutcome extends Error {
  constructor(readonly result: OperationResult) {
    super("CHILD_OUTCOME");
  }
}
