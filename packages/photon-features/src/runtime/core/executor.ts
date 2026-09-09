import { randomUUID } from "node:crypto";
import {
  assertTransition,
  type OperationResult,
} from "../../contracts/index.js";
import type { Claim } from "../../state/index.js";
import { ExecutionClaims } from "./claims.js";
import { servicesFor, type FeatureDependencies } from "./feature-services.js";
import { bindBoundary } from "./execution-boundary.js";
import { saveOutbox } from "./submission.js";
import { scanAll } from "./recovery.js";
import { fault, publicError } from "./errors.js";
import {
  checkedCapability,
  cleanResult,
  ChildOutcome,
  type ExecutionBinding,
} from "./outcomes.js";
import { ChildExecution } from "./children.js";
import { withDeadline } from "./cancellation.js";
export type { ExecutionBinding } from "./outcomes.js";
export class DurableExecutor {
  private readonly running = new Map<string, AbortController>();
  constructor(
    readonly claims: ExecutionClaims,
    private readonly dependencies: FeatureDependencies,
    readonly concurrency = 4,
    readonly leaseMs = 30000,
    readonly deadlineMs = 30000,
  ) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 64 ||
      !Number.isInteger(leaseMs) ||
      leaseMs < 1000 ||
      leaseMs > 60000 ||
      !Number.isInteger(deadlineMs) ||
      deadlineMs < 10 ||
      deadlineMs > 60000
    )
      fault("INVALID_REQUEST");
  }
  abortAll(): void {
    for (const controller of this.running.values()) controller.abort();
  }
  cancel(id: string): void {
    this.running.get(id)?.abort();
  }
  async execute(
    id: string,
    binding: ExecutionBinding,
  ): Promise<OperationResult | null> {
    if (this.running.size >= this.concurrency || this.running.has(id))
      return null;
    const controller = new AbortController();
    this.running.set(id, controller);
    let claim: Claim | null = null,
      unbind: undefined | (() => void),
      timer: ReturnType<typeof setInterval> | undefined;
    const clock = this.claims.contexts.clock;
    try {
      claim = this.claims.acquire(id, randomUUID(), this.leaseMs);
      if (!claim) return null;
      const held = claim;
      const start = this.claims.store.transaction((tx) => {
        const { row, context } = this.claims.writable(tx, id, held);
        if (row.action.operation !== binding.handler.operation)
          fault("UNIMPLEMENTED");
        checkedCapability(binding, context);
        return row;
      });
      timer = setInterval(
        () => {
          try {
            this.claims.heartbeat(id, held, this.leaseMs);
          } catch {
            controller.abort();
          }
        },
        Math.max(250, Math.floor(this.leaseMs / 3)),
      );
      timer.unref();
      const services = servicesFor(
        this.claims,
        id,
        held,
        this.dependencies,
        controller.signal,
      );
      const children = new ChildExecution(
        this.claims,
        id,
        held,
        binding,
        controller,
        this.deadlineMs,
      );
      const dispatch = children.dispatch;
      unbind = bindBoundary(services, dispatch);
      const result = cleanResult(
        await (binding.boundary === "single-call"
          ? dispatch(0, () => binding.handler.execute(start.action, services))
          : withDeadline(
              () => binding.handler.execute(start.action, services),
              controller,
              this.deadlineMs,
            )),
      );
      if (
        binding.boundary === "durable-children" &&
        (children.invocations === 0 || children.busy)
      )
        fault("UNIMPLEMENTED");
      return this.finish(id, held, result);
    } catch (e) {
      if (!claim) throw e;
      try {
        return this.claims.store.transaction((tx) => {
          const row = this.claims.held(tx, id, claim!),
            now = clock.now();
          if (row.result.status === "unknown-outcome") {
            row.claim = null;
            saveOutbox(tx, row, now);
            return row.result;
          }
          const uncertain = [...scanAll(this.claims.store, "attempts")].filter(
            (a) =>
              a.requestId === id &&
              a.claim.fence === claim!.fence &&
              (a.phase === "dispatching" || a.phase === "unknown"),
          );
          if (uncertain.length) {
            for (const a of uncertain) {
              if (a.phase === "dispatching") {
                a.phase = "unknown";
                a.finishedAt = now;
                a.revision++;
                tx.put("attempts", a, a.revision - 1);
              }
            }
            for (const child of scanAll(this.claims.store, "children"))
              if (child.requestId === id && child.state === "dispatching") {
                child.state = "unknown";
                child.revision++;
                tx.put("children", child, child.revision - 1);
              }
            row.result.status = "unknown-outcome";
            row.result.error = {
              code: "UNKNOWN_OUTCOME",
              message: "UNKNOWN_OUTCOME",
              retry: "reconcile-first",
            };
            row.claim = null;
            saveOutbox(tx, row, now);
            controller.abort();
            return row.result;
          }
          const outcome = e instanceof ChildOutcome ? e.result : null;
          const err = publicError(e);
          const currentFailure = [
            "CANCELLED",
            "CONTEXT_REVOKED",
            "CONTEXT_EXPIRED",
            "STALE_GENERATION",
            "FORBIDDEN",
          ].includes(err.code);
          const possible = row.result.references.length > 0;
          row.result.status =
            outcome?.status ??
            (err.code === "UNKNOWN_OUTCOME"
              ? "unknown-outcome"
              : err.code === "CANCELLED" && !possible
                ? "cancelled"
                : "blocked");
          row.result.error =
            outcome?.error ??
            (currentFailure
              ? err
              : {
                  ...err,
                  retry:
                    err.code === "UNKNOWN_OUTCOME"
                      ? "reconcile-first"
                      : "safe-before-dispatch",
                });
          if (outcome?.value) row.result.value = outcome.value;
          row.claim = null;
          saveOutbox(tx, row, now);
          return row.result;
        });
      } catch {
        return null;
      } // Lost ownership: recovery, never a stale completion, owns the row now.
    } finally {
      if (timer) clearInterval(timer);
      unbind?.();
      this.running.delete(id);
    }
  }
  private finish(
    id: string,
    claim: Claim,
    result: OperationResult,
  ): OperationResult {
    return this.claims.store.transaction((tx) => {
      const { row } = this.claims.writable(tx, id, claim);
      for (const saved of scanAll(this.claims.store, "checkpoints"))
        if (
          saved.requestId === id &&
          saved.codecId === "wt01-child-result" &&
          saved.codecVersion === 1
        ) {
          const childResult = cleanResult(JSON.parse(saved.payloadJson));
          if (
            ["failed", "blocked", "cancelled", "unknown-outcome"].includes(
              childResult.status,
            )
          )
            throw new ChildOutcome(childResult);
        }
      const observationsForResult = row.result.observations;
      if (
        result.status === "provider-accepted" &&
        !observationsForResult.some((o) => o.kind === "accepted")
      )
        fault("UNKNOWN_OUTCOME");
      if (
        result.status === "observed-delivered" &&
        !observationsForResult.some(
          (o) => o.kind === "delivered" && o.source !== "sdk-return",
        )
      )
        fault("UNKNOWN_OUTCOME");
      if (
        result.status === "observed-read" &&
        !observationsForResult.some(
          (o) => o.kind === "read" && o.source !== "sdk-return",
        )
      )
        fault("UNKNOWN_OUTCOME");
      if (
        result.status === "observed-delivered" ||
        result.status === "observed-read"
      ) {
        assertTransition(row.result.status, "executor-completed");
        assertTransition("executor-completed", result.status);
      } else assertTransition(row.result.status, result.status);
      const references = row.result.references,
        observations = row.result.observations;
      row.result = {
        ...result,
        requestId: id,
        revision: row.revision,
        updatedAt: this.claims.contexts.clock.now(),
        references,
        observations,
      };
      row.claim = null;
      saveOutbox(tx, row, this.claims.contexts.clock.now());
      return row.result;
    });
  }
}
