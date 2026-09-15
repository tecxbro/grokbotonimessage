# Integration change requests

## Current completion decisions and open requirements — 2026-09-13

The user's completion assignment is the explicit authorization for necessary
cross-lane edits on the existing `fix-1` worktree. No historical lane restriction
requires returning these implementation seams to Grok. Exact paths and retained
historical ownership are in `FILES.json.completionFiles` and
`ownership.json.integrationMaintenance`.

| ID | Status | Decision or exact blocker |
| --- | --- | --- |
| C-01 | Implemented | Construct the serialized signed-card-v1 layout backend, trusted template functions, browser signer and separate authenticated callback ingress in normal startup |
| C-02 | Implemented | Versioned local stream producer and real public `text(AsyncIterable)` provider path; buffered path is explicitly selectable fallback |
| C-03 | Implemented | Separate audited stopped-host owner renewal/replacement with CAS, generation fencing, replay recovery and no deletion/reseeding |
| C-04 | Implemented | Additive interaction proof/audit tables; avatar bytes, created-chat references and reaction resource resolution through shared state/resources |
| C-06 | Implemented | Generated production text.stream provider declaration changes from fallback to native; the retained buffered path is explicit. The historical manual-block hash regression is updated to this reviewed table, while exact 44-row assembly and schemas remain checked |
| C-05 | Implemented | Reproducible standalone dependency lock, generated profiles/schemas/inventory, executable wrappers, installed journeys and future approved-release completion checks |
| U-01 | OPEN: missing public SDK surface | `spectrum-ts/providers/imessage` 12.8.0 public `PlatformInstance` exposes neither `polls.get/vote/unvote/addOption` nor a reusable native client. Latest registry release checked is 12.8.0. Advanced SDK docs alone do not solve the shared-owner boundary |
| U-02 | OPEN: missing public SDK surface | `space.getMessage` does not restore `miniAppCardSession`; no public supported cold original-card update restoration mechanism found or exercised |
| U-03 | OPEN: missing public SDK surface | Cold reaction lookup preserves `reactionRecord` metadata but rebuilds text content, so native reaction removal lacks its actual reaction handle |
| R-01 | OPEN: release approval evidence | No actual approving workflow/owner release approval for this commit; do not manufacture approval to build `.gpf.gz` |
| D-01 | OPEN: deployment inputs | Real domain/TLS forwarding, verified participant key enrollment, owner/task/Photon credentials, Apple identifiers and installed recipient extension, target process supervisor and existing Grok gateway/executable |
| L-01 | OPEN: target/live evidence | Linux/macOS workflow definitions retained; only local macOS execution observed in this pass. Target activation, provider delivery/read and device behavior not authorized or verified |

U-01/U-02/U-03 require upstream public capability, not configuration that hides an
operation. These remain release gates. No dependency version was changed, no
private SDK field was used and no second client/listener was introduced. Grok is
not asked to implement any missing adapter or repair deployment architecture.

## Historical checkpoints before this completion pass

The following records are retained for provenance. Current behavior and gates are stated above.

## Locally closed assembled seams

- CR-I-001: **closed locally.** Public feature modules execute through
  `f0-services-2`; provider effects use stable durable children.
- CR-I-002: **closed locally.** One receipt-aware ingress durably records early
  observations and uses bounded inbox recovery.
- CR-I-003: **closed locally.** The shared router adopts the reducer-created,
  scope-validated durable poll continuation after re-reading inbox state.
- CR-I-004: **closed locally.** SQLite database, WAL, and SHM creation/reopen
  modes are independently tested as owner-only.
- CR-I-007: **closed locally.** Native operations reuse the injected scoped
  provider and cross the public `executeChild` boundary.
- CR-I-008: **closed locally.** The package exposes `grok-photon` and the root
  provides the source-derived `photon:test:integration` aggregate.
- CR-I-009: **closed locally.** Worktree, ownership, docs, and aggregate checks
  are F0-relative and integration-aware without accepting hidden skips.
- CR-I-010: **closed locally.** Tests use a short integration-owned socket path;
  database/runtime state remains under ignored local storage.
- CR-I-013: **closed locally.** The generated operating skill derives structural
  handler implementation from the actual assembled factory registry. Provider
  support, scoped availability, and live verification remain separate capability
  dimensions and are not promoted to `supported`.
- CR-I-014: **closed locally.** Historical F0/WT-08 instructions are labeled as
  checkpoints; development, deployment, and post-activation operation point to
  distinct authoritative documents. The operating skill explicitly distinguishes
  a real incoming request in its originating conversation from an unsolicited
  development test.
- CR-I-015: **closed locally.** The release now owns a tested production host,
  strict configuration, exclusive lifecycle lock, recovery-first start, orderly
  stop, and exact systemd procedure. Installation/activation remain separate
  evidence gates.
- CR-I-016: **closed at the repository seam.** The host uses the configured
  existing `gbot --gateway send` contract with a pointer-only prompt; the
  release-pinned launcher verifies the skill/release/task generation and injects
  the three local client bindings. External Grok task acceptance remains a
  deployment evidence gate.
- CR-I-019: **closed locally.** The custom archive collector includes the F0 SQL
  migration as a checksummed payload entry, and the production SQLite adapter
  resolves only the exact installed-package path rather than searching ancestors.
