import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  parseAction, sameScope, sameLineScope, SQLiteStore,
  type IncomingEvent, type ResourceRef, type Scope, type TrustedContext,
} from "../../src/index.js";
import { DurableContexts } from "../../src/runtime/core/authorization.js";
import { authorizedResource } from "../../src/runtime/core/conversation-routes.js";
import { InboundRouter, routeConversation } from "../../src/runtime/inbound/router.js";
import { checkBinding, resolveReference } from "../../src/features/native/guards.js";
import { createNativeModule } from "../../src/features/native/module.js";
import { fixture as nativeFixture, spaceRef } from "../lanes/wt-07/fixture.js";
import { event } from "../fixtures/harness.js";

function fixture() {
  const f = nativeFixture();
  let store = f.store;
  f.services.context.permissions.push("text.send");
  const context = f.services.context;
  const policy = { administrativeIntent: () => true, recipientsAllowed: () => true };
  let contexts = new DurableContexts(store, f.clock, policy);
  function seed(c: TrustedContext) {
    store.transaction(tx => {
      tx.put("contexts", { id: c.contextId, scope: c.scope, revision: 0, context: c }, null);
      tx.put("tasks", { id: c.taskId, scope: c.scope, revision: 0, principalId: c.principalId,
        generation: c.generation, cancelledAt: null }, null);
    });
  }
  function persist(ref: ResourceRef, owner = context, providerId = ref.id) {
    store.transaction(tx => tx.put("references", { id: ref.id, scope: ref.scope, revision: 0,
      reference: ref, providerId, ownedByPrincipalId: owner.principalId,
      taskId: owner.taskId, generation: owner.generation }, null));
  }
  seed(context);
  persist(spaceRef, context, f.space.id);
  f.services.resources.resolve = async (ref, supplied) => {
    store.transaction(tx => contexts.reference(tx, supplied, ref));
    return ref;
  };
  f.services.resources.space = async (ref, supplied) => {
    await f.services.resources.resolve(ref, supplied);
    const row = store.transaction(tx => tx.get("references", ref.id))!;
    return { ...f.space, id: row.providerId, type: "dm" };
  };
  f.binding.provider.space.get = async (id, params) => {
    f.calls.push({ method: "space.get", args: [id, params] });
    return { ...f.space, id, type: "dm" };
  };
  let sequence = 0;
  function action(operation: "space.get" | "text.send", ref: ResourceRef) {
    return parseAction({ version: 1, contextId: context.contextId, idempotencyKey: `request-${++sequence}`,
      operation, arguments: { space: ref, ...(operation === "text.send" ? { text: "hello" } : {}) } });
  }
  async function create(shared = false, group = false) {
    f.binding.dedicated = !shared;
    f.binding.phone = shared ? "shared" : "+15555550002";
    f.space.phone = f.binding.phone;
    const a = parseAction({ version: 1, contextId: context.contextId, idempotencyKey: `create-${++sequence}`,
      operation: "space.create", arguments: { members: group ? ["+15555550111", "+15555550112"] : ["+15555550111"] } });
    await contexts.authorize(context, a);
    return f.run(a);
  }
  function authorize(ref: ResourceRef, c = context) {
    return store.transaction(tx => contexts.reference(tx, c, ref));
  }
  return { ...f, context, seed, persist, action, create, authorize,
    get store() { return store; }, get contexts() { return contexts; },
    restart() {
      store.close(); store = new SQLiteStore(f.path);
      f.services.transactions = store;
      contexts = new DurableContexts(store, f.clock, policy);
    },
    close() { store.close(); rmSync(f.dir, { recursive: true, force: true }); },
  };
}
const secondary = (scope: Scope, id = "secondary"): ResourceRef =>
  ({ version: 1, kind: "space", id, scope: { ...scope, spaceId: id } });

