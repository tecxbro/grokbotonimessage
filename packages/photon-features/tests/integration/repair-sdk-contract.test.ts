import test from "node:test";
import assert from "node:assert/strict";
import { poll, option, type PollOption } from "spectrum-ts";
import type { OwnedProvider } from "../../src/adapters/transport/spectrum-owner.js";

// Compile-only boundary probes. Never invoke provider methods in development.
function pinnedPublicBoundary(provider: OwnedProvider, vote: PollOption) {
  const attachment: OwnedProvider["getAttachment"] = provider.getAttachment;
  // @ts-expect-error Spectrum 12.8.0 narrowed provider has no public poll-management namespace.
  provider.polls;
  // @ts-expect-error The client is only reachable through forbidden Spectrum __internal state.
  provider.client;
  // @ts-expect-error PollOption exposes title/selected, not a native option identifier.
  vote.optionIdentifier;
  // @ts-expect-error No public native poll GUID on incoming PollOption.
  vote.pollMessageGuid;
  return attachment;
}
void pinnedPublicBoundary;
test("pinned public poll builders do not expose authoritative option identity", async () => {
  const content = await poll("Pick", [option("same"), option("same")]).build();
  assert.equal(content.type, "poll");
  if (content.type !== "poll") throw new Error("WRONG_BUILDER");
  assert.deepEqual(content.options, [{ title: "same" }, { title: "same" }]);
});
