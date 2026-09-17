import { configurationBlockers } from "./configuration-inventory.js";
import { SignedCardBackend } from "./card-backend.js";
import { ProductionTextProducer } from "./text-producer.js";
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
import { InboundRouter, activeRoute } from "../runtime/inbound/router.js";
import { TextBatcher } from "../runtime/inbound/batching.js";
import { recoverCaptures } from "../runtime/inbound/recovery.js";
import type { Correlations, CapturedMessage } from "../runtime/inbound/normalize.js";
import { incomingReferenceBindings } from "../runtime/inbound/normalize.js";
import type { CaptureProcessing } from "../adapters/transport/message-events.js";
import type { ReceiptAcquisition } from "../runtime/inbound/receipt-observer.js";
import { configuredGrokWake, WakeDispatcher } from "../runtime/inbound/wake-dispatcher.js";
import { InboundPump } from "../runtime/inbound/pump.js";
import { TypingLeases } from "../runtime/typing/leases.js";
import { createTypingFeatureModule, createTypingModule, type BindTypingExecution } from "../runtime/typing/operations.js";
import { createTextMessageModule, createFeatureModule as createTextFeature } from "../features/text-messages/module.js";
import { createMediaModule, createFeatureModule as createMediaFeature } from "../features/media/module.js";
import { createPollModule, createFeatureModule as createPollFeature } from "../features/polls/module.js";
import type { PollManagement, PollProviderBinding } from "../features/polls/sdk.js";
import { createCardsModule, createFeatureModule as createCardFeature } from "../features/cards/module.js";
import { createInteractionAdapter, type AppBackendContract, type InteractionResult } from "../features/cards/interaction-adapter.js";
import type { CardTemplate } from "../features/cards/configuration.js";
import { CardRuntime } from "../features/cards/operations.js";
import { SESSION_CODEC } from "../features/cards/session-codec.js";
import { key as cardStateKey } from "../features/cards/state.js";
import { createNativeModule, createPublicFeatureModule as createNativeFeature, publicServiceAdapter } from "../features/native/module.js";
import { assembleFeatureSurface, createPollContentModule } from "../integration/assembly.js";
import type { ProductionHostConfiguration } from "./configuration.js";
import { readPrivateFile } from "./configuration.js";
import { GrokGatewayTaskHandoff, type GrokCommandRunner, type GrokCommandStyle, type GrokHelpInspector } from "./grok-wake.js";
import { bootstrapOrValidateAuthority, configuredAuthority } from "./authority.js";
import type { BindExecutionResources } from "../runtime/core/execution-services.js";
import { ProductionStreamRegistry } from "./stream-registry.js";
import { ProductionResourcePorts } from "./resource-ports.js";
import { dirname, join } from "node:path";
import { productionCapability } from "./capabilities.js";
import { registerIncomingReferences } from "./incoming-resources.js";
import { createPollCorrelations, routePollEvent, type NativePollVoteIdentity } from "./poll-correlations.js";
import { HostTypingBinding } from "./typing-binding.js";

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
      if (reference.kind !== "message" && reference.kind !== "reaction") throw new Error("RESOURCE_NOT_FOUND");
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
    private readonly correlations: Correlations,
    private readonly captureProcessing: {
      owner: SpectrumOwner;
      receipts: ReceiptAcquisition;
      registerReferences: CaptureProcessing["registerReferences"];
      authorize?: CaptureProcessing["authorize"];
    },
    private readonly pump: InboundPump,
    private readonly stopTyping: () => Promise<void>,
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
      this.claims.contexts.clock, event => this.router.accept(event), this.correlations, this.captureProcessing);
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
    const failures: unknown[] = [];
    const typingCleanup = this.stopTyping();
    try { await this.pump.stop(); } catch (error) { failures.push(error); }
    try { await this.drive; } catch (error) { failures.push(error); }
    try { await typingCleanup; } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "OUTBOX_SHUTDOWN_FAILED");
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
  grokCommandStyle?: GrokCommandStyle;
  grokHelpInspector?: GrokHelpInspector;
  /** Optional approved adapter over the already-owned provider connection. The
   * shipped Spectrum 12.8.0 adapter cannot supply this public surface. */
  pollManagement?: (context: TrustedContext) => Promise<PollManagement>;
  /** Authenticated provider metadata extractor. It must return exact native IDs;
   * the shipped Spectrum snapshot intentionally returns no inferred fallback. */
  nativePollIdentity?: (message: CapturedMessage, scope: Scope) => NativePollVoteIdentity | undefined;
  /** Concrete deployment-owned verifier. Absence keeps callbacks unavailable. */
  cardBackend?: AppBackendContract;
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
  acceptCardInteraction(request: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<InteractionResult>;
  startLocalInterface(): Promise<{ close(): Promise<void> }>;
  startCardBackend(): Promise<{ close(): Promise<void> } | undefined>;
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
    dedicated: configuration.provider.dedicated,
    servingPhone: configuration.provider.phone,
  }]);
  const providerRoutePhone = configuration.provider.dedicated ? configuration.provider.phone : "shared";
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
    return { scope, phone: providerRoutePhone, conversationId: configuration.provider.conversationId,
      provider, space: (reference: ResourceRef) => resources.space(reference, trusted),
      message: (reference: ResourceRef) => resources.message(reference, trusted) };
  };
  const streamRegistry = new ProductionStreamRegistry(store, contexts, principal);
  const textProducer = new ProductionTextProducer(streamRegistry, contexts);
  const resourcePorts = new ProductionResourcePorts({
    stagingDirectory: configuration.runtime.stagingDirectory,
    approvedRoots: [configuration.runtime.importDirectory ?? join(dirname(configuration.runtime.statePath), "imports")],
    provider: mediaProvider,
    streams: streamRegistry,
    store,
    contexts,
    principal,
  });
  const binding = () => ({ scope, phone: providerRoutePhone, nativeSpaceId: configuration.provider.conversationId });
  const request = (action: Action, services: { context: TrustedContext }) => requestIdentity(action, services.context);
  const typing = new TypingLeases(
    { now },
    async target => {
      if (!sameScope(target, scope)) {
        throw new Error("SCOPE_MISMATCH");
      }

      return owner.space(scope, configuration.provider.conversationId);
    },
    undefined, // Keep the existing default timers.
    dependencies.report, // Forward typing diagnostics to the host.
  );
  const legacyTypingBind: BindTypingExecution = (action, services) => ({
    requestId: requestIdentity(action, services.context),
    resultRevision: 0,
    expiresAt: Math.min(services.context.expiresAt, services.claim.leaseUntil),
    assertCurrent: () => undefined,
  });
  const typingBinding = new HostTypingBinding(claims, providerRoutes, {
    scope,
    conversationId: configuration.provider.conversationId,
    phone: providerRoutePhone,
  });
  const publicTypingBind = (action: Extract<Action, { operation: "typing.begin" | "typing.end" }>,
    services: PublicExecutionServices) => typingBinding.bind(action, services);
  const legacyText = createTextMessageModule({ binding, requestId: request });
  const legacyMedia = createMediaModule({
    bindings: async () => ({ scope, phone: providerRoutePhone,
      conversationId: configuration.provider.conversationId, provider: owner.provider() }),
    voiceBehavior: "native",
  });
  const pollManagementAvailable = dependencies.pollManagement !== undefined;
  // Public Spectrum PollOption content is sufficient for conversational answers.
  // Native identity remains an optional, stricter attribution/management seam.
  const voteIngressAvailable = true;
  const nativePollIdentityAvailable = dependencies.nativePollIdentity !== undefined;
  const legacyPoll = createPollModule({
    management: pollManagementAvailable ? "available" : "unavailable",
    voteIngress: voteIngressAvailable ? "available" : "unavailable",
    reduction: nativePollIdentityAvailable
      ? { orderedSources: ["spectrum.messages"], selectionSemantics: "independent-option-deltas" }
      : { orderedSources: [] },
  });
  const backend = configuration.cardBackend ? new SignedCardBackend(configuration.cardBackend,
    join(dirname(configuration.runtime.statePath), "card-pages"), store) : undefined;
  await backend?.initialize();
  const templates: readonly CardTemplate[] = configuration.cards.map(template =>
    template.backendId && backend ? backend.template(template) : template);
  const legacyCards = createCardsModule({ templates, binding, requestId: request });
  const nativeDependencies = {
    registerCreatedSpaceForExecution: (space: import("../features/native/sdk.js").NativeSpace, services: PublicExecutionServices): ResourceRef => {
      services.assertActiveClaim();
      if (space.phone !== providerRoutePhone) throw new Error("SCOPE_MISMATCH");
      const newScope = providerRoutes.inbound(space.phone, space.id);
      const reference: ResourceRef = { version: 1, kind: "space", id: newScope.spaceId, scope: newScope };
      store.transaction(tx => {
        contexts.refresh(tx, services.context);
        const previous = tx.get("references", reference.id);
        if (previous) {
          if (previous.providerId !== space.id || previous.taskId !== services.context.taskId ||
            previous.generation !== services.context.generation || previous.ownedByPrincipalId !== services.context.principalId ||
            !isDeepStrictEqual(previous.reference, reference)) throw new Error("RESOURCE_CONFLICT");
        } else tx.put("references", { id: reference.id, scope: newScope, revision: 0, reference, providerId: space.id,
          taskId: services.context.taskId, generation: services.context.generation, ownedByPrincipalId: services.context.principalId }, null);
      });
      return reference;
    },
    retainAvatarForExecution: async (image: { bytes: Uint8Array; mimeType: string }, services: PublicExecutionServices) =>
      (await resourcePorts.mediaFor(services)).stage({ type: "bytes", bytes: image.bytes,
        metadata: { mimeType: image.mimeType, size: image.bytes.length } }, services.context),
    binding: async (trusted: TrustedContext) => {
      if (!sameScope(trusted.scope, scope)) throw new Error("SCOPE_MISMATCH");
      return { scope, phone: providerRoutePhone, dedicated: configuration.provider.dedicated,
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
  const pollBinding: PollProviderBinding = {
    resolveSpace: resources.space,
    binding: trusted => {
      if (!sameScope(trusted.scope, scope)) throw new Error("SCOPE_MISMATCH");
      return { scope, phone: providerRoutePhone, conversationId: configuration.provider.conversationId };
    },
    ...(dependencies.pollManagement ? { management: dependencies.pollManagement } : {}),
  };
  const cardRuntime = new CardRuntime({
    templates,
    binding,
    space: (reference, services) => resources.space(reference, services.context),
    requestId: request,
    updateRevision: (action, services) => {
      const captured = services.admission?.cardUpdate;
      return captured?.cardId === action.arguments.card.id && captured.sessionId === action.arguments.session.id
        ? captured.expectedRevision : undefined;
    },
  });
  const cardFeature = createCardFeature(cardRuntime);
  const persistCardSession = (result: import("../contracts/results.js").OperationResult,
    services: PublicExecutionServices) => {
    const session = result.references.find((reference): reference is Extract<ResourceRef, { kind: "card-session" }> =>
      reference.kind === "card-session");
    if (!session) return result;
    const payloadJson = cardRuntime.snapshot(session.id);
    if (!payloadJson) return result;
    services.assertActiveClaim();
    store.transaction(tx => {
      const mapped = tx.get("references", session.id);
      if (!mapped || !sameScope(mapped.scope, services.context.scope) ||
        mapped.taskId !== services.context.taskId || mapped.generation !== services.context.generation ||
        mapped.ownedByPrincipalId !== services.context.principalId || !isDeepStrictEqual(mapped.reference, session))
        throw new Error("RESOURCE_NOT_FOUND");
      const id = cardStateKey("session", session.id);
      const previous = tx.get("checkpoints", id);
      if (previous?.payloadJson === payloadJson) return;
      tx.put("checkpoints", {
        id,
        scope: session.scope,
        revision: previous ? previous.revision + 1 : 0,
        requestId: result.requestId,
        codecId: SESSION_CODEC.id,
        codecVersion: SESSION_CODEC.version,
        payloadJson,
        nextChildIndex: 0,
        claim: services.claim,
      }, previous?.revision ?? null);
    });
    return result;
  };
  const wiredCardFeature: typeof cardFeature = {
    ...cardFeature,
    handlers: {
      "app.send": async (action, services) => persistCardSession(
        await cardFeature.handlers["app.send"]!(action, services), services),
      "app.sendCustomized": async (action, services) => persistCardSession(
        await cardFeature.handlers["app.sendCustomized"]!(action, services), services),
      "app.update": async (action, services) => persistCardSession(
        await cardFeature.handlers["app.update"]!(action, services), services),
    },
  };
  const publicModules = [
    createTypingFeatureModule(typing, publicTypingBind),
    createTextFeature({ streamDelivery: configuration.textStreaming?.delivery ?? "progressive", provider: scopedProvider, binding, resources, compilers: () => publicCompilers }),
    createMediaFeature({
      provider: mediaProvider,
      voiceBehavior: "native",
      stageAttachment: (reference, services) => resourcePorts.stageAttachment(reference, services),
    }),
    createPollFeature(pollBinding),
    wiredCardFeature,
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
      operationBlockers: {
        ...configurationBlockers(configuration),
        "poll.get": pollManagementAvailable ? [] :
          ["The configured Spectrum owner has no approved public native poll-management adapter."],
        "poll.vote": pollManagementAvailable ? [] :
          ["The configured Spectrum owner has no approved public native poll-management adapter."],
        "poll.unvote": pollManagementAvailable ? [] :
          ["The configured Spectrum owner has no approved public native poll-management adapter."],
        "poll.addOption": pollManagementAvailable ? [] :
          ["The configured Spectrum owner has no approved public native poll-management adapter."],
        ...(action?.operation === "app.send" || action?.operation === "app.sendCustomized" ? {
          [action.operation]: templates.some(template => template.id === action.arguments.templateId &&
            template.kind === (action.operation === "app.send" ? "universal" : "customized")) ? [] :
            ["The requested template ID and kind must match a configured production card template."],
        } : {}),
      },
    },
    operation === "text.stream" && declared.has(operation) ? {
      ...declared.get(operation)!,
      providerSupport: configuration.textStreaming?.delivery === "buffered" ? "fallback" : "native",
      blockers: [configuration.textStreaming?.delivery === "buffered" ?
        "Explicit buffered fallback sends only after source completion." :
        "Public text(AsyncIterable) progressively sends and edits one remote message; SDK exposes only the final receipt."],
    } : declared.get(operation),
    action,
  );

  const router = new InboundRouter(store, { now }, {
    route: (event, tx) => {
      if (event.type === "poll" || (event.type === "poll-answer" && event.correlation))
        return routePollEvent(event, tx);
      return sameScope(event.scope, scope) ? {
        taskId: context.taskId, generation: context.generation, principalId: context.principalId,
      } : undefined;
    },
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
    commandStyle: dependencies.grokCommandStyle,
  }, dependencies.grokRunner, dependencies.grokHelpInspector);
  const wake = configuredGrokWake(handoff);
  const dispatcher = new WakeDispatcher(store, { now }, wake, configuration.task.grokAgentId);
  const interactions = createInteractionAdapter({
    backend: backend ?? dependencies.cardBackend,
    authorize: tx => { contexts.current(tx, context.principalId, context.contextId); },
    transactions: store,
    clock: { now },
    wake,
  });
  const batcher = new TextBatcher(router);
  const pump = new InboundPump(() => [{ scope, task: {
    taskId: context.taskId, generation: context.generation, principalId: context.principalId,
  } }], batcher, dispatcher, dependencies.report ?? (() => undefined));
  let diagnostics: () => { ready: boolean; activation: "disabled" | "enabled" } =
    () => ({ ready: false, activation: configuration.activation });
  const protocol = new DurableLocalProtocol({ contexts, submission, work,
    streamProducer: (caller, request) => textProducer.dispatch(caller, request),
    importMedia: (caller, contextId, input) => resourcePorts.importFile(caller, contextId, input.filename, input.metadata),
    capabilities: trusted => configuration.task.permissions.map(operation => capability(operation, trusted)),
    diagnostics: () => diagnostics(),
  });
  const correlations = createPollCorrelations(store, dependencies.nativePollIdentity ?? (() => undefined));
  const registerReferences: CaptureProcessing["registerReferences"] = async (snapshot, event) => {
    if (!sameScope(event.scope, scope)) throw new Error("SCOPE_MISMATCH");
    const bindings = incomingReferenceBindings(snapshot, event);
    store.transaction(tx => registerIncomingReferences(tx, context, bindings, now()));
  };
  const receipts: ReceiptAcquisition = {
    writer: store,
    resolveTarget: (receiptScope, providerTargetId) => {
      if (!sameScope(receiptScope, scope)) return;
      const matches = [...scanAll(store, "references")].filter(row =>
        row.reference.kind === "message" && row.providerId === providerTargetId &&
        sameScope(row.scope, receiptScope) && row.ownedByPrincipalId === context.principalId &&
        row.taskId === context.taskId && row.generation === context.generation,
      );
      return matches.length === 1 && matches[0]!.reference.kind === "message"
        ? { providerId: providerTargetId, reference: matches[0]!.reference }
        : undefined;
    },
  };
  const authorizeCapture = (event: IncomingEvent) => {
    // A new owner grant does not authorize historical captures. Preserve them
    // unresolved, and do not reassign already accepted resources or work to the
    // successor generation during restart/reconnect replay.
    if (!sameScope(event.scope, scope) || event.receivedAt < context.issuedAt) return false;
    return store.transaction(tx => {
      const prior = tx.get("inbox", event.eventId);
      if (prior && prior.event.receivedAt < context.issuedAt) return false;
      if (event.type === "message") {
        const reference = tx.get("references", event.message.id);
        if (reference && (reference.taskId !== context.taskId || reference.generation !== context.generation ||
          reference.ownedByPrincipalId !== context.principalId)) return false;
      }
      const route = {
        taskId: context.taskId,
        generation: context.generation,
        principalId: context.principalId,
      };
      const grant = tx.get("contexts", context.contextId);
      return activeRoute(tx, scope, route) &&
        !!grant && isDeepStrictEqual(grant.context, context) &&
        grant.context.revokedAt === null && grant.context.issuedAt <= now() &&
        grant.context.expiresAt > now();
    });
  };
  const captureProcessing = {
    owner,
    receipts,
    registerReferences,
    authorize: authorizeCapture,
  };
  const executor = new ProductionLocalExecutor(store, protocol, claims, recovery, router, captures,
    providerRoutes, resources, requestId => services => resourcePorts.bind(requestId, services), capability,
    correlations, captureProcessing, pump,
    async () => {
      textProducer.shutdown();
      typingBinding.shutdown();
      typing.shutdown();
      await typing.drain();
    },
    dependencies.report ?? (() => undefined));
  const ingressSource = new SpectrumEventSource(owner, captures, { now }, diagnostic =>
    (dependencies.report ?? (() => undefined))(diagnostic.code), correlations,
    { receipts, registerReferences, authorize: authorizeCapture });
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
      acceptCardInteraction: request => interactions.accept(request),
      startCardBackend: async () => {
        try { return await backend?.listen(request => interactions.accept(request)); }
        catch (error) { store.close(); throw error; }
      },
      startLocalInterface: () => listenDurableLocal(configuration.local.socketPath,
        [{ token: localToken, principal }], executor),
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
