# Integration test evidence

## Explicit contract target repair — 2026-09-16

Tested on macOS arm64 with Node 24.13.0/npm 10.9.2 in registered
`worktrees/step-2-messaging-guidance`, branch `codex/step-2-messaging-guidance`,
starting at `d959c3954af8c4ef4efa15a383d07ec1cc7994b1` plus this verifier-only
working diff. The prior expiry runner is unchanged. Both contract manifests,
production sources, SKILL.md, production inventory and dependency files are
unchanged. Immutable F0 remains `ee2f8576b55973eee312bca5cad0549b6f959a88`.

| Local command | Result |
| --- | --- |
| `npm run photon:check` | Passed directly on the maintenance branch: assembled-candidate, 3 schemas, 56 files, unchanged digest `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539` |
| `node --test packages/photon-features/dist/tests/foundation/verification-tools.test.js` | 11/11 passed; includes two maintenance branches, detached checkout, real immutable F0 validation, schema/hash/file-count drift rejection and absent/invalid targets |
| `node packages/photon-features/scripts/generate-skill.mjs --check` | Passed: 44 operations/examples, 4 assigned examples, 48 files |
| `npm run photon:test:integration` | 856/856 passed across 97 files; zero skipped, failed or cancelled |
| `npm run photon:test:installed` | Passed all seven modes: provider-failure, abort, cancel, expiry, stall, cold-restore, buffered |
| Focused installed runner with `COMPLETION_FAILURE_MODE=expiry COMPLETION_EXPIRY_SCHEDULE_DELAY_MS=2500` | Passed with a freshly packed archive; same checksum `4b1c283b6f46c431b59d6be852e7e0f13892338acf7a6f45b2f181255fff004f` |
| `node scripts/verify-ownership.mjs integration` | Passed after recording the exact maintained regression file |
| `node scripts/verify-docs.mjs integration` | Passed after recording the regression under maintenance rather than changing its historical owner |
| `git diff --check` | Passed |

Focused delay evidence (Unix milliseconds): stream `expiresAt=1789544104277`;
open 245 ms, boundary read 0 ms, initial append 285 ms with `{accepted:true}`,
execute 247 ms, first provider send observed at `1789544097317`.
The final keepalive started at `1789544099572` and completed at `1789544099865`.
Its earliest possible producer-stall deadline was therefore `1789544104572`,
295 ms later than absolute expiry. Expiry was observed at `1789544104284`.
The terminal result was unknown-outcome/reconcile-first and replay did not send
a replacement. This establishes absolute expiry after dispatch rather than
the five-second producer stall. Pre-dispatch expiry coverage remains intact.

Raw local logs are ignored `.photon-local/explicit-target-integration.log`,
`explicit-target-installed.log`, and `explicit-target-expiry-delay.log`.
Actual GitHub run 35066315109 at the starting SHA failed contract validation on
both Ubuntu and macOS and skipped installed tests. The local results above do
not change that historical result; any subsequent hosted run is separate
evidence reported after publication. No live suite, deployment or messages ran.

Hosted follow-up at `4759c93d15e0c98a34e652b44638ae73b49328b9`: foundation
workflow 35069355172 passed, and both operating systems in assembled run
35069355162 passed the explicit contract target check. The new F0 regression
then exposed its own dependency on the unpublished local `photon-v3-f0` tag.
The correction archives the immutable `base.commit` from included-commits.json,
matching the existing history verifier's tag-optional contract. It does not
publish or change the F0 tag, alter a digest, or substitute current sources.

## Current completion verification — 2026-09-13

The current local candidate runs on macOS arm64 with exact Node 24.13.0 and npm
10.9.2. Commands used the pinned npx toolchain, not the machine's default Node.
Spectrum 12.8.0 and zod 4.5.4 remain unchanged; public declarations, runtime hashes
and registry retrieval are in `source-lock.json.completionPass`.

The test record is `completion-results.json`; local full logs are under
`.photon-local/completion/` (ignored, with SHA-256 values committed in that record).
Initial checkout/branch/HEAD/registration/divergence are in
`completion-preflight.json`; exact completion changes are in
`FILES.json.completionFiles`. No branch/worktree changes, F0 tag movement or push.

