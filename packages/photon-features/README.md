> **Fresh Grok setup:** [scratch-setup/README.md](scratch-setup/README.md).
> **Existing integration, feature usage only:** [features-only/SKILL.md](features-only/SKILL.md).
> The historical full-host instructions below are not the native-webhook setup entry point.

# Grok Photon features

A release-pinned authenticated local executable and operating skill for the
existing Grok orchestrator. Normal startup supplies one Spectrum messaging
owner, durable SQLite inbox/outbox, typing, scoped media, progressive text
producer, and the configured application-owned card backend.

Install on the **Grok Bot cloud VM, not the user's Mac**. [INSTALL.md](INSTALL.md) links the current [deployment runbook](DEPLOYMENT.md); [SKILL.md](SKILL.md) governs real authorized incoming work after activation. First-time setup reuses authenticated Photon CLI state or surfaces a real headless verification URL/code, discovers the live Grok target, and generates owner configuration without pasted project secrets or permission profiles. Shared routing uses "shared" and an exact durable conversation grant.

[The operation inventory](examples/production-inventory.json) distinguishes handlers, provider support, runtime prerequisites and evidence. Static cards need no custom extension; original card/reaction cold recovery is conditional. Native poll management stays blocked in default cloud composition until an authoritative public connection bridge is available. Authority currently expires after 24 hours; no automatic seamless renewal is promised. See the runbook for exact blockers and owner transitions.

From the repository root with Node 24.13.0 and npm 10.9.2:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck --workspace=@grokbot/photon-features
npm test
npm run photon:test
npm run photon:check
npm run photon:test:integration
npm run photon:test:installed
node packages/photon-features/scripts/generate-skill.mjs --check
node packages/photon-features/scripts/generate-configuration.mjs --check
node packages/photon-features/scripts/generate-production-inventory.mjs --check
node packages/photon-features/scripts/prepare-npm-lock.mjs --check
npm pack --workspace=@grokbot/photon-features --dry-run --json --ignore-scripts
```

Run generation without --check only when intentionally updating the corresponding
candidate schemas/profile/inventory. prepare-npm-lock.mjs is a source-checkout
release-maintenance command. The archive includes standalone pinned shrinkwrap,
compiled runtime, bin launchers, schemas, migrations, backend/browser producer,
profiles and operating instructions. Installed tests exercise actual SDK adapters
with controlled external boundaries, without source files or development-only
runtime dependencies. Owner-local-tested packaging requires a clean commit and complete actual checks; published-approved mode additionally requires approval/workflow evidence. No production or live/device claim follows from these
checks.
