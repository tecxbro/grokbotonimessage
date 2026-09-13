# Integration acceptance

## Current completion acceptance — 2026-09-13

Handoff is blocked. Application-owned production seams are implemented; the full
requested product cannot be declared code complete while the upstream public SDK
gaps below remain. Historical acceptance sections are checkpoints, not current
release approval.

| Requirement | Current acceptance and evidence boundary |
| --- | --- |
| Unchanged operation surface | All 44 rows in `../../../packages/photon-features/examples/production-inventory.json`; handler, implementation, actual SDK call, dependencies, startup, authorization, resources, launcher and four evidence tiers recorded |
| Text receive/claim/reply/ack | Actual installed launcher/socket/SQLite/production owner/SDK against controlled transport; repeated acknowledgement and durable claim/heartbeat exercised |
| Typing | Completion, overlap, cancellation, lease expiry and shutdown; existing typing-lifetime regressions retained |
| Poll create/human answer | Actual installed SDK creates two polls including duplicate labels; incoming native vote/unvote becomes conversational work; existing poll-answer journey suite retained |
| Native poll get/vote/unvote/addOption | OPEN upstream blocker: public Spectrum owner has no poll-management API; injected PollManagement tests are not production completion |
| Media and voice | Actual installed import, attachment send/fetch and voice send; guarded real temporary resources and transport doubles only |
| Progressive text | Installed producer path, first send before source close, same GUID edits, final content, abort/stall/cancellation/expiry/provider failure, duplicate consumption, bounds, restart and explicit buffered fallback |
| Card updates | Actual installed universal and customized adapters update original message repeatedly and refresh provider metadata; cold restoration intentionally blocks without a replacement bubble |
| Card interactions | Shipped browser signer + real WebCrypto; actual HTTP backend + Ed25519 authentication; tamper/replay/expiry/participant/scope/transaction/restart and old-generation rejection |
| Authority | Owner-only inspect/apply; renewal/replacement/CAS/revocation checks; preserve queued/unknown state; installed denied ordinary credential, restart and old launcher/callback fencing |
| Configuration | Generated minimal/messaging/administrative profiles require explicit owner grants; exact missing dependencies reported; no JavaScript/module/executable configuration |
| Archive | Actual npm archive fresh/repeated production-only installs and installed runtime journeys; approved `.gpf.gz` release, target installation and compatible actual approved-archive rollback remain pending |
| Live device | No live external messages authorized or sent; all live/provider/device checks explicitly pending |

Source/component, production offline, archive, target and live evidence must not be
collapsed into a single green state. See `TEST-EVIDENCE.md` for commands, failures,
skips and artifact checksums, and `HANDOFF.md` for the current gate.

## All 44 operation evidence rows

This summary derives from the complete generated JSON inventory. No row is removed for missing upstream support. Dedicated installed evidence is narrower than registry or lane coverage.

| Operation | Offline evidence | Open production limitation |
| --- | --- | --- |
| typing.begin | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| typing.end | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| text.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| text.stream | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| markdown.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| link.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| content.group | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| content.compose | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| message.get | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| message.reply | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| message.react | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| reaction.remove | Installed actual adapter / controlled transport | Warm owner SDK cache supplies the real reaction handle. After cold lookup Spectrum retains reactionRecord metadata but rebuilds text content; native reaction removal requires a real reaction content handle. No cast or re-send is permitted. |
| message.edit | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| message.unsend | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| message.markRead | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| attachment.send | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| attachment.fetch | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| voice.send | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| contact.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| poll.create | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| poll.get | Injected interface only; production blocked | spectrum-ts/providers/imessage public PlatformInstance exposes no polls or client; latest registry version remains 12.8.0. Optional tests inject PollManagement, normal startup cannot construct it. |
| poll.vote | Injected interface only; production blocked | spectrum-ts/providers/imessage public PlatformInstance exposes no polls or client; latest registry version remains 12.8.0. Optional tests inject PollManagement, normal startup cannot construct it. |
| poll.unvote | Injected interface only; production blocked | spectrum-ts/providers/imessage public PlatformInstance exposes no polls or client; latest registry version remains 12.8.0. Optional tests inject PollManagement, normal startup cannot construct it. |
| poll.addOption | Injected interface only; production blocked | spectrum-ts/providers/imessage public PlatformInstance exposes no polls or client; latest registry version remains 12.8.0. Optional tests inject PollManagement, normal startup cannot construct it. |
| app.send | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| app.sendCustomized | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| app.update | Installed actual adapter / controlled transport | Cold original-card SDK session restoration unavailable. Checkpoints restore callback state only; update after restart blocks without a replacement bubble. |
| space.get | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.create | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| space.getName | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.rename | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.getMembers | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.addMembers | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.removeMembers | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.leave | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.getAvatar | Installed actual adapter / controlled transport | No application wiring blocker found; actual configured account and live evidence pending |
| space.setAvatar | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.clearAvatar | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.setBackground | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| space.clearBackground | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| account.shareContact | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| effect.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| metadata.get | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |
| custom.send | Lane/composition evidence; no dedicated installed journey | No application wiring blocker found; actual configured account and live evidence pending |

