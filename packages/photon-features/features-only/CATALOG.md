# Photon feature catalog

The existing action contract is authoritative. These are application operation
names, not assumed Photon CLI subcommands. Select an available feature, use its
actual references and schema, then inspect the returned outcome.

All 44 operations are retained. **Listed does not mean configured or live-verified.**
Four native poll-management operations are blocked in the reviewed shared-owner
binding. Other operations require current capability/resource checks. The JSON
catalog is an index, not a second validator or a support guarantee.

Each linked example is the existing canonical package example. Its fixture IDs
are not real targets or authorization. The feature client takes `operation`,
`arguments`, and `idempotencyKey`; the bound execution port supplies `contextId`.
Use the exact `arguments` shape from the example, not the full example as arguments.

| Operation | Required argument keys | Optional keys | Purpose | Code / schema / example / guide |
| --- | --- | --- | --- | --- |
| `typing.begin` | `space`, `ttlMs` | None | Start or renew a bounded typing indication. | [code](../src/runtime/typing/operations.ts) / [schema](../schemas/typing.begin.json) / [example](../examples/wt-08/typing.begin.json) / [guide](guides/typing.md) |
| `typing.end` | `space` | None | End the applicable typing indication. | [code](../src/runtime/typing/operations.ts) / [schema](../schemas/typing.end.json) / [example](../examples/wt-08/typing.end.json) / [guide](guides/typing.md) |
| `text.send` | `space`, `text` | None | Send ordinary text. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/text.send.json) / [example](../examples/wt-08/text.send.json) / [guide](guides/text.md) |
| `text.stream` | `space`, `stream` | None | Consume an authorized registered incremental text source. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/text.stream.json) / [example](../examples/wt-08/text.stream.json) / [guide](guides/text.md) |
| `markdown.send` | `space`, `text` | None | Send supported formatted text. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/markdown.send.json) / [example](../examples/wt-08/markdown.send.json) / [guide](guides/text.md) |
| `link.send` | `space`, `url` | `title` | Send an HTTPS link with optional title. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/link.send.json) / [example](../examples/wt-08/link.send.json) / [guide](guides/text.md) |
| `content.group` | `space`, `content` | None | Send one logical group of content. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/content.group.json) / [example](../examples/wt-08/content.group.json) / [guide](guides/text.md) |
| `content.compose` | `space`, `content` | None | Send an ordered composition. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/content.compose.json) / [example](../examples/wt-08/content.compose.json) / [guide](guides/text.md) |
| `message.get` | `message` | None | Read a known message reference. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.get.json) / [example](../examples/wt-08/message.get.json) / [guide](guides/messages.md) |
| `message.reply` | `message`, `content` | None | Reply to one known message with leaf content. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.reply.json) / [example](../examples/wt-08/message.reply.json) / [guide](guides/messages.md) |
| `message.react` | `message`, `reaction` | None | Add a supported tapback to one message. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.react.json) / [example](../examples/wt-08/message.react.json) / [guide](guides/messages.md) |
| `reaction.remove` | `reaction` | None | Remove a known authorized reaction. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/reaction.remove.json) / [example](../examples/wt-08/reaction.remove.json) / [guide](guides/messages.md) |
| `message.edit` | `message`, `text` | None | Edit an eligible previously sent message. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.edit.json) / [example](../examples/wt-08/message.edit.json) / [guide](guides/messages.md) |
| `message.unsend` | `message` | None | Unsend an eligible previously sent message. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.unsend.json) / [example](../examples/wt-08/message.unsend.json) / [guide](guides/messages.md) |
| `message.markRead` | `message` | None | Mark the target inbound conversation read. | [code](../src/features/text-messages/module.ts) / [schema](../schemas/message.markRead.json) / [example](../examples/wt-08/message.markRead.json) / [guide](guides/messages.md) |
| `attachment.send` | `space`, `media` | None | Send an existing authorized media resource. | [code](../src/features/media/module.ts) / [schema](../schemas/attachment.send.json) / [example](../examples/wt-08/attachment.send.json) / [guide](guides/media.md) |
| `attachment.fetch` | `attachment` | None | Stage bytes from a known inbound attachment. | [code](../src/features/media/module.ts) / [schema](../schemas/attachment.fetch.json) / [example](../examples/wt-08/attachment.fetch.json) / [guide](guides/media.md) |
| `voice.send` | `space`, `media` | None | Send an existing audio resource as a voice note. | [code](../src/features/media/module.ts) / [schema](../schemas/voice.send.json) / [example](../examples/wt-08/voice.send.json) / [guide](guides/media.md) |
| `contact.send` | `space`, `contact` | None | Send a contact card. | [code](../src/features/media/module.ts) / [schema](../schemas/contact.send.json) / [example](../examples/wt-08/contact.send.json) / [guide](guides/media.md) |
| `poll.create` | `space`, `question`, `options` | None | Send a poll with a bounded question and choices. | [code](../src/features/polls/module.ts) / [schema](../schemas/poll.create.json) / [example](../examples/wt-08/poll.create.json) / [guide](guides/polls.md) |
| `poll.get` | `poll` | None | Read a known poll through an available native binding. | [code](../src/features/polls/module.ts) / [schema](../schemas/poll.get.json) / [example](../examples/wt-08/poll.get.json) / [guide](guides/polls.md) |
| `poll.vote` | `poll`, `option` | None | Select an option using the authenticated account. | [code](../src/features/polls/module.ts) / [schema](../schemas/poll.vote.json) / [example](../examples/wt-08/poll.vote.json) / [guide](guides/polls.md) |
| `poll.unvote` | `poll`, `option` | None | Remove the authenticated account’s selection. | [code](../src/features/polls/module.ts) / [schema](../schemas/poll.unvote.json) / [example](../examples/wt-08/poll.unvote.json) / [guide](guides/polls.md) |
| `poll.addOption` | `poll`, `option` | None | Append a choice to a known poll. | [code](../src/features/polls/module.ts) / [schema](../schemas/poll.addOption.json) / [example](../examples/wt-08/poll.addOption.json) / [guide](guides/polls.md) |
| `app.send` | `space`, `templateId`, `url` | None | Send a card using a registered template. | [code](../src/features/cards/module.ts) / [schema](../schemas/app.send.json) / [example](../examples/wt-08/app.send.json) / [guide](guides/cards.md) |
| `app.sendCustomized` | `space`, `templateId`, `url`, `layout` | None | Send a customized card with a registered layout. | [code](../src/features/cards/module.ts) / [schema](../schemas/app.sendCustomized.json) / [example](../examples/wt-08/app.sendCustomized.json) / [guide](guides/cards.md) |
| `app.update` | `card`, `session`, `layout` | None | Update the original card in place. | [code](../src/features/cards/module.ts) / [schema](../schemas/app.update.json) / [example](../examples/wt-08/app.update.json) / [guide](guides/cards.md) |
| `space.get` | `space` | None | Resolve an authorized existing conversation. | [code](../src/features/native/module.ts) / [schema](../schemas/space.get.json) / [example](../examples/wt-08/space.get.json) / [guide](guides/native.md) |
| `space.create` | `members` | `name` | Create an explicitly authorized conversation. | [code](../src/features/native/module.ts) / [schema](../schemas/space.create.json) / [example](../examples/wt-08/space.create.json) / [guide](guides/native.md) |
| `space.getName` | `space` | None | Read a conversation name. | [code](../src/features/native/module.ts) / [schema](../schemas/space.getName.json) / [example](../examples/wt-08/space.getName.json) / [guide](guides/native.md) |
| `space.rename` | `space`, `name` | None | Rename an eligible conversation. | [code](../src/features/native/module.ts) / [schema](../schemas/space.rename.json) / [example](../examples/wt-08/space.rename.json) / [guide](guides/native.md) |
| `space.getMembers` | `space` | None | Read current conversation members. | [code](../src/features/native/module.ts) / [schema](../schemas/space.getMembers.json) / [example](../examples/wt-08/space.getMembers.json) / [guide](guides/native.md) |
| `space.addMembers` | `space`, `members` | None | Add explicitly authorized members. | [code](../src/features/native/module.ts) / [schema](../schemas/space.addMembers.json) / [example](../examples/wt-08/space.addMembers.json) / [guide](guides/native.md) |
| `space.removeMembers` | `space`, `members` | None | Remove explicitly authorized members. | [code](../src/features/native/module.ts) / [schema](../schemas/space.removeMembers.json) / [example](../examples/wt-08/space.removeMembers.json) / [guide](guides/native.md) |
| `space.leave` | `space` | None | Leave an eligible conversation. | [code](../src/features/native/module.ts) / [schema](../schemas/space.leave.json) / [example](../examples/wt-08/space.leave.json) / [guide](guides/native.md) |
| `space.getAvatar` | `space` | None | Read the conversation avatar. | [code](../src/features/native/module.ts) / [schema](../schemas/space.getAvatar.json) / [example](../examples/wt-08/space.getAvatar.json) / [guide](guides/native.md) |
| `space.setAvatar` | `space`, `media` | None | Set an eligible conversation avatar. | [code](../src/features/native/module.ts) / [schema](../schemas/space.setAvatar.json) / [example](../examples/wt-08/space.setAvatar.json) / [guide](guides/native.md) |
| `space.clearAvatar` | `space` | None | Clear an eligible conversation avatar. | [code](../src/features/native/module.ts) / [schema](../schemas/space.clearAvatar.json) / [example](../examples/wt-08/space.clearAvatar.json) / [guide](guides/native.md) |
| `space.setBackground` | `space`, `media` | None | Set a conversation background. | [code](../src/features/native/module.ts) / [schema](../schemas/space.setBackground.json) / [example](../examples/wt-08/space.setBackground.json) / [guide](guides/native.md) |
| `space.clearBackground` | `space` | None | Clear a conversation background. | [code](../src/features/native/module.ts) / [schema](../schemas/space.clearBackground.json) / [example](../examples/wt-08/space.clearBackground.json) / [guide](guides/native.md) |
| `account.shareContact` | `space` | None | Share the sending account’s native contact identity. | [code](../src/features/native/module.ts) / [schema](../schemas/account.shareContact.json) / [example](../examples/wt-08/account.shareContact.json) / [guide](guides/native.md) |
| `effect.send` | `space`, `content` | None | Send content with a supported iMessage effect. | [code](../src/features/native/module.ts) / [schema](../schemas/effect.send.json) / [example](../examples/wt-08/effect.send.json) / [guide](guides/native.md) |
| `metadata.get` | `message` | None | Read curated native message metadata. | [code](../src/features/native/module.ts) / [schema](../schemas/metadata.get.json) / [example](../examples/wt-08/metadata.get.json) / [guide](guides/native.md) |
| `custom.send` | `space`, `codecId`, `resource` | None | Invoke an already registered, validated custom-content codec. | [code](../src/features/native/module.ts) / [schema](../schemas/custom.send.json) / [example](../examples/wt-08/custom.send.json) / [guide](guides/native.md) |

