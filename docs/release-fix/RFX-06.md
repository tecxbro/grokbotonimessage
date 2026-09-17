# RFX-06 — owner-local tested packaging

## Identity and scope

Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-06-packaging`.
Branch: `codex/rfx-06-packaging`.
Base/tested HEAD: `b83e3afd7049a991de6daffedf831165890f0901` plus the changes below.
Verified origin `https://github.com/tecxbro/grokbotonimessage.git`, registered worktree,
clean index/worktree including untracked files before editing, and HEAD equal to base.
Live `git ls-remote` found main at the same SHA and no remote lane branch.
The historical foundation tree and primary checkout were not modified.

## Files changed

- `packages/photon-features/scripts/package.mjs`: explicit CLI mode, shared required
  checks, strict metadata modes/completion contracts, complete subprocess provenance,
  lock credential rejection, installed dependency verification, final Git identity
  check after collection, and written archive checksum verification.
- `packages/photon-features/tests/artifact/rfx-owner-package.test.mjs`: 49 checks
  (including subtests) covering both modes and the installer/rollback boundaries.
- `docs/release-fix/RFX-06.md`: this task note and integration handoff.

`install.mjs` and `rollback.mjs` need no edits: their existing calls to the shared
`validateMetadata()` enforce both supported modes. Private root permissions,
exclusive install/host ownership, inactive installation, checksum verification,
state preservation and rollback checks remain intact. No production runtime edits.

## Usage and integrity contract

From the candidate package directory, using Node 24.13.0 and npm 10.9.2:

```sh
node scripts/package.mjs --owner-local /absolute/clean/candidate /absolute/output/release.gz
node scripts/package.mjs /absolute/clean/candidate /absolute/approval.json /absolute/output/release.gz
```

The first invocation emits `provenanceMode: owner-local-tested` and does not accept
an approval file or emit a workflow URL. The original three-argument invocation
emits `published-approved` and still requires approval bound to the current commit
and F0 digest, with a valid repository workflow-run URL. Approval JSON validation
is local policy validation; it does not independently authenticate a GitHub run.
Output must be outside the candidate and existing output files are not overwritten.
Missing/relative owner-local operands and extra flags fail with
`USAGE_OWNER_LOCAL_ABSOLUTE_CANDIDATE_ABSOLUTE_OUTPUT`; malformed formal invocations
fail with `USAGE_CANDIDATE_APPROVAL_OUTPUT`.

Both modes require all ten existing test/typecheck/drift commands, a fresh dependency
installation, production dependency verification, a clean unchanged Git commit,
credential-safe archive paths/lock URLs, the pinned toolchain/dependencies, and
state schema 1. Metadata must explicitly name a supported provenance mode and carry
release contract 2, completion contract 1, every required successful check, and the
same state compatibility guarantees. Missing/unknown modes and downgraded contracts
are rejected. Previously unlabelled artifacts must be rebuilt; compatible rollback
continues to work between artifacts satisfying the supported metadata contract.

The checksummed archive embeds mode, commit, digest, platform/toolchain/dependencies,
state compatibility and test results. The `.provenance.json` sidecar also binds the
archive checksum and records every directly executed packaging subprocess: actual
executable, argument array, cwd, command, exit status, signal, and stdout/stderr
hashes, including Git checks, npm version, both clean installs and dependency listing.
Failed commands abort packaging. This is local test/integrity evidence, not full
live verification, publication, provider delivery, or device evidence.

## Acceptance evidence

All checks used Node **24.13.0**, npm **10.9.2**. Logs are retained under this
worktree's ignored `.photon-local/` directory. Mocked subprocess results are used
only in the new artifact test; the verification commands listed below were real.

- Focused initial run: 48/48 passed. The additional post-collection HEAD-change
  case brings the final RFX suite to 49/49, all passing in the installed-artifact run.
- `npm ci --ignore-scripts --no-audit --no-fund`: passed.
- `npm ls --omit=dev --all --json`: passed; dependency graph checked without removal
  of the development tools used for this lane verification.
- `npm run typecheck --workspace=@grokbot/photon-features`: passed.
- `npm test`: 64/64 passed.
- `npm run photon:test`: 64/64 passed.
- `npm run photon:check`: passed for explicit `assembled-candidate` target;
  digest `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539`.
