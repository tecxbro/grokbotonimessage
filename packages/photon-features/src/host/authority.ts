import { isDeepStrictEqual } from "node:util";
import type { ResourceRef, TrustedContext } from "../contracts/index.js";
import { sameScope } from "../contracts/resources.js";
import type { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import { ProviderContext } from "../adapters/transport/provider-context.js";
import { requireRoutedConfiguration, providerRoutePhone, type NormalizedHostConfiguration, type ProductionHostConfiguration } from "./configuration.js";

export interface DurableAuthorityBinding {
  context: TrustedContext;
  conversationId: string;
}

export function configuredAuthority(input: ProductionHostConfiguration | NormalizedHostConfiguration): {
  context: TrustedContext;
  conversationId: string;
} {
  const configuration = requireRoutedConfiguration(input);
  const routes = new ProviderContext(configuration.provider.projectId, [{ accountId: configuration.provider.accountId,
    lineId: configuration.provider.lineId, dedicated: configuration.provider.dedicated, servingPhone: configuration.provider.phone }]);
  return {
    conversationId: configuration.provider.conversationId,
    context: {
      version: 1,
      contextId: configuration.task.contextId,
      principalId: configuration.local.principalId,
      scope: routes.inbound(providerRoutePhone(configuration), configuration.provider.conversationId),
      taskId: configuration.task.taskId,
      generation: configuration.task.generation,
      permissions: configuration.task.permissions,
      issuedAt: configuration.task.issuedAt,
      expiresAt: configuration.task.expiresAt,
      revokedAt: null,
    },
  };
}

function configuredSpace(context: TrustedContext): Extract<ResourceRef, { kind: "space" }> {
  return {
    version: 1,
    kind: "space",
    id: context.scope.spaceId,
    scope: context.scope,
  };
}

/**
 * Create one new single-route binding, or validate and return the existing
 * durable grant. Startup configuration is never an authority transition.
 */
export function bootstrapOrValidateAuthority(
  store: DurableSQLiteStore,
  configured: TrustedContext,
  conversationId: string,
  now: number,
): DurableAuthorityBinding {
  return resolveAuthority(store, configured, conversationId, now, true);
}

/** Read-only authority check for task launch after installation bootstrap. */
export function validateExistingAuthority(
  store: DurableSQLiteStore,
  configured: TrustedContext,
  conversationId: string,
  now: number,
): DurableAuthorityBinding {
  return resolveAuthority(store, configured, conversationId, now, false);
}

function resolveAuthority(
  store: DurableSQLiteStore,
  configured: TrustedContext,
  conversationId: string,
  now: number,
  allowBootstrap: boolean,
): DurableAuthorityBinding {
  return store.transaction((tx) => {
    const task = tx.get("tasks", configured.taskId);
    const context = tx.get("contexts", configured.contextId);
    const spaceRef = configuredSpace(configured);
    const space = tx.get("references", spaceRef.id);
    const scopedTasks = tx.list("tasks", configured.scope, 1000);
    const scopedContexts = tx.list("contexts", configured.scope, 1000);
    if (scopedTasks.length === 1000 || scopedContexts.length === 1000)
      throw new Error("AUTHORITY_BINDING_CONFLICT");

    const fresh = !task && !context && !space && !scopedTasks.length && !scopedContexts.length;
    if (fresh && allowBootstrap) {
      if (configured.revokedAt !== null || configured.issuedAt > now || configured.expiresAt <= now)
        throw new Error(configured.revokedAt !== null ? "AUTHORITY_REVOKED" : "AUTHORITY_EXPIRED");
      tx.put("tasks", {
        id: configured.taskId,
        scope: configured.scope,
        revision: 0,
        principalId: configured.principalId,
        generation: configured.generation,
        cancelledAt: null,
      }, null);
      tx.put("contexts", {
        id: configured.contextId,
        scope: configured.scope,
        revision: 0,
        context: configured,
      }, null);
      tx.put("references", {
        id: spaceRef.id,
        scope: configured.scope,
        revision: 0,
        reference: spaceRef,
        providerId: conversationId,
        ownedByPrincipalId: configured.principalId,
        taskId: configured.taskId,
        generation: configured.generation,
      }, null);
      return { context: configured, conversationId };
    }

    if (fresh) throw new Error("AUTHORITY_BINDING_MISSING");

    // Any incomplete identity is conflicting durable evidence, not a fresh grant.
    if (!task || !context || !space) throw new Error("AUTHORITY_BINDING_CONFLICT");
    const durable = context.context;
    if (
      context.id !== durable.contextId ||
      !sameScope(context.scope, durable.scope) ||
      task.id !== durable.taskId ||
      task.principalId !== durable.principalId ||
      task.generation !== durable.generation ||
      !sameScope(task.scope, durable.scope) ||
      space.reference.kind !== "space" ||
      !isDeepStrictEqual(space.reference, spaceRef) ||
      !sameScope(space.scope, durable.scope) ||
      space.providerId !== conversationId ||
      space.ownedByPrincipalId !== durable.principalId ||
      space.taskId !== durable.taskId ||
      space.generation !== durable.generation
    ) throw new Error("AUTHORITY_BINDING_CONFLICT");

    if (task.cancelledAt !== null) throw new Error("AUTHORITY_CANCELLED");
    if (durable.revokedAt !== null) throw new Error("AUTHORITY_REVOKED");
    if (durable.issuedAt > now || durable.expiresAt <= now) throw new Error("AUTHORITY_EXPIRED");
    // Exact equality deliberately includes permissions, issuance, expiry and
    // every principal/task/scope identity field. Broader, narrower, newer and
    // older configuration are all administrative work, not startup work.
    if (!isDeepStrictEqual(configured, durable)) throw new Error("AUTHORITY_CONFIGURATION_MISMATCH");
    return { context: durable, conversationId: space.providerId };
  });
}
