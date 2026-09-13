# Integration worklog

## 2026-09-10 — identity and input review

The designated worktree was initially absent, so work stopped without mutation.
After explicit authorization, created the registered worktree and branch from
`photon-v3-f0`. Verified repository origin, exact F0 resolution, clean status,
branch reflog, remote main identity, and absence of a remote integration branch.

Read root `AGENTS.md`, F0 foundation/ownership records, all nine lane HANDOFF,
FILES, TEST-EVIDENCE, and CHANGE-REQUESTS documents, the required official Photon
snapshots, the four requested Photon skills, Spectrum provider/lifecycle and
capability references, and webhook verification/retry references.

Validated each commit in `photon-v3-f0..photon-v3/wt-NN`. No changed path overlaps
exist between lane deltas. WT-01 has implementation commit `08d9ed3...` plus
documentation commit `15aa038...`; WT-09 has test/report commit `dacae5e...` plus
documentation commit `4743aa7...`. All other lanes have one reviewed commit.

Current checkpoint at commit `f343a46f2a57256b57fa372d1b10ac924e472ab6`:
WT-01, WT-02, WT-03, and WT-08 exact reviewed commits are integrated. The
integration-owned feature runtime test was migrated from the intentionally
unimplemented legacy executor to the public `f0-services-2` execution path.

The real local path now crosses CLI JSON input, authenticated Unix socket,
durable submission and claim, public `executeOperation`, the public text handler,
and an offline Spectrum `Space.send`. It records exactly one SDK-return acceptance
observation, returns one message reference, and suppresses duplicate execution.

`npm run photon:build` passes. The focused WT-01/02/03 set passes 80/80 and the
feature runtime round trip passes 1/1. The combined WT-01/02/03/08 run passes
90/91; the sole WT-08 regression rejects available Node 24.19.0 because its
installer fixture requires exact Node 24.13.0 despite the package contract
allowing `>=24.13.0 <25`. That compatibility decision remains open and explicit.

Next checkpoint: commit this working-path evidence, then integrate WT-04 through
WT-07 individually, rerunning the build and text round trip after every lane.

## 2026-09-10 — complete lane assembly and WT-09 defect closure

Integrated WT-04, WT-05, WT-06, WT-07, then both reviewed WT-09 commits. After
each feature lane, the TypeScript build and exact-once offline text round trip
passed. The first assembled WT-09 run under Node 24.19.0 passed 72/76, failed
three, and skipped the authorization-gated live case.

Kept WT-08's exact Node 24.13.0 artifact contract unchanged and reran its
installer case with that available pinned runtime; it passed. Migrated WT-09's
legacy text roundtrip to the same public `f0-services-2` seam already proven by
the working-path checkpoint. Fixed the WT-02/WT-05 composition defect by letting
a reducer return its already-durable continuation and requiring the router to
validate and adopt that exact task/scope/event binding. The router re-reads inbox
state after reduction, preventing both a stale fence and a duplicate handoff.

Focused affected tests pass 49/49. The exact 11-file WT-09 candidate suite under
Node 24.13.0 passes 75/76 with zero failures and the one deliberately disabled
live test skipped. No installation, activation, provider delivery/read, or device
behavior occurred.

## 2026-09-10 — complete surface and aggregate verification

Added the fail-closed integration composition for the actual WT-02 through WT-07
factories. It assembles exactly 44 public handlers and 12 compiler families. The
WT-07 public adapter reuses the scoped provider and journals native effects through
one stable child. The integration-owned poll compiler fills the reviewed lane's
intentional compatibility gap using the public Spectrum builder.

Added the package bin, integration export, and source-derived aggregate runner.
Under exact Node 24.13.0, `photon:test:integration` discovers 77 non-live files and
passes 756/756 tests with no failures or skips after the operating-skill acceptance
test was added. Aggregate worktree, F0, schema,
generated-skill, ownership, docs, and package dry-run gates also pass. The package
dry-run inventories 321 files.

No real archive was produced: WT-08 correctly requires a clean committed candidate
and a genuine workflow approval bound to its SHA. Synthetic distribution fixtures
prove inactive install/reinstall/verification/rollback mechanics only. There was
no installation, activation, provider delivery/read, rendering, interaction, or
device behavior.

The first post-commit aggregate exposed a WT-08 test assumption: its dirty-candidate
guard used the current checkout, so a clean integration commit advanced to the
deliberately missing approval file instead of exercising the guard. Integration
reassigned that aggregate test and now creates a temporary isolated Git repository
with one committed and one untracked file. The production package guard was not
changed.

