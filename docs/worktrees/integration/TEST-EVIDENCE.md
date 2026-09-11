# Integration test evidence

## Baseline checkpoint

- Worktree registration: PASS at the exact requested path.
- Branch: `photon-v3/integration`.
- Starting HEAD/F0: `ee2f8576b55973eee312bca5cad0549b6f959a88`.
- Initial status: clean; no staged, unstaged, untracked, or relocation-only files.
- Origin: `https://github.com/tecxbro/grokbotonimessage.git`.
- Remote main: `5c342f5eeb654b1ad7cb00e52855b425f25148ae`, matching local `origin/main` at inspection.
- Remote integration branch/F0 tag: not advertised at inspection.
- Lane commit ancestry/path review: PASS; all selected commits descend directly from F0 and lane deltas do not overlap one another.

## Working-path checkpoint

Runtime: bundled Node 24.19.0 and npm 10.9.2. Dependencies were installed with
`npm ci --ignore-scripts --no-audit --no-fund`; tracked files were unchanged.

- `npm run photon:build`: PASS.
- `node --test packages/photon-features/dist/tests/e2e/feature-runtime.test.js`:
  PASS, 1/1, no skips. The offline Spectrum send is invoked once and only once.
- Focused compiled WT-01/02/03 lane suites: PASS, 80/80, no skips.
- Focused compiled WT-01/02/03/08 lane suites: 90/91 PASS, no skips. The sole
  failure is WT-08 `PINNED_NODE_REQUIRED`: the synthetic installed artifact pins
  exact Node 24.13.0 while the candidate runs package-supported Node 24.19.0.

The passing round trip is candidate-local/offline evidence: CLI input,
authenticated socket, durable persistence/claim, public F0 execution, public text
handler, and offline Spectrum SDK acceptance. It does not prove installation,
activation, remote provider acceptance, delivery, read, rendering, or device behavior.

## Assembled WT-09 checkpoint

- Build and text roundtrip after each of WT-04, WT-05, WT-06, and WT-07: PASS.
- First complete-lane WT-09 run on Node 24.19.0: 72/76 pass, 3 fail, 1 authorized-live skip.
  Durable receipt recording and private SQLite file modes already passed.
- Pinned runtime check: `npx --yes -p node@24.13.0 node --version` returned
  `v24.13.0`; WT-08's exact tested-artifact toolchain was preserved.
- Focused local-roundtrip, poll composition, installer, and affected WT-02/WT-05
  regressions under Node 24.13.0: PASS, 49/49, no skips.
- Exact WT-09 11-file assembled suite under Node 24.13.0: PASS, 75 passed,
  0 failed, 1 skipped. The skip is the off-by-default authorized live test and is
  not counted as live evidence.

The three closed candidate failures were the legacy executor in WT-09's text
test, duplicate/stale-fenced poll continuation composition, and running an exact
Node 24.13 artifact fixture with a different Node runtime. No assertions were
weakened: text now requires SDK-return acceptance, the poll path requires exactly
one validated durable handoff, and the installer still enforces the pinned runtime.

## Complete surface checkpoint

- Actual WT-02 through WT-07 factories assemble exactly 44 public handlers with
  no missing or duplicate owner, plus all 12 shared compiler families including
  integration's public-SDK poll compiler: PASS, 2/2 assembly tests.
- `npm run photon:test:integration` under Node 24.13.0: PASS, 77 test files,
  757 tests, 0 failed, 0 skipped. The live directory is excluded explicitly
  because no live authorization was granted; it is not silently counted as PASS.
- The public WT-07 adapter reuses its injected scoped provider and sends native
  effects only through `ExecutionServices.executeChild`; construction remains inert.
- The generated operating skill derives all 44 handler implementation rows from
  the same inert actual-factory assembly. The independent acceptance test parses
  `SKILL.md` and compares every operation owner/status to that handler map. A
  red/green check confirmed that changing `text.send` back to `unimplemented`
  fails with the expected assembled-vs-manual mismatch.
- Focused build, 7 assembly/WT-08 contract tests, and generated-skill drift check:
  PASS under exact Node 24.13.0. The drift check validated 44 operations, 44
  operation examples, four assigned examples, and 48 files.

This checkpoint does not prove installation or activation, and it does not prove
provider delivery/read, extension rendering, human interaction, or device behavior.

## Instruction-role separation checkpoint