for (const shared of [false, true]) test(`${shared ? "shared" : "dedicated"} DM creation persists a grant usable after restart by the same task`, async t => {
  const f = fixture(); t.after(f.close);
  const result = await f.create(shared);
  assert.equal(result.status, "executor-completed");
  const ref = result.references[0]!;
  assert.equal(ref.kind, "space");
  assert.notEqual(ref.scope.spaceId, f.context.scope.spaceId);
  f.restart();
  assert.doesNotThrow(() => f.authorize(ref));
  await f.contexts.authorize(f.context, f.action("text.send", ref));
  const lookup = await f.run(f.action("space.get", ref));
  assert.equal(lookup.status, "executor-completed");
  assert.ok(f.calls.some(c => c.method === "space.get" && c.args[0] === "iMessage;+;new-group"));
  assert.equal(f.store.transaction(tx => tx.list("tasks", f.context.scope, 100).length), 1);
  assert.equal(f.context.taskId, "task-1");
});

test("root conversation still authorizes and resolves", async t => {
  const f = fixture(); t.after(f.close);
  f.authorize(spaceRef);
  assert.equal((await f.run(f.action("space.get", spaceRef))).status, "executor-completed");
});

test("sameLineScope ignores only spaceId and sameScope retains exact comparison", () => {
  assert.equal(sameLineScope(spaceRef.scope, secondary(spaceRef.scope).scope), true);
  assert.equal(sameScope(spaceRef.scope, secondary(spaceRef.scope).scope), false);
  for (const key of ["projectId", "accountId", "lineId"] as const)
    assert.equal(sameLineScope(spaceRef.scope, { ...spaceRef.scope, [key]: "foreign" }), false);
  assert.equal(sameLineScope(spaceRef.scope, { ...spaceRef.scope, provider: "other" } as unknown as Scope), false);
});

test("unknown same-line chat is forbidden before provider lookup", async t => {
  const f = fixture(); t.after(f.close);
  const foreign = secondary(f.context.scope);
  assert.throws(() => f.authorize(foreign), /RESOURCE_NOT_FOUND/);
  await assert.rejects(resolveReference(foreign, f.services), /RESOURCE_NOT_FOUND/);
  assert.equal(f.calls.length, 0);
});

for (const key of ["projectId", "accountId", "lineId"] as const)
  test(`owned reference on a foreign ${key} is forbidden`, async t => {
    const f = fixture(); t.after(f.close);
    const ref = secondary({ ...f.context.scope, [key]: "foreign" }); f.persist(ref);
    assert.throws(() => f.authorize(ref), /SCOPE_MISMATCH/);
    await assert.rejects(resolveReference(ref, f.services), /Resource line mismatch/);
  });

for (const foreignPrincipal of [false, true]) test(`created space rejects another task${foreignPrincipal ? " and principal" : " of the same principal"}`, async t => {
  const f = fixture(); t.after(f.close);
  const ref = (await f.create()).references[0]!;
  const other = { ...f.context, taskId: "other-task", contextId: "other-context",
    principalId: foreignPrincipal ? "other-principal" : f.context.principalId };
  f.seed(other);
  assert.throws(() => f.authorize(ref, other), /RESOURCE_NOT_FOUND/);
});

for (const change of ["generation", "cancelled", "revoked", "expired"] as const)
  test(`${change} authority cannot use or route a previously granted DM`, async t => {
    const f = fixture(); t.after(f.close);
    const ref = (await f.create()).references[0]!;
    f.store.transaction(tx => {
      if (change === "generation" || change === "cancelled") {
        const task = tx.get("tasks", f.context.taskId)!;
        tx.put("tasks", { ...task, revision: task.revision + 1,
          ...(change === "generation" ? { generation: 2 } : { cancelledAt: f.clock.now() }) }, task.revision);
      } else {
        const row = tx.get("contexts", f.context.contextId)!;
        tx.put("contexts", { ...row, revision: row.revision + 1, context: { ...row.context,
          ...(change === "revoked" ? { revokedAt: f.clock.now() } : { expiresAt: f.clock.now() }) } }, row.revision);
      }
    });
    assert.throws(() => f.authorize(ref), /STALE_GENERATION|CANCELLED|CONTEXT_REVOKED|CONTEXT_EXPIRED/);
    assert.equal(f.store.transaction(tx => routeConversation(tx, { scope: ref.scope }, f.context, f.clock.now())), undefined);
  });

