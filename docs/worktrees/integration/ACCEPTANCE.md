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
10. **PASS — actual candidate gates:** Node 24.13.0 aggregate verification runs
    757 non-live tests with zero failures or skips, plus schema, ownership,
    docs, generated-skill, and package dry-run checks.
11. **DOCUMENTED, RELEASE PENDING:** artifact identity, prerequisites,
    shutdown, and rollback are documented. Exact approval-bound artifact
    identity does not exist until the candidate is committed and approved.
12. **PASS — evidence separation:** built and locally integrated are proven;
    installed, activated, provider accepted/delivered/read, rendered, interacted,
    and physical-device verified remain independently unproven.
13. **PASS — operating skill accuracy:** every generated handler implementation
    row agrees with the actual assembled public registry; provider support,
    account/conversation availability, and live verification remain separate.
