import type { ExecutionServices } from "../../contracts/services.js";
import type {
  Clock,
  MediaStager,
  RegisteredStreams,
  ResourceResolver,
} from "../../contracts/ports.js";
import type { ResourceRef } from "../../contracts/resources.js";
import type { Claim } from "../../state/index.js";
import type { ExecutionClaims } from "./claims.js";
import { canonical } from "./idempotency.js";
import { fault } from "./errors.js";
import { executeChild } from "./child-journal.js";
import { applyReceiptObservation } from "./receipt-state.js";
import { runUnitOfWorkTransaction } from "../../adapters/state/unit-of-work.js";

export type BindExecutionResources = (services: ExecutionServices) => Promise<{
  media: MediaStager;
  streams: RegisteredStreams;
}>;

export interface CreateExecutionServicesOptions {
  claims: ExecutionClaims;
  requestId: string;
  claim: Claim;
  controller: AbortController;
  deadlineMs: number;
  resources: ResourceResolver;
  media?: MediaStager;
  streams?: RegisteredStreams;
  /** Bind authority-bearing resource ports to this exact request and fence. */
  bindResources?: BindExecutionResources;
  clock?: Clock;
  afterCommit?(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): void;
}

/** Create the exact f0-services-2 facade; no private execution table escapes this object. */
export function createExecutionServices(
  options: CreateExecutionServicesOptions,
): ExecutionServices {
  const assertActiveClaim = () => {
    if (options.controller.signal.aborted) fault("CANCELLED");
    options.claims.store.transaction((tx) => {
      options.claims.writable(
        tx,
        options.requestId,
        options.claim,
      );
    });
  };
  const current = () =>
    options.claims.store.transaction(
      (tx) =>
        options.claims.writable(tx, options.requestId, options.claim).context,
    );
  const resolveAuthorized = (reference: ResourceRef) =>
    options.claims.store.transaction((tx) => {
      const { context } = options.claims.writable(
        tx,
        options.requestId,
        options.claim,
      );
      options.claims.contexts.reference(tx, context, reference);
      return context;
    });
  const context = current();
  Object.freeze(context.scope);
  Object.freeze(context.permissions);
  Object.freeze(context);
  let services!: ExecutionServices;
  let resourcesPromise: Promise<{ media: MediaStager; streams: RegisteredStreams }> | undefined;
  const boundResources = () => resourcesPromise ??= options.bindResources
    ? options.bindResources(services)
    : options.media && options.streams
      ? Promise.resolve({ media: options.media, streams: options.streams })
      : Promise.reject(new Error("RUNTIME_BINDING_UNAVAILABLE"));
  services = {
    context,
    claim: Object.freeze({ ...options.claim }),
    signal: options.controller.signal,
    clock: options.clock ?? options.claims.contexts.clock,
    assertActiveClaim,
    resolveResource: async (reference) => {
      const before = resolveAuthorized(reference);
      const resolved = await options.resources.resolve(reference, before);
      resolveAuthorized(reference);
      if (canonical(resolved) !== canonical(reference))
        fault("RESOURCE_NOT_FOUND");
      return resolved;
    },
    transaction: (run) =>
      runUnitOfWorkTransaction({
        claims: options.claims,
        requestId: options.requestId,
        claim: options.claim,
        run,
        afterCommit: options.afterCommit,
      }),
    executeChild: (child) =>
      executeChild({
        claims: options.claims,
        requestId: options.requestId,
        claim: options.claim,
        child,
        controller: options.controller,
        deadlineMs: options.deadlineMs,
      }),
    recordReceipt: async (observation) => {
      const before = current();
      applyReceiptObservation(options.claims.store, observation, before);
      current();
    },
    media: {
      resolve: async (media, supplied) => {
        const before = current();
        if (canonical(supplied) !== canonical(before)) fault("FORBIDDEN");
        const resolved = await (await boundResources()).media.resolve(media, before);
        current();
        return resolved;
      },
    },
    streams: {
      open: async (reference, supplied, signal) => {
        const before = current();
        if (canonical(supplied) !== canonical(before)) fault("FORBIDDEN");
        const reservation = {
          requestId: options.requestId,
          owner: options.claim.owner,
          fence: options.claim.fence,
          generation: options.claim.generation,
          reservedAt: options.claims.contexts.clock.now(),
        };
        options.claims.store.transaction(tx => {
          options.claims.writable(tx, options.requestId, options.claim);
          const row = tx.get("streams", reference.id);
          if (!row || row.state !== "reserved" || row.reservation ||
            row.principalId !== before.principalId || row.taskId !== before.taskId ||
            canonical(row.reference) !== canonical(reference)) fault("RESOURCE_NOT_FOUND");
          tx.put("streams", { ...row, reservation, revision: row.revision + 1 }, row.revision);
        });
        // The caller may add a deadline signal. Runtime cancellation must
        // remain effective without treating object identity as authority.
        const combined = AbortSignal.any([options.controller.signal, signal]);
        const finish = () => options.claims.store.transaction(tx => {
          const row = tx.get("streams", reference.id);
          if (row?.state === "reserved" && canonical(row.reservation) === canonical(reservation))
            tx.put("streams", { ...row, state: "closed", revision: row.revision + 1 }, row.revision);
        });
        let opened: AsyncIterable<string>;
        try {
          opened = await (await boundResources()).streams.open(reference, before, combined);
          current();
        } catch (error) {
          finish();
          throw error;
        }
        return {
          [Symbol.asyncIterator]() {
            const iterator = opened[Symbol.asyncIterator]();
            let finished = false;
            const close = () => { if (!finished) { finished = true; finish(); } };
            return {
              next: async () => {
                try {
                  const item = await iterator.next();
                  if (item.done) close();
                  return item;
                } catch (error) { close(); throw error; }
              },
              return: async () => {
                try { return iterator.return ? await iterator.return() : { done: true, value: undefined }; }
                finally { close(); }
              },
              throw: async error => {
                try { return iterator.throw ? await iterator.throw(error) : Promise.reject(error); }
                finally { close(); }
              },
            };
          },
        };
      },
    },
  };
  return services;
}
