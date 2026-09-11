import { isDeepStrictEqual } from "node:util";
import type { IncomingEvent, Scope } from "../contracts/index.js";
import { sameScope } from "../contracts/resources.js";
import type { Transaction, TransactionStore } from "../state/ports.js";
import type { CapturedMessage, Correlations } from "../runtime/inbound/normalize.js";
import { activeRoute, type TaskRoute } from "../runtime/inbound/router.js";
import { scopedId, type PollRef, type OptionRef } from "../features/polls/identity.js";

/** Must come from an authenticated provider contract exposing these exact native IDs.
 * Spectrum 12.8.0 PollOption only exposes title/selected; it cannot populate this interface. */
export interface NativePollVoteIdentity { pollMessageGuid: string; optionIdentifier: string; }
export interface ResolvedPollVote { poll: PollRef; option: OptionRef; route: TaskRoute; }

/** Exact, bounded primary-key lookup. Reads existing poll/option identity records, never labels. */
export function resolveNativePollVote(tx: Transaction, scope: Scope, identity: NativePollVoteIdentity): ResolvedPollVote | undefined {
  if (!identity.pollMessageGuid || !identity.optionIdentifier) return;
  const id = scopedId("poll", scope, identity.pollMessageGuid);
  const poll = tx.get("polls", id), owner = tx.get("references", id);
  if (!poll || !owner || !sameScope(poll.scope, scope) || !sameScope(owner.scope, scope) ||
      !isDeepStrictEqual(owner.reference, poll.reference) || owner.providerId !== identity.pollMessageGuid) return;
  const route = { taskId: owner.taskId, generation: owner.generation, principalId: owner.ownedByPrincipalId };
  if (!activeRoute(tx, scope, route)) return;
  const message = tx.get("references", poll.reference.messageId);
  if (!message || message.reference.kind !== "message" || !sameScope(message.scope, scope) ||
      message.providerId !== identity.pollMessageGuid || message.taskId !== route.taskId ||
      message.generation !== route.generation || message.ownedByPrincipalId !== route.principalId) return;
  const optionId = scopedId("option", scope, identity.pollMessageGuid, identity.optionIdentifier);
  const option = poll.options.find(value => value.reference.id === optionId)?.reference;
  const mapping = tx.get("references", optionId);
  if (!option || !mapping || !isDeepStrictEqual(mapping.reference, option) || !sameScope(option.scope, scope) ||
      option.pollId !== id || !sameScope(mapping.scope, scope) || mapping.providerId !== identity.optionIdentifier ||
      mapping.taskId !== route.taskId || mapping.generation !== route.generation || mapping.ownedByPrincipalId !== route.principalId) return;
  return { poll: poll.reference, option, route };
}

/** Adapter consumed by A's normalization. Supplying the trusted native identity resolver is mandatory;
 * absence is an explicit production dependency, never a title-based or synthetic-ID fallback. */
export function createPollCorrelations(store: TransactionStore,
  nativeIdentity: (message: CapturedMessage, scope: Scope) => NativePollVoteIdentity | undefined): Correlations {
  return { poll: (message, scope) => {
    const identity = nativeIdentity(message, scope);
    if (!identity) return;
    return store.transaction(tx => {
      const result = resolveNativePollVote(tx, scope, identity);
      return result ? { poll: result.poll, option: result.option } : undefined;
    });
  } };
}

/** Routing must use the persisted originating poll owner, never the latest task in a conversation. */
export function routePollEvent(event: IncomingEvent, tx: Transaction): TaskRoute | undefined {
  if (event.type !== "poll" || !event.option) return;
  const poll = tx.get("references", event.poll.id), option = tx.get("references", event.option.id);
  if (!poll || !option) return;
  const resolved = resolveNativePollVote(tx, event.scope, { pollMessageGuid: poll.providerId, optionIdentifier: option.providerId });
  return resolved && isDeepStrictEqual(resolved.poll, event.poll) && isDeepStrictEqual(resolved.option, event.option)
    ? resolved.route : undefined;
}
