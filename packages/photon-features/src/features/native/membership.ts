import { requireNative } from "./guards.js";
import type { NativeBinding, NativeSpace } from "./sdk.js";

/** Pinned getMembers excludes the dedicated account itself. Revalidate immediately
 * before a write; Apple still decides races with concurrent membership changes. */
export async function checkMembership(
  operation: "space.addMembers" | "space.removeMembers" | "space.leave",
  members: readonly string[], space: NativeSpace, binding: NativeBinding,
): Promise<void> {
  const current = await binding.provider.getMembers(space);
  requireNative(current.every(user => user.service === "iMessage"), "UNAVAILABLE",
    "Group administration requires verified iMessage participants.");
  const ids = new Set(current.map(user => user.id.toLowerCase()));
  requireNative(ids.size === current.length, "UNAVAILABLE", "Group membership could not be resolved uniquely.");
  if (operation === "space.addMembers") {
    requireNative(ids.size >= 2, "UNSUPPORTED", "Adding members requires at least three current participants including the account.");
    requireNative(members.every(id => !ids.has(id.toLowerCase())), "INVALID_REQUEST", "A requested recipient is already a member.");
  } else {
    requireNative(ids.size >= 3, "UNSUPPORTED", "Removing members or leaving requires at least four current participants including the account.");
    if (operation === "space.removeMembers") {
      requireNative(members.every(id => ids.has(id.toLowerCase())), "INVALID_REQUEST", "A requested recipient is not a member.");
      requireNative(ids.size - members.length >= 2, "UNSUPPORTED", "Removal must leave at least three participants including the account.");
    }
  }
}
