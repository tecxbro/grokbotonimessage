# RFX-05 configuration simplification

Base: `b83e3afd7049a991de6daffedf831165890f0901`. Registered worktree:
`/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-05-config-simplify`.
Branch: `codex/rfx-05-config-simplify`. Origin matched the requested repository;
initial staged, unstaged and untracked inventories empty; remote main matched;
no remote lane branch existed. Historical foundation remains untouched.

## Plan and ownership

Only generate-configuration.mjs, host/configuration.ts, host/authority-admin.ts,
examples/profiles/*, examples/configuration-input.json, the existing
completion-configuration.test.mjs, and this task note are owned.

Add versioned discovery-based generation with a private random installation-owner
credential, full registry task grants and capability-layer availability. Preserve
legacy v2 validation; normalize v2 deterministically to a v3 representation without
renewing or broadening durable authority. A v3 shared route may lack serving E.164;
its logical line ID is internal, never a Photon dedicated line. Generation records
activation intent but stays disabled. Advanced card inputs are validated only when
configured. Keep legacy profile generation available for compatibility.

Tests will cover the ten assigned requirements, ambiguity, private-path rejection,
credential reuse protections, legacy normalization and owner authentication.
RFX-04's exact output is being authored concurrently; consume its documented shape
before handoff. RFX-00 owns production/schema artifact integration; RFX-11 owns
activation and authority lifecycle. No live provider commands or deployment.

## Source evidence

Official documentation reviewed: https://photon.codes/docs/cli/authentication,
https://photon.codes/docs/cli/projects, https://photon.codes/docs/cli/spectrum.
These document private CLI credentials and distinguish secret rotation from reads.
Discovery is delegated to RFX-04; the generator must execute no provider commands.

## Implemented interface

Normal setup awaits `generateConfiguration({ version: 2, discovery,
choices?, activateAfterValidation?, cards?, cardBackend? })`. `discovery` is the
actual RFX-04 `SetupDiscovery` v1 (`kind: "setup-discovery"`), not a manually
written host configuration. `examples/configuration-input.json` illustrates this
shape; replace the entire example discovery object with real setup output.

Optional `choices` contains only `projectId`, `grokAgentId`, `initialAddress`, or
`initialConversationId`. Project ambiguity requires RFX-04 to rerun discovery for
the selected project; this generator refuses to relabel another project's secret
or resources. Multiple Spectrum users can be selected by their intended address.
Only IDs present in the live Grok candidate roster are accepted. Other unresolved
errors remain blockers. Shared serving-number absence is supported by the v3
configuration, independently of production's remaining route integration.

Output is version 3 with `ownerModel: "installation-owner"`, a random 256-bit
local token in a 0600 file, random UUID identities, generation 0 and a generated
24-hour initial authority lifetime. No internal IDs, timestamps, token values,
operation lists or pseudo-line identifiers are product input. The generator checks
private 0700 roots, verifies the existing private secret descriptor and its project
identity, and creates only private local token/storage directories. Existing
configuration, local-token, state.sqlite or runtime.sock blocks regeneration;
migration/authority transitions must preserve existing installs.

Task permission defaults include all 44 registry operations. Provider availability
contains the 40 base-supported operations: the four upstream-blocked native poll
management operations remain unavailable. Group/account/card capability checks
remain necessary; neither a grant nor generation proves capability. Administrative
intent and native-content intent are included in the full-owner default. The
initial known recipient is retained in allowedRecipients; RFX-03/RFX-00 still own
execution policy across other conversations. No card template is required for
text. Explicit customized/live card configuration requires actual extension
identifiers; configured backend relationships retain existing validation.

Shared mode sets dedicated=false; lineId is `shared:` plus SHA-256 of the JSON
array `[projectId, accountId]`. It is strictly an internal durable identity. The
account scope uses discovered accountId when present, otherwise the discovered
Spectrum user ID. Dedicated mode requires an actual matching discovered iMessage
line record. Serving E.164 is retained when known; no address or dedicated line is
invented. An initial user address is stored as provider.initialAddress, never
fabricated into a native conversationId.

The RFX-04 descriptor is `{path, mode:"0600", format:"photon-project-secret-v1"}`;
its private file contains `{version:1, projectId, projectSecret}`.
`readConfiguredProjectSecret(config)` validates and reads that file at runtime,
or reads the historical raw format. Config JSON and normal CLI output contain
only the file path/format. The generator invokes no external commands and cannot
purchase lines, rotate secrets, contact Grok, start a socket, or activate.

Legacy v1 generator input and the three profile JSON files remain compatibility
examples marked `legacy: true`. `productionHostConfigurationSchema` and
`loadProductionHostConfiguration` retain the v2 contract. New exports are:

- `normalizedHostConfigurationSchema` / `NormalizedHostConfiguration`: v3.
- `normalizeProductionHostConfiguration(input)`: pure, deterministic v2/v3
  normalization. Preserves permissions, IDs, generation, expiry, activation,
  explicit owner credentials, legacy card settings and all durable state.
- `loadCompatibleHostConfiguration(root)`: private/path-checked v2/v3 loader that
  preserves the persisted version for authority-admin writes.
- `loadNormalizedHostConfiguration(root)`: private/path-checked normalized read.
- `readConfiguredProjectSecret(config)`: private raw/descriptor reader.
- `installationOwnerCredential(config)`: resolve explicit legacy owner credentials
  or the new authenticated installation-owner credential.

Owner administration stays a stopped-host, selected-release, private-file command;
it is not added to the local socket protocol. New installs can reuse their local
owner token. Legacy installs retain the independent-admin-token requirement and
cannot be silently promoted by normalization. Authority transitions retain the
existing atomic audit/revision/generation checks and preserve the persisted config
version. A shared route without serving phone/native conversation currently fails
with SHARED_AUTHORITY_ROUTE_INTEGRATION_REQUIRED before opening state.

## Exact RFX-00 integration requests

1. In `production.ts`, import `normalizeProductionHostConfiguration`,
   `readConfiguredProjectSecret` and the normalized type from configuration.ts.
   Normalize the input at `createProductionComposition` entry. Replace the current
   raw `readPrivateFile(configuration.provider.projectSecretFile, 16 * 1024).trim()`
   expression with `await readConfiguredProjectSecret(configuration)`. Otherwise
   the RFX-04 JSON descriptor would be incorrectly used as the provider secret.
   Keep local credential reading/validation and the private socket unchanged.
2. At `production.ts`'s ProviderContext construction, map the normalized provider
   to RFX-01's `{accountId, lineId, dedicated, servingPhone: phone}` binding and
   preserve its shared outbound route behavior (no dedicated phone pin). Do not
   pass a generated logical line ID as a provider-issued line. The currently
   observed RFX-01 binding still requires servingPhone; its missing-number seam
   must be integrated explicitly, or lifecycle validation must remain blocked
   until that serving metadata is available. Never substitute a fake E.164.
3. Resolve `provider.initialAddress` through the approved provider/lifecycle path
   before `configuredAuthority`/`bootstrapOrValidateAuthority` requires a native
   conversation ID, or bind from a verified incoming conversation. Do not make up
   a chat GUID. Update the authority helper's shared-route/type boundary together
   with production. Apply that same helper in authority-admin.ts to remove its
   explicit SHARED_AUTHORITY_ROUTE_INTEGRATION_REQUIRED guard only once the route
   and native conversation are truly resolved. Preserve durable scope equality.
4. Propagate the normalized read/type to production callers (`process.ts`,
   task-launcher, capability/static-inventory consumers, install validation and
   RFX-11 lifecycle). The legacy loader deliberately does not silently accept v3.
   RFX-11 must validate prerequisites and consume activateAfterValidation intent;
   generation always writes activation="disabled" and does not claim activation.
   Existing `writeActivation` remains the v2 helper; integrate version-preserving
   v3 writes through the compatible loader. RFX-11 owns initial lifetime handling
   and renewal before/after the generated 24-hour expiry; no silent reseeding.
5. Publish a host-configuration-v3 JSON schema from the exported normalized schema
   and update the installed artifact/schema inventory and deployment/runbook text
   in their assigned lanes. Keep the original v2 schema/backward support. The
   current schema generator still checks/emits the historical v2 artifact.
6. Register the exact RFX-05 paths in release-fix ownership and update only the
   assembled-candidate contract digest after all lanes are integrated/reviewed.
   Do not rewrite the immutable foundation digest to suppress drift.

## Files changed

- packages/photon-features/scripts/generate-configuration.mjs
- packages/photon-features/src/host/configuration.ts
- packages/photon-features/src/host/authority-admin.ts
- packages/photon-features/examples/profiles/minimal-text.json
- packages/photon-features/examples/profiles/messaging.json
- packages/photon-features/examples/profiles/administrative.json
- packages/photon-features/examples/configuration-input.json
- packages/photon-features/tests/integration/completion-configuration.test.mjs
- docs/release-fix/rfx-05-config-simplify.md

## Verification and evidence

Pinned Node 24.13.0 / npm 10.9.2; dependencies installed locally with
`npm ci --ignore-scripts --no-audit --no-fund`. No dependency/lockfile changes.
Build passed. Focused configuration tests: 15 passed, zero skipped. They cover
all ten requested cases, plus private-file violations, regeneration refusal,
ambiguity, absent serving numbers and preservation of legacy admin boundaries.
The existing protocol negative assertion for authority.apply remains intact.

The initial full non-live integration run passed 868 tests across 97 files. A final
run after the legacy live-card migration edge-case test is recorded below.
Two additional actual-RFX-04 handoff tests passed (shared and dedicated): copied
and transpiled the sibling's setup.ts/output.ts/grok-discovery.ts and installer
into an ignored local harness, invoked its real discovery implementation only
against fake child executables, then fed its returned object to this generator.
Neither sibling source nor its worktree was modified. Snapshot hashes:

- setup.ts: b1b9adc08d4b20ab02141a9a8752b15b4b55143fd0f93d568c145000a503c882
- output.ts: d7fa1644aefdaa08a67eb862d945d605254d20752f1ebde00d1a0554bc12e367
- grok-discovery.ts: 1a99e8a75a13ac8f5f89d17aea160462bf9b97a3ede931d69f8d8c002624ce90

`verify-docs.mjs integration` passed its historical structural checks.
`photon:check` with explicit assembled-candidate target failed
CONTRACT_DIGEST_DRIFT because the candidate digest includes changed host sources.
`verify-ownership.mjs rfx-05` failed UNKNOWN_LANE because the historical manifest
has no RFX entries. These remain integration gates, not successful no-ops. A
separate exact-path audit against the user's assignment is recorded below.

Ignored evidence: `.photon-local/rfx-05-evidence/{focused,integration,handoff}.log`
and the discovery harness/source hashes. No live provider/device/VM tests, push,
deployment or activation occurred. No tests were weakened or skipped.

Official source retrieval used Accept:text/markdown and verified HTTP 200,
text/markdown, the page title/body and SHA-256 (the initial .md URL attempt was
403; content negotiation succeeded at the supplied canonical URLs):

- authentication: 7c4b1c73ee9478c4fbca1338648f6ff7a74a748cce7a89b8563e0b1bbf55ce08
- projects: bdf51faeb855600efa5b7c799f0a5276c71d61797fb1d311c50cb1a860835bda
- spectrum: 5af57fd1a7d9271e42768f13c97512c375a3fd4e820ff619a1acc3699f670596

Bodies/headers are preserved under the ignored evidence directory. The public
SDK inspected remains spectrum-ts 12.8.0; no invented provider methods are used.

Final verification: `npm run photon:test:integration` passed **869/869** tests
across **97 files**, zero failed/cancelled/skipped/todo. Package build passed in
that command. `git diff --check` passed. Exact assignment-path audit passed for
all nine changed files; no deletions, dependency changes, production.ts edits,
core authorization edits, or sibling changes. Tested base HEAD was
b83e3afd7049a991de6daffedf831165890f0901 plus this lane's changes; per-file dirty
content SHA-256 values were recorded in the ignored working-content.json.

Implementation commit: `54f90b99e2a325759b52639bca8c43716850f7e7`.
This following documentation-only commit records that exact tested implementation
identity. No source changes occurred after the final 869-test run. Both commits
remain local on codex/rfx-05-config-simplify; nothing was pushed.

## Integration-return fix: initial conversation resolution

RFX-00 reported that its assembled `validateProductionInstallation` called
configuredAuthority before fresh address-only configuration had a native ID.
Its composition also called requireRoutedConfiguration before the single SDK
owner could resolve that address. Read-only reference was integration commit
`cf5521921c3e6526ad6e32b02ac945f6dd94b65f`. This lane remains based on its reviewed
f07cf5973b9c11a9deccc4a19f87bbe7092b1cea; no integration commit was merged.

RFX-00 explicitly authorized a new narrow helper file and retains production,
process, activation adoption and Grok command-style field wiring. Follow-up edits
are limited to new `src/host/initial-conversation.ts`, the existing owned
completion-configuration.test.mjs and this note. configuration.ts, the generator,
Grok fields, production.ts and process.ts are untouched by this follow-up.

New exports in `initial-conversation.ts`:

- `validateInitialConversationPrerequisites(config, now?)`: offline normalization
  and expiry validation. Accepts a fresh installation-owner initialAddress without
  conversationId, but rejects an existing state.sqlite/WAL/SHM instead of silently
  binding different conversation authority. Does not create SQLite or contact SDK.
- `activationAfterValidationRequested(config, explicit?)`: adopts the saved
  activateAfterValidation intent when the option is undefined; explicit false
  overrides it. Returns a decision only, never changes activation or starts SDK.
- `resolveInitialConversation(root, expectedConfig, owner, ownership)`: uses the
  existing started SpectrumOwner and HostOwnership handle. Validates private
  persisted config against expectedConfig, activation=enabled, unexpired authority,
  current-PID/current-UID host lock, and matching owner project/account/logical
  line. Calls only public owner.provider().space.create(address[, {phone}]) and
  space.get(returnedId[, {phone}]). Shared mode omits the route argument and
  requires returned phone="shared"; dedicated mode pins/requires its serving phone.
  Both responses must be __platform="imessage", type="dm", with nonempty native
  ID and exact expected route. Peer evidence in the returned `<service>;-;<address>`
  native ID must match the requested address (email case-insensitive); group or
  opaque IDs without that peer evidence fail closed. get must return the exact ID
  create returned. Both returned routes must also resolve through owner.routes.inbound
  to the configured project/account/logical line. The application never manufactures or rewrites a chat GUID.

The helper changes only persisted provider.conversationId, using exclusive 0600
temporary file, file fsync, rename and directory fsync. It checks exact config and
lock snapshots and authority expiry across provider awaits and before rename;
concurrent calls on the same root are fenced. Task IDs, grants, generation,
issuance/expiry, credentials, activation and all other config fields remain intact.
An already persisted ID is returned without provider calls. No retries, send,
receiver/listener creation, SDK construction or stop occur in the helper. Same-user
host-lock cooperation remains the filesystem concurrency boundary; this does not
claim protection against a hostile process editing files as the installation user.
A provider failure leaves the local config unchanged; no fabricated fallback ID.
A crash after provider create but before local persistence has no invented receipt
or retry guarantee. Retry must reread the persisted config; this helper does not
claim network/provider exactly-once behavior or delivery.

### Required RFX-00 wiring for this follow-up

1. In process.ts offline validation, retain selected-release, private-file,
   executable, secret and credential checks; call
   `validateInitialConversationPrerequisites(configuration, now)`. If unresolved,
   return the validation report with native resolution pending; do NOT call
   configuredAuthority, create/open SQLite, bootstrapOrValidateAuthority, or SDK.
   Preserve normal durable validation for existing resolved configurations.
2. Preserve an omitted setup flag as `undefined`, not false. Compute intent using
   `activationAfterValidationRequested(configuration, options.activateAfterValidation)`.
   After successful offline checks, perform the existing locked enable operation
   only if that decision is true. This must not imply the host is running. Explicit
   programmatic false remains a veto; do not erase generated true intent merely
   because the CLI flag was absent. RFX-00 owns these process.ts changes.
3. During authorized run, acquire selected-release host ownership first, perform
   offline validation and verify persisted activation=enabled. Construct and start
   exactly one SpectrumOwner with its existing project credentials/routes. Before
   opening state or deriving configuredAuthority, call
   `resolveInitialConversation(root, configuration, owner, ownership)` for unresolved
   config. Keep signal/cancellation handling and failed-start owner cleanup around
   this entire phase. The helper deliberately never acquires a second lock or
   constructs/stops a second SDK. If resolution fails, stop that owner and retain
   ownership on cleanup failure under the existing lifecycle policy.
4. Pass the SAME owner and resolved configuration into the production composition;
   move owner construction before native-ID-dependent state/authority work or
   accept an already-owned instance. Do not call the factory again. Its start is
   already idempotent; claim the sole messages receiver only once through normal
   runtime startup after the resolution/state transition. Then the existing
   requireRoutedConfiguration/configuredAuthority checks have the exact persisted
   native ID. Resume/restart uses that ID without create/get again.
5. Add assembled process/composition tests for this offline validation -> explicit
   activation -> one owner -> native resolution -> durable authority -> sole
   listener order, including cancellation and provider cleanup failures. This
   lane's helper tests cannot prove integration wiring that it does not own.
6. Do not renew/reset the generated 24-hour authority. Expired binding is still an
   explicit separate lifecycle blocker. This helper checks expiry before and after
   provider awaits and never alters issuedAt/expiresAt/generation.

### Follow-up evidence

Pinned Node 24.13.0/npm 10.9.2 and spectrum-ts 12.8.0 retained. Build passed;
focused completion-configuration suite passed 29/29, zero skips. It uses the real
SpectrumOwner implementation with an injected fake SDK factory, real private
fixture files and host locks; no provider connection or live messages. Tests prove
one factory and one listener, exact public call arguments, route/peer rejection,
private atomic replacement (new file inode), no state/credential changes, stale
config and lock rejection, parallel-call fencing, offline address validation and
activation-intent precedence. Full non-live suite result is recorded below.

Official Markdown retrieval on this follow-up: HTTP 200, text/markdown, verified
page titles/body and SHA-256:

- https://photon.codes/docs/spectrum-ts/spaces-and-users:
  f69d3567ce5bb75b6db2348c1906ff0e8629941be75c49f64416311693fbe044
- https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing:
  566a8ddbd1cf0dccdbcd3695c6e28c3cc4b100d97e606c0ee923ade339f24c47

Pinned public SDK declarations expose space.create/get; installed imessage
12.8.0 implementation returns the shared DM ID and route and uses the same
`;-;` peer separator. No private SDK function is imported or invoked. This is
provider resolver evidence only, never message delivery/read/device evidence.
Logs are `.photon-local/rfx-05-evidence/followup-{focused,integration}.log`.

Final follow-up full run: **878 passed / 883 tests; 5 failures; 0 skips** across
97 files. All resolver/owner/configuration regressions passed. The five failures
are the explicit assembled-target contract fixture (three branch/detached child
assertions plus parent) and its final drift-test control assertion. Those fixtures
run `git archive HEAD` (f07cf5973b9c11a9deccc4a19f87bbe7092b1cea during this run)
and fail CONTRACT_DIGEST_DRIFT because that reviewed lane HEAD contains prior host
configuration changes while its candidate digest remains at the release base.
The uncommitted new helper is not even present in that archived fixture. No digest
or fixture was changed to hide this integration gate. RFX-00 must regenerate the
assembled-candidate digest and reconcile its source-file-count assertion after
assembly; immutable F0 remains unchanged. Build and focused tests passed; the full
suite is explicitly NOT reported as passing.

Manual review and `git diff --check` passed. Exact follow-up assignment audit:
three files only, no deletions, no changes to reviewed configuration/generator or
Grok fields. No live provider/VM/Mac operation, activation, send, push or deployment.
Follow-up implementation commit: `57c5f94ea8365ffa2d84e5a38e1fb8214449752c`.
This documentation-only commit records the reviewed/tested source identity. The
only change after the final test run was removing a trailing blank line. Both
follow-up commits are local; the working tree is clean at handoff.

### Exact pinned public SDK evidence for the DM peer check

Public distribution: https://unpkg.com/@spectrum-ts/imessage@12.8.0/dist/index.js
Retrieved HTTP 200, text/javascript, 114644 bytes; SHA-256
`2f7e13c432ad4e84f96b76eb3d59062d70d3d7e46737a7e15198a47ecda6ef24` exactly matches
the installed node_modules/@spectrum-ts/imessage/dist/index.js bytes.
Lines 664-671 define the shared DM encoding and the DM peer separator/read logic.
Lines 2873-2905 implement public space.create/get: shared create returns the SDK's
DM identifier and shared route; dedicated create returns the actual chat.guid
and selected phone; get returns the exact supplied native ID and provider route.
These published bytes, plus the official space.get DM example, ground the
helper's bounded peer validation. No unexported helper is imported or invoked.

The public type schema admits a string ID; it does NOT promise every future or
provider-specific ID has this grammar. Our explicit safe subset rejects unknown
formats instead of accepting a DM without verifiable peer evidence. It never
constructs an ID from that grammar and never relabels a returned route. In shared
mode the ID is SDK-resolved rather than proof of server-side chat creation;
space.get is not an independent server receipt. Neither call proves delivery.
