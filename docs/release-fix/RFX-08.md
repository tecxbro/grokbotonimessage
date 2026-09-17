# RFX-08 native poll management

Assignment: `codex/rfx-08-polls` in the registered `worktrees/rfx-08-polls`, based on
`b83e3afd7049a991de6daffedf831165890f0901`. Origin and clean starting state verified;
remote main matched the base and the lane had no remote branch.

Implementation commit: `1d15daa32584991341f45930de12ebdffb64d241`.
This note is a separate follow-up commit so it can record the exact implementation
SHA without a self-referential commit hash. Integrate both commits on this lane.
Status: lane implementation verified locally; production activation awaits the
RFX-00 dependency, host ownership/wiring and release metadata integration below.

## Implementation

Implemented one host-owned adapter using the public Advanced iMessage 2.1.0 gRPC
client. Spectrum 12.8.0 has no public management methods; both versions are the
current npm releases and 2.1.0 is already installed transitively from the lock.
The adapter returns parsed native states, preserves exact poll and option IDs,
and derives provider idempotency keys from the durable child key. SDK retries
are disabled; uncertain dispatch remains reconcile-first. No extra event stream
is needed: returned states support management, and unified poll_option ingress
continues to handle conversational answers.

SDK Poll metadata (`creatorHandle`, participant `country`) is explicitly projected
into the strict NativePollState parser. Malformed state, mismatched poll GUIDs,
duplicate option IDs and unknown vote targets still fail validation. Definitive
SDK validation/not-found failures become failed mutations; timeouts, duplicate
writes and unknown error codes preserve uncertainty. Existing identity, reducer
and reconciliation code needed no changes.

## Files

- `packages/photon-features/src/features/polls/advanced-adapter.ts`
- `packages/photon-features/src/features/polls/sdk.ts`
- `packages/photon-features/src/features/polls/operations.ts`
- `packages/photon-features/tests/lanes/wt-05/advanced-adapter.test.ts`
- `packages/photon-features/tests/lanes/wt-05/advanced-support.ts`
- `packages/photon-features/tests/integration/rfx-poll-management.test.ts`
- This task note.

## Verification

TypeScript build/typechecking passed using Node 24.13.0 and npm 10.9.2.
Dependencies installed from the unchanged lock with `npm ci --ignore-scripts --no-audit --no-fund`.
All commands below ran from the assigned worktree with
`npm exec --yes --package=node@24.13.0 --` preceding npm/node commands.

- `npm run photon:build`: passed, including compile checks against shipped public SDK types.
- `node --test packages/photon-features/dist/tests/lanes/wt-05/*.test.js packages/photon-features/dist/tests/integration/rfx-poll-management.test.js packages/photon-features/dist/tests/integration/repair-polls.test.js packages/photon-features/dist/tests/integration/poll-answer-journey.test.js packages/photon-features/dist/tests/e2e/poll-restart.test.js`: **73 passed**, no failures/skips.
- `node --test --test-concurrency=1 packages/photon-features/dist/tests/foundation/*.test.js packages/photon-features/dist/tests/lanes/wt-00/*.test.js`: **136 passed**, no failures/skips.
- `node scripts/generate-contracts.mjs --check --target assembled-candidate`: passed;
  3 schemas, 56 files, digest `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539`.
- Regression sensitivity: temporarily ran the six new integration tests against
  the base operations implementation in ignored dist output: **5 failed, 1 passed**.
  Restored the compiled implementation in `finally`: **6 passed**. Tracked sources
  were never reverted. Evidence: `.photon-local/rfx-08/{baseline,regression-green}.log`.
- `git diff --check`: passed. All seven changed/new paths match the user's RFX-08
  ownership list; no staged/unstaged deletions. Branch inventory and registered
  worktrees recorded before commit under `.photon-local/rfx-08/`.
- Historical `node scripts/verify-ownership.mjs wt-05`: **failed** with
  `UNOWNED_PATH:.changeset/README.md` (old F0 comparison includes inherited removals).
- Historical `node scripts/verify-docs.mjs wt-05`: **failed** with `FILE_INVENTORY_DRIFT`.
  RFX-00 must integrate the release-wave ownership/inventory records. Those shared
  manifests and the immutable F0 contract were not edited or weakened here.

The tested HEAD before the implementation commit was the exact base above plus
the six source/test files listed here. Their SHA-256 identities and task-note
snapshot are in `.photon-local/rfx-08/owned-files.json`; test output is in
`focused.log`, `regressions.log` and `contracts.log` in the same directory.

