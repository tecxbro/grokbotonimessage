# Sources and compatibility limits

Reviewed 2026-09-20. This profile describes the existing Photon iMessage feature
surface in `tecxbro/grokbotonimessage`, not all products/providers sold by Photon.

## Repository baseline

Branch created from `codex/rfx-00-release-fix` at
`3d34354e85b1c64a3c165498d9e904f3c0182d26`.
The canonical action source has Git blob
`d98954021e7e91415ee9014ca389e58884f0da85`.
The new profile does not change action schemas, feature handlers, transport,
authorization, database, typing controller or SDK dependencies.

The following existing repository files were read through the GitHub connector:

| Source | What it establishes |
| --- | --- |
| `src/contracts/actions.ts` | All 44 operation names, required/optional inputs and cross-reference checks. |
| `src/contracts/content.ts` | Bounded inert content, media, contact, card layout and wrapper schemas. |
| `src/contracts/resources.ts` | Scoped reference fields and parent identity. |
| `src/registry/modules.ts` | Unique, owner-checked public handler registration. |
| `src/integration/assembly.ts` | Existing factories and complete inspection assembly; inspection dependencies deliberately cannot execute. |
| `SKILL.md`, including lines 260–430 | Current streaming protocol and known poll, card, reaction and shared-line limits. This is evidence, not a skill to load for this profile. |
| `scripts/generate-skill.mjs` | Canonical schema/example locations and generation rules. |
| Package/root `package.json` | Existing exports, build commands and pinned dependencies. |

Paths in this table are package-relative except the explicitly named root file.
Code directories and export locations were also inspected. Individual feature
implementations remain linked from the catalog; a link does not imply a new live
test of that implementation.

## Official Photon material read

Started with the actual [documentation index](https://photon.codes/docs/llms.txt),
then opened the relevant individual pages below. Inclusion here means the page
body was read, not that the complete documentation corpus was reviewed.

[Messages](https://photon.codes/docs/spectrum-ts/messages),
[spaces and users](https://photon.codes/docs/spectrum-ts/spaces-and-users),
[text](https://photon.codes/docs/spectrum-ts/content/text),
[composition](https://photon.codes/docs/spectrum-ts/content/composing-content),
[typing](https://photon.codes/docs/spectrum-ts/content/typing-indicators),
[read controls](https://photon.codes/docs/spectrum-ts/content/read),
[edits](https://photon.codes/docs/spectrum-ts/content/edits),
[unsend](https://photon.codes/docs/spectrum-ts/content/unsend),
[tapbacks](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/tapback-reactions),
[attachments](https://photon.codes/docs/spectrum-ts/content/attachments),
[voice notes](https://photon.codes/docs/spectrum-ts/content/voice),
[contacts](https://photon.codes/docs/spectrum-ts/content/contacts),
[polls](https://photon.codes/docs/spectrum-ts/content/polls),
[native poll APIs](https://photon.codes/docs/advanced-kits/imessage/polls),
[app cards](https://photon.codes/docs/spectrum-ts/content/app),
[effects](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/message-effects),
[group membership](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/group-membership),
[backgrounds](https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/chat-backgrounds),
and [recovery/state](https://photon.codes/docs/best-practices/recovery-and-state).

The website describes Photon APIs. The inherited action schemas define this
package's narrower callable contract. Do not pass SDK ContactInput, raw file paths,
arbitrary emoji or advanced-client options through a differently shaped action.

## Limits carried forward, not fixed by new documentation

Native `poll.get`, `poll.vote`, `poll.unvote` and `poll.addOption` are blocked in the
reviewed shared-owner binding, even though Photon documents native poll APIs.
Poll creation and incoming answers have separate availability. Cold card updates
require the original supported SDK session; cold reaction removal requires the
original restorable reaction handle. Missing configuration/authority/resources
remain distinct from provider support. Declared operations are not universal success.

The pinned production SDK is `spectrum-ts@12.8.0`. The repository requires Node
`>=24.13.0 <25` and npm 10.9.2. The local editing environment supplied Node 22.16.0
and could not resolve GitHub/npm download hosts. Therefore its dependency-free
checks cannot establish installed-SDK or complete application compatibility.
The required built-contract and regression checks are supplied separately and fail,
rather than skip, when their real dependencies are missing.

The current remote friend installation, its recent typing/reply changes, actual
execution binding, credentials, device rendering and delivery were not inspected.
This branch supplies feature code access and instructions. It does not certify a
turnkey adapter for an unseen running installation or claim it was deployed.
See [REVIEW](REVIEW.md) for the exact performed checks and remaining evidence.
