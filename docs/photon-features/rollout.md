# F0 rollout and lane handoff

F0 is a local committed foundation. No remote push, deployment, line provisioning, credential discovery, gateway prompt, live test message, installation or service activation is part of this checkpoint. Its actual commit SHA is reported in chat after commit; foundation.json deliberately contains no self-referential commit SHA.

## Integration sequence

1. WT-01 implements context/resource authorization, durable enqueue/dedup, execution claim/cancel/retry orchestration and state adapters against `StateTables`, `TransactionStore`, `ExecutionServices`, `SubmissionPort`, `assertClaim` and recovery codecs. Use the shared SQLite implementation/migrations; request schema changes through WT-00.
2. WT-02 implements explicitly selected authenticated ingress, typed event normalization/reduction, transactional handoff creation, wake adapter binding and typing begin/end. Consume `IncomingEvent`, `IngressAdapter`, `WakeAdapter`, `ExistingGrokTaskHandoff`, `Clock`, `FeatureModule` and `ExecutionServices`. Do not assume webhooks and streams have interchangeable durability guarantees.
3. WT-03 through WT-07 implement only their owned operation handlers/compilers/reducers/recovery codecs. Import `ActionFor<K>`, `OperationResult`, `ContentSpec`, `ResourceRef`, `FeatureModule`, `ExecutionServices` and `Capability`. WT-03 owns voice formatting; WT-04 owns attachment/media use; WT-05 polls; WT-06 cards/sessions; WT-07 native space/account/effect/metadata/custom operations. Public API gaps remain blocked until verified.
4. WT-08 builds the executable, local protocol client, installer, package and generated Grok operating skill. Consume `LocalRequest`, `LocalResponse`, `HostConfiguration`, `HostComposition` and `foundationCapabilities`. It must implement work retrieval after wake using the provided socket routes. Credentials stay with the host; no integration-code generation during normal Grok use. It must ensure single-host locking, private paths, activation configuration and graceful recovery.
5. WT-09 uses schemas, all action fixtures, fixed clocks, failure hooks, real SQLite fixture, registry harness and typed probes for integration/security/crash acceptance. It must keep unit, SDK-contract, integrated runtime, deployed readiness and physical-device/live results separate.
6. WT-00 alone integrates shared changes and module registration. Production `buildRegistry` must reject missing handlers and duplicate ownership; no placeholder handlers satisfy it. Feature workers may independently build/test with requireComplete false.

## Remaining gates and unknowns

All 44 messaging handlers are unimplemented. F0 has no configured principal/context authority, media stager, registered stream provider, outbox executor, ingestion adapter, wake target or active Spectrum client. SQLite primitives and authenticated local work routes are implemented and locally tested, but that does not make the integrated runtime ready.

Deployment account/project/line, shared versus dedicated eligibility, target conversation, ingress authenticity/replay/catch-up/durable acknowledgement, SDK provider idempotency/outcome reconciliation, card/poll mutation/removal APIs, media/audio dependencies, private runtime directory, service supervisor, single-host lock and existing-task wake binding remain unresolved. There is no approved advanced-provider extension. See operation-map.md for specific public API gaps. Do not bypass them through SDK internals.

Node 24.13.0 / npm 10.9.2 is the verified toolchain, not the machine's global default. Schema generator checks include the shared contracts, storage, host and registry source digest. The lane test command selects only that lane's emitted tests after compiling the package. Fixtures and fake services live only in tests and are excluded from package exports/files. CI configuration is committed; a remote CI run is not claimed.

## Commit isolation

The initial dirty root manifest/lockfile were saved before edits. A checkpoint manifest was constructed from baseline committed package.json plus only WT-00 scripts/workspace/package-manager fields. Its single root lockfile was regenerated with npm 10.9.2 from the baseline committed lockfile, then verified by npm ci in a temporary artifact validation directory. No branch or Git worktree was created there. The checkpoint root manifest excludes the pre-existing root spectrum-ts dependency; the new workspace declares its own exact dependency. Only this checkpoint root manifest/lockfile and owned source/docs/workflow paths are staged. The original root dependency and pre-existing lock changes remain in the assigned working copy and are not described as checkpoint changes.
