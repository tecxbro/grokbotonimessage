# RFX-07 — Capability truth

## Identity and scope

- Exact base and tested starting HEAD: `b83e3afd7049a991de6daffedf831165890f0901`.
- Registered worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-07-capability-truth`.
- Branch: `codex/rfx-07-capability-truth`.
- Origin: `https://github.com/tecxbro/grokbotonimessage.git`.
- Initial main, origin/main and remote main matched the base; lane had no upstream, no remote branch, and a clean index/worktree. Registration, branch and HEAD were rechecked before commit. No deletions.
- Only the five assigned implementation/test/generated files and this note changed. No feature handler, production.ts, public schema, lockfile, main checkout, historical foundation tree, or other lane was edited.
- No push, deployment, Photon activation, live send, or Grok VM/Mac action occurred.

## Files and behavior

| File | Change |
| --- | --- |
| `packages/photon-features/src/host/capabilities.ts` | Pure snapshot evaluator; only execution constraints remain in blockers. Matching declaration, handler registration, grants, owner, route mode/readiness, media, streams, cards, poll management and request-resource facts remain separate. Missing host bindings never change providerSupport to unsupported. |
| `packages/photon-features/src/host/configuration-inventory.ts` | Shared/dedicated account prerequisites and action-aware card checks; poll management is conditional on the actual binding. Static URL sends do not require live-extension evidence. Callback availability does not prohibit sending a card. |
| `packages/photon-features/scripts/generate-production-inventory.mjs` | Generates source prerequisites, conditional blockers and explicit unevaluated readiness instead of an enabled count or unconditional upstream release conclusion. |
| `packages/photon-features/examples/production-inventory.json` | Regenerated version 2 inventory for all 44 operations. |
| `packages/photon-features/tests/integration/rfx-capability-truth.test.ts` | Fifteen non-live regressions, including strict existing Capability schema parsing and forbidden network operations. |

Unknown legacy blocker text remains blocking. Known historical integration declarations are replaced by actual dependency checks; verification caveats and delivery semantics become notes. Poll creation does not require management or inbound-answer verification. Shared group creation is blocked with `Shared Free/Pro iMessage mode does not support group creation; a dedicated line is required.` A concrete single-member creation request does not inherit that group prerequisite. Other group-handler restrictions are explicitly labeled host-handler restrictions, not a broader claim about Photon.

## Structured state without changing the public schema

The existing `evidence.reference` field contains JSON objects tagged `capability-state/v1` and `capability-note/v1`. These use the only applicable existing `sdk-contract` tier; they are **host inventory evaluations, not SDK test runs or live evidence**. The state also carries `basis: host-inventory`. Generic consumers must not count these annotations as executed tests.

State fields: `implemented`, `handlerRegistered`, `configured`, `granted`, `runtimeReady`, `providerAccepted`, `deviceObserved`, `liveVerified`, `routeMode`, `routeReady`, `inboundGroupEvents`, `requestResources`. The last three verification booleans require separate explicit operation-scoped live observation records, matching the SDK version and not dated after evaluation. A generic old live-tier reference is preserved but does not automatically set any verification stage.

For backward compatibility, the existing availability fields describe the operation path's known execution constraints. `runtimeReady` is stricter: it also requires affirmative actual-route readiness and, for actions carrying resource references, an authoritative resource snapshot. Missing route/resource snapshots produce explicit unknown/unchecked state and notes, not invented resource absence. With no action, requestResources is `not-evaluated`; operation-level readiness never guarantees an arbitrary future request. Actual execution still resolves resources and enforces claim/authorization fences.

## Required RFX-00 integration