test("a new generation cannot inherit an old generation's conversation grant", async t => {
  const f = fixture(); t.after(f.close);
  const ref = (await f.create()).references[0]!;
  f.store.transaction(tx => {
    const task = tx.get("tasks", f.context.taskId)!, row = tx.get("contexts", f.context.contextId)!;
    tx.put("tasks", { ...task, revision: 1, generation: 2 }, 0);
    tx.put("contexts", { ...row, revision: 1, context: { ...row.context, generation: 2 } }, 0);
  });
  assert.throws(() => f.authorize(ref, { ...f.context, generation: 2 }), /RESOURCE_NOT_FOUND/);
});

for (const known of ["root", "secondary", "unknown"] as const)
  test(`inbound ${known} conversation ${known === "unknown" ? "stays unresolved" : "routes to the existing task"}`, async t => {
    const f = fixture(); t.after(f.close);
    const ref = known === "root" ? spaceRef : known === "secondary" ? (await f.create()).references[0]! : secondary(f.context.scope);
    const incoming: IncomingEvent = { ...event as Extract<IncomingEvent, { type: "message" }>, scope: ref.scope,
      message: { version: 1, kind: "message", id: "incoming-message", scope: ref.scope } };
    const router = new InboundRouter(f.store, f.clock, {
      route: (e, tx) => routeConversation(tx, e, f.context, f.clock.now()),
    }, []);
    await router.accept(incoming);
    const id = router.reduce([incoming.eventId]);
    const inbox = f.store.transaction(tx => tx.get("inbox", incoming.eventId))!;
    if (known === "unknown") {
      assert.equal(id, undefined); assert.equal(inbox.state, "unresolved");
      assert.equal(f.store.transaction(tx => tx.list("handoffs", ref.scope, 10).length), 0);
    } else {
      assert.ok(id); assert.equal(inbox.state, "reduced");
      const handoff = f.store.transaction(tx => tx.get("handoffs", id))!;
      assert.equal(handoff.taskId, f.context.taskId);
      assert.equal(handoff.generation, f.context.generation);
      assert.deepEqual(handoff.scope, ref.scope);
    }
  });

test("a policy cannot authorize unknown inbound conversations by returning a task", async t => {
  const f = fixture(); t.after(f.close);
  const ref = secondary(f.context.scope);
  const incoming: IncomingEvent = { ...event as Extract<IncomingEvent, { type: "message" }>, scope: ref.scope,
      message: { version: 1, kind: "message", id: "incoming-message", scope: ref.scope } };
  const router = new InboundRouter(f.store, f.clock, { route: () => f.context }, []);
  await router.accept(incoming);
  assert.equal(router.reduce([incoming.eventId]), undefined);
  assert.equal(f.store.transaction(tx => tx.get("inbox", incoming.eventId)?.state), "unresolved");
});

test("secondary child references require the exact owned space and full parent chain", async t => {
  const f = fixture(); t.after(f.close);
  const ref = (await f.create()).references[0]!, scope = ref.scope;
  const message: ResourceRef = { version: 1, kind: "message", id: "msg", scope };
  const refs: ResourceRef[] = [message,
    { version: 1, kind: "attachment", id: "attachment", scope, messageId: message.id },
    { version: 1, kind: "reaction", id: "reaction", scope, messageId: message.id },
    { version: 1, kind: "poll", id: "poll", scope, messageId: message.id },
    { version: 1, kind: "poll-option", id: "option", scope, pollId: "poll" },
    { version: 1, kind: "card", id: "child-card", scope, messageId: message.id },
    { version: 1, kind: "card-session", id: "session", scope, cardId: "child-card" },
  ];
  refs.forEach(r => f.persist(r));
  const session = refs.at(-1)! as Extract<ResourceRef, { kind: "card-session" }>;
  f.store.transaction(tx => tx.put("sessions", { id: session.id, scope, revision: 0, reference: session,
    allowedActionIds: [], expiresAt: 100000, generation: 1 }, null));
  for (const child of refs) { f.authorize(child); await resolveReference(child, f.services); }
  f.store.transaction(tx => {
    const parent = tx.get("references", message.id)!;
    tx.put("references", { ...parent, revision: 1, taskId: "foreign-task" }, 0);
  });
  for (const child of refs) assert.throws(() => f.authorize(child), /RESOURCE_NOT_FOUND/);
});

