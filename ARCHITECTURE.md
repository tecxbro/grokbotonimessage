# Fresh setup profile on improving-friends-bot

The default handoff is now [the fresh-setup guide](packages/photon-features/scratch-setup/README.md).
It composes the existing full feature runtime with a native wake-only Grok webhook
and an independent process supervisor. The neutral feature-only profile remains
available for existing integrations. No new bot roles or orchestration policy are added.

`phone → Photon → one hosted Spectrum owner → SQLite batch → native routine →
private feature helper → same owner → phone`.

The full executor, resource ports and all 44 operation contracts are retained.
`work.complete` adds atomic final output admission plus work acknowledgement;
activity and completion metadata are additive in the existing JSON-backed handoff
records. The database version and applied migrations are not rewritten. Legacy
configuration remains readable; native webhook mode has no gateway executable.
The supervisor handles child restart while its host runs, not whole-VM suspension.

The following foundation architecture remains reference material; it is not a
request to rebuild the foundation or load the old bot-topology instructions.

---

# Foundation architecture

## Planned implementation
Reuse strict Zod operation/content/reference schemas where compatible. Add a documented public feature-services contract with no private tables, an injected host seam, additive receipt state and schema/checker tooling. Existing legacy contract consumers remain source-compatible and require integration-lane adaptation to the new public service seam; they are not automatically registered.

## Flow and ownership
Trusted local invocation resolves principal and expiring/revocable context before scoped references. A fenced claim surrounds every state change and executeChild dispatch. One runtime owns credentials, inbox/outbox, attempts and children; features own domain records through UnitOfWork only. Durable continuation is created transactionally; wake carries only a pointer. Inbound authentication precedes capture; provider dispatch and wake are separate ports.

## Transactions and recovery
Synchronous domain transactions cannot await provider I/O. Child preparation is durable before dispatch, and ambiguous dispatch must return unknown-outcome until reconciled. Cancellation fences new effects, not effects already accepted. Receipt evidence is append-only, independently correlated and never fabricates provider times/readers. Fresh SQLite migration preserves the existing record layout; no production database is opened.

## Non-ownership and limitations
Existing feature/runtime modules are inherited and untouched. Their private child-boundary adapter and table access are not the new public F0 contract. Integration must adapt them explicitly. Unrestricted same-UID processes are not isolated by an opaque context ID; OS process isolation/credential separation is needed against malicious local peers.

## Interfaces
See [execution](docs/contracts/execution.md), [receipts](docs/contracts/receipts.md), and [operations](docs/contracts/operations.md) from shared docs; root ARCHITECTURE.md is the project entry point.
