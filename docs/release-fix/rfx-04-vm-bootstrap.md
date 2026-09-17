# RFX-04 VM bootstrap

Assignment: `codex/rfx-04-vm-bootstrap` in the registered `rfx-04-vm-bootstrap`
worktree, based on `b83e3afd7049a991de6daffedf831165890f0901`.
Origin and remote main verified; initial staged/unstaged/untracked inventory empty;
branch has no remote counterpart or upstream. Historical foundation is untouched.

## Implementation plan

Implement a separate discovery command, with no runtime configuration generation.
Use the six assigned production files, one assigned integration test and this note.
Linux-only execution guard precedes installation or login; tests inject a Linux
host into the exported orchestrator and use only fake child executables.
Private tool prefix and installation runtime contain npm cache, Photon state and
secrets. Forward login bytes immediately to stderr; stdout remains a single JSON
result. Read project secrets without rotation. Choose only unique resources and
return explicit unresolved decisions. Inspect Grok help and use its advertised
live roster command, never a send probe or a disk profile ID.

Acceptance: all ten requested fake-executable cases; additional failure/ambiguity
checks; package build/typecheck and existing CLI regressions. Legacy ownership
verification is historical and cannot authorize RFX paths; report that separately.

## Source evidence

Official Markdown retrieved with HTTP 200 and text/markdown on 2026-09-16;
source bodies and hashes captured under ignored `.photon-local/rfx-sources/`.
The five required sources were reviewed. Public CLI source at
`13fb65a3f33e801cb50f7e7a240a8eb6466c4152` confirms `projects secret [id] --json`
returns `{id, projectSecret}`, lists return arrays, and `whoami` has no JSON flag.
`auth status --json` returns backend rows with `loggedIn` and `user`.
The source has advanced beyond the prose's command inventory; detect capabilities
from the installed CLI's help rather than assume the read-secret command exists.
Grok's historical CLI at `d9d3912^:src/cli.js` advertises `--gateway --json bots list`;
`src/commands.js` confirms forcing gateway prevents the disk fallback. Installed
help must advertise this surface before it is used. No installed live CLI is run
in development.

Sources:
- https://photon.codes/docs/cli/installation
- https://photon.codes/docs/cli/authentication
- https://photon.codes/docs/cli/projects
- https://photon.codes/docs/cli/spectrum
- https://github.com/photon-hq/cli


## Commands and process behavior

```sh
grok-photon setup --installation-root /workspace/grok-photon --json
grok-photon setup --installation-root /workspace/grok-photon --project PROJECT_ID --json
```

Optional `--tool-root`, `--photon-executable`, `--grok-executable` take precedence
over `GROK_PHOTON_TOOL_ROOT`, `GROK_PHOTON_PHOTON_EXECUTABLE`, and
`GROK_PHOTON_GROK_EXECUTABLE`. Tool root defaults to `<installationRoot>/tools`.
Roots must be absolute and may not be `/`; symlink write-root components fail.
Executable selection is configured path, PATH `photon`, then
`<toolRoot>/photon-cli/node_modules/.bin/photon`. An invalid explicitly configured
executable fails rather than silently changing installations. Existing private
npm projects without a working Photon executable are preserved and reported as
`PHOTON_PRIVATE_PREFIX_OCCUPIED`.

Only the installed command on Linux proceeds. Development tests inject Linux
into the exported orchestrator; the command-line entry point has no environment
escape hatch. The VM install uses npm `--prefix`, private cache, no global install,
no sudo, no lifecycle scripts, and the source-reviewed `@photon-ai/cli@2.2.0`.
Existing CLI versions are reused and recorded. Dependency manifests are unchanged.

Each invocation creates `<installationRoot>/runtime/setup/discovery-XXXXXX/`.
Photon configuration persists at `runtime/setup/photon-config/`; HOME/XDG paths
are isolated under `runtime/setup/home/`, and temp files use the session directory.
An existing runtime session is verified first. If none was imported yet, only the
matching backend credential is copied read-only from the VM CLI's explicit config,
XDG/default config, or legacy photon-dashboard store into the private runtime at
0600. The original is never migrated, rewritten or deleted. Inherited npm settings
and Photon token/project overrides are removed, so verification uses that session.
`PHOTON_API_HOST` and existing VM Grok gateway/access credentials are inherited;
no credentials are read from a Mac or copied from a Mac profile. The historical
Grok CLI uses VM environment credentials on Linux; its Mac-only session reader
is deliberately not invoked as a discovery fallback.

