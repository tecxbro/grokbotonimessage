# Typing controls

`typing.begin` takes `space` and integer `ttlMs` from **100 through 30000**.
`typing.end` takes `space`. These are feature controls, separate from reading a
message, sending text or observing recipient delivery.

Use the existing typing controller. Do not install a competing controller or use
this skill to shorten or replace its existing active-work behavior. An individual
lease's maximum duration is not a claim that the complete activity must finish in
30 seconds. Longer valid activity requires that controller's supported renewal.

A control returning successfully is not proof that a device displayed the dots.
Unsupported providers may no-op. A missing capability or failed typing call must
not prevent the real message from being delivered. Old delayed controls must not
stop a newer valid indication. Expired start requests must not be replayed after a
restart.

This profile exposes the controls and their limits; it does not add an activity
source or decide what counts as activity. Existing read/start/renew/end behavior
stays where it already works.

Sources: [input contract](../../src/contracts/actions.ts),
[typing operations](../../src/runtime/typing/operations.ts),
[lease implementation](../../src/runtime/typing/leases.ts),
[Photon start/stop semantics](https://photon.codes/docs/spectrum-ts/content/typing-indicators).
