import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Action, Scope, TrustedContext } from "../contracts/index.js";
import type { ExecutionServices } from "../contracts/services.js";
import type { Claim, OutboxRecord, Transaction } from "../state/index.js";
import { canonicalJson } from "../adapters/transport/provider-context.js";
import { ProviderContext } from "../adapters/transport/provider-context.js";
import { sameScope } from "../contracts/resources.js";
import { ExecutionClaims } from "../runtime/core/claims.js";
import { fault } from "../runtime/core/errors.js";
import {
  argumentDigest,
  childIdentity,
  digest,
  requestIdentity,
} from "../runtime/core/idempotency.js";
import type { TypingLeaseDescriptor } from "../runtime/typing/leases.js";
import type {
  IssuedTypingLeaseAuthorization,
  TypingExecutionBinding,
} from "../runtime/typing/operations.js";

type TypingAction = Extract<
  Action,
  { operation: "typing.begin" | "typing.end" }
>;
type TypingBegin = Extract<Action, { operation: "typing.begin" }>;

interface BoundExecution {
  action: TypingAction;
  admission: ExecutionServices["admission"];
  claim: Claim;
  context: TrustedContext;
  deadlineAt: number;
  requestId: string;
  resultRevision: number;
}

interface Issuance {
  active: boolean;
  binding: BoundExecution;
  descriptor: Readonly<TypingLeaseDescriptor>;
  id: string;
  issuedRevision: number;
  confirmedRevision?: number;
}

export interface TypingRouteBinding {
  scope: Scope;
  conversationId: string;
  phone: string;
}

function sameClaim(left: Claim | null, right: Claim): boolean {
  return !!left &&
    left.owner === right.owner &&
    left.fence === right.fence &&
    left.generation === right.generation &&
    left.leaseUntil === right.leaseUntil;
}
function sameFence(left: Claim | null, right: Claim): boolean {
  return !!left &&
    left.owner === right.owner &&
    left.fence === right.fence &&
    left.generation === right.generation;
}

/**
 * Host-owned authorization for transient typing leases. The durable execution
 * claim is required to schedule a lease, but a confirmed in-memory issuance
 * may survive the scheduling command's normal completion. Nothing is persisted
 * or replayed after restart.
 */
export class HostTypingBinding {
  private readonly issuances = new Map<string, Issuance>();
  private stopped = false;

  constructor(
    private readonly claims: ExecutionClaims,
    private readonly routes: ProviderContext,
    private readonly route: TypingRouteBinding,
  ) {
    if (!sameScope(routes.inbound(route.phone, route.conversationId), route.scope))
      fault("SCOPE_MISMATCH");
  }

  bind(action: TypingAction, services: ExecutionServices): TypingExecutionBinding {
    if (this.stopped) fault("CANCELLED");
    const requestId = requestIdentity(action, services.context);
    const binding: BoundExecution = {
      action: structuredClone(action),
      admission: services.admission === undefined
        ? undefined
        : structuredClone(services.admission),
      claim: structuredClone(services.claim),
      context: structuredClone(services.context),
      deadlineAt: Math.min(
        services.context.expiresAt,
        services.claim.leaseUntil,
      ),
      requestId,
      resultRevision: 0,
    };
    services.assertActiveClaim();
    const resultRevision = this.claims.store.transaction((tx) => {
      const row = this.assertBoundRequest(tx, binding);
      if (!sameFence(row.claim, binding.claim)) fault("STALE_FENCE");
      this.claims.writable(tx, binding.requestId, binding.claim);
      return row.result.revision;
    });
    binding.resultRevision = resultRevision;
    const assertCurrent = () => {
      if (this.stopped) fault("CANCELLED");
      services.assertActiveClaim();
      this.claims.store.transaction((tx) => {
        const row = this.assertBoundRequest(tx, binding);
        if (!sameFence(row.claim, binding.claim)) fault("STALE_FENCE");
        this.claims.writable(tx, binding.requestId, binding.claim);
      });
    };
    return {
      requestId,
      resultRevision,
      expiresAt: binding.deadlineAt,
      assertCurrent,
      issueLease: (lease) => this.issue(binding, lease, assertCurrent),
    };
  }

