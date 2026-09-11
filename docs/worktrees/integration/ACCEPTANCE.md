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
9. **PARTIAL — distribution:** package dry-run succeeds and synthetic inactive
   install/reinstall/verify/rollback tests preserve state. No real artifact was
   created or installed because no workflow approval was supplied.
10. **PASS — actual candidate gates:** the fresh Node 24.13.0 aggregate passes
    759/759 non-live tests across 79 files with zero failures or skips. Schema,
    ownership, docs, generated-skill, smoke, and packaging checks also pass.
11. **PASS LOCALLY — concrete startup:** development, deployment, and operating
    instructions have distinct roles. The release now owns strict configuration,
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
