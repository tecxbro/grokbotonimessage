import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { join } from "node:path";
import { createServer } from "node:net";
import { privateTestRoot } from "../helpers/private-temp.js";
import { SignedCardBackend } from "../../src/host/card-backend.js";
import { cardBackendConfigurationSchema } from "../../src/host/card-backend-configuration.js";
import { createInteractionAdapter } from "../../src/features/cards/interaction-adapter.js";
import { key } from "../../src/features/cards/state.js";
import { SESSION_CODEC, encodeSession, type CardSession } from "../../src/features/cards/session-codec.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import { bootstrapOrValidateAuthority } from "../../src/host/authority.js";
import type { TrustedContext } from "../../src/contracts/index.js";

test("shipped signed-card backend verifies participant keys and commits authenticated callbacks before HTTP acknowledgement", async t => {
  const root = await privateTestRoot(t, "card-backend-");
  let store = new DurableSQLiteStore(join(root, "state.sqlite"));
  t.after(() => store.close());
  const now = Date.now();
  const context: TrustedContext = { version: 1, contextId: "ctx", taskId: "task", principalId: "principal", generation: 1,
    scope: { projectId: "project", accountId: "account", lineId: "line", provider: "imessage", spaceId: "space" },
    permissions: ["app.send", "app.update"], issuedAt: now - 1000, expiresAt: now + 100000, revokedAt: null };
  bootstrapOrValidateAuthority(store, context, "chat", now);
  const pair = generateKeyPairSync("ed25519");
  const publicJwk = pair.publicKey.export({ format: "jwk" });
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as import("node:net").AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const config = cardBackendConfigurationSchema.parse({ kind: "signed-card-v1", id: "backend", origin: "https://cards.example.invalid", port,
    participants: [{ id: "alice", imessageAddress: "+15555550101", publicKey: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x }, enrollmentEvidence: "offline fixture enrolled account proof" }] });
  let backend = new SignedCardBackend(config, join(root, "pages"), store); await backend.initialize();
  const scope = context.scope;
  const message = { version: 1 as const, kind: "message" as const, id: "message", scope };
  const card = { version: 1 as const, kind: "card" as const, id: "card", messageId: message.id, scope };
  const session = { version: 1 as const, kind: "card-session" as const, id: "session", cardId: card.id, scope };
  const url = await backend.url({ caption: '<unsafe "title">', subcaption: "Current status" }, context, {} as never, config.origin + "/card?session=session");
  const data: CardSession = { version: 1, sdkVersion: "12.8.0", card, session, message, providerMessageId: "native-message", templateId: "template", kind: "universal",
    taskId: context.taskId, principalId: context.principalId, generation: 1, cardRevision: 0, url, phase: "ready", metadata: null,
    callback: { backendContractId: "backend", nonce: "nonce", participantIds: ["alice"], actionIds: ["confirm"], expiresAt: now + 60000 } };
  store.transaction(tx => {
    for (const reference of [message, card, session]) tx.put("references", { id: reference.id, scope, revision: 0, reference, providerId: "native-message", ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: 1 }, null);
    tx.put("cards", { id: card.id, scope, revision: 0, reference: card, templateId: "template" }, null);
    tx.put("sessions", { id: session.id, scope, revision: 0, reference: session, allowedActionIds: ["confirm"], generation: 1, expiresAt: data.callback!.expiresAt }, null);
    tx.put("checkpoints", { id: key("session", "session"), scope, revision: 0, requestId: "sent", ...{ codecId: SESSION_CODEC.id, codecVersion: 1 }, payloadJson: encodeSession(data), nextChildIndex: 0, claim: { owner: "fixture", leaseUntil: now + 60000, fence: 1, generation: 1 } }, null);
  });
  const assertion = { version: 1, eventId: "event", session, scope, taskId: "task", generation: 1, participantId: "alice", nonce: "nonce", actionId: "confirm", selection: [] as string[], occurredAt: now };
  const request = (value = assertion, signingKey = pair.privateKey) => {
    const payload = JSON.stringify(value); return { body: Buffer.from(JSON.stringify({ version: 1, payload, signature: sign(null, Buffer.from("grok-photon:signed-card-v1\n" + payload), signingKey).toString("base64url") })), headers: { "content-type": "application/json" } };
  };
  let wakes = 0;
  const adapter = () => createInteractionAdapter({ backend, transactions: store, clock: { now: () => now }, wake: { kind: "existing-grok-task-handoff", wake: async () => { wakes++; assert.equal(store.transaction(tx => tx.list("handoffs", scope, 100)).length, 1); return { status: "accepted" as const }; } } as never });
  assert.equal((await adapter().accept(request(assertion, generateKeyPairSync("ed25519").privateKey))).status, "rejected");
  assert.equal((await adapter().accept(request({ ...assertion, participantId: "forwarded-link-holder" }))).status, "rejected");
  assert.equal((await adapter().accept(request({ ...assertion, generation: 2 }))).status, "rejected");
  assert.equal((await adapter().accept(request({ ...assertion, occurredAt: now - 400000 }))).status, "rejected");
  assert.equal((await adapter().accept(request({ ...assertion, actionId: "not-allowed" }))).status, "rejected");
  assert.equal((await adapter().accept(request({ ...assertion, scope: { ...scope, lineId: "different-line" } }))).status, "rejected");
  assert.equal((await adapter().accept({ ...request(), body: Buffer.alloc(16385) })).status, "rejected");
  const expired = createInteractionAdapter({ backend, transactions: store, clock: { now: () => now + 60001 }, wake: {} as never });
  assert.equal((await expired.accept(request())).status, "rejected");
  const missingBackend = createInteractionAdapter({ transactions: store, clock: { now: () => now }, wake: {} as never });
  assert.equal((await missingBackend.accept(request())).status, "blocked");
  const tampered = request(); tampered.body[tampered.body.length - 8] = tampered.body[tampered.body.length - 8]! ^ 1;
  assert.equal((await adapter().accept(tampered)).status, "rejected");
  const failed = createInteractionAdapter({ backend, clock: { now: () => now }, wake: {} as never, transactions: { transaction: () => { throw new Error("disk full"); }, close: () => {} } });
  assert.deepEqual(await failed.accept(request()), { status: "rejected", reason: "transaction_failed" });
  const server = await backend.listen(value => adapter().accept(value)); t.after(() => server.close());
  const localUrl = new URL(url); localUrl.protocol = "http:"; localUrl.host = `127.0.0.1:${port}`;
  const page = await (await fetch(localUrl)).text(); assert.ok(page.includes('&lt;unsafe &quot;title&quot;&gt;')); assert.ok(page.includes('crypto.subtle.sign'));
  const response = await fetch(`http://127.0.0.1:${port}/interactions`, { method: "POST", headers: request().headers, body: request().body });
  assert.equal(response.status, 200); assert.equal((await response.json()).status, "committed"); assert.equal(wakes, 1);
  assert.equal((await adapter().accept(request())).status, "replayed"); assert.equal(wakes, 1);
  assert.equal((await adapter().accept(request({ ...assertion, selection: ["changed"], eventId: "changed-replay" }))).status, "rejected");
  await server.close(); store.close(); store = new DurableSQLiteStore(join(root, "state.sqlite")); backend = new SignedCardBackend(config, join(root, "pages"), store);
  assert.equal((await adapter().accept(request())).status, "replayed");
  assert.equal((await adapter().accept(request({ ...assertion, eventId: "unknown", session: { ...session, id: "unknown" } }))).status, "unresolved");
});