## 2026-09-10 — assembled handler status in the operating skill

Stopped copying the immutable F0 catalog's `unimplemented` declaration into the
assembled manual. The generator now builds the actual complete lane factory
surface with inert dependencies and consumes the handler-status projection
returned by `assembleFeatureSurface`. The generated table names this field
`Handler implementation` and explicitly keeps provider support, scoped
availability, and live verification separate.

Added an integration acceptance test that parses the generated manual and checks
all 44 owner/status rows against the actual assembled registry. This is independent
of the generator's text drift check and fails when the manual and assembly disagree.
The exact Node 24.13.0 aggregate passes 756/756 non-live tests with zero failures
or skips; no provider, account, conversation, installation, or live check ran.

## 2026-09-10 — instruction-role separation

Preserved the F0 rollout and WT-08 inactive-install manuals while labeling both
as historical checkpoints. Added one current deployment runbook and packaged it
beside the installed operating skill. Repository/worktree agent instructions now
identify themselves as development-only, and the operating skill distinguishes a
real incoming request in its originating conversation from an unsolicited
development test.

Repository inspection found no release-owned host executable or approved
supervisor start/stop command. The current runbook therefore documents exact
release staging, configuration/skill-binding requirements, offline smoke, and
inactive rollback, then stops explicitly before activation. It does not infer
that documentation wording caused any approval failure.

## 2026-09-10 — Grok skill and launcher binding audit

Searched production source, scripts, package metadata, service/configuration
files, and current deployment documentation for the Grok skill loader and task
environment injector. The installer only preserves `SKILL.md` in the versioned
release. The client CLI reads `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET`, and
`GROK_PHOTON_CREDENTIAL_FILE`; tests supply them directly. No production
orchestrator loader, task-launch adapter, service unit, or injection configuration
exists in this repository.

Updated the deployment runbook and handoff to record the binding as `unbound` and
activation-blocking. Closure now requires the exact external orchestrator and
per-task loading/injection mechanisms plus redacted proof observed at the task
launch boundary or within a controlled non-message task. Release file presence,
package inventory, install output, and orchestrator startup alone are explicitly
insufficient.

## 2026-09-10 — concrete production host and Grok task path

Implemented a release-owned single-route production composition without changing
feature handler semantics or adding an orchestration layer. `grok-photon-host`
now verifies the selected immutable release/skill, validates strict owner-only
configuration, takes an exclusive conservative lock, constructs one Spectrum
owner and one SQLite store, recovers before ingress/outbox, serves one
credentialed Unix socket, and performs ordered SIGTERM cleanup.

Added `grok-photon-task` to verify release, task ID/generation, expiry, and skill
identity before injecting the existing local client variables. Inbound wake uses
the configured existing `gbot --gateway send` command with a fixed pointer-only
prompt naming the release skill and exact durable `work.claim` command. Gateway
acceptance remains distinct from handoff claim/acknowledgment.

The first focused round trip found that the socket called durable submission
directly and did not kick the new outbox loop. Routed socket dispatch through the
host executor and added regression coverage. The final exact Node 24.13.0
aggregate passes 759/759 non-live tests across 79 files, with zero failures or
skips. No archive, install, activation, real credential, provider call, external
Grok task, message, or device action occurred.
## 2026-09-10 — release-local SQLite migration

Confirmed that the custom collector packaged compiled source, schemas, examples,
dependencies, and support files but omitted the SQL migration used by the
production SQLite adapter. Repository tests masked the omission because the
adapter searched every ancestor for a matching source tree.

Integration took explicit ownership of the shared packaging/runtime correction.
The collector now includes `src/state/migrations` in the checksummed payload and
the compiled adapter resolves only the exact package-relative migration. Added a
release-layout regression that builds an archive from the real compiled adapter,
installs it under a temporary directory outside the checkout, opens and closes a
real store, reopens it, then proves an unrelated ancestor migration is rejected.

Focused Node 24.13.0 build, typecheck, distribution tests (8/8), and existing
installer tests (2/2) pass. The complete non-live integration suite passes
757/757 across 77 test files with no failures or skips.

