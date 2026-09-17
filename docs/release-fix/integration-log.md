# RFX-00 integration log

RFX_BASE: `b83e3afd7049a991de6daffedf831165890f0901`
Verified pre-commit HEAD: `b83e3afd7049a991de6daffedf831165890f0901`
Commit scope: the three preparation documents only, as requested by the user.
The verification snapshot below predates this documentation commit. Its exact
commit SHA is available from `git log -1 --format=%H -- docs/release-fix/`.
Historical preparation status: all thirteen worktrees were created and verified;
worker ownership was then unresolved. Superseded for this task by the final RFX-00
assignment and the current preflight below. RFX-12 is excluded and is not a dependency.

## Files changed

- `docs/release-fix/parallel-plan.md`
- `docs/release-fix/ownership.md`
- `docs/release-fix/integration-log.md`

## Initial identity evidence

- Primary checkout is registered at the supplied path, on `main`, HEAD RFX_BASE.
- Origin fetch/push URL is `https://github.com/tecxbro/grokbotonimessage.git`.
- Primary staged, unstaged and untracked inventories were empty.
- Primary tracking divergence was ahead 0 / behind 0 against origin/main.
- Live `git ls-remote --heads origin main 'codex/rfx-*'` returned origin/main at
  RFX_BASE and no RFX branches.
- All thirteen target paths and local branches were absent before creation.
- RFX-00 was created from RFX_BASE, registered on its exact branch and initially clean.
- The old foundation worktree was not operated on; its existing registration
  reports HEAD `2f69a458c897091bbb4ea2c3471b86db2cfe30dd` on
  `photon-v3/wt-00-foundation`.

## Tests and evidence

Preparation verification checks repository identities, registrations, branches,
exact HEADs, remote state and file inventories. Product tests are not run because
this task changes only preparation documents and creates worktrees; this provides
no product, provider, deployment or device validation.

## Remaining requests

- Supply the twelve worker prompts or their exact owned-file lists. The current
  message and searches of this task workspace and the primary repository did
  not provide them. Ownership cannot be declared complete or overlap-validated.
- Workers must leave concrete production.ts integration requests with exact
  symbols/call-sites in their own lane notes.
- Await `90_RFX_INTEGRATE.md` before any final integration.

## Pre-commit preparation verification

Checked at 2026-09-17T01:43:22.893718+00:00.

All thirteen registrations, origins, branches, exact base/HEADs and file
inventories passed. All twelve workers are clean. RFX-00 has only the three
untracked preparation documents, with no staged or unstaged tracked changes.
Every RFX branch has no upstream and no corresponding live remote branch; each
is ahead 0 / behind 0 relative to origin/main, whose live SHA remains RFX_BASE.
Primary main remains clean at RFX_BASE. The old foundation registration remains
unchanged; no command operated inside that worktree.

| Exact worktree path | Branch | Verified HEAD | File state |
| --- | --- | --- | --- |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-00-integration` | `codex/rfx-00-integration` | `b83e3afd7049a991de6daffedf831165890f0901` | 3 untracked preparation documents; no staged/unstaged tracked files |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-01-shared-routing` | `codex/rfx-01-shared-routing` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-02-wake-reliability` | `codex/rfx-02-wake-reliability` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-03-multi-conversation` | `codex/rfx-03-multi-conversation` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-04-vm-bootstrap` | `codex/rfx-04-vm-bootstrap` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-05-config-simplify` | `codex/rfx-05-config-simplify` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-06-packaging` | `codex/rfx-06-packaging` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-07-capability-truth` | `codex/rfx-07-capability-truth` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-08-polls` | `codex/rfx-08-polls` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-09-cards` | `codex/rfx-09-cards` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-10-reactions` | `codex/rfx-10-reactions` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-11-lifecycle` | `codex/rfx-11-lifecycle` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |
| `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-12-verification` | `codex/rfx-12-verification` | `b83e3afd7049a991de6daffedf831165890f0901` | clean |

