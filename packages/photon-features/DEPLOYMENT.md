# Production deployment runbook

This is the current launch procedure for one Grok agent, one existing iMessage
conversation, one Spectrum project/account/line, and one host process. The
release supplies the host (`grok-photon-host`), the authenticated client
(`grok-photon`), and the release-pinned task launcher (`grok-photon-task`).

`INSTALL.md` is historical. `SKILL.md` governs the already-running task. This
document governs package, install, configuration, activation, lifecycle, Grok
handoff, and rollback.

## 1. Build and install an approved immutable release

Use a clean committed `photon-v3/integration` candidate on the target OS and
architecture with Node 24.13.0 and npm 10.9.2. The approval file must identify
the exact tested commit and F0 digest:

```json
{
  "kind": "assembled-candidate-approval",
  "approved": true,
  "commit": "40-character-tested-commit",
  "f0Digest": "64-character-foundation-digest",
  "workflowRun": "https://github.com/tecxbro/grokbotonimessage/actions/runs/approved-run-id"
}
```

```sh
/absolute/node-24.13.0/bin/node packages/photon-features/scripts/package.mjs \
  /absolute/assembled-candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz

sudo install -d -o grok-photon -g grok-photon -m 0700 /opt/grok-photon
sudo -u grok-photon /absolute/node-24.13.0/bin/node /absolute/tools/install.mjs install \
  /absolute/artifacts/release.gpf.gz "$(cat /absolute/artifacts/release.gpf.gz.sha256)" /opt/grok-photon
```

The installer selects the release inactive. It refuses dirty candidate input,
an unapproved candidate, unsafe paths, an enabled configuration, an install or
host lock, an existing socket, a wrong toolchain/target, or incompatible state.
No provider or Grok call occurs during install.

Set the exact installed identity for the remaining commands:

```sh
export PHOTON_ROOT=/opt/grok-photon
export PHOTON_RELEASE="$(sudo -u grok-photon /absolute/node-24.13.0/bin/node -e \
  'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).release)' \
  /opt/grok-photon/selected-release.json)"
export PHOTON_BIN="$PHOTON_ROOT/releases/$PHOTON_RELEASE/bin"
sudo -u grok-photon /absolute/node-24.13.0/bin/node \
  "$PHOTON_ROOT/releases/$PHOTON_RELEASE/scripts/smoke-test.mjs" \
  "$PHOTON_ROOT/releases/$PHOTON_RELEASE"
```

The offline smoke result is not installation activation or provider evidence.

## 2. Provision owner-only runtime inputs

The service account must exclusively own the installation tree. The Spectrum
project secret and random local credential are file contents, never arguments or
environment variables. The configured `gbot` must be the existing Grok CLI and
must already have gateway authentication available to the service account.

```sh
sudo -u grok-photon install -d -m 0700 \
  /opt/grok-photon/runtime/captures /opt/grok-photon/runtime/staging \
  /opt/grok-photon/runtime/imports
sudo -u grok-photon sh -c 'umask 077; openssl rand -hex 32 > /opt/grok-photon/runtime/local-token'
sudo -u grok-photon install -m 0600 /secure/input/spectrum-project-secret \
  /opt/grok-photon/runtime/project-secret

sudo install -d -o root -g root -m 0700 /etc/grok-photon
sudo install -o root -g root -m 0600 /secure/input/grok-gateway.env \
  /etc/grok-photon/grok-gateway.env
```

`/etc/grok-photon/grok-gateway.env` contains the existing gateway's supported
`GROK_BOT_GATEWAY_URL` and `GROK_BOT_GATEWAY_TOKEN` assignments. Do not put
Photon credentials there. Confirm the Grok agent already exists and capture its
stable ID; this deployment does not create an agent.

## 3. Write the supported production configuration

Set these non-secret deployment values from the existing Spectrum and Grok
control planes:

```sh
export PHOTON_PROJECT_ID=project-id
export PHOTON_ACCOUNT_ID=account-id
export PHOTON_LINE_ID=line-id
export PHOTON_LINE_PHONE=+15555550101
export PHOTON_CONVERSATION_ID=provider-conversation-id
export GROK_AGENT_ID=existing-grok-agent-id
export GBOT_EXECUTABLE=/absolute/path/to/gbot
export PHOTON_CONTEXT_ID=photon-context-1
export PHOTON_TASK_ID=photon-task-1
export PHOTON_TASK_GENERATION=1
export PHOTON_ISSUED_AT_MS="$(/absolute/node-24.13.0/bin/node -e 'process.stdout.write(String(Date.now()))')"
export PHOTON_EXPIRES_AT_MS="$(/absolute/node-24.13.0/bin/node -e 'process.stdout.write(String(Date.now()+30*24*60*60*1000))')"
```

Generate the exact version-2 configuration. This example deliberately grants
only `text.send` to the one configured conversation; add operations only after
the account/line capability and authorization policy have been reviewed.

