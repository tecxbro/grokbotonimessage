# Grok Photon feature package

WT-08 implements the local CLI, persistent operating skill, schema-validated examples and inactive distribution tooling on the F0 foundation. Runtime composition and package/bin registration belong to WT-00. This checkout is not an assembled release.

Read [SKILL.md](SKILL.md) for the operator contract and all 44 registry-derived action examples. Read [INSTALL.md](INSTALL.md) for staging, activation prerequisites and rollback. The `grok-photon` commands belong to this package; they are separate from the Photon account-management CLI.

From the repository root with Node **24.13.0** and npm **10.9.2** on PATH:

```sh
npm run photon:build
node packages/photon-features/scripts/generate-skill.mjs --check
node --test packages/photon-features/dist/tests/lanes/wt-08/*.test.js
node --test packages/photon-features/tests/lanes/wt-08/distribution.test.mjs
node packages/photon-features/scripts/smoke-test.mjs
npm test
npm run photon:check
```

While other lanes are under construction, the focused compile command is:

```sh
node packages/photon-features/node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-08/tsconfig.json
```

The package-local TypeScript is the F0-pinned 5.9.3. A focused compile proves only WT-08 and its imported foundation seams. Distribution tests use synthetic archives and temporary SQLite state. They do not package or activate the feature runtime.

Until WT-00 registers the package bin, invoke the built CLI directly:

```sh
node packages/photon-features/dist/src/cli/main.js doctor --json
```

The task launcher must supply `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET` and `GROK_PHOTON_CREDENTIAL_FILE`. Missing configuration produces a machine-readable failure. Ordinary smoke tests intentionally clear these variables and make no socket or provider calls.

To regenerate the persistent manual's operation table and examples after an approved registry/schema change:

```sh
node packages/photon-features/scripts/generate-skill.mjs
```

Generation preserves handwritten operating instructions and fuller voice guidance outside its marked table. It uses registry entries, shared parsers and committed fixture examples; it contains no second action schema. `--check` rejects table, example or inventory drift.