- Package `generate-skill.mjs --check`, `generate-configuration.mjs --check`,
  `generate-production-inventory.mjs --check`, and `prepare-npm-lock.mjs --check`:
  all passed.
- `npm run photon:test:integration`: **847 passed, 9 failed, 0 skipped**.
  All failures reject old incomplete metadata fixtures; see integration requests.
- `npm run photon:test:installed`, first run: **49 passed, 1 failed, 0 skipped**.
  All RFX tests passed; the existing completion journey failed in `cancel` with
  `TRANSPORT_UNCERTAIN` and host `RESTART_GAP`. Provider-failure and abort fixtures
  completed before that failure. The unchanged isolated retry passed **50/50**,
  including all seven completion journeys and all 49 RFX checks, with zero skipped
  tests. Keep `installed.tap` and `installed-retry.tap`; no runtime, timeout, or
  assertion changes were made between runs.
- `node scripts/verify-docs.mjs integration`: passed.
- `node scripts/verify-ownership.mjs integration`: failed with
  `UNOWNED_PATH:docs/release-fix/RFX-06.md`; the historical manifest has no release-fix
  ownership entries. Manual exact-path review finds only the three authorized files.
- `git diff --check`: passed. No staged/unstaged deletions.

The RFX tests use explicit mocked successful command results and inject failures
for each required command. Real Git, archive IO, checksums, metadata validation,
private install roots, SQLite and rollback are exercised. Cases include dirty
staged/unstaged/untracked candidates, changed HEAD during checks and after collection,
credential paths and both lockfiles, missing/failed checks in both modes, checksum
rejection, repeat-install state preservation, compatible/incompatible rollback,
active owners/configuration, unsafe roots, deterministic CLI errors and invalid
formal approval JSON. They create no production installation or live connection.

Tested implementation file SHA-256 values:

- `package.mjs`: `3684d0d76db8a5cb2f5af6359cc6eeb5ad3d95d2dc785472432757c47837de4c`
- `rfx-owner-package.test.mjs`: `19f5514f3f34f92c97683cf9496c2ded38aacae5690d612657ce4458454a727b`

Evidence log SHA-256 values:

- `integration.tap`: `77bd980c7776e2f3c8b9fc389ff46856ac766e64e414804c043ada7dcf09c167`
- `installed.tap`: `8408182d718bfdc6b856fa0714096637b437b6f8e01e2151136692b07c284973`
- `installed-retry.tap`: `392e36b9a1570c57b44d2b17e92f2d154a06080f0cee057bf0ae7647df65bb44`

## Remaining integration requests

1. Migrate nine out-of-lane synthetic metadata tests to an explicit supported mode,
   complete test evidence and the current release/completion contracts. Add the
   completion payload entries required by the existing installer where absent:
   - `packages/photon-features/tests/e2e/install-rollback.test.ts`: 1 failure.
   - `packages/photon-features/tests/lanes/wt-08/regression.test.ts`: 2 failures.
   - `packages/photon-features/tests/integration/completion-browser.test.mjs`: 1 failure.
   - `packages/photon-features/tests/lanes/wt-08/distribution.test.mjs`: 5 failures.
   These files are outside RFX-06 ownership. Do not add implicit provenance or weaken
   metadata validation to keep incomplete fixtures passing.
2. Register the exact RFX-06 paths and task note in the coordinator-owned release-fix
   ownership/verification scheme. Historical foundation ownership must stay intact.
3. Retain the first installed-run failure as intermittent evidence. The unchanged
   isolated retry passed all seven journeys; rerun on the assembled release and
   investigate runtime/helper timing if `RESTART_GAP` recurs. No assertion was weakened.
4. After integration, rerun the full required suite and package a clean committed
   assembled candidate. This lane has not produced a real fully tested release.

## Commits and operating boundary

Implementation commit: `1476e17f51a657f9941860c19a6ae5a27d232a7d`.
This subsequent documentation-only commit records that immutable implementation
SHA. Final branch identity/ownership checks confirmed only the three assigned
paths changed from the base, no file deletions, and no remote lane branch.
No push, deployment, Photon activation, live messaging, or Grok VM/Mac operation.
