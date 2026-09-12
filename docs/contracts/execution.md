# Feature execution contract

## Entry points
`parseActionRequest` in `packages/photon-features/src/contracts/actions.ts` parses the existing version 1 wire envelope: version, idempotencyKey, contextId, operation, arguments. `parseContentSpec` validates inert bounded JSON before schema parsing. Public schemas reject unknown keys, SDK instances/accessors/functions, raw media paths and recursive wrappers. Limit: 262144 bytes conservatively accounted, 16000 characters per prose leaf, groups <=8 leaves, composition <=16 leaves/groups and no wrapper recursion. Semantic poll/option and card/session correlation is checked after schema parsing; JSON Schema describes structural validation, not authorization.

`FeatureModule` in `contracts/feature.ts` contains id, owner and typed operation handlers. `registerFeatureModules` rejects duplicate IDs/handlers, unknown operations and wrong ownership; requireComplete rejects all missing handlers. F0 passes an empty registry, never no-op successes.

## Authorization and claims
An authenticated local transport supplies principal independently of action JSON. ContextResolver resolves authoritative context and authorizes each operation. `assertTrustedContext` binds context ID, principal, permissions, project/provider/account/line/chat scope, expiry and revocation. The runtime resolver must additionally load the authoritative task and compare current generation/cancellation, and resolve every reference against ownership records. The helper cannot infer current task state from caller JSON.

`ExecutionServices.assertActiveClaim()` checks current owner, fence, task generation, lease, context revocation and cancellation. Invoke before effects and inside transactions; recheck after asynchronous resource/media/stream resolution. A previously valid object is not a durable grant. `resolveResource` returns an authorized reference; provider bindings remain trusted executable code captured by the handler, never caller-supplied SDK objects.

Unrestricted same-UID processes sharing host credentials can impersonate that identity. Context IDs are not a sandbox. Separate OS identities or isolated workers are needed against malicious local code. F0 does not claim stronger local isolation.

## Public services and transactions
`ExecutionServices` in `contracts/services.ts` exposes context, claim, clock, signal, assertActiveClaim, resolveResource, transaction, executeChild, recordReceipt, guarded media and registered streams. It intentionally exposes no private task/outbox/attempt/child transaction table. `UnitOfWork` permits references, polls, votes, cards, sessions, stagedMedia and streams, plus createContinuation. Runtime implementations bind domain records and continuation to the current principal/task/generation and full scope; enforce expected revision; and reject retained, nested or async transaction use.

A synchronous transaction atomically updates domain state and creates a durable continuation. Provider I/O must occur outside the database transaction. Continuation identity is stable across retries; inserting the same continuation cannot schedule duplicate work. Wake runs after commit and contains a pointer only. Features cannot read private execution records or maintain a parallel journal.

## Child execution and unknown outcomes
Every consequential provider call, including multipart pieces, uses executeChild({index,key,argumentsDigest,dispatch}). Child identity is scoped to parent request and index; the stable key and digest must match on retry. Runtime owns persistence: prepare a child/attempt with the current fence, commit dispatch intent, perform provider call, record its actual result/references, then advance the checkpoint. Existing completed children return their recorded result; unknown children require reconciliation. A callback is trusted program code, never an action argument.

An exception after possible provider dispatch yields unknown-outcome with retry=reconcile-first. It must not be mislabeled failed-before-send or safely retried unless provider deduplication/outcome lookup is verified. If cancellation arrives after dispatch, preserve the actual result/unknown evidence even though future children are fenced. Executor completion and provider acceptance do not prove delivery/read.

## Local protocol and durable work
`createRuntimeHost` supplies execute, status, capabilities, doctor, work, start and stop. The injected LocalExecutor authenticates/authorizes every call and shares the one durable runtime. execute maps to the retained wire method submit; doctor is local readiness, with historical diagnostics still available through the retained protocol. Work methods are work.list, work.claim, work.heartbeat and work.ack with bounded limits/leases. Claim/heartbeat/ack must check principal/task/generation/lease/fence in one authoritative transaction. Claim returns durable events; wake payload is never the task's work payload. Ack only follows durable processing, not wake acceptance.

### Conversational poll answers

An authenticated inbound Spectrum `poll_option` is normalized as the internal
`poll-answer` event when its public option/title, selection boolean, sender, and
route are valid. It remains a poll interaction with capture provenance; it is
not registered as a text message or granted a fabricated `MessageRef`. The event
contains `senderId`, `optionText`, nullable `question`, `selected`, bounded
`answerText`, `captureId`, and nullable verified poll/option correlation in
addition to the ordinary inbound envelope.

Question provenance is used only when the received public payload supplies it.
Absent native poll and option identities, the authorized conversation's active
task receives an explicitly ambiguous textual answer. A supplied authoritative
identity must resolve to the exact persisted poll owner; failure remains
unresolved and never falls back to the conversation's current task. Selection,
deselection, and later selection events retain their distinct provider-derived
event identities. Capture replay and duplicate delivery preserve one logical
handoff, and wake continues to carry only its durable pointer.

Conversational answer ingress is independent of native poll management.
`poll.create` remains available through the shared owner, while `poll.get`,
`poll.vote`, `poll.unvote`, and `poll.addOption` still require their separately
approved management binding.

## Compatibility and adaptation
The committed baseline already includes legacy `contracts/ports.ts`, table-based ExecutionServices, private `runtime/core/execution-boundary.ts` and feature-local child record access. These remain untouched and are NOT the frozen public service contract. New authors use the exact `feature.ts` and `services.ts` entry points; old root/`./contracts` type names are retained to keep existing CLI/lane code compiling. This is an explicit compatibility boundary, not permission for new features to use private records.

Integration/WT-01 must adapt the inherited runtime to f0-services-2, and WT-03 through WT-07 must consume that single seam. `createRuntimeHost` requires that explicit contract version and registration into the injected executor; it cannot silently attach existing implementations. Foundation tests prove the public interface and test-fixture semantics, not production executor durability or fully integrated feature behavior.

## fix-1 maintenance preparation (2026-09-11)

The additive `ExecutionServices.admission` snapshot carries runtime-captured card update metadata. DurableSubmission captures a settled card revision in the same authorized transaction as the first outbox insert. It preserves that value on idempotent replay and recovery; production maps it into CardRuntimeOptions.updateRevision. Legacy requests without metadata stay blocked. Outbox JSON gains an optional field; no existing SQL migration is rewritten.

The authenticated local protocol also accepts `media.import` with contextId and a strict basename/metadata input, delegating to the existing private host importer. It returns a staged descriptor, not an operation/delivery result; no paths enter messaging action payloads. The CLI is worker D's remaining implementation. See [repair interfaces](../worktrees/fix-1-repair/INTERFACES.md) for exact signatures, trust boundaries and worker ownership.
