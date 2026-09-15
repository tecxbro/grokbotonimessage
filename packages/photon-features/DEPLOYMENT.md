# Grok Photon deployment and owner operations

This is the authoritative runbook for the `fix-1` completion candidate based on
`55b1821216cefe341e611518e1b125552346a115`. INSTALL.md points here; SKILL.md is the
operating manual for an already authorized task. The release has one existing
Grok orchestrator, one shared Spectrum owner, one SQLite inbox/outbox, and one
configured project/account/line/conversation/task route. Creating a chat does
not add a second route or authorize follow-up messages there.

**Handoff remains blocked.** Spectrum 12.8.0 has no public shared-owner native
poll-management API (`poll.get`, `poll.vote`, `poll.unvote`, `poll.addOption`) and
no public mechanism for restoring an original mini-app SDK update session after
a process restart. Cold reaction lookup also loses the reaction content handle;
removal works through the warm SDK cache but remains blocked after cold lookup. These operations stay in the 44-operation inventory.
`app.update` works repeatedly during the owning process lifetime; a cold update
blocks without sending a replacement. See examples/production-inventory.json.
No target activation or device delivery is established by offline tests.

## Preflight and release gate

The tested toolchain is Node **24.13.0**, npm **10.9.2**, spectrum-ts **12.8.0**,
and zod **4.5.4**. There is no SDK version change or local SDK patch. Use this
Node on PATH for every launcher and the configured Grok executable. Native
`node:sqlite` is required. Dependencies install with scripts disabled. Existing
CI retains Linux and macOS jobs; a local macOS result is not a Linux CI result.

Before deployment the owner must establish:

- Supported Linux/macOS architecture and a writable private local filesystem
  with Unix sockets, SQLite locking/WAL, atomic rename and fsync. NFS, Windows,
  and container/socket arrangements are not verified deployment modes.
- A stable process supervisor, restart/shutdown behavior, disk capacity and
  backups appropriate to that environment. Foreground execution and signal
  shutdown are tested offline. This runbook assumes neither sudo nor systemd.
  launchd/systemd/user-supervisor installation on the Grok VM is an unverified
  environment prerequisite; do not invent paths or install a competing worker.
- The existing `gbot`/Grok CLI absolute executable and existing agent ID. Check
  its installed help/version and gateway authentication under the service OS
  user. Its established invocation is `--gateway send AGENT POINTER_PROMPT`;
  the host does not add a model or read transcripts. Gateway URL/token setup
  belongs to the existing Grok installation, not the Photon task credential.
- Existing Spectrum project secret, account ID, line ID, real E.164 serving
  phone, dedicated/shared mode and exact native conversation ID. No provisioning,
  platform approval, billing or test messages are part of this procedure.
- Real task/context/principal IDs, generation, issue/expiry times and selected
  permissions. The owner grants exact recipients and administration separately.

An approved release requires a **clean tested commit**, the frozen F0 digest,
and real approval/workflow evidence for that commit. `scripts/package.mjs`
requires an owner-supplied JSON object with `kind: assembled-candidate-approval`,
`approved: true`, exact `commit`, exact `f0Digest`, and the actual GitHub Actions
`workflowRun` URL. Do not create synthetic approval. `photon:verify-all` still
validates the registered integration-worktree identity; running it from fix-1
must not impersonate that worktree. Component results and that blocker are
reported separately. Current upstream gates must be resolved before handoff.

From the approved candidate using the pinned toolchain:

```sh
node packages/photon-features/scripts/package.mjs /absolute/candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz
node /absolute/tools/install.mjs install /absolute/artifacts/release.gpf.gz SHA256 /absolute/private-root
```

Use the supplied artifact checksum. The installer verifies target/toolchain,
metadata, hashes, private paths and compatible state, and selects it inactive.
It includes runtime dependencies. Repeated install is verified without replacing
runtime state. A diagnostic npm `.tgz` with its standalone shrinkwrap is useful
for offline testing (`npm ci --omit=dev --ignore-scripts --no-audit --no-fund`),
but is **not** an approved `.gpf.gz` release and supplies no workflow approval.
Do not copy the tests' synthetic selected-release metadata into production.

New approved artifacts carry completionContract 1. The packager requires the
installed-executable matrix, workspace typecheck and configuration/inventory/
standalone-lock drift checks in addition to the existing component tests. It
captures production dependencies after testing. Historical compatible archives
remain eligible for inactive rollback; they do not gain the new features.

## Configuration and feature profiles

The owner controls ROOT and ROOT/runtime (0700); all secret/configuration files
are regular single-link 0600 files owned by that OS user. Create private
`captures`, `staging`, and `imports` directories. Configuration paths must be
absolute beneath ROOT/runtime; socket and database are exactly
ROOT/runtime/runtime.sock and ROOT/runtime/state.sqlite. Keep canonical paths;
symlinked directories and unsafe files are rejected.

