# Typing-start lifetime repair

## Scope and source identity

User-requested follow-up to the typing race on `fix-1`.
Base: `8d2a158e161873d3123241c7507d4d8f9d3bc69f`.
The remote files were read through GitHub; the copied source files were verified
against their Git blob hashes before modification. No local Mac worktree,
historical F0 tag, deployment, credentials or live messaging was changed.

Exact maintained files:
- `packages/photon-features/src/host/typing-binding.ts`: new host-owned transient authorization binding.
- `packages/photon-features/src/host/production.ts`: bind it in production, report typing diagnostics and stop/drain typing on shutdown.
- `packages/photon-features/src/runtime/typing/operations.ts`: separate scheduling-claim checks from deferred-lease checks.
- `packages/photon-features/src/runtime/typing/leases.ts`: distinguish pre-dispatch denial from uncertain provider failure.
- `packages/photon-features/tests/integration/typing-start-lifetime.test.ts`: real SQLite/executor regression coverage.
- This maintenance record.

## Behavior and authorization

`typing.begin` still completes scheduling without awaiting a slow conversation
lookup, a provider RPC, or the full typing duration. Holding its outbox claim
while waiting would delay later conversation work.

`bindProductionTyping` issues a bounded validator only while the original
request is claimed. At deferred dispatch it revalidates durable context/task
state, permissions, resource ownership, exact admitted action and cancellation.
A still-queued request must retain its original active fence. A successfully
completed scheduling request may have released that claim. Failed, blocked,
cancelled and unknown-outcome requests cannot authorize the delayed start.
The original context/claim deadline and the lease TTL are not extended.

Private execution records remain in the host binding. Feature modules receive
callbacks, not access to outbox/task tables. The new binding member is optional
for compatibility; absence retains the stricter original claim validation.
It is not a no-op permission bypass.

Lease tokens/generations, expiry, abort handling and the separate control queue
remain intact. A rejected pre-dispatch validation emits `TYPING_LEASE_INVALID`
without making an unnecessary provider stop call. Actual uncertain provider
failures retain the existing cleanup attempt. Host shutdown invalidates leases
before closing state/transport and uses the existing bounded drain.

Scheduling completion is not provider acceptance or device visibility.
No persisted start jobs, SDK changes, new connections, schema migrations,
automatic typing policy changes, or repairs to other feature families are added.

## Sources

- https://photon.codes/docs/spectrum-ts/content/typing-indicators
  Retrieved as rendered HTML on 2026-09-12. Documents `startTyping`, `stopTyping`
  and possible no-op behavior; it does not specify this application's authority model.
- Existing pinned `spectrum-ts` 12.8.0 typing call surface is unchanged.
- Source inspection: runtime/core/{executor,claims,execution-services,authorization,submission}.ts,
  runtime/typing/{operations,leases}.ts and host/production.ts at the base above.

## Evidence and remaining gates

Executed in the editing environment (Linux, Node 22.16.0, not the release-pinned
Node 24.13.0 environment):

- Baseline isolated delayed-start regression: FAIL, exit 1. Expected `start`;
  actual call was only `stop` after the cleared-claim validation failed.
- Patched isolated tests: 31 PASS, 0 FAIL, 0 SKIP. Executed actual transpiled
  typing modules and the new host binding against controlled in-memory
  authority/store and provider/schema doubles. Covered delayed dispatch,
  independent scheduling, cancellation, revocation, expiry, permissions,
  ownership, stale fences, unsuccessful outcomes, overlap tokens, disconnect,
  provider rejection and shutdown.
- TypeScript syntax/transpilation: PASS for the changed TS files. This is not a
  whole-repository typecheck or proof against all pinned dependencies.

The new repository regression file uses the real existing SQLite fixture,
`executeOperation`, `createExecutionServices` and host binding. It has NOT been
executed here. The existing recursive integration runner selects this `.test.ts`
file without a runner change. Run the repository typecheck and integration suite
in the locked development environment before merging. Existing CI/history gates
were not weakened or repaired by this change.

Code implemented: YES. Isolated regression verified: YES.
Whole-repository typecheck/integration: NOT RUN HERE.
Installed/activated: NO. Live device verification: NOT RUN.
