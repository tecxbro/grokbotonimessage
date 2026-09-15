import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { operations } from "../../src/contracts/actions.js";
import { assembleDocumentedFeatureSurface, assembleFeatureSurface, requiredCompilerFamilies } from "../../src/integration/assembly.js";
import { createPublicFeatureModule as createNativeFeature } from "../../src/features/native/module.js";
import type { ExecutionServices } from "../../src/contracts/services.js";
import type { ActionFor } from "../../src/contracts/actions.js";
import { fixture as nativeFixture, sample as nativeSample } from "../lanes/wt-07/fixture.js";

const unavailable = (): never => { throw new Error("INERT_INTEGRATION_FIXTURE"); };

test("actual lane factories assemble exactly 44 public handlers and every shared compiler", () => {
  const assembled = assembleDocumentedFeatureSurface();

  assert.equal(operations.length, 44);
  assert.equal(assembled.publicRegistry.handlers.size, 44);
  assert.deepEqual(assembled.publicRegistry.missing, []);
  assert.equal(assembled.compatibilityRegistry.handlers.size, 44);
  assert.deepEqual(
    [...assembled.compatibilityRegistry.compilers.keys()].sort(),
    [...requiredCompilerFamilies].sort(),
  );
});

test("generated manual keeps registration, implementation, provider, configuration and live evidence separate", () => {
  const assembled = assembleDocumentedFeatureSurface();
  const expected = assembled.operationRegistrations;
  const manual = readFileSync(new URL("../../../SKILL.md", import.meta.url), "utf8");
  const rows = new Map(
    [...manual.matchAll(/^\| ([^|]+) \| ([^|]+) \| (registered|unregistered) \| (implemented|partial|unimplemented) \| (native|fallback|unsupported|unknown) \| (runtime-discovery-required) \| (yes|no) \|/gm)]
      .map(match => [match[1]!, { owner: match[2]!, handlerRegistration: match[3]!,
        implementation: match[4]!, providerSupport: match[5]!, configuredAvailability: match[6]!,
        liveVerified: match[7] === "yes" }]),
  );

  assert.equal(rows.size, operations.length);
  for (const registration of expected)
    assert.deepEqual(rows.get(registration.operation), {
      owner: registration.owner,
      handlerRegistration: registration.handlerRegistration,
      implementation: registration.implementation,
      providerSupport: registration.providerSupport,
      configuredAvailability: registration.configuredAvailability,
      liveVerified: registration.liveVerified,
    });
  assert.ok(expected.every(registration => registration.handlerRegistration === "registered"));
  assert.deepEqual(expected.filter(registration => registration.implementation !== "implemented")
    .map(registration => registration.operation), ["poll.get", "poll.vote", "poll.unvote", "poll.addOption"]);
  assert.ok(expected.every(registration => registration.liveVerified === false));
  assert.match(manual, /Handler registration, implementation declaration, provider support, configured account\/conversation availability, and live verification are separate facts\./);
});

test("assembly fails closed when a public lane or compiler is absent", () => {
  assert.throws(
    () => assembleFeatureSurface({ publicModules: [], compatibilityModules: [] }),
    /MISSING_HANDLERS/,
  );
});

test("public native adapter dispatches through exactly one durable child", async () => {
  const f = nativeFixture();
  const action = nativeSample("space.getName") as ActionFor<"space.getName">;
  f.grant(action);
  const childSignals: AbortSignal[] = [];
  const childController = new AbortController();
  const services: ExecutionServices = {
    context: f.services.context,
    claim: f.services.claim,
    signal: f.services.signal,
    clock: f.services.clock,
    assertActiveClaim: () => {},
    resolveResource: reference => f.services.resources.resolve(reference, f.services.context),
    transaction: run => f.services.transactions.transaction(tx => run({
      get: tx.get.bind(tx),
      put: tx.put.bind(tx),
      createContinuation: unavailable,
    })),
    executeChild: async child => {
      childSignals.push(childController.signal);
      assert.equal(child.index, 0);
      assert.equal(child.key, "native:space.getName");
      assert.match(child.argumentsDigest, /^[a-f0-9]{64}$/);
      return child.dispatch(childController.signal);
    },
    recordReceipt: async () => {},
    media: f.services.media,
    streams: f.services.streams,
  };
  const module = createNativeFeature({
    ...f.deps,
    resources: {
      space: reference => f.services.resources.space(reference, f.services.context),
      message: reference => f.services.resources.message(reference, f.services.context),
    },
  });

  const result = await module.handlers["space.getName"]!(action, services);

  assert.equal(childSignals.length, 1);
  assert.deepEqual(result.value, { type: "name", name: "Group" });
  assert.equal(f.calls.filter(call => call.method === "getDisplayName").length, 1);
  f.close();
});
