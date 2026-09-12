# Integration architecture

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
