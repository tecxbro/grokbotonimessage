# Integration handoff

Handoff remains blocked. The application-owned production work is shipped in
this candidate, but four native poll-management operations and cold card/reaction
restoration still require verified public SDK support. No missing implementation
is assigned to Grok Bot.

## Current candidate and evidence states

Repository: `https://github.com/tecxbro/grokbotonimessage.git`.
Assigned registered checkout:
`/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1`.
Branch: `fix-1`; reviewed starting HEAD/baseline:
`55b1821216cefe341e611518e1b125552346a115`. Initial tree clean and remote divergence
0/0; exact pre-edit record is `completion-preflight.json`. The final local commit
is the commit containing these completion records; `git log -1` and the external
artifact provenance identify its exact SHA without a self-referential document.
No push, branch/worktree change or F0 tag movement occurred.

| State | Gate |
| --- | --- |
| Code complete | **No, full requested scope blocked upstream.** Supported application wiring implemented; U-01/U-02/U-03 remain open |
| Production paths verified offline | **Supported journeys verified**, via installed executable → authenticated local interface → real SQLite/resources → actual adapters/SDK → controlled external boundary. Per-operation evidence gaps remain explicit in the 44-row inventory |
| Release artifact verified | Diagnostic npm archive tested; **approved deployment archive pending** actual approval/workflow and release gates |
| Installed/activated on target | **No**; only isolated local test installations |
| Live/device verified | **No**; no live external messages authorized or sent |

## Concrete deployment path

`packages/photon-features/DEPLOYMENT.md` is authoritative. It lists only shipped
commands, owner configuration/profile generation, filesystem/toolchain/target
preflight, selected release validation, lifecycle and rollback. No sudo, systemd,
particular home directory or target Grok gateway login is presumed available.
This release supports one configured route, not multi-conversation deployment.

`grok-photon-host` constructs the single owner, durable state, producer and signed
card backend; `grok-photon-task` binds an existing task/generation to the local
client; `grok-photon` accepts only schema-validated commands. Callback ingress is
separate from the private socket. Owner authority renewal/replacement is a
separate stopped-host, credentialed and audited procedure.

## Grok skill and task binding

The existing wake mechanism is unchanged: configured Grok CLI/gateway receives
only a durable work pointer and selected release skill/launcher path. The task
then uses claim, heartbeat and acknowledgement through the authenticated local
interface. `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET` and
`GROK_PHOTON_CREDENTIAL_FILE` are injected only by the release-pinned launcher.
Gateway acceptance is distinct from task acknowledgement and provider delivery.
The shipped operating skill documents inert incremental stream commands, existing
voice policy, explicit optional poll creation and poll-answer continuation.

## Required owner deployment inputs

- Existing Photon project/account/serving phone/conversation and scoped task grant;
  private project, task and separate owner credential files.
- Existing authenticated Grok executable, agent ID and gateway access on the target;
  the owner chooses a supported supervisor without assuming systemd or sudo.
- For universal update/interaction use: an actual HTTPS domain/TLS reverse proxy
  to the shipped loopback backend and out-of-band verified participant public keys.
- For customized cards: actual Apple team/app/extension identifiers and recipient
  extension installation; static preview is separate from live extension rendering.
- A real approved workflow/commit and matching platform/architecture release,
  then separately authorized installation/activation and device checks.

See `CHANGE-REQUESTS.md` for exact upstream APIs still missing, `ACCEPTANCE.md` for
journeys, `TEST-EVIDENCE.md` for actual commands/results/failures and
`FILES.json.completionFiles` for every changed path. Historical green registration
or mocked tests below are not current feature completion or release approval.

## Historical handoff checkpoints

These are retained as historical evidence only. Their previous startup-only
renewal limitation, in-process-only streaming and systemd-specific instructions
are superseded by the current deployment document and completion architecture.

Status: concrete production path implemented locally; approved release,
installation, activation, and external task evidence pending.

The registered `fix-1` branch retains the immutable reviewed baseline and every
reviewed WT-01
through WT-09 input in `included-commits.json`. The existing lane factories
assemble all 44 public handlers and 12 compiler families. The fresh exact Node
24.13.0/npm 10.9.2 non-live aggregate passes 788/788 across 82 files with no failures or
skips; the live suite remains explicitly excluded. Schema, generated-skill drift,
ownership, docs, and package dry-run checks pass. The operating skill's 44 handler
statuses are independently checked against the assembled public registry.

## fix-1 closure

Startup now atomically bootstraps only a truly fresh binding and otherwise
validates the saved grant without rewriting it. Cancellation, revocation,
expiry, permission narrowing, generations, identities, scope, and existing
resource ownership therefore survive restart. Validation, enable, host startup,
and the release-pinned task launcher reject denied or conflicting authority
before SDK construction, provider sends, or Grok wake. Reauthorization remains
unimplemented and deliberately separate from startup.

The production composition now supplies request/fence-local guarded media,
single-owner native attachment retrieval, owner-only trusted file import, and a
trusted in-process registered-stream producer. Stream consumption is scoped,
reserved once, cancellation-aware, terminal after use, and explicit when its
live source is missing after restart. Capabilities and execution preflight share
one action-aware inventory, including composite media and card prerequisites.

The local macOS component run and 82-file aggregate passed on the pinned runtime.
The committed `Assembled integration (ubuntu-latest)` and `Assembled integration
(macos-latest)` jobs define automatic coverage with `fail-fast: false`, but this
task did not run GitHub Actions or change branch protection. Linux and remote
check enforcement remain external evidence.

## Conversation ordering boundary