| Required case | Observed evidence |
| --- | --- |
| 1. Get exact poll | Native GUID read; empty local option map populated from returned identifiers |
| 2. Vote exact option | Durable executor forwards `native-b`, with provider key |
| 3. Unvote exact poll | Only native poll GUID plus idempotency options reaches SDK |
| 4. Add option | Returned native ID persisted; label remains display data |
| 5. Duplicate labels | Distinct native option references despite identical text |
| 6. Multiple polls | Two polls in one chat receive independent votes after reopen |
| 7. Two voters/unvote | Native identity lookup and existing reducer retain Bob, remove Alice, dedupe replay |
| 8. Restart mapping | Real SQLite close/reopen preserves both polls and option references |
| 9. Invalid option | SDK ValidationError returns failed/INVALID_REQUEST with no acceptance evidence |
| 10. Timeout | Provider double applies write then throws; durable unknown child survives reopen and rejects retry |
| 11. One client | One construction across all operations, idempotent close and closed-call rejection |
| 12. Public imports | Compile checks plus AST inspection of all poll source imports |

Provider RPCs in these tests are explicit public-SDK doubles. The executor,
SQLite store and restart/recovery path are real local implementations. The voter
test uses verified independent-delta fixtures; it does not claim raw Advanced
single-choice events prove those semantics or that live native ingress was tested.

## RFX-00 integration request

Add a direct exact dependency on `@photon-ai/advanced-imessage` 2.1.0 and explicitly
retain gRPC peers in the standalone artifact: `@grpc/grpc-js` 1.14.4,
`nice-grpc` 2.1.17, `nice-grpc-common` 2.0.4 (currently installed compatible versions).
Update root and standalone locks in the integration lane. No Spectrum upgrade is needed.
Production composition and package.json are deliberately outside this lane's edits.

Construct `createAdvancedPollManagement({ address, token, tls: true, timeout })`
once after the Photon host acquires its ownership lock. Import it from
`../features/polls/advanced-adapter.js` in the host. Address must be the authoritative
gRPC endpoint for the configured account/line, and token must come from the host's
credential owner (prefer its refresh callback). Do not derive either from actions,
conversation text, a guessed endpoint or private Spectrum objects.

Replace the unprovided production dependency with a closure returning that same
adapter: `pollManagement: async context => { assertOwnedScope(context.scope); return polls; }`.
Here `assertOwnedScope` is illustrative host authorization, not a new SDK method:
use the host's actual scope equality checks and verified account/line binding.
Do not call the constructor inside this closure. If authoritative endpoint/token
access is absent, keep management blocked and request that seam from the owner.
Expose availability only when that binding exists and is valid.

On startup failure, close any constructed adapter. On normal shutdown stop admission,
drain/settle the outbox, then await `polls.close()` before releasing host ownership.
Closing is idempotent and rejects subsequent calls; the adapter does not own the
Spectrum connection or subscribe to Spectrum messages/poll events. No recovery
stream/cursor is introduced. Provider timeouts and duplicateMessage remain unknown;
a later snapshot is not proof that an uncertain addOption succeeded, especially
with duplicate labels. Do not blindly resend or infer success from matching text.

## Sources

- https://photon.codes/docs/spectrum-ts/content/polls
- https://photon.codes/docs/advanced-kits/imessage/polls
- https://photon.codes/docs/advanced-kits/imessage/error-handling
- Installed public exports/types for spectrum-ts 12.8.0 and
  @photon-ai/advanced-imessage 2.1.0, plus installed transitive package versions.

Retrieved each required source's `.md` URL on 2026-09-16/17 UTC: HTTP 200,
`text/markdown; charset=utf-8`; checked content identity. Curl with a browser user
agent succeeded after Python's default user agent received 403. The required
HTML pages were also read through the web tool. Saved bodies and response headers
are under `.photon-local/rfx-08/` (development evidence only).

| Source body | SHA-256 |
| --- | --- |
| spectrum-polls.md | `e57ffa8265660ccbe175e92f46862af905e9129a10be598c0cc851d6643a61b9` |
| advanced-polls.md | `6170945b2e0f8f36c429085d1e2e01b89830e5304b357c0912b70e723b95c481` |
| advanced-errors.md | `ea68f162fd7ed4d4ea24ff7223754bdc7e8941bb148fc247404d7821f492a3b9` |

The public Advanced gRPC declarations verify optional `clientMessageId` for every
mutation; public `subscribeEvents()` exists but is unnecessary here. Installed
implementation inspection confirms `retry: false` avoids its retry middleware.
No private Spectrum modules are imported. `npm view` reported latest Spectrum
12.8.0 and Advanced iMessage 2.1.0; there is no newer published Spectrum path to request.

No live provider traffic, activation, deployment or publication is part of this lane.
