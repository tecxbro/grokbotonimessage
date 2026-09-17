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

## RFX-01 integration checkpoint

Reviewed SHA: `6c76d6537f6bf98a5603be8b6e0791bb5c67e2c9`. Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips.

- `packages/photon-features/src/adapters/transport/native-state.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/src/host/authority.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/src/host/production.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/src/host/typing-binding.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/e2e/delivery-read.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/e2e/inbound-events.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/e2e/poll-restart.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/e2e/single-ownership.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/integration/repair-ingress.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/integration/repair-polls.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/integration/typing-start-lifetime.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/lanes/wt-02/helpers.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/lanes/wt-02/sdk-contract.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/lanes/wt-02/transport.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.
- `packages/photon-features/tests/security/webhook-auth.test.ts` — RFX-01: Adopt explicit shared/dedicated binding and optional shared lookup options; retain exact-scope authorization and migrate dedicated fixtures without dropping assertions. Focused regression: 142 passed, zero failures/skips. Covered by `rfx01-focused` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test packages/photon-features/dist/tests/integration/rfx-shared-routing.test.js packages/photon-features/dist/tests/lanes/wt-02/*.test.js packages/photon-features/dist/tests/integration/repair-ingress.test.js packages/photon-features/dist/tests/integration/typing-start-lifetime.test.js packages/photon-features/dist/tests/integration/repair-production-journey.test.js packages/photon-features/dist/tests/e2e/*.test.js packages/photon-features/dist/tests/security/webhook-auth.test.js`. Exit 0; tested HEAD `94256c972a2cebb52c3fff9fb1f34a4b7249f911` plus listed glue edits. Log: `.photon-local/rfx-00/rfx01-focused.log`.

## RFX-02 integration checkpoint

Reviewed SHA: `59bf129238f0858fdc5644cce895bf71ad94e4c6`. Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task.

- `packages/photon-features/src/cli/local-client.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/src/host/production.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/tests/integration/poll-answer-journey.test.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/tests/integration/production-host.test.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/tests/integration/repair-cards.test.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/tests/integration/repair-production-journey.test.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.
- `packages/photon-features/tests/lanes/wt-02/inbound.test.ts` — RFX-02: Wire the verified gateway style/help injection and actual target ID; adopt durable wake metadata in strict CLI responses and align retry fixtures to persisted deadlines. 97 passed. Durable diagnostic follow-up requested from owning RFX-02 task. Covered by `rfx02-focused-fixed` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/rfx-wake-reliability.test.js packages/photon-features/dist/tests/lanes/wt-02/*.test.js packages/photon-features/dist/tests/integration/production-host.test.js packages/photon-features/dist/tests/integration/poll-answer-journey.test.js packages/photon-features/dist/tests/integration/repair-cards.test.js packages/photon-features/dist/tests/integration/repair-production-journey.test.js`. Exit 0; tested HEAD `d16a3fcfcab8c6a4c7bd0467c77c7f9dd25b397d` plus listed glue edits. Log: `.photon-local/rfx-00/rfx02-focused-fixed.log`.

## RFX-04 integration checkpoint

