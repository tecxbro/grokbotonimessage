import { isDeepStrictEqual } from "node:util";
import type {
  Action,
  AuthenticatedPrincipal,
  Capability,
  IncomingEvent,
  LocalRequest,
  Operation,
  ResourceRef,
  Scope,
  TrustedContext,
} from "../contracts/index.js";
import type { FeatureModule } from "../contracts/feature.js";
import type { LocalResponse } from "./protocol.js";
import type { ExecutionServices as PublicExecutionServices } from "../contracts/services.js";
import type { ResourceResolver } from "../contracts/ports.js";
import { sameScope } from "../contracts/resources.js";
import { registerFeatureModules } from "../registry/modules.js";
import { createRuntimeHost, type LocalExecutor } from "./main.js";
import { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import { FileCaptureStore } from "../adapters/transport/capture.js";
import { ProviderContext, resolveProviderContext } from "../adapters/transport/provider-context.js";
import { SpectrumEventSource } from "../adapters/transport/event-source.js";
import { SpectrumOwner, cloudSdkFactory, type SdkFactory } from "../adapters/transport/spectrum-owner.js";
import { DurableContexts, type AuthorizationPolicy } from "../runtime/core/authorization.js";
import { DurableSubmission } from "../runtime/core/submission.js";
import { DurableRecovery, scanAll } from "../runtime/core/recovery.js";
import { DurableWork } from "../runtime/core/work-handoff.js";
import { DurableLocalProtocol, listenDurableLocal } from "../runtime/core/local-server.js";
import { ExecutionClaims } from "../runtime/core/claims.js";
import { executeOperation } from "../runtime/core/executor.js";
import { requestIdentity } from "../runtime/core/idempotency.js";
import { InboundRouter } from "../runtime/inbound/router.js";
import { TextBatcher } from "../runtime/inbound/batching.js";
import { recoverCaptures } from "../runtime/inbound/recovery.js";
import { configuredGrokWake, WakeDispatcher } from "../runtime/inbound/wake-dispatcher.js";
import { InboundPump } from "../runtime/inbound/pump.js";
import { TypingLeases } from "../runtime/typing/leases.js";
import { createTypingFeatureModule, createTypingModule, type BindTypingExecution } from "../runtime/typing/operations.js";
import { createTextMessageModule, createFeatureModule as createTextFeature } from "../features/text-messages/module.js";
import { createMediaModule, createFeatureModule as createMediaFeature } from "../features/media/module.js";
import { createPollModule, createFeatureModule as createPollFeature } from "../features/polls/module.js";
import { createCardsModule, createFeatureModule as createCardFeature } from "../features/cards/module.js";
import type { CardTemplate } from "../features/cards/configuration.js";
import { createNativeModule, createPublicFeatureModule as createNativeFeature, publicServiceAdapter } from "../features/native/module.js";
import { assembleFeatureSurface, createPollContentModule } from "../integration/assembly.js";
import type { ProductionHostConfiguration } from "./configuration.js";
import { readPrivateFile } from "./configuration.js";
import { GrokGatewayTaskHandoff, type GrokCommandRunner } from "./grok-wake.js";
import { bootstrapOrValidateAuthority, configuredAuthority } from "./authority.js";
import type { BindExecutionResources } from "../runtime/core/execution-services.js";
import { ProductionStreamRegistry } from "./stream-registry.js";
import { ProductionResourcePorts } from "./resource-ports.js";
import { dirname, join } from "node:path";
import { productionCapability } from "./capabilities.js";

const adminOperations = new Set<Operation>([
  "space.create", "space.rename", "space.addMembers", "space.removeMembers", "space.leave",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground", "account.shareContact",
]);

function rowFor(store: DurableSQLiteStore, reference: ResourceRef, context: TrustedContext) {
  const row = store.transaction(tx => tx.get("references", reference.id));
  if (!row || !sameScope(row.scope, context.scope) || !isDeepStrictEqual(row.reference, reference) ||
    row.ownedByPrincipalId !== context.principalId || row.taskId !== context.taskId ||
    row.generation !== context.generation || !row.providerId) throw new Error("RESOURCE_NOT_FOUND");
  return row;
}

function createResources(store: DurableSQLiteStore, owner: SpectrumOwner): ResourceResolver {
  return {
    resolve: async (reference, context) => {
      if (reference.kind === "stream") {
        const row = store.transaction(tx => tx.get("streams", reference.id));
        if (!row || !sameScope(row.scope, context.scope) || !isDeepStrictEqual(row.reference, reference) ||
          row.principalId !== context.principalId || row.taskId !== context.taskId ||
          reference.generation !== context.generation) throw new Error("RESOURCE_NOT_FOUND");
        return row.reference;
      }
      return rowFor(store, reference, context).reference;
    },
    space: async (reference, context) => {
      if (reference.kind !== "space") throw new Error("RESOURCE_NOT_FOUND");
      const row = rowFor(store, reference, context);
      return owner.space(context.scope, row.providerId);
    },
    message: async (reference, context) => {
      if (reference.kind !== "message") throw new Error("RESOURCE_NOT_FOUND");
      const message = rowFor(store, reference, context);
      const spaceRef: ResourceRef = { version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope };
      const spaceRow = rowFor(store, spaceRef, context);
      const space = await owner.space(context.scope, spaceRow.providerId);
      const resolved = await space.getMessage(message.providerId);
      if (!resolved || resolved.id !== message.providerId || resolved.space.id !== space.id)
        throw new Error("RESOURCE_NOT_FOUND");
      return resolved;
    },
  };
}

class ProductionLocalExecutor implements LocalExecutor {
  readonly contractVersion = "f0-services-2" as const;
  private registry?: ReturnType<typeof registerFeatureModules>;
  private active = false;
  private failed = false;
  private drive?: Promise<void>;
  private dirty = false;
  private readonly running = new Map<string, () => void>();

  constructor(
    private readonly store: DurableSQLiteStore,
    private readonly protocol: DurableLocalProtocol,
    private readonly claims: ExecutionClaims,
    private readonly recovery: DurableRecovery,
    private readonly router: InboundRouter,
    private readonly captures: FileCaptureStore,
    private readonly providerRoutes: ProviderContext,
    private readonly resources: ResourceResolver,
    private readonly bindResources: (requestId: string) => BindExecutionResources,
    private readonly capability: (operation: Operation, context: TrustedContext, action?: Action) => Capability,
    private readonly pump: InboundPump,
    private readonly report: (code: string) => void,
    private readonly concurrency = 4,
  ) {}

  async dispatch(request: LocalRequest, principal: AuthenticatedPrincipal): Promise<LocalResponse> {
    const response = await this.protocol.dispatch(request, principal) as LocalResponse;
    if (request.method === "request.cancel") this.running.get(request.requestId)?.();
    if (request.method === "submit" || request.method === "request.cancel") this.kick();
    return response;
  }
  registerFeatures(modules: readonly FeatureModule[]): void {
    if (this.registry) throw new Error("FEATURES_ALREADY_REGISTERED");
    this.registry = registerFeatureModules(modules, true);
  }
  ready(): boolean { return this.active && !this.failed && !!this.registry; }
  async recover(): Promise<void> {
    this.recovery.recover();
    await recoverCaptures(this.captures.ids(), this.captures, this.providerRoutes,
      this.claims.contexts.clock, event => this.router.accept(event));
  }
  async startOutbox(): Promise<void> {
    if (this.active) throw new Error("OUTBOX_ALREADY_STARTED");
    this.active = true;
    this.failed = false;
    await this.pump.start();
    this.kick();
  }
  async stopOutbox(): Promise<void> {
    this.active = false;
    for (const abort of this.running.values()) abort();
    await this.pump.stop();
    await this.drive;
  }
  capture(event: IncomingEvent): Promise<void> { return this.router.accept(event); }

  private kick(): void {
    if (!this.active) return;
    this.dirty = true;
    if (this.drive) return;
    this.drive = Promise.resolve().then(() => this.drain()).catch(() => {
      this.report("OUTBOX_FAILED");
      this.failed = true;
      this.active = false;
    }).finally(() => {
      this.drive = undefined;
      if (this.dirty && this.active) this.kick();
    });
  }
  private async drain(): Promise<void> {
    while (this.active && this.dirty) {
      this.dirty = false;
      this.recovery.recover();
      const queued = [...scanAll(this.store, "outbox")].filter(row => row.result.status === "queued");
      for (let offset = 0; offset < queued.length && this.active; offset += this.concurrency) {
        const batch = queued.slice(offset, offset + this.concurrency).map(row => {
          const handler = this.registry?.handlers.get(row.action.operation);
          if (!handler) throw new Error("UNIMPLEMENTED");
          return executeOperation({
            claims: this.claims,
            requestId: row.id,
            handler,
            capability: (context, action) => this.capability(row.action.operation, context, action),
            resources: this.resources,
            bindResources: this.bindResources(row.id),
            onRunning: (requestId, abort) => {
              this.running.set(requestId, abort);
              return () => { if (this.running.get(requestId) === abort) this.running.delete(requestId); };
            },
            afterCommit: () => { void this.pump.tick(); },
          });
        });
        const settled = await Promise.allSettled(batch);
        if (settled.some(result => result.status === "fulfilled" && result.value !== null)) this.dirty = true;
        if (settled.some(result => result.status === "rejected")) {
          this.report("OUTBOX_ITEM_FAILED");
          this.recovery.recover();
        }
      }
    }
  }
}

export interface ProductionCompositionDependencies {
  sdkFactory?: SdkFactory;
  grokRunner?: GrokCommandRunner;
  now?: () => number;
  report?: (code: string) => void;
}

export interface ProductionComposition {
  runtime: ReturnType<typeof createRuntimeHost>;
  executor: LocalExecutor;
  scope: Scope;
  context: TrustedContext;
  principal: AuthenticatedPrincipal;
  registerTextStream(principal: AuthenticatedPrincipal, source: AsyncIterable<string>, expiresAt: number): Promise<Extract<ResourceRef, { kind: "stream" }>>;
  importMediaFile(principal: AuthenticatedPrincipal, filename: string,
    metadata: import("../features/media/metadata.js").SourceMetadata): Promise<import("../features/media/staging.js").StagedMedia>;
  startLocalInterface(): Promise<{ close(): Promise<void> }>;
}

/** Complete single-route production composition. Construction may open only
 * private local state/secrets; provider, ingress, socket and Grok wake remain
 * inactive until runtime.start()/startLocalInterface(). */
export async function createProductionComposition(
  configuration: ProductionHostConfiguration,
  installationRoot: string,
  releaseRoot: string,
  dependencies: ProductionCompositionDependencies = {},
): Promise<ProductionComposition> {
  const now = dependencies.now ?? Date.now;
  const projectSecret = (await readPrivateFile(configuration.provider.projectSecretFile, 16 * 1024)).trim();
  const localToken = (await readPrivateFile(configuration.local.credentialFile, 128)).trim();
  if (!projectSecret || projectSecret.length > 8192) throw new Error("INVALID_PROJECT_SECRET");
  if (!/^[a-fA-F0-9]{64}$/.test(localToken)) throw new Error("INVALID_LOCAL_CREDENTIAL");

  const providerRoutes = new ProviderContext(configuration.provider.projectId, [{
    accountId: configuration.provider.accountId,
    lineId: configuration.provider.lineId,
    phone: configuration.provider.phone,
  }]);
  const authority = configuredAuthority(configuration);
  const scope = authority.context.scope;
  const principal: AuthenticatedPrincipal = {
    id: configuration.local.principalId,
    osUid: process.getuid?.() ?? 0,
    credentialId: configuration.local.credentialId,
    authenticatedAt: now(),
  };
  const store = new DurableSQLiteStore(configuration.runtime.statePath, now);
  try {
    const { context } = bootstrapOrValidateAuthority(
      store,
      authority.context,
      authority.conversationId,
      now(),
    );

  const administrative = new Set(configuration.authorization.administrativeOperations);
  const recipients = new Set(configuration.authorization.allowedRecipients.map(value => value.toLowerCase()));
  const policy: AuthorizationPolicy = {
    administrativeIntent: (_context, action) => !adminOperations.has(action.operation) || administrative.has(action.operation),
    recipientsAllowed: (_context, values) => values.every(value => recipients.has(value.toLowerCase())),
  };
  const contexts = new DurableContexts(store, { now }, policy);
  const submission = new DurableSubmission(store, contexts);
  const claims = new ExecutionClaims(store, contexts);
  const recovery = new DurableRecovery(store, contexts);
  const work = new DurableWork(store, contexts);
  const owner = new SpectrumOwner(
    { inbound: "photon-stream", outbound: "imessage", wake: "existing-grok-task-handoff" },
    providerRoutes,
    dependencies.sdkFactory ?? cloudSdkFactory({ projectId: configuration.provider.projectId, projectSecret }),
  );
  const resources = createResources(store, owner);
  const mediaProvider = async (trusted: TrustedContext) => {
    if (!sameScope(trusted.scope, scope)) throw new Error("SCOPE_MISMATCH");
    const provider = owner.provider();
    return { scope, phone: configuration.provider.phone, conversationId: configuration.provider.conversationId,
      provider, space: (reference: ResourceRef) => resources.space(reference, trusted),
      message: (reference: ResourceRef) => resources.message(reference, trusted) };
  };
  const streamRegistry = new ProductionStreamRegistry(store, contexts, principal);
  const resourcePorts = new ProductionResourcePorts({
    stagingDirectory: configuration.runtime.stagingDirectory,
    approvedRoots: [configuration.runtime.importDirectory ?? join(dirname(configuration.runtime.statePath), "imports")],
    provider: mediaProvider,
    streams: streamRegistry,
    store,
    contexts,
    principal,
  });
  const binding = () => ({ scope, phone: configuration.provider.phone, nativeSpaceId: configuration.provider.conversationId });
  const request = (action: Action, services: { context: TrustedContext }) => requestIdentity(action, services.context);
  const typing = new TypingLeases({ now }, async target => {
    if (!sameScope(target, scope)) throw new Error("SCOPE_MISMATCH");
    return owner.space(scope, configuration.provider.conversationId);
  });
  const legacyTypingBind: BindTypingExecution = (action, services) => ({
    requestId: requestIdentity(action, services.context),
    resultRevision: 0,
    expiresAt: Math.min(services.context.expiresAt, services.claim.leaseUntil),
    assertCurrent: () => undefined,
  });
  const publicTypingBind = (action: Extract<Action, { operation: "typing.begin" | "typing.end" }>,
    services: PublicExecutionServices) => ({
    requestId: requestIdentity(action, services.context),
    resultRevision: 0,
    expiresAt: Math.min(services.context.expiresAt, services.claim.leaseUntil),
    assertCurrent: () => services.assertActiveClaim(),
  });
  const legacyText = createTextMessageModule({ binding, requestId: request });
  const legacyMedia = createMediaModule({
    bindings: async () => ({ scope, phone: configuration.provider.phone,
      conversationId: configuration.provider.conversationId, provider: owner.provider() }),
    voiceBehavior: "native",
  });
  const legacyPoll = createPollModule();
  const templates = configuration.cards as readonly CardTemplate[];
  const legacyCards = createCardsModule({ templates, binding, requestId: request });
  const nativeDependencies = {
    binding: async (trusted: TrustedContext) => {
      if (!sameScope(trusted.scope, scope)) throw new Error("SCOPE_MISMATCH");
      return { scope, phone: configuration.provider.phone, dedicated: configuration.provider.dedicated,
        accountReady: owner.ready(), availableOperations: configuration.provider.availableOperations,
        provider: owner.provider() };
    },
    authorizeIntent: async (action: Action) => {
      if (adminOperations.has(action.operation) && !administrative.has(action.operation)) throw new Error("FORBIDDEN");
      if ("members" in action.arguments && !action.arguments.members.every(value => recipients.has(value.toLowerCase())))
        throw new Error("FORBIDDEN");
    },
    authorizeContent: async () => {
      if (!configuration.authorization.allowNativeContent) throw new Error("FORBIDDEN");
    },
    compilers: [...legacyText.compilers, ...legacyMedia.compilers, ...legacyCards.compilers],
    resources,
  };
  const legacyNative = createNativeModule(nativeDependencies);
  const compatibilityModules = [
    createTypingModule(typing, legacyTypingBind), legacyText, legacyMedia, legacyPoll, legacyCards,
    legacyNative, createPollContentModule(),
  ];
  const publicCompilers = compatibilityModules.flatMap(module => module.compilers).map(compiler => ({
    family: compiler.family,
    compile: (content: import("../contracts/content.js").ContentSpec, services: PublicExecutionServices) =>
      compiler.compile(content, publicServiceAdapter(services, nativeDependencies, services.signal)),
  }));
  const scopedProvider = resolveProviderContext(owner, scope, configuration.provider.conversationId);
  const publicModules = [
    createTypingFeatureModule(typing, publicTypingBind),
    createTextFeature({ provider: scopedProvider, binding, resources, compilers: () => publicCompilers }),
    createMediaFeature({
      provider: mediaProvider,
      voiceBehavior: "native",
      stageAttachment: (reference, services) => resourcePorts.stageAttachment(reference, services),
    }),
    createPollFeature({ resolveSpace: resources.space }),
    createCardFeature({ templates, binding, space: (reference, services) => resources.space(reference, services.context), requestId: request }),
    createNativeFeature(nativeDependencies),
  ];
  const assembled = assembleFeatureSurface({ publicModules, compatibilityModules });
  const configured = new Set(configuration.provider.availableOperations);
  const declared = new Map(compatibilityModules.flatMap(module => module.capabilities).map(capability => [capability.operation as Operation, capability]));
  const registeredHandlers = new Set(assembled.publicRegistry.handlers.keys());
  const capability = (operation: Operation, trusted: TrustedContext, action?: Action): Capability => productionCapability(
    operation,
    trusted,
    {
      scope,
      ownerReady: owner.ready(),
      configuredOperations: configured,
      registeredHandlers,
      administrativeOperations: administrative,
      allowNativeContent: configuration.authorization.allowNativeContent,
      configuredCardTemplates: templates.length,
      resources: true,
      media: true,
      streams: true,
      checkedAt: now(),
    },
    declared.get(operation),
    action,
  );

  const router = new InboundRouter(store, { now }, {
    route: event => sameScope(event.scope, scope) ? {
      taskId: context.taskId, generation: context.generation, principalId: context.principalId,
    } : undefined,
    continuation: event => event.type === "poll" || event.type === "app-interaction",
  }, [...assembled.compatibilityRegistry.reducers.values()]);
  const captures = new FileCaptureStore(configuration.runtime.captureDirectory);
  const handoff = new GrokGatewayTaskHandoff({
    executable: configuration.grok.executable,
    agentId: configuration.task.grokAgentId,
    taskId: context.taskId,
    generation: context.generation,
    installationRoot,
    releaseRoot,
    timeoutMs: configuration.grok.timeoutMs,
  }, dependencies.grokRunner);
  const wake = configuredGrokWake(handoff);
  const dispatcher = new WakeDispatcher(store, { now }, wake);
  const batcher = new TextBatcher(router);
  const pump = new InboundPump(() => [{ scope, task: {
    taskId: context.taskId, generation: context.generation, principalId: context.principalId,
  } }], batcher, dispatcher, dependencies.report ?? (() => undefined));
  let diagnostics: () => { ready: boolean; activation: "disabled" | "enabled" } =
    () => ({ ready: false, activation: configuration.activation });
  const protocol = new DurableLocalProtocol({ contexts, submission, work,
    capabilities: trusted => configuration.task.permissions.map(operation => capability(operation, trusted)),
    diagnostics: () => diagnostics(),
  });
  const executor = new ProductionLocalExecutor(store, protocol, claims, recovery, router, captures,
    providerRoutes, resources, requestId => services => resourcePorts.bind(requestId, services), capability, pump,
    dependencies.report ?? (() => undefined));
  const ingressSource = new SpectrumEventSource(owner, captures, { now }, diagnostic =>
    (dependencies.report ?? (() => undefined))(diagnostic.code));
  const ingress = {
    authentication: "authenticated-stream" as const,
    start: (accept: (event: IncomingEvent) => Promise<void>) => ingressSource.start(accept),
    stop: () => ingressSource.stop(),
  };
  const runtime = createRuntimeHost({ provider: scopedProvider, ingress, wake, store, executor, modules: publicModules });
  diagnostics = () => ({ ready: runtime.doctor().ready, activation: configuration.activation });
    return {
      runtime,
      executor,
      scope,
      context,
      principal,
      registerTextStream: (caller, source, expiresAt) => streamRegistry.register(caller, context.contextId, source, expiresAt),
      importMediaFile: (caller, filename, metadata) => resourcePorts.importFile(caller, context.contextId, filename, metadata),
      startLocalInterface: () => listenDurableLocal(configuration.local.socketPath,
        [{ token: localToken, principal }], executor),
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
