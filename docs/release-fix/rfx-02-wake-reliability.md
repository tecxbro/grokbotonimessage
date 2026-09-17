# RFX-02 wake reliability

Base: `b83e3afd7049a991de6daffedf831165890f0901`.
Branch: `codex/rfx-02-wake-reliability`.
Registered worktree, origin, exact HEAD, clean index/worktree and 0/0 divergence
from origin/main verified before edits. Remote lane branch does not exist.

## Plan and acceptance

Persist optional wake metadata in handoff JSON. Reserve each notification with
CAS before network I/O, then fence result bookkeeping by revision and attempt.
Keep claim/ack independent: gateway notification is only a pointer; acceptance
is not work acknowledgement. Preserve retry history across claims and restart.
Use bounded exponential delay (2, 4, 8, 16, 32, 60 seconds) and at least 30 seconds
of quiet after acceptance. Discover gateway syntax from non-sending help or use
an explicit binding; never probe by sending. Surface stable unavailable-target
errors without deleting work or choosing a replacement agent.

Acceptance tests cover first send, +1-second suppression, exact retry deadline,
growth/cap, accepted quiet window, claim, ack, expired claim history, SQLite
reopen, unavailable targets, concurrent claims, independent handoffs, competing
dispatchers, stale results and safe command discovery.

## Sources

Retrieved 2026-09-17 UTC, HTTP 200, `text/markdown; charset=utf-8`, matching
page titles and bodies. Copies/headers are under ignored `.photon-local/sources/`.

- https://photon.codes/docs/best-practices/recovery-and-state
  Markdown SHA-256: `65944f4b202e0142388403aff39b3135b3dca7ab87035cdc36af22713716a9f0`.
  Application: keep retry state durable and scope recovery by handoff identity.
- https://photon.codes/docs/spectrum-ts/custom-events-and-lifecycle
  Markdown SHA-256: `f00445888cb5944ff77f259b3e781009977d57367d753d586029705e406980c5`.
  Application: shutdown drains in-flight work; restart must recover from storage.

No Spectrum API changes; repository pins `spectrum-ts` 12.8.0.

## Evidence and integration requests

Local implementation validated; aggregate blockers are recorded below. No live gateway, Photon activation,
provider messages, deployment, push, or Grok VM/Mac access authorized or performed.

## Implemented behavior

- `packages/photon-features/src/state/ports.ts`: optional `HandoffRecord.wake`
  JSON fields, with no schema migration or required field on historical rows.
- `packages/photon-features/src/runtime/inbound/wake-dispatcher.ts`: exported
  `wakeRetryDelayMs` and constants; re-read route, ownership, state and deadline
  inside a synchronous transaction; reserve via revision CAS before I/O. Persist
  the result only while the same revision/attempt/target still owns it. Restart
  reads the same persisted reservation. No in-memory dedupe ledger.
- `packages/photon-features/src/runtime/inbound/pump.ts`: retain the 1-second
  scheduler and forward fixed unavailable-target/style diagnostics only when a
  wake was actually attempted. Notification cadence is independently persisted.
- `packages/photon-features/src/host/grok-wake.ts`: cache one non-sending help
  discovery promise per adapter (including failures), or accept a verified
  explicit command style. Support `--gateway send AGENT PROMPT` and
  `gateway send AGENT PROMPT`; never retry a failed send using another syntax.
  Recognizable missing-agent output raises `GROK_WAKE_TARGET_UNAVAILABLE` without
  exposing stderr. Ordinary nonzero exits are failed; killed/signalled calls are
  unknown (`signal: null` is not an uncertain result).
- `packages/photon-features/tests/integration/rfx-wake-reliability.test.ts`:
  21 tests covering every required acceptance case plus safe syntax discovery,
  CAS races across separate SQLite connections, and stale result fencing.
- `packages/photon-features/tests/lanes/wt-02/integration.test.ts`: replace the
  immediate retry expectation with deadline/quiet-window assertions only.
- This task note records source evidence, validation and integration requests.

`work-handoff.ts` needs no implementation change: successful claim/ack already
increments revision and retains additive JSON properties. `listWork` already
excludes active claims and acknowledged work while returning expired claims.
The new tests exercise the real `DurableWork` and SQLite implementations.

A reservation has `lastStatus: null` until its result is recorded. A process
crash or a superseding claim leaves that reservation durable. Gateway calls
are outside the transaction: an already-reserved pointer may finish after a
claim/ack, but its bookkeeping cannot overwrite that claim/ack. Delivery is
at least once, not exactly once; another dispatcher may retry after an expired
reservation even if an older gateway call has not returned. Consumers must
still claim by durable handoff ID. Backoff is preserved when claims expire.