Use `schemas/host-configuration-v2.json` plus runtime validation. JSON schema
cannot express all cross-field refinements; the executable is authoritative.
`examples/profiles/{minimal-text,messaging,administrative}.json` are generated
selection profiles with **no default grants**. Messaging lists the complete
supported non-administrative set; administrative adds explicitly permissioned
operations. The four native poll-management blockers are recorded separately.

Prepare owner-input.json with exactly `version:1`, `profile`, `enable` (the
explicit operation list), and `configuration` (a complete version-2 owner-authored
configuration). The generator requires every selected operation already in that
configuration's task permission list, rejects operations outside the profile,
checks constructed-dependency prerequisites, and always disables activation:

```sh
node RELEASE/scripts/generate-configuration.mjs /absolute/owner-input.json /absolute/new-configuration.json
```

`enable` becomes both provider.availableOperations and task.permissions. It
never adds recipients, administrative intent or native-content permission.
Copy the reviewed output to ROOT/runtime/configuration.json while stopped.
Start with `text.send`/`message.reply` and the required resource/typing operations;
select broader permissions only for the intended workflow. Schema paths identify
required provider, local, task, grok, authorization, cards and runtime fields.
Use actual values; reserved `.invalid` examples and test IDs are not deployment
inputs. A valid schema does not prove an account supports every operation.

Normal startup constructs the provider, media stager, bounded producer,
resources and configured card backend. `validate` returns exact static operation
blockers; scoped `capabilities` combines these with the constructed dependencies,
handler declaration and runtime readiness. An unavailable operation cannot pass
execution preflight. Do not suppress blockers by removing the inventory.

## Start, stop, recovery and existing Grok wake

RELEASE is ROOT/releases/SELECTED_SHA256, selected by selected-release.json.
For a configured installation:

```sh
node RELEASE/bin/grok-photon-host validate --installation-root ROOT
node RELEASE/scripts/smoke-test.mjs RELEASE
```

Validation is local and preserves bootstrap-or-validate authority: a fresh
installation seeds one binding; an existing database must match. It never
renews expired authority, revives revoked work or widens permissions.

**Only after separate activation authorization and release gates are met:**

```sh
node RELEASE/bin/grok-photon-host enable --installation-root ROOT
node RELEASE/bin/grok-photon-host run --installation-root ROOT
```

The run command stays foreground. Configure the environment's chosen supervisor
to preserve the same OS user, pinned Node PATH, existing gateway authentication,
and state directory. Send SIGTERM/SIGINT and wait for exit before restarting,
changing authority or selecting an archive. The host drains work/typing, stops
its callback listener and socket, closes the single SDK owner, and releases its
lock. The pinned SDK's automatically installed process-exit signal handlers are
removed during sole-owner construction via public Node listener APIs so they
cannot preempt this cleanup; unrelated preexisting handlers are preserved.

After stopping, `node RELEASE/bin/grok-photon-host disable --installation-root ROOT`
changes activation only. Never delete state to clear authority or unknown work.
A leftover lock/socket is a reconcile-first incident; verify owner liveness and
inspect the failure before any operator recovery. Unknown/blocked predecessors
continue fencing later actions in that conversation, including after renewal.

The existing Grok wake contains a handoff pointer and the exact release skill
and launcher paths. The installed program already implements retrieval, claim,
heartbeat, reply and ack. It never asks Grok to implement an adapter.

```sh
node RELEASE/bin/grok-photon-task --installation-root ROOT --task-id TASK --generation N capabilities --json
node RELEASE/bin/grok-photon-task --installation-root ROOT --task-id TASK --generation N work.list --limit 20 --json
```

Use returned handoff IDs/fences. Every task command uses this launcher prefix.
SKILL.md documents execute/status/cancel and durable acceptance/ack behavior.

## Media and progressive text

Put an authorized completed media file in the configured private imports
directory. Send `media.import --json-stdin` with
`{"filename":"result.png","metadata":{"mimeType":"image/png","name":"result.png"}}`.
The result is a bounded immutable staged descriptor. Use it unchanged for
attachment.send/voice.send. Import never sends. Incoming attachment references
are retained from authenticated SDK events and fetch through the same owner.
Nonempty avatars now enter this same stager. Voice fixtures establish mapping,
not audible device behavior; target codec/conversion availability is separate.

Progressive delivery defaults on in normal startup, using the actual public
`text(AsyncIterable)` remote-iMessage implementation. `textStreaming.delivery`
may explicitly be `buffered`, which sends only after completion. There is no
claim to obtain Grok's internal tokens. Only an actual authorized producer may
supply incremental complete thoughts. See SKILL.md for the version-1 local
stream.open/append/close/abort protocol and its bounds. Input is inert text;
no commands, generators, module paths, URLs to fetch or transcript polling.
The SDK sends once and edits that original GUID, with a bounded/throttled edit
budget and final receipt only. Failure after entry into send preserves unknown
outcome evidence; per-edit receipts/durability and cancellation of an already
in-flight RPC are not promised. No consumed source reopens after restart.

## Application-owned cards and authenticated callbacks

