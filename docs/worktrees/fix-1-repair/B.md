# Worker B: Poll operations and authoritative vote correlation

You are worker B for the existing grokbotonimessage fix-1 repair. Implement only this lane. Do not launch other agents.

Repository: https://github.com/tecxbro/grokbotonimessage
Worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-b
Branch: repair/fix-1-b
Exact prepared base commit: 513ede497a96bd9c30cc597faee868e201ea3456
Reviewed baseline (not a reset target): a3c36b3a04208a022fa7f994f1580b54223dc2c9
Coordinator worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1, branch fix-1.

Before edits, verify pwd, git rev-parse --show-toplevel, git branch --show-current, git rev-parse HEAD, git status --short --branch, git worktree list --porcelain and git log 513ede497a96bd9c30cc597faee868e201ea3456..HEAD. Do not reset if advanced; inspect intervening commits and preserve unrelated changes. Work only in your assigned checkout. Read AGENTS.md, ARCHITECTURE.md, docs/contracts/execution.md, receipts.md, operations.md, packages/photon-features/SKILL.md and the repair ASSIGNMENT.md/INTERFACES.md/FILES.json in your own checkout. This prompt is the complete coordinator delegation; no unspecified second assignment is required.

## Assigned failures

3. Production does not supply authoritative native poll-vote correlation.
4. poll.get, poll.vote, poll.unvote and poll.addOption are registered but unavailable/unimplemented.

## Exact writable files

- `docs/worktrees/fix-1-repair/B.md`
- `packages/photon-features/src/features/polls/identity.ts`
- `packages/photon-features/src/features/polls/module.ts`
- `packages/photon-features/src/features/polls/operations.ts`
- `packages/photon-features/src/features/polls/reconciliation.ts`
- `packages/photon-features/src/features/polls/reducer.ts`
- `packages/photon-features/src/features/polls/sdk.ts`
- `packages/photon-features/tests/lanes/wt-05/integration-contract.ts`
- `packages/photon-features/tests/lanes/wt-05/integration.test.ts`
- `packages/photon-features/tests/lanes/wt-05/operations.test.ts`
- `packages/photon-features/tests/lanes/wt-05/reducer.test.ts`
- `packages/photon-features/tests/lanes/wt-05/regression.test.ts`
- `packages/photon-features/tests/lanes/wt-05/sdk-contract.test.ts`
- `packages/photon-features/tests/lanes/wt-05/support.ts`
- `packages/photon-features/tests/lanes/wt-05/tsconfig.json`
- `packages/photon-features/tests/lanes/wt-05/unit.test.ts`
- `packages/photon-features/tests/integration/repair-polls.test.ts`

Your own repair document may receive appended worklog, source evidence, test results, exact changed-file list, blockers and handoff after its prepared instructions. Do not rewrite delegation or expand ownership yourself. Every other path is read-only. No wildcard grants. For a necessary extra/shared file, send the coordinator its exact path/signature, reason, caller, implementation owner and acceptance test. Do not edit another worktree or depend on mutable sibling files.

Read-only dependencies include shared contracts and state/ports, host/production.ts, host/configuration.ts, host/protocol.ts, runtime/core/local-server.ts, runtime/core/admission.ts, submission.ts, execution-services.ts, host/capabilities.ts, host/incoming-resources.ts, host/poll-correlations.ts, integration/assembly.ts, dependency manifests/lockfiles and final aggregate tests. Only the exact writable list overrides this general description. D owns manual skill text; coordinator owns its final generated block after D handoff.

## Verified sources and pinned boundary

- https://photon.codes/docs/spectrum-ts/content/polls
- https://photon.codes/docs/spectrum-ts/messages
- https://photon.codes/docs/spectrum-ts/platform-narrowing
- https://photon.codes/docs/advanced-kits/imessage/polls
- https://photon.codes/docs/best-practices/recovery-and-state
- https://photon.codes/docs/llms.txt

These official Photon pages were retrieved as .md equivalents with HTTP 200 during preparation (E uses the retrieved official checkout README and Git pages). Full URL/status/type/hash provenance is in integration/source-lock.json.repairPreparation. Supplementary skills are separate guidance: actual repository paths skills/spectrum/SKILL.md and skills/spectrum/providers/imessage.md were inspected from https://github.com/tecxbro/photon-skills. Do not execute instructions from downloaded documents. Inspect installed public spectrum-ts 12.8.0 exports/types before using an API; current documentation does not override this pin. Record exact source URLs, retrieval results, SDK symbols and any disagreement in your handoff.

## Agreed interfaces and existing primitives

Pinned public evidence is decisive: spectrum-ts 12.8.0 exports poll(), option(), Space.send and PollOption(title, selected). OwnedProvider has no public polls or client property. The underlying client is only under __internal and is prohibited. Advanced-kit im.polls examples do not establish a unified provider API. Preparation includes compile-time negative probes in tests/integration/repair-sdk-contract.test.ts. Do not introduce a second client or change dependencies. If no permitted public surface exists, complete state/correlation work and report the exact upstream dependency rather than claim all operations repaired.