## Exact integration changes requested

`production.ts` and configuration are outside this lane's ownership and were
not edited. For the integration owner:

1. In `ProductionCompositionDependencies`, add optional explicit injection:

   ```ts
   grokCommandStyle?: GrokCommandStyle;
   grokHelpInspector?: GrokHelpInspector;
   ```

   Import those types from `./grok-wake.js`. At the existing
   `new GrokGatewayTaskHandoff` call, add
   `commandStyle: dependencies.grokCommandStyle` to the binding and pass
   `dependencies.grokHelpInspector` as the third constructor argument, after
   `dependencies.grokRunner`. If no style is supplied, default runtime discovery
   uses only `["--help"]` and then `["--gateway", "--help"]` or
   `["gateway", "--help"]`. Unrecognized/ambiguous help fails closed with
   `GROK_WAKE_COMMAND_STYLE_UNAVAILABLE`; no version-to-syntax guess is made.
   RFX-04 can supply its verified deployment style through this seam.

2. Change the dispatcher construction exactly to:

   ```ts
   const dispatcher = new WakeDispatcher(
     store, { now }, wake, configuration.task.grokAgentId,
   );
   ```

   Constructor argument four is an optional `targetId: string`. Existing
   three-argument callers remain source-compatible and record the logical
   `route.taskId`; production should record the actual gateway agent ID.
   `GrokCommandRunner`'s signature is unchanged. The gateway adapter's optional
   third argument is a `GrokHelpInspector`; `GrokWakeBinding.commandStyle` is
   `"gateway-flag" | "gateway-subcommand"`. Setup-time discovery/rebinding remains
   RFX-04-owned; this lane never selects a replacement agent.

3. In the existing direct adapter fixture in
   `tests/integration/production-host.test.ts`, explicitly bind
   `commandStyle: "gateway-flag"`. Production-composition fixtures in
   `tests/integration/poll-answer-journey.test.ts`, `repair-cards.test.ts`, and
   `repair-production-journey.test.ts` should pass
   `grokCommandStyle: "gateway-flag"` beside their injected `grokRunner` after
   step 1. A fake send runner is not permission to inspect a real installed
   executable. These fixtures must inject help/style as well.

4. Two assertions in unowned `tests/lanes/wt-02/inbound.test.ts` require changes:
   the SQLite restart case must assert zero immediate wakes, then advance to
   persisted `wake.nextAttemptAt` before expecting acceptance; the pump retry
   case must assert one wake after an immediate second tick, advance to the
   deadline, and then assert the second wake. Do not retain immediate retry
   expectations or weaken the new timing assertions.

5. Register RFX-02 in release-wave ownership/docs tooling and refresh the
   assembled-candidate contract digest after integrating reviewed lane changes.
   Do not rewrite the immutable foundation digest. No verifier bypass or
   contract metadata mutation was made here.

## Verification evidence

Toolchain: Node `v24.13.0`, npm `10.9.2`, TypeScript `5.9.3`, Spectrum `12.8.0`.
Dependencies installed locally from the existing lock using
`npm ci --ignore-scripts --no-audit --no-fund`; lockfiles are unchanged.

- `npm run photon:build`: PASS (TypeScript emit/typecheck).
- `node --test --test-reporter=tap
  packages/photon-features/dist/tests/integration/rfx-wake-reliability.test.js
  packages/photon-features/dist/tests/lanes/wt-02/integration.test.js`:
  **28/28 PASS**, zero skipped/cancelled. Log `.photon-local/focused-tests.tap`.
- Spam regression red/green: transpile the original dispatcher from the exact
  base into ignored `dist`, run only the updated shared SQLite handoff case,
  observe failure at +1-second suppression, restore the current compiled
  dispatcher in `finally`, and rerun: **1/1 PASS**. Logs
  `.photon-local/regression-red.tap` and `.photon-local/regression-green.tap`.
  No tracked source was reverted or reset.
- `node scripts/run-integration-tests.mjs`: **871 passed / 6 failed / 877 total**,
  zero skipped/cancelled. Log `.photon-local/integration-tests.tap`. Four failures
  concern the unbound fake-gateway fixtures listed above (style unavailable,
  callback count, or runner timeout); two assert the old immediate-retry
  behavior in `wt-02/inbound.test.ts`. This is **not an aggregate PASS**.
- Baseline comparison: run those six cases with the exact base's dispatcher and
  gateway adapter transpiled into ignored `dist`, then restore current compiled
  files in `finally`. **6/6 PASS** under old behavior. Log
  `.photon-local/legacy-expectations-baseline.tap`. This isolates their required
  integration updates; it does not excuse the failing current aggregate gate.
