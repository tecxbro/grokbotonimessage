# Polls and answers

`poll.create` takes `space`, `question` (1–500 characters) and **2–12** `options`.
Each option is `{key,label}` with a unique local key and a 1–200-character label.
The argument names are not `title` and `choices`. Local keys and display labels are
not the native `optionIdentifier`, and a poll reference is not just a message string.

Use a poll when a bounded selection is the requested experience. A prose list does
not establish that a poll was created. Preserve the resulting poll/message and
option references. Correlate answers to their real source; never to the newest poll
or a matching option label. A deselection is not a positive answer. Do not issue a
vote operation to record an incoming human tap.

The catalog also retains `poll.get`, `poll.vote`, `poll.unvote`, `poll.addOption`.
**In the reviewed Spectrum 12.8.0 shared-owner binding these four operations are
blocked by the missing public native-management binding.** Their schemas are not
proof that they execute here. Photon documents the underlying native APIs; the
limitation is this package binding, not a statement that Photon lacks those features.

When a compatible management binding becomes genuinely available, `poll.get` takes
`poll`; vote/unvote take `poll` and its actual `poll-option` reference; addOption takes
`poll` and a new `{key,label}` value. Voting acts as the authenticated sending account,
not another participant. Cross-poll option references are rejected.

Incoming selected choices are structured content. This code may normalize a
`poll-answer` with `optionText`, nullable `question`, `selected`, `answerText`,
`captureId` and nullable verified `correlation`. A capture ID is provenance, not
native identity. Retain unresolved correlation rather than synthesizing a poll ID.
Two simultaneous polls, identical labels, repeated events, unvotes and restart
must not collapse into one choice record.

Sources: [package actions](../../src/contracts/actions.ts),
[poll implementation](../../src/features/polls/module.ts),
[binding evidence](../SOURCES.md).
Photon references: [poll content and incoming choices](https://photon.codes/docs/spectrum-ts/content/polls),
[native management API](https://photon.codes/docs/advanced-kits/imessage/polls).
