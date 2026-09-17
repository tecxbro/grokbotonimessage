# Grok Photon deployment and owner operations

This runbook describes the RFX-00 assembled release. Install and run on the **Grok Bot cloud VM, not the user's Mac**. The target is Linux x86_64 / amd64 (Node calls this x64). Codex builds and tests the artifact only; it does not activate the real account, operate the real VM, send a live iMessage, allocate a line or change billing.

The program contains one Photon messaging host. Grok remains the reasoning/orchestration layer; Photon remains transport/tooling. One Spectrum owner supplies ingress and outbound operations, and one SQLite database owns inbox, handoffs and outbox. No new model, orchestrator, transcript poller or sender is introduced.

## Artifact and prerequisites

Use the owner-local-tested archive and matching SHA-256/provenance sidecars produced from the exact clean integration commit. This mode runs the same required offline checks as published-approved mode; it needs no workflow approval JSON. Published-approved mode still requires a commit-bound genuine workflow-run URL. Neither mode establishes provider/device evidence.

Node **24.13.0**, npm **10.9.2**, spectrum-ts **12.8.0**, zod **4.5.4**, @photon-ai/advanced-imessage **2.1.0**, @grpc/grpc-js **1.14.4**, nice-grpc **2.1.17**, nice-grpc-common **2.0.4** are pinned. Runtime dependencies are included. The installer verifies Linux/x64, Node, complete metadata, archive/file hashes and state schema compatibility **[1]**. A macOS artifact cannot be relabelled as Linux. Keep the sidecar/checksum and source commit for audit.

Use a stable private local filesystem with Unix sockets, SQLite WAL/locking, atomic rename and fsync. Keep the installation path short enough for the OS Unix-socket limit (ROOT/runtime/runtime.sock). Use the existing VM OS user and supervisor; no sudo, launchd or Mac access is required. The release helper prints guidance for the available VM supervisor but does not install a service. Do not run two foreground/supervised hosts against one root.

In commands below ROOT, RELEASE, ARTIFACT and SHA256 mean the actual private installation path, selected release directory, archive path and supplied checksum. Run under the existing Grok VM service user with pinned Node on PATH. Deliver install.mjs and its package.mjs import from the same tested commit alongside the archive, as provided in the artifact handoff.

```sh
node /absolute/handoff/install.mjs install ARTIFACT SHA256 ROOT
```

Installation selects `ROOT/releases/SHA256` inactive and preserves runtime state on repeat installs. Never overwrite a configured root to rerun first-time generation. Historical inactive-install evidence is retained in Git; an npm dry-run alone is not an installed-artifact test.

## First-time discovery and configuration

Photon CLI authentication/device-login happens on the Grok Bot cloud VM. Setup reuses an authenticated VM CLI session and verifies it; if missing or expired, it performs one headless `photon login --no-browser`. Surface the **real verification URL and fresh code** streamed on stderr to the owner. Never invent a code or ask the user to paste a project secret in normal chat: the authenticated CLI retrieves it into private runtime storage. Setup output contains identities and decisions, never the secret. Discovery is Linux-only.

```sh
umask 077
node RELEASE/bin/grok-photon setup --installation-root ROOT --grok-executable /absolute/existing/gbot --json > ROOT/runtime/discovery.json
```

Setup discovers the Photon executable (or installs it in its private tool root), authenticated project/user/route and live Grok roster. If a project is ambiguous, rerun with `--project ID` from returned candidates. If an agent or initial address remains ambiguous, select only the relevant candidate/address in the small choices object. Inspect unresolved fields; nonzero incomplete discovery is not readiness. No chat is made writable just because its ID looks valid.

Build the generator input from the actual discovery JSON. With Node, for example:

```sh
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const root=process.argv[1]; const discovery=JSON.parse(readFileSync(root+"/runtime/discovery.json","utf8")); writeFileSync(root+"/runtime/setup-input.json",JSON.stringify({version:2,discovery,activateAfterValidation:true}),{flag:"wx",mode:0o600});' ROOT
node RELEASE/scripts/generate-configuration.mjs ROOT/runtime/setup-input.json ROOT/runtime/configuration.json
node RELEASE/bin/grok-photon-host validate --installation-root ROOT
node RELEASE/bin/grok-photon-host setup --installation-root ROOT
```

The explicit `activateAfterValidation:true` carries the owner's already-given activation intent once. Omit it or use false to generate inactive configuration; later `grok-photon-host enable --installation-root ROOT` is an explicit activation action. Validation alone never enables. Do not execute these real activation steps from Codex.

New setup uses version-3 installation-owner configuration with full owner operation permission intent; actual provider capabilities, exact resource ownership, recipients, prerequisites and fencing still restrict execution. Internal principal/context/task IDs and local credentials are generated. No manual permission-profile ceremony or pasted secret is required. Legacy version-2 configuration and v1 generator inputs remain supported for existing installations; their historical profiles are compatibility examples, not the normal setup path.

