import type { Action, Operation } from "../contracts/index.js";
import type { NormalizedHostConfiguration, ProductionHostConfiguration } from "./configuration.js";

export const administrativeOperations: readonly Operation[] = Object.freeze([
  "space.create", "space.rename", "space.addMembers", "space.removeMembers", "space.leave",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground", "account.shareContact",
]);
export const upstreamPollOperations: readonly Operation[] = Object.freeze(["poll.get", "poll.vote", "poll.unvote", "poll.addOption"]);
export const pollManagementBlocker = "The configured Spectrum owner has no approved public native poll-management adapter.";
export const sharedGroupCreationBlocker = "Shared Free/Pro iMessage mode does not support group creation; a dedicated line is required.";
const groupOperations = new Set<Operation>([
  "space.getName", "space.rename", "space.getMembers", "space.addMembers", "space.removeMembers",
  "space.leave", "space.getAvatar", "space.setAvatar", "space.clearAvatar",
]);

/** Host-supplied facts, never inferred from handler registration or SDK method names. */
export interface ProductionDependencySnapshot {
  routeMode?: "shared" | "dedicated" | "unknown";
  routeReady?: boolean;
  conversationType?: "dm" | "group";
  pollManagement?: boolean;
  cardTemplates?: readonly ProductionHostConfiguration["cards"][number][];
  cardBackendReady?: boolean;
  /** Original SDK session AND admitted revision are bound for this exact update. */
  cardUpdateReady?: boolean;
}

/** Missing group-event ingress is a separate inbound fact, not an outbound DM blocker. */
export function accountModeBlockers(operation: Operation, mode: ProductionDependencySnapshot["routeMode"], action?: Action): string[] {
  const createsGroup = operation === "space.create" &&
    (action?.operation !== "space.create" || action.arguments.members.length > 1);
  if (createsGroup && mode === "shared") return [sharedGroupCreationBlocker];
  if ((createsGroup || groupOperations.has(operation)) && mode !== "shared" && mode !== "dedicated")
    return ["The actual provider account mode must be established before group workflows can execute."];
  // This restriction is also enforced by the shipped native handler's requireGroup.
  if (groupOperations.has(operation) && mode === "shared")
    return ["The configured native group handler requires a dedicated line for this operation."];
  return [];
}

/** Card prerequisites are host requirements; static URL cards need no live-extension evidence. */
export function cardConfigurationBlockers(operation: Operation, templates: ProductionDependencySnapshot["cardTemplates"],
  backendReady: boolean, action?: Action): string[] {
  if (!templates || !["app.send", "app.sendCustomized", "app.update"].includes(operation)) return [];
  const requested = action?.operation === "app.send" || action?.operation === "app.sendCustomized" ? action.arguments : undefined;
  // The reserved built-in static template is provided by RFX-09's resolver.
  // An explicit registration with that ID still owns its origin restrictions.
  if (operation === "app.send" && (!requested || requested.templateId === "universal-static") &&
      !templates.some(template => template.id === "universal-static")) {
    if (requested) {
      try { const url = new URL(requested.url);
        if (url.protocol !== "https:" || url.username || url.password) return ["Static cards require an HTTPS URL without credentials."];
      } catch { return ["Static cards require a valid HTTPS URL."]; }
    }
    return [];
  }
  const candidates = templates.filter(t => (!requested || t.id === requested.templateId) &&
    (operation === "app.update" || t.kind === (operation === "app.send" ? "universal" : "customized")));
  if (!candidates.length) return ["The requested template ID and kind must match a configured production card template."];
  const issues = candidates.map(template => {
    const blockers: string[] = [];
    if (!template.origins.length) blockers.push("Configure an approved HTTPS origin for the card template.");
    if (template.kind === "customized" && !template.extension)
      blockers.push("Configure the customized template's actual Apple extension identifiers.");
    if (template.live && (!template.live.installedExtensionVerified || !template.live.evidence.trim()))
      blockers.push("The requested live card template requires installed-extension evidence.");
    // Callback verification has its own ingress contract; requesting callbacks
    // does not make the outbound static/customized card require a URL backend.
    if ((template.backendId || (operation === "app.update" && template.kind === "universal")) && !backendReady)
      blockers.push("The requested card template requires a bound card backend.");
    if (requested) {
      try {
        const url = new URL(requested.url);
        if (url.protocol !== "https:" || url.username || url.password || !template.origins.includes(url.origin))
          blockers.push("The requested card URL must use a configured HTTPS origin.");
      } catch { blockers.push("The requested card URL must be a valid HTTPS URL."); }
    }
    return blockers;
  });
  return issues.some(blockers => blockers.length === 0) ? [] : [...new Set(issues.flat())];
}

/** Configuration plus optional actual bindings. This function performs no I/O. */
export function configurationBlockers(config: ProductionHostConfiguration | NormalizedHostConfiguration, dependencies: ProductionDependencySnapshot = {},
  action?: Action): Partial<Record<Operation, string[]>> {
  const output: Partial<Record<Operation, string[]>> = {};
  const add = (op: Operation, message: string) => (output[op] ??= []).push(message);
  if (dependencies.pollManagement !== true)
    for (const op of upstreamPollOperations) add(op, pollManagementBlocker);
  const mode = dependencies.routeMode ?? (config.provider.dedicated ? "dedicated" : "shared");
  for (const op of ["space.create" as const, ...groupOperations])
    for (const blocker of accountModeBlockers(op, mode, action)) add(op, blocker);
  const templates = dependencies.cardTemplates ?? config.cards;
  const backendReady = dependencies.cardBackendReady ?? Boolean(config.cardBackend);
  for (const op of ["app.send", "app.sendCustomized", "app.update"] as const)
    for (const blocker of cardConfigurationBlockers(op, templates, backendReady, action)) add(op, blocker);
  for (const op of administrativeOperations)
    if (!config.authorization.administrativeOperations.includes(op)) add(op, "Explicit owner administrative intent is required in authorization.administrativeOperations.");
  for (const op of ["space.create", "space.addMembers", "space.removeMembers"] as const)
    if (!config.authorization.allowedRecipients.length) add(op, "Configure the exact allowedRecipients for this administrative action.");
  for (const op of ["effect.send", "custom.send"] as const)
    if (!config.authorization.allowNativeContent) add(op, "Explicit authorization.allowNativeContent is required.");
  if (!config.cards.some(t => t.id === "native-account-contact-v1"))
    add("custom.send", "Configure the native-account-contact-v1 card template and obtain its card reference through app.send or app.sendCustomized.");
  if (!config.task.permissions.includes("account.shareContact") || !config.authorization.administrativeOperations.includes("account.shareContact"))
    add("custom.send", "The only shipped custom codec shares the bot account contact and requires account.shareContact permission and administrative intent.");
  return output;
}
