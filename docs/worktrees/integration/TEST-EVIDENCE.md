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
  756 tests, 0 failed, 0 skipped. The live directory is excluded explicitly
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