- Manual repository inspection confirmed the assembled release has an
  authenticated client CLI and host composition APIs, but no release-owned host
  executable or approved supervisor start/stop command. The current deployment
  runbook records an explicit startup stop gate instead of inventing one.
- `node scripts/verify-ownership.mjs integration`: PASS, 439 changed paths
  checked, including five exact cross-lane maintenance paths and no wildcard
  ownership grant.
- `node scripts/verify-docs.mjs integration`: PASS. The verifier requires the
  historical checkpoint notices, sole current deployment document, explicit
  startup blocker, and real-incoming-request/originating-conversation boundary.
- `node packages/photon-features/scripts/generate-skill.mjs --check`: PASS, 44
  operations, 44 operation examples, four assigned examples, and 48 files.
- Exact Node 24.13.0 build plus focused WT-08 regression: PASS, 3/3, no failures
  or skips. The release-support assertion requires `DEPLOYMENT.md`.
- Exact Node 24.13.0 `node scripts/verify-all.mjs`: PASS. Existing CLI 31/31,
  foundation 60/60, schema drift, assembled integration 756/756, generated skill,
  ownership, docs, and npm package dry-run gates completed without failure.

No final release archive was produced, so inclusion of the current deployment
runbook in a real `.gpf.gz` remains gated by clean-candidate workflow approval.
No installation, activation, provider call, message, or device action occurred.

## Grok skill and launcher binding audit

- Production-source search for `SKILL.md` and the three `GROK_PHOTON_*` names
  found only `packages/photon-features/src/cli/main.ts` reading
  `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET`, and
  `GROK_PHOTON_CREDENTIAL_FILE`. No production loader or injector was found.
- A repository search excluding dependencies and compiled output found no
  `launchd` plist or service-unit file for skill loading or task launch.
- Installer inspection confirms that it extracts and verifies release files but
  does not modify an existing Grok policy or configure the orchestrator.
- `node scripts/verify-docs.mjs integration`: PASS after adding required markers
  for the `UNBOUND` deployment handoff, all three environment dependencies, and
  controlled non-message task-level evidence.
- `node scripts/verify-ownership.mjs integration`: PASS, 439 changed paths
  checked with five exact cross-lane maintenance paths.

This is negative repository evidence, not proof about an uninspected external
Grok deployment. The actual loader/injector remains unknown, and no skill-load,
task launch, installation, activation, provider, message, or device action was
performed.

## Concrete production-path checkpoint

- Exact Node 24.13.0 TypeScript build: PASS.
- Focused production host/lifecycle plus inherited local-server tests: PASS,
  5/5. Evidence covers strict configuration, selected release/skill verification,
  exclusive host ownership, one SDK construction/stream/stop, authenticated IPC,
  one offline Spectrum send, and pointer-only Grok gateway arguments.
- WT-08 distribution plus real offline installer fixtures: PASS, 9/9. Required
  host/task binaries and deployment manual are present; inactive install,
  rollback, unknown-outcome preservation, and tamper refusal still pass.
- Offline smoke: PASS with `activated:false` and `liveVerified:false`.
- `node scripts/verify-ownership.mjs integration`: PASS, 452 changed paths, 48
  integration paths, and 12 exact maintained cross-lane paths.
- `node scripts/verify-docs.mjs integration`: PASS with concrete lifecycle and
  release-pinned Grok binding markers.
- Generated skill check: PASS, 44 operations, 44 operation examples, four
  assigned examples, and 48 files.
- `npm run photon:test:integration` under exact Node 24.13.0/npm 10.9.2: PASS,
  79 non-live files, 759/759 tests, 0 failed, 0 skipped. The live suite is
  excluded by the explicit authorization boundary.
- Exact Node/npm `node scripts/verify-all.mjs`: PASS. Existing CLI 31/31,
  foundation 60/60, candidate schema digest, assembled 759/759, skill,
  ownership, docs, and npm package dry-run all passed. The dry-run inventories
  335 files including `dist/src/host/process.js` and
  `dist/src/host/task-launcher.js`.

These are source/local/synthetic facts. No approved release archive was built,
installed, or activated, and no external Grok gateway/task, Spectrum provider,
delivery/read state, rendering, interaction, or device behavior was exercised.
## Release-local migration checkpoint