1. In the `productionCapability` inventory built by `packages/photon-features/src/host/production.ts`, supply `routeMode` from the actual resolved shared/dedicated owner route, `routeReady` from the actual route binding, and `conversationType` where known. Do not substitute an E.164 configuration phone for a shared route. The legacy call site can communicate shared mode via `configurationBlockers`, but dedicated mode remains unknown until wired explicitly.
2. Supply `pollManagement: pollManagementAvailable`, `cardTemplates: configuration.cards`, and `cardBackendReady` from the actual initialized URL/backend binding. Pass the same dependency snapshot to `configurationBlockers(configuration, dependencies, action)` so stale coarse per-operation blockers cannot survive a valid action-specific hook. The existing explicit empty poll-management blocker arrays remain recognized for compatibility with the current production call site. A true hook never overrides an unrelated blocker or an unimplemented declaration.
3. For `app.update`, supply `cardUpdateReady` **only after checking the exact requested original SDK session and admitted revision**. The evaluator now retains the existing concrete session/revision blocker until this fact is true. Never set this globally from template presence or a checkpoint. The existing production card-update regression currently fails because this hook is absent. Use the RFX-09 session/backend result; do not reconstruct or invent an SDK session.
4. Populate `requestResources` with complete local authoritative lookup outcomes for the current action: `{ reference: ResourceRef, available: boolean, reason?: string }[]`. Match full scoped resource identity, including parent IDs. An absent or negative entry in a supplied snapshot is a request-resource blocker, not Photon unsupported. The evaluator never invokes provider lookups or sends. Keep execution-time authoritative checks; a snapshot is not an authorization token and can become stale.
5. Optionally supply `verification[operation]` containing independent `providerAccepted`, `deviceObserved`, and `liveVerified` evidence records. These must refer to actual scoped observations, never fixtures, handler registration, startup success, or another operation. RFX-07 tests use explicitly labeled fixtures only.
6. Update capability/status consumers to display separate state stages and notes. Do not report a conversation-availability count as live verification. For a future shared-schema amendment, add `verification: { implemented: boolean, configured: boolean, runtimeReady: boolean, providerAccepted: boolean, deviceObserved: boolean, liveVerified: boolean }` and `notes: string[]`, plus `dependencyState: { routeMode: shared | dedicated | unknown, routeReady: boolean | unknown, requestResources: not-evaluated | unchecked | checked }`. Keep blockers execution-only and actual observations in evidence; retire the tagged-reference compatibility encoding after consumers migrate. RFX-07 does not modify frozen contracts.
7. Update the old assertions in `tests/integration/production-capabilities.test.ts` and `tests/integration/repair-ingress.test.ts` to check verification notes/state instead of requiring informational blockers or an empty evidence array. Preserve their behavioral assertions. Add production-composition coverage for the newly wired snapshot hooks in the integration lane.
8. Register the exact RFX-07 paths in the release-wave ownership assignment and regenerate the assembled-candidate digest after assembly. Do not rewrite the historical foundation manifest. Existing checker failures are recorded below, not bypassed.

## Acceptance evidence

All required cases are covered in `rfx-capability-truth.test.ts`:

| Required case | Local evidence |
| --- | --- |
| Shared text route has no account blocker | Shared-route test: available, no blockers, runtime-ready true, all live stages false. |
| Shared group creation unavailable with exact reason | Exact blocker equality; separate single-member DM positive case and configuration-report checks. |
| Dedicated group creation may be available | Dedicated positive case; unknown mode negative case. |
| Missing poll binding blocks management only | Four management negative/positive cases, creation/text unaffected, stale release blocker removed only with a true binding. |
| Static card does not inherit live-extension blocker | Static universal URL with no extension/backend succeeds; customized/live/backend missing prerequisites fail separately. |
| Not-live-verified does not prohibit execution | Notes survive schema parsing and blockers stay empty; an unknown real dependency blocker still prohibits execution. |
| Media composition vs text-only | Nested voice/media composition blocks without media; plain text does not. |
| Missing request resource is not unsupported | Explicit missing/cross-scope resources block; providerSupport stays native; valid snapshot succeeds. |
| No network sends during evaluation | `fetch` and `Socket.connect` throw if called; all 44 operations and configuration inventory evaluated with zero calls. |

Extra regressions cover card update session/revision/backend hooks, independent callback enrollment, explicit permission/owner/route/stream failures, independent live-stage evidence, and generated inventory truth.

## Sources and installed contract

Official Markdown fetched on 2026-09-17 UTC. Status 200, final URL identity, `text/markdown`, expected title, body and SHA-256 verified. Local ignored snapshots and retrieval metadata: `.photon-local/rfx-07/{routing,app,polls}.md` and `sources.json`. Firecrawl was unavailable; direct official Markdown retrieval succeeded with a browser user agent after an initial HTTP 403. The HTML documentation was also inspected.

