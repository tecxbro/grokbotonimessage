# Photon features for an existing integration

**Branch: `improving-friends-bot`.** This is the feature-only edition: the existing
Photon implementation, a neutral library import, and instructions for using its
features. It is not a replacement bot or a new connection setup.

**Start with [the feature skill](packages/photon-features/features-only/SKILL.md).**
For code and the one-time binding boundary, read
[FEATURE LIBRARY](packages/photon-features/features-only/LIBRARY.md).

| What is included | Where |
| --- | --- |
| Feature-only usage skill | `packages/photon-features/features-only/SKILL.md` |
| Every operation, its inputs, code, schema and example | `packages/photon-features/features-only/CATALOG.md` |
| Focused feature guides | `packages/photon-features/features-only/guides/` |
| Existing implementations, unchanged | `packages/photon-features/src/features/` and `src/runtime/typing/` |
| Neutral factory import | `@grokbot/photon-features/features` |
| Request helper bound to an existing authenticated executor | `@grokbot/photon-features/feature-client` |
| Source/limit notes and test evidence | `packages/photon-features/features-only/SOURCES.md`, `REVIEW.md` |

All **44 existing operation contracts** remain in the branch. Their availability is
not uniform: native poll-management bindings, cold reaction/card recovery and
provider-specific configuration retain their documented limits. The skill reports
those instead of pretending that every registry entry works everywhere.

## Applying this edition

Keep the existing working connection, sending/receiving path, typing behavior and
all non-feature behavior. Give the existing integration the feature skill and the
code linked from it. Use the neutral factories through the integration's existing
authorized execution and resource ports; do not launch this repository's full host
or its connection installer merely to load these features.

The helper prepares and submits requests to a **binding supplied by the existing
integration**. It does not discover or create that binding. A text-only enqueue
script does not become a 44-operation executor by loading Markdown. Rich operations
are usable only after their actual feature modules and prerequisites are bound.
No claim is made that your live installation has already received this change.

The inherited root CONNECT.md and package SKILL.md/DEPLOYMENT.md belong to the old
full-application profile. They are retained as source history, not instructions for
this feature-only edition. Do not load them as part of its skill set.

## Verification

Dependency-free checks for this addition:

```sh
node --test packages/photon-features/features-only/tests/*.unit.test.mjs
```

With the repository-pinned Node/npm and locked dependencies:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run photon:build
node --test packages/photon-features/features-only/tests/*.unit.test.mjs
node --test packages/photon-features/features-only/tests/contracts.test.mjs
node packages/photon-features/features-only/verify.mjs --full
npm run photon:check
npm run photon:test
npm run photon:test:integration
npm run photon:test:installed
```

These commands never authorize a live message. The review record distinguishes
what actually ran from pending SDK, integration and device checks. No deployment,
new phone line or security-setting change is part of this branch.
