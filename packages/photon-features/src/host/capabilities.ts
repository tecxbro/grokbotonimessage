import type { Action, Capability, Operation, Scope, TrustedContext } from "../contracts/index.js";
import { sameScope } from "../contracts/resources.js";

const administrative = new Set<Operation>([
  "space.create", "space.rename", "space.addMembers", "space.removeMembers", "space.leave",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground", "account.shareContact",
]);
const directMedia = new Set<Operation>([
  "attachment.send", "attachment.fetch", "voice.send", "space.setAvatar", "space.setBackground",
]);
const nativeContent = new Set<Operation>(["effect.send", "custom.send"]);
const cards = new Set<Operation>(["app.send", "app.sendCustomized", "app.update"]);

export interface ProductionCapabilityInventory {
  scope: Scope;
  ownerReady: boolean;
  configuredOperations: ReadonlySet<Operation>;
  registeredHandlers: ReadonlySet<Operation>;
  administrativeOperations: ReadonlySet<Operation>;
  allowNativeContent: boolean;
  configuredCardTemplates: number;
  resources: boolean;
  media: boolean;
  streams: boolean;
  checkedAt: number;
  /** Concrete configuration blockers, distinct from handler registration and evidence. */
  operationBlockers?: Partial<Record<Operation, readonly string[]>>;
}

function containsMedia(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsMedia);
  const record = value as Record<string, unknown>;
  if (typeof record.stagingId === "string" || record.kind === "attachment") return true;
  return Object.values(record).some(containsMedia);
}

function remainingBaseBlockers(base: Capability | undefined, inventory: ProductionCapabilityInventory): string[] {
  return (base?.blockers ?? []).flatMap(blocker => {
    if (blocker === "Host registration, authoritative bindings and resource adapters require integration.") return [];
    if (blocker === "Host template registration required; device rendering unverified.")
      return inventory.configuredCardTemplates > 0 ? ["Device rendering is unverified."] : [];
    if (blocker === "Host extension registration required; device rendering unverified.")
      return inventory.configuredCardTemplates > 0 ? ["Device rendering is unverified."] : [];
    if (blocker === "Host authorization, scoped provider and capability bindings must be supplied; no live verification.")
      return ["No live provider or device verification has been performed."];
    if (blocker === "Nonempty avatars require the host retention port absent from F0." && inventory.media) return [];
    return [blocker];
  });
}

/** One dependency evaluation feeds both capability reporting and execution preflight. */
export function productionCapability(
  operation: Operation,
  context: TrustedContext,
  inventory: ProductionCapabilityInventory,
  base?: Capability,
  action?: Action,
): Capability {
  const blockers = remainingBaseBlockers(base, inventory);
  const sameConversation = sameScope(context.scope, inventory.scope);
  const handler = inventory.registeredHandlers.has(operation);
  const configured = inventory.configuredOperations.has(operation);
  const authorizedAdministration = !administrative.has(operation) || inventory.administrativeOperations.has(operation);
  const authorizedNativeContent = !nativeContent.has(operation) || inventory.allowNativeContent;
  const cardConfigured = !cards.has(operation) || inventory.configuredCardTemplates > 0;
  const needsMedia = directMedia.has(operation) || (action !== undefined && containsMedia(action.arguments));
  const mediaBound = !needsMedia || inventory.media;
  const streamBound = operation !== "text.stream" || inventory.streams;
  const dependencies = inventory.resources && mediaBound && streamBound;
  const implementation = handler && base?.operation === operation ? base.implementation : "unimplemented";
  const implemented = implementation === "implemented";
  const operationalBlockers = inventory.operationBlockers?.[operation] ?? [];
  blockers.push(...operationalBlockers);
  if (!base || base.operation !== operation) blockers.push("An explicit matching implementation declaration is missing.");
  if (implementation === "partial") blockers.push("The operation implementation is partial.");
  const available = sameConversation && inventory.ownerReady && configured && implemented && dependencies &&
    authorizedAdministration && authorizedNativeContent && cardConfigured && operationalBlockers.length === 0;

  if (!handler) blockers.push("No public f0-services-2 handler is registered for this operation.");
  if (!configured) blockers.push("Operation is not enabled by production provider configuration.");
  if (!inventory.resources) blockers.push("The production resource resolver is not bound.");
  if (!mediaBound) blockers.push("This request contains media but the production media staging port is not bound.");
  if (!streamBound) blockers.push("The production registered-stream port is not bound.");
  if (!authorizedAdministration) blockers.push("Administrative intent is not enabled for this operation.");
  if (!authorizedNativeContent) blockers.push("Native content intent is not enabled for this operation.");
  if (!cardConfigured) blockers.push("No production card template is configured for this operation.");
  if (!sameConversation) blockers.push("The durable context is not bound to this production conversation.");
  if (!inventory.ownerReady) blockers.push("The single Spectrum SDK owner is not ready.");
  blockers.push("Runtime readiness is not provider delivery, read, rendering, interaction, or device evidence.");

  return {
    operation,
    providerSupport: base?.providerSupport ?? "unknown",
    implementation,
    availability: {
      account: inventory.ownerReady ? "available" : "unavailable",
      conversation: available ? "available" : "unavailable",
      checkedAt: inventory.checkedAt,
    },
    direction: base?.direction ?? { inbound: "not-applicable", outbound: "unknown" },
    evidence: base?.evidence ?? [],
    sdkVersion: base?.sdkVersion ?? "12.8.0",
    sources: base?.sources ?? ["npm:spectrum-ts@12.8.0"],
    blockers,
  };
}
