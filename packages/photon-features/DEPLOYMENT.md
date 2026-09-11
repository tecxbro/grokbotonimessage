# Current deployment runbook

This is the single current deployment document for the assembled standalone
Grok Photon product. It governs release production, inactive installation,
configuration, startup, shutdown, skill binding, and rollback.

The other instruction files have different roles:

| Document | Role |
| --- | --- |
| Repository `AGENTS.md` and `docs/worktrees/*` | Development ownership, source requirements, tests, and development-time side-effect restrictions. |
| This file | Current deployment procedure and deployment blockers. |
| `SKILL.md` | Operation of an installed, already activated release in response to real incoming work. |
| `INSTALL.md` | Preserved historical inactive-install checkpoint; not a current deployment runbook. |
| `docs/photon-features/rollout.md` | Preserved historical F0 checkpoint; not a current deployment runbook. |

## Current release state

The assembled checkout provides deterministic release packaging, inactive
installation, an authenticated client CLI, runtime composition APIs, offline
smoke checks, and inactive rollback. It does **not** provide a release-owned host
entrypoint or an approved supervisor unit/command that constructs the real host,
acquires `runtime/host.lock`, owns the local socket and Spectrum connection, and
performs orderly shutdown.

Therefore deployment is currently **blocked at startup**. Do not change
`runtime/configuration.json` to `activation: "enabled"`, start a competing
Spectrum client, or treat `grok-photon` as a service executable. `grok-photon` is
the authenticated client of a separately supervised host. The startup section
below is a stop gate until the missing host/supervisor entrypoint is supplied,
tested, and named here exactly.

This documentation status is preventive. It does not establish that instruction
wording caused any platform approval failure.

## 1. Produce an approved release

Use the clean, committed `photon-v3/integration` candidate on the target
OS/architecture with Node 24.13.0 and npm 10.9.2. A genuine integration workflow
must supply an approval file bound to the exact tested commit and F0 digest:

```json
{
  "kind": "assembled-candidate-approval",
  "approved": true,
  "commit": "<40-character tested candidate commit>",
  "f0Digest": "<64-character foundation digest>",
  "workflowRun": "https://github.com/tecxbro/grokbotonimessage/actions/runs/<run-id>"
}
```

From a trusted tools checkout, write the output outside the candidate:

```sh
node packages/photon-features/scripts/package.mjs /absolute/assembled-candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz
```

Keep the generated `.sha256` and `.provenance.json` beside the archive. Do not
manufacture the approval locally, use a dirty candidate, set production secrets
in the build environment, or enable dependency lifecycle scripts.

## 2. Stage the release inactive

The installation root must be an absolute, dedicated administrator-controlled
path. The target must match the artifact OS, architecture, and exact Node version.
Run the installer supplied by the trusted release tooling:

```sh
node /absolute/tools/install.mjs install /absolute/release.gpf.gz <sha256> /absolute/grok-photon
```

Then verify the selected release without a host, credentials, socket, provider,
or network call:

```sh
node /absolute/grok-photon/releases/<sha256>/scripts/smoke-test.mjs /absolute/grok-photon/releases/<sha256>
```

The installer must report `activation: "disabled"`. It creates or preserves:

- `/absolute/grok-photon/releases/<sha256>/` for immutable release files;
- `/absolute/grok-photon/runtime/` for configuration, credentials, SQLite, WAL,
  SHM, locks, and the socket; and
- `/absolute/grok-photon/selected-release.json` as the inactive selection.

Do not place credentials or mutable state in a release directory. Installation
must refuse an enabled configuration or an existing host lock/socket.

## 3. Configure and bind the operating skill

Keep `/absolute/grok-photon/runtime/configuration.json` exactly inactive while
preparing configuration:

```json
{"version":1,"activation":"disabled"}
```

The approved host integration must provide all of the following before startup:

1. One existing project, account, iMessage line, Spectrum credential owner, and
   verified ingress selection.
2. An owner-only SQLite path, Unix socket path, random 64-hex local credential
   file, authoritative context resolver, scoped task grants, and existing Grok
   wake/task-acceptance adapter.
3. A supervisor-owned host entrypoint that acquires `runtime/host.lock`,
   coordinates with `.install-lock`, builds the real assembled modules, starts
   recovery before ingress/outbox work, and removes its socket/lock only through
   verified orderly shutdown.
4. A launcher binding that puts
   `/absolute/grok-photon/releases/<sha256>/bin` on `PATH` and supplies
   `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET`, and
   `GROK_PHOTON_CREDENTIAL_FILE` to the Grok task. Never pass credential contents
   as arguments or log them.