At the preparation snapshot, no commits, merges, cherry-picks, pushes,
deployments, Photon activation, live messages, Grok VM/Mac operations or worker
tasks had been performed. Worktree
creation used `-c core.hooksPath=/dev/null` to avoid running checkout hooks.
The plan and ownership documents remain only in RFX-00, so workers remain exactly
at RFX_BASE; no preparation commit was propagated.

Preparation is incomplete only for exact worker ownership and its overlap check.
The missing prompts must be supplied to complete that requirement.

## Final-wave preflight — 2026-09-17 UTC

The current user assignment authorizes final integration in this worktree on
`codex/rfx-00-integration` from exact base
`b83e3afd7049a991de6daffedf831165890f0901`. Entry integration HEAD is
`ee867210952460113efdf09a1f5ea659079eb36e` (preparation documents only).
The supplied assignment overrides the historical foundation and preparation
locations. It also explicitly restricts integration edits to its exact owned paths.

Fresh audit verified origin, worktree registration, branch, exact HEAD, base
ancestry, staged/unstaged/untracked inventories for all eleven input lanes.
All eleven are clean. Each has an immutable implementation SHA and a following
note-only commit; the note records tests, changed files and integration requests.
The submitted branch SHA, implementation SHA, note path and changed-file inventory
are recorded in `included-commits.json`. Those are pending inputs, not included
or fully reviewed implementations. `includedCommits` is deliberately empty.
Live remote main equals RFX_BASE; no remote `codex/rfx-*` branch was advertised.
RFX-00 has no upstream. No identity mismatch or pending deletion was found.

No lane has been merged. The first lane's new LineBinding requires explicit
`dedicated` and `servingPhone`; the existing authority helper still constructs
`{ accountId, lineId, phone }`. Its shared lookup returns undefined, while native
state and typing code dereference `.phone`. These are source-confirmed incompatible
callers outside the exact RFX-00 list. Changing production.ts alone cannot make
Phase A buildable. Do not merge later lanes past the Core Usability Gate.

### Required ownership decision

An ownership-extension question was sent to the user. It remains pending; elapsed
time is not approval. The restriction comes from the supplied final assignment,
not a skill, the historical AGENTS.md, or an automatic approval rejection.
No restricted source, fixture, schema, or manifest has been edited.

Required Phase A migrations, relative to `packages/photon-features/`:

- `src/host/authority.ts`: explicit shared/dedicated ProviderContext binding;
  normalized v3 authority and truthful conversation resolution.
- `src/adapters/transport/native-state.ts`: validate provider identity/scope without
  dereferencing the optional shared lookup options.
- `src/host/typing-binding.ts`: the same optional-route and full-scope validation.
- `tests/lanes/wt-02/helpers.ts`, `tests/lanes/wt-02/sdk-contract.test.ts`,
  `tests/lanes/wt-02/transport.test.ts`: migrate binding fixtures and optional routes.
- `tests/integration/repair-ingress.test.ts`, `tests/integration/repair-polls.test.ts`,
  `tests/integration/typing-start-lifetime.test.ts`, `tests/e2e/delivery-read.test.ts`,
  `tests/e2e/inbound-events.test.ts`, `tests/e2e/poll-restart.test.ts`,
  `tests/e2e/single-ownership.test.ts`, `tests/security/webhook-auth.test.ts`:
  explicit route-mode fixtures, preserving their authorization assertions.
- `tests/integration/production-host.test.ts`, `tests/integration/poll-answer-journey.test.ts`,
  `tests/integration/repair-cards.test.ts`, `tests/integration/repair-production-journey.test.ts`:
  inject verified fake gateway style instead of inspecting a real executable.
- `tests/lanes/wt-02/inbound.test.ts`: assert durable retry deadlines rather than
  obsolete immediate wakes after restart or the next pump tick.
- `tests/integration/production-capabilities.test.ts`: distinguish notes/evidence
  from execution blockers; preserve behavior assertions.
- `src/host/authority-admin.ts`: RFX-05's explicit unresolved shared-authority guard
  must remain until real route resolution is composed; removal requires this path.
- `scripts/generate-configuration.mjs`, `schemas/host-configuration-v3.json`:
  publish generated v3 schema while retaining v2 support.