## Historical checkpoints before this completion pass

The following records are retained for provenance. Current behavior and gates are stated above.

1. **PASS — identity:** registered worktree, branch, exact F0, reflog, remote,
   and pre-existing state are recorded.
2. **PASS — reviewed inputs:** every included commit is immutable,
   F0-descended, reviewed, and included once.
3. **PASS — assembled local text:** authenticated IPC, durable SQLite,
   executor, `executeChild`, and offline Spectrum acceptance form one tested path.
4. **PASS — surface:** the actual lane factories register all 44 operations and
   all 12 compiler families, fail closed on omissions, and preserve capability
   semantics.
5. **PASS — ownership model:** one injected provider owner supplies ingress,
   receipts, scoped native access, lifecycle, and shutdown boundaries.
6. **PASS — inbound durability:** webhook ingress verifies raw-body HMAC and
   freshness before parsing and durably captures before acknowledgment.
7. **PASS — recovery:** local tests cover claims, cancellation, idempotency,
   multipart recovery, restart races, and reconcile-first unknown outcomes.
8. **PASS WITH EXTERNAL FOLLOW-UP:** local tests cover media retention, one
   poll continuation, and durable card callback state. Authoritative retention
   cleanup remains disabled, and extension/backend/device card behavior is not
   proven here.
9. **PASS LOCALLY; RELEASE AUTHORIZATION PENDING — distribution:** the real
   `packageCandidate` collector built a complete archive from a clean ephemeral
   candidate, including the checksummed F0 migration. The archive installed
   outside the checkout and its installed code opened/closed/reopened a real
   `DurableSQLiteStore`. Synthetic inactive reinstall/rollback tests continue
   to preserve state. The approval used for local acceptance was test scaffolding;
   no production-approved artifact was published or activated.
10. **PASS — actual candidate gates:** Node 24.13.0/npm 10.9.2 component
    verification runs 788 non-live tests across 82 files with zero failures or
    skips, plus schema, ownership, docs, generated-skill, real offline
    installer/rollback/distribution fixtures, and package dry-run checks.
11. **PASS LOCALLY — concrete startup:** development, deployment, and operating
    instructions have distinct roles. The release owns strict configuration,
    validate/enable/run/disable commands, single-owner recovery-first lifecycle,
    release-pinned task launcher, and an exact systemd start/stop procedure.
    Approval-bound artifact identity, installation, and activation remain pending.
12. **PASS — evidence separation:** built and locally integrated are proven;
    installed, activated, provider accepted/delivered/read, rendered, interacted,
    and physical-device verified remain independently unproven.
13. **PASS — operating skill accuracy:** every generated handler implementation
    row agrees with the actual assembled public registry; provider support,
    account/conversation availability, and live verification remain separate.
14. **PASS — request/test distinction:** development instructions prohibit
    unsolicited test sends, while the operating skill handles a real incoming
    request only in its originating conversation and authorized context.
15. **PASS LOCALLY, EXTERNAL PROOF PENDING — skill and task binding:** the host
    uses the existing `gbot --gateway send` path with a fixed pointer-only prompt;
    the release launcher verifies skill/release/task generation and injects the
    three local client bindings. A controlled external Grok task must still prove
    gateway acceptance, skill load, and durable claim for an activated deployment.
16. **PASS — conversation-scoped ordering:** unresolved `queued`, `blocked`, and
    `unknown-outcome` predecessors still fence later work in the same conversation;
    independent conversations on the same line proceed, while `space.create`
    retains a separate line-scoped creation dependency. Rate limiting is unchanged.
17. **PASS — restart-safe authority:** fresh authority bootstraps atomically;
    existing cancelled, revoked, expired, narrowed, generation-mismatched,
    conflicting, or partial bindings fail closed without rewriting evidence,
    constructing Spectrum, or waking Grok. No reauthorization command was added.
