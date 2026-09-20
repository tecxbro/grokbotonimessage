# Review and test evidence

Date: 2026-09-20. Scope: the new feature-only profile/client/export/packaging changes.
Base: `3d34354e85b1c64a3c165498d9e904f3c0182d26`.
Fully tested implementation commit: `d7452fdb22d72cd71ee83b5488c60179d04fecba`.
This subsequent evidence update changes this document only, not executable code,
configuration, schemas, tests, dependencies or the tested workflow.

## Completed pinned GitHub verification

[Photon feature-only profile run 35540197700](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197700)
completed successfully for the exact implementation commit above. All five jobs
passed: candidate identity, Linux/macOS feature checks, and Linux/macOS existing
regression gates. Both operating systems used Node 24.13.0, npm 10.9.2, a complete
checkout and locked dependencies, including unchanged spectrum-ts 12.8.0.

| Executed check | Linux | macOS |
| --- | --- | --- |
| New feature-client/profile/packaging unit suite | 145 passed | 145 passed |
| Actual locked-dependency package build | Passed | Passed |
| Compiled canonical contracts/examples/imports/package checks | 93 passed | 93 passed |
| Full profile verification | All 44 original examples and source/schema/import references checked | All 44 checked |
| Public client declaration, positive and negative TypeScript cases | Passed | Passed |
| Existing schema and candidate digest check | SCHEMAS_AND_DIGEST_OK | SCHEMAS_AND_DIGEST_OK |
| Existing foundation tests | 64 passed | 64 passed |
| Existing assembled integration tests | 483 passed | 483 passed |
| Existing installed-archive tests | 26 passed | 26 passed |
| Isolated installed-runtime canary | COMPLETION_INSTALLED_CANARY_OK | COMPLETION_INSTALLED_CANARY_OK |

The numbered suites each recorded zero failures, skipped tests and cancellations.
Counts are reported per suite and per platform; repeated runs are not additional
distinct tests. Installed-archive tests ran in isolated CI fixtures, not in the
friend's live VM. Provider/Grok external boundaries were not live accounts.

Job evidence:
- [Linux feature checks, 106156379384](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197700/job/106156379384)
- [macOS feature checks, 106156379258](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197700/job/106156379258)
- [Linux regression and installed-archive checks, 106156379339](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197700/job/106156379339)
- [macOS regression and installed-archive checks, 106156379404](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197700/job/106156379404)

The separate inherited [Photon foundation run 35540197726](https://github.com/tecxbro/grokbotonimessage/actions/runs/35540197726)
also passed on this implementation commit.

### Defects found and corrected before the passing run

The first local run found a missing source-reference document, which was added.
The first remote run exposed CONTRACT_DIGEST_DRIFT: adding package exports changes
the assembled candidate fingerprint. A read-only CI job computed the exact digest;
only the assembled candidate record was updated. The frozen photon-v3-f0 checkpoint,
action schemas and checker assertions were not modified. Regression CI now fetches
full Git history so the original foundation tag is available to its existing tests.

The final computed candidate digest is
`91a8c5354761bc26ccd95995e1c99fd83a5f1327466adb3b0b57226779f74e7e`
over the existing algorithm's 60 files. No continue-on-error, assertion reductions,
required-test skips or fictitious identity were used to turn failures green.

## Earlier local checks

The editing container supplied Linux x64, Node 22.16.0 and npm 10.9.2. It could not
resolve the GitHub/npm download hosts, so it did not provide a complete installed
SDK environment. The pinned remote verification above subsequently supplied that
missing build/test environment. The canonical action source read through the
connector was reconstructed with bytes matching Git blob
`d98954021e7e91415ee9014ca389e58884f0da85` exactly.

| Local check actually run | Result |
| --- | --- |
| New dependency-free unit suite | 145 passed, zero failed/skipped/cancelled |
| Same suite from a separate clean copy and unrelated working directory | 145 passed again, not another set of distinct tests |
| JavaScript syntax | All eight new/affected .mjs files passed node --check |
| Catalog/source-key comparison | All 44 names and required/optional keys matched |
| Human and JSON catalog consistency | Table and per-operation boundaries matched |
| Skill-scope scan | Skill and ten guides contained no role/delegation/personality instructions |
| Packaging delta | One payload-directory addition; original package-builder blob verified before patching |
| Archive codec fixture | New skill/client bytes preserved; unsafe paths and invalid checksums rejected |
| Workflow syntax | YAML parsed; matrix, read-only permissions and absence of continue-on-error checked |

The local client unit tests deliberately use a labeled parser-boundary double.
They establish client behavior, not canonical parser or SDK compatibility. The
subsequent 93-test remote suite uses the real compiled canonical parser, inherited
examples and actual package imports instead of that double.

## Ten review passes

1. **Branch and scope:** new branch from the exact release source; no main/release
   reset, live installation, account changes or old traffic imported.
2. **Inventory:** all 44 operations accounted for exactly once, including every
   read, clear, removal and administrative operation.
3. **Inputs:** required/optional keys checked against source; nested content,
   contacts, media descriptors and actual reference parents reviewed separately.
4. **Execution boundary:** client supplies no recipient/context override, uses the
   canonical parser and delegates to the existing authenticated executor once.
5. **Results and repetition:** no automatic retry; queued/provider/device states,
   successful void controls and unknown/partial outcomes remain distinct.
6. **Poll workflow:** native management blocker separated from Photon support;
   incoming selection, deselection, multiple polls and unresolved identity covered.
7. **Cards and reactions:** original targets/handles, cold-session limits and
   callback provenance retained; no silent replacement bubble or tapback.
8. **Typing and receiving:** existing controller/consumer remains in place;
   individual lease limits do not redefine activity or change bot behavior.
9. **Packaging and public imports:** additive neutral exports, actual archive
   allowlist inclusion, no dependency changes or production bootstrap import.
10. **Reproducibility and scope leakage:** fresh-copy tests, syntax, source hashes,
    local profile links, Markdown structure and known private-traffic exclusion.

These are distinct review passes over the addition, not ten independent reviewers
or ten live deployments. Remote regression evidence is reported separately above.

## Remaining live-integration boundaries

The branch exposes existing real feature implementations and a client bound to
caller-supplied authenticated execution ports. It does not supply or install a
verified adapter for an unseen running friend installation. Loading a skill does
not turn a text-only enqueue helper into a complete rich-feature executor.

Still unverified: the actual friend-runtime binding, live Photon network execution,
real sending/receiving, visible typing, human poll votes, device card rendering,
live cold-session recovery and deployment on that VM. Installed package tests and
SDK-compatible builds do not establish those device/account observations.

Inherited feature limits remain explicit: the reviewed shared-owner binding blocks
poll.get, poll.vote, poll.unvote and poll.addOption; reaction removal and card
updates require their actual restorable handles/sessions. No guide upgrades those
limitations into a claim that every declared operation is available or live-proven.