When login is required, its stdout and stderr bytes are immediately forwarded, unchanged, to setup
stderr while `photon login --no-browser` waits. They are never captured in the
result or written by setup to disk. The caller must surface stderr while the
process is running and must not persist the transient device code. JSON stdout
is emitted once discovery finishes. Ordinary discovery captures at most 2 MiB
stdout, uses a 30-second deadline and does not retry. Auth/help stderr is also
captured within the same bounded memory limit for classification/inspection; other
child stderr is discarded. Captured diagnostics are never exposed or logged.
Installation has a 3-minute deadline; login has 15 minutes. The exported API
accepts an AbortSignal and stops its child. Failed login exits before project/resource discovery.

`photon whoami` is invoked before login. An authenticated session is reused without
a login command. Only the source-reviewed `Not authenticated` / `Session expired`
errors initiate one `login --no-browser`, followed by another `whoami`. Other
failures, including unknown/network failures, remain blockers; failed renewal does
not loop. Auth status is feature-detected via help and its
JSON must contain one authenticated, non-corrupt row for the selected backend.
Older CLI versions without that JSON surface report `photon.identity` unresolved;
raw whoami prose is not misrepresented as structured identity.

Project lists must be arrays with unique IDs. An explicit project must match
exactly. Zero or multiple projects produce candidates without project-scoped
queries. Secret discovery feature-detects `projects secret`, then the older
`projects show`; both require advertised JSON. The response ID must match the
selected project. No secret rotation, resource creation or line purchase occurs.
A failed read exits nonzero with a fixed error code; an unsupported/missing secret
stays unresolved. The script never includes raw child errors in normal output.

Grok root help and gateway help first identify exactly one invocation style; missing
or ambiguous style/send help leaves `grok.commandStyle` unresolved. Style is inert
evidence for configuration, not a send probe or delivery receipt. The RFX-02-compatible
resolver seam is documented below. The roster adapter still requires the known
legacy live syntax rather than guessing a roster for a different gateway namespace.
Grok help must advertise `bots list`, `--gateway` and `--json`. Only then is
`gbot --gateway --json bots list` executed. Group, hidden, archived, deleted,
explicitly stopped/offline and non-bot entries are excluded; duplicate IDs are
invalid. One remaining bot is selected. For multiple candidates, `bots current`
is used only when advertised, and its ID must match that live roster. Otherwise
candidates remain unresolved. Disk profile UUIDs and inherited agent-ID hints
are never authoritative. No send command is a discovery probe.

## Exact RFX-05 JSON contract

Success and incomplete-discovery results are the `SetupDiscovery` interface
exported from `src/cli/setup.ts`. The result itself is printed, without an outer
runtime-response envelope. Every nullable field below is present. Candidate
objects contain `id` and only the listed optional fields when discovered.
No arbitrary provider properties pass through.

```json
{
  "version": 1,
  "kind": "setup-discovery",
  "status": "discovered",
  "installationRoot": "/workspace/grok-photon",
  "photon": {
    "executable": "/workspace/grok-photon/tools/photon-cli/node_modules/.bin/photon",
    "version": "2.2.0",
    "source": "installed",
    "identity": {"id": "owner-id", "name": "Owner", "email": "owner@example.test"},
    "authStatus": "verified"
  },
  "project": {"id": "project-id", "name": "Project"},
  "projectCandidates": [{"id": "project-id", "name": "Project"}],
  "spectrum": {
    "mode": "shared",
    "user": {"id": "spectrum-user-id", "accountId": "discovered-account-id", "phoneNumber": "+14155550001", "assignedPhoneNumber": "+14155550002"},
    "userCandidates": [{"id": "spectrum-user-id", "accountId": "discovered-account-id", "phoneNumber": "+14155550001", "assignedPhoneNumber": "+14155550002"}],
    "servingE164": "+14155550002",
    "dedicatedLineId": null,
    "lineCandidates": []
  },
  "secretFile": {"path": "/workspace/grok-photon/runtime/setup/discovery-XXXXXX/project-secret.json", "mode": "0600", "format": "photon-project-secret-v1"},
  "grok": {
    "executable": "/workspace/bin/gbot",
    "version": "1.2.3",
    "agentId": "live-agent-id",
    "candidates": [{"id": "live-agent-id", "name": "Orchestrator"}],
    "evidence": "live-gateway-roster",
    "commandStyle": "gateway-flag",
    "commandStyleEvidence": "installed-cli-help",
    "unresolved": []
  },
  "unresolved": [],
  "nextDecision": null
}
```