18. **PASS OFFLINE — production resources:** native attachment retrieval,
    trusted generated-file import, outbound attachment/voice, composed media,
    and registered streams use real request-fenced production bindings. Stream
    delivery remains bounded buffered fallback, and a lost restart source is
    reported honestly.
19. **PASS LOCALLY; REMOTE MATRIX PENDING — portability:** macOS passed the
    exact component and assembled suite. The committed fail-fast-disabled Linux/
    macOS workflow defines the required checks, but neither its remote execution
    nor branch-protection enforcement was authorized or observed here.

## fix-1 repair preparation acceptance (2026-09-11)

- RP-1: Missing capability declaration is unavailable even with a registered handler; partial and missing configuration stay distinct.
- RP-2: media.import rejects paths/extra authority, resolves the socket principal's context, delegates to the existing importer, and yields a durable staged descriptor without a message send.
- RP-3: app.update captures an authorized settled revision at admission; replay/reopen preserve it, its service snapshot is immutable, and odd revisions/expired sessions cannot enqueue.
- RP-4: Trusted incoming registration grants only captured message/attachment references within the active owner/task/generation, validates parents, preserves replay and rejects conflicting identities transactionally.
- RP-5: Native poll correlation requires exact durable IDs and original owner; duplicate labels, unknown IDs and stale generations never select an option/task.
- RP-6: Installed public SDK probes distinguish builders/getAttachment from absent poll-management/native-vote fields without initializing any SDK client.
- RP-7: The tested preparation is committed; five isolated workers start at that immutable commit and receive complete exact-scope prompts. Worktree creation alone does not mean workers ran.

These preparation cases do not close every assigned feature failure. Final coordinator acceptance still requires a complete production incoming-message journey through durable work and authorized execution. Actual Grok processing, activation, external provider delivery/read, extension rendering/interactions and physical-device behavior remain separately unverified.

## fix-1 A-E repair integration acceptance (2026-09-11)

The coordinator merged A-E exactly once, connected their production seams, and
ran the source-derived non-live runner. “Closed locally” below means compiled and
automatically verified with offline provider/Grok doubles; it is not provider or
device evidence.

| Problem | Result | Production files/symbols | Regression and exact focused command | Production dependency / live status |
| --- | --- | --- | --- | --- |
| 1 | Closed locally | `runtime/typing/operations.ts`; `createTypingModule` declarations consumed by assembly | `node --test packages/photon-features/dist/tests/lanes/wt-02/*.test.js packages/photon-features/dist/tests/integration/repair-ingress.test.js` | Shared owner binding is configured; device-visible typing not verified. |
| 2 | Closed locally | `normalize.incomingReferenceBindings`; `production.registerReferences`; `registerIncomingReferences` | Same WT-02 command plus `repair-production-journey.test.js` | Authenticated live/replay capture supplies IDs; offline only. |
| 3 | Conditional seam wired; externally incomplete | `createPollCorrelations`; `routePollEvent`; `ProductionCompositionDependencies.nativePollIdentity` | `node --test packages/photon-features/dist/tests/lanes/wt-05/*.test.js packages/photon-features/dist/tests/integration/repair-polls.test.js` | Spectrum 12.8.0 exposes neither authoritative native poll/option IDs nor provider ordering; production retains unresolved input. |
| 4 | Implemented behind unavailable production dependency | `executePollOperation`; `PollProviderBinding`; `ProductionCompositionDependencies.pollManagement` | Same WT-05 command | No approved public shared-owner poll-management adapter exists at the pin; operations report unavailable with precise blockers. |
| 5 | Closed locally | admission `cardUpdate.expectedRevision`; production `CardRuntime` binding and durable session projection | `node --test packages/photon-features/dist/tests/lanes/wt-06/*.test.js packages/photon-features/dist/tests/integration/repair-cards.test.js` | Actual extension/provider behavior not verified. |
| 6 | Repository seam closed; deployment dependency absent | `createInteractionAdapter`; `acceptCardInteraction`; `persistCardSession` | `node --test packages/photon-features/dist/tests/integration/repair-cards.test.js` | A configured authenticated backend contract works with a session created by the production send; no real backend/extension contract or live interaction was supplied. |
| 7 | Closed locally | `processCapturedMessage`; production `receipts` and replay `captureProcessing` | WT-02 command plus `repair-production-journey.test.js` | One receiving path records correlated observations; provider delivery/read not observed. |
| 8 | Closed locally | `cli.commandRequest`; `main`; `DurableLocalProtocol.media.import`; `ProductionResourcePorts.importFile` | `node --test packages/photon-features/dist/tests/lanes/wt-08/repair-media-import.test.js packages/photon-features/dist/tests/integration/production-resources.test.js` | Authenticated owner-only import directory is required; no live send. |
| 9 | Closed locally | `DurableSQLiteStore.pendingInbox`; `InboundRouter.pending` | WT-02 command | Bounded SQLite filtering covers 999/1000/1001/10000 history and mixed backlogs. |
| 10 | Closed in code; remote publication pending | workflow full-history checkout; `resolveHistoryBaseline` | `node --test packages/photon-features/dist/tests/lanes/wt-00/repair-ci-history.test.js` | Hosted jobs and the locally recorded tag/lane refs are not published or observed; no push was authorized. |
| 11 | Closed locally through package inventory | manually authored `SKILL.md` decision sections; regenerated operation block | `node --test packages/photon-features/dist/tests/lanes/wt-08/repair-media-import.test.js`; `npm pack --workspace=@grokbot/photon-features --dry-run --json --ignore-scripts` | 347-file package inventory includes the updated skill; no production archive install or activation. |
| 12 | Closed locally | `assembleFeatureSurface.operationRegistrations`; `generate-skill.mjs` | `node --test packages/photon-features/dist/tests/integration/assembly.test.js`; `node packages/photon-features/scripts/generate-skill.mjs --check` | Registration, declaration, provider support, runtime availability, and live evidence are separate facts. |
| 13 | Automated production-path verification passes; real Grok/device NOT RUN | `createProductionComposition`; production ingress/recovery/card-session/callback wiring; `repair-production-journey.test.ts` | `node --test packages/photon-features/dist/tests/integration/repair-production-journey.test.js`; full `npm run photon:test:integration` selected 90 files and passed 826/826 | Scripted Grok/provider boundaries only. Missing authorized activated configuration, real Grok gateway/task observation, provider credentials, intended user message, and device access. |