Applied the exact working diff to a clean ephemeral integration candidate and
ran the real `packageCandidate` boundary under Node 24.13.0. Its required five
test commands passed and it emitted a 14,526-file, 30,947,423-byte archive with
SHA-256 `de24e4d...fea32`. The archive contains the 5,065-byte migration as a
checksummed entry, installed outside the candidate checkout, and its installed
adapter opened/closed/reopened a schema-version-1 database with 19 tables. The
acceptance approval object was explicitly local test scaffolding, not a genuine
workflow approval. Production approval, publication, activation, provider
behavior, and device evidence remain separate and pending.

## 2026-09-10 — all-finding aggregation and conversation ordering

Created `fix-1` from the integrated production-host checkpoint, retaining the
committed fixes for Findings 1, 2, 3, and 5. Added the release-local migration
fix for Finding 4 and the WT-01 predecessor fix for Finding 6. Documentation
conflicts were resolved additively so the newer host/task evidence and the
release-migration acceptance remain distinct.

Ordinary predecessor matching now includes `spaceId`; unresolved `queued`,
`blocked`, and `unknown-outcome` states still fence the same conversation.
Independent conversations on one line no longer depend on each other, and
`space.create` retains a line-scoped creation dependency. The exact Node 24.13.0
combined non-live suite passes 762/762 tests across 79 files with no failures or
skips. No provider retry, installation, activation, live send, or device action
occurred.

## 2026-09-11 — fix-1 production integration closure

Recorded the registered `fix-1` checkout at the exact reviewed baseline with a
clean index/worktree and no remote divergence. Retrieved D0-D10 plus the Node
temporary-filesystem/IPC and GitHub matrix references, loaded the requested
Spectrum/iMessage skills, and checked the locked 12.8.0 public declarations.

Replaced startup grant rewriting with atomic fresh bootstrap or read-only durable
validation. Wired the validated context through production, activation, task
launch, routing, preflight, and execution. Added request/fence-local guarded
media, single-owner native retrieval, an owner-only trusted import producer, and
a scoped single-use stream registry with honest restart/cancellation semantics.
Unified production capability reporting and execution preflight around the same
action-aware dependency inventory.

Moved production fixtures to a canonical private short temporary root and added
the fail-fast-disabled Ubuntu/macOS matrix pinned to Node 24.13.0/npm 10.9.2.
The exact local macOS assembled suite passes 788/788 across 82 non-live files
with no failures or skips, including the real offline installer/rollback and
distribution cases. Generated contracts/skill, docs, exact ownership, and the
workspace package dry-run pass. Remote CI, branch-protection enforcement,
production-approved installation/activation, provider behavior, and device
evidence were not authorized or observed.

## 2026-09-11 — new fix-1 repair preparation

User explicitly designated fix-1 as coordinator, assigned thirteen failures and authorized shared preparation plus A-E worktrees. Rechecked clean a3c36b3a04208a022fa7f994f1580b54223dc2c9; primary and historical worktrees remain untouched. Recorded exact maintenance ownership before code edits. Reproduced three shared failures (missing declaration incorrectly implemented, missing import protocol, absent admission revision) with successful compilation and three assertion failures. A test-fixture permission error was corrected before counting the card reproduction.

Implemented shared admission, import, capability and resource/correlation primitives and narrow production bindings. Kept final receiving-loop and feature implementations delegated. Inspected installed public SDK types and retrieved official Markdown pages; narrowed provider has no management/native vote identity API at 12.8.0. Existing card backend seam is generic and no actual authenticated backend configuration was found. These are documented dependencies, not permissions for a second SDK or invented callback protocol.

Shared preparation verification: 28 focused tests, typecheck, generated contracts, 31 root CLI tests, 60 foundation tests, documentation/ownership and skill drift checks passed. Full aggregate initially hit a concurrent-build import race; the serialized rerun passed 800/800 across 84 files with zero skips. Raw logs and hashes are recorded in TEST-EVIDENCE.md.

Committed shared preparation as `513ede497a96bd9c30cc597faee868e201ea3456`, then created five previously unoccupied A-E worktrees/branches at that SHA. Finalized exact-SHA prompts and registration metadata in a separate documentation-only handoff. Primary and historical working trees remain untouched; no agents were launched or branches pushed.

## 2026-09-11 — merged repair lanes A-E and coordinator production verification

Revalidated the registered `fix-1` worktree, fetched origin without changing the
checkout, and confirmed each repair branch was a clean descendant of prepared
base `513ede497a96bd9c30cc597faee868e201ea3456`. Merged A through E with explicit
no-fast-forward commits: `d33593c`, `e760b61`, `3ac6e07`, `2d5e815`, and
`0b2282a`. There were no merge conflicts and no lane-to-lane source overlap.

