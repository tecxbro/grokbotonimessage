# grok-bot-cli

[![npm version](https://img.shields.io/npm/v/grok-bot-cli.svg)](https://www.npmjs.com/package/grok-bot-cli)

Manage [Grok Bot](https://cursor.com/help/grok-bot/plans) agents, groups, and messages from your terminal.

![Live create, group, send, and delete smoke test](https://raw.githubusercontent.com/tecxbro/grokbotonimessage/main/demo/grok-bot-cli-demo.gif)

[Watch the MP4](https://github.com/tecxbro/grokbotonimessage/blob/main/demo/grok-bot-cli-demo.mp4)

## Install

```sh
npm install --global grok-bot-cli
```

Requires Node.js 18+ and the Grok Bot macOS app. Open Grok Bot and sign in once; `gbot` automatically uses the app's encrypted session and routing credentials. No token copying is required.

## Use

```sh
gbot bots list
gbot bots create --name Researcher
gbot bots update Researcher --description "Research the launch" --notify on
gbot bots create --name Writer
gbot groups create --name Launch --member Researcher --member Writer --description "Ship together"
gbot groups update Launch --title "Launch room" --hidden off
gbot send Researcher "Summarize the launch status."
gbot send Launch "Share your updates."
gbot thread Researcher
gbot groups delete Launch
gbot bots delete Researcher
gbot bots delete Writer
```

`update` fields: `--name` `--description`/`--instructions` `--title` `--avatar-shape` `--avatar-color` `--notify` `--hidden`. `--description` is the UI Instructions field.

Run `gbot --help` for every command.

## Gateway URL policy

By default `gbot` only sends credentials to `https` URLs on `*.cursor.sh` / `*.cursor.com` / `*.cursorvm.com`.

- `GROK_BOT_ALLOW_LOCAL_GATEWAY=1` — permit `http(s)://127.0.0.1`, `localhost`, and `::1` (local/dev gateways).
- `GROK_BOT_ALLOW_ANY_GATEWAY=1` — disable host checks (unsafe; for break-glass only).

All gateway / `EnsureSandBox` fetches use `redirect: "error"` so credentials are not followed across redirects.

## License

MIT


## Photon Feature Runtime foundation

The additional npm workspace `packages/photon-features` defines a deterministic local messaging program for the existing Grok orchestrator. The original `gbot` and `grok-bot` commands above are preserved. F0 freezes contracts and checks; it does not activate messaging.

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

Public library entry: `createRuntimeHost()` from the package root. New feature authors import `FeatureModule` from `@grokbot/photon-features/feature` and `ExecutionServices` from `@grokbot/photon-features/services`. The root's historical type names remain compatible with inherited lane consumers; the new explicit root aliases are `FoundationFeatureModule` and `FoundationExecutionServices`. No host starts at import or construction time.

Directory map: `src/` remains the original CLI; `packages/photon-features/src/contracts/` holds wire and execution contracts; `docs/contracts/` describes invariants; `docs/worktrees/` freezes ownership and acceptance; `docs/photon/reference/` contains verified official source snapshots. See [architecture](ARCHITECTURE.md), [baseline](docs/photon-features/baseline.md), [execution](docs/contracts/execution.md), [receipts](docs/contracts/receipts.md), [operations](docs/contracts/operations.md), and [WT-00 handoff](docs/worktrees/wt-00/HANDOFF.md).

Built/tested code, integration, installation/activation and physical-device delivery are separate evidence tiers. Inherited feature implementations require adaptation to the public service seam before production registration. No live messages or production credentials are used by F0 checks.