The required mutation check removed the production `SpectrumEventSource` receipt/reference
processing argument. The journey test failed with `runner timeout`; restoring the
binding returned it to one pass. The full source-derived runner then passed 826/826
with zero failures, cancellations, or skips; the authorization-gated live suite was
excluded explicitly.

## Optional conversational poll-answer maintenance (2026-09-12)

This section supersedes only the earlier conclusion that a poll interaction must
remain unresolved without native poll identity. Native state reduction and
original-poll attribution still require authoritative IDs and ordering; delivering
the public interaction as explicitly uncorrelated conversation work does not.

- PA-1: **PASS OFFLINE** — ordinary text stays ordinary text; there is no text-to-poll detector or automatic poll creation.
- PA-2: **PASS OFFLINE** — an explicit idempotent `poll.create` sends the selected question and options exactly once through the production owner.
- PA-3: **PASS OFFLINE** — default production composition, with both `pollManagement` and `nativePollIdentity` absent, captures a realistic public `poll_option` as durable `poll-answer` work.
- PA-4: **PASS OFFLINE** — supplied public poll title is preserved; an absent title remains `question: null` and is described as unidentified.
- PA-5: **PASS OFFLINE** — select, deselect, reselect, multiple selection, duplicate labels, and two question titles remain separate observations without guessed option/poll attribution.
- PA-6: **PASS OFFLINE** — duplicate delivery and capture replay create one logical handoff; acknowledged work neither reopens nor resends after restart.
- PA-7: **PASS OFFLINE** — foreign line/conversation, malformed payload, missing sender, and inactive task authority produce no unauthorized work and do not terminate the one receiver.
- PA-8: **PASS OFFLINE** — the scripted Grok boundary receives a pointer-only wake, uses authenticated `work.list`/`work.claim`, reads `answerText`, sends through ordinary `text.send`, and acknowledges with the returned fence.
- PA-9: **PASS OFFLINE** — one Spectrum owner and one message listener serve outbound creation and inbound answer capture.
- PA-10: **NOT RUN LIVE** — installation, activation, real Grok understanding, provider delivery, iMessage rendering/tap, and physical-device behavior require separate authorization and evidence.

Native `poll.get`, `poll.vote`, `poll.unvote`, and `poll.addOption` management
remain separately unavailable without the approved shared-owner management
binding. This maintenance does not claim final/latest vote state when the public
stream lacks authoritative ordering.

## Completion pass 2026-09-13

Completion acceptance is the user 2026-09-13 inventory and installed-program journeys: all 44 operations retain status; progressive producer delivery, original-card updates/callback authentication, audited authority replacement, restart/uncertainty, pinned component checks and installed archive validation. None is marked passed until commands and assertions are recorded.