Connected the common capture processor to both live production ingress and replay,
including trusted incoming reference registration and receipt target correlation.
Connected the scoped poll management/correlation ports and original-owner route,
while leaving them explicitly unavailable when the pinned public provider cannot
supply native management, identity, and ordering. Connected card admission,
durable production session projection, and the authenticated callback adapter;
the real backend remains a deployment-supplied dependency. Rebuilt the generated
skill inventory from explicit capability declarations after preserving D's manual
sections.

Added the automated production-path journey over real temporary SQLite, one provider
owner/stream, the authenticated Unix socket, compiled CLI, durable work claim,
heartbeat, stale-fence rejection and acknowledgment, captured message and attachment
references, generated media import, voice-formatted text, targeted reply, correlated
read evidence, unresolved poll evidence, and restart/no-duplicate behavior. A
test-double backend case uses a session created by the actual production card send.
The regression mutation removing ingress processing failed with `runner timeout`;
restoration passed.

The first aggregate exposed a merged-fixture hang: `security/webhook-auth.test.ts`
still constructed lane A's now-fail-closed webhook ingress without receipt/reference
ports. Supplying inert offline test ports made that fixture pass 2/2 without changing
production behavior. The final source-derived non-live runner selected 90 files and
passed 826/826. No push, archive installation, activation, real Grok/provider action,
or device test occurred.

## 2026-09-12 — optional poll creation with conversational answers

Revalidated the registered `fix-1` checkout at reviewed commit
`8d2a158e161873d3123241c7507d4d8f9d3bc69f`, fetched `origin/fix-1`, and found
zero divergence and a clean starting tree. Inspected the pinned Spectrum 12.8.0
public declarations and provider conversion plus the requested official Photon
poll, message, inbound-pipeline, and recovery documentation.

Added a bounded internal `poll-answer` projection over public `poll_option`
fields and connected it through the shared live/replay capture processor,
authorized durable inbox, pointer-only wake, and existing work claim interface.
Uncorrelated public answers route only to the active authorized conversation;
supplied native identity must resolve to the persisted original poll owner or
remain unresolved. No native identity, ordering, source question, option index,
message reference, second SDK owner, mirrored Grok poll, terminal action, or
automatic text-to-poll decision is invented.

The production acceptance fixture exercises an explicit idempotent poll send,
realistic selection through scripted external boundaries, authenticated claim,
ordinary text response, acknowledgment, duplicate delivery, restart, selection
deltas, duplicate labels, ambiguity, foreign input, denied authority, and the
single owner/listener invariant. During this work the test exposed a nested
SQLite transaction after successful `poll.create`; removing redundant feature-
level transaction assertions left the shared transaction facade's existing
claim/fence checks in force. It also exposed that inactive authority needed to
be rejected before reference registration so invalid input could not stop the
receiver.

No push, deployment, activation, approval change, provider send, live Grok task,
iMessage tap, or device test occurred.

## 2026-09-12 — typing diagnostics and CI history follow-up

Started from the clean registered `fix-1` checkout at
`9daae7b02a30b2e27e55e4f869e026593b012734`, equal to `origin/fix-1`. Kept the
current conversational poll implementation and `HostTypingBinding`. The only
runtime change passes the existing production `report` callback into
`TypingLeases`; `process.ts` already renders those diagnostic codes on stderr.

Extended the real production-composition regression with success and rejected
typing-start variants. Before the constructor change, the new variant failed
because the host callback received no `TYPING_PROVIDER_FAILURE`. After the change,
both variants pass while retaining delayed lookup, independent replies, provider
failure cleanup, ordered shutdown, and restart/no-replay coverage.

Regenerated the branch-sensitive candidate contract under the exact pinned
toolchain. The foundation manifest remained byte-identical, all three schemas
remained unchanged, and the candidate digest advanced to `2d861374...d36c2` over
50 files. Published the 12 exact reviewed commits as atomic namespaced historical
tags, fetched them back, and passed the history-only verifier. Closed the older
draft PR #1 without merging it or deleting its head branch.

The first full ownership run then correctly rejected the previously unrecorded
`packages/photon-features/src/host/typing-binding.ts`. Added only that exact host
helper and its production regression to the integration ownership/inventory; the
verifier then passed without wildcard or history-check changes. Fresh detailed
command results and evidence boundaries are recorded in `TEST-EVIDENCE.md`.
