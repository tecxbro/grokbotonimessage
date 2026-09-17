# RFX-03 multi-conversation authorization

Base: `b83e3afd7049a991de6daffedf831165890f0901`.
Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-03-multi-conversation`.
Branch: `codex/rfx-03-multi-conversation`.
Implementation commit: `903041c0d468d74b72a23a364320b4020d8f2b86`.
A subsequent documentation-only commit records this exact SHA; production/test content is unchanged.

## Scope and design

Only the six assigned production files, the new integration test, the relevant
native semantic regression test and this note are owned. The current task keeps its root scope. An additional conversation is
usable only when its exact durable space reference belongs to the same principal,
task and generation on the same project/provider/account/line. Every secondary
leaf and its message/poll/card ancestors must independently satisfy that ownership.
Streams retain exact root scope. No arbitrary same-line chat is adopted by shape.

The inbound policy helper reads the current context, task and conversation grant
inside the reduction transaction. Unknown, revoked, expired, cancelled, stale or
foreign identities remain unresolved. `activeRoute` also checks the durable grant
so a policy return alone cannot authorize a secondary chat.

## Files changed

- `packages/photon-features/src/contracts/resources.ts`: additive `sameLineScope`; `sameScope` unchanged.
- `packages/photon-features/src/runtime/core/conversation-routes.ts`: exact ownership and recursive conversation/parent checks.
- `packages/photon-features/src/runtime/core/authorization.ts`: refreshed authority and durable secondary reference authorization.
- `packages/photon-features/src/runtime/inbound/router.ts`: `routeConversation` and durable active-route validation.
- `packages/photon-features/src/features/native/guards.ts`: line binding, authoritative conversation resolution and complete returned identity check.
- `packages/photon-features/src/features/native/spaces.ts`: validate the creation callback's durable ownership grant.
- `packages/photon-features/tests/integration/rfx-multi-conversation.test.ts`: local SQLite/provider-fixture regression coverage.
- `packages/photon-features/tests/lanes/wt-07/unit.test.ts`: retain foreign-reference rejection while allowing a provider binding with a different root conversation on the same line.

## Required production integration

`host/production.ts` remains unchanged, as required. Its integrator must:

1. Update `rowFor`/`createResources` to refresh authority and use `authorizedResource`
   in the same transaction as row reads, retaining exact stored-reference equality,
   owner/task/generation and provider-ID validation. Resolve the containing space
   using `reference.scope.spaceId`, not `context.scope.spaceId`; route provider
   reads with the exact authorized reference scope and stored conversation ID.
2. Replace the root-only inbound policy with
   `routeConversation(tx, event, context, now())`, preserving poll correlation checks.
3. Keep native bindings line-scoped via `sameLineScope`; resolve each exact
   conversation ID on that authenticated line. Keep shared routing identity
   `shared`, and do not enable shared group creation/group-change ingress.
4. Preserve the atomic created-space row in `registerCreatedSpaceForExecution`,
   current-context revalidation and conflict rejection. This row grants follow-up
   use to the existing task, with no new context/task enrollment.

Additional inspected seams outside this lane also require integration before
claiming end-to-end secondary `text.send` or work retrieval:

- `adapters/state/unit-of-work.ts`: `domainRecordAllowed` currently hides/rejects
  every secondary domain row. Permit only authorized conversation rows and their
  owned child chains; do not permit arbitrary feature-created space grants.
  The new native creation grant verification also needs this read access: with
  the current public adapter it fails closed after provider creation, so this
  lane must not be activated by itself. Such a result remains an unknown outcome,
  not a safe automatic retry.
- `features/text-messages/targets.ts` and `sdk.ts`: exact-root guards and root
  provider-conversation bindings must resolve the authorized target conversation;
  outgoing references must retain its scope. This lane tests `text.send` admission
  and native space lookup, not a successful production text dispatch.
- `features/native/module.ts`: outgoing native message registration currently
  calls `remember` without the target scope; metadata lookup synthesizes the root
  space. Pass the authorized conversation for these secondary child operations.
- Host inbound resource registration, work listing/claiming and wake scheduling
  remain scoped to the root in other files. Integrate secondary handoffs without
  changing the task identity or merging separate conversations into one batch.

## Source evidence

Retrieved 2026-09-17 UTC; local ignored snapshots under `.photon-local/sources/`.

- [Photon connection and routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing), Markdown HTTP 200. SHA-256: `566a8ddbd1cf0dccdbcd3695c6e28c3cc4b100d97e606c0ee923ade339f24c47`. Free/Pro shared routing supports DMs; group creation and inbound group changes require dedicated lines.
- [Pinned iMessage source](https://github.com/photon-hq/spectrum-ts/tree/v12.8.0/packages/imessage), fetched via public GitHub tree API and raw source after the browser tree fetch failed.
- [`src/types.ts` at v12.8.0](https://github.com/photon-hq/spectrum-ts/blob/v12.8.0/packages/imessage/src/types.ts#L17), HTTP 200, line 17 verifies `export const SHARED_PHONE = "shared";`. SHA-256: `dddd0909969061edb1e648c35dca756840983433ffffbe03895765629c820c1b`.

## Tests and evidence

Verified locally with Node 24.13.0, npm 10.9.2 and lockfile-installed dependencies
(`npm ci --ignore-scripts --no-audit --no-fund`). The initial shared dependency
cache had incompatible Node types; the isolated lockfile install resolved that
without dependency or lockfile edits.

Tested base HEAD: `b83e3afd7049a991de6daffedf831165890f0901`, with the eight changed
production/test files. SHA-256 over sorted path + NUL + bytes + NUL:
`ad42028980b322dce30aad8f906954e7d7571c4cc3e730503beeca7b3584d300`.
The later commit only records this tested content and documentation.

- `npm run photon:build`: passed (strict TypeScript build).
- Focused new RFX-03 plus native WT-07 suite: **125/125 passed**, no skips.
- `node scripts/run-integration-tests.mjs`: **887/887 passed**, 98 test files,
  no skips; explicitly excludes live tests. Log: `.photon-local/integration-tests.log`.
- Regression proof: replacing only ignored compiled authorization with the base
  implementation produced **19 failures of 31 new tests**. Restored the current
  compiled file byte-for-byte; the focused suite passed 125/125 again.
- `node scripts/verify-docs.mjs integration`: structural/source validation passed.
- Exact user-assigned path audit using `checkOwnership`/`changedPaths`: **9 files
  passed**. Manual diff and `git diff --check` passed. No pending deletions.
- Existing `node scripts/verify-ownership.mjs integration`: **blocked**, reports
  `UNOWNED_PATH:docs/release-fix/rfx-03-multi-conversation.md`. The old ownership
  ledger has no release-fix assignment. Integrator must register the exact RFX-03
  files and reviewed commit; no historic ownership file was rewritten here.
- `npm run photon:check` (explicit assembled-candidate target): **blocked** with
  `CONTRACT_DIGEST_DRIFT` because `contracts/resources.ts` changed. Integrator must
  refresh the assembled candidate contract digest/inventory after review. Preserve
  the immutable foundation digest; this is not a passing release gate.

Acceptance coverage: root lookup; unknown conversation denial; DM creation and
SQLite restart persistence followed by `text.send` authorization/native lookup;
another task/principal denial; old and newly advanced generations; revoked,
cancelled and expired contexts; secondary inbound same-task handoff; unknown
inbound unresolved; cross-project/account/line denial; shared DM; shared group
rejection; dedicated group creation. Additional cases cover the complete
message/attachment/reaction/poll/option/card/session chain, corrupt grant rows,
foreign parents, forged resolver identity and an unpersisted creation callback.

This is local lane evidence, not production dispatch, provider delivery, device
observation or a release approval. The production integration requests above and
the two release gates remain open. No push, deployment, activation, live provider
messages or VM/Mac access occurred.
