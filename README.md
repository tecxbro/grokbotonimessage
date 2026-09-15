# Grokbot on iMessage

This repository contains the deterministic Photon Feature Runtime for the existing Grok orchestrator. The legacy root `gbot`/`grok-bot` CLI has been removed; the supported command-line surface is the private `@grokbot/photon-features` workspace and its `grok-photon` tool.

## Development

Use Node 24.13.0 (the Photon workspace requirement), npm 10.9.2, and run `npm ci --ignore-scripts` in the checkout. No global installation or Photon login is needed. This assignment used an ignored Node toolchain under `.photon-local/toolchain`; prepend its `node_modules/node/bin` to PATH for the commands below.

```sh
npm run photon:build
node scripts/generate-contracts.mjs --check
node scripts/verify-worktree.mjs wt-00
node scripts/verify-ownership.mjs wt-00
node scripts/verify-docs.mjs wt-00
node scripts/verify-lane.mjs wt-00
node scripts/verify-all.mjs --mode=f0
```

`verify-docs` requires fresh test logs from `verify-lane`. The first verification run must use the complete lane command. Running `verify-all` without the F0 mode requires assembled integration/security/package evidence and cannot report product readiness at this checkpoint.

Public library entry: `createRuntimeHost()` from `@grokbot/photon-features`. New feature authors import `FeatureModule` from `@grokbot/photon-features/feature` and `ExecutionServices` from `@grokbot/photon-features/services`. The root's historical type names remain compatible with inherited lane consumers; the new explicit root aliases are `FoundationFeatureModule` and `FoundationExecutionServices`. No host starts at import or construction time.

Directory map: `packages/photon-features/src/` holds the runtime, contracts, host and `grok-photon` CLI; `docs/contracts/` describes invariants; `docs/worktrees/` freezes ownership and acceptance; `docs/photon/reference/` contains verified official source snapshots. See [architecture](ARCHITECTURE.md), [baseline](docs/photon-features/baseline.md), [execution](docs/contracts/execution.md), [receipts](docs/contracts/receipts.md), [operations](docs/contracts/operations.md), and [WT-00 handoff](docs/worktrees/wt-00/HANDOFF.md).

Built/tested code, integration, installation/activation and physical-device delivery are separate evidence tiers. Inherited feature implementations require adaptation to the public service seam before production registration. No live messages or production credentials are used by F0 checks.
