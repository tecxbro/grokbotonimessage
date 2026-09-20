# Conversation and native iMessage features

`space.get`, `space.getName`, `space.getMembers`, `space.getAvatar` take an existing
`space` reference and read state. Reads do not authorize membership or appearance
mutations. `space.create` takes explicitly authorized `members` and optional `name`;
it does not take an arbitrary pre-existing space. Members is a nonempty array of
at most 32 strings, each 1–254 characters. Names are 1–200 characters.

`space.rename` adds `name`; `space.addMembers` and `space.removeMembers` add `members`;
`space.leave` takes `space`. Creating conversations, expanding recipients, removing
members or leaving requires the corresponding existing permission and actual native
prerequisites. Shared/free messaging is not proof of dedicated-only group support.
Never provision a different line simply because a feature is unavailable.

`space.setAvatar` and `space.setBackground` take `space` and guarded `media`.
`space.clearAvatar` and `space.clearBackground` take only `space`. Use the media
reference/staged-descriptor contract; these operations do not open arbitrary paths
or download untrusted URLs outside the guarded media services.

`account.shareContact` takes `space` and shares the sending account's own native
contact identity. It is distinct from `contact.send` with supplied contact data.
`metadata.get` takes `message` and returns curated native fields, not the whole
SDK graph or credentials. Preserve original conversation and line on every lookup.
Missing delivery/read observations remain unknown.

`effect.send` takes `space` and `content` shaped as
`{type:"effect",effect:EFFECT,content:LEAF}`. The accepted effect values are **slam,
loud, gentle, invisible-ink, confetti, balloons, fireworks, lasers, celebration,
echo, spotlight, love, shooting-star**. Do not add a top-level `effect` field or use
raw Apple identifiers. Check the chosen leaf/provider combination. Send the desired
effect once, not a plain duplicate followed by an animated duplicate.

`custom.send` takes `space`, registered `codecId` and an authorized card `resource`.
Only the registered validated handler defines its content. This is not an arbitrary
SDK method, HTTP endpoint, executable payload or raw JSON forwarding mechanism.

Incoming group/member/appearance notifications describe state changes. They are not
automatic permission to change the group again or send another message.

Sources: [exact package contract](../../src/contracts/actions.ts),
[native feature code](../../src/features/native/module.ts),
[guarded content types](../../src/contracts/content.ts).
Photon references: [spaces](https://photon.codes/docs/spectrum-ts/spaces-and-users),
[effects](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/message-effects),
[membership](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/group-membership),
[backgrounds](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/chat-backgrounds).