## Per-operation boundaries

**`typing.begin`:** ttlMs is an integer from 100 to 30000; a resolved control is not device visibility.

**`typing.end`:** Keep the existing generation-scoped typing controller; do not add another controller.

**`text.send`:** Complete-thought formatting stays in the existing formatter; do not split structured payloads.

**`text.stream`:** Single-use source; progressive versus buffered behavior must come from actual capabilities.

**`markdown.send`:** Native rendering and any fallback are provider-specific.

**`link.send`:** A link preview is not a configured interactive app.

**`content.group`:** content.type=group; 1–8 leaves; grouping is not an atomic send or group-chat creation.

**`content.compose`:** content.type=compose; 1–16 leaves/groups; preserve each earlier accepted part on later failure.

**`message.get`:** The reference must resolve in the authorized conversation and line.

**`message.reply`:** Use the actual message reference; arbitrary wrapper nesting is not accepted.

**`message.react`:** reaction is love, like, dislike, laugh, emphasize, or question; not arbitrary emoji in this contract.

**`reaction.remove`:** Requires its original handle and parent; cold recovery may return REACTION_COLD_RECOVERY_UNAVAILABLE.

**`message.edit`:** Outbound target only; native edit eligibility applies; no replacement message ID is implied.

**`message.unsend`:** Outbound target only; native eligibility applies; a void control is not a new message.

