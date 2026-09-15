import { compilePoll } from "../features/polls/sdk.js";
import type { ContentSpec, FeatureModule as CompatibilityModule } from "../contracts/index.js";
import type { FeatureModule } from "../contracts/feature.js";
import type { Scope } from "../contracts/resources.js";
import { buildRegistry, operationRegistrations } from "../registry/index.js";
import { registerFeatureModules } from "../registry/modules.js";
import { createTypingModule, createTypingFeatureModule } from "../runtime/typing/operations.js";
import { TypingLeases } from "../runtime/typing/leases.js";
import { createTextMessageModule, textCapabilities, createFeatureModule as createTextFeature } from "../features/text-messages/module.js";
import { createMediaModule, createFeatureModule as createMediaFeature } from "../features/media/module.js";
import { createPollModule, createFeatureModule as createPollFeature } from "../features/polls/module.js";
import { createCardsModule, createFeatureModule as createCardFeature } from "../features/cards/module.js";
import { createNativeModule, createPublicFeatureModule as createNativeFeature } from "../features/native/module.js";

export const requiredCompilerFamilies = Object.freeze([
  "text",
  "markdown",
  "link",
  "group",
  "reply",
  "attachment",
  "voice",
  "contact",
  "poll",
  "app",
  "effect",
  "registered-custom",
] as const);

/** Poll composition belongs to integration because WT-05 exposes the public
 * builder but intentionally leaves its compatibility module compiler-free. */
export function createPollContentModule(): CompatibilityModule {
  return {
    id: "integration.poll-content",
    lane: "wt-05",
    mode: "production",
    handlers: [],
    reducers: [],
    capabilities: [],
    recoveryCodecs: [],
    compilers: [{
      family: "poll",
      compile: async input => {
        if (input.type !== "poll") throw new Error("INVALID_REQUEST");
        return compilePoll(input.question, input.options);
      },
    }],
  };
}

export interface IntegratedFeatureSurface {
  publicModules: readonly FeatureModule[];
  compatibilityModules: readonly CompatibilityModule[];
}

/** Pure composition validation. Provider/store/socket lifecycle remains explicit
 * in createRuntimeHost; this function never opens credentials or starts clients. */
export function assembleFeatureSurface(input: IntegratedFeatureSurface) {
  const publicRegistry = registerFeatureModules(input.publicModules, true);
  const compatibilityRegistry = buildRegistry(input.compatibilityModules, {
    requireComplete: true,
  });
  const missingCompilers = requiredCompilerFamilies.filter(
    family => !compatibilityRegistry.compilers.has(family as ContentSpec["type"]),
  );
  if (missingCompilers.length)
    throw new Error(`MISSING_COMPILERS:${missingCompilers.join(",")}`);
  const declarations = new Map<string, CompatibilityModule["capabilities"][number]>();
  for (const capability of input.compatibilityModules.flatMap(module => module.capabilities)) {
    if (declarations.has(capability.operation))
      throw new Error(`DUPLICATE_CAPABILITY_DECLARATION:${capability.operation}`);
    declarations.set(capability.operation, capability);
  }
  const assembledOperationRegistrations = Object.freeze(
    operationRegistrations.map(({ operation, owner }) => Object.freeze({
      operation,
      owner,
      handlerRegistration: publicRegistry.handlers.has(operation) ? ("registered" as const) : ("unregistered" as const),
      implementation: declarations.get(operation)?.implementation ?? ("unimplemented" as const),
      providerSupport: declarations.get(operation)?.providerSupport ?? ("unknown" as const),
      configuredAvailability: "runtime-discovery-required" as const,
      liveVerified: declarations.get(operation)?.evidence.some(item => item.tier === "live") ?? false,
    })),
  );
  return { publicRegistry, compatibilityRegistry, operationRegistrations: assembledOperationRegistrations };
}

/** Build the same complete factory surface used by the package manual and
 * structural acceptance tests. Dependencies are inert: this proves handler
 * assembly only and does not claim provider support, scoped availability, or
 * live verification. */
export function assembleDocumentedFeatureSurface() {
  const scope: Scope = {
    projectId: "assembly-inspection",
    provider: "imessage",
    accountId: "assembly-inspection",
    lineId: "assembly-inspection",
    spaceId: "assembly-inspection",
  };
  const unavailable = (): never => {
    throw new Error("ASSEMBLY_INSPECTION_MUST_NOT_EXECUTE");
  };
  const clock = { now: () => 0 };
  const leases = new TypingLeases(clock, async () => unavailable());
  const textOptions = {
    binding: () => ({ scope, phone: "+15555550100", nativeSpaceId: "assembly-inspection" }),
    requestId: () => "assembly-inspection",
  };
  const text = createTextMessageModule(textOptions);
  const media = createMediaModule({ bindings: async () => unavailable() });
  const polls = createPollModule();
  const cards = createCardsModule({ templates: [], ...textOptions });
  const native = createNativeModule({
    binding: async () => unavailable(),
    authorizeIntent: async () => unavailable(),
    authorizeContent: async () => unavailable(),
    compilers: [...text.compilers, ...media.compilers, ...cards.compilers],
  });
  const provider = {
    provider: "imessage" as const,
    scope,
    ready: () => false,
    start: async () => {},
    stop: async () => {},
  };
  const resources = {
    space: async () => unavailable(),
    message: async () => unavailable(),
  };

  return assembleFeatureSurface({
    publicModules: [
      createTypingFeatureModule(leases, () => unavailable()),
      createTextFeature({ streamDelivery: "progressive", provider, binding: textOptions.binding, resources }),
      createMediaFeature({ provider: async () => unavailable(), voiceBehavior: "native" }),
      createPollFeature(),
      createCardFeature({
        templates: [],
        binding: textOptions.binding,
        space: async () => unavailable(),
        requestId: () => "assembly-inspection",
      }),
      createNativeFeature({
        binding: async () => unavailable(),
        authorizeIntent: async () => unavailable(),
        authorizeContent: async () => unavailable(),
        compilers: native.compilers,
        resources,
      }),
    ],
    compatibilityModules: [
      createTypingModule(leases, () => unavailable()),
      // The public production factory uses progressive delivery by default. The
      // inert compatibility object supplies compilers and matching declarations;
      // its legacy buffered handler is never used for documentation execution.
      { ...text, capabilities: textCapabilities("progressive") },
      media,
      polls,
      cards,
      native,
      createPollContentModule(),
    ],
  });
}
