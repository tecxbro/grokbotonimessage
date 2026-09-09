import {
  assertScope,
  type Action,
  type ExecutionServices,
  type FeatureModule,
  type OperationResult,
} from "../../contracts/index.js";
import type { TypingLeases } from "./leases.js";

/** WT-01 supplies the already persisted execution identity and current fence
 * validation. F0 ExecutionServices has no requestId; do not substitute an idempotency key. */
export interface TypingExecutionBinding {
  requestId: string;
  resultRevision: number;
  expiresAt: number;
  assertCurrent(): void;
}
export type BindTypingExecution = (
  action: Action,
  services: ExecutionServices,
) => TypingExecutionBinding;
export function createTypingModule(
  leases: TypingLeases,
  bind: BindTypingExecution,
): FeatureModule {
  return {
    id: "wt-02.typing",
    lane: "wt-02",
    mode: "production",
    compilers: [],
    reducers: [],
    capabilities: [],
    handlers: (["typing.begin", "typing.end"] as const).map((operation) => ({
      operation,
      recoveryCodec: { id: "wt-02.transient-typing", version: 1 },
      async execute(action, services): Promise<OperationResult> {
        if (
          action.operation !== operation ||
          (action.operation !== "typing.begin" &&
            action.operation !== "typing.end")
        )
          throw new Error("INVALID_REQUEST");
        assertScope(action.arguments.space, services.context.scope);
        await services.resources.resolve(
          action.arguments.space,
          services.context,
        );
        const binding = bind(action, services);
        const validate = () => {
          binding.assertCurrent();
          if (services.signal.aborted) throw new Error("CANCELLED");
          if (
            services.context.revokedAt !== null ||
            services.context.expiresAt <= services.clock.now()
          )
            throw new Error("CONTEXT_EXPIRED");
          if (
            services.claim.generation !== services.context.generation ||
            services.claim.leaseUntil <= services.clock.now()
          )
            throw new Error("STALE_FENCE");
          if (binding.expiresAt <= services.clock.now())
            throw new Error("TYPING_WORK_EXPIRED");
        };
        validate();
        if (action.operation === "typing.begin") {
          const remaining = Math.min(
            action.arguments.ttlMs,
            binding.expiresAt - services.clock.now(),
            services.claim.leaseUntil - services.clock.now(),
            services.context.expiresAt - services.clock.now(),
          );
          if (remaining >= 100)
            leases.begin(
              services.context.scope,
              services.context.generation,
              remaining,
              { signal: services.signal, validate },
            );
        } else
          leases.end({
            scope: services.context.scope,
            generation: services.context.generation,
          });
        return {
          version: 1,
          requestId: binding.requestId,
          revision: binding.resultRevision,
          updatedAt: services.clock.now(),
          status: "executor-completed",
          references: [],
          value: { type: "void" },
          observations: [], // Scheduling a lease is not an SDK-return observation.
        };
      },
    })),
    recoveryCodecs: [
      {
        id: "wt-02.transient-typing",
        version: 1,
        validate: (value) =>
          value !== null &&
          typeof value === "object" &&
          "expiresAt" in value &&
          typeof value.expiresAt === "number" &&
          Number.isFinite(value.expiresAt),
        // Ephemeral indicator jobs must never start again following a process restart.
        reconcile: async () => "completed",
      },
    ],
  };
}