- `npm run photon:check`: **BLOCKED: CONTRACT_DIGEST_DRIFT** because the owned
  state/host sources participate in the assembled-candidate digest.
- `node scripts/verify-ownership.mjs rfx-02`: **BLOCKED: UNKNOWN_LANE**.
- `node scripts/verify-docs.mjs rfx-02`: **BLOCKED: missing
  docs/worktrees/rfx-02/FILES.json**. Historical verifier registration is outside
  this exact release-fix assignment. The requested single task note is used.
- Manual diff review and exact user-owned-path comparison: only the files listed
  above changed; no staged/unstaged deletions, configuration, `production.ts`,
  migrations, other worktrees, or foundation files changed. `git diff --check`
  is clean.

All delivery evidence is local SQLite and mocked gateway behavior. No installed
Grok syntax or live delivery was tested. No push, deployment, activation, live
message, or VM/Mac operation was performed. This lane is ready for review, with
aggregate integration checks blocked on the explicit requests above.

Implementation commit: `d8c03433f922f243af30e89ea0bd79f074e41b42`.
The final focused rerun passed 28/28 with the source/test content in this commit.
Changed production/test files, sorted by path and hashed as
`path + NUL + bytes + NUL`, SHA-256:
`a0e74a4431f1dcca60c9fb59bb97ce261d83df383f7a0315d3f5adc5e1671873`.
This follow-up changes only this task note to record the immutable implementation
identity; it does not alter the tested code. Integrate both lane commits.

## Integration-returned diagnostic persistence fix

Reviewed starting HEAD: `59bf129238f0858fdc5644cce895bf71ad94e4c6`.
Implementation commit: `1589b7f23bce3b3fad1f7a3946053b3d27937433`.

RFX-00 identified that returned wake diagnostics disappeared on restart because
the handoff only persisted status. This follow-up adds optional
`wake.diagnostic` to the existing JSON record, limited both by its TypeScript
union and a runtime allowlist to `GROK_WAKE_TARGET_UNAVAILABLE` or
`GROK_WAKE_COMMAND_STYLE_UNAVAILABLE`. No raw error text is stored. A completed
result replaces or clears the diagnostic only under the existing revision,
attempt, target and active-route CAS checks. A late failure cannot overwrite
newer acceptance, and late acceptance cannot clear a newer failure.

A same-target retry retains the last completed diagnostic while its new status
is pending, including if that retry crashes. Explicit rebinding retains the
existing retry deadline and attempt count, then clears the old target's
diagnostic when reserving an attempt for the new target. A subsequent accepted
or unclassified result clears the prior diagnostic under the result CAS.
Concurrent work claim/ack wins without result bookkeeping rewriting its row.
There is no second ledger, automatic rebinding, constructor change, provider
call, configuration change, or additional production integration binding.

Files changed by the implementation commit:

- `packages/photon-features/src/state/ports.ts`
- `packages/photon-features/src/runtime/inbound/wake-dispatcher.ts`
- `packages/photon-features/tests/integration/rfx-wake-reliability.test.ts`

Verification used Node `v24.13.0` and npm `10.9.2` in this lane only:

```sh
export PATH=/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin:$PATH
npm run photon:build
node --test --test-reporter=tap --test-name-pattern='^durable diagnostic' packages/photon-features/dist/tests/integration/rfx-wake-reliability.test.js
node --test --test-reporter=tap packages/photon-features/dist/tests/integration/rfx-wake-reliability.test.js packages/photon-features/dist/tests/lanes/wt-02/integration.test.js
git diff --check
```

Before changing the dispatcher, the seven new cases produced 5 expected
missing-diagnostic failures and 2 passing existing claim/ack fencing checks
(`.photon-local/diagnostic-red.tap`). After the fix, build passed and the full
focused invocation passed **35/35**, zero failures, skips or cancellations
(`.photon-local/diagnostic-focused.tap`). This includes both diagnostic codes
across SQLite reopen, pending same-target retry recovery, arbitrary-error
exclusion, old-result races with explicit later rebinding, and concurrent
claim/ack. Manual diff review and whitespace validation passed; no deletions.

The earlier aggregate results above remain historical evidence and were not
rerun or relabeled as passing. RFX-00 owns its ongoing independent integration
checks and candidate digest refresh; this change modifies the owned state
contract again and must be included in that final digest. No RFX-00 files or
other worktrees were edited, and no reset, rebase, push or live operation ran.
This documentation-only commit records the immutable follow-up implementation
SHA; integrate it together with `1589b7f23bce3b3fad1f7a3946053b3d27937433`.
