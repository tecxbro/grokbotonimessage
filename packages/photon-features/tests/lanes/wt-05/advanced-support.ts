import { NotFoundError, ValidationError, type Poll } from "@photon-ai/advanced-imessage/grpc";
import type { AdvancedPollClient } from "../../../src/features/polls/advanced-adapter.js";

/** Public SDK contract double; no network or real credentials. Includes optional SDK metadata. */
export function advancedClientFixture() {
  const states = new Map<string, Poll>();
  const calls: unknown[][] = [];
  let closes = 0;
  let afterWrite: (() => void) | undefined;
  const self = { address: "self@example.invalid", service: "iMessage" as const, country: "US" };
  function seed(guid = "native-poll"): Poll {
    const state: Poll = { pollMessageGuid: guid, chatGuid: "native-chat", title: "Choose?",
      options: [{ optionIdentifier: "native-a", text: "Same", creatorHandle: "creator@example.invalid" },
        { optionIdentifier: "native-b", text: "Same" }],
      votes: [{ optionIdentifier: "native-a", participant: {
        address: "alice@example.invalid", service: "iMessage", country: "US" } },
      { optionIdentifier: "native-a", participant: { address: "bob@example.invalid", service: "iMessage" } }],
    };
    states.set(guid, state);
    return state;
  }
  function get(guid: string) {
    const state = states.get(guid);
    if (!state) throw new NotFoundError("missing", { code: "pollNotFound", grpcCode: 5, retryable: false });
    return state;
  }
  function write(state: Poll) {
    states.set(state.pollMessageGuid, state);
    afterWrite?.();
    return state;
  }
  const client: AdvancedPollClient = {
    close: async () => { closes++; },
    polls: {
      get: async guid => { calls.push(["get", guid]); return get(guid); },
      vote: async (guid, option, options) => {
        calls.push(["vote", guid, option, options]);
        const state = get(guid);
        if (!state.options.some(value => value.optionIdentifier === option))
          throw new ValidationError("invalid option", { code: "invalidArgument", grpcCode: 3, retryable: false });
        return write({ ...state, votes: [...state.votes.filter(v => v.participant.address !== self.address),
          { optionIdentifier: option, participant: self }] });
      },
      unvote: async (guid, options) => {
        calls.push(["unvote", guid, options]);
        const state = get(guid);
        return write({ ...state, votes: state.votes.filter(v => v.participant.address !== self.address) });
      },
      addOption: async (guid, text, options) => {
        calls.push(["addOption", guid, text, options]);
        const state = get(guid);
        return write({ ...state, options: [...state.options,
          { optionIdentifier: `native-added-${state.options.length}`, text }] });
      },
    },
  };
  return { client, seed, states, calls, closes: () => closes,
    afterWrite(callback: () => void) { afterWrite = callback; } };
}
