# RFX-00 acceptance

Scope: existing codex/rfx-00-integration worktree, immutable release base b83e3afd7049a991de6daffedf831165890f0901. Original integration documents were preserved and committed before merging. Main, historical F0, other lanes and unrelated state were not reset/recreated. No RFX-12 exists. Exact reviewed original and followup SHAs are in [included-commits.json](included-commits.json).

Phase A merged RFX-01, 02, 04, 05, 11, 07; its real internal Core Usability Gate passed before Phase B (03, 08, 09, 10, 06). Followups were returned to the owning lanes and reviewed before integration. [Integration log](integration-log.md) records each glue file, affected lanes, reason and focused tests.

| Acceptance | Offline evidence |
| --- | --- |
| Shared route with/without displayed E.164 | release-fix-shared-roundtrip.test.ts; shared provider identity remains shared |
| Durable inbox → one handoff → one wake → claim → original inbound → reply to same conversation | release-fix-shared-roundtrip.test.ts using production composition, SQLite, normalizer, batching, work and executor with external doubles only |
| Accepted wake not resent after one second; failed/unknown/restart/claim/ack/cancel/deleted target/rebind | rfx-wake-reliability.test.ts plus shared round-trip; exact equivalent of requested release-fix-wake-recovery.test.ts |
| Created secondary DM authorized across restart; original task receives and replies; unknown/foreign/other owner/generation denied | rfx-multi-conversation.test.ts plus shared round-trip, including static card/contact/poll dispatch; exact equivalent of requested release-fix-multi-conversation.test.ts |
| VM session reuse, missing-auth fresh headless login, secret redaction/private state, no Mac dependency | rfx-vm-bootstrap.test.mjs + completion-configuration.test.mjs |
| Fresh owner config validates before native resolution; activation intent; one SDK owner per repeated host lifetime | release-fix-setup-packaging.test.mjs (same responsibility as requested .test.ts) |
| Owner-local tested archive checks, inactive install/repeat/state-preserving rollback | tests/artifact/rfx-owner-package.test.mjs plus completion artifact journey; synthetic metadata cases are mechanics evidence only |
| Exact SDK and honest static/live/custom/callback/cold recovery separation | rfx-poll-management, rfx-card-restart, rfx-reaction-restart, repair-cards, rfx-capability-truth and lane suites |

The final release command ledger and archive provenance identify exact tested HEAD/platform/toolchain/counts. Source files do not claim a future archive checksum; the external handoff binds it after packaging.

## Remaining operation/runtime limitations

- poll.get, poll.vote, poll.unvote, poll.addOption: direct public Advanced adapter compiled/tested, but default Spectrum cloud composition cannot derive its authoritative endpoint/token. No guessed bridge, per-operation client, private import or second subscription.
- app.update: requires original publicly recoverable SDK Message/session, template identity, admitted revision and URL mapper for universal layout edits. Missing original produces requires_original_session; no replacement send. Signed callbacks, customized Apple extensions and device live rendering each require their own actual deployment prerequisites.
- reaction.remove: exact original bot reaction + parent/part must be recoverable publicly. Otherwise REACTION_COLD_RECOVERY_UNAVAILABLE, no inferred object or similar-emoji deletion.
- Shared group creation/group-change ingress and dedicated-only administration respect actual provider limitations.
- Authority expires after 24 hours in new configuration. No safe automatic same-identity renewal exists; successor generation invalidates prior resources/handoffs. Owner transition/reconciliation is required. This does not establish uninterrupted multi-day usability.
- Provider restart replay/durable cursor and device delivery/read evidence are limited to public SDK support. RESTART_GAP is retained as an informational diagnostic; it does not itself prohibit authorized offline-tested execution.

Actual Grok VM setup/authentication, provider/account prerequisites, selected supervisor operation, delivered/read receipts and physical device observation remain later user-authorized work. Codex performs no real activation, deployment or iMessage send. The target artifact is Linux x64 (amd64/x86_64), as confirmed by the user; local development evidence on Darwin arm64 is a separate tier.
