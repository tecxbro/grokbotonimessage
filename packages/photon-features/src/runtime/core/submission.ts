import {
  type Action,
  type TrustedContext,
  type OperationResult,
} from "../../contracts/index.js";
import type { SubmissionPort } from "../../host/protocol.js";
import type {
  TransactionStore,
  OutboxRecord,
  Transaction,
} from "../../state/index.js";
import { admit, captureAdmission } from "./admission.js";
import { DurableContexts } from "./authorization.js";
import { argumentDigest, requestIdentity } from "./idempotency.js";
import { fault } from "./errors.js";
export function saveOutbox(
  tx: Transaction,
  row: OutboxRecord,
  now: number,
): void {
  const rev = row.revision;
  row.revision++;
  row.result.revision = row.revision;
  row.result.updatedAt = now;
  tx.put("outbox", row, rev);
}
export class DurableSubmission implements SubmissionPort {
  constructor(
    readonly store: TransactionStore,
    readonly contexts: DurableContexts,
    private readonly onCancel?: (id: string) => void,
  ) {}
  async submit(
    input: Action,
    supplied: TrustedContext,
  ): Promise<OperationResult> {
    return this.store.transaction(tx => this.submitInTransaction(tx, input, supplied));
  }
  /** Shared admission transaction used by final-output + handoff completion.
   * No provider I/O occurs here; existing claims still fence actual execution. */
  submitInTransaction(tx: Transaction, input: Action, supplied: TrustedContext): OperationResult {
    const action = admit(input);
    const c = this.contexts.refresh(tx, supplied),
      id = requestIdentity(action, c),
      hash = argumentDigest(action),
      old = tx.get("outbox", id);
    if (old) {
      this.contexts.owned(tx, id, c);
      if (old.argumentDigest !== hash) fault("IDEMPOTENCY_CONFLICT");
      // Completed/unknown child replay returns its durable result without
      // reacquiring a single-use stream or other consumed input.
      return old.result;
    }
    this.contexts.action(tx, c, action);
    const admission = captureAdmission(tx, action, c, this.contexts.clock.now());
    const result: OperationResult = {
      version: 1,
      requestId: id,
      status: "queued",
      revision: 0,
      updatedAt: this.contexts.clock.now(),
      references: [],
      observations: [],
    };
    tx.put(
      "outbox",
      {
        id,
        scope: c.scope,
        revision: 0,
        action,
        admission,
        principalId: c.principalId,
        taskId: c.taskId,
        generation: c.generation,
        argumentDigest: hash,
        result,
        claim: null,
        cancellationRequestedAt: null,
      },
      null,
    );
    return result;
  }

  async status(id: string, c: TrustedContext): Promise<OperationResult> {
    return this.store.transaction(
      (tx) => this.contexts.owned(tx, id, c).result,
    );
  }
  async cancel(id: string, c: TrustedContext): Promise<OperationResult> {
    const result = this.store.transaction((tx) => {
      const row = this.contexts.owned(tx, id, c);
      if (
        row.cancellationRequestedAt !== null ||
        !["queued", "blocked"].includes(row.result.status)
      )
        return row.result;
      row.cancellationRequestedAt = this.contexts.clock.now();
      // A claim may own an in-flight call. Only the executor/recovery can resolve that race.
      if (!row.claim) {
        row.result.status = "cancelled";
        row.result.error = {
          code: "CANCELLED",
          message: "CANCELLED",
          retry: "never",
        };
      }
      saveOutbox(tx, row, this.contexts.clock.now());
      return row.result;
    });
    this.onCancel?.(id);
    return result;
  }
}
