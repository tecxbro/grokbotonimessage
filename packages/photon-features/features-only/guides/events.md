# Incoming messages and feature interactions

Receiving is part of the existing connection. This profile does not install another
consumer. Preserve incoming text/markdown, reply target, attachments/voice metadata,
contact data, reactions, poll choices, and relevant native state in their typed forms.
A feature's outbound availability does not prove its required inbound event exists.

Message direction matters. Outbound echoes, read observations, typing and
administrative notifications are not new conversational messages that require a
reply. A reaction or selected poll choice has a real target; it is not empty text.
A read event is evidence about an outbound target, not an instruction to mark a
random inbound message read.

Do not deduplicate all events by the target message alone: a vote, unvote, reaction,
edit and receipt can refer to the same message while representing different events.
Keep actual event identity, source and observed timestamps, original line and chat,
participant identity when known, and unresolved references. Do not infer missing
identities from recency, display text or a forwarded link.

A deselected poll option is not a selection. Separate concurrent polls and preserve
actual option IDs. A card interaction needs its configured authenticated callback;
not every tap is delivered through `app.messages`. Imported state must not fabricate
an SDK session after restart.

There is no `receive` action to execute just because a message arrives. Existing
registered reducers and persistence process feature events. Preserve those paths
when binding an additional feature; loading a send builder alone does not implement
its interactive return path.

Sources: [event contract](../../src/contracts/events.ts),
[normalization](../../src/runtime/inbound/normalize.ts),
[poll feature](../../src/features/polls/module.ts),
[card feature](../../src/features/cards/module.ts).
Photon references: [message types](https://photon.codes/docs/spectrum-ts/messages),
[poll choices](https://photon.codes/docs/spectrum-ts/content/polls),
[read observations](https://photon.codes/docs/spectrum-ts/content/read).
