# Integration architecture

## Contract verification targets — 2026-09-16

`scripts/generate-contracts.mjs` requires `--target assembled-candidate` or
`--target foundation`, independently of Git branch and checkout state. The former
selects `docs/worktrees/integration/candidate-contract.json`; the latter selects
the frozen `docs/worktrees/foundation.json`. Unknown or absent targets fail before
generation. Schema serialization, sorted file hashing and manifest file-count
checks remain in place; no digest-based fallback exists.

`npm run photon:check` selects assembled-candidate for the current source tree.
Both Photon workflows and workspace CI use that command, including jobs which
run foundation unit tests against assembled sources. Genuine F0 source checks
use `photon:check:foundation` or the explicit target in `verify-lane.mjs`. Archived
F0 schemas are compiled in an isolated regression fixture to validate the real
immutable checkpoint, so test workflows fetch full Git history.

## Current completion architecture — 2026-09-13

This section supersedes historical production-wiring claims below. The assigned
checkout is registered `fix-1` at reviewed baseline
`55b1821216cefe341e611518e1b125552346a115`. No branch/worktree was created or
switched, and `photon-v3-f0` remains unchanged. The user explicitly authorizes the
exact cross-lane completion paths recorded in `FILES.json.completionFiles`.

The executable path remains `grok-photon-host` → strict owner JSON →
`createProductionComposition` → one Spectrum owner, shared SQLite, guarded
resources, durable executor, authenticated local socket and existing Grok wake.
There is no new model, messaging client, inbound listener or command HTTP API.
`executeChild`, task claims/heartbeats/acknowledgements and structured-content
voice-policy bypass remain the shared boundaries.

| Gap | Concrete application implementation | Compatibility decision |
| --- | --- | --- |
| Progressive producer | `host/text-producer.ts`, `stream-registry.ts`, version-1 `stream.open/append/close/abort` CLI/socket commands | Inert complete thoughts only; 30s session, 5s stall, 16000 characters, 4096 chunks, 8192 queued bytes; single-use scope/generation reservation |
| Progressive provider | `features/text-messages/streaming.ts` calls actual `text(AsyncIterable)` through the owner | First thought reaches provider before close; SDK edits original GUID; explicit buffered fallback; no per-edit durability or manufactured Grok token stream |
| Universal card updates | `host/card-backend.ts` builds immutable layout/OG URLs and trusted template functions from serializable `signed-card-v1` config | `space.send(edit(builder, originalMessage))`; preserve customized path and refreshed provider session metadata; cold restoration remains blocked |
| Card returns | Shipped `host/card-browser.ts` signs exact versioned wire bytes; separate loopback `/interactions` listener verifies enrolled Ed25519 participant keys | Application-owned protocol; owner verifies iMessage identity outside links; TLS origin and enrollment are deployment inputs |
| Callback durability | Authentication and raw bounds precede scope/session/action checks; shared SQLite transaction writes replay proof, session consumption and continuation before acknowledgement | New `interactionClaims` table is additive; changed claims cannot reuse a nonce; old generations cannot replay after renewal |
| Owner renewal/replacement | Stopped-host `authority.inspect/apply`, separate owner credential, transactional CAS and audit, atomic configuration persistence | New `authorityAudits` table is additive; new context and generation; preserve pending/unknown work; no startup reseeding or self-escalation |
| Resource gaps | Production native avatar retention, actual created-chat reference, reaction reference resolution | Shared guarded stager and store; a new chat reference grants no new routing authority; cold reaction removal still lacks a usable SDK handle |
| Host shutdown | Remove only SDK signal handlers added by the single owner factory, preserving existing host handlers | Public Node listener API; orderly backend/socket/outbox/typing/owner shutdown rather than SDK early process exit |
| Release payload | Standalone shrinkwrap, three executable wrappers, generated JSON profiles/schemas/inventory; completion release gate runs installed tests and captures production dependencies | Node 24.13.0/npm 10.9.2/Spectrum 12.8.0 unchanged; historical release format remains rollback-compatible |

Inbound transport, outbound provider and Grok wake remain separate. Historical
captures from an older authority generation remain unresolved with their original
records; startup never attaches them to renewed work. A partial transmission or
lost acknowledgement remains `unknown-outcome`/reconcile-first and blocks later
work in the same conversation. Consumed streams are not reconstructed or replayed
on restart. Native poll GUIDs/options remain distinct from application keys and
labels; human answers are input, never duplicated with a bot `poll.vote`.

The public pinned provider has no `imessage(app).polls` export and no public
shared-owner native client. Advanced-kit poll documentation cannot establish that
missing boundary. Four native management operations remain upstream release
blockers. The actual SDK also cannot reconstruct cold card update sessions or
cold reaction content handles through `space.getMessage`. No JSON cast, private
field, independent client, replacement bubble or disabled inventory row conceals
these limits. All 44 operations remain in the generated production inventory.

