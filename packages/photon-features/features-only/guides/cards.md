# App cards and original-card updates

`app.send` takes `space`, a registered `templateId`, and an HTTPS `url`.
`app.sendCustomized` additionally takes `layout`.
`app.update` takes the original `card`, its matching `session`, and `layout`.
The session's `cardId` must match the card's ID. Layout contains `caption` (at most
300 characters), optional `subcaption` (at most 300), and optional guarded `image`.
Do not use a new-send schema to update an existing card.

Keep these capabilities distinct: a rich link; a universal static card; an installed
extension's live UI; a customized registered extension; an authenticated callback;
an in-place update. A static preview proves none of the latter capabilities.
The built-in `universal-static` template accepts ordinary HTTPS URLs without a
custom extension/backend. Other templates require their actual configuration.
An arbitrary URL is not proof that a custom template exists.

Preserve the original returned message and provider-managed update session.
A successful update may return no replacement message. Public lookup must establish
original-session readiness after restart; missing session means a blocked update,
not permission to reconstruct SDK internals or send another card. Serialize updates
and reject an older revision that would replace a newer one.

Callbacks require the configured backend's real authenticated return path and
participant identity. The inherited signed-card-v1 protocol is application-owned,
not Photon-native. A forwarded URL or address field does not prove who interacted.
A callback must bind to the actual card/session, enforce expiry/replay checks, and
retain unresolved identity. Do not assume all taps arrive on the message stream.

This feature surface sends registered cards; it contains no app-generation,
hosting, publication, extension-installation or speech-generation operation.

Sources: [action/layout schemas](../../src/contracts/actions.ts),
[card implementation](../../src/features/cards/module.ts),
[Photon app cards and session behavior](https://photon.codes/docs/spectrum-ts/content/app).