For universal updates configure cardBackend with `kind:"signed-card-v1"`, an
owner-selected id, actual canonical HTTPS origin, private listener port
1024–65535, and enrolled participants. Set each supported template's backendId
to this ID and include the origin in origins. The host constructs prepareUrl and
updateUrl; configuration accepts no executable strings/functions/modules.
The backend stores immutable layout/image files under runtime/card-pages and
serves Open Graph metadata. The real SDK app(URL) builder fetches this page;
updates edit the original card and refresh public miniAppCardSession metadata.
Customized cards retain the public customizedMiniApp path and require actual
Apple team ID/extension bundle ID (and App Store ID where applicable).

The host packages both the web interaction producer and receiver. It listens on
127.0.0.1:PORT separately from the private command socket. The owner must supply
an HTTPS reverse proxy at the configured origin routing only `/card`, `/images/`
and `/interactions` to this listener, with request size/time limits. The target
TLS domain/proxy is a deployment prerequisite. This is **our signed-card-v1
protocol**, not a Photon-native callback protocol. The iMessage extension's live
rendering/installation is an independent capability and must be verified on the
recipient device; static preview and signed web buttons do not establish it.

The browser creates an Ed25519 signing key in origin-scoped IndexedDB and shows
its public JWK for enrollment. The owner must verify the participant's real
iMessage account through an independently authenticated enrollment procedure,
then record id, canonical imessageAddress, publicKey and enrollmentEvidence in
the private backend configuration. Merely sending/forwarding a link or entering
an address proves nothing. Retaining the key lets that participant sign later
callbacks; key loss requires owner re-enrollment. Browser WebCrypto Ed25519,
IndexedDB and origin storage availability are target-browser prerequisites.

Each interaction template explicitly lists participantIds, actionIds, ttlMs and
backendContractId. POST /interactions accepts at most 16 KiB raw JSON:
`{version:1,payload:JSON_STRING,signature:BASE64URL_ED25519}`. The signature covers
UTF-8 `grok-photon:signed-card-v1\n` followed by the exact payload string. The
shipped page produces the payload containing eventId, session, scope, taskId,
generation, participantId, nonce, actionId, selection and occurredAt. Host
verification authenticates the enrolled key, binds all fields, rejects expiry,
tampering and replays with different identity, and commits state plus durable
continuation before acknowledgement. Exact authorized retries return replayed. Changed participant/action/selection
claims under a used replay identity are rejected, as are revoked generations. Unknown
sessions stay unresolved. Transaction failure is HTTP 503; rejected claims are
403. Callback authentication never grants local command access.

Checkpoint restart restores callback/replay state. It cannot manufacture the
missing SDK original Message/session. A cold app.update is an explicit release
blocker; never cast checkpoint JSON or send a replacement card to bypass it.

## Explicit owner authority renewal or replacement

Ordinary task credentials cannot administer authority. Configure a separate
ownerAdministration principalId and 0600 credentialFile containing a distinct
random 32-byte hexadecimal token. Same-OS-user processes can read each other's
files and are one trust domain; this is not isolation from a hostile process
running as that user. Keep the owner credential out of task prompts/arguments.

Stop the host first. Retrieve the exact durable expectation using the owner
credential file, even when authority has expired or was revoked:

```sh
node RELEASE/bin/grok-photon-host authority.inspect --installation-root ROOT --owner-credential-file /absolute/owner-token
```

Prepare a private request JSON according to schemas/authority-transition-v1.json
with version, requestId, reason, mode, returned expectedContext and row revisions,
and nextContext. Use a new contextId, generation+1 and active bounded times.
`renew` retains the same task/principal and can renew expiry; it cannot revive
revoked/cancelled work. `replace` requires a new task ID and fences/cancels the old
one. Same project/account/line/conversation scope is required. Broader permissions
require this explicit owner transition and separately reviewed provider policy.

```sh
node RELEASE/bin/grok-photon-host authority.apply --installation-root ROOT --request-file /absolute/renewal.json --owner-credential-file /absolute/owner-token
```

The transition and audit commit atomically in shared SQLite. Old queues,
unknown outcomes, inbox and staged references remain under their old generation.
Historical captures and old accepted resources are not reassigned to the successor.
Configuration replacement follows the transaction; if that write fails, repeat
the **exact** request ID/content to finish it. A stale expectation or old replay
after another transition is rejected. Additive authorityAudits and interactionClaims storage remains
schema-1 compatible; rollback never erases it or downgrades authority.

## Rollback and evidence

Stop and disable before `node RELEASE/scripts/rollback.mjs ROOT PRIOR_SHA256 confirm-inactive`.
The prior archive must already be installed, hash-verified and state-compatible.
The selector preserves runtime state. An older release may not operate new
producer/backend commands; retain the current skill with its selected release
and do not promise feature parity across rollback. No approved compatible prior
release is fabricated for testing.

Keep code completion, offline production-path verification, approved artifact
verification, installed/activated target, and live/device verification as separate
states. The completion assignment authorizes neither production activation nor
live messages. Integration TEST-EVIDENCE.md records commands, failures, checksums
and the exact remaining gates.