for (const corrupt of ["owner", "task", "generation", "scope", "reference", "kind"] as const)
  test(`secondary grant with mismatched ${corrupt} cannot authorize an owned child`, t => {
    const f = fixture(); t.after(f.close);
    const ref = secondary(f.context.scope);
    f.store.transaction(tx => tx.put("references", { id: ref.id,
      scope: corrupt === "scope" ? f.context.scope : ref.scope, revision: 0, reference: ref,
      providerId: ref.id, ownedByPrincipalId: f.context.principalId,
      taskId: f.context.taskId, generation: f.context.generation }, null));
    const child: ResourceRef = { version: 1, kind: "message", id: "child", scope: ref.scope }; f.persist(child);
    f.store.transaction(tx => {
      const row = tx.get("references", ref.id)!;
      const changed = { ...row, revision: 1 };
      if (corrupt === "owner") changed.ownedByPrincipalId = "foreign";
      if (corrupt === "task") changed.taskId = "foreign";
      if (corrupt === "generation") changed.generation = 2;
      if (corrupt === "reference") changed.reference = { ...ref, id: "other" };
      if (corrupt === "kind") changed.reference = { ...ref, kind: "message" };
      tx.put("references", changed, 0);
      assert.equal(authorizedResource(tx, f.context, child), false);
    });
    assert.throws(() => f.authorize(child), /RESOURCE_NOT_FOUND/);
  });

test("parent rows from a different conversation cannot authorize a child", async t => {
  const f = fixture(); t.after(f.close);
  const ref = (await f.create()).references[0]!;
  f.persist({ version: 1, kind: "message", id: "root-message", scope: f.context.scope });
  const child: ResourceRef = { version: 1, kind: "attachment", id: "child", scope: ref.scope, messageId: "root-message" };
  f.persist(child);
  assert.throws(() => f.authorize(child), /RESOURCE_NOT_FOUND/);
});

test("native resolution rejects changed parent identity and line bindings ignore only the root conversation", async t => {
  const f = fixture(); t.after(f.close);
  f.binding.scope = { ...f.context.scope, spaceId: "different-root" };
  assert.doesNotThrow(() => checkBinding(f.binding, f.services, "space.get"));
  f.binding.scope = { ...f.binding.scope, lineId: "foreign" };
  assert.throws(() => checkBinding(f.binding, f.services, "space.get"), /binding scope mismatch/);
  const ref: ResourceRef = { version: 1, kind: "poll-option", id: "option", pollId: "poll", scope: f.context.scope };
  f.services.resources.resolve = async r => ({ ...r, pollId: "forged" } as ResourceRef);
  await assert.rejects(resolveReference(ref, f.services), /identity mismatch/);
});

test("shared group creation stays unavailable before any provider dispatch", async t => {
  const f = fixture(); t.after(f.close);
  const result = await f.create(true, true);
  assert.equal(result.error?.code, "UNAVAILABLE");
  assert.ok(!f.calls.some(c => c.method === "space.create"));
});

test("dedicated group creation retains its durable follow-up grant", async t => {
  const f = fixture(); t.after(f.close);
  const result = await f.create(false, true);
  assert.equal(result.status, "executor-completed");
  f.authorize(result.references[0]!);
});

test("a custom create callback cannot return an unpersisted grant", async t => {
  const f = fixture(); t.after(f.close);
  const module = createNativeModule({ ...f.deps, registerCreatedSpace: () => secondary(f.context.scope) });
  const action = parseAction({ version: 1, contextId: f.context.contextId, idempotencyKey: "bad-create",
    operation: "space.create", arguments: { members: ["+15555550111"] } });
  f.grant(action);
  const result = await module.handlers.find(h => h.operation === "space.create")!.execute(action, f.services);
  assert.equal(result.status, "unknown-outcome");
  assert.equal(result.references.length, 0);
});
