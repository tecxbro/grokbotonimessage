# Inputs and resource references

The canonical wire request has exactly `version:1`, `idempotencyKey`, `contextId`,
`operation`, `arguments`. The feature client accepts the latter operation payload,
its stable key and no context override; it inserts the context supplied by the
existing authenticated binding. Parsing is structural validation, not authorization.
The executor must still validate the current authority and target before an effect.

References are returned objects, not raw IDs. Their common fields are `version:1`,
`kind`, `id`, `scope`. Scope contains `projectId`, provider `imessage`, `accountId`,
`lineId`, `spaceId`. Preserve them unchanged. Attachment, reaction, poll and card
references carry a parent `messageId`; a poll option carries `pollId`; a card session
carries `cardId`. A stream reference also carries its actual generation and expiry.
Those technical fields do not select people, processes or execution roles.

Do not create references from a phone number or Spectrum's native conversation
string. In particular, the application reference ID validator is not a license to
reformat a provider ID. The authoritative resolver owns that mapping. Even a
structurally valid same-line reference needs the correct current grant.

The supported leaf `type` values are text, markdown, link, attachment, voice,
contact, poll, app and registered-custom. A group has 1–8 leaves; a compose has 1–16
leaves/groups. A reply or effect wraps one leaf, not arbitrary nested wrappers.
The exact discriminated schema is the authority for permitted combinations.

Respect the 262144-byte request limit, bounded inert JSON depth and field-specific
limits. Do not pass functions, accessors, SDK instances, cyclic structures, raw
provider dictionaries or additional fields. Fixture examples are syntax examples;
they do not confer access to the described resources.

Sources: [actions](../../src/contracts/actions.ts),
[resources](../../src/contracts/resources.ts),
[content](../../src/contracts/content.ts),
[per-operation examples](../CATALOG.md).
