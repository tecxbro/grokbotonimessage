# Agent working guide

Release integration reviewed: 2026-09-17 UTC; historical F0 instructions are subordinate to the explicit release assignment.
Read this file and [architecthure.md](architecthure.md) when starting a lane assignment.

## Mission and boundaries

- Build the deterministic Photon Feature Runtime; the existing Grok Bot orchestrator delegates substantive work to existing worker Bots.
- Codex builds the integration package and operating skill; Grok Bot must not generate integration code during normal operation.
- Keep one host responsible for Photon credentials, client lifecycle, ingress and production outbox.
- Keep inbound transport, outbound provider and Grok wake-up separate; wake notifications only point to durable work.
- Do not add another reasoning model, keyword router, Grok API integration or transcript polling.
- Do not migrate hosting, modify iMessage-agent-render or select the macOS local provider because development runs on a Mac.
- Do not provision lines, change billing/approval settings, activate services or send live messages without explicit task authorization.

## Release-fix operating boundary

RFX-00 is integration owner for reviewed RFX-01 through RFX-11. Required interface/type, routing, resource authority, composition, imports, fixture, registry/schema and merge glue may cross historical lane ownership; log each exact file, affected lanes, reason and tests in docs/release-fix/integration-log.md. Return substantive feature defects to their owning lane. There is no RFX-12.

Preserve the registered rfx-00-integration worktree, codex/rfx-00-integration branch and exact base b83e3afd7049a991de6daffedf831165890f0901. Preserve original integration documentation. Never reset/recreate the checkout, rewrite immutable F0, mutate main, deploy, activate real Photon, send live messages or operate the real Grok VM from this task. Local isolated build/test environments use controlled external doubles only.

The deliverable is a tested clean-commit owner-local Linux x64 artifact, SHA-256, provenance and VM instructions. Install/run belongs on the Grok Bot cloud VM, not the user's Mac. Photon CLI retrieves private project secrets after existing-session verification or a real headless device-login URL/code. Grok remains the only reasoning/orchestration layer; no instruction/orchestration redesign belongs in this wave.

## Checkout and ownership

- Work only in the assigned checkout; inspect branch, HEAD, upstream/divergence and dirty files before changes.
- Report the comparison commit and current merge-base separately; leave the original creation base unknown unless proven.
- Do not create/switch branches or worktrees, reset, rebase or force-push unless the assignment explicitly permits it.
- Preserve unrelated changes and stage only task-owned files when committing.
- Follow [ownership.json](docs/photon-features/ownership.json) for every lane's implementation, test and documentation paths.
- WT-00 owns shared contracts, dependencies, migrations, aggregate registration, host composition and these two living root guides.
- Submit shared-change requests in `docs/photon-features/requests/wt-NN/`; do not independently edit shared contracts.

## Implementation rules

- Use injected `ExecutionServices` and the shared transaction/resource ports; feature modules must not create clients or subscriptions.
- Treat context IDs and resource references as lookups requiring authenticated, current authorization.
- Use installed exact-version public SDK exports/types as API authority; never bypass missing support through private SDK internals.
- Keep provider support, account/conversation availability, implementation and unit/SDK-contract/live evidence separate.
- Keep queued, executor completion, provider acceptance, delivered/read observations and unknown outcomes distinct.
- Keep fixtures under tests; schema existence or a fake provider must never satisfy a production implementation gate.
- WT-03 owns voice formatting and WT-08 owns its operating guidance; preserve [the voice policy](docs/photon-features/contracts-v1.md#voice-policy-preservation).

## Verification commands

Use Node 24.13.0 and npm 10.9.2 on PATH; exact dependency versions and compatibility limitations are recorded in [foundation.json](docs/photon-features/foundation.json).

| Check | Command from repository root |
| --- | --- |
| Workspace tests | `npm test` |
| Package compilation and public SDK probes | `npm run photon:build` |
| F0 foundation tests | `npm run photon:test` |
| Explicit assembled candidate drift | `npm run photon:check` |
| Regenerate shared schemas, WT-00 only | `node scripts/generate-contracts.mjs --target assembled-candidate` |

For one lane, run `npm run test:lane -- dist/tests/lanes/wt-NN/*.test.js` inside `packages/photon-features`; it compiles the package, then selects that lane's tests. Run relevant checks after changes and record their actual results.

## Living documentation and handoff

- Update this guide when working rules, ownership or verified commands change; update [architecthure.md](architecthure.md) when architecture, interfaces or integration status changes.
- Coordinate shared guide edits through WT-00 so parallel lanes do not overwrite one another.
- Keep detailed contracts authoritative in [runtime-contract.md](docs/photon-features/runtime-contract.md) and [contracts-v1.md](docs/photon-features/contracts-v1.md); link to them rather than duplicating them.
- Preserve historical checkpoint evidence; record new dated evidence and distinguish decisions from proposed work.
- Handoffs must state commit/dirty state, validation, blockers and separate code-built, integrated, installed/activated and live-verified status.
- Report an actual commit SHA only after it exists; uncommitted work is not part of a published checkpoint.
