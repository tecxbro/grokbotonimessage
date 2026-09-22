# Fresh Photon setup for Grok Bot

This profile installs the finished full-feature runtime on **Grok Bot's Linux cloud
VM**. It does not tell the bot how to reason, delegate, speak or organize other bots.
It preserves the friend setup's responsibilities: persistent Spectrum connection,
persisted batches, native wake-only webhook, deliberate local output operations.

## 1. Install the program

Start with a clean checkout of `improving-friends-bot`. Use **Node 24.13.0** and
**npm 10.9.2**, as required by the existing release format. Do not run this on the
owner's Mac. Install those exact runtimes using the VM's available package/version
manager when absent; no integration code needs to be written. Git, npm registry
access and the intended installation parent's write permission are required.

```sh
git clone --single-branch --branch improving-friends-bot \
  https://github.com/tecxbro/grokbotonimessage.git
cd grokbotonimessage
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm run photon:build
node packages/photon-features/scratch-setup/install.mjs \
  --root /workspace/photon-imessage
```

`install.mjs` builds the actual existing full release through all packaging checks,
then installs it inactive. It rejects dirty source or an incompatible artifact,
preserves the private state directory and writes the stable entry point:

```text
/workspace/photon-imessage/photon.mjs
```

A published tested archive avoids building on the VM:

```sh
node packages/photon-features/scratch-setup/install.mjs \
  --root /workspace/photon-imessage \
  --archive /absolute/release.gpf.gz --sha256 ACTUAL_PUBLISHED_CHECKSUM
```

Never invent a checksum or release manifest. A `.gpf.gz` is the program's validated
custom archive, not a tarball. Installer output identifies the exact release.
Installation does not start Spectrum or send an iMessage.

Use a short absolute root to fit Unix socket limits. Do not reuse an unrelated
folder or install alongside another active runtime on the same Photon binding.
For an existing bot, first account for old queued/unknown sends and stop its exact
service with authorization. This fresh path refuses to overwrite existing authority.

## 2. Create the actual native wake routine

Using **this bot's available native routine tool/UI**, create or reuse a webhook
routine named `Photon iMessage wake`. Use the instructions in [ROUTINE.md](ROUTINE.md)
and the installed absolute helper path above. Do not create another bot or change
role topology. Do not guess an internal endpoint or a bot UUID.

Capture its real HTTPS URL and sender key privately. The binding contract follows
the supplied working setup: `Authorization: Bearer <key>`, POST body `{batchId}`.
If the actual routine uses a different contract, stop and report the mismatch;
do not silently adapt credentials or invent a platform API.

Pass this **local binding format**, filled with the actual returned values, to:

```sh
node /workspace/photon-imessage/photon.mjs bind-webhook --json-stdin
```

```json
{"version":1,"url":"ACTUAL_NATIVE_ROUTINE_HTTPS_URL","key":"ACTUAL_SENDER_KEY","routineId":"ACTUAL_ROUTINE_ID"}
```

`routineId` is optional. The placeholders are not live values. Use stdin/private
mode-0600 files through the VM's secure tool; do not put secrets in arguments, chat,
Git, task descriptions or output logs. Rebinding the same values is idempotent;
changing an established routine requires an explicit migration. Binding does not
trigger the routine or claim that the endpoint works.

## 3. Photon login and sender enrollment

```sh
node /workspace/photon-imessage/photon.mjs connect --address '+YOUR_ACTUAL_NUMBER'
```

Use the actual iMessage handle supplied by the owner, which can be an Apple email
where already enrolled. The existing setup code privately installs/reuses Photon
CLI 2.2.0, runs `login --no-browser` when needed, and displays its real approval
URL/code. The owner completes that sign-in. The program reads the existing project
secret privately; it never uses a dashboard login token as the Spectrum secret.

For a single suitable project and enrolled sender, setup discovers the required
values without asking for internal IDs. With multiple projects, use the owner's
selected project from the reported candidates and rerun `connect --project ID`.
A new account may first need a project or enrollment. The `account` helper implements
these **typed setup operations** using verified CLI 2.2.0 commands, without billing,
line provisioning, invitations or secret rotation:

```sh
node /workspace/photon-imessage/photon.mjs account --json-stdin
```

```json
{"operation":"project.create","name":"Grok iMessage"}
```

This creates an iMessage-enabled project using the pinned CLI's `--platforms imessage`
contract, not the newer website's different flag example. It uses the CLI's default
location unless the owner supplies `location`. Then rerun `connect` with the actual
returned project ID. Project creation can auto-enroll the owner; inspect discovery
before adding a duplicate user.

When the intended sender is not enrolled, supply real contact information:

```json
{"operation":"user.add","projectId":"ACTUAL_PROJECT_ID","firstName":"ACTUAL_FIRST_NAME","lastName":"ACTUAL_LAST_NAME","email":"ACTUAL_EMAIL","phone":"ACTUAL_E164"}
```

The pinned CLI requires all four contact fields. Ask only for genuinely missing
owner information; never invent it. This command does not send an invitation.
For an existing project that lacks iMessage, explicit `imessage.enable` with its
`projectId` enables that platform without buying a line. Shared-line availability
is controlled by Photon; inability to enroll is not permission to upgrade billing.

