# Shared repair interfaces

These are additive maintenance interfaces over f0-services-2. They do not grant new messaging permissions, create a receiver, change credentials, or add another outbox. The reviewed starting commit is a3c36b3a04208a022fa7f994f1580b54223dc2c9. Preparation evidence belongs to the new maintenance section of integration/TEST-EVIDENCE.md, not the historical lane results.

## A: incoming references and receipt-aware capture

Implemented in `packages/photon-features/src/host/incoming-resources.ts`:

```ts
interface IncomingResourceBinding {
  reference: Extract<ResourceRef, { kind: "message" | "attachment" }>;
  providerId: string;
}
registerIncomingReferences(tx: Transaction, context: TrustedContext,
  bindings: readonly IncomingResourceBinding[], now: number): void;
```

Caller: coordinator's trusted ingress binding. Implementation owner: coordinator. A extracts bindings from authenticated captured SDK fields, using the same IDs as normalizeCaptured. No local request accepts these bindings. The implementation validates the durable grant, active task/generation, full scope and parent ownership. Messages are inserted before attachments, exact replay preserves revision, and any identity collision aborts the transaction. It does not overwrite or widen authority. No provider I/O occurs inside this transaction.

A adds one shared capture-processing path used by both live reception and recoverCaptures. Its proposed exact callback is `registerReferences(snapshot: unknown, event: IncomingEvent): Promise<void>`; registration finishes before `accept(event)`. The coordinator supplies that callback using the existing store/context and this primitive. A derives actual message and attachment identities, including grouped child messages, from captured fields; do not register a synthetic parent ID as a native attachment GUID or grant authority to unrelated reaction/reply targets. Unsupported voice identities stay unresolved. Persist capture first, register references, observe receipts, then accept/reduce. A owns normalize.ts; B never edits it.

A retains the existing `ReceiptAcquisition` from receipt-observer.ts: `{writer: {recordReceipt(observation): void | Promise<void>}, resolveTarget?(scope, providerTargetId): {providerId, reference} | undefined}`. The coordinator binds the single store's receipt writer and exact target mapping, and passes the same acquisition and Correlations to live and replay. A integrates subscribeMessageEvents (or reuses its receipt-aware processing in SpectrumEventSource) as the only owner.stream consumer. Preserve failure/lifecycle reporting. Receipt processing does not itself generate conversational work; acceptance/delivery/read remain independent.

Storage query implementation is explicitly A-owned: state/sqlite.ts and adapters/state/sqlite.ts. Existing `DurableSQLiteStore.scan(table, after = "", limit = 1000)` provides complete keyset discovery, and scanAll already exists; reuse it when suitable and recheck rows transactionally. For generic Transaction consumers A may add an optional fourth `afterId?: string` to `Transaction.list` only through a coordinator request. The prepared Transaction interface is unchanged. Prefer an A-local injected query `pending(scope: Scope): InboxRecord[]` over editing the shared contract. Never interpret a first page of 1000 historical/reduced records as completion. Test exact 1000, 1001 and multiple pages, including interspersed unresolved/pending records and other scopes.

## B: poll identity, routing and provider boundary

Installed spectrum-ts 12.8.0 provides `poll`, `option`, `Space.send`, `PollOption` (title/selected), and narrowed iMessage getMessage/getAttachment/getMembers/getAvatar/getDisplayName. It exposes no narrowed `provider.polls` or `provider.client`. The underlying `PlatformRuntime.client` sits under Spectrum's `__internal`; its presence in declarations is not permission to access it. The advanced-kit documentation describes a separate `im.polls` API. No production shared-owner public poll-management binding exists in this pin. No dependency upgrade or second client is authorized.

Existing `registerNativeOptions(unit, {poll, nativePollGuid, options: [{nativeId,label}]})` in polls/identity.ts stores native option IDs in existing references and polls records, with immutable parent/owner checks. Reuse it. `reconcilePollState` already checks the current trusted context. Native poll ID is `pollMessageGuid`, native option ID is `optionIdentifier`; labels, caller keys, choice positions, and synthetic event IDs are never substitutes.

Implemented shared helpers in host/poll-correlations.ts:

```ts
interface NativePollVoteIdentity { pollMessageGuid: string; optionIdentifier: string; }
interface ResolvedPollVote { poll: PollRef; option: OptionRef; route: TaskRoute; }
resolveNativePollVote(tx: Transaction, scope: Scope, identity: NativePollVoteIdentity): ResolvedPollVote | undefined;
createPollCorrelations(store: TransactionStore,
  nativeIdentity: (message: CapturedMessage, scope: Scope) => NativePollVoteIdentity | undefined): Correlations;
routePollEvent(event: IncomingEvent, tx: Transaction): TaskRoute | undefined;
```

They use existing scopedId primary keys and authoritative message/poll/option owners; stale generations and mismatches remain unresolved. B must preserve this deterministic ID contract. The resolver deliberately has no default native-ID extractor. It is operational as a tested identity lookup, but production vote ingestion remains blocked until an authenticated provider surface exposes the IDs. Coordinator wires B's supplied resolver into A's normalization/replay and routes votes to the persisted originating owner, not whichever task is current in the chat.

