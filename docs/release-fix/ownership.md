# Release-fix ownership

RFX_BASE: `b83e3afd7049a991de6daffedf831165890f0901`

## Worker ownership: incomplete, workers must not start

The RFX-00 request refers to worker prompts "below", but supplies no worker
prompts or exact file lists. No production-file ownership is granted by this
document until those lists are available. Missing assignments are a blocker,
not an empty ownership check that can pass. No historical ownership is reused.

| Lane | Branch | Exact worktree path | Exact owned files |
| --- | --- | --- | --- |
| RFX-01 | `codex/rfx-01-shared-routing` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-01-shared-routing` | UNRESOLVED: worker prompt not supplied |
| RFX-02 | `codex/rfx-02-wake-reliability` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-02-wake-reliability` | UNRESOLVED: worker prompt not supplied |
| RFX-03 | `codex/rfx-03-multi-conversation` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-03-multi-conversation` | UNRESOLVED: worker prompt not supplied |
| RFX-04 | `codex/rfx-04-vm-bootstrap` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-04-vm-bootstrap` | UNRESOLVED: worker prompt not supplied |
| RFX-05 | `codex/rfx-05-config-simplify` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-05-config-simplify` | UNRESOLVED: worker prompt not supplied |
| RFX-06 | `codex/rfx-06-packaging` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-06-packaging` | UNRESOLVED: worker prompt not supplied |
| RFX-07 | `codex/rfx-07-capability-truth` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-07-capability-truth` | UNRESOLVED: worker prompt not supplied |
| RFX-08 | `codex/rfx-08-polls` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-08-polls` | UNRESOLVED: worker prompt not supplied |
| RFX-09 | `codex/rfx-09-cards` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-09-cards` | UNRESOLVED: worker prompt not supplied |
| RFX-10 | `codex/rfx-10-reactions` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-10-reactions` | UNRESOLVED: worker prompt not supplied |
| RFX-11 | `codex/rfx-11-lifecycle` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-11-lifecycle` | UNRESOLVED: worker prompt not supplied |
| RFX-12 | `codex/rfx-12-verification` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-12-verification` | UNRESOLVED: worker prompt not supplied |

Before workers start, replace each unresolved entry with the exact prompt-owned
production, test and task-note paths. Check duplicate production paths and reject
overlap; route changes to shared composition through RFX-00. Additional paths
require an explicit ownership decision, never a guess from the lane title.

## RFX-00 preparation ownership

Branch: `codex/rfx-00-integration`
Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-00-integration`

- `docs/release-fix/parallel-plan.md`
- `docs/release-fix/ownership.md`
- `docs/release-fix/integration-log.md`

## RFX-00 exclusive final-integration ownership

These are reserved for the later integration prompt, not edited in preparation:

- `packages/photon-features/src/host/production.ts`
- `packages/photon-features/package.json`
- `package.json`
- `package-lock.json`
- `packages/photon-features/npm-shrinkwrap.json`
- Generated schemas/inventories that aggregate multiple lanes (exact paths must
  be enumerated before integration edits; this category grants no worker ownership).
- `packages/photon-features/DEPLOYMENT.md`
- `packages/photon-features/INSTALL.md`
- `packages/photon-features/SKILL.md`
- `.github/workflows/*` only when reconciling RFX-12's proposed workflow
- `docs/release-fix/integration-log.md`

Workers must request production.ts changes through their own lane note,
including the exact symbol/call-site and intended change.
