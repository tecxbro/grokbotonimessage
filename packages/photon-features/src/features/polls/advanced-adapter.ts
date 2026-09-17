import { createHash } from "node:crypto";
import {
  createClient, NotFoundError, ValidationError,
  type AdvancedIMessage, type ClientOptions, type Poll,
} from "@photon-ai/advanced-imessage/grpc";
import {
  parseNativePollState, PollManagementRejected,
  type PollManagement, type PollMutationExecution,
} from "./sdk.js";

/** Host-selected line credentials; an async token callback can refresh them per RPC. */
export type AdvancedPollManagementOptions = Pick<ClientOptions, "address" | "token" | "tls" | "timeout">;

/** The host must stop admission and drain executions before awaiting close(). */
export interface HostOwnedPollManagement extends PollManagement {
  close(): Promise<void>;
}

/** Public SDK subset used by the adapter. The factory seam permits offline contract tests. */
export type AdvancedPollClient = Pick<AdvancedIMessage, "close"> & {
  polls: Pick<AdvancedIMessage["polls"], "get" | "vote" | "unvote" | "addOption">;
};

function mutationOptions(execution: PollMutationExecution) {
  if (!execution?.childKey) throw new PollManagementRejected("INVALID_REQUEST");
  return { clientMessageId: `photon-poll-${createHash("sha256")
    .update(execution.childKey).digest("hex")}` };
}

/** Construct exactly once in the Photon host, after acquiring its ownership lock.
 * Only the public Advanced iMessage 2.1.0 gRPC entrypoint is used. The factory
 * cannot enable unary retries: a timeout or duplicateMessage must return to the
 * durable child executor for reconciliation. No message or poll stream is opened;
 * management uses returned snapshots and conversational votes keep unified ingress.
 */
export function createAdvancedPollManagement(
  options: AdvancedPollManagementOptions,
  create: (options: ClientOptions) => AdvancedPollClient = createClient,
): HostOwnedPollManagement {
  const client = create({ address: options.address, token: options.token,
    tls: options.tls, timeout: options.timeout, retry: false, autoIdempotency: false });
  let closing: Promise<void> | undefined;

  async function invoke(pollMessageGuid: string, call: () => Promise<Poll>) {
    if (closing) throw new Error("POLL_MANAGEMENT_CLOSED");
    if (!pollMessageGuid) throw new PollManagementRejected("INVALID_REQUEST");
    let response: Poll;
    try { response = await call(); }
    catch (error) {
      if (error instanceof NotFoundError) throw new PollManagementRejected("RESOURCE_NOT_FOUND");
      if (error instanceof ValidationError) {
        if (error.code === "operationNotSupported" || error.code === "privateApiUnavailable")
          throw new PollManagementRejected("UNSUPPORTED");
        if (error.code === "invalidArgument" || error.code === "preconditionFailed")
          throw new PollManagementRejected("INVALID_REQUEST");
      }
      // Do not treat transport errors, unknown codes or duplicateMessage as proof of rejection.
      throw error;
    }
    // Public Poll also carries creatorHandle and address metadata. Project the
    // domain fields before strict validation; never turn those extras into votes.
    const state = parseNativePollState({
      pollMessageGuid: response.pollMessageGuid, chatGuid: response.chatGuid, title: response.title,
      options: response.options.map(({ optionIdentifier, text }) => ({ optionIdentifier, text })),
      votes: response.votes.map(({ optionIdentifier, participant }) => ({ optionIdentifier,
        participant: { address: participant.address, service: participant.service } })),
    });
    if (state.pollMessageGuid !== pollMessageGuid) throw new Error("POLL_IDENTITY_MISMATCH");
    return state;
  }

  return {
    get: guid => invoke(guid, () => client.polls.get(guid)),
    vote: (guid, optionIdentifier, execution) => invoke(guid, () => {
      if (!optionIdentifier) throw new PollManagementRejected("INVALID_REQUEST");
      return client.polls.vote(guid, optionIdentifier, mutationOptions(execution));
    }),
    unvote: (guid, execution) => invoke(guid, () => client.polls.unvote(guid, mutationOptions(execution))),
    addOption: (guid, text, execution) => invoke(guid, () =>
      client.polls.addOption(guid, text, mutationOptions(execution))),
    close() {
      // Set the gate before calling SDK cleanup, including synchronous failures.
      closing ??= Promise.resolve().then(() => client.close());
      return closing;
    },
  };
}
