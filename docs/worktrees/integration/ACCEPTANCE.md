# Integration acceptance

1. Registered worktree, branch, F0, reflog, remote, and pre-existing state are recorded.
2. Every included commit is immutable, reviewed, F0-descended, and included once.
3. WT-01, WT-02, minimum WT-03, and WT-08 form a real local text round trip through authenticated IPC, durable SQLite, executor, `executeChild`, and an offline provider.
4. All 44 operations and content compilers are registered with honest capability states.
5. One provider owner supplies ingress, receipts, scoped native lookup, lifecycle, and shutdown.
6. Webhook ingress verifies raw-body HMAC/freshness and durably captures before acknowledgment.
7. Claims, cancellation, idempotency, multipart recovery, and unknown outcomes survive restart/races.
8. Media retention, poll continuation, and card callback state are durable and transactionally safe.
9. Package generation, clean/repeat inactive install, verification, rollback, and state preservation pass.
10. WT-09 focused, security, regression, SDK, schema, ownership, docs, and package checks run on the actual candidate with zero hidden skips.
11. Artifact identity, prerequisites, shutdown, and rollback are documented without activation.
12. Built, integrated, installed/activated, and live-verified states remain independently reported.