- `examples/production-inventory.json`: regenerate the integrated inventory.

The user permits extending existing equivalent assembled tests instead of creating
duplicates. The fixture migrations above are dependencies of historical regressions,
not replacements for the new real-component Core Usability Gate. No equivalence to
that gate has yet been established.

Additional Phase B/shared integration requests, relative to the same package:

- RFX-03: `src/adapters/state/unit-of-work.ts`,
  `src/features/text-messages/targets.ts`, `src/features/text-messages/sdk.ts`,
  `src/features/native/module.ts`, plus exact inbound-resource/work/wake call sites
  still to be enumerated after Phase A. Existing root-only filters prevent complete
  secondary conversation dispatch and work retrieval. This is more than host wiring;
  substantive feature fixes must return to their owning lane as reviewed follow-ups.
- RFX-06/RFX-04: `scripts/package.mjs` must include the Photon CLI bootstrap script
  in the custom archive; this is a packaging-lane follow-up, not currently RFX-00-owned.
- RFX-06: `tests/e2e/install-rollback.test.ts`, `tests/lanes/wt-08/regression.test.ts`,
  `tests/integration/completion-browser.test.mjs`,
  `tests/lanes/wt-08/distribution.test.mjs`: migrate synthetic metadata fixtures to
  explicit supported provenance and complete contract payloads. No fabricated
  evidence may enter a real owner-local artifact.
- RFX-10: `src/runtime/core/outcomes.ts`: preserve the precise safe
  `REACTION_COLD_RECOVERY_UNAVAILABLE` blocker through the public sanitizer.

Repository-level shared gate: `docs/worktrees/integration/candidate-contract.json`
is the explicit assembled-candidate digest target read by `generate-contracts.mjs`.
It is outside the assigned list and must be refreshed only after reviewed changes.
Generated contract schemas may need regeneration if an approved amendment changes
schema output. Never rewrite `docs/worktrees/foundation.json`. Historical ownership
registration is not an RFX acceptance check; do not relabel UNKNOWN_LANE as a pass.

### Provider/dependency findings from submitted handoffs

These are lane-reported findings pending current package/source verification,
not new RFX-00 SDK or provider evidence:

- Poll management: RFX-08 requests direct Advanced iMessage 2.1.0 and its pinned
  gRPC peers, with one host-owned binding. Its authoritative endpoint/token seam
  remains required; do not invent it or construct a second messaging owner.
- Cards: static universal cards can be independent of Apple extension/backend
  setup. Spectrum 12.8.0 does not cold-rebuild miniAppCardSession; retain
  `requires_original_session` unless a separately reviewed public route proves it.
- Reactions: full Photon cloud cold-reaction restoration remains unavailable in
  the reported pinned SDK; retain `REACTION_COLD_RECOVERY_UNAVAILABLE` and preserve
  original reaction/parent identity. Conditional offline-provider tests are not
  cloud support evidence.

### Current evidence and stop boundary

Preflight commands and their exact exit codes are retained under ignored
`.photon-local/rfx-00-preflight/audit.json`. All Git identity/note/ancestry checks
passed; these are not product tests. System Node is v23.11.0, npm 10.9.2; the
repository requires pinned Node 24.13.0 for verification. No dependency files have
changed. No previous lane test counts are claimed as current candidate proof.

No source build, assembled regression, installed-artifact test, packaging command,
provider action, deployment, live message, Grok VM action, push, reset or rebase
has run. No final artifact exists. Required test coverage and deployment handoff
remain pending the ownership decision and successful Phase A/Phase B integration.
The existing RFX-12 registration was observed only in Git inventory; it is neither
merged, required, awaited, modified nor an acceptance dependency.

## Continuation: ownership resolved

The user explicitly approved required cross-lane integration glue, including
reviewed handoff requests and compile/type/routing/resource/runtime-contract
mismatches. The previous pending ownership question is resolved. Existing
uncommitted ledger/log contents are preserved. Continue immutable merges in
Phase A/B order; no RFX-12 dependency. Substantive new feature defects return
to the owning lane. No reset, recreation, deployment or live messaging.
