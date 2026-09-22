# Grok Bot on iMessage, through Photon

**Branch: `improving-friends-bot`.** A new bot can install the supplied runtime,
connect Photon, bind its own native wake routine, and use the existing feature code.
No Grok gateway executable, bot roster, replacement agent, or transcript polling is
required by this setup profile.

## Start from scratch

**Read [Fresh setup](packages/photon-features/scratch-setup/README.md) first.**
It contains the actual installer, Photon login/account steps, private webhook
binding, process supervision, commands and live verification checklist.

The bot installs this code on **its cloud VM**, not the owner's Mac:

```text
iMessage → Photon hosted line → one persistent Spectrum runtime
        → durable batch → native Grok webhook {batchId}
        → bot reads batch and submits explicit feature operations
        → same Spectrum runtime sends the response
```

The Spectrum process keeps listening after the bot's current turn ends. The
supervisor restarts an unexpectedly exited or unresponsive child while the VM is
running. A separate user-service installation is available when the host supports
it. Neither mechanism can execute while the entire VM is suspended.

Give the bot this repository and: **“Connect me to iMessage. Start with the fresh
setup linked in README.md.”** It uses finished code; it should not implement an
adapter, choose an internal bot ID, or rewrite the integration.

Authentication and enrollment still require real account access and the intended
sender's details. Grok must create/reuse its actual native routine through its
available tools. The code accepts that routine's private URL/key; it does not
invent an undocumented routine-registration API or bypass platform approvals.

## Already connected: feature-only use remains available

Keep the working connection unchanged and use the separate
[feature skill](packages/photon-features/features-only/SKILL.md),
[44-operation catalog](packages/photon-features/features-only/CATALOG.md), and
[neutral library](packages/photon-features/features-only/LIBRARY.md).
Those instructions remain about Photon features, not personality or delegation.
The fresh setup now supplies the actual authenticated executor binding that the
neutral client requires; an unrelated existing runtime still needs its own adapter.

All 44 operation contracts and feature modules remain. Availability is conditional:
normal shared messaging does not require a dedicated line; some native operations
require one, configured cards require their actual templates/backend, four native
poll-management bindings retain their existing limitation, and cold card/reaction
recovery is not upgraded by this setup change. Inspect `capabilities`, not a count
of catalog entries, before promising an effect.

## Evidence and development

See [review and tests](packages/photon-features/scratch-setup/REVIEW.md) and
[sources](packages/photon-features/scratch-setup/SOURCES.md).
The inherited `CONNECT.md` and the older full-host `SKILL.md` describe the gateway
profile. They are not the fresh webhook routine's instructions. Use the fresh
profile's `ROUTINE.md` plus the neutral feature skill instead.

With Node 24.13.0 and npm 10.9.2:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run photon:build
node --test packages/photon-features/tests/integration/scratch-profile.test.mjs
npm run photon:check
npm run photon:test
npm run photon:test:integration
npm run photon:test:installed
```

Offline checks never authorize a live send. Installation, native wake acceptance,
provider acceptance, device rendering and overnight availability are separate
states. See the fresh setup checklist before declaring a live installation done.