The single-route deployment scope and same-OS-user credential trust boundary are
explicit. Root/developer access under the same OS account can bypass local token
separation; this is not multi-tenant isolation. Actual provider/account capability,
Apple registration, extension installation, target supervisor and live delivery
are separate evidence tiers.

## Historical checkpoints before this completion pass

The following records are retained for provenance. Current behavior and gates are stated above.

## Runtime ownership

The assembled candidate retains one existing Grok orchestrator and worker model.
One host owns Spectrum credentials, provider lifecycle, inbound capture, receipt
observation, and outbound dispatch. Feature modules receive only public
`f0-services-2` execution services and scoped provider bindings.

## Execution path

Authenticated local requests resolve an authorized context, reserve a durable
idempotency identity, acquire a fenced claim, and dispatch registered feature
handlers. Provider effects cross only the durable `executeChild` journal. Stable
child identities survive retry; timeout or disconnect after dispatch becomes
`unknown-outcome` and requires reconciliation before another send.

## Inbound path

The selected Spectrum owner opens live streams before catch-up, merges both paths
through one bounded durable ingress, deduplicates by provider identity/sequence,
and advances contiguous checkpoints only after successful processing. Webhook
ingress verifies freshness and raw-body HMAC before parsing, durably captures the
event before `2xx`, and treats duplicate delivery as success without repeating
downstream effects.

## Composition and feature modules

WT-01 supplies durable execution and SQLite state. WT-02 supplies transport,
ingress, receipt, wake, and typing boundaries. WT-03 through WT-07 supply public
feature modules. WT-08 supplies the inactive CLI/package lifecycle. WT-09 supplies
assembled verification. Integration owns registry, compiler composition, host
wiring, shared migration/contract amendments, and aggregate verification tools.

`assembleFeatureSurface` constructs the real lane factories and refuses an
incomplete or duplicate surface. It exposes all 44 public operation handlers and
the compatibility registry's 12 compiler families. The integration-owned poll
compiler uses Spectrum's public poll builder; other compilers remain lane-owned.
WT-07's public adapter wraps each native handler in one stable `executeChild`
while reusing the injected scoped provider rather than creating another client.

`assembleDocumentedFeatureSurface` uses those same factories with inert
dependencies for structural inspection. The skill generator projects handler
implementation from `assembleFeatureSurface.operationRegistrations`; the
immutable F0 ownership catalog retains its foundation-era declaration and is no
longer treated as assembled status. Handler presence remains independent from
provider support, scoped account and conversation availability, and live
verification, which are discovered through runtime capabilities.

The immutable F0 declaration remains `photon-v3-f0` with digest
`d95caace...`. Post-F0 package/export/registry composition is recorded separately
in `candidate-contract.json`; integration and its `fix-1` aggregate verify that
candidate record without rewriting the tag or foundation declaration.

Optional provider capabilities remain native, fallback, warn-and-skip, accepted
no-op, or thrown-error according to the pinned Spectrum 12.8.0 provider contract;
a resolved promise alone is never delivery or device evidence.

## Durable ordering boundary

Ordinary outbox work serializes within the exact project/account/line/space
conversation. Earlier `queued`, `blocked`, and `unknown-outcome` work continues
to fence later work in that conversation, but it does not create a dependency
for a different conversation using the same line. `space.create` has no existing
conversation resource, so creation operations share a distinct line-scoped
dependency. Provider rate limiting remains a separate concern and is not encoded
by the predecessor relationship.

## Release migration boundary

The custom release payload includes the immutable F0 SQL migration at
`src/state/migrations/0001-initial.sql`. The compiled SQLite adapter resolves
only that exact package-relative file from its installed `dist/src` location.
It never walks parent directories, so a source checkout or unrelated ancestor
cannot silently supply a migration omitted from the release. The migration is
an ordinary checksummed archive entry and is verified with the rest of the
installed release before selection.

## Activation boundary

Packaging and offline installation fixtures do not authorize runtime activation.
No account, line, permission, hosting, credential, provider, or device mutation is
part of this lane.

The concrete production composition is single-route and fail closed: strict
configuration binds one project/account/line/conversation and one task
generation; one process owns the SQLite store, Spectrum client, stream ingress,
outbox, and authenticated Unix socket. Startup verifies the selected immutable
release, takes an exclusive owner lock, starts provider ownership, recovers
durable work, then starts ingress/outbox and finally the local socket. Shutdown
reverses effect admission before releasing provider/store ownership.

## Instruction roles and deployment gate

Root and worktree `AGENTS.md` files govern development. The versioned `SKILL.md`
governs real incoming work only after installation and activation.
`packages/photon-features/DEPLOYMENT.md` is the sole current deployment runbook;
the F0 rollout and WT-08 install manuals remain labeled historical evidence.

Integration owns this cross-cutting documentation boundary and packages the
current deployment runbook beside the operating skill. The assembled package now
has release-owned host and task-launch executables plus exact systemd lifecycle
commands. Inactive staging, explicit activation, readiness checks, orderly
shutdown, and rollback remain separate steps.

