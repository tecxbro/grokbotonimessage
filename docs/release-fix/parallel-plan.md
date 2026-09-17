# Release-fix parallel plan

RFX_BASE: `b83e3afd7049a991de6daffedf831165890f0901`
Repository: `https://github.com/tecxbro/grokbotonimessage.git`
Primary checkout: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/main`

## Preparation scope and status

Create exactly the integration worktree and twelve worker worktrees below from
RFX_BASE. No product implementation, worker execution, merging or cherry-picking
is authorized in this preparation task. Final integration requires the separate
`90_RFX_INTEGRATE.md` prompt.

Worker ownership is NOT READY: the supplied RFX-00 prompt lists the lanes but does
not contain the referenced worker prompts or their exact owned files. Do not
infer file ownership from lane names or historical foundation assignments.
Worktree creation may proceed independently; workers must wait for their exact
file lists to be recorded and checked for production-file overlaps.

## Required worktrees

| Lane | Branch | Exact worktree path | Initial HEAD |
| --- | --- | --- | --- |
| RFX-00 | `codex/rfx-00-integration` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-00-integration` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-01 | `codex/rfx-01-shared-routing` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-01-shared-routing` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-02 | `codex/rfx-02-wake-reliability` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-02-wake-reliability` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-03 | `codex/rfx-03-multi-conversation` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-03-multi-conversation` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-04 | `codex/rfx-04-vm-bootstrap` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-04-vm-bootstrap` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-05 | `codex/rfx-05-config-simplify` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-05-config-simplify` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-06 | `codex/rfx-06-packaging` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-06-packaging` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-07 | `codex/rfx-07-capability-truth` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-07-capability-truth` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-08 | `codex/rfx-08-polls` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-08-polls` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-09 | `codex/rfx-09-cards` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-09-cards` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-10 | `codex/rfx-10-reactions` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-10-reactions` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-11 | `codex/rfx-11-lifecycle` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-11-lifecycle` | `b83e3afd7049a991de6daffedf831165890f0901` |
| RFX-12 | `codex/rfx-12-verification` | `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/rfx-12-verification` | `b83e3afd7049a991de6daffedf831165890f0901` |

## Preparation procedure

1. Verify primary origin, registration, branch, exact HEAD, staged/unstaged/untracked
   state and remote divergence; stop on identity mismatch without resetting work.
2. Verify all target paths and branches are absent. Create RFX-00 directly from
   RFX_BASE and write the three preparation documents there.
3. Create all twelve workers directly from RFX_BASE, without merging or
   cherry-picking the preparation documents into them.
4. Verify every new path is registered, branch and HEAD match this table, and all
   workers are clean. New branches have no upstream; compare each HEAD to live
   origin/main and check whether a corresponding remote branch exists.
5. Complete ownership.md from the missing worker prompts before starting workers.
   Keep this preparation explicitly incomplete until that requirement is met.
6. Stop and report every worktree path, branch and HEAD. Do not start integration.

## Working boundaries

- Preserve `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-00-foundation`:
  do not delete, reset, rebase, reuse or repurpose it.
- The primary checkout is only the verification and worktree-registration source.
- Work only in each assigned worktree and its exact owned files.
- Do not push, deploy, activate Photon, send live messages or touch the Grok VM/Mac.
- Do not weaken tests or turn a real blocker into a successful no-op.
- Workers must not edit `packages/photon-features/src/host/production.ts`.
  Leave concrete requests in their lane note with exact symbols/call-sites,
  expected changes and evidence for RFX-00's later integration.
- Each lane must maintain its own task note under `docs/release-fix/` recording
  files changed, tests, evidence, remaining integration requests and exact commit
  SHA. Record actual existing commit SHAs; do not invent a future/self-referential SHA.
- RFX-00's task note is `docs/release-fix/integration-log.md`.
- These release-fix locations override historical wave locations in AGENTS.md;
  the operating safeguards remain in force.
