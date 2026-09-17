# RFX-11 lifecycle

Base: `b83e3afd7049a991de6daffedf831165890f0901`.
Branch: `codex/rfx-11-lifecycle`. Registered worktree and origin verified; clean at entry, remote main equal to base, no remote lane branch.

## Plan and boundaries

Implement setup-authorized local activation, stable foreground start and portable supervisor guidance, signal-safe shutdown, and conservative explicit stale-owner recovery. Only assigned paths are owned. No live credentials, Photon activation, VM/Mac operation, messages, services, pushes or deployment. Tests use private temporary installations and injected offline SDKs.

Acceptance: validate/enable/run/ready; SIGTERM; same-state restart; pending handoff persistence; exclusive ownership; stale artifacts preserved until explicit recovery; invalid config refused; prior setup authorization reused; typing drained; socket removed. Also test uncertain ownership, repeated signals, supervisor output and startup errors.

## Sources

- https://photon.codes/docs/best-practices/recovery-and-state — retrieved 2026-09-16: persist progress and stable identities across retries; no lifecycle reset of the durable ledger.
- https://photon.codes/docs/spectrum-ts/custom-events-and-lifecycle — retrieved 2026-09-16: explicit SDK stop drains streams and tears down clients. Installed Spectrum contract is pinned to 12.8.0. Existing owner adapter removes SDK process-exiting signal handlers to let the host own shutdown.

## Integration requests

RFX-02 retry state is not present at this base. Lifecycle must preserve the whole database and use existing recovery/dispatcher code; rerun these tests with RFX-02 after assembly. RFX-00 owns final DEPLOYMENT.md and package exports/ownership manifests if needed.

## Evidence

Implementation and lane-local validation complete; cross-lane integration gates remain explicitly open.

## Implemented lifecycle

- `src/host/process.ts`: `setupProductionInstallation(root, releaseRoot, { activateAfterValidation })` returns validation/activation evidence, supervisor guidance, and `start()`. `true` carries prior setup authorization; no prompt is introduced. `start()` revalidates current configuration before connecting. The CLI exposes `setup --installation-root ROOT [--activate-after-validation]`, `supervisor`, `reconcile`, and `recover-stale`; explicit `enable`/`disable` and foreground `run` remain. Activation and startup serialize on the existing owner lock. Signals remain handled through shutdown, readiness is checked before announcing ready, and cleanup/rollback failures retain ownership and fail.
- `src/host/owner-lock.ts`: read-only reconciliation checks same-user private lock metadata, PID liveness and socket liveness. `recover-stale` is the explicit local mutation path. It refuses live owners, PID reuse, unknown/unsupported liveness, foreign/malformed locks, orphan artifacts, symlinks and non-sockets. Recovery serializes against startup, rechecks file identity, removes only proven stale lock/socket, and never touches SQLite. A recovery command interrupted while holding `.recovery-lock` fails closed and requires local operator investigation; there is no automatic guard deletion.
- `src/host/supervisor.ts`: detects launchd, systemd-user, container, or portable VM supervision and returns argv plus guidance. It prints a release-pinned foreground command, same UID/state path, SIGTERM stop policy, delayed restart and explicit stale recovery. No service is installed. The immutable release path must be refreshed when selecting another release.
- `scripts/smoke-test.mjs`: includes the supervisor artifact and verifies all host entrypoints reject missing installation identity. No provider connection or real activation occurs.
- `tests/integration/rfx-lifecycle.test.ts`: exercises actual production composition, durable SQLite and Unix sockets in child processes, with offline SDK/Grok boundaries only.
- `docs/release-fix/rfx-11-lifecycle.md`: this lane's implementation, evidence and handoff. `task-launcher.ts` and final `DEPLOYMENT.md` were not changed.

Shutdown closes the card/local interfaces, then delegates pump/outbox/typing/ingress/SDK/store cleanup to the existing production runtime, and releases ownership only after successful cleanup. Restart uses the same database and existing recovery path without clearing inbox/outbox/handoff state. No retry fields are rewritten by this lane.

## Acceptance evidence

The new lifecycle suite covers all ten requested cases:

| Required case | Observable evidence |
| --- | --- |
| 1. validate → enable → run → ready | Actual foreground child emits ready after validation, enable and socket startup. |
| 2. SIGTERM shutdown | Child exits 0 after SIGTERM; repeated SIGTERM during SDK cleanup also exits cleanly. |
| 3. Restart with same state | Two process runs retain SQLite inode and durable context; accepted outbox work is not resent. SIGINT is also exercised. |
| 4. Pending handoff survives | Pending work remains retrievable after both runs. Separate test reduces pending inbox into exactly one stable handoff. |
| 5. No second owner | Concurrent host child fails before SDK construction; acquisition and recovery refuse a live owner. |
| 6. No blind stale deletion | SIGKILL leaves lock/socket; run and reconcile preserve both until explicit `recover-stale`. Database bytes remain unchanged by recovery. |
| 7. Invalid config cannot activate | Invalid local credential rejects setup and CLI activation, leaving activation disabled. |
| 8. No second permission | Previously authorized programmatic setup and CLI flag activate directly without prompt/input APIs. Omitted authorization leaves disabled. |
| 9. No typing after shutdown | Authenticated socket request starts real runtime typing lease; offline provider records stop before SDK shutdown. |
| 10. Socket cleanup | Runtime socket and lock are absent after graceful shutdown. |

