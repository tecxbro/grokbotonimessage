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