The example uses fixture identifiers; it is not live discovery evidence.

| Field | Contract |
| --- | --- |
| `status` | `discovered` iff `unresolved` is empty; otherwise `needs-input`. Neither means activation or provider readiness. |
| `photon.source` | `configured`, `path`, `private`, or `installed`. |
| `photon.identity` | `{id, name?, email?}` or null; authenticated identity, not a Spectrum account. |
| `photon.authStatus` | `verified` or `unsupported`; failed supported verification is an error. |
| `project` / `projectCandidates[]` | `{id, name?}`; selected value may be null. |
| `spectrum.mode` | `shared` for an empty successful lines result; `dedicated` when iMessage lines exist; otherwise null. |
| `spectrum.user` / `userCandidates[]` | `{id, name?, email?, accountId?, phoneNumber?, assignedPhoneNumber?}`; selected user may be null. `accountId` exists only if returned, and is never synthesized from `id`. |
| `spectrum.lineCandidates[]` | `{id, platform: "imessage", phoneNumber?}` from actual dedicated line records. |
| `spectrum.servingE164` | Shared: selected user's `assignedPhoneNumber`. Dedicated: uniquely selected line's `phoneNumber`. Otherwise null. Owner `phoneNumber` is never substituted. |
| `spectrum.dedicatedLineId` | Unique iMessage line ID or null; shared mode does not fabricate one. |
| `secretFile` | Private descriptor above or null; no secret value is included. |
| `grok` | Executable/version may be null when unavailable. Agent ID is null until live evidence selects it. Candidates are `{id, name?}` only. Evidence is `live-gateway-roster` or null. |
| `grok.commandStyle` | `gateway-flag`, `gateway-subcommand`, or null; help-derived invocation style only, never proof of a successful send. |
| `grok.commandStyleEvidence` | `installed-cli-help` only after the installed CLI's root and selected gateway help were inspected successfully; otherwise null. |
| `unresolved` | Ordered strings, including project, secret, identity, Spectrum choices/serving evidence and Grok blockers. |
| `nextDecision` | First unresolved field as `{field, action}`, or null. Project choice uses `--project`; user/line/Grok choices are for RFX-05's handoff. |

Private file format: JSON `{version: 1, projectId: string, projectSecret: string}`,
created exclusively at mode 0600 inside a fresh mode-0700 session directory.
Only RFX-05's privileged configuration step should read it. Validate the descriptor,
file ownership/mode and project ID when consuming it; never echo the value.
Repeated runs retain separate private files, so a prior descriptor cannot silently
change projects. A later discovery failure can leave a private file from that run;
it is not evidence of successful setup. Cleanup belongs to installation lifecycle.

Exit codes: 0 complete discovery; 3 incomplete discovery with candidates/unresolved
fields; 2 invalid arguments/roots, missing exact project or non-VM invocation;
4 login/session failure; 5 discovery/install/process failure. Fatal errors keep the
existing `{version:1,ok:false,error:{code}}` envelope and fixed stderr diagnostics.

## Owned files and responsibilities

- `src/cli/main.ts`: dispatch setup independently of context/socket/stdin actions.
- `src/cli/commands.ts`: strict setup argument parsing and configured executable/root options.
- `src/cli/output.ts`: one redacted setup JSON frame; incomplete discovery exits nonzero.
- `src/cli/setup.ts`: headless login, Photon discovery, private sensitive-data handoff.
- `src/host/grok-discovery.ts`: bounded spawn and help-gated live Grok discovery.
- `scripts/install-photon-cli.mjs`: VM guard, safe roots, executable search/private install.
- `tests/integration/rfx-vm-bootstrap.test.mjs`: fake child-executable acceptance cases.

All seven paths above are relative to `packages/photon-features/`; this document
is the eighth changed file. No configuration generator/schema edits.

## Verification

- Toolchain: Node 24.13.0, npm 10.9.2, TypeScript 5.9.3, @types/node 24.10.1.
  Dependencies are reused through ignored local directories; no lockfile edits.
- `npm run photon:build`: passed with the pinned package toolchain. Initial root-only
  dependency resolution picked up TypeScript 6.0.3 / @types/node 26.4.1 and failed
  at three unchanged socket files; package-local pinned dependencies resolved it.
