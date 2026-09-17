# RFX-10 reaction restart recovery

## Assignment and baseline

- Repository origin verified: `https://github.com/tecxbro/grokbotonimessage.git`.
- Registered worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-10-reactions`.
- Branch: `codex/rfx-10-reactions`; initial HEAD and advertised remote main: `b83e3afd7049a991de6daffedf831165890f0901`.
- Initial staged, unstaged and untracked files: none. Tracking main divergence: 0/0; lane has no upstream or remote branch.
- Scope: `targets.ts`, `reactions.ts`, necessary `sdk.ts` helper changes, `tests/integration/rfx-reaction-restart.test.ts`, and this task note. No production composition or common contract changes.

## Design and acceptance

Store versioned reaction identity as additive JSON in the existing authoritative reference row, through public execution transactions. Preserve actual reaction/parent IDs, multipart identity, chat/line, outbound ownership and emoji. Resolve only through the host's public SDK resource resolver; never construct a replacement Message or import SDK cache internals. Validate recovered content before crossing the shared removal child boundary. Unknown outcomes retain runtime reconciliation semantics.

Acceptance: warm removal; reopened SQLite and fresh provider public restoration; foreign-owner, wrong-parent and inbound rejection; precise pre-dispatch cold blocker; timeout/restart without blind retry; no synthetic Message construction. Also verify emoji, part, chat and line mismatches.

## Source evidence

Retrieved official Markdown on 2026-09-16, HTTP 200, `text/markdown; charset=utf-8`, effective URLs unchanged:

- https://photon.codes/docs/spectrum-ts/reactions-and-replies.md — SHA256 `7d131c3af5670e685fa36768638037f339a6755b4fb2daa7eef043ea522a586d`.
- https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/tapback-reactions.md — SHA256 `00d7d585eb1820602d3152b1cfb8df3c3a35435f9e439ba61eb79849b24158c8`.

Pinned and npm latest `spectrum-ts` are both 12.8.0. Inspected public `@spectrum-ts/imessage` declarations and shipped implementation: `reactToMessage` returns the real reaction GUID and content; `tapbackTarget` uses parentId/id plus partIndex; public metadata includes reactionRecord. `getMessage` cold reconstruction retains metadata but rebuilds text/custom/attachment content, not reaction content. `unsend` requires reaction content to enter its reaction-removal branch. No supported alternative that returns a cold reaction handle, and no newer published SDK upgrade to request.

## Worklog and evidence

- Repository identity and ownership checks complete. Implementation and manual diff review complete.
- Dependencies installed locally with pinned Node 24.13.0 / npm 10.9.2, `npm ci --ignore-scripts`; no tracked dependency changes.
- Changed files:
  - `packages/photon-features/src/features/text-messages/sdk.ts`: additive `reactionIdentity` on existing reference JSON, provider-return validation, and precise cold-recovery error mapping. No common schema/migration, synthetic SDK objects, or secondary journal.
  - `packages/photon-features/src/features/text-messages/targets.ts`: authorized public restoration and durable identity validation, including parent native ID/part, emoji, direction, chat and line.
  - `packages/photon-features/src/features/text-messages/reactions.ts`: document persistence/removal invariants.
  - `packages/photon-features/tests/integration/rfx-reaction-restart.test.ts`: 16 tests using real Spectrum-created objects from an offline public `definePlatform` provider, the production composition, and reopened SQLite. The custom provider's successful cold restoration is conditional evidence, not proof of Photon cloud support.
  - This task note.

Validation with Node 24.13.0 / npm 10.9.2:

| Check | Result |
| --- | --- |
| `npm run photon:build` (TypeScript compilation/type checking) | Passed |
| New reaction suite plus all WT-03 tests | 121 passed, 0 failed/skipped |
| `node scripts/run-integration-tests.mjs` | 872 passed, 98 test files, 0 failed/skipped; live suite excluded |
| `node scripts/generate-contracts.mjs --check --target assembled-candidate` | Passed; contract digest unchanged: `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539` |
| `node scripts/verify-docs.mjs integration` | Passed |
| Exact path audit against this RFX assignment and base; `git diff --check` | Passed; no deletions |
| Baseline regression experiment | 7 of 16 new tests fail on original base implementations; restored implementations pass. Only ignored compiled outputs were temporarily substituted, then restored in `finally`. |

Acceptance evidence: warm creation/removal persists multipart identity; fresh SDK and SQLite reopen restore through public `getMessage` and remove once; foreign principal, wrong parent/part/emoji/chat/line/ID, inbound direction and deselected reactions cannot dispatch removal; absent or metadata-only cold handles block with zero removal children; timeout after dispatch remains `unknown-outcome`/`reconcile-first` through retry and restart; AST guard rejects synthetic Message construction/casts and private SDK imports. Legacy reference rows without identity block explicitly rather than deriving the intended emoji from a newly fetched handle.

Logs are ignored local artifacts under `.photon-local/rfx-10/`: `focused.log`, `integration.log`, `baseline-regression.log`, and `contracts-docs.log`. Tested source was the implementation delta over `b83e3afd7049a991de6daffedf831165890f0901`; the implementation commit below freezes that delta. Initial fixture compile/setup failures were corrected; no existing tests were weakened.

Tested source/test content digest: SHA256 `fa3944c064a830d2d7afba3a1db9a2f12201c4ddadbf24ddd25df5342b290709` (sort the four owned TypeScript paths; hash each UTF-8 path, NUL, file bytes, NUL). Full-suite log SHA256: `4a9dcec566d979021e03fc57e0a027eec988feb055d3e73bb6a0f78a602ca4b9`.

## Integration requests and limits

RFX-00: retain a precise cold-recovery blocker for 12.8.0. Upstream must expose a public restored reaction Message with real target metadata before claiming cloud restart removal. Do not mark all reactions unsupported. No dependency upgrade requested because no compatible newer release was found.

**Required integration request:** `packages/photon-features/src/runtime/core/outcomes.ts:cleanResult` currently removes `error.blockerId`, replaces the error message with its code, and deletes capability metadata. This lane's public handler returns `UNAVAILABLE` with blocker ID `REACTION_COLD_RECOVERY_UNAVAILABLE` and an exact reason, but the production response currently retains only generic `UNAVAILABLE`. RFX-00 must preserve this allowlisted blocker and a safe explanation through the shared sanitizer, with an integration assertion that the host response retains it. This common runtime file is outside RFX-10 ownership and was not edited. Tests explicitly distinguish the precise public-handler result from the current sanitized host result; this is an open integration gate, not a passing claim of end-to-end blocker reporting.

All planned evidence is offline; no Photon activation, live messages, deployment, push, or Grok machine access.

## Commit

Implementation commit: `44e7ee9488ab7012bb740f4005fdc1dd6429f574`.

A following documentation-only commit records this already-created SHA and evidence digest. Both commits remain local on `codex/rfx-10-reactions`; no publication or live validation was performed.