Additional tests cover clean startup failure, failed startup rollback retaining ownership, failed shutdown retaining ownership, malformed/foreign/orphan artifacts and all four supervisor environment branches. Restart tests intentionally do not require an immediate second wake: retry deadlines belong to RFX-02.

## Verification and integration status

Toolchain: Node 24.13.0, npm 10.9.2, dependency installation from the committed root lock with `npm ci --ignore-scripts --no-audit --no-fund`. Initial shared-dependency experiment exposed mismatched root Node types; it was replaced by a lane-local clean installation. No tracked dependency files changed.

- Build: `npm run photon:build` passed.
- Full offline regression run: `node --test --test-concurrency=2 --test-reporter=tap packages/photon-features/dist/tests/{foundation,lanes,e2e,security,integration}/**/*.test.js packages/photon-features/tests/{integration,lanes}/**/*.test.mjs` — **867 passed, 0 failed, 0 skipped**. Includes all 11 RFX lifecycle tests. Log: `.photon-local/regressions.tap`.
- Offline smoke: `node packages/photon-features/scripts/smoke-test.mjs` passed with `activated:false`, `liveVerified:false`.
- Candidate contract check: `node scripts/generate-contracts.mjs --check --target assembled-candidate` fails **CONTRACT_DIGEST_DRIFT**. It hashes host source, so the owned host changes require candidate reconciliation by RFX-00. No digest/manifest was rewritten and no blocker was converted to success.
- Historical ownership/docs runners target the old WT lanes and do not recognize RFX-11. This lane uses the exact user-assigned whitelist against the release base; no historical foundation tree or manifests were edited.
- Required source Markdown downloads returned HTTP 200, `text/markdown; charset=utf-8`, with matching titles. SHA-256: recovery-and-state `65944f4b202e0142388403aff39b3135b3dca7ab87035cdc36af22713716a9f0`; custom-events-and-lifecycle `f00445888cb5944ff77f259b3e781009977d57367d753d586029705e406980c5`. Local snapshots/headers are in `.photon-local/`.

Remaining assembly work: RFX-00 must reconcile candidate digest/ownership, document the new commands in final DEPLOYMENT.md, and export `setupProductionInstallation` through the public package host barrel if the installer needs the package-name API. The function is already exported by `host/process.ts`. RFX-02's assembled retry ledger needs a combined test proving a future retry deadline is not bypassed across restart. This lane introduces no alternate dispatcher or wake scheduling policy. No installed-artifact attestation, real supervisor installation, provider/device verification, push or deployment is claimed.

Final focused rerun: 11 passed, 0 failed, 0 skipped after all source changes. Build and offline smoke passed again. Exact ownership whitelist and `git diff --check` passed; no staged/unstaged deletions exist.

Tested source SHA-256 (before committing):

- `packages/photon-features/src/host/process.ts`: `af419a2499bad7a0a9125833df31f78ef733e2ee5403a1d7c38499efa6ccc0ea`
- `packages/photon-features/src/host/owner-lock.ts`: `50fe7e7be6169f1464ddc6d3c580ec1eb7bb90f30c84363e4ba4997aa346532b`
- `packages/photon-features/src/host/supervisor.ts`: `e1ab289be5d7f4e542d04523c4102b3429b13de31b81c2dda6e669acdaaa5aa9`
- `packages/photon-features/scripts/smoke-test.mjs`: `2e85e420f16e9344702f54d2b3ca4c3ee13fb63dc3d84de72963d5538deec0a3`
- `packages/photon-features/tests/integration/rfx-lifecycle.test.ts`: `9aec1dd42e1dbc3a0d9e0e158cfb69116b0f6969cde28f9b999cc33fa1b2099a`

## Exact commit handoff

Implementation commit: `0f9e4db417c0011c308a5ba53f14860c9dc8f4ab`. The final regression rerun tested the identical source hashes above: **867 passed, 0 failed, 0 skipped**; final focused lifecycle rerun: **11 passed**. This follow-up documentation commit records the implementation SHA without claiming a self-referential commit hash. No push was performed.

## Follow-up: installation-owner renewal is blocked by transition semantics

RFX-00 requested a bounded follow-up after reviewing `9aea50ab2de1cd825909a61bf86e6d3b2fe0ffe1`, with the explicit fallback to report a blocker rather than invent a renewal mechanism. Inspected RFX-05 implementation `54f90b99e2a325759b52639bca8c43716850f7e7` read-only. Its generated v3 `installation-owner` grant expires 86,400,000 ms after issuance. Its credential-aware administration changes **do not change `transitionAuthority`**: the exported function body has SHA-256 `1d1bf57fbeadda138b1bb39772de29db909f068b6650e27268a7ac452a93fa5b` in both this lane and that RFX-05 commit.