| Command | Actual result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS; 185 packages, lifecycle scripts disabled |
| `npm run typecheck --workspace=@grokbot/photon-features` | PASS |
| `npm test` | PASS; 31/31 |
| `npm run photon:test` | PASS; 64/64 |
| `npm run photon:check` | PASS; 3 schemas, candidate digest 56 files |
| `npm run photon:test:integration` | PASS; 849/849 across 97 files; 0 failed/cancelled/skipped |
| `node packages/photon-features/scripts/generate-skill.mjs --check` | PASS; 44 operations and 48 example files validated |
| `node packages/photon-features/scripts/generate-configuration.mjs --check` | PASS; 3 profiles, unchanged 44-operation registry |
| `node packages/photon-features/scripts/generate-production-inventory.mjs --check` | PASS; all 44 rows retained; 4 explicit upstream blocked operations |
| `node packages/photon-features/scripts/prepare-npm-lock.mjs --check` | PASS; exact committed-lock derivation |
| `node scripts/verify-ownership.mjs integration` | PASS; immutable F0/reviewed history and exact assigned paths |
| `node scripts/verify-docs.mjs integration` | PASS; current deployment/instruction boundaries |
| `npm pack --workspace=@grokbot/photon-features --dry-run --json --ignore-scripts` | PASS; 448 files; dry run is not installed evidence |
| `npm run photon:test:installed` | PASS; 7 isolated modes; fresh and repeated production-only installs |
| `npm run photon:verify-all` | BLOCKED (exit 1); worktree:COMMAND_FAILED / WRONG_WORKTREE_PATH |

The aggregate verifier expects another registered lane and was run unchanged.
Its real `WRONG_WORKTREE_PATH` failure is a verifier/checkout limitation, not a
passing aggregate. No integration identity was spoofed. Valid component commands
pass independently on assigned fix-1. Linux/macOS CI definitions retain both jobs
and add the new installed matrix; remote workflow execution and branch protection
were not changed or claimed.

## Actual installed diagnostic archive

Archive: `grokbot-photon-features-0.1.0.tgz`.
SHA-256: `5713235bd7fb463c85535ca7dcccdf52edaad11f499f67d4fe94d5bfc519afcb`.
Size: 424764 bytes; 448 npm payload files.

The actual archive was extracted to fresh private temporary installation roots;
`npm ci --omit=dev --ignore-scripts --no-audit --no-fund` ran twice for each mode.
The compiled installed runtime, operating skill, wrapper bins, schemas, migrations,
producer, backend/browser component, generators and standalone shrinkwrap are
present. TypeScript/development-only runtime dependencies and source-checkout
runtime files are absent. The test fixtures supply synthetic selected-release
metadata only to exercise lifecycle; this is explicitly not approval or a
production installation procedure.

Installed executable → release-pinned launcher → authenticated Unix socket →
production authorization/composition → real temporary SQLite/resources → actual
feature and pinned SDK adapter → controlled external gRPC/HTTP boundary covers:

- Incremental producer first-send-before-close, same-message updates, final content;
  provider error, abort, cancellation, expiry, producer stall/disconnect, queue
  overflow, duplicate input/consumption and consumed/orphan source restart.
- Explicit buffered fallback with no provider send until source completion.
- Incoming text claim/heartbeat/reply/acknowledgement, typing overlap/completion/
  expiry/cancellation/shutdown, media import/send/fetch and voice send.
- Two poll creations, duplicate labels, human vote/deselection continuation;
  native poll-management operations remain blocked by their missing public API.
- Repeated universal/customized original-card updates, refreshed provider session
  metadata, authenticated participant callbacks/replay/restart and explicit cold
  update refusal without a replacement bubble.
- Avatar retention, created-chat resource retention, warm reaction removal and
  authority renewal/denied task credential/CAS/restart/old-generation fencing,
  preserving queued, blocked and unknown work.

Seven independent modes (`provider-failure`, `abort`, `cancel`, `expiry`, `stall`,
`cold-restore`, `buffered`) preserve the real conversation predecessor barrier.
The actual SDK and adapter are never injected away. Only external cloud/gRPC,
media transport and card-origin HTTP are controlled. Unexpected external URLs
fail. The existing Grok wake invokes a test executable; this does not prove a
real external Grok gateway acknowledgement.

Source integration separately tests transaction rollback, participant tampering,
wrong keys/actions/scopes, expiry, replay identity, owner replacement/revocation,
and the shipped browser script using real WebCrypto with DOM/storage boundaries.
No actual recipient browser/extension installation is claimed. Actual SDK probes
confirm U-01, U-02 and U-03 rather than manufacturing usable native handles.

