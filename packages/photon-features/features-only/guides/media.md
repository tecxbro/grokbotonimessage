# Attachments, voice notes and contacts

`attachment.send` and `voice.send` take `space` and `media`. Media is either an
actual authorized attachment reference or the exact descriptor returned by guarded
staging: `stagingId`, lowercase 64-character `sha256`, `mimeType`, and positive
`bytes` (maximum 25 MiB in this schema). Do not fabricate a hash/size or pass an
arbitrary filesystem path, URL, inline binary or SDK object through action JSON.

`attachment.fetch` takes an authorized `attachment` reference. Preserve its original
message, native identifier and sending line. Use the returned staged descriptor;
fetching bytes does not send them. Bounded reads, validated MIME/size, approved
sources and retention remain enforced by the existing media services.

The existing optional `media.import` helper stages a completed file from the
configured private import directory. Its exact input is
`{"filename":"result.png","metadata":{"mimeType":"image/png","name":"result.png"}}`.
`filename` is a basename; metadata name and duration are optional. The response's
staged descriptor becomes `arguments.media` unchanged. Import is not a send, and
this helper is usable only when its real import binding is present. There is no
arbitrary path/URL override. These helper details are not a new 45th action.

`voice.send` sends existing audio; it does not create speech, transcribe audio or
place a live call. Native voice-note delivery and ordinary-audio fallback must be
reported separately. Do not promise audio generation merely because sending exists.

`contact.send` takes `space` and `contact` containing `name:string`, `phones:string[]`,
`emails:string[]`. Name is 1–200 characters; each array has at most ten entries.
Phones must be E.164 and emails valid. This deliberately narrower package contract
is not the SDK's richer structured-contact signature. Native sharing of the sending
account's identity is instead `account.shareContact`.

Sources: [action inputs](../../src/contracts/actions.ts),
[media/contact schemas](../../src/contracts/content.ts),
[media implementation](../../src/features/media/module.ts).
Photon references: [attachments](https://photon.codes/docs/spectrum-ts/content/attachments),
[voice](https://photon.codes/docs/spectrum-ts/content/voice),
[contacts](https://photon.codes/docs/spectrum-ts/content/contacts).
