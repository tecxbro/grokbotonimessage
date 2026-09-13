# Grok Photon features

A release-pinned authenticated local executable and operating skill for the
existing Grok orchestrator. Normal startup supplies one Spectrum messaging
owner, durable SQLite inbox/outbox, typing, scoped media, progressive text
producer, and the configured application-owned card backend.

Use [DEPLOYMENT.md](DEPLOYMENT.md) for owner setup and lifecycle;
[SKILL.md](SKILL.md) for operating authorized tasks. The complete
[44-operation inventory](examples/production-inventory.json) records handlers,
SDK calls, construction, prerequisites and separate evidence tiers. Generated
[profiles](examples/profiles/messaging.json) require explicit owner permission
selection and enable no operations by default.

Native poll management (four operations), cold original-card update-session
restoration and cold reaction-handle restoration remain upstream public-SDK
release blockers in Spectrum 12.8.0.
Poll creation/conversational answers and repeated original-card updates in the
owning process are separate supported paths. Do not hand off an unfinished
capability as implementation work for Grok.

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
runtime dependencies. Approved packaging still requires clean-commit and actual
approval/workflow evidence. No production or live/device claim follows from these
checks.
