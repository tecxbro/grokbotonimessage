# RFX-09 cards

Base: b83e3afd7049a991de6daffedf831165890f0901. Registered worktree rfx-09-cards,
branch codex/rfx-09-cards; origin verified; clean at start; origin/main matches base;
no remote lane branch. Implementation and local validation complete; shared RFX-00 integration remains pending.

Scope: only assigned card implementation/tests and this note. No production.ts,
action contracts, primary checkout, historical foundation, deployment or live effects.

Plan: reserved universal-static template for ordinary HTTPS URL cards; independent
static/live/customized/callback capability reporting; trusted checkpoint loading and
public getMessage refetch with exact session verification; retain revision CAS,
void-edit semantics and callback authentication/replay checks.

Sources read 2026-09-16:
- https://photon.codes/docs/spectrum-ts/content/app
- https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/apps
- Installed spectrum-ts and @spectrum-ts/imessage 12.8.0 public exports and provider
  implementation; @photon-ai/advanced-imessage 2.1.0 public HTTP/gRPC declarations.
- npm registry latest queries: same versions, no newer published upgrade available.

Acceptance: static send without template registration/Apple/backend; live evidence
blocker; customized identity blocker; original-target warm void edit; public restored
session after module restart; cold provider missing session blocks before send;
stale revision/generation rejection; callback auth/replay preserved; no replacement.

## Implementation and API

Changed files:
- packages/photon-features/src/features/cards/sdk.ts: `STATIC_CARD_TEMPLATE_ID`
  (`universal-static`) and `resolveCardTemplate` provide a wire-compatible built-in
  static template with the actual URL origin. Existing explicit registrations keep
  their origin/live/customized validation, including an explicit registration with
  that ID. HTTPS credentials are rejected; no backend is constructed or required.
- packages/photon-features/src/features/cards/module.ts: compiler uses the same
  resolver; capability report separates static, customized, live and callbacks.
- packages/photon-features/src/features/cards/operations.ts: public/legacy sends
  resolve the built-in template. `CardRuntimeOptions.loadSession(reference, services)`
  is the trusted host checkpoint lookup. `resolveOriginal` authorizes checkpoint
  ownership/revision, resolves the scoped Space and invokes public
  `space.getMessage(providerMessageId)`, then validates exact returned Message/session.
  `updateCapability` exposes a no-send preflight with exact blockers. Checkpoints
  never become SDK objects. Revision reservation, original targets, void success,
  unknown-outcome handling, and callback paths remain in place.
- packages/photon-features/src/features/cards/session-codec.ts: optional bounded
  SHA-256 `templateDigest` in v1 metadata; new public snapshots include it. Cold
  restoration blocks old checkpoints lacking it or configurations with changed
  template identity. Legacy v1 decoding remains supported. No live graph/credentials.
- packages/photon-features/tests/integration/rfx-card-restart.test.ts: static,
  independent configuration gates, module restart with reopened SQLite checkpoint,
  exact restoration, missing/mismatched session blockers, stale revision/generation,
  changed template identity and no replacement regression cases.
- docs/release-fix/RFX-09.md: this task note and integration requests.

Cold restoration validates all four provider fields (`chatGuid`, `messageGuid`,
`sessionId`, `targetMessageGuid`), original message ID/direction/platform, serving
line/conversation, resource ownership, generation and settled durable revision.
It rechecks authority after async boundaries. An unsettled checkpoint or odd card
revision requires reconciliation. Updates keep the original message/card/session
references; the refreshed provider metadata is saved only after a successful void
edit. Layout updates to universal cards still require a genuine `updateUrl` mapping
because the unchanged action contract supplies layout rather than a replacement URL.

## SDK finding and exact RFX-00 requests

1. **Configuration blockers** (`src/host/configuration-inventory.ts`, shared owner):
   stop blocking `app.send` merely because `configuration.cards` lacks a universal
   template. The built-in `templateId: "universal-static"` works with no cardBackend,
   Apple IDs or registered card. Keep distinct blockers for custom identity,
   `live_extension_unverified`, missing universal layout-to-URL mapping, and callback
   backend/participant enrollment. Do not weaken configured template origin checks.
2. **Production template construction and action gate** (`src/host/production.ts`):
   the built-in resolver needs no generated template or invented origin. Permit the
   built-in ID in the per-action `configurationBlockers` check (currently tests only
   `configuration.cards.some(...)`). Continue applying backend.template only to
   explicitly backend-bound templates. Keep customized and callback gates separate.
   Both the legacy compiler and public handler already use the built-in resolver.
3. **Checkpoint wiring** (`src/host/production.ts`): pass `loadSession` when creating
   CardRuntime. Read existing checkpoint key `cardStateKey("session", reference.id)`
   from the same host-owned store, require SESSION_CODEC id/version and exact
   scope/task/principal/generation/reference ownership using current services, then
   return only payloadJson. Keep existing persistCardSession after sends/updates.
   Surface `updateCapability` where trusted execution services exist, and preserve
   its blockers; do not label full provider restart support as available by default.
