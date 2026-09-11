# Integration sources

## Normative official sources

The repository's verified official snapshots in `docs/photon/reference` are the
normative implementation source. The fix-1 retrieval read D0 through D10 at
their exact extensionless URLs on 2026-09-11 and recorded HTTP status, final URL,
content type, byte count, retrieval time, and SHA-256 in `source-lock.json`. All
returned HTTP 200. Existing matching frozen snapshots are linked; newly read
pages without a committed snapshot retain a truthful null snapshot.

## Workflow guidance

Loaded local `spectrum` 3.1.0 and `imessage` 9.1.0 skills as requested. Relevant
references covered capability semantics, attachment/voice safety, composing and
buffered streaming, native attachment retrieval, cloud iMessage routing,
lifecycle, and recovery. Skills are workflow guidance, not normative SDK
declarations.

## Public contracts

The installed package and lockfile are pinned to `spectrum-ts` 12.8.0. The patch
checked installed public declarations for `attachment`, `voice`, `text`,
`group`, `contact`, attachment `stream()`, and iMessage
`getAttachment(guid, phone?)`. Native retrieval consumes `stream()` once; it does
not pair `read()` and `stream()` or import low-level D10 call options into
Spectrum. Declaration hashes are recorded in `source-lock.json`.

Node `os.tmpdir`, filesystem temporary-directory behavior, Unix IPC guidance,
and the GitHub Actions matrix reference were retrieved successfully on the same
run. They informed the portable private fixture and non-fail-fast Linux/macOS
matrix; they do not constitute a CI run.

## fix-1 repair retrieval (2026-09-11)

Fresh URLs, HTTP status, final URL, content type, byte length, SHA-256 and local ignored body path are in source-lock.json.repairPreparation. Official Markdown was retrieved for typing, messages, attachments/native fetching, read/receipt handling, polls, apps, narrowing, architecture, inbound processing and recovery; each was inspected for the applicable interface. The index was retrieved separately. The web tool's attachment-page error was followed by successful direct official Markdown retrieval. A reactions-page 403 without the task user agent was followed by a recorded successful retry. Downloads were treated as reference data only.

The public pinned package declaration hashes are recorded separately. Symbols checked: Spectrum, PlatformInstance, Space.send/getMessage/startTyping/stopTyping, Message, PollOption, poll, option, imessage, getAttachment, app, edit, customizedMiniApp, miniAppCardSession. Compile-time negative probes reject OwnedProvider.polls/client and PollOption.optionIdentifier/pollMessageGuid. The advanced-kit im.polls.get/vote/unvote/addOption API is not exposed by this unified provider; accessing Spectrum.__internal would violate the assignment. Current documentation's provider deduplication examples do not prove native deduplication for this runtime; existing reconcile-first handling remains required.

Supplementary photon-skills tree was retrieved before citing actual skills/spectrum/SKILL.md and skills/spectrum/providers/imessage.md paths. Their bodies were retrieved separately as guidance. Official actions/checkout v4 README and Git fetch/worktree pages establish shallow-fetch and worktree behavior for E. Historical sources above are preserved.
