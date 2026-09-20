# Results, visibility and safe repetition

| Evidence | What it establishes |
| --- | --- |
| Validated/prepared request | Syntax accepted; nothing submitted by preparation. |
| Queued | Accepted into the existing execution queue, not delivered. |
| Executor-completed | Local execution reached that recorded result. |
| Provider-accepted | The provider accepted the operation; device delivery is separate. |
| Observed-delivered / observed-read | An actual observation exists for the identified target. |
| Blocked / failed / cancelled | Use the recorded reason; do not manufacture success. |
| Unknown | The effect may have happened; reconcile before attempting another effect. |

Successful edit, unsend, read or typing controls may return no new message. An
undefined control result must not be reinterpreted as a missing new-message ID.
Conversely, absence of a result for a send that requires a Message is not proof
that it never transmitted. A network timeout cannot safely mean “send again.”

Keep the same idempotency key and arguments for the same intended operation, and
retain its returned request ID. Query the existing status path. Changed content
under the same key is a conflict; changing the key bypasses deduplication rather
than fixing the original uncertainty. The client has no automatic retry loop.

Respect partial outcomes. If the third content item fails after two were accepted,
those first two are not repeated. A missing original reaction/card handle cannot be
replaced by a guessed handle or a new message. A stream's consumed input cannot be
reopened after a partial send.

Missing receipt evidence remains unknown, including ambiguous group readership.
A successful mark-read request is not a recipient-read observation. A successful
card send is not proof of interactive rendering or an authenticated callback; a
resolved typing call is not proof of visible dots.

Sources: [result contract](../../src/contracts/results.ts),
[receipt contract](../../src/contracts/receipts.ts),
[execution contract](../../src/contracts/services.ts),
[Photon recovery guidance](https://photon.codes/docs/best-practices/recovery-and-state).