The ownership manifest records the exact historical/lane-owned instruction and
packaging paths integration may maintain for this boundary. They remain assigned
to their original lanes for historical inventory, while integration maintenance
is explicit, path-exact, and contains no wildcard grant.

The host binds the existing Grok gateway with a pointer-only
`gbot --gateway send` command. The prompt names the selected `SKILL.md` and exact
release launcher; the launcher verifies release/task authority before injecting
the three `GROK_PHOTON_*` bindings. This establishes the repository mechanism,
not external task evidence: a deployed Grok task must still demonstrate gateway
acceptance, skill load, and claim without exposing credentials or message bodies.

## fix-1 durable authority and resource bindings

Production construction now performs one transactional bootstrap-or-validate
decision. A completely fresh task/context/space binding is inserted atomically.
Any existing or partial identity is durable evidence: cancellation, revocation,
generation, permissions, issuance, expiry, principal, task, scope, and resource
ownership are validated and never rewritten from configuration. Validation,
enable, startup, and the release-pinned task launcher fail closed before a
Spectrum client or Grok wake when that evidence is denied or incompatible. This
patch intentionally introduces no reauthorization command.

The execution facade lazily creates request/fence-local resource ports. A
`GuardedMediaStager` receives the public transaction facade, mutable-claim check,
context, clock, cancellation signal, and authorized resolver; only shared
capacity and filesystem policy live at host scope. Native downloads reuse the
one Spectrum owner and pinned iMessage `getAttachment(...).stream()` path. A
trusted in-process file importer authenticates the configured principal and
restricts input to a basename in the owner-only imports directory.

Registered text sources are trusted in-process inputs. Registration stores a
scoped inert reference and retains the live iterator only in the host registry.
Consumption transitions `registered -> reserved -> closed`, binds reservation
to the exact request/owner/fence/generation, combines cancellation signals, and
never invents a provider ID. Completed durable child results replay without
reopening. A crash loses an unconsumed live iterator by design, so restart
reports unavailable rather than fabricating recovery. Delivery remains bounded
buffered fallback, not progressive streaming.

The production capability evaluator feeds both reporting and execution
preflight from one dependency inventory. Handler registration, provider
configuration/readiness, authority policy, card templates, media, streams,
composite media content, and resource bindings remain distinct from provider
support and live evidence.

## fix-1 repair preparation (2026-09-11)

This maintenance assignment makes the registered fix-1 branch the repair coordinator. Historical integration ownership and F0 evidence above remain historical. Exact scope is recorded in ../fix-1-repair/FILES.json and executable/delegated interfaces in ../fix-1-repair/INTERFACES.md.

Shared preparation adds atomic admission metadata for card updates, a context-authenticated media-import protocol delegating to the existing importer, explicit implementation/configuration capability facts, and trusted incoming-reference/native-poll correlation primitives over the existing SQLite store. There is no new provider owner, receiving loop, outbox, model, callback wire protocol or applied-migration rewrite. Only the card-admission and local-import production bindings are connected in preparation. A-E implement their exact lanes; final receiver/poll/callback composition and structural-inventory reconciliation remain coordinator work.

## Repair integration projection

Production live ingress and capture replay share one processor: normalize,
authorize the current conversation/task generation, register authenticated
message/attachment identities, record independent receipt evidence, then expose
the event to the inbox/router. A public Spectrum `poll_option` becomes a durable
conversational `poll-answer` and follows the same pointer-only work path as
ordinary incoming conversation work without needing native poll management.
When an approved native identity is supplied, routing consults the exact
persisted poll owner and never falls back to the latest conversation task after
an unresolved or stale correlation. Without that identity, question/option
labels stay uncorrelated user content in the authorized conversation.

The default Spectrum 12.8.0 surface is sufficient for conversational answers:
it exposes option text, selection state, optional poll title, sender, message
identity, direction, and timestamp. It does not expose authoritative native
poll/option IDs or provider ordering through the public snapshot. Native
`poll.get`, `poll.vote`, `poll.unvote`, and `poll.addOption` therefore remain
separately unavailable unless an approved shared-owner management binding is
configured.

The production card runtime projects its inert session snapshot into the existing
durable `wt06.card-session` checkpoint after a successful shared handler result.
The callback adapter reads that same durable session, authenticates through a
deployment-owned backend contract, consumes the nonce and creates the continuation
atomically, then wakes through the existing pointer-only path. No callback listener,
wire schema, key policy, provider client, or default verifier is invented.

The assembled operation projection derives registration from the public registry and
implementation/provider support from explicit capability declarations. Runtime
configuration and live verification remain separate fields. Missing declarations
fail closed as unimplemented even when a handler is registered.

## Completion pass 2026-09-13

Completion design: construct serializable trusted backend settings in executable startup; add bounded authenticated inert text producers to the private local protocol; retain one owner, receiver, inbox/outbox and executeChild. Owner authority changes use a separate stopped-host administration procedure, never ordinary task credentials. Native poll management and cold card session restoration require a verified public shared-owner SDK surface.
