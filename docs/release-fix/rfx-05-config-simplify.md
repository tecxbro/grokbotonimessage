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

Implementation commit identity will be recorded in a following documentation-only
commit so this note does not attempt to embed its own future Git hash.