5. The versioned
   `/absolute/grok-photon/releases/<sha256>/SKILL.md` bound as the Grok operating
   skill without overwriting any fuller installed voice or safety policy.

No repository command currently performs items 1 through 5. In particular, the
installer copies `SKILL.md` into the immutable release but does not configure the
existing Grok orchestrator to read it. The client CLI reads the three
`GROK_PHOTON_*` variables, but no production launcher in this repository supplies
them. File presence and CLI support are therefore not skill-load or task-binding
evidence.

### Required deployment binding handoff

Before activation, the deployment handoff must replace the current `unbound`
status with all of the following concrete, non-secret facts:

| Required field | Evidence required |
| --- | --- |
| Release identity | Selected release SHA-256 and exact installed `SKILL.md` path plus file SHA-256. |
| Orchestrator identity | Exact existing Grok orchestrator/service identity and configuration location. |
| Skill-load mechanism | Exact configuration key, command, API, symlink, or prompt-assembly component that loads the versioned skill. State whether it loads once or for every messaging task, and how a task is pinned to the selected release. |
| Task-launch mechanism | Exact component and configuration that launches each messaging task. |
| Context binding | Authoritative source and injection step for `GROK_PHOTON_CONTEXT_ID`; record only a non-secret context/task correlation identifier. |
| Socket binding | Authoritative source and injection step for `GROK_PHOTON_SOCKET`, including owner and permission checks. |
| Credential binding | Secret-store/file provisioning and injection step for `GROK_PHOTON_CREDENTIAL_FILE`; record path, owner, and mode, never credential contents. |
| Task-level proof | One controlled, non-message task record showing the expected skill release/hash was loaded and all three variable names were present before CLI invocation. Redact values and do not infer this from installation logs. |
| Rollback behavior | Exact step that rebinds new tasks to the previous release skill and launcher while preserving in-flight task identity. |

The proof must come from the task-launch boundary or the launched task, not only
from the installer, filesystem, package manifest, or orchestrator startup log.
An orchestrator that caches instructions must identify its invalidation/reload
behavior; otherwise a newly selected release is not proven active for new tasks.

Current handoff status is `unbound`: the actual external loader, task launcher,
and environment-injection mechanism are unknown and have no task-level evidence.
Record the exact host command, supervisor identifier, configuration schema,
secret-store binding, skill-load mechanism, task-launch mechanism, and recovery
owner here before authorizing activation.

## 4. Startup stop gate

**Stop here. There is currently no approved startup command.**

Startup becomes actionable only after the release-owned host entrypoint and
supervisor procedure are implemented, independently verified, and substituted
for this stop gate. At that point the documented procedure must, in order:

1. acquire the single verified owner and coordinate with the install lock;
2. enable the validated configuration through the approved supervisor;
3. recover durable inbox, outbox, handoffs, and unknown outcomes before accepting
   new work;
4. start the one provider owner, authenticated local socket, ingress, and outbox;
5. run the following read-only checks through the bound task launcher:

```sh
grok-photon doctor --json
grok-photon capabilities --json
```

Readiness and handler implementation do not prove provider acceptance, delivery,
read state, rendering, interaction, or physical-device behavior. Those require
separately authorized evidence.

## 5. Operating boundary

After an approved activation, `SKILL.md` governs real incoming work. A real user
request should be handled in its originating conversation using its authorized
context and the installed program. The prohibition on unsolicited development
tests does not prohibit that reply. It does prohibit initiating test messages,
using another conversation as a probe, or treating a development fixture as user
authorization.

## 6. Shutdown

Use the exact approved supervisor stop command recorded in this runbook once the
host integration exists. Disable configuration first, request orderly stop, and
confirm through the supervisor that recovery state is durable and the verified
owner/socket are gone. Never kill an unverified PID or delete a lock/socket to
force shutdown.

Because no approved supervisor command currently exists, shutdown cannot be
claimed operationally verified. Do not activate a host that lacks its matching
documented stop procedure.

## 7. Rollback

Rollback is allowed only after verified shutdown and while configuration remains
disabled. Preserve the database, queued requests, inbox, handoffs, receipts, and
unknown outcomes:

```sh
node /absolute/tools/rollback.mjs /absolute/grok-photon <previous-release-sha256> confirm-inactive
```

The command verifies the installed release and compatible SQLite schema, then
changes only the inactive selected-release pointer. It does not start the prior
release, migrate or delete state, resend work, or prove that the prior executable
can read a newer schema. Re-run the offline smoke check for the selected release.
Activation after rollback remains subject to the startup stop gate above.
