import test from "node:test";
import assert from "node:assert/strict";
import {
  headersFromEnsureSandbox,
  mergeGatewayHeaders,
  parseGatewayHeaders,
  requestHeaders,
} from "../src/headers.js";
import { ensureSandbox, gatewayCall } from "../src/gateway.js";

async function withMockFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("parses env JSON headers", () => {
  const headers = parseGatewayHeaders('{"X-Anyrun-Network-Token":"abc","empty":""}');
  assert.deepEqual(headers, { "x-anyrun-network-token": "abc" });
});

test("reads EnsureSandBox gatewayHeaders", () => {
  const headers = headersFromEnsureSandbox({
    gatewayHeaders: { "X-Anyrun-Network-Token": "from-ensure" },
  });
  assert.equal(headers["x-anyrun-network-token"], "from-ensure");
});

test("reads EnsureSandBox token field", () => {
  const headers = headersFromEnsureSandbox({ anyrunNetworkToken: "field-token" });
  assert.equal(headers["x-anyrun-network-token"], "field-token");
});

test("env headers override EnsureSandBox", () => {
  const headers = mergeGatewayHeaders(
    { "x-anyrun-network-token": "ensure" },
    { "x-anyrun-network-token": "env" },
  );
  assert.equal(headers["x-anyrun-network-token"], "env");
});

test("request headers keep routing header", () => {
  const headers = requestHeaders({
    gatewayToken: "gw",
    gatewayHeaders: { "x-anyrun-network-token": "route" },
  });
  assert.equal(headers["x-anyrun-network-token"], "route");
  assert.match(headers.authorization, /^Bearer /);
});

test("empty env JSON is a no-op", () => {
  assert.deepEqual(parseGatewayHeaders(""), {});
  assert.deepEqual(parseGatewayHeaders(undefined), {});
});

test("credential-bearing requests reject redirects", async () => {
  const redirects = [];
  await withMockFetch(async (url, options) => {
    redirects.push(options.redirect);
    if (String(url).includes("EnsureSandBox")) {
      return new Response(JSON.stringify({
        gatewayUrl: "https://box-test.us10.cursorvm.com",
        gatewayToken: "test-gateway-token",
      }));
    }
    return new Response(JSON.stringify({ agents: [] }));
  }, async () => {
    const session = await ensureSandbox("test-access-token");
    await gatewayCall(session, "listAgents");
  });
  assert.deepEqual(redirects, ["error", "error"]);
});

test("gateway URL validation happens before credentials are sent", async () => {
  let fetchCalled = false;
  await withMockFetch(async () => {
    fetchCalled = true;
    return new Response("{}");
  }, async () => {
    await assert.rejects(
      gatewayCall({
        gatewayUrl: "https://cursorvm.com.evil.example",
        gatewayToken: "test-gateway-token",
      }, "listAgents"),
      /Rejected gateway URL host/i,
    );
  });
  assert.equal(fetchCalled, false);
});