- `npm run typecheck --workspace=@grokbot/photon-features`: passed.
- `node --test packages/photon-features/tests/integration/rfx-vm-bootstrap.test.mjs`:
  24 passed, zero failures/skips. Includes all ten assigned cases plus configured
  precedence, private reuse, failed identity checks, unsupported command handling,
  project-ID mismatch, dedicated/user ambiguity, root symlinks, deadlines,
  cancellation, advertised current-bot cross-check and install failure/preservation.
- Existing `dist/tests/lanes/wt-08/*.test.js`: 21 passed, zero failures/skips.
- `node scripts/run-integration-tests.mjs`: 880 passed across 98 files, zero failures,
  cancellations or skips; this includes the 24 new acceptance tests. Live tests excluded.
- `git diff --check`: passed. An exact path comparison against the user's eight-file
  assignment passed, including untracked files; no deletions or unrelated changes.
- `node scripts/generate-contracts.mjs --check --target assembled-candidate`:
  fails `CONTRACT_DIGEST_DRIFT`. The base manifest and independently computed base
  digest both equal `2f52389bd6e24eeedc8b2f9f02d75f160fa69dc12569c489432f2a084df73539`
  (56 files). Adding the owned `src/host/grok-discovery.ts` produces 57 files and
  digest `9c90a14967813071f89042df23a6053adcca6338830fe75dd7c73bfec7cd5f21`.
  No schema drift occurred before the digest check. The coordinator-owned candidate
  manifest was not edited; the immutable historical foundation remains untouched.

The legacy `verify-worktree.mjs rfx-04`, `verify-ownership.mjs rfx-04`, and
`verify-docs.mjs rfx-04` fail respectively with `WRONG_WORKTREE_PATH`, `UNKNOWN_LANE`
and missing `docs/worktrees/rfx-04/FILES.json`. These validators still describe the
historical foundation wave. They were not changed or relabeled as passing.

## Remaining integration requests

1. RFX-05: consume this version-1 discovery result and private file in its owned
   configuration generator. Present only `nextDecision` initially; retain all
   candidates. Resolve user/line/agent choices against candidates. Do not infer
   account IDs from Spectrum user IDs or dedicated IDs from shared phone numbers.
2. RFX-06: add `scripts/install-photon-cli.mjs` to the explicit archive script list
   in `packages/photon-features/scripts/package.mjs`. The npm `files: ["scripts"]`
   rule already includes it, but the custom release archive list does not. Verify
   the relative dynamic import from `dist/src/cli/setup.js` in the installed artifact.
3. Coordinator/RFX-12: register the exact RFX ownership and task-note convention in
   the new-wave checks. The legacy foundation checks do not support this lane.
   Recompute the assembled-candidate digest after integrating the reviewed host
   discovery file and other lanes; never rewrite the immutable foundation digest.
4. VM integration: verify the installed gbot's advertised live roster surface and
   existing VM authentication. Unsupported surface/auth returns an explicit blocker;
   it never reads a Mac session or guesses a profile UUID. Forward login stderr
   live without storing the fresh device code.

No push, deployment, Photon activation, real login, live send, purchase, secret
rotation, Grok VM access, or Grok Mac operation occurred. Local fixture evidence
is separate from hosted, provider and device evidence.

## Source lock

All Markdown entries below returned HTTP 200, `text/markdown; charset=utf-8`, with
matching document titles and command bodies. GitHub sources returned HTTP 200,
`text/plain; charset=utf-8`, at the exact immutable commit above. Source bodies
remain in ignored local evidence, and hashes make the reviewed content explicit.

