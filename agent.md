# Agent working guide

Release integration reviewed: 2026-09-17 UTC; historical F0 instructions are subordinate to the explicit release assignment.
Read this file and [architecthure.md](architecthure.md) when starting a lane assignment.

## Mission and boundaries

- Build the deterministic Photon Feature Runtime. Photon handles transport and durable messaging state; Grok handles reasoning and bot-to-bot coordination.
- Product setup creates or reuses three shallow Grok roles: iMessage Bot, Orchestrator and an initial Worker. Follow the role rules below.
- Codex builds the integration package and operating skill; Grok Bot must not generate integration code during normal operation.
- Keep one host responsible for Photon credentials, client lifecycle, ingress and production outbox.
- Keep inbound transport, outbound provider and Grok wake-up separate; wake notifications only point to durable work.
- Do not add another reasoning model, keyword router, Grok API integration or transcript polling.
- Do not migrate hosting, modify iMessage-agent-render or select the macOS local provider because development runs on a Mac.
- Do not provision lines, change billing/approval settings, activate services or send live messages without explicit task authorization.

## Grok role creation rules

Keep role creation intentionally shallow. The setup prompt may use the current setup bot as the iMessage Bot and create only the Orchestrator and Worker when that is the cleanest supported Grok flow. Otherwise it creates or reuses the three roles. It must use the installed Grok product's supported bot controls and must not invent an undocumented CLI command.

- **iMessage Bot**: claim Photon handoffs, pass the original user message and required conversation context to the Orchestrator, receive the final response, send it through the installed Photon tool, then acknowledge the handoff. It does no substantive work and starts no second Spectrum client.
- **Orchestrator**: understand the request, maintain the conversation, decide whether to answer directly or delegate, coordinate Workers and return the final user-facing response to the iMessage Bot. It does not operate Photon directly.
- **Worker**: perform the assigned work and report to the Orchestrator. It never communicates with the iMessage user and never operates Photon.

Use short role prompts. Do not add biographies, elaborate personalities, recursive management layers, separate memory systems or one bot per feature. Start with one Worker; the Orchestrator may create more only when a task requires them. Capture any returned Grok bot identifiers privately and bind the Photon wake target to the iMessage Bot. Never ask the owner to understand, choose or paste an internal UUID.

The Photon runtime itself does not create or reason about Grok bots. It owns one internal wake target and transports durable work to that target. Bot creation and iMessage Bot ↔ Orchestrator ↔ Worker wiring remain setup-prompt responsibilities until a supported Grok creation API is verified and automated.

## Release-fix operating boundary

RFX-00 is integration owner for reviewed RFX-01 through RFX-11. Required interface/type, routing, resource authority, composition, imports, fixture, registry/schema and merge glue may cross historical lane ownership; log each exact file, affected lanes, reason and tests in docs/release-fix/integration-log.md. Return substantive feature defects to their owning lane. There is no RFX-12.

Preserve the registered rfx-00-integration worktree, codex/rfx-00-integration branch and exact base b83e3afd7049a991de6daffedf831165890f0901. Preserve original integration documentation. Never reset/recreate the checkout, rewrite immutable F0, mutate main, deploy, activate real Photon, send live messages or operate the real Grok VM from this task. Local isolated build/test environments use controlled external doubles only.

The deliverable is a tested clean-commit owner-local Linux x64 artifact, SHA-256, provenance and VM instructions. Install/run belongs on the Grok Bot cloud VM, not the user's Mac. Photon CLI retrieves private project secrets after existing-session verification or a real headless device-login URL/code. Grok remains the only reasoning/orchestration layer; the Photon host never reasons. The shallow three-role topology is an authorized setup contract, not a second messaging runtime.

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