The new approved packager gate requires completion checks and production-only
payload dependencies. An approved `.gpf.gz` archive could not be produced without
real approval/workflow evidence; no approval document or workflow URL was forged.
Existing synthetic installer/compatible-rollback regressions pass. Compatible
rollback of an actual approved archive and target installation remain pending.
A clean-commit repack is checked against this tested diagnostic artifact, with
exact commit/provenance recorded outside the commit to avoid self-reference.

## Failures found and resolved during this pass

Earlier runs failed on a backend configuration import cycle, missing local stream
response parsing, SDK signal handlers exiting before host cleanup, missing release
bin launcher, historical capture reassignment after authority renewal and rejection
of reaction resource kinds. These application defects were fixed and reverified.
The first full integration run after capability generation changed found a malformed
manual row; the next found its historical expected hash. Capability declarations
and the legitimate reviewed manual hash were synchronized; final 849/849 passes.

Test-fixture fixes included valid SDK attachment/raw-message shapes, expected CLI
exit status for adverse outcomes, correct staging response fields, actual native
attachment event shape, correct token expiresIn, and independent failure roots so
unknown predecessors remain fenced. Earlier failed logs are retained locally;
none is relabeled as a pass. The final installed matrix has no failed or skipped
mode. Tests do not claim a missing poll adapter, cold native session restoration,
provider delivery/read, or live device behavior.

## Current handoff gate

Code complete for the full requested scope: **No — upstream U-01/U-02/U-03 open**.
Supported production paths verified offline: **Yes, with per-operation evidence
limits in the full 44-row inventory**. Diagnostic npm archive verified: **Yes**;
approved release artifact: **pending**. Installed/activated on target: **No**.
Live/device verified: **No**. No production credentials or live messages were used.

## Historical checkpoints before this completion pass

The following records are retained for provenance; their earlier counts and
limitations do not supersede the current results and gates above.

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

## A-E merge and automated production-path verification (2026-09-11)

All commands used Node 24.13.0/npm 10.9.2. The merged input commits were A
`60a7c9b15d0f2a174efb1ddb74fe00d264a4f0a2`, B
`80ff9845e07b79acb997f3f825037c3dd209634a`, C
`ab0e275f4f2c9d096159f445f7fec670686eec71`, D
`cb69d2145fbb883c9b0592385df38d81b1c51195`, and E
`ce109824310d1617105e1863b8f7ed7c103f1798`. Merge commits are listed in
WORKLOG.md. No branch was pushed.

- Merged focused command: 265/266 passed initially. The only failure was D's
  intentionally pinned pre-coordinator generated-block hash after the required
  final inventory regeneration. Updating that one expected hash made its test
  pass 4/4; manual skill text was preserved.
- Production card plus journey command: 5/5 passed.
- Red mutation: removing `{ receipts, registerReferences }` from production
  `SpectrumEventSource` caused `repair-production-journey.test.js` to fail one
  test with `runner timeout` and exit 1. Restoring it passed 1/1 and exit 0.
- Root `npm test`: 31/31 passed. Package `typecheck`: passed. `npm run
  photon:test`: 64/64 passed. `npm run photon:check`: passed with 3 schemas,
  49 files, digest `d887593c10ffd67616af84ea065cfc181463ec96b25e1c3f49385a3934c64580`.
- First aggregate: every emitted subtest passed but the process hit the 300-second
  bound because the old webhook security fixture omitted lane A's newly mandatory
  processing ports. Per-file isolation identified only
  `security/webhook-auth.test.js` as retaining the wait; this was not called a pass.
  After fixture repair it passed 2/2.
- Final `npm run photon:test:integration`: 90 files, 826/826 tests, zero failed,
  cancelled, or skipped. The live suite is excluded by the explicit authorization
  boundary. This proves runner selection of the new journey test.
- Generated skill drift: 44 operations, 44 examples, four assigned examples,
  48 files, check true.
- Ownership: 493 changed paths, 406 reviewed-lane paths, 75 integration paths,
  26 exact historical maintenance paths, and 99 exact repair-assigned paths.
- Package dry-run: 347 files, 335,058 bytes. This is inventory only, not an
  installed or activated production archive.

The automated journey uses a scripted external-agent double and offline provider
double. It does not verify a real Grok model, provider acceptance/delivery/read,
extension rendering, human interaction, or a physical device. Positive poll
continuation cannot be production-proven at Spectrum 12.8.0 without authoritative
native poll/option IDs and provider ordering. Actual Grok/device verification is
NOT RUN because there is no authorized activated configuration, provider/Grok
credential, intended user message, or device access in this task.

## Optional conversational poll-answer maintenance (2026-09-12)