- Exact runtime: Node 24.13.0, npm 10.9.2.
- `npm run photon:build`: PASS.
- `npm run typecheck --workspace=@grokbot/photon-features`: PASS.
- `node --test packages/photon-features/tests/lanes/wt-08/distribution.test.mjs`:
  PASS, 8/8, no skips. The new case archives the real compiled runtime and Zod
  dependency, installs outside the checkout, opens/closes/reopens a real
  `DurableSQLiteStore`, and rejects an unrelated ancestor migration.
- Red/green check: removing `src/state/migrations` from the payload-directory
  declaration makes this suite fail 7/8 at the new archive-migration assertion;
  restoring the fix returns it to 8/8.
- `node --test packages/photon-features/dist/tests/e2e/install-rollback.test.js`:
  PASS, 2/2, no skips.

This is local installed-release evidence, not production workflow approval,
publication, activation, provider acceptance/delivery/read, or device evidence.

### Full collector acceptance

The working diff was applied to a clean ephemeral `photon-v3/integration`
candidate and committed there as `6965908c42a32b3ec6b0a6c28e0f9e0aaaa709b3`.
The approval document was local test scaffolding, not a real workflow approval.

- `packageCandidate`: PASS; it ran `npm test`, `npm run photon:test`,
  `npm run photon:check`, `npm run photon:test:integration`, and
  `node scripts/generate-skill.mjs --check` with exit code 0.
- Archive SHA-256:
  `de24e4d8963bd1db9b8fd3938301b5c3b3dd672fa15dc77e28ed56eabd0fea32`;
  14,526 files; 30,947,423 bytes.
- Migration entry: `src/state/migrations/0001-initial.sql`; 5,065 bytes;
  SHA-256 `411a94bceefd47757ce47c4ab84d0d0961f9766d6623d0700ec063256921ba6a`.
- Real installer outside the candidate checkout: PASS; activation remained
  `disabled`.
- Installed `DurableSQLiteStore` open, close, reopen: PASS; schema version 1,
  19 tables, including `inbox` and `outbox`; database mode `0600`.

The ephemeral archive and installation were acceptance artifacts only. This
does not replace the required production workflow approval bound to the eventual
repository commit.

## Fix 1 combined checkpoint

- Exact runtime: Node 24.13.0, npm 10.9.2.
- `npm run photon:test:integration`: PASS, 79 non-live files, 762/762 tests,
  0 failed, 0 skipped. The live suite remains excluded by its explicit
  authorization boundary.
- Root CLI tests: PASS, 31/31. Foundation tests: PASS, 60/60.
- Contract drift: PASS against candidate digest
  `555bff78061ce6187272eee5a19c0de5785ca3e045fac8db0278da4008e1c7a3`.
- Generated-skill drift: PASS, 44 operations, 44 examples, four assigned
  examples, and 48 files.
- Integration ownership: PASS, 453 changed paths checked, 406 reviewed-lane
  paths, 50 integration paths, and 12 exact maintenance paths.
- Integration docs: PASS. Package dry-run: PASS, 335 files including every
  required host/task/CLI/assembly entry and `src/state/migrations/0001-initial.sql`.
- The WT-01 predecessor matrix covers `queued`, `blocked`, `unknown-outcome`,
  and `provider-accepted` across same and different conversations on one line.
  It also proves the separate line-scoped `space.create` dependency.
- No uncertain request was retried and no unknown outcome was relabeled.

## fix-1 production integration closure

Repository identity was recorded before edits: origin
`https://github.com/tecxbro/grokbotonimessage.git`, registered worktree
`/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1`, branch
`fix-1`, clean HEAD `47ecdbda209fcbc2253bc8f0ebaa5752abd7ecba`, exactly
the reviewed baseline and then equal to `origin/fix-1`. There were no staged,
unstaged, or untracked paths. The implementation commits are `8606e3b`,
`7f3b7d5`, and `c09fc04`; final evidence reconciliation, CI docs/ownership
gates, and one production-composition capability assertion are the only later
delta at this checkpoint.

Test platform: macOS Darwin 27.0.0 arm64, Node 24.13.0, npm 10.9.2, and the
locked `spectrum-ts` 12.8.0. Dependencies were reinstalled with
`npm ci --ignore-scripts --no-audit --no-fund` (185 packages). The baseline was
inspected without switching or resetting it: `production.ts` contained
`seedAuthority`, `unavailableMedia`, and `unavailableStreams`. Running the new
tests against the old tree was not attempted because changing checkout identity
was prohibited. After the patch:

