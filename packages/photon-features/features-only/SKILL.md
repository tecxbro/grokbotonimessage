---
name: photon-features
description: Choose and use implemented Photon messaging features with exact inputs, scoped targets, capability checks, and honest results.
---

# Photon features

Use this skill for messaging features: text, streaming, replies, reactions, read
state, typing, media, contacts, polls, cards, conversation operations and effects.

## Feature selection

| Requested result | Feature guide |
| --- | --- |
| Plain or formatted text, links, incremental text, grouped/composed content | [Text and composition](guides/text.md) |
| A specific reply, reaction/removal, edit, unsend, message lookup or read control | [Message actions](guides/messages.md) |
| Typing start, renewal and stop controls | [Typing](guides/typing.md) |
| An image, file, existing audio note or contact card | [Media](guides/media.md) |
| A poll, incoming answer or available native poll operation | [Polls](guides/polls.md) |
| A static/customized card or an update to the original card | [Cards](guides/cards.md) |
| A conversation, members, appearance, contact identity, effects or metadata | [Native features](guides/native.md) |

The [catalog](CATALOG.md) links **every operation** to its exact source, schema and
canonical example. [Inputs](guides/inputs.md) defines references and content shapes;
[events](guides/events.md) covers incoming interactions; [results](guides/results.md)
explains completion evidence and retry limits.

## Use the implemented contract

Inspect current scoped capabilities before selecting a format. Separate provider
support, implemented code, configured availability and live evidence. A listed
operation, an exported builder, or a resolved no-op is not proof of availability.

The supplied feature client has these methods:

```js
await features.capabilities();
await features.prepare({ operation, arguments: featureArguments, idempotencyKey });
await features.execute({ operation, arguments: featureArguments, idempotencyKey });
await features.status(requestId);
```

`features` is the client bound by the existing integration, not a pre-existing shell
command. `prepare` validates and returns a request without submitting it; `execute`
submits once through the bound authenticated execution port. Only submit intended,
authorized effects. The library binding and imports are documented in [LIBRARY](LIBRARY.md).

Supply only the three input fields shown. Use the exact operation-specific
`arguments` from the linked schema/example, replacing fixture references with real
authorized references. The binding supplies the context. Keep one stable
idempotency key for one intended action and unchanged content. Do not change the
key or the target merely to work around an uncertain result.

Preserve original conversation and line identity. A raw phone number, display
label, snippet of text or example ID is not a resource reference. Use supported,
authorized fallbacks only when they preserve the requested effect. In particular,
a new card is not an update to an old card, a new tapback is not reaction removal,
and a text list is not proof that a native poll was created.

The guides specify feature behavior and technical limits. Existing text formatting
and typing controls remain in effect; this profile supplies no replacement style
or activity policy.
