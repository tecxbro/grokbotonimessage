# Photon v3 integration

This lane assembles the reviewed WT-01 through WT-09 outputs on the immutable
`photon-v3-f0` foundation without activating a production runtime.

## Identity

- Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-integration`
- Branch: `photon-v3/integration`
- Starting HEAD and F0: `ee2f8576b55973eee312bca5cad0549b6f959a88`
- Contract: `f0-services-2`
- Contract digest: `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f`

The initial worktree was clean. No relocation-only edits existed in this newly
created worktree. Lane relocation notes remain historical evidence and are not
replayed into integration.

## Status

Input review and all reviewed WT-01 through WT-09 inputs are integrated. The
public F0 executor now reaches the offline Spectrum text send exactly once through
the authenticated local socket and durable request path. This is local/offline
SDK-acceptance evidence only: it is not activation, provider delivery, read, or
device evidence. The actual lane factories assemble all 44 operation handlers and
12 compiler families. The exact Node 24.13.0 non-live aggregate passes 762/762
across 79 files with no failures or skips; the separately gated live test is not
counted.

The concrete production composition and release-owned host/task launchers are now
implemented and focused-tested without live effects. The deployment runbook
contains supported version-2 configuration and exact systemd lifecycle commands.
Package dry-run and full-collector acceptance pass. A temporary archive built
from a clean ephemeral candidate installed outside its checkout and booted SQLite
twice using its checksummed migration. That acceptance used local approval
scaffolding; no production-approved artifact was published or activated. All
activation, external Grok task acceptance, and live/provider/device evidence
remain outside this local integration result.

## Fix 1 branch composition

The `fix-1` aggregate contains all six reviewed finding fixes:

1. `8eea450` — derive operating-skill status from the assembled registry.
2. `3853f9a` — separate historical, deployment, and operating instructions.
3. `91d895c` — require evidence for Grok skill and task binding.
4. `65818ad` — package the SQLite migration in release archives.
5. `72a4959` — add the concrete production host and task launcher.
6. `0d531ba` — scope ordinary outbox ordering by conversation while preserving
   unresolved-outcome protection and a line-scoped `space.create` dependency.