- CR-I-020: **closed locally.** Ordinary unresolved outbox work now fences only
  later work in the same conversation. `queued`, `blocked`, and
  `unknown-outcome` protection is unchanged, and `space.create` retains a
  line-scoped creation dependency independent of rate limiting.
- CR-I-021: **closed locally.** Startup no longer reissues configuration-derived
  authority. Fresh task/context/space state is atomic; existing cancelled,
  revoked, expired, narrowed, stale-generation, new-context, partial, and
  conflicting evidence fails validation/startup without SDK construction or
  durable rewrites. Reauthorization remains a separate unimplemented
  administrative transition.
- CR-I-022: **closed locally.** The production executor lazily binds a real
  request/fence-local `GuardedMediaStager`, existing-owner native attachment
  retrieval, owner-only trusted file import, and shared media capacity. Staged
  descriptors serve fetch/send/voice and composed/native consumers without
  widening action JSON to paths or URLs.
- CR-I-023: **closed locally.** Trusted registered sources now use scoped inert
  references with `registered -> reserved -> closed` state, exact request/fence
  reservation, combined cancellation, single-use consumption, durable replay,
  and explicit post-restart source loss. Streaming remains buffered fallback.
- CR-I-024: **closed locally.** Production capability reporting and execution
  preflight share the same action-aware dependency inventory and retain useful
  provider/live-evidence blockers.
- CR-I-025: **closed in source, platform execution pending.** Production tests
  use a canonical private `os.tmpdir()`/`mkdtemp()` fixture with a measured final
  Unix socket path. A fail-fast-disabled Node 24.13.0/npm 10.9.2 Linux/macOS
  workflow runs the direct assembled component gates without spoofing the
  integration-worktree identity check.

## Follow-up gates

- CR-I-005: admission-time retention and local no-consumer behavior pass, but
  authoritative cleanup stays disabled until lifecycle ownership is proven in
  the activated host.
- CR-I-006: card session/callback persistence passes local restart tests. Real
  extension rendering, backend callback authentication, interaction, and device
  behavior require separately authorized integration evidence.
- CR-I-011: produce a release archive only from the clean committed candidate
  after receiving a real integration-workflow approval bound to that commit.
- CR-I-012: run inactive install/reinstall/verification/rollback on that real
  archive, then separately authorize activation and live provider/device checks.
- CR-I-017: build the real approved archive and exercise the documented inactive
  install/validate path on its target host before authorizing activation.
- CR-I-018: collect redacted controlled-task evidence that the configured Grok
  gateway accepted the pointer, loaded the selected release skill, and claimed
  the durable handoff. Local command-shape tests are not this external proof.
- CR-I-026: require both remote check names, `Assembled integration
  (ubuntu-latest)` and `Assembled integration (macos-latest)`, in repository
  branch protection after their first successful authorized workflow run.
  This task neither ran the remote workflow nor changed repository settings.
- CR-I-027: deployment embedding code must connect each approved generated-file
  or live-text producer to the trusted in-process composition API. The standalone
  CLI intentionally exposes no arbitrary file path, URL, callback, or executable
  stream input; no external producer was installed by this task.

## Evidence boundary

These requests are not passes. Live authorization, account/line configuration,
provider delivery/read, app-extension rendering, user interaction, and physical
device evidence remain outside this integration assignment.

## fix-1 repair shared decisions (2026-09-11)

The user assigned this coordinator the exact preparation scope; no additional coordinator approval is pending. Implemented signatures and caller/owner/acceptance details are in ../fix-1-repair/INTERFACES.md.

External dependency P-1: spectrum-ts 12.8.0's public narrowed iMessage provider does not expose management get/vote/unvote/addOption or authoritative incoming native poll/option IDs. Required upstream contract must expose scoped operations and native vote identity through the existing owner. Current advanced-kit examples are not that integration. No dependency upgrade, private client access or second client was performed.

External dependency C-1: no concrete authenticated card backend wire/version, verifier/key policy, participant authentication, signed nonce transport, deployed extension callback contract or universal update URL mapping is supplied. Existing generic adapter and templates are not evidence these exist. Continue other work; do not claim problem 6 complete using a test verifier.

Final coordinator work: connect A's shared live/replay reference and receipt path; bind B's real resolver/management only where a public contract exists; integrate C's revision/session work and real backend when supplied; integrate D's CLI/manual skill and E's CI; then reconcile generated capability inventory and run full production-journey regressions. Actual Grok and device observations remain separately unverified.

## Post-merge status (2026-09-11)

The local coordinator work named above is complete and covered by the 826-test
non-live aggregate. CR-I-028 remains external: supply an approved public shared-owner
poll management plus authenticated native poll/option identity and monotonic ordering
contract. CR-I-029 remains external: supply the concrete authenticated card backend,
extension callback protocol/version/key policy, and deployment mapping. CR-I-030
remains external: publish or otherwise make the exact recorded historical Git objects
available to hosted CI without weakening immutable verification. CR-I-031 remains
authorization-gated: install/activate a production-approved release and perform the
user-authorized real Grok/provider/device journey. None of these external gates was
performed or relabeled as passing.

## Completion pass 2026-09-13

The 2026-09-13 user assignment grants this coordinator cross-lane completion ownership for the existing 44-operation product on fix-1. Preserve execution-service contracts and fixed typing, poll answers, media and durable authority; record exact paths in FILES.json. Upstream gaps stay open and never become configuration-only completion.