  private issue(
    binding: BoundExecution,
    descriptor: Readonly<TypingLeaseDescriptor>,
    assertSchedulingClaim: () => void,
  ): IssuedTypingLeaseAuthorization {
    if (binding.action.operation !== "typing.begin") fault("INVALID_REQUEST");
    const action = binding.action as TypingBegin;
    assertSchedulingClaim();
    const now = this.claims.contexts.clock.now();
    if (
      !sameScope(descriptor.scope, binding.context.scope) ||
      descriptor.generation !== binding.context.generation ||
      !Number.isSafeInteger(descriptor.token) ||
      descriptor.token < 1 ||
      !Number.isSafeInteger(descriptor.issuedAt) ||
      descriptor.issuedAt > now ||
      !Number.isSafeInteger(descriptor.ttlMs) ||
      descriptor.ttlMs < 100 ||
      descriptor.ttlMs > action.arguments.ttlMs ||
      descriptor.expiresAt !== descriptor.issuedAt + descriptor.ttlMs ||
      descriptor.expiresAt > binding.deadlineAt ||
      descriptor.expiresAt <= now
    )
      fault("CONTEXT_EXPIRED");
    const id = digest([
      binding.requestId,
      binding.claim.owner,
      binding.claim.fence,
      descriptor.token,
      descriptor.issuedAt,
      descriptor.expiresAt,
    ]);
    if (this.issuances.has(id)) fault("STALE_FENCE");
    const issuance = this.claims.store.transaction((tx): Issuance => {
      const row = this.assertBoundRequest(tx, binding);
      if (!sameFence(row.claim, binding.claim)) fault("STALE_FENCE");
      this.claims.writable(tx, binding.requestId, binding.claim);
      this.assertChild(tx, binding, "dispatching");
      return {
        active: true,
        binding,
        descriptor,
        id,
        issuedRevision: row.revision,
      };
    });
    this.issuances.set(id, issuance);
    return {
      validate: () => this.validate(issuance),
      confirmScheduled: () => this.confirm(issuance),
      dispose: () => {
        issuance.active = false;
        if (
          issuance.confirmedRevision !== undefined &&
          this.issuances.get(id) === issuance
        )
          this.issuances.delete(id);
      },
    };
  }

  private confirm(issuance: Issuance): void {
    this.assertKnown(issuance);
    const revision = this.claims.store.transaction((tx) => {
      const row = this.assertBoundRequest(tx, issuance.binding);
      if (!sameFence(row.claim, issuance.binding.claim)) fault("STALE_FENCE");
      this.claims.writable(
        tx,
        issuance.binding.requestId,
        issuance.binding.claim,
      );
      this.assertChild(tx, issuance.binding, "returned");
      if (row.revision !== issuance.issuedRevision + 1) fault("STALE_FENCE");
      return row.revision;
    });
    issuance.confirmedRevision = revision;
    if (!issuance.active && this.issuances.get(issuance.id) === issuance)
      this.issuances.delete(issuance.id);
  }

  private validate(issuance: Issuance): void {
    this.assertIssued(issuance);
    const now = this.claims.contexts.clock.now();
    if (
      now >= issuance.descriptor.expiresAt ||
      now >= issuance.binding.deadlineAt
    )
      fault("CONTEXT_EXPIRED");
    this.claims.store.transaction((tx) => {
      const row = this.assertBoundRequest(tx, issuance.binding);
      if (row.result.status === "queued") {
        if (!sameFence(row.claim, issuance.binding.claim)) fault("STALE_FENCE");
        this.claims.writable(
          tx,
          issuance.binding.requestId,
          issuance.binding.claim,
        );
        return;
      }
      if (
        row.result.status !== "executor-completed" ||
        row.claim !== null ||
        issuance.confirmedRevision === undefined ||
        row.revision !== issuance.confirmedRevision + 1 ||
        row.result.revision !== row.revision
      )
        fault("STALE_FENCE");
      this.assertChild(tx, issuance.binding, "returned");
    });
  }

  private assertIssued(issuance: Issuance): void {
    if (
      !issuance.active ||
      this.stopped
    )
      fault("CANCELLED");
    this.assertKnown(issuance);
  }

  private assertKnown(issuance: Issuance): void {
    if (this.stopped || this.issuances.get(issuance.id) !== issuance)
      fault("CANCELLED");
  }

