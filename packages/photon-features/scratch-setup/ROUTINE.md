# Photon iMessage wake

Use the installed `/workspace/photon-imessage/photon.mjs` helper. Substitute the
actual installation root once if different. Read the installed `features-only/SKILL.md`
for feature inputs, targets, prerequisites and results. Do not load the inherited
gateway/role profile for this routine.

On wake, run `read-batch --batch-id ACTUAL_BATCH_ID`. If the native trigger does not
expose its body, run `read-batch --next` instead. This reads and claims real persisted
input; the webhook is only a notification. `NO_PENDING_WORK`, an already claimed
batch or a stale/closed claim means stop this duplicate invocation quietly, not
create a second response or another work item.

Use the returned original event content, route and resource references. Keep its
batch ID and claim fence for the following helper calls. Respond to real incoming
messages in the originating conversation through the supplied feature operations.
A queued result is not proof of device delivery; use `status` for actual outcomes.

During genuinely ongoing work, report activity about every 20–30 seconds:

```sh
node /workspace/photon-imessage/photon.mjs heartbeat --batch-id ACTUAL_BATCH_ID --fence RETURNED_FENCE
```

This maintains the work claim and native typing, including while verified work is
running elsewhere. It sends no message. Do not use an independent blind heartbeat
process. A lost claim is not permission to send its old result under a new identity.

For a deliberate progress message, invoke `execute --json-stdin`. For a final response
or question awaiting the user, invoke:

```sh
node /workspace/photon-imessage/photon.mjs respond --batch-id ACTUAL_BATCH_ID --fence RETURNED_FENCE --json-stdin
```

Pass exactly `{operation, arguments, idempotencyKey}` using the selected feature's
real schema and authorized targets. Keep a stable key such as `ACTUAL_BATCH_ID:final-1`
for the same intended effect and unchanged content. An identical retry returns the
existing completion/results, not another send. A changed payload with that key is
an error. The response and work completion are recorded atomically; the persistent
runtime sends it even after this invocation ends.

`respond` accepts one operation or a bounded array. An intentional no-output result
uses `finish --batch-id ID --fence N`. `unknown-outcome`, failed status or transport
uncertainty is not permission to try a second sender, new key or replacement card.
Retain the recorded evidence and reconcile before any retry.

The helper is real code, not Photon CLI and not a gateway command. Do not implement
new integration code for an ordinary feature request or start another receiver.
Installation's restriction on unsolicited tests does not prohibit replies and
relevant progress for actual user messages. Describe live sends honestly and honor
any platform approval; do not change security settings or hide the external effect.
