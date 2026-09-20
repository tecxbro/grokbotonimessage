# Improving friend's bot: feature-only branch

This branch adds a Photon feature library entrypoint and a feature-usage profile to
an already connected integration. The operating guide for this profile is
`packages/photon-features/features-only/SKILL.md`.

Keep existing feature implementations, action schemas, authorization, resource
validation, provider mapping and delivery evidence. Use the canonical contracts
and current scoped capabilities; never present an unavailable binding as usable.

This assignment does not replace the existing integration, change its connection
lifecycle, or apply the historical deployment/role instructions. Root CONNECT.md
and the package's older SKILL.md/DEPLOYMENT.md describe the inherited application,
not this feature-only profile. Do not run their installer to apply this profile.

Changes belong only on `improving-friends-bot`. Preserve `main`,
`codex/rfx-00-release-fix`, existing data, credentials and unrelated work. No
production deployment, account changes, live message tests or approval-setting
changes are implied by code or documentation tests.

New usage skills describe feature selection, valid inputs, target references,
prerequisites, outputs and limits only. Do not add personality, communication-style,
role allocation, delegation, task routing, wake setup or worker instructions.

Validate the new source, canonical operation coverage, inherited examples, imports,
package contents and feature-client behavior. Run the existing regression commands
on an environment with the pinned dependencies. Separate offline evidence from
installed-SDK, target-integration and real-device verification. Missing checks stay
unverified. Do not weaken tests or substitute invented SDK methods.

Feature factories are reusable modules, not a ready-made adapter for an uninspected
installation. A real integration must provide the actual typed resource/execution
ports; the request helper must never bypass that authenticated boundary.