**Renewal is NOT implemented or approved for automatic use.** The existing authenticated, audited `renew` is authority rotation, not an identity-preserving expiry extension:

- `host/authority-admin.ts:42-44` requires a different unused context ID and exactly generation + 1. A same-context/same-generation expiry extension throws `INVALID_AUTHORITY_SUCCESSOR`, before or after expiry, with no audit/config/state mutation.
- `authority-admin.ts:52-59` revokes the old context and updates the task plus primary space only. Other resources and pending handoffs keep their old generation; outbox actions keep their old context ID. Retention alone does not make that work usable.
- `runtime/core/work-handoff.ts:14-49` filters work by current generation and refuses to claim the old handoff. `runtime/core/authorization.ts:175-184,220-230` refuses the old message/resource and outbox record under the successor.
- `runtime/core/recovery.ts:66-94` encounters the old revoked context and blocks queued outbox work with `CONTEXT_REVOKED`. `runtime/core/idempotency.ts:26-34` includes generation in request identity, so resubmitting the same key with the successor creates a different identity. A lifecycle wrapper cannot repair these effects while preserving existing claims/fences and idempotency.
- Revoked or cancelled authority is explicitly non-renewable (`authority-admin.ts:45-46`). Those safeguards must remain. No expiry increase, reseeding, automatic legacy renewal, provider call, or activation was added by this follow-up.

### Required existing call sites / ownership decision

1. An explicitly reviewed authority transition contract in `authority-admin.ts::transitionAuthority` is required before an identity-preserving installation-owner lifetime operation can be implemented. Existing revision CAS, owner authentication, audit/replay, cancellation/revocation and durable identity checks must continue to hold. This file and the core semantics are outside RFX-11's exact owned paths. Simply invoking existing `renew`, changing the clock, increasing expiry in configuration, or copying generations across records is unsafe and is not a workaround.
2. The existing authenticated persistence entry points are `inspectAuthority` and `administerAuthority`; the latter atomically commits the authority/audit in SQLite and then writes configuration, with exact-request replay covering the intervening crash window. RFX-05's exported `authenticateOwner`, `installationOwnerCredential`, compatible loader and version-preserving writer belong to that integrated seam. RFX-00 is already handling the v3/route glue; this lane does not duplicate it.
3. Once transition semantics are approved, lifecycle entry points are `process.ts::setupProductionInstallation` and `runProductionHost`, before their expiry validation. The running host already owns `host.lock`, while both existing admin entry points acquire it independently: calling them inside the running host would fail ownership. A reviewed stop/drain/release/renew/restart sequence or an explicitly owned internal transaction boundary is necessary; no bypass was added here.
4. `process.ts::validateProductionInstallation` currently rejects expiry at lines 49-51; the readiness monitor does not renew grants. `task-launcher.ts::taskLauncherMain` checks expiry and exact durable authority before each task call. `production.ts::createProductionComposition` captures the context/generation and Grok handoff binding at construction. These consumers require consistent refreshed authority after an approved renewal; relaxing expiry checks alone cannot do that.
5. Because existing data is generation-bound, any approved solution must validate pending/claimed handoffs, queued/unknown outbox results, non-space references, request idempotency and stale-worker fencing together. Existing `DurableContexts`, `DurableWork`, `ExecutionClaims`, `DurableRecovery` and `requestIdentity` are the concrete consumers. This follow-up requests that contract/ownership decision rather than introducing a parallel authorization mechanism.

### Focused proof

Added seven offline tests to the existing owned `tests/integration/rfx-lifecycle.test.ts`: authenticated same-identity renewal rejection and audited rotation's resource/handoff/outbox consequences, each before and after expiry; authenticated revoked and cancelled refusal; expired legacy setup/start refusal without reseeding. The rotation tests also check ordinary task-token rejection, one audit under exact request replay, and changed request identity. These are executable blocker evidence, **not a passing renewal feature**.

No production source files were changed in this follow-up. All fixtures are local private installations; the authenticated admin calls modify only their temporary SQLite/configuration. Runtime flags, tokens and original grants are not changed outside fixtures. Previous full-suite evidence above belongs to the original implementation; follow-up evidence and immutable commit identity are recorded below.

Follow-up verification: Node 24.13.0 / npm 10.9.2; `npm run photon:build` passed. `node --test --test-concurrency=2` over the compiled `rfx-lifecycle`, `completion-authority`, `production-authority`, and `production-lifecycle` integration files passed **30 tests, 0 failed, 0 skipped** (18 lifecycle tests including the seven new blocker/safeguard cases). Logs: `.photon-local/renewal-build.log`, `.photon-local/renewal-tests.log`. `git diff --check` passed. Only this note and the assigned lifecycle test changed; no deleted paths. Test source SHA-256: `dbff6d1f0ee8f3d06f11b7aa7b0d3e4daf6973d1838d9a67c8f1e6a708e36cfe`. The immutable follow-up commit is recorded by the following documentation-only commit.
