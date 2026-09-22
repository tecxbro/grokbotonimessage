# Source authority and boundaries

Prepared September 21, 2026 (America/Los_Angeles). This profile extends
`improving-friends-bot` from feature-only HEAD
`9d7a02aebb2117ca799335045e8e17cf5890d4b9`; the underlying full feature base is
`3d34354e85b1c64a3c165498d9e904f3c0182d26`. Build-input workflow commits between
that baseline and this implementation do not themselves prove this implementation.

## Architecture supplied by the owner

The provided `ARCHITECTURE.txt`, `README.md`, `runtime.ts`, `storage.ts`,
`config.ts` and `types.ts` establish one hosted Spectrum process, saved batches,
a native wake-only POST containing `batchId`, and explicitly queued output.
The runtime uses project ID/secret, not the Photon CLI device token. That is the
retained architecture. Private traffic, real sender/line numbers, queue contents
and secrets are not copied into this branch. The old JSON file queue is not used;
the full feature runtime's existing SQLite and authenticated executor are retained.

The supplied voice policy and prior orchestration plans are not imported as bot
instructions. The neutral feature skill stays about feature selection, exact inputs,
references and results. The native routine document adds only messaging mechanics.

## Public documentation actually read

- https://photon.codes/docs/llms.txt — live index used to locate the following pages.
- https://photon.codes/docs/cli/installation — public CLI package and official source repository.
- https://photon.codes/docs/cli/authentication — owner device login; not app credentials.
- https://photon.codes/docs/cli/projects — project management; note version mismatch below.
- https://photon.codes/docs/cli/spectrum — enrollment/platform configuration, distinct from rich sends.
- https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing — hosted gRPC, original line/chat, shared mode.
- https://docs.x.ai/grok-bot/skills-routines-and-automations — routines belong to a bot. This page does NOT establish this bot's exact private webhook registration API.
- https://docs.x.ai/grok-bot/computers — hosted computer lifecycle, not an always-on service guarantee.
- https://nodejs.org/api/child_process.html — process creation and IPC lifecycle.

The real routine URL/key and exact authentication contract must be obtained through
that bot's exposed tools/UI. The supplied working bridge uses Bearer authentication;
no registration API, payload visibility guarantee, private thinking-state feed or
VM uptime guarantee is invented here. A process supervisor cannot run while its VM
is suspended. The optional systemd user service must be tested on the actual host.

## Pinned source beats mismatching current examples

The runtime keeps Node 24.13.0, npm 10.9.2 and Spectrum 12.8.0. CLI setup installs
its private **@photon-ai/cli 2.2.0**, not an arbitrary version found on PATH.
The existing SDK declarations and real compiled feature code were available from
an exact GitHub build artifact and used in tests; no dependency was reconstructed
from prose or upgraded to match newer documentation.

Official CLI 2.2.0 files were inspected through GitHub:

- https://github.com/photon-hq/cli/blob/v2.2.0/src/commands/projects.ts
  Git blob `efce14ff68cb44388ba6334d0df39d74a15a10c1`.
- https://github.com/photon-hq/cli/blob/v2.2.0/src/commands/spectrum/users.ts
  Git blob `0c358801e04ec572c9ab70b662966e0ad4baf7e1`.
- https://github.com/photon-hq/cli/blob/v2.2.0/src/commands/spectrum/platforms.ts
  Git blob `1a665b3c7fa593de48dd6334ddf4d2c178ba1de9`.

The current project-doc example uses `--spectrum`; the actual pinned CLI uses
`--platforms imessage`. The implementation uses the latter. CLI 2.2.0 defaults
location to `United States` and requires first name, last name, email and phone
for noninteractive user enrollment. It can return sensitive user fields; our
helper exposes only an explicit safe output allowlist. No invitation is requested.

## Application choices, not provider guarantees

The versioned binding, private helper paths, 60-second work claims, eight-second
typing refresh, bounded responding state, atomic final admission, parent heartbeat,
restart limits and optional user service are this application's implementation.
An activity report comes from a real claim/helper call, not access to Grok's hidden
reasoning. Provider no-ops, unknown outcomes and inherited capability limits remain
explicit. The 44-operation catalog is not an assertion of universal live support.

## Evidence

See REVIEW.md, the branch's actual Actions runs, and the archive provenance.
Offline HTTP/provider doubles establish the application boundary; they are not
real owner login, native routine, iPhone rendering or overnight-host proof.