The verified installed Grok help determines `gateway-flag` or `gateway-subcommand`, stored with its evidence. Validation rechecks that shape without sending. No hard-coded historical argument order or live send probe is used.

Shared/free/Pro DMs use provider route identity **"shared"**. A human E.164 number is display metadata or recipient identity, not the shared provider line identity. Missing displayed serving metadata is valid. Dedicated routes use their actual serving line and expose dedicated-only features separately. Shared group creation and group-change ingress remain unavailable.

A fresh unresolved initialAddress is validated offline without seeding SQLite. After enabled startup holds the exclusive host lock, the same authenticated owner resolves it through public space.create/get and persists only the exact peer-verified native DM ID. Unknown native formats fail closed. This SDK resolution is not proof of server-side chat creation, message delivery or an independent receipt. Existing state is never reseeded; subsequent startup reuses the saved route.

## Start, stop, recovery and existing Grok wake

```sh
node RELEASE/bin/grok-photon-host run --installation-root ROOT
node RELEASE/bin/grok-photon-host supervisor --installation-root ROOT
```

Use the supervisor output's actual argv in the VM's existing service manager. One process owns the lock, stream receiver, typing lifecycle, SQLite and local socket. Send SIGTERM to the exact host process or stop its supervisor unit; shutdown drains and closes resources. A cleanup failure retains the lock. For stale ownership:

```sh
node RELEASE/bin/grok-photon-host reconcile --installation-root ROOT
node RELEASE/bin/grok-photon-host recover-stale --installation-root ROOT
```

Recover only when reported stale and the previous process is dead; the tool fails on an active owner. Then restart the same root. Never remove SQLite, reset generation or delete unknown work. For disabled activation use `grok-photon-host disable --installation-root ROOT` while stopped.

One inbound event is captured durably, normalized, batched into one handoff and wakes the existing Grok task with a pointer. Accepted wakes are not resent one second later. Failed/unknown wakes retain conservative retry/backoff across restart; claim suppresses repeats and acknowledgement closes the lifecycle. A stale/deleted target records a bounded diagnostic rather than a one-second loop. Repair a target only through the existing owner-authorized binding, preserving original handoff/events.

The wake includes exact release SKILL.md and grok-photon-task paths. Use that launcher with the actual task ID/generation for work.list, work.claim, work.heartbeat, work.ack and execute. Read original events after claim and reply to their originating authorized conversation. A task-created secondary DM is usable by the same principal/task/generation through its persisted grant; guessed chats, another task's references and stale generations fail. Streams and staged media remain tied to the original task authority.

## Operation-specific limitations

- `poll.get/vote/unvote/addOption`: public Advanced adapter is implemented and dependency-tested, but default Spectrum cloud ownership exports no authoritative endpoint/token bridge. No management connection is guessed or created. Poll creation and conversational answers remain separate supported paths.
- `app.send`: built-in `universal-static` accepts an ordinary HTTPS URL without custom extension/backend configuration. Live rendering, customized extension sends, authenticated callback backend and updates are separate capabilities.
- `app.update`: original public provider session and admitted revision must be available; otherwise reports requires_original_session or the exact URL/template/reconciliation blocker. Never sends a replacement card.
- `reaction.remove`: exact bot reaction and parent/part must be restored publicly; cold recovery otherwise reports REACTION_COLD_RECOVERY_UNAVAILABLE. Never infer a removable handle from matching emoji.
- Shared group administration: respects dedicated-line-only support. No provider limitation is bypassed.
- All operations after authority expiry: unavailable pending explicit safe owner transition; multi-day automatic renewal remains unresolved below.

Capabilities distinguish implementation, configuration, provider/account support, runtime dependencies, current resource/route authorization, actual blockers and informational notes. Provider acceptance, device observation and live verification are independent evidence. Handoff remains blocked for the operation whose required dependency/resource is missing, not merely because live verification has not occurred.

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

Checkpoint restart restores callback/replay state. An update after restart additionally requires the original public SDK Message/session to be recoverable by public lookup. Otherwise app.update reports requires_original_session and sends no replacement. A checkpoint never becomes an SDK object.

## Explicit owner authority transition and expiry limitation

Generated authority currently expires after 24 hours. RFX-11 proved that same-context expiry extension is rejected; a successor generation invalidates prior resource/handoff ownership. There is no safe automatic renewal or uninterrupted multi-day guarantee in this release. Stop before expiry and reconcile pending/unknown work before an explicit owner transition. Never edit timestamps, reset SQLite, or silently reseed authority. This is a remaining lifecycle blocker, independent of supervisor availability.

New version-3 installation-owner configuration uses the same private owner credential for explicit administration. Historical version-2 configuration retains its separate ownerAdministration principalId and distinct 0600 credentialFile. Do not synthesize a new owner token for a v3 install. Same-OS-user processes can read each other's
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

Keep code completion, offline production-path verification, tested artifact
verification, installed/activated target, and live/device verification as separate
states. The completion assignment authorizes neither production activation nor
live messages. docs/release-fix/test-evidence.md records commands, failures, checksums
and the exact remaining gates.