```sh
jq -n \
  --arg project "$PHOTON_PROJECT_ID" --arg account "$PHOTON_ACCOUNT_ID" \
  --arg line "$PHOTON_LINE_ID" --arg phone "$PHOTON_LINE_PHONE" \
  --arg conversation "$PHOTON_CONVERSATION_ID" --arg agent "$GROK_AGENT_ID" \
  --arg gbot "$GBOT_EXECUTABLE" --arg context "$PHOTON_CONTEXT_ID" \
  --arg task "$PHOTON_TASK_ID" --argjson generation "$PHOTON_TASK_GENERATION" \
  --argjson issued "$PHOTON_ISSUED_AT_MS" --argjson expires "$PHOTON_EXPIRES_AT_MS" \
  '{
    version: 2,
    activation: "disabled",
    provider: {
      kind: "spectrum-cloud-imessage",
      projectId: $project,
      projectSecretFile: "/opt/grok-photon/runtime/project-secret",
      accountId: $account,
      lineId: $line,
      phone: $phone,
      conversationId: $conversation,
      dedicated: true,
      availableOperations: ["text.send"]
    },
    local: {
      socketPath: "/opt/grok-photon/runtime/runtime.sock",
      credentialFile: "/opt/grok-photon/runtime/local-token",
      principalId: "grok-photon",
      credentialId: "grok-photon-local-v1"
    },
    task: {
      contextId: $context,
      taskId: $task,
      generation: $generation,
      permissions: ["text.send"],
      issuedAt: $issued,
      expiresAt: $expires,
      grokAgentId: $agent
    },
    grok: { executable: $gbot, timeoutMs: 15000 },
    authorization: {
      administrativeOperations: [],
      allowedRecipients: [],
      allowNativeContent: false
    },
    cards: [],
    runtime: {
      statePath: "/opt/grok-photon/runtime/state.sqlite",
      captureDirectory: "/opt/grok-photon/runtime/captures",
      stagingDirectory: "/opt/grok-photon/runtime/staging",
      importDirectory: "/opt/grok-photon/runtime/imports"
    }
  }' | sudo -u grok-photon tee /opt/grok-photon/runtime/configuration.json >/dev/null
sudo chmod 0600 /opt/grok-photon/runtime/configuration.json
sudo chown grok-photon:grok-photon /opt/grok-photon/runtime/configuration.json
```

The schema rejects unknown fields, paths outside `runtime/`, a noncanonical
socket/database path, duplicate operations, expired/stale authority, or an
operation not present in the task grant. Every private directory must be 0700;
every secret/configuration file must be a regular, owner-only, single-link 0600
file.

Validate without opening Spectrum, the socket, or Grok:

```sh
sudo -u grok-photon "$PHOTON_BIN/grok-photon-host" validate \
  --installation-root /opt/grok-photon
```

On the first validation only, a genuinely empty authority store receives the
task, context, and conversation reference atomically. Every later validation is
read-only with respect to the grant: durable cancellation, revocation,
permissions, issue/expiry times, generation, identities, scope, and resource
ownership must exactly agree with configuration. A partial, denied, expired, or
conflicting binding fails with a sanitized `AUTHORITY_*` code before Spectrum or
Grok is opened. Configuration is not a reauthorization mechanism. This release
has no administrative reauthorization command; use an independently reviewed
administrative state transition when one exists rather than editing or deleting
SQLite records.

### Trusted media and stream producers

The production composition exposes two in-process host APIs; neither is part of
the 44 JSON action schemas:

- `importMediaFile(principal, filename, metadata)` accepts only the authenticated
  configured principal and a basename inside `runtime.importDirectory`. The
  directory must be canonical, owner-only `0700`; the file is opened through the
  approved-root/no-symlink policy, validated, copied to private staging, fsynced,
  and published as a scoped durable descriptor. Generated input files must be
  `0600`; trusted host integration code submits only the returned descriptor.
- `registerTextStream(principal, source, expiresAt)` accepts an authenticated
  in-process principal and an `AsyncIterable<string>`, binds it to durable
  principal/scope/task/generation/expiry, and returns an inert stream reference.
  Submit only that reference. Action JSON cannot provide callbacks, paths,
  modules, shell text, or arbitrary network sources.

An embedding that needs either feature must install its trusted producer before
submitting the corresponding action. The standalone CLI deliberately has no
path/import or executable-stream option. An unconsumed live iterator cannot
survive process restart: its durable reference then fails explicitly instead of
being reopened. Consumed streams are terminal and completed child results replay
without opening them. `text.stream` remains a bounded buffered single-send
fallback, not native progressive delivery.

Capabilities use the same dependency inventory as execution preflight. A public
handler, enabled provider operation, ready single owner, current durable grant,
required media/stream/resource binding, administrative/native-content policy,
and card template must all be present where applicable. Media inside composed
content is evaluated per request. Runtime readiness remains separate from
provider acceptance, delivery/read, rendering, interaction, and device evidence.

## 4. Install the concrete systemd lifecycle

This is the supported supervisor path for this production composition. Bind the
unit to the selected immutable release and the exact Node 24.13.0 path:

