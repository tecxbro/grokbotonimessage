import type { Capability, FeatureModule } from "../../index.js";
import { checkpointSchema, codecIdentity, executePoll, pollOperations } from "./operations.js";
import { createPollReducer, type PollReductionPolicy } from "./reducer.js";

export interface PollModuleConfiguration {
  voteIngress: "available" | "unavailable" | "unknown";
  reduction: PollReductionPolicy;
  /** Available only when the shared Spectrum owner supplies the approved native management seam. */
  management?: "available" | "unavailable" | "unknown";
}
export function pollWorkflowAvailability(config: PollModuleConfiguration) {
  const managementImplemented = config.management === "available";
  const conversationalAnswersImplemented = config.voteIngress === "available";
  const interactiveWorkflowAdvertisable = conversationalAnswersImplemented;
  return { creationImplemented: true, conversationalAnswersImplemented,
    managementImplemented, interactiveWorkflowAdvertisable,
    blockers: conversationalAnswersImplemented ? [] :
      ["Conversational poll-answer ingress is unavailable or unverified."],
    managementBlockers: managementImplemented ? [] :
      ["Approved shared-owner poll management is unavailable or unverified."] };
}
export function createPollModule(config: PollModuleConfiguration = {
  voteIngress: "unknown", reduction: { orderedSources: [] },
}): FeatureModule {
  const managementImplemented = config.management === "available";
  const capabilities: Capability[] = pollOperations.map(operation => ({
    operation, providerSupport: "native", implementation: operation === "poll.create" || managementImplemented
      ? "implemented" : "unimplemented",
    availability: { account: "unknown", conversation: "unknown", checkedAt: null },
    direction: { inbound: operation === "poll.create" ?
      (config.voteIngress === "available" ? "implemented" : "unknown") : "not-applicable",
      outbound: operation === "poll.create" || managementImplemented ? "implemented" : "unimplemented" },
    sdkVersion: "12.8.0", evidence: [],
    sources: ["https://photon.codes/docs/spectrum-ts/content/polls", "https://photon.codes/docs/advanced-kits/imessage/polls"],
    blockers: operation === "poll.create" ? pollWorkflowAvailability(config).blockers : managementImplemented ? [] :
      ["Application integration missing: no approved public shared-owner poll-management adapter is configured."],
  }));
  return {
    id: "polls", lane: "wt-05", mode: "production",
    handlers: pollOperations.map(operation => ({ operation, execute: executePoll, recoveryCodec: codecIdentity })),
    // Nested poll content needs WT-03's child identity registration before it can advertise continuation.
    compilers: [], reducers: [createPollReducer(config.reduction)], capabilities,
    recoveryCodecs: [{ ...codecIdentity,
      validate: checkpoint => checkpointSchema.safeParse(checkpoint).success,
      reconcile: async checkpoint => {
        const parsed = checkpointSchema.safeParse(checkpoint);
        return parsed.success && parsed.data.stage === "completed" &&
          parsed.data.result?.status === "provider-accepted" ? "completed" : "unknown";
      },
    }],
  };
}

import type { FeatureModule as F0FeatureModule } from "../../contracts/feature.js";
import { executePollOperation } from "./operations.js";
import type { PollProviderBinding } from "./sdk.js";

/** F0 module factory; inert construction and no second SDK owner.
 * Registration is handler availability only. Consult pollFeatureAvailability before advertising
 * an interactive workflow; native management stays blocked until the shared owner supplies the
 * approved PollManagement binding.
 */
export function createFeatureModule(binding?: PollProviderBinding): F0FeatureModule {
  return { id: "polls", owner: "wt-05", handlers: {
    "poll.create": (action, services) => executePollOperation(action, services, binding),
    "poll.get": (action, services) => executePollOperation(action, services, binding),
    "poll.vote": (action, services) => executePollOperation(action, services, binding),
    "poll.unvote": (action, services) => executePollOperation(action, services, binding),
    "poll.addOption": (action, services) => executePollOperation(action, services, binding),
  } };
}

/** Separate outbound implementation from provider availability and actual incoming user votes. */
export function pollFeatureAvailability(voteIngress: PollModuleConfiguration["voteIngress"] = "unknown",
  management: NonNullable<PollModuleConfiguration["management"]> = "unknown") {
  const ready = management === "available";
  return {
    operations: { "poll.create": "implemented", "poll.get": ready ? "implemented" : "blocked",
      "poll.vote": ready ? "implemented" : "blocked", "poll.unvote": ready ? "implemented" : "blocked",
      "poll.addOption": ready ? "implemented" : "blocked" } as const,
    outboundProviderAvailability: "unverified" as const,
    voteIngress, conversationalAnswers: voteIngress === "available" ? "implemented" : voteIngress,
    interactiveWorkflowAdvertisable: voteIngress === "available",
    blockers: voteIngress === "available" ? [] : ["wt-05-vote-ingress"],
    managementBlockers: ready ? [] : ["wt-05-advanced-polls"],
  };
}