| Source | SHA-256 |
| --- | --- |
| https://photon.codes/docs/cli/installation.md | `43297faebaf47e98f31429649c313244b37a5eb3b5e39123e2d34cb7807295ed` |
| https://photon.codes/docs/cli/authentication.md | `7c4b1c73ee9478c4fbca1338648f6ff7a74a748cce7a89b8563e0b1bbf55ce08` |
| https://photon.codes/docs/cli/projects.md | `bdf51faeb855600efa5b7c799f0a5276c71d61797fb1d311c50cb1a860835bda` |
| https://photon.codes/docs/cli/spectrum.md | `5af57fd1a7d9271e42768f13c97512c375a3fd4e820ff619a1acc3699f670596` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/commands/projects.ts | `ab24f64bf9a0813bfe94f0343589848a2790dd362a474f3bb789aeb320c6f6bc` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/commands/whoami.ts | `a95786c90677b290eccb888ec6c8da5a0c9b9ffea3e64095b466fca687b03591` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/commands/auth.ts | `41fb5636f94f2031351c1ebe504119c52c87b2a0217b1f7bdc88d359d158ef07` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/commands/spectrum/users.ts | `a533be34380379c486e6a4dac88b7161edfbc56f688aa794a0f6fcc61b19a71f` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/commands/spectrum/lines.ts | `1f2deeef0109056fe8bbe552d06de285f299f21d59861b49b7018ccd399e403b` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/lib/config.ts | `c26a4ba9228d9e47a26e9e728e353e3fab802fbf55662851771e75f0216f811c` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/lib/types.ts | `015a46e8f2a00ab6336cf1cafa6bbc470e496df9997dea7497f435bb5fc85b9f` |
| https://raw.githubusercontent.com/photon-hq/cli/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/program.ts | `6fd1537453416808a4fed632279f599e0c1416df44b0f642b483f6d1021fd877` |

## Local evidence identity

- `.photon-local/rfx-bootstrap-tests.tap` SHA-256: `8b82de62b69b7d06966c18c30791f47a5bdf22ea8e2ae4de6f62fca80787b702`.
- `.photon-local/rfx-integration-tests.tap` SHA-256: `641ddae2148b63ba78dfa93dbbdf17bec8c39fc35a1ebb669e142fed17da3c3e`.
- `.photon-local/rfx-contract-evidence.json` SHA-256: `3b8ed0d89960404875cffca5dc49355971681756472f95741ba5e45dde730117`.

Tests ran on base HEAD `b83e3afd7049a991de6daffedf831165890f0901` plus the lane diff.
Implementation commit: `e16664270856c106abc4c10c620e8e3752c9988e`.
This follow-up changes only this task note to record that exact commit; the seven
production/test files match the implementation tree that passed the checks above.
The branch is local only; no remote branch was created.


## RFX-00 authentication-reuse follow-up

Requested from RFX-00 after immutable lane HEAD
`7247c799ea325d38ec685a653f9728c7f4ee8a94` was selected for integration. This follow-up
supersedes the initial unconditional-login behavior: existing authenticated CLI
sessions must be reused, and missing/expired sessions alone trigger device login.

Changes are confined to `src/cli/setup.ts`, `src/host/grok-discovery.ts`, the existing
RFX-04 fake-executable test and this note. The VM-only guard still precedes credential
reads or writes. All child HOME/config/temp writes remain in the installation runtime.
External VM credentials are read-only inputs: only a matching backend's regular
credential file is imported; no other backend or profile gets copied. Already
imported runtime credentials take precedence. A private credential symlink or hard
link is rejected before any child can renew through it. Imported credentials and
project secrets remain 0600. No secrets or auth diagnostics enter normal JSON/logs.

The matching backend key and credential format are verified against immutable
Photon CLI source `13fb65a3f33e801cb50f7e7a240a8eb6466c4152` (`src/lib/env.ts`,
`credentials.ts`, and `errors.ts`). Known `Not authenticated` and `Session expired`
messages are classified from bounded in-memory output; an unrecognized CLI error
fails closed rather than guessing that authentication expired. `whoami` success
still requires the advertised auth-status verification before project discovery.

### RFX-02 integration seam

`SetupServices.discoverGrokCommandStyle` has the structurally compatible signature:

```ts
(executable: string, timeoutMs: number,
 inspect: (executable: string, args: readonly string[], timeoutMs: number) => Promise<string>)
 => Promise<"gateway-flag" | "gateway-subcommand">
```

RFX-00 can inject its assembled `discoverGrokCommandStyle` export from
`src/host/grok-wake.ts` in the existing `setupDiscovery(..., services)` call in
`src/cli/main.ts`. This lane deliberately does not import that absent branch export.
Its default compatibility implementation applies the same RFX-02 root/gateway-help
rules. Both paths are restricted to `--help`, `--gateway --help`, or `gateway --help`
on the selected executable; even an injected resolver cannot send through this
inspection capability. Both root and selected gateway help must actually have been
inspected before evidence is labeled `installed-cli-help`.

Persist `grok.commandStyle` only when non-null and `commandStyleEvidence` is
`installed-cli-help`. RFX-00 owns the RFX-05 schema/config wiring. A discovered
`gateway-subcommand` style does not invent support for a corresponding bot-roster
command: the existing roster adapter can return `grok.liveRosterUnsupported`
independently while retaining the inert style evidence. Ambiguous/missing style
help remains unresolved; no real send is attempted.