The registered `fix-1` worktree began clean at reviewed commit
`8d2a158e161873d3123241c7507d4d8f9d3bc69f`; a fresh fetch showed
`HEAD == origin/fix-1` and divergence `0 0`. Verification used Node 24.13.0
and npm 10.9.2. To exclude unrelated typing-lifetime edits that appeared in the
shared worktree during this task, the poll-only staged tree was materialized on
a temporary local `fix-1` clone. No credentials, network provider calls, live
Grok task, installation, activation, or device interaction were used.

The focused production test supplies real production composition, private
temporary SQLite/capture state, one mocked Spectrum owner/stream, a scripted
Grok wake boundary, and the authenticated compiled CLI/work protocol. Both
`pollManagement` and `nativePollIdentity` are absent. It verifies one explicit
idempotent poll send; public `poll_option` capture; durable work claim and answer
read before ordinary `text.send`; acknowledgement; duplicate/restart safety;
selection, deselection, re-selection and multiple-selection deltas; duplicate
labels/questions without guessed correlation; malformed/foreign/unauthorized
rejection; and one owner/listener.

Commands and actual results:

| Command | Result |
| --- | --- |
| `npm run photon:build` plus the eight focused/affected test files | 46/46 passed; zero failures, skips, cancellations, or todos |
| `npm run typecheck --workspace=@grokbot/photon-features` | passed |
| `npm test` | 31/31 passed; zero failures or skips |
| `npm run photon:check` | passed; 3 schemas, 49 digest files, candidate digest `c66c203a1df3e11d39f7c84a7f70de7f5b88a3ef04bfb0377a88c23f1bc8a737` |
| `npm run photon:test:integration` | 91 selected non-live files; 829/829 passed; zero failures, skips, cancellations, or todos |
| `node packages/photon-features/scripts/generate-skill.mjs --check` | passed; 44 operations/examples, 4 assigned examples, 48 validated files, drift check true |
| `node scripts/verify-docs.mjs integration` | passed; 15 sources and 9 lanes |
| `node scripts/verify-ownership.mjs integration` | passed; 499 checked paths, including 105 exact repair-assigned paths |
| `git diff --check` | passed |

The full integration runner explicitly excludes the authorization-gated live
suite. These results prove the assembled local path with provider/Grok doubles,
not installation, activation, provider acceptance/delivery/read, iMessage poll
rendering, a human tap, live Grok understanding, or physical-device behavior.

Spectrum 12.8.0's public `PollOption` retains option/title, selection state,
poll content when supplied, sender, message identity, direction, and timestamp,
but not authoritative native poll/option IDs or provider ordering in the stored
snapshot. Therefore conversational delivery is proven without management, while
native management, exact attribution when those IDs are absent, and final/latest
vote-state claims remain unavailable.

## Typing diagnostics and reviewed-history availability (2026-09-12)

The registered `fix-1` checkout began clean at
`9daae7b02a30b2e27e55e4f869e026593b012734`, equal to `origin/fix-1` with zero
divergence. Verification used Node 24.13.0, npm 10.9.2, and the locked Spectrum
12.8.0 packages. The tested pre-evidence five-file candidate has sorted
path+NUL+bytes+NUL SHA-256
`5f8b6a5273564daf7367fb336a591c8c53f9a60c4e081ce00d29086455bf3957`.

The production regression was changed before the constructor. Against the old
production wiring, its provider-failure variant failed exactly one of 13 tests:
the composition report callback contained `[]` instead of
`["TYPING_PROVIDER_FAILURE"]`. After forwarding `dependencies.report` as the
fourth `TypingLeases` argument, the same file passed 13/13. The case also proves
the rejected start attempts `stopTyping`, a subsequent ordinary text send remains
`provider-accepted` at the offline double boundary, shutdown stops typing before
the SDK owner, and restart does not replay the lease.

The branch-sensitive contract generator preserved `foundation.json` at Git blob
`1710cd03377e131d8ccbce851a5936dc95fb7d3e`; only the candidate contract changed.
Its generated digest is
`2d86137449d36c28850b012ddcc7751e0f259dfd977e73368a3a3cfc342d36c2`
across 50 source files. No action, event, or result schema changed.

The reviewed-history script first completed an atomic dry run, then atomically
published 12 exact ledger commits to
`refs/tags/photon-reviewed/<lane>/<commit>`. A wildcard fetch retrieved all 12
refs and `verify-ownership.mjs integration --history-only` passed with the
recorded foundation and exact commit identities. `photon-v3-f0` was not moved.
PR #1 was confirmed open, draft, and conflicting before it was closed with the
supersession comment. Its remote head branch remains present; it was not merged
or deleted.

