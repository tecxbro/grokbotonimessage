# Integration handoff

Status: in progress.

The registered integration branch starts from F0 and has completed identity,
source, lane-document, and immutable-commit review. WT-01, WT-02, WT-03, and WT-08
are integrated. WT-04 through WT-07 and both WT-09 commits are also integrated.
The authenticated local durable text path passes against an
offline Spectrum `Space`; this proves local composition and SDK-return acceptance,
not package installation, activation, provider delivery/read, rendering, or device
behavior. The exact local WT-09 candidate suite passes 75/76 with zero failures;
the sole skip is the authorization-gated live test. Aggregate verification,
complete shared registration/package wiring, and artifact production remain pending.

See `included-commits.json` for selected inputs and `CHANGE-REQUESTS.md` for the
known shared seams that must remain blocked until implemented and retested.