### Follow-up validation

- The initial expanded fake-executable run passed 31 tests. Final validation adds
  a private-credential symlink case and reruns all 32 cases within the complete
  local integration suite.
- Existing authenticated runtime session: no login; `whoami` and auth status verified.
- Existing VM CLI session in explicit/default/XDG/legacy config: private import,
  no login, original bytes/mtime preserved and copied mode 0600.
- Missing/expired authentication: one live-streamed fake device flow followed by
  verification; failed login and failed renewed auth stop without retry loops.
- Repeat setup: two discoveries, one device login, three `whoami` checks, separate
  private project-secret descriptors.
- Non-auth failures remain redacted blockers and do not initiate login.
- Both command styles, missing/ambiguous help, injected resolver compatibility,
  and rejection of a send probe are covered with fake executables.

Final test totals, evidence hashes and commit identity are recorded below.

RFX-02 source read for compatibility: `74c7d9c265e0267cc13faee0a18410f3718fe44f:packages/photon-features/src/host/grok-wake.ts`.
- [Photon env.ts](https://github.com/photon-hq/cli/blob/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/lib/env.ts), SHA-256 `922f4cf444e441d61eaac1052fdac92458b79a6c04fe495a14542546201179dd`.
- [Photon credentials.ts](https://github.com/photon-hq/cli/blob/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/lib/credentials.ts), SHA-256 `2faad357fa8e287192f3ebf2d0afc718cc14d23a614c4510f13cbbb49d7ea19d`.
- [Photon errors.ts](https://github.com/photon-hq/cli/blob/13fb65a3f33e801cb50f7e7a240a8eb6466c4152/src/lib/errors.ts), SHA-256 `12663655a33599fc201da4ed00ca33a64ca5ea387347157919009bd66ef9f4a6`.


Follow-up build and typecheck passed under Node 24.13.0 / npm 10.9.2 / TypeScript
5.9.3 / @types/node 24.10.1. The broad local suite completed **888 tests: 883 pass,
5 fail, 0 skipped/cancelled**. All 32 RFX-04 cases passed. The five reported failures
are the three subtests plus their parent for `explicit assembled target works on
maintenance branches and detached PR checkouts`, and the final baseline assertion
in `explicit target still rejects schema, source hash and file-count drift without
fallback`, all in the historical `foundation/verification-tools.test.ts`.

Those fixtures use `git archive HEAD`, so they now include the already committed
RFX-04 host file while the coordinator-owned candidate digest remains at the
original 56-file baseline. This explains why the initial pre-commit 880-test run
passed while this committed-HEAD run exposes the integration seam. The immutable
F0 case still passes. RFX-12 must preserve drift rejection while deriving the
assembled expected file count and deliberate count mutation from the newly reviewed
candidate manifest, instead of hardcoding 56 / 57. No test or manifest was weakened
or edited by this lane. Current lane content has 57 digest files and digest
`b97c43a750d45ea230295881b4c062d7d7b9a725d39a32e0bd5b3db198af98ca`; RFX-00 must
recompute for its fully assembled tree rather than copy this lane digest blindly.

Manual diff review and `git diff --check` passed. Exact follow-up ownership is the
four paths listed above, with no untracked files, pending deletions or other lane
edits. No real Photon/Grok executables, authentication, live provider calls or send
probes were used; only spawned fixture executables.


Final focused command:
`node --test packages/photon-features/tests/integration/rfx-vm-bootstrap.test.mjs packages/photon-features/dist/tests/lanes/wt-08/*.test.js`
passed **53/53 tests** (32 bootstrap plus 21 existing CLI regressions), zero
failures/skips/cancellations. Broader suite failures remain recorded above.

- `.photon-local/rfx-auth-reuse-focused.tap` SHA-256 `ec418ad2c529692625e4e999d8306197f8b4a7a91109e156f6a444ae960c2173`.
- `.photon-local/rfx-auth-reuse-integration.tap` SHA-256 `8b73844cebe9d467ca7924da0fd946cb0af6280721dac9cddb8ef3417d94a5a0`.

Follow-up implementation commit: `e15fc7e0d4554c812075837ce988b28feff9c93c`
(parent `7247c799ea325d38ec685a653f9728c7f4ee8a94`). The following commit only records
this exact identity in the lane note; tested production and test bytes are unchanged.
