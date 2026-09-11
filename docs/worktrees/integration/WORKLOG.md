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
