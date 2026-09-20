# Review and test evidence

Date: 2026-09-20. Scope: the new feature-only profile/client/export/packaging changes.
Base: `3d34354e85b1c64a3c165498d9e904f3c0182d26`.

## Executed checks

Local environment: Linux x64, Node 22.16.0, npm 10.9.2. This is not the product's
pinned Node 24.13.0 environment. Dependencies and a full clone could not be obtained
because the editing container could not resolve the GitHub/npm download hosts.
The canonical action source was read through the connector and its reconstructed
bytes matched Git blob `d98954021e7e91415ee9014ca389e58884f0da85` exactly.

| Check actually run | Result |
| --- | --- |
| New dependency-free unit suite | 145 tests passed, 0 failed, 0 skipped, 0 cancelled. |
| Same suite from a separate clean copy with unrelated working directory | 145 passed again. This is not a second set of 145 different tests. |
| JavaScript syntax | All eight new/affected `.mjs` files passed `node --check`. |
| Catalog/source-key comparison | All 44 names, required keys and optional keys match the canonical source. |
| Markdown catalog consistency | Human table and all per-operation boundaries match the JSON catalog. |
| Skill-scope scan | The skill and ten guides contain no role/delegation/personality instructions. |
| Packaging delta | Exactly one payload-directory addition to the original custom archive builder; original Git blob was verified before patching. |
| Archive codec fixture | Real encoder/decoder preserves the new skill and client bytes; unsafe paths and invalid checksums remain rejected. |
| Workflow syntax | YAML parsed; Linux/macOS matrix, read-only repository permissions and no continue-on-error verified. Workflow execution is separate. |

The initial 140-test run found one missing source-reference file. That defect was
fixed; subsequent 141-test and final 145-test runs passed. Additional tests cover
human-catalog drift and custom archive inclusion rather than merely repeating a run.

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
and not a claim of ten live deployments. The remaining integration checks below
are not upgraded by these reviews.

## Required checks not established by local unit tests

`tests/contracts.test.mjs` uses the real compiled action parser, inherited examples,
feature import and inspection assembly. It has no dependency-missing skip. The
compile-only `tests/client-types.mts` checks the public declaration. The dedicated
GitHub workflow runs those plus the existing schema, integration and installed
archive suites on the pinned Node/npm versions. Check the actual workflow run on
the branch; a committed workflow is not evidence that it passed.

The unit client's parser is deliberately a labeled boundary double. It proves
client behavior, not Zod/SDK compatibility. The archive codec fixture does not prove
a complete installed release. Source links and full canonical examples require
the complete checkout and build, not the partial local reconstruction.

Not verified here: real friend-runtime binding, installed SDK execution, the full
existing application test suite, live sending/receiving, native typing display,
poll votes, cold recovery, device rendering or any deployment. Those require their
actual dependencies, configuration and authorized environment. The feature-only
client is not a finished adapter for an unseen running bot.