  private assertBoundRequest(
    tx: Transaction,
    binding: BoundExecution,
  ): OutboxRecord {
    const current = this.claims.contexts.current(
      tx,
      binding.context.principalId,
      binding.context.contextId,
    );
    if (
      current.contextId !== binding.context.contextId ||
      current.principalId !== binding.context.principalId ||
      current.taskId !== binding.context.taskId ||
      current.generation !== binding.context.generation ||
      !sameScope(current.scope, binding.context.scope) ||
      !sameScope(current.scope, this.route.scope)
    )
      fault("STALE_GENERATION");
    this.assertRoute(binding);
    this.claims.contexts.action(tx, current, binding.action);
    const row = this.claims.contexts.owned(tx, binding.requestId, current);
    const target = tx.get("references", this.route.scope.spaceId);
    if (
      row.id !== binding.requestId ||
      row.principalId !== binding.context.principalId ||
      row.taskId !== binding.context.taskId ||
      row.generation !== binding.context.generation ||
      !sameScope(row.scope, binding.context.scope) ||
      !isDeepStrictEqual(row.action, binding.action) ||
      !isDeepStrictEqual(row.admission, binding.admission) ||
      row.argumentDigest !== argumentDigest(binding.action) ||
      row.result.requestId !== binding.requestId ||
      row.cancellationRequestedAt !== null ||
      !target ||
      target.providerId !== this.route.conversationId ||
      target.ownedByPrincipalId !== binding.context.principalId ||
      target.taskId !== binding.context.taskId ||
      target.generation !== binding.context.generation ||
      !sameScope(target.scope, binding.context.scope) ||
      !isDeepStrictEqual(target.reference, binding.action.arguments.space)
    )
      fault("FORBIDDEN");
    return row;
  }

  private assertRoute(binding: BoundExecution): void {
    if (
      !sameScope(binding.action.arguments.space.scope, this.route.scope) ||
      binding.action.arguments.space.id !== this.route.scope.spaceId
    )
      fault("SCOPE_MISMATCH");
    try {
      if (
        !sameScope(this.routes.inbound(this.route.phone, this.route.conversationId), binding.context.scope)
      )
        fault("SCOPE_MISMATCH");
    } catch {
      fault("SCOPE_MISMATCH");
    }
  }

  private assertChild(
    tx: Transaction,
    binding: BoundExecution,
    phase: "dispatching" | "returned",
  ): void {
    const childId = childIdentity(binding.requestId, 0);
    const childArgumentsDigest = createHash("sha256")
      .update(canonicalJson(binding.action))
      .digest("hex");
    const stableKey = digest([
      `${binding.requestId}:typing`,
      childArgumentsDigest,
    ]);
    const attemptId = digest([childId, binding.claim.fence]);
    const child = tx.get("children", childId);
    const attempt = tx.get("attempts", attemptId);
    if (
      !child ||
      child.requestId !== binding.requestId ||
      child.index !== 0 ||
      child.stableKey !== stableKey ||
      child.state !== (phase === "dispatching" ? "dispatching" : "completed") ||
      !attempt ||
      attempt.requestId !== binding.requestId ||
      !sameClaim(attempt.claim, binding.claim) ||
      attempt.phase !== phase
    )
      fault("STALE_FENCE");
    if (phase === "dispatching") return;
    const checkpoint = tx.get("checkpoints", childId);
    if (
      !checkpoint ||
      checkpoint.requestId !== binding.requestId ||
      checkpoint.codecId !== "wt01-execute-child" ||
      checkpoint.codecVersion !== 1 ||
      !sameClaim(checkpoint.claim, binding.claim)
    )
      fault("STALE_FENCE");
    let scheduled: unknown;
    try {
      scheduled = JSON.parse(checkpoint.payloadJson);
    } catch {
      fault("STALE_FENCE");
    }
    if (
      !scheduled ||
      typeof scheduled !== "object" ||
      (scheduled as { requestId?: unknown }).requestId !== binding.requestId ||
      (scheduled as { status?: unknown }).status !== "executor-completed"
    )
      fault("STALE_FENCE");
  }

  /** Invalidate every transient issuance before provider/store shutdown. */
  shutdown(): void {
    this.stopped = true;
    this.issuances.clear();
  }
}