Ordinary outbox predecessors are matched by project, account, line, and space.
An unresolved `queued`, `blocked`, or `unknown-outcome` result therefore blocks
later work in its own conversation without stalling an independent conversation
on the same line. `space.create` operations retain a separate line-scoped creation
dependency because no conversation exists yet. This change neither weakens
unknown-outcome handling nor retries an ambiguous provider effect.

## Concrete deployment path

The release now ships three distinct executables:

- `grok-photon-host` validates/enables strict production configuration, verifies
  the selected immutable release and skill hash, acquires `runtime/host.lock`,
  owns one SQLite store and one Spectrum client/stream, recovers before accepting
  work, serves one credentialed 0600 Unix socket, and handles orderly SIGTERM.
- `grok-photon-task` verifies the selected release, current task ID/generation,
  and expiry before injecting `GROK_PHOTON_CONTEXT_ID`,
  `GROK_PHOTON_SOCKET`, and `GROK_PHOTON_CREDENTIAL_FILE` into the existing
  authenticated client.
- `grok-photon` remains the local task client; it is not the service process.

`DEPLOYMENT.md` provides the exact version-2 configuration, owner-only secret
files, release-bound systemd unit, enable/start/readiness/stop/disable commands,
and inactive rollback sequence. Shutdown closes the task socket and provider-
writing work before releasing Spectrum and SQLite ownership. A stale lock or
socket is a refusal, never an invitation to delete or kill an unverified owner.

## Grok skill and task binding

The host invokes the configured existing Grok CLI as
`gbot --gateway send <agent-id> <pointer-only-prompt>`. The fixed prompt contains
only the durable handoff ID, configured task ID/generation, selected release
`SKILL.md`, and exact release-pinned `grok-photon-task work.claim` command. It
contains no iMessage body or credential. Gateway success is wake acceptance, not
durable task acknowledgment; the task must claim, heartbeat, and acknowledge by
handoff ID.

Focused local evidence covers the exact command arguments and proves the
production composition reaches one offline Spectrum `Space.send` exactly once
through authenticated IPC and one owner. This closes the missing repository
loader/launcher seam. It does not prove that a particular external Grok gateway
accepted the command, loaded the skill, or claimed work.

## Release-local migration evidence

The source-confirmed migration packaging mismatch is closed locally. The real
collector produced a full 14,526-file archive from a clean ephemeral candidate;
the SQL file was checksummed into it, installed outside the checkout, and used
by installed code to open/close/reopen a real `DurableSQLiteStore`. Ancestor
fallback is rejected. The acceptance approval was local scaffolding only, so
production archive generation remains pending a clean repository commit and
genuine workflow approval. Inactive repeat install, rollback, and state
preservation still have synthetic fixture evidence only. Activation configuration,
credentials, account/line state, provider lifecycle, and live/device evidence
were not authorized or changed.

## Remaining external evidence

No production-approved archive was produced or installed, no real Spectrum or
Grok credential was configured, and no process was activated. A controlled external
non-message task observation is still required before claiming task binding for
a deployment. Provider acceptance/delivery/read, extension rendering, human
interaction, and physical-device behavior also remain independently unproven.

## fix-1 repair preparation status (2026-09-11)

A new coordinator maintenance assignment begins at a3c36b3a04208a022fa7f994f1580b54223dc2c9. The shared admission revision, authenticated media import, explicit capability evaluation and durable reference/poll correlation primitives are prepared. This is a preparation handoff, not closure of the thirteen failures. Complete worker prompts, exact files and interfaces live under ../fix-1-repair/. The final prepared SHA and actual worker registrations are recorded after the preparation commit; no future SHA is assumed.

Worker A owns incoming references/typing/receipts/pagination; B owns poll state/operations/correlation; C owns cards/sessions/interactions; D owns import CLI/manual operating instructions; E owns CI baseline resolution. The coordinator retains shared production/configuration/protocol/state and final integration tests/inventory. Workers are not launched automatically. Native poll API and actual card backend limitations are described in CHANGE-REQUESTS.md. No push, deployment, activation, credentials or live messaging occurred.

Shared preparation committed as `513ede497a96bd9c30cc597faee868e201ea3456`. Verified A-E worktrees are clean at that exact SHA. Final prompts are saved in the coordinator checkout at ../fix-1-repair/A.md through E.md; each contains the actual base, full instructions, exact owned paths, source links, interfaces, tests and handoff requirements. Documentation finalization follows separately to avoid embedding a fabricated future SHA in the preparation commit.

## A-E integration result (2026-09-11)

All five repair branches are merged into `fix-1` with explicit merge commits and
no conflicts. The coordinator connected live/replay reference and receipt processing,
conditional scoped poll ports, card admission/session/callback wiring, authenticated
media import, pending-work pagination, repaired history verification, and a truthful
generated inventory. The final non-live runner selected 90 files and passed 826/826;
root 31/31 and foundation 64/64 also pass.

This is automated production-path verification, not real Grok verification. The
journey uses real composition, SQLite, capture, routing, work protocol, socket and
CLI, with only the external provider and Grok process scripted. It derives outbound
actions from persisted inbound references and verifies formatting, target reply,
attachment fetch/import/send, receipt correlation, stale fences, acknowledgment,
and restart deduplication. A production card send now creates the durable session
used by the connected callback adapter when an authenticated backend contract is
supplied.

Remaining gates are explicit: poll management and positive vote continuation need
an approved shared-owner provider surface with native IDs and ordering; the real
card backend/extension contract is absent; the remote historical refs required by
CI are not published; package dry-run is not installation; and actual Grok/provider/
device verification is NOT RUN. No push, install, activation, provisioning, or live
message occurred.
