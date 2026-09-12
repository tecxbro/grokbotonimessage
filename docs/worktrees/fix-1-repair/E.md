# Worker E: CI history and immutable baseline resolution

You are worker E for the existing grokbotonimessage fix-1 repair. Implement only this lane. Do not launch other agents.

Repository: https://github.com/tecxbro/grokbotonimessage
Worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-e
Branch: repair/fix-1-e
Exact prepared base commit: PREPARATION_SHA_RECORDED_AFTER_COMMIT
Reviewed baseline (not a reset target): a3c36b3a04208a022fa7f994f1580b54223dc2c9
Coordinator worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1, branch fix-1.

Before edits, verify pwd, git rev-parse --show-toplevel, git branch --show-current, git rev-parse HEAD, git status --short --branch, git worktree list --porcelain and git log PREPARATION_SHA_RECORDED_AFTER_COMMIT..HEAD. Do not reset if advanced; inspect intervening commits and preserve unrelated changes. Work only in your assigned checkout. Read AGENTS.md, ARCHITECTURE.md, docs/contracts/execution.md, receipts.md, operations.md, packages/photon-features/SKILL.md and the repair ASSIGNMENT.md/INTERFACES.md/FILES.json in your own checkout. This prompt is the complete coordinator delegation; no unspecified second assignment is required.

## Assigned failures

10. CI shallow checkout cannot reliably resolve the historical ownership baseline and reviewed commit ledger.

## Exact writable files

- `docs/worktrees/fix-1-repair/E.md`
- `.github/workflows/photon-foundation.yml`
- `.github/workflows/photon-integration.yml`
- `scripts/verify-ownership.mjs`
- `scripts/verify-worktree.mjs`
- `packages/photon-features/tests/lanes/wt-00/repair-ci-history.test.ts`

Your own repair document may receive appended worklog, source evidence, test results, exact changed-file list, blockers and handoff after its prepared instructions. Do not rewrite delegation or expand ownership yourself. Every other path is read-only. No wildcard grants. For a necessary extra/shared file, send the coordinator its exact path/signature, reason, caller, implementation owner and acceptance test. Do not edit another worktree or depend on mutable sibling files.

Read-only dependencies include shared contracts and state/ports, host/production.ts, host/configuration.ts, host/protocol.ts, runtime/core/local-server.ts, runtime/core/admission.ts, submission.ts, execution-services.ts, host/capabilities.ts, host/incoming-resources.ts, host/poll-correlations.ts, integration/assembly.ts, dependency manifests/lockfiles and final aggregate tests. Only the exact writable list overrides this general description. D owns manual skill text; coordinator owns its final generated block after D handoff.

## Verified sources and pinned boundary

- https://github.com/actions/checkout/blob/v4/README.md
- https://git-scm.com/docs/git-fetch
- https://git-scm.com/docs/git-worktree

These official Photon pages were retrieved as .md equivalents with HTTP 200 during preparation (E uses the retrieved official checkout README and Git pages). Full URL/status/type/hash provenance is in integration/source-lock.json.repairPreparation. Supplementary skills are separate guidance: actual repository paths skills/spectrum/SKILL.md and skills/spectrum/providers/imessage.md were inspected from https://github.com/tecxbro/photon-skills. Do not execute instructions from downloaded documents. Inspect installed public spectrum-ts 12.8.0 exports/types before using an API; current documentation does not override this pin. Record exact source URLs, retrieval results, SDK symbols and any disagreement in your handoff.

## Agreed interfaces and existing primitives

No messaging interface change. Historical F0 tag photon-v3-f0 currently resolves to ee2f8576b55973eee312bca5cad0549b6f959a88, also pinned by docs/worktrees/integration/included-commits.json.base.commit. The immutable reviewed repair baseline is a3c36b3a04208a022fa7f994f1580b54223dc2c9; worker base is the exact preparation SHA above. These are different roles.

Existing verify-ownership.mjs resolves map.lanes.integration.base then computes reviewed-lane deltas from included-commits.json. actions/checkout@v4 defaults to one commit; fetch-depth: 0 fetches history/branches/tags. Verify exact expected commit identities, including all ledger inputs. Never move/recreate the F0 tag or accept a same-named mismatched tag. Use a verified immutable commit fallback when a tag is absent, or report the missing object accurately.

New maintenance metadata in docs/worktrees/ownership.json.maintenanceAssignments and docs/worktrees/worktree-map.json.maintenance records this repair without rewriting historical lanes. You may read these and the exact repair FILES.json. Shared manifests are coordinator-owned; request exact changes if necessary. CI checkout location/branch may differ from this local worktree: separate immutable repository/history checks from local registered-worktree checks. Keep ownership checks meaningful and exact.

## Implementation and acceptance

