import type { Action, Capability, Operation, ResourceRef, Scope, TrustedContext } from "../contracts/index.js";
import { resourceRefSchema, sameScope } from "../contracts/resources.js";
import {
  accountModeBlockers, administrativeOperations, cardConfigurationBlockers, pollManagementBlocker,
  sharedGroupCreationBlocker, upstreamPollOperations, type ProductionDependencySnapshot,
} from "./configuration-inventory.js";

const administrative = new Set<Operation>(administrativeOperations);
const directMedia = new Set<Operation>([
  "attachment.send", "attachment.fetch", "voice.send", "space.setAvatar", "space.setBackground", "space.getAvatar",
]);
const nativeContent = new Set<Operation>(["effect.send", "custom.send"]);
const cards = new Set<Operation>(["app.send", "app.sendCustomized", "app.update"]);
type Evidence = Capability["evidence"][number];
type VerificationStage = "providerAccepted" | "deviceObserved" | "liveVerified";

export interface ProductionCapabilityInventory extends ProductionDependencySnapshot {
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
  /** Concrete execution blockers; evaluation does not invoke dependency functions. */
  operationBlockers?: Partial<Record<Operation, readonly string[]>>;
  /** Complete local lookup snapshot for this action. Absent is unchecked, not missing. */
  requestResources?: readonly { reference: ResourceRef; available: boolean; reason?: string }[];
  /** Trusted, operation-scoped observations; never populated from registration or connection success. */
  verification?: Partial<Record<Operation, Partial<Record<VerificationStage, Evidence>>>>;
}

function containsMedia(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsMedia);
  const record = value as Record<string, unknown>;
  if (typeof record.stagingId === "string" || record.kind === "attachment" || record.type === "attachment" || record.type === "voice") return true;
  return Object.values(record).some(containsMedia);
}

function references(value: unknown): ResourceRef[] {
  if (!value || typeof value !== "object") return [];
  const parsed = resourceRefSchema.safeParse(value);
  return parsed.success ? [parsed.data] : Object.values(value).flatMap(references);
}

function sameReference(a: ResourceRef, b: ResourceRef): boolean {
  return Object.entries(a).every(([key, value]) => key === "scope" ? sameScope(a.scope, b.scope) :
    value === (b as unknown as Record<string, unknown>)[key]);
}

const informational = new Set([
  "Runtime readiness is not provider delivery, read, rendering, interaction, or device evidence.",
  "Device rendering is unverified.", "No live provider or device verification has been performed.",
  "Not live verified.", "Device rendering unverified.", "Provider delivery not observed.",
  "SDK completion does not prove that a recipient device rendered the indicator.",
  "Progressive remote text edits one original message; only the final SDK receipt is exposed.",
  "This implementation buffers validated text before one send; it does not progressively deliver.",
  "Explicit buffered fallback sends only after source completion.",
  "Public text(AsyncIterable) progressively sends and edits one remote message; SDK exposes only the final receipt.",
  "Only URL input is supported; native preview rendering is not confirmed by SDK return.",
  "Provider marks the entire conversation read, not an individual message.",
]);

/** Classify known legacy declarations explicitly; unknown blockers remain blocking. */
function classifyBlocker(blocker: string, inventory: ProductionCapabilityInventory): "resolved" | "note" | "blocker" {
  if (informational.has(blocker)) return "note";
  if (/^(not live verified|device rendering unverified|provider delivery not observed)\.?$/i.test(blocker.trim())) return "note";
  if (blocker === "Conversational poll-answer ingress is unavailable or unverified.") return "note";
  if (blocker === "Host registration, authoritative bindings and resource adapters require integration.") return "resolved";
  if (["Host template registration required; device rendering unverified.",
    "Host extension registration required; device rendering unverified.",
    "Host authorization, scoped provider and capability bindings must be supplied; no live verification."].includes(blocker)) return "note";
  if (blocker === "Nonempty avatars require the host retention port absent from F0." && inventory.media) return "resolved";
  if (blocker === "Original SDK session and admission revision binding required. Universal layout changes need a configured backend URL mapping." && inventory.cardUpdateReady)
    return "resolved";
  if (inventory.pollManagement && [pollManagementBlocker,
    "Spectrum 12.8.0 exports no public native poll management API through the shared owner; upstream release blocker.",
    "Application integration missing: no approved public shared-owner poll-management adapter is configured."].includes(blocker)) return "resolved";
  return "blocker";
}

