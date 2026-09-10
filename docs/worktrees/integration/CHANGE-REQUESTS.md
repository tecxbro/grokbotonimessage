# Integration change requests

## Open assembled seams

- CR-I-001: adapt WT-03 through WT-07 public feature modules to WT-01's production `f0-services-2` executor and durable `executeChild`; remove the shared `UNIMPLEMENTED` path without bypassing claims or the journal.
- CR-I-002: select one WT-02 receipt-aware ingress, bind WT-01 durable `recordReceipt`, preserve early observations, and add bounded inbox pagination/recovery.
- CR-I-003: establish one transactional owner for inbox disposition plus WT-05 poll continuation to eliminate the recorded `STALE_FENCE` write race.
- CR-I-004: enforce SQLite file mode `0600` and independently retest creation/reopen paths.
- CR-I-005: wire WT-04 admission-time resource retention and authoritative no-consumer cleanup; cleanup remains disabled until proven.
- CR-I-006: persist sufficient WT-06 card session state for cold restart and bind authenticated durable callback capture before wake.
- CR-I-007: inject scoped native management/lookup through the single cloud iMessage owner; do not expose a second private client.
- CR-I-008: add `grok-photon` package bin and a genuine assembled `photon:test:integration` command before packaging.
- CR-I-009: make lane/ownership/docs verification F0-relative and integration-aware without weakening no-skip or evidence requirements.
- CR-I-010: use a short integration-owned socket path for macOS tests while keeping all database and runtime artifacts in ignored integration-local storage.

## Evidence boundary

These requests are not passes. Live authorization, account/line configuration,
provider delivery/read, app-extension rendering, user interaction, and physical
device evidence remain outside this integration assignment.