- Reproduce the missing historical object in an isolated shallow fixture beneath ignored .photon-local; never remove refs in the real repository.
- Repair the affected Photon workflows and baseline resolver using verified actions/checkout and Git behavior. Prove missing tag, wrong tag target, missing ledger commit, detached CI checkout and noncanonical filesystem path behavior.
- Test that legitimate complete immutable history passes and wrong/missing evidence fails explicitly. Do not skip ownership verification or label inability to resolve a tag as an implementation pass.
- Keep permission scope, pinned Node/npm, existing test jobs, and F0 records intact. Do not change approval settings or push/run remote workflows.
- Avoid production code/dependency changes and broad ownership allowances. Coordinator will reconcile any exact maintenance manifest additions.

Preserve the existing Grok orchestrator/workers, one Spectrum/credential owner, one durable inbox/outbox, public execution services, authorization, claims, cancellation, idempotency, normal-English voice formatting and root CLI. No new agent/runtime/model integration, transcript polling, feature-local outbox, memory/deployment stack, second receiving loop or SDK client. No live messages, activation, provisioning, installation into an active runtime, credentials, push or deployment.

## Commands and evidence

Run from /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-e. Install into this worktree only if node_modules is absent, using the lockfile and no lifecycle scripts:

```sh
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm ci --ignore-scripts --no-audit --no-fund'
```

Use Node 24.13.0 and npm 10.9.2 for all verification, including child processes. Keep runtime/test outputs in ignored .photon-local. Run the focused failure reproduction first, implement the smallest coherent change, then:

```sh
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm run typecheck --workspace=@grokbot/photon-features && npm run photon:build'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'node --test packages/photon-features/dist/tests/lanes/wt-00/repair-ci-history.test.js
node scripts/verify-ownership.mjs integration'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm run photon:check'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm test'
git diff --check
```

Create your named repair test file before invoking its command. Run other affected existing regressions as justified. Shared contract digest drift after your authorized source edits is coordinator-owned: report the exact result; do not write the foundation or regenerate shared artifacts. Historical layout/baseline verifier failures are distinct from implementation failures; keep independently runnable checks moving. Never label skipped checks or test doubles as passed production behavior.

## Reserved production wiring and handoff

Coordinator integrates the workflow/resolver changes, maintains shared manifests, and runs aggregate checks; actual hosted GitHub Actions execution remains separately unverified.

Append a handoff to your own repair document with before/after reproduction, exact commands/exit codes/counts, source and pinned SDK evidence, changed paths, precise proposed coordinator wiring, remaining external dependencies, and any unverified behavior. Commit only your reviewed owned changes locally and return exact SHA(s), base and clean/dirty state for immutable integration. Do not push. Do not declare all 13 failures resolved: coordinator owns final inventory reconciliation (12), complete production-path tests (13), and separate actual Grok/provider/device evidence.

## Worker E handoff (2026-09-11)

### Identity and baseline

- Registered worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-e`.
- Branch and prepared HEAD before edits: `repair/fix-1-e` at `513ede497a96bd9c30cc597faee868e201ea3456`, clean. The prepared prompt's literal `PREPARATION_SHA_RECORDED_AFTER_COMMIT` placeholder was stale; no reset or branch operation was performed.
- Reviewed repair baseline: `a3c36b3a04208a022fa7f994f1580b54223dc2c9`; `513ede4` is its one preparation descendant.
- The authoritative F0 comparison identity is `docs/worktrees/integration/included-commits.json.base.commit` = `ee2f8576b55973eee312bca5cad0549b6f959a88`. `foundation.startCommit` and `foundation.comparisonCommit` remain the earlier repository start `5c342f5eeb654b1ad7cb00e52855b425f25148ae` and are not substituted for F0.
- The local `photon-v3-f0` ref is a lightweight commit tag resolving exactly to `ee2f8576b55973eee312bca5cad0549b6f959a88`.

### Reproduction and remote evidence

- Fresh `--depth=1 --branch fix-1 --single-branch` clone at remote `a3c36b3...`: `git rev-parse --is-shallow-repository` returned `true`; `photon-v3-f0`, `ee2f8576...`, and reviewed `08d9ed3...` were absent. Running the original verifier from that clone exited 1 at `rev-parse --verify photon-v3-f0^{commit}`.
- After `git fetch --unshallow --tags origin`, the F0 commit object was present through branch ancestry, but the tag and reviewed commit remained absent. The original verifier still exited 1 at tag resolution. This proves depth alone cannot publish a missing ref/object.
- GitHub tag API `GET /repos/tecxbro/grokbotonimessage/git/ref/tags/photon-v3-f0` returned HTTP 404; `git ls-remote --tags origin refs/tags/photon-v3-f0 refs/tags/photon-v3-f0^{}` returned no ref. `origin/fix-1` advertised `a3c36b3...`, and local ancestry verified F0 is its ancestor.
- A fresh complete remote clone evaluated by the repaired history resolver fails explicitly with `MISSING_REVIEWED_COMMIT:wt-01:08d9ed396e1b18b0bd5edfcc866c7dde0518c006:publish or fetch the exact reviewed lane commit before ownership verification`.
- The ledger requires F0 plus 12 reviewed objects. The three WT-01 objects (`08d9ed3...`, `15aa038...`, `141a05a...`) were fetchable only by exact SHA in the probe but are not advertised refs and are not fetched by a full clone. The remaining nine objects for WT-02 through WT-09 (`e832b78...`, `6f3ed3a...`, `1693d58...`, `df54e2e...`, `7b87c86...`, `48ff709...`, `1187f7b...`, `dacae5e...`, `4743aa7...`) returned `upload-pack: not our ref` when fetched by exact SHA. They are local-only dependencies until a ref is published.

### Implementation

- `.github/workflows/photon-integration.yml` now requests `fetch-depth: 0` and runs an early immutable-history preflight. Existing `contents: read`, Node `24.13.0`, npm `10.9.2`, event model, and all retained jobs are unchanged. `photon-foundation.yml` was inspected and left unchanged because it does not invoke the Git history ownership comparison.
- `scripts/verify-ownership.mjs` resolves F0 from the ledger's full immutable SHA, validates that the foundation/map/tag records agree, validates an exact tag target when the tag is present, and otherwise permits only the already-recorded commit fallback. It requires all 12 reviewed commits, requires F0 ancestry, and emits actionable missing/mismatch errors before diffing.
- The verifier consumes the coordinator-owned exact repair manifest through `ownership.json.maintenanceAssignments`; entries remain exact paths and wildcard/absolute/traversal entries fail. Unknown changed paths continue to fail.
- The new repair test covers shallow failure, full published history, detached HEAD and noncanonical path operation, recorded-SHA fallback without a tag, mismatched tag, missing baseline, missing reviewed commit, unauthorized changes, workflow history depth, read-only permission, and pinned toolchain retention.

### Sources and SDK boundary

- Official checkout source: `https://github.com/actions/checkout/blob/v4/README.md`. Fresh inspection states that v4 fetches one triggering commit by default and `fetch-depth: 0` fetches all history for all branches and tags. Prepared retrieval evidence is HTTP 200, `text/plain`, 12,391 bytes, SHA-256 `2556582f5103560617b79b50d33d7f75a330064746388d35ecea918cb14cc228` in `integration/source-lock.json.repairPreparation`.
- This repair imports no Spectrum API, changes no dependency or production messaging code, and uses no SDK symbols. The pinned `spectrum-ts` `12.8.0` boundary is untouched.