Rerun `connect` after prerequisite changes. It creates real local authority/token,
keeps all 44 operation permissions, validates configuration and enables the selected
runtime. Existing revocation/cancellation is never reset by repeat setup. No
`servingE164`, fixed sending line, manual conversation ID or Grok executable is needed
for shared mode. The actual initial DM is resolved by the running SDK; no chat GUID
is synthesized from a phone number.

A timed-out account mutation has an unknown outcome. Inspect discovery before
retrying so project/enrollment actions are not duplicated.

## 4. Keep the Spectrum process running

On a host with a working user service manager:

```sh
node /workspace/photon-imessage/photon.mjs install-user-service
node /workspace/photon-imessage/photon.mjs service-status
```

This writes an installation-specific systemd user unit, enables it and verifies
that it is active. It does not enable user lingering, change root services or claim
that the entire VM will stay running. The unit records the current immutable release;
review/update it explicitly during upgrades.

If `USER_SERVICE_MANAGER_UNAVAILABLE` is reported, the bundled process supervisor
can still run independently of the current shell/turn while the VM runs:

```sh
node /workspace/photon-imessage/photon.mjs start
node /workspace/photon-imessage/photon.mjs service-status
node /workspace/photon-imessage/photon.mjs doctor
```

That supervisor monitors the full host's IPC heartbeat, restarts a crashed/hung child,
and uses conservative same-installation dead-owner recovery. Unknown ownership is
an error, not permission to delete locks. Repeated failure stops rapid retries and
reports `failed`. `start` reporting `starting` is not readiness; inspect `service-status`
and `doctor`. A healthy idle stream is not restarted merely for having no traffic.

`stop` asks the supervisor to cleanly stop its child. `restart` does that then starts
one replacement. For a systemd-managed installation, use `systemctl --user stop|start`
with the returned unit name to control the service registration as well. Do not
leave a restart-capable old service enabled during cutover.

**Detached supervision is not boot persistence.** Neither a detached supervisor nor
systemd inside the VM can receive events while that entire VM is suspended. Verify
cold boot/resume on the actual Grok host; report its limitation rather than adding
an anti-idle loop or promising uninterrupted reception.

## 5. Use the supplied features

The runtime now supplies the real execution/resource binding. Read the installed
[neutral feature skill](../features-only/SKILL.md) and [catalog](../features-only/CATALOG.md).
The stable helper submits through private authenticated IPC, never another Spectrum
client. It supports every registered feature action through `execute` and `respond`.

```sh
node /workspace/photon-imessage/photon.mjs capabilities
node /workspace/photon-imessage/photon.mjs inbox
node /workspace/photon-imessage/photon.mjs read-batch --next
node /workspace/photon-imessage/photon.mjs execute --json-stdin
node /workspace/photon-imessage/photon.mjs status --request-id ACTUAL_REQUEST_ID
```

Feature input is exactly `{operation, arguments, idempotencyKey}`. The installed
binding supplies trusted context, so do not add destination/context overrides.
Use actual references returned in the incoming event or prior result. For final
responses, `respond --batch-id ID --fence N --json-stdin` admits the output and
completes that exact work claim atomically. The runtime sends durable queued output
independently of the bot turn. One JSON operation or an array of up to 16 is accepted.
`finish --batch-id ID --fence N` records an intentional no-output completion.

Guarded generated-file import and registered streaming are available through
`media.import`, `stream.open`, `stream.append`, `stream.close`, and `stream.abort`
with JSON stdin and their existing producer schemas. Put generated media in the
configured private `runtime/imports` directory. These are implemented resource
ports, not an invitation to send arbitrary paths, code or URLs to the SDK.

All 44 contracts are preserved, **not universally available**. Four native poll
management operations remain blocked in the inherited shared-owner binding; cold
card/reaction recovery and configured app/backend prerequisites retain their limits.
Feature `capabilities` reports those accurately. Calls/TTS are not added by this setup.

## 6. Typing and liveness

Pickup marks the message read and starts typing. Genuine heartbeat reports maintain
work activity across tool/worker waits; the runtime refreshes dots every eight
seconds using its existing manager. It does not extend the work claim itself.
Report actual ongoing work approximately every 20–30 seconds using `heartbeat`
with the returned batch/fence. Claims expire after 60 seconds without a report.

Progress output does not complete work. Final output remains in a bounded responding
state until its queued send settles (maximum 60 seconds), then dots stop. Waiting
for the user's answer/no-response completion stops typing. Old claims cannot turn
off newer active work; restart requires fresh activity evidence.

This profile does **not** have an invented feed of Grok's private thinking state.
The routine must report real activity through the supplied helper. Do not launch
an independent forever-heartbeat timer that makes an abandoned task look active.
Manual typing features remain available; do not operate a competing typing loop.

## 7. Verify on the actual bot

Read [LIVE-CHECKLIST.md](LIVE-CHECKLIST.md). Installation and offline checks do not
send a test iMessage. After setup, ask the owner to send a new message through
his/her existing iMessage chat; replying to that real inbound request is the intended
operation. Keep the action's description accurate: it is an external response,
not an offline test. Do not disable Auto Review or bypass an approval.

Report separately: installed, configured, supervised, receive loop ready, native
wake accepted, batch picked up, response queued, provider accepted, device observed,
and overnight persistence. The first five do not imply the final five.
