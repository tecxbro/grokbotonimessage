import { randomUUID } from "node:crypto";
import type { AuthenticatedPrincipal, ResourceRef, TrustedContext } from "../contracts/index.js";
import type { ExecutionServices } from "../contracts/services.js";
import type { RegisteredStreams } from "../contracts/ports.js";
import type { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import type { DurableContexts } from "../runtime/core/authorization.js";
import { canonical } from "../runtime/core/idempotency.js";
import { sameScope } from "../contracts/resources.js";

type StreamRef = Extract<ResourceRef, { kind: "stream" }>;

interface RegisteredSource {
  contextId: string;
  principalId: string;
  taskId: string;
  generation: number;
  expiresAt: number;
  source: AsyncIterable<string>;
}

/** Trusted, in-process producer registry. Action JSON can carry only the inert reference. */
export class ProductionStreamRegistry {
  private readonly sources = new Map<string, RegisteredSource>();

  constructor(
    private readonly store: DurableSQLiteStore,
    private readonly contexts: DurableContexts,
    private readonly expectedPrincipal: AuthenticatedPrincipal,
  ) {}

  async register(
    principal: AuthenticatedPrincipal,
    contextId: string,
    source: AsyncIterable<string>,
    expiresAt: number,
  ): Promise<StreamRef> {
    if (
      principal.id !== this.expectedPrincipal.id ||
      principal.credentialId !== this.expectedPrincipal.credentialId ||
      principal.osUid !== this.expectedPrincipal.osUid ||
      !source || typeof source[Symbol.asyncIterator] !== "function"
    ) throw new Error("FORBIDDEN");
    const context = await this.contexts.resolve(principal, contextId);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.contexts.clock.now() || expiresAt > context.expiresAt)
      throw new Error("CONTEXT_EXPIRED");
    const reference: StreamRef = {
      version: 1,
      kind: "stream",
      id: `stream:${randomUUID()}`,
      scope: context.scope,
      generation: context.generation,
      expiresAt,
    };
    this.store.transaction((tx) => {
      const current = this.contexts.current(tx, principal.id, contextId);
      if (canonical(current) !== canonical(context)) throw new Error("STALE_GENERATION");
      tx.put("streams", {
        id: reference.id,
        scope: context.scope,
        revision: 0,
        reference,
        principalId: context.principalId,
        taskId: context.taskId,
        codecId: "production.incremental-text",
        codecVersion: 1,
        checkpointId: null,
        state: "registered",
      }, null);
    });
    this.sources.set(reference.id, {
      contextId,
      principalId: context.principalId,
      taskId: context.taskId,
      generation: context.generation,
      expiresAt,
      source,
    });
    return reference;
  }

  /** Drop unconsumed inert input after producer termination; durable rows remain evidence. */
  forget(id: string): void { this.sources.delete(id); }

  bind(requestId: string, services: ExecutionServices): RegisteredStreams {
    return {
      open: async (reference, supplied, signal) => {
        services.assertActiveClaim();
        if (
          canonical(supplied) !== canonical(services.context) ||
          !sameScope(reference.scope, services.context.scope) ||
          reference.generation !== services.context.generation ||
          reference.expiresAt <= services.clock.now()
        ) throw new Error("STREAM_UNAVAILABLE");
        const row = this.store.transaction(tx => tx.get("streams", reference.id));
        if (!row || row.state !== "reserved" || row.reservation?.requestId !== requestId ||
          row.reservation.owner !== services.claim.owner || row.reservation.fence !== services.claim.fence ||
          canonical(row.reference) !== canonical(reference) || !sameScope(row.scope, services.context.scope) ||
          row.principalId !== services.context.principalId || row.taskId !== services.context.taskId)
          throw new Error("STREAM_UNAVAILABLE");
        const registered = this.sources.get(reference.id);
        this.sources.delete(reference.id);
        if (
          !registered || registered.contextId !== services.context.contextId ||
          registered.principalId !== services.context.principalId ||
          registered.taskId !== services.context.taskId ||
          registered.generation !== services.context.generation ||
          registered.expiresAt !== reference.expiresAt
        ) {
          throw new Error("STREAM_SOURCE_UNAVAILABLE");
        }
        const combined = AbortSignal.any([services.signal, signal]);
        const source = registered.source[Symbol.asyncIterator]();
        const next = async (): Promise<IteratorResult<string>> => {
          combined.throwIfAborted();
          let onAbort: () => void = () => {};
          const aborted = new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(new Error("CANCELLED"));
            combined.addEventListener("abort", onAbort, { once: true });
          });
          try {
            const item = await Promise.race([source.next(), aborted]);
            combined.throwIfAborted();
            services.assertActiveClaim();
            if (!item.done && typeof item.value !== "string") throw new Error("INVALID_REQUEST");
            return item;
          } finally {
            combined.removeEventListener("abort", onAbort);
          }
        };
        return {
          [Symbol.asyncIterator]() { return {
            next,
            return: async () => source.return ? source.return() : { done: true, value: undefined },
            throw: async error => source.throw ? source.throw(error) : Promise.reject(error),
          }; },
        };
      },
    };
  }

}
