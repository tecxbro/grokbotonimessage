import { sameScope, type Clock, type Scope, type WakeAdapter } from "../../contracts/index.js";
import type { ExistingGrokTaskHandoff } from "../../adapters/legacy/index.js";
import type { HandoffRecord, TransactionStore } from "../../state/index.js";
import { activeRoute, type TaskRoute } from "./router.js";

/** Binding is supplied by the existing orchestrator's verified deployment.
 * There is deliberately no HTTP endpoint, model, command, or fake fallback. */
export class ExistingGrokWakeAdapter implements WakeAdapter {
  constructor(private readonly existing: ExistingGrokTaskHandoff) {}
  async wake(pointer: Parameters<WakeAdapter["wake"]>[0]) {
    return { status: await this.existing.notifyExistingTask(pointer) };
  }
}
export const WAKE_RETRY_BASE_MS = 2_000;
export const WAKE_RETRY_MAX_MS = 60_000;
export const WAKE_ACCEPTED_QUIET_MS = 30_000;

/** Delay following a one-based attempt. Clamp before exponentiation. */
export function wakeRetryDelayMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new Error("INVALID_WAKE_ATTEMPT");
  return Math.min(WAKE_RETRY_MAX_MS, WAKE_RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 5));
}

export interface WakeDispatchResult {
  handoffId: string;
  status: "accepted" | "failed" | "unknown";
  diagnostic?: NonNullable<HandoffRecord["wake"]>["diagnostic"];
}

/** Bound both persisted and reported diagnostics to fixed, non-sensitive codes. */
function wakeDiagnostic(value: unknown): WakeDispatchResult["diagnostic"] {
  return value === "GROK_WAKE_TARGET_UNAVAILABLE" || value === "GROK_WAKE_COMMAND_STYLE_UNAVAILABLE"
    ? value : undefined;
}

export class WakeDispatcher {
  private running = false;
  constructor(
    private readonly store: TransactionStore,
    private readonly clock: Clock,
    private readonly wakeAdapter: WakeAdapter,
    /** Deployment should bind the actual gateway agent; legacy callers use task identity. */
    private readonly targetId?: string,
  ) {}
  /** Reserve durably before notifying. A crashed or uncertain call stays throttled;
   * acceptance is only a pointer receipt, never work acknowledgement. */
  async tick(scope: Scope, route: TaskRoute): Promise<WakeDispatchResult[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const rows = this.store.transaction((tx) =>
        activeRoute(tx, scope, route)
          ? tx.listWork(
              scope,
              route.principalId,
              route.taskId,
              route.generation,
              this.clock.now(),
              100,
            )
          : [],
      );
      const results: WakeDispatchResult[] = [];
      for (const row of rows) {
        const reserved = this.store.transaction((tx) => {
          const current = tx.get("handoffs", row.id);
          const now = this.clock.now();
          if (!current || !activeRoute(tx, scope, route) ||
              !sameScope(current.scope, scope) ||
              current.taskId !== route.taskId || current.generation !== route.generation ||
              current.principalId !== route.principalId ||
              !(current.state === "pending" ||
                current.state === "claimed" && current.claim && current.claim.leaseUntil <= now) ||
              current.claim && current.claim.leaseUntil > now ||
              current.wake && current.wake.nextAttemptAt > now) return;
          const attempts = (current.wake?.attempts ?? 0) + 1;
          const targetId = this.targetId ?? route.taskId;
          const next = {
            ...current,
            revision: current.revision + 1,
            wake: {
              targetId,
              // Retain the last completed diagnostic through a crashed retry,
              // but never attribute the previous target's failure to a new one.
              diagnostic: current.wake?.targetId === targetId
                ? wakeDiagnostic(current.wake.diagnostic) : undefined,
              attempts,
              lastAttemptAt: now,
              nextAttemptAt: now + wakeRetryDelayMs(attempts),
              // A crash after reservation cannot be mistaken for prior acceptance.
              lastStatus: null,
            },
          };
          tx.put("handoffs", next, current.revision);
          return next;
        });
        if (!reserved) continue;
        let status: WakeDispatchResult["status"] = "unknown";
        let diagnostic: WakeDispatchResult["diagnostic"];
        try {
          ({ status } = await this.wakeAdapter.wake({
            handoffId: reserved.id,
            taskId: reserved.taskId,
            generation: reserved.generation,
          }));
        } catch (error) {
          status = "failed";
          // Only fixed public diagnostics cross this boundary; never stderr/prompts.
          diagnostic = wakeDiagnostic(error instanceof Error ? error.message : undefined);
        }
        this.store.transaction((tx) => {
          const current = tx.get("handoffs", reserved.id);
          if (!current || current.revision !== reserved.revision ||
              current.wake?.attempts !== reserved.wake.attempts ||
              current.wake.targetId !== reserved.wake.targetId ||
              !activeRoute(tx, scope, route)) return;
          tx.put("handoffs", {
            ...current,
            revision: current.revision + 1,
            wake: {
              ...current.wake,
              lastStatus: status,
              // Only this attempt's CAS may replace/clear the completed diagnostic.
              diagnostic,
              // A slow call must also leave a quiet period after its result.
              nextAttemptAt: Math.max(current.wake.nextAttemptAt, this.clock.now() +
                Math.max(wakeRetryDelayMs(current.wake.attempts),
                  status === "accepted" ? WAKE_ACCEPTED_QUIET_MS : 0)),
            },
          }, current.revision);
        });
        results.push({ handoffId: reserved.id, status, ...(diagnostic ? { diagnostic } : {}) });
      }
      return results;
    } finally {
      this.running = false;
    }
  }
}

/** Explicit configuration gate: no invented endpoint or successful no-op fallback. */
export function configuredGrokWake(binding?: ExistingGrokTaskHandoff): ExistingGrokWakeAdapter {
  if (!binding || typeof binding.notifyExistingTask !== "function") throw new Error("GROK_WAKE_NOT_CONFIGURED");
  return new ExistingGrokWakeAdapter(binding);
}
/** Send durable pointers only. Wake acceptance never acknowledges work retrieval. */
export function dispatchWake(dispatcher: WakeDispatcher, scope: Scope, route: TaskRoute) {
  return dispatcher.tick(scope, route);
}
