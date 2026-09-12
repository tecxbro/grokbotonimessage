import { poll, option, type ContentBuilder, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { z } from "zod";
import type { Scope, TrustedContext } from "../../contracts/index.js";

/** Public Spectrum 12.8.0 builders. Caller keys are not native option identifiers. */
export function compilePoll(question: string, choices: readonly { key: string; label: string }[]): ContentBuilder {
  if (!question.trim() || new Set(choices.map(o => o.key)).size !== choices.length ||
      choices.some(o => !o.label.trim())) throw new Error("INVALID_REQUEST");
  return poll(question, choices.map(o => option(o.label)));
}

export function checkedSpace(space: Space): Space {
  if (space.__platform !== "imessage" || !imessage(space).phone) throw new Error("UNSUPPORTED");
  return space;
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ResourceResolver } from "../../contracts/ports.js";

/** A trusted closure over the shared SDK owner, captured by the handler (F0 execution.md).
 * No credentials, client constructor, advanced extension or subscription is accepted here.
 */
export interface PollProviderBinding {
  resolveSpace: ResourceResolver["space"];
  /** The shared owner supplies the real serving phone and native conversation.
   * A logical scope lineId is not an E.164 provider phone and must not replace it.
   */
  binding?(context: TrustedContext): {
    scope: Scope;
    phone: string;
    conversationId: string;
  };
  /** This must be backed by the already-owned provider connection. Spectrum 12.8.0
   * does not expose this surface, so production must leave it absent until an
   * approved public shared-owner adapter exists.
   */
  management?(context: TrustedContext): Promise<PollManagement>;
}

const nativePollStateSchema = z.strictObject({
  pollMessageGuid: z.string().min(1),
  chatGuid: z.string().min(1),
  title: z.string().min(1).max(500).refine(value => value.trim().length > 0),
  options: z.array(z.strictObject({
    optionIdentifier: z.string().min(1).max(200),
    text: z.string().min(1).max(200).refine(value => value.trim().length > 0),
  })).min(2).max(100),
  votes: z.array(z.strictObject({
    optionIdentifier: z.string().min(1),
    participant: z.strictObject({
      address: z.string().min(1),
      service: z.string().min(1),
    }),
  })).max(10000),
});
export type NativePollState = z.infer<typeof nativePollStateSchema>;

/** Exact approved provider seam. Vote/unvote always act as the current account;
 * there is deliberately no participant parameter and no local option-key input.
 */
export interface PollManagement {
  get(pollMessageGuid: string): Promise<NativePollState>;
  vote(pollMessageGuid: string, optionIdentifier: string): Promise<NativePollState>;
  unvote(pollMessageGuid: string): Promise<NativePollState>;
  addOption(pollMessageGuid: string, text: string): Promise<NativePollState>;
}

/** Reject malformed or ambiguous provider snapshots before they can update durable identity. */
export function parseNativePollState(input: unknown): NativePollState {
  const state = nativePollStateSchema.parse(input);
  const optionIds = state.options.map(value => value.optionIdentifier);
  if (new Set(optionIds).size !== optionIds.length) throw new Error("AMBIGUOUS_OPTIONS");
  const known = new Set(optionIds);
  const votes = new Set<string>();
  for (const vote of state.votes) {
    if (!known.has(vote.optionIdentifier)) throw new Error("UNKNOWN_NATIVE_OPTION");
    const identity = JSON.stringify([vote.participant.address, vote.participant.service, vote.optionIdentifier]);
    if (votes.has(identity)) throw new Error("DUPLICATE_NATIVE_VOTE");
    votes.add(identity);
  }
  return state;
}
export type PollAction = { [K in "poll.create" | "poll.get" | "poll.vote" | "poll.unvote" | "poll.addOption"]: ActionFor<K> }[
  "poll.create" | "poll.get" | "poll.vote" | "poll.unvote" | "poll.addOption"
];
export type PollMapping =
  | { kind: "create"; content: ContentBuilder }
  | { kind: "get" }
  | { kind: "vote" }
  | { kind: "unvote" }
  | { kind: "addOption" };

/** Map only the approved shared-owner provider seam.
 * Native unvote takes just the poll GUID, unlike the wire action.
 */
export function mapPollOperation(action: PollAction): PollMapping {
  if (action.operation === "poll.create") return {
    kind: "create", content: compilePoll(action.arguments.question, action.arguments.options),
  };
  if (action.operation === "poll.get") return { kind: "get" };
  if (action.operation === "poll.vote") return { kind: "vote" };
  if (action.operation === "poll.unvote") return { kind: "unvote" };
  return { kind: "addOption" };
}