B owns the feature-level scoped binding in polls/sdk.ts. Extend its existing `resolveSpace` binding with `binding(context: TrustedContext): {scope: Scope; phone: string; conversationId: string}` for authoritative line identity; a logical lineId must not be compared to an E.164 phone. If a verified public management surface is found, the agreed adapter is `management(context: TrustedContext): Promise<{get(pollMessageGuid: string): Promise<NativePollState>; vote(pollMessageGuid: string, optionIdentifier: string): Promise<NativePollState>; unvote(pollMessageGuid: string): Promise<NativePollState>; addOption(pollMessageGuid: string, text: string): Promise<NativePollState>}>`, where NativePollState carries native poll/chat IDs, full native option IDs/labels, and only actually observed vote state. This is a proposed binding contract, NOT an implemented or configured capability. Do not add inert stubs or claim closure on mocks. Report exact absent SDK symbols and required upstream surface when this pin cannot supply it. Provider writes remain inside executeChild with reconciliation after uncertainty.

## C: durable card revision and real interactions

Implemented shared service field:

```ts
interface AdmissionMetadata {
  readonly cardUpdate?: Readonly<{ cardId: string; sessionId: string; expectedRevision: number }>;
}
// ExecutionServices:
readonly admission?: Readonly<AdmissionMetadata>;
```

`captureAdmission(tx, action, context, now)` runs after action authorization in DurableSubmission's first-insert transaction. OutboxRecord.admission is an additive JSON field, so no applied SQL migration changes. It validates card/session identity, generation, expiry and settled even card revision. Duplicate submission returns the existing request before capture; execution/recovery never reads a newer card revision to replace it. createExecutionServices exposes a frozen detached snapshot. Legacy queued updates without metadata stay blocked, never silently backfilled.

Production now supplies the existing `CardRuntimeOptions.updateRevision(action, services): number | undefined` from services.admission.cardUpdate after matching cardId/sessionId. C uses this existing interface; no private outbox access. Claim checks, original SDK session, CAS and unknown-outcome protections remain intact. Public customized cards can update through their original SDK message. Current production JSON configuration has no universal updateUrl callback, so universal-layout updates remain unavailable unless a concrete backend mapping is supplied. Do not invent an URL encoding contract.

Existing real-interface boundary (already implemented, reuse):
`AppBackendContract = {id: string; source: string; authenticate({body: Uint8Array, headers: Readonly<Record<string,string>>}): Promise<unknown>}`.
`authenticateInteraction(request, backend?) -> Promise<AuthenticatedInteraction>` establishes non-forgeable in-process proof; `normalizeInteraction` alone does not authenticate.
`applyCardInteraction(assertion, snapshot, services, capturedEvent?) -> Promise<{status: "unresolved" | "replayed"} | {status: "committed"; continuationId: string}>` checks identity/participant/action/nonce/freshness, then atomically consumes session and creates a continuation. The runtime's existing afterCommit wake remains the only wake path.

Missing external dependency: no concrete backend wire schema/version, endpoint, signature/key verification policy, participant authentication, signed nonce transport, deployed extension contract, or universal update URL mapping is configured or supplied. The generic verifier seam and template extension IDs do not supply these facts. C must preserve rejection without authentication and document the exact missing deployment contract while completing locally testable revision/session work. Coordinator reserves raw-body capture and claimed execution-service binding for the real authenticated backend once supplied; no fake Photon callback protocol or second HTTP receiver is introduced.

## D: authenticated generated-file import

Implemented shared request/response schemas in contracts/protocol.ts:

```ts
// stdin: mediaImportInputSchema
{filename: string, metadata: {mimeType: string, name?: string, duration?: number}}
// authenticated local request (launcher supplies contextId):
{version: 1, method: "media.import", contextId: string, filename, metadata}
// success, validated with mediaImportResultSchema:
{version: 1, ok: true, result: {stagingId: string, sha256: string, mimeType: string, bytes: number}}
```

The filename is a 1–200-character basename matching `[A-Za-z0-9_. -]`, excluding `.` and `..`. No paths, URLs, native provider handles, source references, context override, credentials, size claims or extra keys are accepted in stdin. The full existing 262144-byte frame bound applies. Schema validation and context resolution precede import. `MediaImportPort(principal, contextId, input): Promise<StagedMedia>` delegates to ProductionResourcePorts.importFile; production wires it now. Missing ports return UNAVAILABLE. Existing owner-only import directory, file mode checks, safe opens, bounded bytes/MIME checks and final authority recheck remain effective. Imported bytes are staging evidence, not a send. Uncertain imports are not automatically retried; there is no request-level import idempotency guarantee.

D implements `grok-photon media.import --json-stdin`, adds stdin handling, command parsing, strict response validation and exit behavior in its CLI files. It must not add file paths to messaging action schemas. D owns manual SKILL.md sections; leave the generated operation block untouched. The final inventory generator is coordinator-only after D handoff.

## Capability facts and final coordinator work

productionCapability requires an explicit matching declaration with implementation=implemented plus actual handler registration before declaring operational availability. Missing declarations are unimplemented; partial implementations stay partial/unavailable. Configured operationBlockers are distinct from implementation; request-specific media/resource checks and authority still run. Observed evidence is never inferred from any of these fields. A must add honest typing declarations, not bypass the evaluator. Missing poll management and card dependencies cannot become available just because a handler is registered.

The generated skill inventory and assembly's registration inventory are still historical structural projections in preparation. Coordinator reconciles them after workers finish, wires all production dependencies once, and tests the complete capture → references/receipts → inbox → handoff → authenticated claim/events → existing Grok task acceptance → authorized action → single outbox/provider path. Offline SDK and Grok-runner fixtures must be labeled as such. Actual Grok execution, installation/activation, provider acceptance/delivery/read, card extension interactions and device behavior require separately authorized external evidence.