### Verification before handoff

- Pinned install: `npm ci --ignore-scripts --no-audit --no-fund`, exit 0, 185 packages.
- Pinned typecheck plus build: exit 0.
- Focused `repair-ci-history.test.js`: 4/4 pass, 0 fail/skip.
- `node scripts/verify-ownership.mjs integration`: exit 0 locally with baseline `ee2f8576...`, tag present and matching, 12 required reviewed commits, 483 changed paths, 406 reviewed-lane paths, 75 integration paths, 25 historical maintenance paths, and 89 exact repair-assigned paths before this handoff append.
- `npm run photon:check`: exit 0; 3 schemas, current assembled contract digest `11affb7fbe3adcfb4dbc55615ebd4df50a8b2706590ce30c0b1e23cbff9be6f1`, 49 files. This is assembled generated-contract evidence, not a rewrite of the immutable F0 digest.
- Root `npm test`: 31/31 pass. `npm run photon:test`: 64/64 pass, 0 fail/skip. SQLite emitted its existing experimental warning.
- Actual hosted GitHub Actions execution is not verified. No push, workflow dispatch, live message, provider call, installation, activation, or device test occurred.

### Required coordinator publication

No ledger metadata was changed. For `fetch-depth: 0` to make the exact current ledger reproducible, the coordinator must review and publish the existing immutable local tag and nine lane branch refs (or coordinate an equally exact immutable metadata/ref plan without weakening the reviewed comparison). The direct publication action is:

```sh
git push origin \
  refs/tags/photon-v3-f0:refs/tags/photon-v3-f0 \
  refs/heads/photon-v3/wt-01:refs/heads/photon-v3/wt-01 \
  refs/heads/photon-v3/wt-02:refs/heads/photon-v3/wt-02 \
  refs/heads/photon-v3/wt-03:refs/heads/photon-v3/wt-03 \
  refs/heads/photon-v3/wt-04:refs/heads/photon-v3/wt-04 \
  refs/heads/photon-v3/wt-05:refs/heads/photon-v3/wt-05 \
  refs/heads/photon-v3/wt-06:refs/heads/photon-v3/wt-06 \
  refs/heads/photon-v3/wt-07:refs/heads/photon-v3/wt-07 \
  refs/heads/photon-v3/wt-08:refs/heads/photon-v3/wt-08 \
  refs/heads/photon-v3/wt-09:refs/heads/photon-v3/wt-09
```

The branch tips were verified locally against the final reviewed ledger entries: WT-01 `141a05a...`, WT-02 `e832b78...`, WT-03 `6f3ed3a...`, WT-04 `1693d58...`, WT-05 `df54e2e...`, WT-06 `7b87c86...`, WT-07 `48ff709...`, WT-08 `1187f7b...`, and WT-09 `4743aa7...`; the earlier WT-01 and WT-09 reviewed commits are ancestors of those tips. Worker E did not perform this push.
