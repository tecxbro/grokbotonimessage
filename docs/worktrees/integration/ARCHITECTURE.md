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
in `candidate-contract.json`; integration verification never rewrites the tag or
the foundation declaration.

Optional provider capabilities remain native, fallback, warn-and-skip, accepted
no-op, or thrown-error according to the pinned Spectrum 12.8.0 provider contract;
a resolved promise alone is never delivery or device evidence.

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
