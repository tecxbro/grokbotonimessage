import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import { requireThat } from "./errors.js";
import { resolveMessageTarget, resolveReactionTarget } from "./targets.js";
import {
  executeTextChild,
  tapbacks,
  type PublicTextMessageOptions,
} from "./sdk.js";
/** Persist public provider/parent identity with the actual SDK result through the shared child. */
export async function executeReaction(
  action: ActionFor<"message.react">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveMessageTarget(action.arguments.message, s, o);
  requireThat(
    target.content.type !== "reaction",
    "UNSUPPORTED",
    "Reactions cannot target reactions.",
  );
  return executeTextChild(
    action,
    s,
    o,
    0,
    action.arguments,
    () => target.react(tapbacks[action.arguments.reaction]),
    action.arguments.message.id,
  );
}
/** Validate durable identity and a real public handle before one removal; runtime owns reconciliation. */
export async function removeOwnReaction(
  action: ActionFor<"reaction.remove">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveReactionTarget(action.arguments.reaction, s, o);
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.unsend(),
  );
}