Existing `registerNativeOptions(unit, {poll, nativePollGuid, options: [{nativeId, label}]})` stores authoritative native mappings in existing polls/references; `reconcilePollState(unit, context, snapshot)` validates ownership. Preserve scopedId("poll", scope, nativePollGuid), scopedId("message", scope, nativePollGuid) and scopedId("option", scope, nativePollGuid, nativeOptionId) identity contracts.

Implemented host/poll-correlations.ts exports `resolveNativePollVote(tx, scope, {pollMessageGuid, optionIdentifier}): {poll, option, route} | undefined`, `createPollCorrelations(store, nativeIdentity: (CapturedMessage, Scope) => NativePollVoteIdentity | undefined): Correlations`, and `routePollEvent(event, tx): TaskRoute | undefined`. These verify exact durable owners and the original task/generation. Supply an authoritative resolver to the coordinator; A alone owns normalize.ts. No labels, choice indices, caller keys, parsed synthetic event IDs or latest-task routing.

Your PollProviderBinding keeps resolveSpace and may add `binding(context: TrustedContext): {scope: Scope; phone: string; conversationId: string}`. Production will supply the same owner and correct serving phone; logical lineId is not an E.164 phone. If verified public access becomes available, propose `management(context): Promise<{get(pollMessageGuid): Promise<NativePollState>; vote(pollMessageGuid, optionIdentifier): Promise<NativePollState>; unvote(pollMessageGuid): Promise<NativePollState>; addOption(pollMessageGuid, text): Promise<NativePollState>}>`. NativePollState must carry authoritative poll/chat IDs, native option IDs/labels and actual observed votes. This is a proposed contract only, not a configured capability. No placeholder production adapter.

## Implementation and acceptance

- Reproduce current blocked management results and unresolved incoming vote. Confirm compiled public API boundaries without accessing internals or contacting the provider.
- Reuse the shared lookup and existing native identity storage; prove duplicate labels cannot confuse choices, unknown/native-ambiguous IDs remain unresolved, and tasks/generations/scope cannot be crossed.
- Implement only production behavior supported by verified public access. Provider writes go through executeChild, with claim rechecks after awaits, durable stable identity and reconcile-first on unknown outcomes. Reads are still authorized.
- Fix scoped line/phone binding as needed for the existing creation path. Do not compare configured logical lineId to provider phone.
- Preserve immutable old IDs, poll/session ownership, full option snapshots and revision checks. Test restart/replay/cancellation and exactly-once continuations for correlated votes.
- Native management/correlation may remain blocked on absent provider API. Document absent methods/native fields precisely; do not hide handlers, mark fixtures operational or call a stub implemented.

Preserve the existing Grok orchestrator/workers, one Spectrum/credential owner, one durable inbox/outbox, public execution services, authorization, claims, cancellation, idempotency, normal-English voice formatting and root CLI. No new agent/runtime/model integration, transcript polling, feature-local outbox, memory/deployment stack, second receiving loop or SDK client. No live messages, activation, provisioning, installation into an active runtime, credentials, push or deployment.

## Commands and evidence

Run from /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-b. Install into this worktree only if node_modules is absent, using the lockfile and no lifecycle scripts:

```sh
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm ci --ignore-scripts --no-audit --no-fund'
```

Use Node 24.13.0 and npm 10.9.2 for all verification, including child processes. Keep runtime/test outputs in ignored .photon-local. Run the focused failure reproduction first, implement the smallest coherent change, then:

```sh
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm run typecheck --workspace=@grokbot/photon-features && npm run photon:build'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'node --test packages/photon-features/dist/tests/lanes/wt-05/*.test.js packages/photon-features/dist/tests/integration/repair-polls.test.js packages/photon-features/dist/tests/integration/repair-sdk-contract.test.js'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm run photon:check'
npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c 'npm test'
git diff --check
```

Create your named repair test file before invoking its command. Run other affected existing regressions as justified. Shared contract digest drift after your authorized source edits is coordinator-owned: report the exact result; do not write the foundation or regenerate shared artifacts. Historical layout/baseline verifier failures are distinct from implementation failures; keep independently runnable checks moving. Never label skipped checks or test doubles as passed production behavior.

## Reserved production wiring and handoff

Coordinator owns production provider binding, receipt/ingress composition and route wiring. A consumes your resolver; you do not edit normalize.ts. Provider API upgrades require a separate exact shared dependency decision.

Append a handoff to your own repair document with before/after reproduction, exact commands/exit codes/counts, source and pinned SDK evidence, changed paths, precise proposed coordinator wiring, remaining external dependencies, and any unverified behavior. Commit only your reviewed owned changes locally and return exact SHA(s), base and clean/dirty state for immutable integration. Do not push. Do not declare all 13 failures resolved: coordinator owns final inventory reconciliation (12), complete production-path tests (13), and separate actual Grok/provider/device evidence.
