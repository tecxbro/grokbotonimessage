import type { Operation } from "../contracts/index.js";
import type { ProductionHostConfiguration } from "./configuration.js";

export const administrativeOperations: readonly Operation[] = Object.freeze([
  "space.create", "space.rename", "space.addMembers", "space.removeMembers", "space.leave",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground", "account.shareContact",
]);
export const upstreamPollOperations: readonly Operation[] = Object.freeze(["poll.get", "poll.vote", "poll.unvote", "poll.addOption"]);

/** Static prerequisites only. Neither this report nor a provider connection is live evidence. */
export function configurationBlockers(config: ProductionHostConfiguration): Partial<Record<Operation, string[]>> {
  const output: Partial<Record<Operation, string[]>> = {};
  const add = (op: Operation, message: string) => (output[op] ??= []).push(message);
  for (const op of upstreamPollOperations)
    add(op, "Spectrum 12.8.0 exports no public native poll management API through the shared owner; upstream release blocker.");
  if (!config.cards.some(t => t.kind === "universal")) add("app.send", "Configure a universal card template with an approved HTTPS origin.");
  if (!config.cards.some(t => t.kind === "customized" && t.extension)) add("app.sendCustomized", "Configure a customized template with the actual Apple extension identifiers.");
  if (!config.cards.some(t => t.kind === "customized" || (t.backendId && t.backendId === config.cardBackend?.id)))
    add("app.update", "Configure a customized template or the shipped signed-card-v1 backend for universal updates.");
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
