# Fresh setup review and verification

This records the fresh-setup addition, not a claim of live installation.
Source base: `9d7a02aebb2117ca799335045e8e17cf5890d4b9` on `improving-friends-bot`.
Node 24.13.0, npm 10.9.2 and Spectrum 12.8.0 are unchanged.

## Executed local checks before publication

- TypeScript production build and generated configuration/schema checks passed.
- Fresh setup regression file: **41 tests passed**, none failed/skipped/cancelled.
- Existing feature-only tests: **145 passed**; canonical compiled contracts/examples/imports: **93 passed**.
- Existing foundation suite: **64 passed**.
- The initial wider run was not a complete pass: the reconstructed checkout lacked
  the immutable foundation history and HEAD did not yet contain the source edits.
  The real Git history was restored from a repository bundle, without modifying
  the verifier or changing the frozen foundation checkpoint. The assembled candidate
  then passed **1,115 tests with zero failures, skips or cancellations**. The actual
  complete archive still requires its separate build and extracted-package check.

The new tests use actual SQLite, local authenticated IPC, feature execution and
production composition. Only the external Photon/Grok providers are doubles.
They include the actual production child: SIGKILL, dead-lock recovery, exactly one
replacement, then a fresh inbound message and reply through that replacement.
A generic child fixture separately tests parent-detected hangs and bounded crash loops.

## Ten distinct review passes

1. **Architecture and scope:** one Spectrum owner; no second model, gateway dependency,
   transcript polling, bot creation, role topology or speech-style instructions.
2. **Fresh setup:** actual installed release, Photon-only discovery, private pinned
   CLI, real native routine binding, no placeholder UUIDs or required serving number.
3. **CLI authority:** pinned official source checked; corrected the `--spectrum`
   website mismatch to `--platforms imessage`; enrollment fields and no-invite behavior verified.
4. **Credential handling:** private files, scoped local IPC, literal subprocess inputs,
   bounded outputs, no URL/token logging, no account/billing/secret-rotation shortcut.
5. **Durable completion:** final output admission and acknowledgement share one
   transaction; exact replay returns the same operation; conflicting/stale claims fail.
6. **Feature preservation:** all 44 original handlers/contracts and neutral guides
   retained; actual client binding supplied; existing poll/card/reaction limits not hidden.
7. **Typing:** real work evidence versus daemon liveness, worker-duration renewals,
   completion/expiry/restart and independence from final reply delivery.
8. **Supervision:** child crash and hang tests, real production owner recovery,
   intentional stop, no duplicate child, and explicit whole-VM/boot-persistence limits.
9. **Packaging:** full existing archive builder retained with additive profile payload;
   post-package verifier tests actual extracted modules, helper, SQLite/IPC and repeat install.
10. **Instructions and evidence:** root README first, separate feature/setup skills,
    no approval-policy changes, no private traffic, and local/provider/device evidence separated.

These are ten review passes, not ten independent reviewers or ten deployments.
The first round-trip test exposed a missing fetch-injection connection; it was fixed
in production composition before the passing run. Account helper tests were added
when the pinned CLI's actual flags and required enrollment fields were verified.

## Final gates and deployment boundary

The `Photon scratch setup` workflow runs new tests and feature parity on Linux and
macOS, then builds a full distribution through every existing packaging gate on
Linux. Its separate extracted-archive check is not substituted by source fixtures.
The other existing regression workflows remain in place. Workflow presence alone
is not a passing run; inspect the concrete commit/run and distribution provenance.

No real Photon account was configured, native Grok routine registered, iMessage
sent, approval setting changed or target VM deployed during implementation.
Actual owner authentication, native routine accessibility, visible typing, rich
interaction prerequisites and host boot/overnight behavior remain live checks.
