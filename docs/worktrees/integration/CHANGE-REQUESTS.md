# Integration change requests

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