/** Pure dependency evaluation shared by reporting/preflight. Never probes or sends to a provider.
 * Evidence references tagged capability-state/v1 and capability-note/v1 carry inert JSON
 * through the frozen public schema. Their sdk-contract tier denotes evaluation, not a test run.
 * Unknown request-resource state is not upgraded to runtime-ready evidence.
 */
export function productionCapability(
  operation: Operation, context: TrustedContext, inventory: ProductionCapabilityInventory,
  base?: Capability, action?: Action,
): Capability {
  const declaration = base?.operation === operation ? base : undefined;
  const blockers: string[] = [];
  const notes: string[] = ["Runtime readiness is not provider delivery, read, rendering, interaction, or device evidence."];
  const add = (message: string) => blockers.push(message);
  for (const blocker of [...(declaration?.blockers ?? []), ...(inventory.operationBlockers?.[operation] ?? [])]) {
    // A configuration-level group prerequisite must not prohibit single-recipient creation.
    if (blocker === sharedGroupCreationBlocker && action?.operation === "space.create" && action.arguments.members.length === 1) continue;
    const kind = classifyBlocker(blocker, inventory);
    if (kind === "blocker") add(blocker);
    if (kind === "note") notes.push(blocker);
  }
  const handler = inventory.registeredHandlers.has(operation);
  const configured = inventory.configuredOperations.has(operation);
  const granted = context.permissions.includes(operation);
  const implementation = handler && declaration ? declaration.implementation : "unimplemented";
  if (!declaration) add("An explicit matching implementation declaration is missing.");
  if (implementation !== "implemented") add(`The operation implementation is ${implementation}.`);
  if (!handler) add("No public f0-services-2 handler is registered for this operation.");
  if (!configured) add("Operation is not enabled by production provider configuration.");
  if (!granted) add("The trusted context does not grant this operation.");
  if (!inventory.resources) add("The production resource resolver is not bound.");
  if ((directMedia.has(operation) || (action && containsMedia(action.arguments))) && !inventory.media)
    add("This request contains media but the production media staging port is not bound.");
  if (operation === "text.stream" && !inventory.streams) add("The production registered-stream port is not bound.");
  if (administrative.has(operation) && !inventory.administrativeOperations.has(operation)) add("Administrative intent is not enabled for this operation.");
  if (nativeContent.has(operation) && !inventory.allowNativeContent) add("Native content intent is not enabled for this operation.");
  if (cards.has(operation) && (inventory.cardTemplates?.length ?? inventory.configuredCardTemplates) === 0)
    add("No production card template is configured for this operation.");
  for (const blocker of cardConfigurationBlockers(operation, inventory.cardTemplates, inventory.cardBackendReady === true, action)) add(blocker);
  if (operation === "app.update" && inventory.cardUpdateReady !== true)
    add("The requested card update requires its original SDK session and admitted revision binding.");
  // The existing production caller already passes an explicit empty management
  // blocker list only when its actual management binding exists.
  const pollManagement = inventory.pollManagement ??
    (inventory.operationBlockers?.[operation]?.length === 0);
  if (upstreamPollOperations.includes(operation) && !pollManagement) add(pollManagementBlocker);
  if (!sameScope(context.scope, inventory.scope)) add("The durable context is not bound to this production conversation.");
  if (!inventory.ownerReady) add("The single Spectrum SDK owner is not ready.");
  if (inventory.routeReady === false) add("The actual provider route is not ready.");
  // The older production call site supplies shared mode through configuration blockers.
  const routeMode = inventory.routeMode ?? (inventory.operationBlockers?.["space.create"]?.includes(sharedGroupCreationBlocker) ? "shared" : "unknown");
  for (const blocker of accountModeBlockers(operation, routeMode, action)) add(blocker);
  if (inventory.conversationType === "dm" && ["space.getName", "space.rename", "space.getMembers", "space.addMembers",
    "space.removeMembers", "space.leave", "space.getAvatar", "space.setAvatar", "space.clearAvatar"].includes(operation))
    add("This operation requires a group conversation.");
  if (declaration?.providerSupport === "unsupported") add("The provider explicitly declares this operation unsupported.");
  if (declaration?.providerSupport === "unknown") add("Provider support for this operation has not been established.");
  if (action && (action.operation !== operation || action.contextId !== context.contextId))
    add("The requested action does not match this operation and trusted context.");
  const refs = action ? references(action.arguments) : [];
  for (const reference of refs) {
    if (!sameScope(reference.scope, context.scope)) add(`Request resource ${reference.kind}:${reference.id} belongs to another scope.`);
    if (inventory.requestResources !== undefined) {
      const resource = inventory.requestResources.find(row => sameReference(row.reference, reference));
      if (!resource?.available) add(`Request resource ${reference.kind}:${reference.id} is unavailable${resource?.reason ? `: ${resource.reason}` : "."}`.slice(0, 500));
    }
  }
  const available = blockers.length === 0;
  const sdkVersion = declaration?.sdkVersion ?? "12.8.0";
  const proof = inventory.verification?.[operation];
  const verified = (stage: VerificationStage) => {
    const evidence = proof?.[stage];
    return Boolean(evidence?.tier === "live" && evidence.reference.trim() && evidence.sdkVersion === sdkVersion &&
      evidence.observedAt >= 0 && evidence.observedAt <= inventory.checkedAt);
  };
  const resourcesChecked = !action || refs.length === 0 || inventory.requestResources !== undefined;
  const state = { type: "capability-state/v1", basis: "host-inventory", implemented: implementation === "implemented", handlerRegistered: handler,
    configured, granted, runtimeReady: available && resourcesChecked && inventory.routeReady === true,
    providerAccepted: verified("providerAccepted"), deviceObserved: verified("deviceObserved"), liveVerified: verified("liveVerified"),
    routeMode, routeReady: inventory.routeReady ?? "unknown",
    inboundGroupEvents: routeMode === "shared" ? "unsupported" : routeMode === "dedicated" ? "supported" : "unknown",
    requestResources: !action ? "not-evaluated" : resourcesChecked ? "checked" : "unchecked" };
  if (!resourcesChecked) notes.push("Request resources have not been checked against an authoritative local snapshot; execution must resolve them.");
  if (inventory.routeReady === undefined) notes.push("Actual route readiness has not been supplied by the host.");
  const annotation = (reference: string): Evidence => ({ tier: "sdk-contract", reference, observedAt: inventory.checkedAt, sdkVersion });
  const annotations = [annotation(JSON.stringify(state)), ...[...new Set(notes)].map(note =>
    annotation(JSON.stringify({ type: "capability-note/v1", note })))];
  const observations = (["providerAccepted", "deviceObserved", "liveVerified"] as const)
    .flatMap(stage => verified(stage) ? [proof![stage]!] : []);
  const evidence = [...(declaration?.evidence ?? []).filter(row => !row.reference.startsWith('{"type":"capability-')),
    ...observations].slice(0, Math.max(0, 100 - annotations.length));
  const uniqueBlockers = [...new Set(blockers)];
  return {
    operation, providerSupport: declaration?.providerSupport ?? "unknown", implementation,
    availability: { account: inventory.ownerReady && inventory.routeReady !== false ? "available" : "unavailable",
      conversation: available ? "available" : "unavailable", checkedAt: inventory.checkedAt },
    direction: declaration?.direction ?? { inbound: "not-applicable", outbound: "unknown" },
    evidence: [...evidence, ...annotations], sdkVersion,
    sources: declaration?.sources ?? ["npm:spectrum-ts@12.8.0"],
    blockers: uniqueBlockers.length <= 30 ? uniqueBlockers : [...uniqueBlockers.slice(0, 29),
      `${uniqueBlockers.length - 29} additional execution blockers exist; resolve the listed dependencies first.`],
  };
}