| Official source | SHA-256 |
| --- | --- |
| [Connection/routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing.md) | `566a8ddbd1cf0dccdbcd3695c6e28c3cc4b100d97e606c0ee923ade339f24c47` |
| [App content](https://photon.codes/docs/spectrum-ts/content/app.md) | `81ae485a85373813cb78b50de592144527a5ddad80c0252e338e8aa01bdb4a11` |
| [Poll content](https://photon.codes/docs/spectrum-ts/content/polls.md) | `e57ffa8265660ccbe175e92f46862af905e9129a10be598c0cc851d6643a61b9` |

Installed `spectrum-ts` and `@spectrum-ts/imessage` both verified at 12.8.0. No SDK dependency update. These docs distinguish provider group support, URL-only static cards, live rendering, and poll creation/answer content; they do not establish a missing host management binding.

## Checks and commit

Toolchain: Node 24.13.0 / npm 10.9.2; isolated `npm ci --ignore-scripts` with unchanged lockfiles. Commands run through `npx --yes -p node@24.13.0 -p npm@10.9.2 -c '...'`.

Final verification and exact implementation commit are recorded below after execution.

- PASS: `npm run photon:build` and `npm run typecheck --workspace=@grokbot/photon-features`.
- PASS: `node --test packages/photon-features/dist/tests/integration/rfx-capability-truth.test.js`: **15/15**, zero failures/skips. All cases parse the unchanged strict Capability schema.
- PASS: `node packages/photon-features/scripts/generate-production-inventory.mjs --check`: 44 operations, exact generated artifact match.
- Regression sensitivity: the final 15-test file run against a separately transpiled baseline capability evaluator fails **12 cases**, passes 3. Temporary baseline files were removed; maintained sources were never reverted. This is a sensitivity experiment, not a passing baseline suite.
- Full non-live regression: `node scripts/run-integration-tests.mjs`: **871 tests, 867 pass, 4 fail, 0 skipped**. Not integration-green. Failing cases:
  - `production-capabilities.test.ts`: informational runtime-readiness text expected in blockers.
  - `production-capabilities.test.ts`: evidence expected to equal an empty array.
  - `repair-ingress.test.ts`: typing evidence expected to equal an empty array.
  - `repair-cards.test.ts`: original-session/revision dependency is now enforced; the untouched production caller lacks `cardUpdateReady`, so its first update is blocked instead of executor-completed. The new hook regression proves valid session/revision/backend snapshots allow updates; coordinator wiring is required.
- PASS: `node scripts/verify-docs.mjs integration`: structural/source checks (15 sources, 9 lanes).
- BLOCKED: `node scripts/verify-ownership.mjs integration`: `UNOWNED_PATH:docs/release-fix/RFX-07.md`. Historical shared ownership lacks the user-authorized release-wave assignment. Exact assignment audit separately passed for all six paths and zero deletions; this is not a substitute for coordinator-owned manifest repair.
- BLOCKED: `npm run photon:check` and final `node scripts/generate-contracts.mjs --check --target assembled-candidate`: `CONTRACT_DIGEST_DRIFT`. Coordinator must regenerate the assembled candidate after source integration. Historical F0 untouched.
- PASS: `git diff --check`, exact six-path scope audit, no staged surprises or deletions, assigned branch/base/registration/origin audit; final remote main remains the exact base and no remote RFX-07 branch exists.
- No installed-artifact, hosted CI, provider-delivery, device-observation, or live verification claim. Full-suite failures above remain real blockers to integrated release acceptance.

Ignored detailed logs: `.photon-local/rfx-07/final-focused.log`, `final-integration.log`, `final-baseline.log`, `final-contract.log`, `ownership.log`, `docs.log`. The implementation content below was built and tested before commit:

- `packages/photon-features/examples/production-inventory.json`: SHA-256 `c1b005f4745f894c223f53bf3858c75382f44f00484a309f07e468a513d250bf`.
- `packages/photon-features/scripts/generate-production-inventory.mjs`: SHA-256 `5c1cb053dceacde21e7df0d6e12add28db435a32a3e967b45ab9a578cedbc4f6`.
- `packages/photon-features/src/host/capabilities.ts`: SHA-256 `5496259055478d0a0a01299af02a6b2a655946ce8c92af0fe9104af2f941c546`.
- `packages/photon-features/src/host/configuration-inventory.ts`: SHA-256 `56a39c8bc3d87a8d32e1a51df23340fcdd39585f727b4a953382007b217ef891`.
- `packages/photon-features/tests/integration/rfx-capability-truth.test.ts`: SHA-256 `75689087b2c8016ac7b16b217e41308eb6b1db258a8c8762179b4744477e63a8`.

Implementation commit: `8f51e364acb5cb9f35736da263a31b2e4372a630`. All five implementation/test/generated file hashes match the tested content above. The subsequent documentation-only commit records this exact existing SHA; it makes no implementation changes.