- `npm run typecheck --workspace=@grokbot/photon-features`: PASS.
- `npm test`: PASS, 31/31, 0 failed, 0 skipped.
- `npm run photon:test`: PASS, 60/60, 0 failed, 0 skipped.
- `npm run photon:check`: PASS after regenerating the candidate contract from
  the intentional four-file contract delta; digest
  `fe5a2d64f353de00f7fa5d7d4d344c71bf24954ca0fca00f5fa7a004bea36540`,
  47 files. The first pre-regeneration check correctly reported
  `CONTRACT_DIGEST_DRIFT`; it was not relabeled as a pass.
- Focused compiled production authority/capability/resource/host/lifecycle
  command: PASS, 29/29 before the final production capability assertion. Named
  regressions cover fresh/restart authority, cancellation/revocation/expiry,
  narrowing/generations/new-context/partial state, zero SDK/Grok work on denial,
  launcher denial, native fetch-to-send, generated import-to-voice, composite
  media, stream reservation/replay/restart loss, derived/runtime/deadline
  cancellation, invalid/failed/oversize sources, mutable revocation, exactly-one
  owner/send, and reconcile-first unknown outcomes.
- `npm run photon:test:integration`: PASS, 788 tests across 82 files (all non-live),
  0 failed, 0 cancelled, 0 skipped. The runner explicitly excludes the live
  suite because this task authorized no credentials, provider/Grok action, or
  message. This local result does not prove installation or live behavior.
- `node packages/photon-features/scripts/generate-skill.mjs --check`: PASS,
  44 operations, 44 examples, four assigned examples, 48 files, drift check true.
- `node scripts/verify-docs.mjs integration`: PASS after evidence reconciliation.
- `node scripts/verify-ownership.mjs integration`: PASS with exact maintained
  paths; no sibling wildcard was added.
- `npm pack --workspace=@grokbot/photon-features --dry-run --json
  --ignore-scripts`: PASS. This inventories the package only and is not an
  installed-archive test.

The assembled 788-test run separately includes the real offline archive
installer/rollback and distribution cases: an explicit archive fixture performs
clean/repeat inactive installation and rollback with queued/unknown preservation;
installed checksummed code opens/reopens SQLite outside the checkout; traversal,
tamper, owner-lock, active-config, socket, unsafe downgrade, and dirty-candidate
boundaries remain enforced. This is synthetic/local installed-archive evidence,
not a new production-approved `.gpf.gz`, publication, or activation.

The committed matrix defines `Assembled integration (ubuntu-latest)` and
`Assembled integration (macos-latest)` with `fail-fast: false` and the exact
runtime/component commands. Only the macOS local run exists here. No GitHub
workflow execution, Linux result, required-check rule, or branch-protection
configuration was inspected or changed.

Untested/external: deployment code still must attach approved generated-file and
live-stream producers to the trusted in-process APIs; no such external producer
was configured. There was no real release approval, installation, activation,
Spectrum/Grok credential, provider acceptance/delivery/read, progressive stream,
extension rendering, interaction, or physical-device observation.

## fix-1 repair preparation evidence (2026-09-11)

Tested reviewed base: `a3c36b3a04208a022fa7f994f1580b54223dc2c9`, branch `fix-1`, registered coordinator worktree. Initial status was clean and matched origin/fix-1. Fresh tests cover dirty preparation source before its commit; its sorted changed TypeScript/MJS path+NUL+bytes+NUL SHA-256 is `8b69230aae9f45a2b483a673fc5bc93823714ba240b670f7311b363d931f1397`. The preparation commit is recorded after it exists.

Toolchain wrapper for commands below: `npx --yes --package=node@24.13.0 --package=npm@10.9.2 -c '<command>'`; verified Node v24.13.0 and npm 10.9.2. Installed spectrum-ts is 12.8.0. No credentials or live provider were used. Runtime artifacts stayed under ignored `.photon-local/repair-preparation/`.

Commands:

```sh
npm run photon:build
node --test packages/photon-features/dist/tests/integration/repair-preparation.test.js
node --test packages/photon-features/dist/tests/integration/repair-*.test.js packages/photon-features/dist/tests/integration/production-capabilities.test.js packages/photon-features/dist/tests/integration/production-resources.test.js
npm run typecheck --workspace=@grokbot/photon-features
node scripts/generate-contracts.mjs
npm run photon:check
npm test
npm run photon:test
npm run photon:test:integration
node scripts/verify-docs.mjs integration
node scripts/verify-ownership.mjs integration
node packages/photon-features/scripts/generate-skill.mjs --check
git diff --check
```

