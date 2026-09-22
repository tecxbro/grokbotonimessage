# Improving friend's bot: fresh setup and neutral features

The current assignment extends this branch with a complete fresh Photon setup
using one persistent hosted Spectrum owner and a native Grok webhook wake. Preserve
all existing operation schemas, feature implementations, authorization, resource
validation, output journaling and documented provider limitations.

Fresh entry point: `packages/photon-features/scratch-setup/README.md`.
Neutral usage skill: `packages/photon-features/features-only/SKILL.md`.
The older gateway profile stays backward-compatible but is not the new setup path.
No simultaneous gateway/native wake, duplicate SDK client, transcript polling,
replacement model, or instructions assigning bot roles are permitted.

The user expressly authorized setup code in addition to the previous feature-only
scope. Keep login, native routine binding and process management in the setup
profile; keep feature selection/inputs/results in the neutral skill. Do not add
personality, speaking style or delegation rules to either profile.

Changes belong on `improving-friends-bot`, not main or the release-fix branch.
Preserve unrelated work and all existing live installations. Building/testing this
branch does not authorize production activation, live messaging, account/billing
changes or approval-policy changes. Deployment instructions must distinguish
ordinary replies requested by a real inbound message from unsolicited development
tests without hiding external effects or bypassing reviews.

Use the pinned Node/npm/SDK contracts and actual existing repository APIs. Photon
website examples may differ from the pinned CLI; use verified public declarations
or the corresponding official version's source. Do not invent Grok registration
APIs or a worker-activity feed. Missing host/routine/device evidence stays unverified.

Run focused native setup tests, existing feature-only tests, full regressions,
schema/skill drift checks and installed-archive tests. Do not lower assertions or
mark a test skipped because an implementation is missing. Update only the assembled
candidate digest; do not move the historical foundation checkpoint. Keep exact test
counts and source/artifact identities. A full source build is not a live deployment.