**`message.markRead`:** Remote iMessage read is chat-level; this is not proof a recipient read an outbound message.

**`attachment.send`:** Use a staged descriptor or attachment reference, not a raw path, URL, or inline bytes.

**`attachment.fetch`:** Preserve the native identifier and original line; download success is not delivery.

**`voice.send`:** Does not synthesize speech, transcribe audio, or place a call.

**`contact.send`:** The package shape is name:string, phones:string[], emails:string[]; not the SDK raw contact object.

**`poll.create`:** Use 2–12 {key,label} options; local keys/labels are not native option identifiers.

**`poll.get`:** Blocked by the reviewed shared-owner Spectrum 12.8.0 binding; not a claim Photon lacks polls.

**`poll.vote`:** Blocked in the reviewed binding; never impersonate a human voter or infer native IDs from labels.

**`poll.unvote`:** Blocked in the reviewed binding; the option must belong to the referenced poll.

**`poll.addOption`:** Blocked in the reviewed binding; option is {key,label}, not a poll-option reference.

**`app.send`:** Universal static cards, installed-extension rendering and callbacks have separate prerequisites.

**`app.sendCustomized`:** Requires its configured template/extension identity; a URL alone is not registration.

**`app.update`:** Session.cardId must match card.id; missing original SDK session must not create a replacement bubble.

**`space.get`:** Keep the original line; do not choose a default line from a list.

**`space.create`:** New recipients and required provider/line permissions must already be authorized.

**`space.getName`:** Read-only; does not authorize a rename.

**`space.rename`:** Name is 1–200 characters; native group restrictions apply.

**`space.getMembers`:** Do not expand the authorized recipient set from this read.

**`space.addMembers`:** Native group/dedicated-line prerequisites apply; members is a bounded nonempty string array.

**`space.removeMembers`:** Do not turn uncertain outcomes into repeated mutations.

**`space.leave`:** A consequential membership mutation; not a read-only lookup.

**`space.getAvatar`:** Returned media is still subject to scoped resource access.

**`space.setAvatar`:** Uses the same guarded media resource contract as attachments.

**`space.clearAvatar`:** Clear the existing avatar; do not substitute a new media send.

**`space.setBackground`:** Provider and line prerequisites plus guarded media access apply.

**`space.clearBackground`:** No new recipients or sending-line changes are implied.

**`account.shareContact`:** Distinct from contact.send, which sends supplied contact data.

**`effect.send`:** content.type=effect; use a schema-listed effect and leaf content; never add a duplicate plain copy.

**`metadata.get`:** Missing delivery/read observations stay unknown; no credentials or full SDK sessions.

**`custom.send`:** resource is a card reference; not arbitrary JSON, an endpoint, executable code or an SDK method name.