The initial card fixture lacked app.update permission and was corrected before counting the reproduction. The final before.log shows three intended assertion failures: implementation defaulted to implemented; import schema rejected the new command; admitted revision was undefined. Shared fixes changed those three to passes. Extra regressions cover reference authorization/collision rollback, original poll owner/ID correlation, immutable/reopened admission metadata, cancellation, unresolved/expired card admission, missing import port, and an actual private socket delegating to the existing importer.

The first aggregate overlapped a foundation build and failed while importing a partially rewritten dist module (`bufferStream` export unavailable). No production code was changed for that test-invocation race. The serialized full rerun passed 800 tests across 84 files with no failures/skips. The live suite was explicitly excluded, not passed. Installation/rollback cases use isolated fixture archives and are not production installation or activation. SDK sends and Grok runner acceptance in offline tests remain test-double evidence.

| Log | Exit | Result | SHA-256 |
| --- | --- | --- | --- |
| `before.log` | 1 | 3 assertions failed on reviewed source after successful build | `d5423c5ac3b6e16496c0557812ea5d5f5126a0c545f4fe67ff9d48b95e13c17a` |
| `focused.log` | 0 | 28 passed; zero failures/skips | `42bb92519476939e66aec2d6d7ac855ec16c9c667eaa39629d5d57ad92467044` |
| `typecheck.log` | 0 | typecheck passed | `723e7a84e82d01d0d3fe2a3f3e75e477b7d08e33dbc04ee431d8d7186b8a878e` |
| `contracts.log` | 0 | build, generated candidate update and photon:check passed; 3 schemas / 49 digest files | `df715cbf918bc7887ca28c634b9828b095d431260c6fb0ad21df4bbe46e3732d` |
| `root-tests.log` | 0 | 31 passed; zero failures/skips | `c7ef2f1a33d5e86efc1a94851da2c9f19f9e416f6383ea3ccd0e9cfc5c41f021` |
| `foundation.log` | 0 | 60 passed; zero failures/skips | `967c0bb7f7d4a551c3f84f4caff308a7adbd8e65ae9678ff92c6c8ebc21d29e6` |
| `aggregate.log` | 1 | 798 passed / 1 file-startup failure; overlapping build wrote dist during import; not a pass | `da5148c833bbee4a50032ad71667aa7ffe286aa93133e6c7bf156020e1aaf6b0` |
| `aggregate-serial.log` | 0 | 800 passed / 84 files; zero failures/skips; live suite excluded | `bc357cea3e706726b88170d310f135a6bfb6bcbaba8477260f7ad4b37c29e282` |
| `docs.log` | 0 | historical integration docs structural check passed; not production behavior proof | `7e89aa83cfc9dd3e0e5b87dfa85ad5cfebeaf6f0923ec07fcef237a48f04c22f` |
| `ownership.log` | 0 | historical integration ownership passed: 482 checked paths | `39ee0996934688647658a418ec577e5443a94ef46116ed230d1f504d047e307d` |
| `skill.log` | 0 | generated skill drift check; structural inventory still pending final reconciliation | `aad0ac4e7b7a6f7b9b8b708ca83788561f365f1e427feb2bb09a6dfa3d93e1a3` |

Manual diff review and exact repair ownership validation: changed paths all belong to coordinator preparation or its explicitly authored A-E prompt documents; no duplicate/wildcard maintenance assignments. Existing checks passing do not resolve the known thirteen feature failures or the historical structural inventory overstatement. A-E and final coordinator production wiring remain required. External native-poll and card-backend dependencies are recorded in CHANGE-REQUESTS.md.

Preparation commit: `513ede497a96bd9c30cc597faee868e201ea3456`. Created `repair/fix-1-a` through `repair/fix-1-e` under `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/fix-1-a` through `fix-1-e` with `git worktree add -b <branch> <path> 513ede497a96bd9c30cc597faee868e201ea3456`. Verified each HEAD, branch and empty porcelain status. No existing branch/path was overwritten. Dependencies and workers were not started in these new checkouts. Only prompt/registration documentation changed after the tested preparation commit.