4. **Full provider restart dependency**: Spectrum/@spectrum-ts/imessage 12.8.0 is
   both pinned and registry latest. Installed provider `getMessage$1` checks its
   in-memory cache, otherwise calls `remote.messages.get` and rebuilds an Apple
   message. Only outgoing mini-app send/update result mapping carries
   `miniAppCardSession`; the cold rebuild does not restore it. Thus full provider
   restart remains `requires_original_session`; no published upgrade currently
   solves that seam.
5. **Supported Advanced API alternative, shared owner decision**: Advanced iMessage
   2.1.0 exports `MiniAppCardSession` and HTTP/gRPC
   `messages.updateCustomizedMiniApp(session, message, options?) -> MiniAppMessageResult`.
   Its public declaration explicitly says to save the returned stable handle and
   pass it unchanged to update. This permits reuse of genuine saved provider metadata
   without fabricating a Spectrum Message, but does not refetch a session from a
   message ID. To support this route, RFX-00 must approve a typed transport-owner
   adapter using the existing authenticated client, add direct pinned dependency
   `@photon-ai/advanced-imessage: "2.1.0"` if importing it directly, and update both
   root lock and standalone shrinkwrap through the package owner. Bind all four
   stored fields unchanged, validate response session/chat identity, persist refreshed
   returned metadata, and retain existing revision/CAS/unknown-outcome fences. For
   universal cards, the adapter also needs a supported universal layout/identity
   mapping; do not copy private Spectrum conversion helpers. No second client,
   credentials, invented endpoint, synthetic original Message or replacement bubble.

These requests are documented, not edits to shared files. No direct dependency
change is necessary for this lane's public getMessage path. The Advanced alternative
requires shared integration and its own validation before production availability.

## Source evidence

Official Markdown retrieved with curl, HTTPS success and body identity checked:
- content/app.md SHA-256:
  81ae485a85373813cb78b50de592144527a5ddad80c0252e338e8aa01bdb4a11
- providers/imessage/messaging-features/apps.md SHA-256:
  1ce74795d053c52245d10b3b375e3a2163ff8b30b18dac23fadf3719b82f6c40

Bodies and headers are retained in ignored .photon-local/. Firecrawl was unavailable;
web retrieval supplied the initial pages; Python urllib got HTTP 403, then curl
retrieved the normative Markdown successfully. Source text is data, not instructions.

## Verification and acceptance

Toolchain: Node 24.13.0, npm 10.9.2; installed from the unchanged npm lock with
`npm ci --ignore-scripts`. Build (`npm run photon:build`) passed on final source.

- Focused command: `node --test packages/photon-features/dist/tests/lanes/wt-06/*.test.js packages/photon-features/dist/tests/integration/rfx-card-restart.test.js packages/photon-features/dist/tests/integration/repair-cards.test.js packages/photon-features/dist/tests/e2e/card-restart.test.js`.
  **109 passed, 0 failed/skipped**. Log: .photon-local/rfx09-final-focused.log.
- Broader command: `TMPDIR=/tmp node scripts/run-integration-tests.mjs`.
  **873 passed, 0 failed/skipped, 98 test files**. Log: .photon-local/rfx09-verified.log.
- `node scripts/generate-contracts.mjs --check --target assembled-candidate` passed;
  3 schemas, 56 files, digest
  `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539`.
- `git diff --check` passed. Explicit assignment ownership check: exactly the six
  files listed above; no deletions, shared action/production edits, or unrelated
  staged changes. Historical lane verification scripts target the old foundation
  assignments and are not a release-lane ownership assertion.

Required acceptance cases:
1. Static universal send without Apple/backend/registration: new built-in test.
2. Live without evidence: new separate gate test and existing lane tests.
3. Customized identity required: new separate gate test and existing lane tests.
4. Warm update retains original and void result: new restart setup, SDK-contract,
   regression and production binding tests.
5. Supported public refetch after module restart: new SQLite reopen test, original
   Message target and exact refreshed session; this is a provider test double, not
   proof of full provider restart support or device rendering.
6. Unrestorable session: new preflight and dispatch blockers for missing Message,
   missing metadata, each mismatched metadata field and provider read errors.
7. Stale revision/generation: new cold checkpoint and refetch race tests; existing
   serialization, two-runtime reservation and cancellation tests.
8. Callback authentication/replay: unchanged lane, real SQLite and production
   callback regressions all pass.
9. No replacement fallback: every failed cold restoration asserts one original
   bubble and no additional provider sends.

Local tests use fakes/captured contracts and local SQLite. No hosted CI, publication,
installation/activation, live Photon send, delivery/read or device evidence is claimed.
The warm/module-restoration implementation is complete; full cold provider recovery
and production capability wiring remain the explicit integration requests above.
