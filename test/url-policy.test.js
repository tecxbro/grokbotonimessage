import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedCredentialUrl,
  redactSecrets,
} from "../src/url-policy.js";

function withEnv(values, fn) {
  const prev = {};
  for (const key of Object.keys(values)) {
    prev[key] = process.env[key];
    const v = values[key];
    if (v == null) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("allows https Cursor gateway hosts", () => {
  withEnv({ GROK_BOT_ALLOW_LOCAL_GATEWAY: null, GROK_BOT_ALLOW_ANY_GATEWAY: null }, () => {
    assert.equal(
      assertAllowedCredentialUrl("https://api2.cursor.sh"),
      "https://api2.cursor.sh",
    );
    assert.equal(
      assertAllowedCredentialUrl("https://box-abc.cursor.sh/"),
      "https://box-abc.cursor.sh",
    );
    assert.equal(
      assertAllowedCredentialUrl("https://agent.cursor.com"),
      "https://agent.cursor.com",
    );
    assert.equal(
      assertAllowedCredentialUrl("https://box-abc.us10.cursorvm.com"),
      "https://box-abc.us10.cursorvm.com",
    );
  });
});

test("rejects http and non-cursor hosts by default", () => {
  withEnv({ GROK_BOT_ALLOW_LOCAL_GATEWAY: null, GROK_BOT_ALLOW_ANY_GATEWAY: null }, () => {
    assert.throws(() => assertAllowedCredentialUrl("http://api2.cursor.sh"), /only https/i);
    assert.throws(() => assertAllowedCredentialUrl("https://evil.example"), /Rejected gateway URL host/i);
    assert.throws(() => assertAllowedCredentialUrl("https://cursorvm.com.evil.example"), /Rejected gateway URL host/i);
    assert.throws(() => assertAllowedCredentialUrl("https://127.0.0.1:1340"), /GROK_BOT_ALLOW_LOCAL_GATEWAY/i);
  });
});

test("allows local gateways when opted in", () => {
  withEnv({ GROK_BOT_ALLOW_LOCAL_GATEWAY: "1", GROK_BOT_ALLOW_ANY_GATEWAY: null }, () => {
    assert.equal(
      assertAllowedCredentialUrl("http://127.0.0.1:1340"),
      "http://127.0.0.1:1340",
    );
    assert.equal(
      assertAllowedCredentialUrl("http://localhost:1340/"),
      "http://localhost:1340",
    );
  });
});

test("ALLOW_ANY_GATEWAY bypasses host checks", () => {
  withEnv({ GROK_BOT_ALLOW_ANY_GATEWAY: "true", GROK_BOT_ALLOW_LOCAL_GATEWAY: null }, () => {
    assert.equal(
      assertAllowedCredentialUrl("https://evil.example/path"),
      "https://evil.example/path",
    );
  });
});

test("redacts bearer and token-like fields", () => {
  const secrets = [
    "gateway-secret",
    "bearer-secret~suffix",
    "authorization-secret",
    "access-secret",
    "refresh-secret",
    "routing-secret",
  ];
  const out = redactSecrets(
    `gatewayToken=${secrets[0]} request=Bearer ${secrets[1]} authorization=Bearer ${secrets[2]} access_token=${secrets[3]} refreshToken=${secrets[4]} x-anyrun-network-token=${secrets[5]}`,
  );
  assert.match(out, /Bearer <redacted>/);
  assert.match(out, /gatewayToken=<redacted>/);
  for (const secret of secrets) assert.doesNotMatch(out, new RegExp(secret));
});