Reviewed SHA: `7247c799ea325d38ec685a653f9728c7f4ee8a94`. Merge reviewed VM discovery; 45 focused tests passed. Follow-up returned to RFX-04: authenticated CLI reuse currently invokes login unconditionally, and setup must return verified gateway invocation evidence.


Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/tests/integration/rfx-vm-bootstrap.test.mjs packages/photon-features/dist/tests/lanes/wt-08/*.test.js`. Exit 0; tested HEAD `876953e08b9cc35baaffb01241b5536e3e3c4505` plus listed glue edits. Log: `.photon-local/rfx-00/rfx04-focused.log`.

## RFX-05 integration checkpoint

Reviewed SHA: `f07cf5973b9c11a9deccc4a19f87bbe7092b1cea`. Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed.

- `packages/photon-features/scripts/generate-configuration.mjs` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/adapters/transport/provider-context.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/authority-admin.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/authority.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/configuration-inventory.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/configuration.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/process.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/production.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/src/host/task-launcher.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.
- `packages/photon-features/tests/integration/rfx-shared-routing.test.ts` — RFX-05: Adopt normalized v3 configuration and private secret descriptors in host/launcher/authority; preserve activation version and legacy credential boundaries. Optional shared serving metadata stays separate from route identity; native conversation remains required until authenticated resolution. Generated v3 schema is synchronized. 34 tests passed. Covered by `rfx05-wiring-verified` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `node packages/photon-features/scripts/generate-configuration.mjs --profiles && node --test --test-reporter=tap packages/photon-features/tests/integration/completion-configuration.test.mjs packages/photon-features/dist/tests/integration/rfx-shared-routing.test.js packages/photon-features/dist/tests/integration/production-authority.test.js packages/photon-features/dist/tests/integration/production-host.test.js`. Exit 0; tested HEAD `768e31bbbc13498d3294bf2b1351c3e213be3bfb` plus listed glue edits. Log: `.photon-local/rfx-00/rfx05-wiring-verified.log`.

## RFX-02 integration checkpoint

Reviewed SHA: `59bf129238f0858fdc5644cce895bf71ad94e4c6`. Adopt the reviewed allowlisted durable diagnostic in strict CLI handoff response validation. 29 tests passed, including SQLite restart, safe rebind, stale result fencing and production work retrieval.

- `packages/photon-features/src/cli/local-client.ts` — RFX-02: Adopt the reviewed allowlisted durable diagnostic in strict CLI handoff response validation. 29 tests passed, including SQLite restart, safe rebind, stale result fencing and production work retrieval. Covered by `rfx02-diagnostic` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/rfx-wake-reliability.test.js packages/photon-features/dist/tests/integration/repair-production-journey.test.js`. Exit 0; tested HEAD `3a4bbb3726c739ca153baca25e5173e82c3b70b5` plus listed glue edits. Log: `.photon-local/rfx-00/rfx02-diagnostic.log`.

## RFX-11 integration checkpoint

Reviewed SHA: `9aea50ab2de1cd825909a61bf86e6d3b2fe0ffe1`. Resolve process.ts merge by retaining lifecycle ownership-before-validation with normalized v3 loading. Inject verified fake gateway style in lifecycle fixtures. 11 passed. Automatic authority renewal remains a substantive core-transition blocker returned by RFX-11, not a no-op success.

- `packages/photon-features/tests/integration/rfx-lifecycle.test.ts` — RFX-11: Resolve process.ts merge by retaining lifecycle ownership-before-validation with normalized v3 loading. Inject verified fake gateway style in lifecycle fixtures. 11 passed. Automatic authority renewal remains a substantive core-transition blocker returned by RFX-11, not a no-op success. Covered by `rfx11-verified` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/rfx-lifecycle.test.js`. Exit 0; tested HEAD `82611ab38b818e3f62bf221951a256a3ec30bbee` plus listed glue edits. Log: `.photon-local/rfx-00/rfx11-verified.log`.

## RFX-07 integration checkpoint

Reviewed SHA: `0d3a3f7197ccccbd98ac26ab0f8c74ad03ed2503`. Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05.

- `packages/photon-features/src/host/production.ts` — RFX-07: Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05. Covered by `phase-a-core-transaction` below.
- `packages/photon-features/src/runtime/core/executor.ts` — RFX-07: Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05. Covered by `phase-a-core-transaction` below.
- `packages/photon-features/tests/integration/production-capabilities.test.ts` — RFX-07: Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05. Covered by `phase-a-core-transaction` below.
- `packages/photon-features/tests/integration/repair-ingress.test.ts` — RFX-07: Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05. Covered by `phase-a-core-transaction` below.
- `packages/photon-features/tests/integration/rfx-capability-truth.test.ts` — RFX-07: Adopt RFX-07 dependency snapshots and distinguish verification notes from blockers; preserve the executor transaction for authoritative resource checks, avoiding a nested SQLite transaction that falsely blocked valid outbound replies. Align shared production fixtures with RFX-01/RFX-05. Covered by `phase-a-core-transaction` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js packages/photon-features/dist/tests/integration/rfx-capability-truth.test.js packages/photon-features/dist/tests/integration/production-resources.test.js packages/photon-features/dist/tests/integration/production-capabilities.test.js packages/photon-features/dist/tests/integration/repair-ingress.test.js`. Exit 0; tested HEAD `11273678ace112572c68eaada40a1e6ef460676c` plus listed glue edits. Log: `.photon-local/rfx-00/phase-a-core-transaction.log`.

### Phase A Core Usability Gate passed

- Lanes RFX-01/02/04/05/11/07; exact new test file `packages/photon-features/tests/integration/release-fix-shared-roundtrip.test.ts`. Integration requires the real composed inbound-to-reply path: external Photon SDK and Grok process boundaries are controlled; actual normalization, SQLite inbox, batching, handoff, wake eligibility, local claim and outbound execution are production. Both shared routes with displayed serving phone metadata and without it pass. Each asserts one SDK owner/listener, one inbox row, one handoff, one wake, the original event, same-conversation reply and idempotent replay.
- Covering command: `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js packages/photon-features/dist/tests/integration/rfx-capability-truth.test.js packages/photon-features/dist/tests/integration/production-resources.test.js packages/photon-features/dist/tests/integration/production-capabilities.test.js packages/photon-features/dist/tests/integration/repair-ingress.test.js` — 43 passed, 0 failed/skipped. Evidence label `phase-a-core-transaction`. This is local integration evidence, not live delivery/device evidence.
- RFX-07 merge resolution in `packages/photon-features/src/host/configuration-inventory.ts` retained the RFX-05 normalized configuration union alongside the new dependency snapshot; same command covers it.

### Reviewed RFX-04 and RFX-11 follow-ups

Merged RFX-04 `a75a91ea49b3e6a04e712327218eb3683ecb5dd1` (implementation `e15fc7e0d4554c812075837ce988b28feff9c93c`) and RFX-11 `c9ff0d46e379554d8c8e671451674f8c2fe27a71` (implementation `2e388657355b5b0c22842d3c1199f6a67bd3a8bf`), after owners reported clean worktrees. No source conflict resolution was needed. `npm run photon:build && node --test --test-reporter=tap packages/photon-features/tests/integration/rfx-vm-bootstrap.test.mjs packages/photon-features/dist/tests/integration/rfx-lifecycle.test.js packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js` passed 52/52, no skips (`phase-a-owner-followups`, HEAD `7829438051f5b280032a63a0d729e4144d116219`).

RFX-11 identified a substantive unresolved authority renewal limitation: extending the same identity is rejected; successor generation revokes pending original resources/work. Retain the existing expiry and report it. No implicit renewal, old-context reseeding, or no-op success was added. Follow-up characterization proves rejection and state preservation.

## RFX-03 integration checkpoint

Reviewed SHA: `3f223bad52f8e17a22ec4a21c3df348f76bc18dd`. Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes.

- `packages/photon-features/src/adapters/state/unit-of-work.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/features/native/module.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/features/native/spaces.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/features/text-messages/sdk.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/features/text-messages/targets.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/host/capabilities.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/host/incoming-resources.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/host/production.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/host/typing-binding.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/runtime/core/child-journal.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/runtime/core/children.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/runtime/core/work-handoff.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/src/runtime/typing/operations.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.
- `packages/photon-features/tests/integration/release-fix-shared-roundtrip.test.ts` — RFX-03: Adopt exact durable secondary-conversation grants in host resource resolution, inbound route selection and capture/receipt registration, work listing/claims, typing target binding, and text/native returned references. Both child journals and the fenced domain adapter retain task/generation ownership while admitting authorized secondary resources. No same-account wildcard grants or secondary stream scopes. Covered by `rfx03-verified` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js packages/photon-features/dist/tests/integration/rfx-multi-conversation.test.js packages/photon-features/dist/tests/lanes/wt-01/*.test.js packages/photon-features/dist/tests/lanes/wt-02/*.test.js packages/photon-features/dist/tests/lanes/wt-03/*.test.js packages/photon-features/dist/tests/lanes/wt-07/*.test.js packages/photon-features/dist/tests/integration/typing*.test.js packages/photon-features/dist/tests/integration/production-resources.test.js`. Exit 0; tested HEAD `7b82226da6e5508b90d08aeffd3754c2f1735128` plus listed glue edits. Log: `.photon-local/rfx-00/rfx03-verified.log`.

RFX-03 assembled multi-conversation regression is the additional production case in `packages/photon-features/tests/integration/release-fix-shared-roundtrip.test.ts`, alongside `rfx-multi-conversation.test.ts`; no duplicate `release-fix-multi-conversation.test.ts` suite was created. It creates a secondary shared DM through the public native handler, closes/reopens the production composition and SQLite, proves an unknown inbound chat remains durably captured/unresolved with no inbox/handoff grant, rejects a guessed outbound chat, schedules typing on the authorized secondary route, then receives/claims/replies there. One SDK owner per host lifetime. The lane test adds other-principal/task/generation, corrupt-parent, stale/revoked/expired authority and group-limit regressions. Final run: 376 passed, no failures/skips.

## RFX-08 integration checkpoint

Reviewed SHA: `25b58bda4436ea4a592297d31e852eab6566bdc0`. Adopt the reviewed public Advanced iMessage adapter dependency and exact gRPC peer pins in both workspace and standalone lockfiles. The default Spectrum cloud host has no authoritative Advanced endpoint/token export, so management remains explicitly unavailable and no additional client or inbound subscription is instantiated.

- `package-lock.json` — RFX-08: Adopt the reviewed public Advanced iMessage adapter dependency and exact gRPC peer pins in both workspace and standalone lockfiles. The default Spectrum cloud host has no authoritative Advanced endpoint/token export, so management remains explicitly unavailable and no additional client or inbound subscription is instantiated. Covered by `rfx08-focused` below.
- `packages/photon-features/npm-shrinkwrap.json` — RFX-08: Adopt the reviewed public Advanced iMessage adapter dependency and exact gRPC peer pins in both workspace and standalone lockfiles. The default Spectrum cloud host has no authoritative Advanced endpoint/token export, so management remains explicitly unavailable and no additional client or inbound subscription is instantiated. Covered by `rfx08-focused` below.
- `packages/photon-features/package.json` — RFX-08: Adopt the reviewed public Advanced iMessage adapter dependency and exact gRPC peer pins in both workspace and standalone lockfiles. The default Spectrum cloud host has no authoritative Advanced endpoint/token export, so management remains explicitly unavailable and no additional client or inbound subscription is instantiated. Covered by `rfx08-focused` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-05/*.test.js packages/photon-features/dist/tests/integration/rfx-poll-management.test.js packages/photon-features/dist/tests/integration/repair-polls.test.js packages/photon-features/dist/tests/integration/poll-answer-journey.test.js packages/photon-features/dist/tests/e2e/poll-restart.test.js packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js`. Exit 0; tested HEAD `31e3b83ff1772225565a504664a9e673f8261e73` plus listed glue edits. Log: `.photon-local/rfx-00/rfx08-focused.log`.

### RFX-08 dependency decision and provider boundary

On 2026-09-17 UTC, read official [Advanced poll documentation](https://photon.codes/docs/advanced-kits/imessage/polls) and [Spectrum poll documentation](https://photon.codes/docs/spectrum-ts/content/polls), and inspected installed `@photon-ai/advanced-imessage@2.1.0` package exports and `dist/grpc.d.ts`. The public `/grpc` export provides `createClient`, `polls.get/vote/unvote/addOption`, exact GUID/option identifiers, mutation idempotency options, and `close`. Its options require an authoritative address and bearer token (or token refresh callback). Spectrum remains exactly 12.8.0; no SDK upgrade was selected.

Pinned direct runtime dependencies: `@photon-ai/advanced-imessage` 2.1.0, `@grpc/grpc-js` 1.14.4, `nice-grpc` 2.1.17, `nice-grpc-common` 2.0.4. These versions were already compatible locked transitive versions; only direct ownership was added. Exact command `npm install --workspace=@grokbot/photon-features --save-exact --ignore-scripts --no-audit --no-fund @photon-ai/advanced-imessage@2.1.0 @grpc/grpc-js@1.14.4 nice-grpc@2.1.17 nice-grpc-common@2.0.4 && node packages/photon-features/scripts/prepare-npm-lock.mjs` succeeded under pinned Node/npm (`rfx08-dependencies`). No guessed address/token or private Spectrum object is used. The existing default management blocker remains for `poll.get/vote/unvote/addOption`; create and conversational answers remain separately supported. Focused assembled run: 76/76 passed, no skips.

## RFX-09 integration checkpoint

Reviewed SHA: `1823103e4b204790664fa48f1eaa79abbd8660b7`. Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends.

- `packages/photon-features/src/host/capabilities.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/src/host/configuration-inventory.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/src/host/production.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/src/runtime/core/errors.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/src/runtime/core/executor.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/src/runtime/core/outcomes.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/tests/integration/release-fix-shared-roundtrip.test.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.
- `packages/photon-features/tests/integration/repair-cards.test.ts` — RFX-09: Adopt the built-in static template in capability/configuration gates and wire authorized session checkpoint lookup. Add bounded read-only preparation under the actual execution claim before capability evaluation so exact session and admitted revision readiness can be evaluated; preserve allowlisted blockers through sanitization. Align the production callback fixture with normalized backend/enrollment configuration and prove public restoration versus cold loss without replacement sends. Covered by `rfx09-final` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-06/*.test.js packages/photon-features/dist/tests/integration/rfx-card-restart.test.js packages/photon-features/dist/tests/integration/repair-cards.test.js packages/photon-features/dist/tests/integration/rfx-capability-truth.test.js packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js packages/photon-features/dist/tests/lanes/wt-01/*.test.js`. Exit 0; tested HEAD `f583ab5563938e06e4018cc4888ea95a668097ad` plus listed glue edits. Log: `.photon-local/rfx-00/rfx09-final.log`.

RFX-09 final verification: 171 passed, 0 failed/skipped (`rfx09-final`). `repair-cards.test.ts` extends the existing production test to stop/reopen the host against the same SQLite checkpoint and provider double: supported original-session lookup edits once; clearing the double's original lookup returns `requires_original_session` with no send. The shared round-trip suite adds real production `app.send` using `universal-static` with `cards: []` and no backend in both shared metadata modes. RFX-09 adds no SDK upgrade or Advanced card alternative; Spectrum 12.8.0 full provider cold restoration remains limited as the lane documented. The asynchronous preflight is bounded by the executor deadline, does no mutation, and all dispatch/grant/revision checks are revalidated afterward.

## RFX-10 integration checkpoint

Reviewed SHA: `3ed9131b55457c0bfdbfe0e665c96e0212cbd9fa`. Preserve the reviewed cold-reaction recovery blocker through host result sanitization using fixed safe explanations; align assembled regression assertions with that contract and the verified Grok command-style fixture.

- `packages/photon-features/src/runtime/core/errors.ts` — RFX-10: Preserve the reviewed cold-reaction recovery blocker through host result sanitization using fixed safe explanations; align assembled regression assertions with that contract and the verified Grok command-style fixture. Covered by `rfx10-verified` below.
- `packages/photon-features/src/runtime/core/outcomes.ts` — RFX-10: Preserve the reviewed cold-reaction recovery blocker through host result sanitization using fixed safe explanations; align assembled regression assertions with that contract and the verified Grok command-style fixture. Covered by `rfx10-verified` below.
- `packages/photon-features/tests/integration/rfx-reaction-restart.test.ts` — RFX-10: Preserve the reviewed cold-reaction recovery blocker through host result sanitization using fixed safe explanations; align assembled regression assertions with that contract and the verified Grok command-style fixture. Covered by `rfx10-verified` below.

Command (pinned Node 24.13.0 / npm 10.9.2): `npm run photon:build && node --test --test-reporter=tap packages/photon-features/dist/tests/integration/rfx-reaction-restart.test.js packages/photon-features/dist/tests/lanes/wt-03/*.test.js packages/photon-features/dist/tests/integration/release-fix-shared-roundtrip.test.js packages/photon-features/dist/tests/integration/repair-cards.test.js`. Exit 0; tested HEAD `f15dcc48ef0d7d77327006328eb4c9d1b0290c45` plus listed glue edits. Log: `.photon-local/rfx-00/rfx10-verified.log`.