Fresh combined commands and actual results:

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | passed; 185 packages installed |
| `npm run typecheck --workspace=@grokbot/photon-features` | passed |
| `npm run photon:build` | passed |
| focused typing and poll production tests | 15/15 passed; zero failures, skips, cancellations, or todos |
| `npm test` | 31/31 passed; zero failures or skips |
| `npm run photon:test` | 64/64 passed; zero failures or skips |
| `npm run photon:check` | passed; 3 schemas, 50 digest files, candidate digest `2d86137449d36c28850b012ddcc7751e0f259dfd977e73368a3a3cfc342d36c2` |
| `npm run photon:test:integration` | 92 selected non-live files; 842/842 passed; zero failures, skips, cancellations, or todos |
| `node packages/photon-features/scripts/generate-skill.mjs --check` | passed; 44 operations/examples, 4 assigned examples, 48 validated files, drift check true |
| `node scripts/verify-ownership.mjs integration` | initial exact failure on the unrecorded `typing-binding.ts`; after adding only the binding and regression paths, passed with 502 checked paths, 12 required reviewed commits, 78 integration paths, 26 maintained paths, and 106 repair-assigned paths |
| `npm pack --workspace=@grokbot/photon-features --dry-run --json --ignore-scripts` | passed; 351 entries, 341,466-byte package, 4,187,550 bytes unpacked |
| final docs, ownership, and diff checks after this evidence update | passed; docs: 15 sources/9 lanes; ownership: 502 paths and 12 reviewed commits; `git diff --check`: clean |

The full runner excludes the authorization-gated live suite. These results are
local build, controlled-provider, assembled integration, and package-inventory
evidence. They do not prove installation, activation, provider rendering,
recipient-visible typing, delivery/read state, a live Grok task, or device
behavior. No deployment, credential change, live message, or F0 tag update was
performed.

## 2026-09-17 — Release setup repairs, local verification

Release branch: `codex/rfx-00-release-fix`, base HEAD
`39acd52f31800c724153b65463a5c762489156e3`, edits left uncommitted.
An isolated local verification clone committed the same changed code/tests as
`8dbdc4cf4601aba7d00f94878e58408bd7378db8`. This is a test snapshot,
not a release-branch commit or publication. The 15 changed source/script/test
files match that snapshot byte-for-byte; sorted path/NUL/content/NUL SHA-256:
`0e47e7af0fe84449a212456e987af2b09b1478eadebbe202ebfeef54036fb4e1`.

Node 24.13.0 / npm 10.9.2 on macOS arm64. Evidence:

- Build and typecheck pass.
- Full assembled offline suite: **1,073 tests passed across 109 files**, no failures,
  cancellations, skips or todos (`.photon-local/setup-snapshot-integration.tap`).
- Owner-package suite: **49 passed** (`.photon-local/setup-package-final.tap`).
- Installed archive journey passed all seven modes: provider failure, abort, cancel,
  finite expiry, stall, cold restore and buffered output (`.photon-local/setup-artifact.tap`).
  That initial combined artifact run also contained an old placeholder assertion;
  the corrected owner-package file was rerun and passed all 49 tests separately.
- Assembled-candidate digest check, configuration/profile schemas, production inventory,
  skill drift, dependency-lock drift, ownership and documentation checks pass.
- Manual diff review and `git diff --check` pass. Foundation manifest/tag unchanged.

The new full-flow test uses real spawned discovery fixtures, configuration generation,
exclusive persistence, validation, activation, SQLite, host lock and Unix socket with
an offline SDK. It reaches readiness, restarts without re-resolving the route, and
rejects repeat first-time setup without overwriting configuration. Ambiguous projects
and Grok agents create no authority. Shared missing serving metadata succeeds while
dedicated missing metadata fails. Generated owner authority validates after 48 hours;
finite legacy authority still expires.

Initial regressions reproduced the shared-number and finite-expiry defects. Removing
the installer placeholder required fixture configurations to request mode 0600 explicitly.
The existing contract-target regression archives committed HEAD but compares its digest
to the working manifest, so the final aggregate was run from the isolated committed
snapshot. A transient lifecycle timing failure in an earlier aggregate did not recur.
Local socket tests ran with sandbox escalation; no live Photon/Grok account was used.
These results are local/offline evidence, not Linux VM deployment, hosted CI, provider
message delivery or device observation. No release was published or real installation activated.