```sh
sudo tee /etc/systemd/system/grok-photon.service >/dev/null <<EOF
[Unit]
Description=Grok Photon iMessage host
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=grok-photon
Group=grok-photon
EnvironmentFile=/etc/grok-photon/grok-gateway.env
Environment=PATH=/absolute/node-24.13.0/bin:/usr/bin:/bin
ExecStart=/opt/grok-photon/releases/$PHOTON_RELEASE/bin/grok-photon-host run --installation-root /opt/grok-photon
Restart=on-failure
RestartSec=5
TimeoutStopSec=45
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/grok-photon/runtime

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable grok-photon.service
```

## 5. Activate and verify local readiness

Activation is explicit and must occur while no host lock/socket exists:

```sh
sudo -u grok-photon "$PHOTON_BIN/grok-photon-host" enable \
  --installation-root /opt/grok-photon
sudo systemctl start grok-photon.service
sudo systemctl status --no-pager grok-photon.service
```

The process acquires `runtime/host.lock` with `O_EXCL`, opens one SQLite store,
constructs exactly one Spectrum client, recovers durable state, starts its one
stream receiver and outbox, then publishes the authenticated 0600 Unix socket.
It refuses an install lock, stale owner lock, socket collision, inactive/expired
configuration, modified release skill, missing handler, or provider readiness
failure. Startup never deletes a stale lock; an operator must first verify the
recorded PID/UID/release and process state.

Run local checks through the release-pinned task launcher, which verifies the
selected release and task generation before supplying the three client bindings:

```sh
sudo -u grok-photon "$PHOTON_BIN/grok-photon-task" \
  --installation-root /opt/grok-photon \
  --task-id "$PHOTON_TASK_ID" --generation "$PHOTON_TASK_GENERATION" \
  doctor --json
sudo -u grok-photon "$PHOTON_BIN/grok-photon-task" \
  --installation-root /opt/grok-photon \
  --task-id "$PHOTON_TASK_ID" --generation "$PHOTON_TASK_GENERATION" \
  capabilities --json
```

Readiness is only process/local/provider-owner readiness. It is not provider
acceptance, delivery, read state, rendering, interaction, or device proof.

## 6. Grok wake and task acceptance

Inbound work is durably captured and reduced before wake. The host invokes the
configured executable exactly as:

```text
/absolute/path/to/gbot --gateway send existing-grok-agent-id POINTER_ONLY_PROMPT
```

The fixed pointer-only prompt identifies only the durable handoff ID, task ID, generation,
selected release `SKILL.md`, and exact `grok-photon-task work.claim` command. It
contains no iMessage body, Photon secret, local token, or arbitrary shell input.
The launcher then pins the selected release and injects only
`GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET`, and
`GROK_PHOTON_CREDENTIAL_FILE` into the existing client. Gateway command success
means wake acceptance only; it does not acknowledge the durable handoff. Grok
must claim, heartbeat, and acknowledge the handoff by its ID as directed by the
release skill.

The existing `gbot` gateway authentication and Grok agent ID are deployment
inputs. `validate` confirms the executable and agent binding shape; a controlled external
task observation is still required before claiming that a particular
Grok deployment loaded the skill and accepted a task.

## 7. Shutdown and rollback

Orderly SIGTERM closes the local socket first, stops new inbound/outbox work,
closes the one provider owner and SQLite store, then removes only the socket and
host lock whose inode/content the process owns.

```sh
sudo systemctl stop grok-photon.service
sudo -u grok-photon "$PHOTON_BIN/grok-photon-host" disable \
  --installation-root /opt/grok-photon
sudo systemctl status --no-pager grok-photon.service
```

Do not delete a lock/socket or kill an unverified PID. If startup fails after
enable, run `disable` only after systemd confirms the process is stopped and the
normal cleanup has removed its owner markers.

Rollback is inactive and preserves SQLite, inbox, outbox, handoffs, receipts,
queued work, and unknown outcomes:

```sh
/absolute/node-24.13.0/bin/node /absolute/tools/rollback.mjs \
  /opt/grok-photon previous-release-sha256 confirm-inactive
```

Recompute `PHOTON_RELEASE`, reinstall the unit so `ExecStart` names the selected
release, re-run offline smoke and `validate`, then explicitly enable/start. The
task ID/generation and durable state remain configuration/state authority; the
new host never blindly retries `unknown-outcome` work.

## 8. Acceptance evidence by platform

The source checkout defines an automatic `ubuntu-latest`/`macos-latest` matrix
named `Assembled integration (<platform>)`, pinned to Node 24.13.0 and npm 10.9.2
with `fail-fast: false`. It runs locked installation, typecheck,
CLI/foundation/schema checks, the non-live assembled suite including real
installer/rollback fixtures, generated-skill drift, and package dry-run. A
committed workflow is only the required check definition; repository
branch-protection enforcement must be verified separately. Local macOS results
are recorded in `docs/worktrees/integration/TEST-EVIDENCE.md`; Linux results
require the remote workflow and are not inferred from this file.
