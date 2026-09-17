# RFX-01 shared inbound routing

Status: lane implementation verified by focused offline tests; package integration BLOCKED on RFX-00 migrations below. This branch is not independently buildable or production-ready until those migrations land. No legacy binding fallback is included.

## Identity and owned changes

- Repository: https://github.com/tecxbro/grokbotonimessage.git
- Registered worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-01-shared-routing`
- Branch: `codex/rfx-01-shared-routing`
- Exact starting/tested base: `b83e3afd7049a991de6daffedf831165890f0901`
- Implementation commit: pending local commit; a documentation-only follow-up will record its exact SHA.
- Preflight: clean staged/unstaged/untracked state; HEAD, primary main, origin/main and live remote main matched the base; no remote lane branch/upstream existed. Rechecked before commit; no pending deletions.
- The user's release-fix assignment overrides historical foundation-wave lane locations and documentation ownership in AGENTS.md. No foundation-tree, primary-checkout, package or lock changes.

Changed files:

1. `packages/photon-features/src/adapters/transport/provider-context.ts`: explicit `dedicated` and `servingPhone`; provider identity is `shared` for shared bindings and the exact serving phone for dedicated bindings. Constructor rejects duplicate provider identities/logical lines, missing mode, and missing/sentinel serving phones. Inbound requires exactly one match and a nonempty conversation ID, preserving project/account/logical-line scope. Outbound validates scope and returns `undefined` for shared or `{ phone: servingPhone }` for dedicated.
2. `packages/photon-features/src/adapters/transport/spectrum-owner.ts`: optional route on `OwnedSdk.space`; the same cloud provider calls `space.get(id)` for shared and `space.get(id, route)` for dedicated. Existing single-owner construction/start/stop behavior is retained.
3. `packages/photon-features/tests/integration/rfx-shared-routing.test.ts`: ten offline test cases below. Cloud factory module mocks run in a subprocess with Node's experimental module-mock flag; the standard test runner needs no new flags.
4. This task note.

`normalize.ts`, `receipt-observer.ts` and `message-events.ts` need no edits: they already preserve actual provider `space.phone`, use the same routing context, and keep foreign normalization failures unresolved with their cause. The focused tests exercise these unchanged paths. No group support changes.

## Source evidence

Retrieved 2026-09-17 UTC (2026-09-16 America/Los_Angeles), without credentials or live messaging:

- [Photon connection and routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing), also retrieved as official `.md`: Free/Pro shared pool, shared and dedicated DM delivery, dedicated-only group creation/inbound group changes, one shared identity and dedicated-only per-phone routing. Markdown SHA-256: `566a8ddbd1cf0dccdbcd3695c6e28c3cc4b100d97e606c0ee923ade339f24c47`.
- [Pinned Spectrum v12.8.0 iMessage package](https://github.com/photon-hq/spectrum-ts/tree/v12.8.0/packages/imessage); GitHub API resolved tag tree `938b0f86abbb998e2f36e5ef0f09b415e9913fd7`.
- [Pinned types.ts](https://github.com/photon-hq/spectrum-ts/blob/v12.8.0/packages/imessage/src/types.ts#L17): `export const SHARED_PHONE = "shared";`. Raw source SHA-256: `dddd0909969061edb1e648c35dca756840983433ffffbe03895765629c820c1b`. This constant is not a public package export; the adapter uses the verified literal and no private SDK API.
- Installed `spectrum-ts` and `@spectrum-ts/imessage` are 12.8.0. Installed iMessage `dist/index.js:255` defines the same sentinel; `:2898` makes shared `space.get` choose that identity without a phone pin. No version drift observed.

Retrieved source and test logs are ignored local artifacts under `.photon-local/rfx-01/` and are not needed to apply the commit.

## Validation and acceptance

Toolchain: Node 24.13.0, npm 10.9.2, TypeScript 5.9.3. Dependencies installed locally with `npm ci --ignore-scripts --no-audit --no-fund`; no package/lock changes.

Commands use this pinned wrapper: `npx --yes -p node@24.13.0 -p npm@10.9.2 -c '<command>'`.

- Baseline `npm run photon:build`: PASS before source changes.
- Red check against original implementation: new route-model tests reported 1 pass / 9 fail; TypeScript rejected the not-yet-implemented binding fields. This established the regression before implementation.
- Runtime test emission: `node node_modules/typescript/bin/tsc -p packages/photon-features/tsconfig.json --noEmitOnError false` emits JS but exits 2 with the 19 integration diagnostics listed below. This invocation is solely to execute the focused tests despite unowned caller migrations; it is NOT a passing build and does not alter tsconfig or weaken repository gates.
- Focused `node --test packages/photon-features/dist/tests/integration/rfx-shared-routing.test.js`: PASS, 10 tests, 0 failures, 0 skipped.
- Package `npm run typecheck --workspace=@grokbot/photon-features`: FAIL, exit 2, 19 diagnostics, all in unowned old binding constructors/route consumers listed below.
- Existing ingress regression command: `node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-02/*.test.js packages/photon-features/dist/tests/integration/repair-ingress.test.js packages/photon-features/dist/tests/integration/repair-production-journey.test.js packages/photon-features/dist/tests/integration/production-authority.test.js packages/photon-features/dist/tests/e2e/inbound-events.test.js packages/photon-features/dist/tests/security/webhook-auth.test.js`: FAIL, exit 1; runner reports 19 entries, 1 pass, 18 fail, 0 skipped. Several entries are test-file initialization failures, not individual executed assertions. Old constructors fail closed with `INVALID_LINE_MODE`; they were not rewritten outside lane ownership.
- Manual diff review and `git diff --check`: PASS. No live tests, provider credentials, messages, deployment, Photon activation, push, or Grok VM/Mac access.

Focused acceptance cases:

| Requirement | Evidence |
| --- | --- |
| Shared inbound text reaches accept | `shared inbound text...` asserts accepted text and exact project/account/logical-line/space IDs; raw phone remains `shared`. |
| Shared read receipt uses same scope | `shared read receipt...` checks receipt scope, reader/target identity and persistence before acceptance. |
| Shared outbound has no E.164 pin | Owner test sees `undefined`; cloud factory test sees exactly `space.get(conversationId)` with no second argument. |
| Dedicated inbound exact-match | Dedicated/multiple-line test distinguishes exact lines and accounts. |
| Dedicated outbound pins exact phone | Owner and cloud factory tests verify exact second argument. |
| Foreign E.164 rejected | Foreign/missing-phone test rejects ingress and receipts; shared serving E.164 is also rejected as provider identity. |
| Empty conversation rejected | Both inbound modes and outbound reject empty IDs. |
| Ambiguous shared bindings rejected | Two shared bindings with different serving numbers fail closed in either order; duplicate dedicated route also fails. |
| Valid shared DM not unresolved | Offline SDK Space passes snapshot/subscription path into accept; no `UNRESOLVED_ROUTE`. Finite fixture still reports its real `UNEXPECTED_STREAM_END` failure. |
| One owner/client | Concurrent starts construct one injected SDK; cloud mock constructs Spectrum once; repeated stop stops it once. |

Tested content SHA-256 (unchanged by the documentation follow-up):

- provider-context.ts: `8e1b099b817891f027fb9eec3f781f18a49878e27ba3e70d2088d0dbc46d9a2b`
- spectrum-owner.ts: `8797dc981b9712140dbbe0e75e0424bcb83d2daf03aeaf5111f488945d1c9361`
- rfx-shared-routing.test.ts: `adf7a591bcbe5364f0312fb428be620121d3d35b41854798e8381905fb829f04`

## Exact RFX-00 integration request

All paths below are relative to `packages/photon-features/`. They are not edited by RFX-01.

### Production composition (required)

In `src/host/production.ts`, replace the ProviderContext construction around base line 275 with:

```ts
const providerRoutes = new ProviderContext(configuration.provider.projectId, [{
  accountId: configuration.provider.accountId,
  lineId: configuration.provider.lineId, // retain the internal/durable logical ID
  dedicated: configuration.provider.dedicated,
  servingPhone: configuration.provider.phone, // keep the user-facing E.164
}]);
const providerRoutePhone = configuration.provider.dedicated
  ? configuration.provider.phone
  : "shared";
```

Use `providerRoutePhone` wherever this composition exposes a provider route phone to native guards: `mediaProvider` (base line 317), text `binding` (332), `HostTypingBinding` route (355), legacy media `bindings` (361), native dependency `binding` (406), and poll provider `binding` (436). Keep configuration/user-facing serving number as E.164. Do not replace logical line IDs, weaken native equality guards, or enable shared group creation/events.

### Other production consumers discovered during validation (required)

- `src/host/authority.ts:17-25`: migrate its separate ProviderContext construction to the same explicit fields; call `routes.inbound(providerRoutePhone, configuration.provider.conversationId)`, not the user-facing shared E.164. Preserve the resulting durable scope IDs and authority checks.
- `src/adapters/transport/native-state.ts:38`: replace unconditional `outbound(...).phone` access. Validate the actual narrowed message-space phone by resolving it through `owner.routes.inbound(actualPhone, target.conversationId)` and comparing the full resulting scope to `target.scope`; retain message ID/platform/conversation checks and existing error handling. Shared `undefined` is a lookup option, never the provider's actual phone identity.
- `src/host/typing-binding.ts:83,308`: replace unconditional `outbound(...).phone` reads. Validate `route.phone` through `routes.inbound(route.phone, route.conversationId)` and compare the full scope to the intended route/execution scope, retaining existing authorization and failure behavior. Pass `shared` in the production binding for shared mode.

RFX-00 must allocate these extra paths to the appropriate integration owner. There is no authorization for RFX-01 to edit them.

### Tests/fixtures and examples (required before package gates can pass)

Migrate old `{ accountId, lineId, phone }` constructor inputs to explicit mode/servingPhone in:

- `tests/lanes/wt-02/helpers.ts` (two bindings)
- `tests/integration/repair-ingress.test.ts`
- `tests/integration/repair-polls.test.ts` (two constructors)
- `tests/integration/typing-start-lifetime.test.ts`
- `tests/e2e/delivery-read.test.ts` (two constructors)
- `tests/e2e/inbound-events.test.ts`
- `tests/e2e/poll-restart.test.ts`
- `tests/e2e/single-ownership.test.ts`
- `tests/security/webhook-auth.test.ts`

Old fixtures that intentionally model an exact phone route should explicitly set `dedicated: true`; do not infer shared mode from arbitrary fixture strings. Preserve existing assertions. Adapt `tests/lanes/wt-02/sdk-contract.test.ts:59` and `tests/lanes/wt-02/transport.test.ts:44` to the optional route type without forcing a shared route to have a phone pin. Audit `examples/wt-02/compose.ts` callers supplying its imported `LineBinding[]` type. No owned assertions in `tests/lanes/wt-02/integration.test.ts` needed changes; its dependency on the unowned helpers blocks it instead.

After migration, run ordinary package build/typecheck, the focused test file, ingress regressions and the assembled integration gate. Only then can RFX-00 claim integrated shared routing. Local mocked/offline SDK evidence here is not provider delivery or device observation.
