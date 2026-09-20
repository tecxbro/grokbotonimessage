# Message actions

`message.get` resolves a real scoped message. `message.reply` takes that `message`
and one supported leaf as `content`; it preserves the target relationship. Do not
construct a target from quoted words or assume the newest message is the target.

`message.react` takes `message` and one of **love, like, dislike, laugh, emphasize,
question** as `reaction`. Those are the six accepted application values. The SDK
can support other emoji, but this action schema does not accept them. A sufficient
targeted acknowledgment can be a reaction; it does not replace a requested answer.

`reaction.remove` takes an actual `reaction` reference including its parent message.
Use the authorized original reaction handle. Missing cold restoration returns
`REACTION_COLD_RECOVERY_UNAVAILABLE`; do not infer a handle from an emoji, remove
somebody else's reaction, or add a second reaction as a substitute.

`message.edit` takes an eligible outbound `message` and replacement `text`.
`message.unsend` takes an eligible outbound `message`. Respect native eligibility
and the current result. These controls can succeed without returning a new message;
keep the original target rather than inventing a replacement ID. A mutation of an
inbound or wrong-scope message must fail before dispatch.

`message.markRead` takes an inbound `message`. With remote iMessage it identifies
the conversation to mark read, not just an isolated message. This action does not
prove that a recipient read an outgoing message. Received read observations are
separate evidence. Missing evidence does not mean unread.

**Example selection:** use a targeted reply when answering one particular message;
use an edit for an authorized correction to a sent message, not to hide a failed
send; use unsend only for the actual requested eligible target.

Sources: [package inputs](../../src/contracts/actions.ts),
[references](../../src/contracts/resources.ts),
[message implementations](../../src/features/text-messages/module.ts),
[reaction implementation](../../src/features/text-messages/reactions.ts).
Photon references: [tapbacks](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/tapback-reactions),
[edits](https://photon.codes/docs/spectrum-ts/content/edits),
[unsend](https://photon.codes/docs/spectrum-ts/content/unsend),
[read](https://photon.codes/docs/spectrum-ts/content/read).
