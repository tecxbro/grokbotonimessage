# Text and composition

Use `text.send` for ordinary prose, `markdown.send` for supported formatting and
`link.send` for an HTTPS URL. Preserve the existing formatter; do not add another
character-based splitter. Structured content bypasses prose rewriting.

**Package inputs:** `text.send` and `markdown.send` take `space` and `text`.
Text is 1–16000 characters. `link.send` takes `space`, `url`, and optional `title`
(up to 300 characters). Its HTTPS URL is at most 2048 characters. Do not copy a raw
SDK call's argument shape into this application contract.

`text.stream` takes a real registered `stream` reference, not a generator, model
name, transcript, function, URL or array of fabricated tokens. It is single-use.
The current production implementation supports progressive remote-iMessage delivery;
an explicitly reported buffered mode is a different experience. Partial/unknown
outcomes do not authorize consuming the source again or sending a replacement.

The optional existing producer API is `stream.open`, `stream.append`,
`stream.close`, `stream.abort`. These are helper methods outside the 44-operation
catalog, and only usable if the integration binds them. Open input is
`{"version":1,"ttlMs":30000}`. Append uses version, the returned stream, increasing
zero-based sequence, and inert `text`; close uses the next sequence without text;
abort uses version and the returned stream. Use the canonical helper schemas,
not new command names. The inherited producer limits include a 30-second lifetime,
5-second progress timeout, 4096 chunks, 4096 characters per append, 16000 source
characters total, and 8192 queued bytes. This profile does not lengthen those limits.

`content.group` takes `space` and `{type:"group",items:[LEAF,...]}` as `content`.
Use 1–8 supported leaves. `content.compose` takes `space` and
`{type:"compose",items:[LEAF_OR_GROUP,...]}` with 1–16 items. These describe content,
not conversation creation. Groups are not transactions. Preserve individual part
outcomes; failure after two accepted items is not permission to resend those items.

**Example selection:** send a requested report as composed explanatory text and an
existing attachment; use a link for a URL; use a grouped unit only when grouping is
actually desired. These choices do not change the media authorization requirements.

Sources: [package schema](../../src/contracts/actions.ts),
[content schema](../../src/contracts/content.ts),
[streaming implementation](../../src/features/text-messages/streaming.ts).
Photon documents [single-use progressive/fallback streams](https://photon.codes/docs/spectrum-ts/content/text)
and [sequential composition versus grouping](https://photon.codes/docs/spectrum-ts/content/composing-content).
