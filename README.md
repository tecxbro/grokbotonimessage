# Grokbot on iMessage

This repository contains the deterministic Photon Feature Runtime for the Grok Bot cloud VM. Photon owns transport, durable inbox/outbox state and iMessage operations. Grok owns reasoning and bot-to-bot coordination. The legacy root `gbot`/`grok-bot` CLI has been removed; the supported command-line surface is the private `@grokbot/photon-features` workspace and its `grok-photon` tool.

## Owner shortcut

If the owner says **“connect me to iMessage”**, follow [`CONNECT.md`](CONNECT.md).

That one request is the owner-facing bootstrap for the shipped product: use the deployment runbook, authenticate/configure Photon when required, discover and privately bind the current Grok Bot as the wake target, start the single shared runtime, then wait for the owner's first real inbound iMessage. Do not ask the owner for internal Grok Bot IDs or make them manually reproduce the deployment instructions.

## Grok bot topology

The setup prompt creates or reuses three shallow Grok roles:

1. **iMessage Bot**: claims Photon handoffs, passes the user message to the Orchestrator, receives the final response, sends it through `grok-photon`, then acknowledges the handoff.
2. **Orchestrator**: owns the conversation, decides whether to answer directly or delegate, coordinates Workers and returns the final user-facing response to the iMessage Bot.
3. **Worker**: performs assigned substantive work and reports only to the Orchestrator.

Keep these role prompts short. Do not add biographies, elaborate personalities, recursive management trees or separate memory systems. Reuse the current setup bot as the iMessage Bot when Grok supports that cleanly; otherwise create only the missing role. The Orchestrator may create more Workers later when work requires them.

Internal Grok IDs are implementation details. The setup agent captures returned IDs and binds the Photon wake target privately. It must not ask the owner to choose or paste an internal UUID. Only the iMessage Bot uses Photon. The Orchestrator and Workers never start another Spectrum client.

The Photon runtime still stores one internal wake target. The product setup must bind that target to the iMessage Bot. Bot creation and role wiring are prompt-owned until a supported Grok creation API is verified and automated in code.

## RFX-00 release integration

The existing RFX-01 through RFX-11 lanes are composed in the preserved RFX-00 worktree. [Acceptance](docs/release-fix/acceptance.md), [exact included commits](docs/release-fix/included-commits.json) and [test evidence](docs/release-fix/test-evidence.md) describe the candidate. [Deployment](packages/photon-features/DEPLOYMENT.md) targets the Grok Bot cloud VM on Linux x86_64/amd64, not the user's Mac. Codex produces a tested owner-local artifact; actual activation and live phone/provider/device verification are separate later work.

Shared routing uses "shared" with durable authorized root/secondary conversations. One messaging host wakes the iMessage Bot, which coordinates with the Orchestrator and Workers. Capability reports separate configuration and informational evidence from actual runtime/provider/resource blockers. No second messaging runtime or second orchestrator is added.

## Development

Use Node 24.13.0 (the Photon workspace requirement), npm 10.9.2, and run `npm ci --ignore-scripts` in the checkout. No global installation or Photon login is needed. This assignment used an ignored Node toolchain under `.photon-local/toolchain`; prepend its `node_modules/node/bin` to PATH for the commands below.

```sh
npm run photon:build
npm run photon:check
```

`photon:check` explicitly validates the assembled candidate manifest, including on
maintenance branches and detached PR checkouts. For a genuine foundation source
checkout, use `npm run photon:check:foundation`; the F0 lane verifier also selects
that target explicitly. Neither target falls back to another manifest when its
schema, file count, or contract hash differs. Direct generator invocations require
`--target assembled-candidate` or `--target foundation`, including generation.
The frozen F0 manifest and checkpoint must not be regenerated for assembled work.

The historical F0 lane checks below apply to its registered foundation checkout:

```sh
node scripts/verify-worktree.mjs wt-00
node scripts/verify-ownership.mjs wt-00
node scripts/verify-docs.mjs wt-00
node scripts/verify-lane.mjs wt-00
node scripts/verify-all.mjs --mode=f0
```

`verify-docs` requires fresh test logs from `verify-lane`. The first verification run must use the complete lane command. Running `verify-all` without the F0 mode requires assembled integration/security/package evidence and cannot report product readiness at this checkpoint.

Public library entry: `createRuntimeHost()` from `@grokbot/photon-features`. New feature authors import `FeatureModule` from `@grokbot/photon-features/feature` and `ExecutionServices` from `@grokbot/photon-features/services`. The root's historical type names remain compatible with inherited lane consumers; the new explicit root aliases are `FoundationFeatureModule` and `FoundationExecutionServices`. No host starts at import or construction time.

Directory map: `packages/photon-features/src/` holds the runtime, contracts, host and `grok-photon` CLI; `docs/contracts/` describes invariants; `docs/worktrees/` freezes ownership and acceptance; `docs/photon/reference/` contains verified official source snapshots. See [architecture](ARCHITECTURE.md), [baseline](docs/photon-features/baseline.md), [execution](docs/contracts/execution.md), [receipts](docs/contracts/receipts.md), [operations](docs/contracts/operations.md), and [WT-00 handoff](docs/worktrees/wt-00/HANDOFF.md).

Built/tested code, integration, installation/activation and physical-device delivery are separate evidence tiers. Historical F0 adaptation work is preserved below its checkpoint; current assembled registrations and exact limitations are recorded in the release-fix evidence. No live messages or production credentials are used by F0 checks.
