# Integration handoff

Status: concrete production path implemented locally; approved release,
installation, activation, and external task evidence pending.

The registered branch starts at immutable F0 and contains every reviewed WT-01
through WT-09 input in `included-commits.json`. The existing lane factories
assemble all 44 public handlers and 12 compiler families. The fresh exact Node
24.13.0 non-live aggregate passes 759/759 across 79 files with no failures or
skips; the live suite remains explicitly excluded.

## Concrete deployment path

The release now ships three distinct executables:

- `grok-photon-host` validates/enables strict production configuration, verifies
  the selected immutable release and skill hash, acquires `runtime/host.lock`,
  owns one SQLite store and one Spectrum client/stream, recovers before accepting
  work, serves one credentialed 0600 Unix socket, and handles orderly SIGTERM.
- `grok-photon-task` verifies the selected release, current task ID/generation,
  and expiry before injecting `GROK_PHOTON_CONTEXT_ID`,
  `GROK_PHOTON_SOCKET`, and `GROK_PHOTON_CREDENTIAL_FILE` into the existing
  authenticated client.
- `grok-photon` remains the local task client; it is not the service process.

`DEPLOYMENT.md` provides the exact version-2 configuration, owner-only secret
files, release-bound systemd unit, enable/start/readiness/stop/disable commands,
and inactive rollback sequence. Shutdown closes the task socket and provider-
writing work before releasing Spectrum and SQLite ownership. A stale lock or
socket is a refusal, never an invitation to delete or kill an unverified owner.

## Grok skill and task binding

The host invokes the configured existing Grok CLI as
`gbot --gateway send <agent-id> <pointer-only-prompt>`. The fixed prompt contains
only the durable handoff ID, configured task ID/generation, selected release
`SKILL.md`, and exact release-pinned `grok-photon-task work.claim` command. It
contains no iMessage body or credential. Gateway success is wake acceptance, not
durable task acknowledgment; the task must claim, heartbeat, and acknowledge by
handoff ID.

Focused local evidence covers the exact command arguments and proves the
production composition reaches one offline Spectrum `Space.send` exactly once
through authenticated IPC and one owner. This closes the missing repository
loader/launcher seam. It does not prove that a particular external Grok gateway
accepted the command, loaded the skill, or claimed work.

## Remaining external evidence

No approved archive was produced, no release was installed, no real Spectrum or
Grok credential was configured, and no process was activated. A controlled external
non-message task observation is still required before claiming task binding for
a deployment. Provider acceptance/delivery/read, extension rendering, human
interaction, and physical-device behavior also remain independently unproven.
