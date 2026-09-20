# Feature library and existing-integration binding

## What this adds

A neutral public import exposes the existing feature factories, without importing
the application's host entrypoint:

```ts
import {
  createTextFeatures, createMediaFeatures, createPollFeatures,
  createCardFeatures, createNativeFeatures, createTypingFeatures,
  registerFeatureModules, parseActionRequest,
} from '@grokbot/photon-features/features';
```

These exports refer to the **unchanged** implementations linked in CATALOG.md.
There is no second Spectrum constructor, message subscription, scheduler, outbox,
wake endpoint or provider credential in this addition. Constructors require the
same actual typed dependencies as the original factories. Importing them does not
make missing provider/configuration/session prerequisites available.

Pass the original live Spectrum-backed resources and the existing authenticated
ExecutionServices when registering the modules. Register their actual supported
reducers/compilers as required by the original interfaces as well. A send-only hook
is not a complete interactive feature. Do not call raw handlers around authorization,
resource resolution, cancellation, child journaling or unknown-outcome handling.

## Request client

The supplied client is implemented in client.mjs/client-core.mjs. It uses the
canonical built action parser; there is no second handwritten action validator.
Its four binding ports are explicit:

```ts
import { createPhotonFeatureClient } from '@grokbot/photon-features/feature-client';

// Each function below is a real existing integration port supplied by the caller.
const features = await createPhotonFeatureClient({
  contextId: currentAuthorizedContextId,
  capabilities: readCurrentScopedCapabilities,
  submit: submitToExistingFeatureExecutor,
  status: readAuthorizedOperationStatus,
});
```

The functions named in this example are binding parameters, **not implemented
function names to discover in the friend's text-only bridge**. The exact callable
contract is in client.d.mts. If the current installation does not expose those
ports, it needs a one-time typed adapter to its existing authenticated executor
before this client can send rich operations. This branch does not fabricate or
claim to have installed that deployment-specific adapter.

Once bound, pass `{operation, arguments, idempotencyKey}` to `features.execute`.
It structurally validates, obtains the current context from the binding, validates
again, and calls submit once. It never grants permissions, renews credentials,
chooses a recipient, or retries a failed/uncertain effect. Its promise returns the
bound executor's actual result unchanged. `features.prepare` returns the canonical
request without submitting. `features.status` and `features.capabilities` use only
the supplied read ports. A request ID is not a credential.

Do not assume this is Photon CLI, the old `bun run enqueue` text helper, or a tool
already installed into a remote environment. The neutral imports/client are new
code; the underlying 44 operation implementations and wire schemas are inherited.
The existing text, reply and typing path can stay unchanged while specific rich
features are bound and verified.

## Integration prerequisites, not a bot design

The feature factories need provider/resource access, current authorization,
existing child execution/result persistence, and guarded media/stream/template
ports for the features that use them. Use the original TypeScript interfaces and
preserve their invariants. Do not invent no-op service objects to make a factory
construct successfully. The static inspection assembly in the old package is
explicitly inert and must never be used for live execution.

No role topology, delegation, response style, work-claim workflow, supervision,
webhook registration or login procedure is included in the feature skill. Those
belong to the already working application. This edition is not an instruction to
start the repository's full host or replace that application.

## Build and inspect

Build with the existing pinned dependencies and package build command. The new
package subpaths resolve only after that normal build. No dependency or SDK upgrade
is introduced. `node features-only/verify.mjs --full` from the package directory in a complete source checkout
checks every original schema/example against the canonical parser and imports the
new neutral entrypoint. It does not contact Photon or register a remote binding.

Catalog code links refer to the source checkout. Installed distributions retain
compiled implementations under `dist/src`, declarations, schemas, examples and
this profile; they do not contain the entire source/test checkout. Source-link
verification is therefore a pre-packaging check, not an installed-runtime command.
