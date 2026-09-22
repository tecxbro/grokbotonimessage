> **For `improving-friends-bot`, start with [fresh setup](packages/photon-features/scratch-setup/README.md).**
> The connection instructions below belong to the retained legacy gateway profile.
> Do not combine them with the new native-webhook setup.

# Connect me to iMessage

This is the owner-facing bootstrap for the finished Photon × Grok Bot runtime.

## Trigger

When the owner says **“connect me to iMessage”** (or an obviously equivalent request), treat that as explicit authorization to perform the repository's normal installation, Photon authentication/configuration, activation, and runtime startup on the **Grok Bot cloud VM**.

This is an operating/deployment request, not a request to redesign or modify the product.

## Required behavior

1. Read `packages/photon-features/DEPLOYMENT.md` and `packages/photon-features/SKILL.md` and follow the shipped flow for the current release.
2. Work on the Grok Bot cloud VM, not the owner's Mac.
3. Use the shipped installer/setup/runtime. Do not write a replacement integration, start a second Spectrum client, add transcript polling, or create another messaging bridge.
4. Use Photon CLI authentication as documented. If interactive owner authentication is required, show the real verification URL and fresh code. Never invent a code and never ask the owner to paste Photon secrets.
5. Let setup discover Photon resources and the current Grok Bot identity. Keep internal Grok Bot IDs private. Never ask the owner to choose, understand, or paste an internal Grok Bot UUID.
6. Bind the discovered current iMessage Bot privately as the Photon wake target through the shipped setup flow.
7. Use the shallow operating topology defined by the shipped skill: **iMessage Bot → Orchestrator → Worker(s)**. Only the iMessage Bot operates Photon.
8. Reuse the shared/free Photon route when that is the discovered/authorized setup. Do not provision a dedicated line, change billing, or broaden permissions merely to complete setup.
9. Start exactly one shared Photon/Spectrum runtime and confirm it reaches its documented ready state.
10. Do not initiate an unsolicited test iMessage. Once ready, tell the owner **“connected. send me an iMessage.”** Then wait for a real inbound iMessage.
11. A reply to that real inbound iMessage is requested conversation work, not an unsolicited test. Handle it through the durable handoff and reply to the originating authorized conversation.

## If setup cannot complete

Report the smallest actual blocker and the exact step that failed. Do not redesign the architecture, invent credentials/IDs, bypass authorization, or silently change source code as part of this request.

Source modification is a separate development task.

## Authority

For this operating request, this file routes the owner intent into the deployment runbook and installed skill. Development-only restrictions in `AGENTS.md` against activation/live operation apply to development and test assignments; they do not cancel an explicit owner request to connect the installed product.

The detailed deployment procedure remains `packages/photon-features/DEPLOYMENT.md`. The installed operating contract remains `packages/photon-features/SKILL.md`.