# Integration acceptance

1. **PASS — identity:** registered worktree, branch, exact F0, reflog, remote,
   and pre-existing state are recorded.
2. **PASS — reviewed inputs:** every included commit is immutable,
   F0-descended, reviewed, and included once.
3. **PASS — assembled local text:** authenticated IPC, durable SQLite,
   executor, `executeChild`, and offline Spectrum acceptance form one tested path.
4. **PASS — surface:** the actual lane factories register all 44 operations and
   all 12 compiler families, fail closed on omissions, and preserve capability
   semantics.
5. **PASS — ownership model:** one injected provider owner supplies ingress,
   receipts, scoped native access, lifecycle, and shutdown boundaries.
6. **PASS — inbound durability:** webhook ingress verifies raw-body HMAC and
   freshness before parsing and durably captures before acknowledgment.
7. **PASS — recovery:** local tests cover claims, cancellation, idempotency,
   multipart recovery, restart races, and reconcile-first unknown outcomes.
8. **PASS WITH EXTERNAL FOLLOW-UP:** local tests cover media retention, one
   poll continuation, and durable card callback state. Authoritative retention
   cleanup remains disabled, and extension/backend/device card behavior is not
   proven here.
9. **PASS LOCALLY; RELEASE AUTHORIZATION PENDING — distribution:** the real
   `packageCandidate` collector built a complete archive from a clean ephemeral
   candidate, including the checksummed F0 migration. The archive installed
   outside the checkout and its installed code opened/closed/reopened a real
   `DurableSQLiteStore`. Synthetic inactive reinstall/rollback tests continue
   to preserve state. The approval used for local acceptance was test scaffolding;
   no production-approved artifact was published or activated.
10. **PASS — actual candidate gates:** Node 24.13.0/npm 10.9.2 component
    verification runs 788 non-live tests across 82 files with zero failures or
    skips, plus schema, ownership, docs, generated-skill, real offline
    installer/rollback/distribution fixtures, and package dry-run checks.
11. **PASS LOCALLY — concrete startup:** development, deployment, and operating
    instructions have distinct roles. The release owns strict configuration,
    validate/enable/run/disable commands, single-owner recovery-first lifecycle,
    release-pinned task launcher, and an exact systemd start/stop procedure.
    Approval-bound artifact identity, installation, and activation remain pending.
12. **PASS — evidence separation:** built and locally integrated are proven;
    installed, activated, provider accepted/delivered/read, rendered, interacted,
    and physical-device verified remain independently unproven.
13. **PASS — operating skill accuracy:** every generated handler implementation
    row agrees with the actual assembled public registry; provider support,
    account/conversation availability, and live verification remain separate.
14. **PASS — request/test distinction:** development instructions prohibit
    unsolicited test sends, while the operating skill handles a real incoming
    request only in its originating conversation and authorized context.
15. **PASS LOCALLY, EXTERNAL PROOF PENDING — skill and task binding:** the host
    uses the existing `gbot --gateway send` path with a fixed pointer-only prompt;
    the release launcher verifies skill/release/task generation and injects the
    three local client bindings. A controlled external Grok task must still prove
    gateway acceptance, skill load, and durable claim for an activated deployment.
16. **PASS — conversation-scoped ordering:** unresolved `queued`, `blocked`, and
    `unknown-outcome` predecessors still fence later work in the same conversation;
    independent conversations on the same line proceed, while `space.create`
    retains a separate line-scoped creation dependency. Rate limiting is unchanged.
17. **PASS — restart-safe authority:** fresh authority bootstraps atomically;
    existing cancelled, revoked, expired, narrowed, generation-mismatched,
    conflicting, or partial bindings fail closed without rewriting evidence,
    constructing Spectrum, or waking Grok. No reauthorization command was added.
18. **PASS OFFLINE — production resources:** native attachment retrieval,
    trusted generated-file import, outbound attachment/voice, composed media,
    and registered streams use real request-fenced production bindings. Stream
    delivery remains bounded buffered fallback, and a lost restart source is
    reported honestly.
19. **PASS LOCALLY; REMOTE MATRIX PENDING — portability:** macOS passed the
    exact component and assembled suite. The committed fail-fast-disabled Linux/
    macOS workflow defines the required checks, but neither its remote execution
    nor branch-protection enforcement was authorized or observed here.
