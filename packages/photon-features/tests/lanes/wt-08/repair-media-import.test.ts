import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  resolveContents,
  type Content,
  type ContentInput,
  type Message,
  type Space,
} from "spectrum-ts";
import type { OwnedSdk } from "../../../src/adapters/transport/spectrum-owner.js";
import {
  mediaImportInputSchema,
  parseAction,
  type Action,
  type OperationResult,
} from "../../../src/contracts/index.js";
import { commandRequest } from "../../../src/cli/commands.js";
import { validateResponse } from "../../../src/cli/local-client.js";
import { run } from "../../../src/cli/main.js";
import type { ProductionHostConfiguration } from "../../../src/host/configuration.js";
import { createProductionComposition } from "../../../src/host/production.js";
import { MAX_MEDIA_BYTES } from "../../../src/features/media/safety.js";
import type { StagedMedia } from "../../../src/features/media/staging.js";
import { privateTestRoot } from "../../helpers/private-temp.js";

const generatedStart = "<!-- BEGIN GENERATED OPERATIONS -->";
const generatedEnd = "<!-- END GENERATED OPERATIONS -->";

function output() {
  let value = "";
  return {
    stream: { write: (part: string) => { value += part; return true; } },
    value: () => value,
  };
}

async function fixture(t: TestContext) {
  const root = await privateTestRoot(t, "gpd-");
  const runtimeDirectory = join(root, "runtime");
  const imports = join(runtimeDirectory, "imports");
  await mkdir(runtimeDirectory, { mode: 0o700 });
  await Promise.all(["captures", "staging", "imports"].map(name =>
    mkdir(join(runtimeDirectory, name), { mode: 0o700 })));
  const projectSecretFile = join(runtimeDirectory, "project-secret");
  const credentialFile = join(runtimeDirectory, "local-token");
  await writeFile(projectSecretFile, "project-secret", { mode: 0o600 });
  await writeFile(credentialFile, "a".repeat(64), { mode: 0o600 });
  const now = 50_000;
  const operations = ["attachment.send", "voice.send"] as const;
  const configuration: ProductionHostConfiguration = {
    version: 2,
    activation: "enabled",
    provider: {
      kind: "spectrum-cloud-imessage",
      projectId: "project-1",
      projectSecretFile,
      accountId: "account-1",
      lineId: "line-1",
      phone: "+15555550101",
      conversationId: "conversation-1",
      dedicated: true,
      availableOperations: [...operations],
    },
    local: {
      socketPath: join(runtimeDirectory, "runtime.sock"),
      credentialFile,
      principalId: "principal-1",
      credentialId: "credential-1",
    },
    task: {
      contextId: "context-1",
      taskId: "task-1",
      generation: 1,
      permissions: [...operations],
      issuedAt: 1_000,
      expiresAt: 100_000,
      grokAgentId: "agent-1",
    },
    grok: { executable: "/usr/bin/false", timeoutMs: 1000 },
    authorization: {
      administrativeOperations: [],
      allowedRecipients: [],
      allowNativeContent: false,
    },
    cards: [],
    runtime: {
      statePath: join(runtimeDirectory, "state.sqlite"),
      captureDirectory: join(runtimeDirectory, "captures"),
      stagingDirectory: join(runtimeDirectory, "staging"),
      importDirectory: imports,
    },
  };
  const sent: Array<{ content: Content; bytes?: Buffer }> = [];
  let constructions = 0;
  let release!: () => void;
  const stopped = new Promise<void>(resolve => { release = resolve; });
  const space = {
    id: configuration.provider.conversationId,
    __platform: "imessage",
    phone: configuration.provider.phone,
    type: "dm",
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!;
      const bytes = "read" in content && typeof content.read === "function"
        ? await content.read()
        : undefined;
      sent.push({ content, bytes });
      return {
        id: `sent-${sent.length}`,
        platform: "imessage",
        space,
        content,
        direction: "outbound",
        timestamp: new Date(now),
      } as unknown as Message;
    },
  } as unknown as Space & { phone: string };
  const sdk: OwnedSdk = {
    messages: () => ({ async *[Symbol.asyncIterator]() { await stopped; } }),
    space: async () => space,
    provider: () => ({ getAttachment: async () => undefined }) as never,
    stop: async () => release(),
  };
  const composition = await createProductionComposition(configuration, root, root, {
    now: () => now,
    sdkFactory: async () => { constructions++; return sdk; },
    grokRunner: async () => "accepted",
  });
  const env = {
    GROK_PHOTON_CONTEXT_ID: configuration.task.contextId,
    GROK_PHOTON_SOCKET: configuration.local.socketPath,
    GROK_PHOTON_CREDENTIAL_FILE: credentialFile,
  };
  async function cli(args: string[], input = "", overrides: Partial<typeof env> = {}) {
    const stdout = output();
    const stderr = output();
    const exit = await run(args, { ...env, ...overrides }, Readable.from([input]), stdout.stream, stderr.stream);
    assert.equal(stdout.value().trim().split("\n").length, 1);
    assert.doesNotMatch(stdout.value() + stderr.value(), /project-secret|a{64}/);
    return { exit, stdout: stdout.value(), stderr: stderr.value(), body: JSON.parse(stdout.value()) };
  }
  return { root, runtimeDirectory, imports, configuration, composition, sent, cli,
    constructions: () => constructions };
}

async function waitForResult(
  composition: Awaited<ReturnType<typeof createProductionComposition>>,
  action: Action,
  requestId: string,
): Promise<OperationResult> {
  let response = await composition.runtime.status(action.contextId, requestId, composition.principal) as
    { ok: true; result: OperationResult };
  for (let attempt = 0; response.result.status === "queued" && attempt < 200; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    response = await composition.runtime.status(action.contextId, requestId, composition.principal) as
      { ok: true; result: OperationResult };
  }
  return response.result;
}

test("media.import parser and response use only the shared strict schemas", () => {
  const input = mediaImportInputSchema.parse({
    filename: "result.png",
    metadata: { mimeType: "image/png", name: "result.png" },
  });
  const request = commandRequest(["media.import", "--json-stdin"], "context-1", input);
  assert.deepEqual(request, { version: 1, method: "media.import", contextId: "context-1", ...input });
  const media = {
    stagingId: "00000000-0000-4000-8000-000000000001",
    sha256: "a".repeat(64),
    mimeType: "image/png",
    bytes: 8,
  };
  assert.deepEqual(validateResponse({ version: 1, ok: true, result: media }, request),
    { version: 1, ok: true, result: media });
  assert.throws(() => validateResponse({ version: 1, ok: true, result: { ...media, path: "/tmp/result.png" } }, request));
  for (const bad of [
    { ...input, contextId: "other" },
    { ...input, token: "secret" },
    { ...input, path: "/tmp/result.png" },
    { ...input, url: "https://example.invalid/result.png" },
    { ...input, bytes: 8 },
    { ...input, filename: "../result.png" },
    { ...input, filename: "/tmp/result.png" },
    { ...input, metadata: { ...input.metadata, providerHandle: "native" } },
  ]) assert.throws(() => commandRequest(["media.import", "--json-stdin"], "context-1", bad));
  assert.throws(() => commandRequest(["media.import", "--json"], "context-1", input));
  assert.equal(commandRequest(["doctor", "--json"], "context-1").method, "diagnostics");
});

test("compiled CLI imports image, file and audio through the authenticated production host", async t => {
  const f = await fixture(t);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const pdf = Buffer.from("%PDF-1.7\nfixture\n", "ascii");
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0, "ascii");
  wav.write("WAVE", 8, "ascii");
  await Promise.all([
    writeFile(join(f.imports, "result.png"), png, { mode: 0o600 }),
    writeFile(join(f.imports, "report.pdf"), pdf, { mode: 0o600 }),
    writeFile(join(f.imports, "voice.wav"), wav, { mode: 0o600 }),
  ]);
  const local = await f.composition.startLocalInterface();
  try {
    const imports = await Promise.all([
      f.cli(["media.import", "--json-stdin"], JSON.stringify({ filename: "result.png", metadata: { mimeType: "image/png", name: "result.png" } })),
      f.cli(["media.import", "--json-stdin"], JSON.stringify({ filename: "report.pdf", metadata: { mimeType: "application/pdf", name: "report.pdf" } })),
      f.cli(["media.import", "--json-stdin"], JSON.stringify({ filename: "voice.wav", metadata: { mimeType: "audio/wav", name: "voice.wav", duration: 1.5 } })),
    ]);
    assert.deepEqual(imports.map(item => item.exit), [0, 0, 0]);
    assert.equal(f.sent.length, 0, "import must not send");
    assert.equal(f.constructions(), 0, "import must not instantiate the SDK");
    await writeFile(join(f.imports, "result.png"), Buffer.from("changed source"));
    await f.composition.runtime.start();

    const space = { version: 1 as const, kind: "space" as const,
      id: f.composition.scope.spaceId, scope: f.composition.scope };
    const actions: Action[] = [
      { version: 1, idempotencyKey: "send-image", contextId: "context-1", operation: "attachment.send",
        arguments: { space, media: imports[0]!.body.result as StagedMedia } },
      { version: 1, idempotencyKey: "send-file", contextId: "context-1", operation: "attachment.send",
        arguments: { space, media: imports[1]!.body.result as StagedMedia } },
      { version: 1, idempotencyKey: "send-audio", contextId: "context-1", operation: "voice.send",
        arguments: { space, media: imports[2]!.body.result as StagedMedia } },
    ];
    for (const action of actions) {
      const submitted = await f.cli(["execute", "--json-stdin"], JSON.stringify(action));
      assert.equal(submitted.exit, 0, submitted.stdout + submitted.stderr);
      assert.equal((await waitForResult(f.composition, action, submitted.body.result.requestId)).status,
        "provider-accepted");
    }
    assert.deepEqual(f.sent.map(item => item.content.type), ["attachment", "attachment", "voice"]);
    assert.deepEqual(f.sent.map(item => item.bytes), [png, pdf, wav]);
  } finally {
    await local.close();
    await f.composition.runtime.stop();
  }
});

test("import rejects malformed, escaped, oversized and unauthorized input without sending", async t => {
  const f = await fixture(t);
  const unavailable = await f.cli(["media.import", "--json-stdin"],
    JSON.stringify({ filename: "missing.png", metadata: { mimeType: "image/png" } }));
  assert.equal(unavailable.exit, 3);
  const outside = join(f.runtimeDirectory, "outside.png");
  await writeFile(outside, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { mode: 0o600 });
  await symlink(outside, join(f.imports, "escape.png"));
  await writeFile(join(f.imports, "oversized.bin"), Buffer.alloc(MAX_MEDIA_BYTES + 1), { mode: 0o600 });
  const badCredential = join(f.runtimeDirectory, "bad-token");
  await writeFile(badCredential, "b".repeat(64), { mode: 0o600 });
  await chmod(badCredential, 0o600);
  await f.composition.runtime.start();
  const local = await f.composition.startLocalInterface();
  try {
    for (const input of ["{", "{}{}", "null", JSON.stringify({ filename: "../outside.png", metadata: { mimeType: "image/png" } })]) {
      const result = await f.cli(["media.import", "--json-stdin"], input);
      assert.equal(result.exit, 2);
    }
    assert.equal((await f.cli(["media.import", "--json-stdin"], " ".repeat(262145))).exit, 2);
    const escaped = await f.cli(["media.import", "--json-stdin"],
      JSON.stringify({ filename: "escape.png", metadata: { mimeType: "image/png" } }));
    assert.notEqual(escaped.exit, 0);
    const oversized = await f.cli(["media.import", "--json-stdin"],
      JSON.stringify({ filename: "oversized.bin", metadata: { mimeType: "application/octet-stream" } }));
    assert.notEqual(oversized.exit, 0);
    const unauthorized = await f.cli(["media.import", "--json-stdin"],
      JSON.stringify({ filename: "escape.png", metadata: { mimeType: "image/png" } }),
      { GROK_PHOTON_CONTEXT_ID: "another-context" });
    assert.equal(unauthorized.exit, 4);
    const unauthenticated = await f.cli(["media.import", "--json-stdin"],
      JSON.stringify({ filename: "escape.png", metadata: { mimeType: "image/png" } }),
      { GROK_PHOTON_CREDENTIAL_FILE: badCredential });
    assert.equal(unauthenticated.exit, 4);
    assert.equal(f.sent.length, 0);
  } finally {
    await local.close();
    await f.composition.runtime.stop();
  }
});

test("manual operating decisions cover required behavior and preserve the generated inventory", async () => {
  const skill = await import("node:fs/promises").then(fs =>
    fs.readFile(new URL("../../../../SKILL.md", import.meta.url), "utf8"));
  for (const phrase of [
    "Ordinary answer", "targeted acknowledgment", "requested celebration", "independently choose",
    "Do not automatically turn ordinary questions, lists, or multiple-choice text into polls", "inbound `poll-answer`",
    "A deselection is not a positive answer", "Do not create a separate poll on Grok's server",
    "authorized existing card", "Generated media", "Do not leave typing active while waiting for the user",
    "timer-driven filler", "genuinely unavailable", "unknown outcome", "make Grok a second",
    "stable identity without creating a replacement action",
  ]) assert.match(skill, new RegExp(phrase, "i"));
  const decisions = skill.slice(skill.indexOf("## Choosing the operation"),
    skill.indexOf("## Incremental text supplied by an authorized producer"));
  const prose = decisions.replace(/\s+/g, " ");
  for (const phrase of [
    "Choose the simplest AVAILABLE format that accomplishes the user's goal",
    "materially improve choosing, understanding, or interacting",
    "Respect explicit user requests", "do not require the user to name a Photon operation",
    "Understand intent → choose a candidate format → check capabilities and prerequisites → use the existing schema/example → inspect outcome",
    "authorized, intent-preserving documented fallback", "Never bypass the runtime with newly written Spectrum integration",
    "Grok remains the reasoning agent; Photon remains the messaging tool",
  ]) assert.ok(prose.includes(phrase), phrase);
  const cases = [
    { heading: "Text", operation: "text.send", positive: "What time does dinner start?", negative: "Ask the group: pizza, sushi, or tacos" },
    { heading: "Targeted reply", operation: "message.reply", positive: "Does this time work for you?", negative: "no authorized message reference" },
    { heading: "Reaction", operation: "message.react", positive: "Got it, see you there", negative: "Why did the upload fail?" },
    { heading: "Poll", operation: "poll.create", positive: "Ask the group: pizza, sushi, or tacos", negative: "Explain the differences between those options" },
    { heading: "Image / media", operation: "attachment.send", positive: "Draw a diagram of this flow", negative: "What is 2 + 2?" },
    { heading: "iMessage effect", operation: "effect.send", positive: "Celebrate with confetti", negative: "My payment failed" },
    { heading: "Existing app / card", operation: "app.send", positive: "Share our configured RSVP card", negative: "When is the party?" },
    { heading: "New mini app", operation: null, positive: "Build a small shared packing checklist", negative: "Send our existing RSVP card" },
  ];
  for (const { heading, operation, positive, negative } of cases) {
    const start = decisions.indexOf(`### ${heading}\n`);
    assert.notEqual(start, -1, heading);
    const end = decisions.indexOf("\n### ", start + 1);
    const section = decisions.slice(start, end === -1 ? undefined : end).replace(/\s+/g, " ");
    for (const label of ["Use when:", "Avoid when:", "Example:", "Counterexample:", "Prerequisites and contract:"])
      assert.ok(section.includes(label), `${heading}: ${label}`);
    assert.ok(section.includes(positive), `${heading}: positive scenario`);
    assert.ok(section.includes(negative), `${heading}: negative scenario`);
    if (operation) assert.ok(section.includes(`schemas/${operation}.json`), `${heading}: schema`);
  }
  for (const phrase of [
    "Generation uses an existing authorized Grok tool, when available",
    "Photon does not provide an image generator", "Never invent a generated file",
    "media.import", "attachment.send", "registered templates", "approved origins",
    "app.sendCustomized", "app.update", "original returned card and session references",
    "Creating an app is different from sending an existing one",
    "does not permit editing the Photon runtime", "Do not claim an arbitrary app-building/publishing workflow exists",
    "Report missing tools or configuration", "Static preview, web interaction, and verified live iMessage rendering",
    "cold-restart", "Do not send a duplicate plain copy", "routine errors or sensitive messages",
  ]) assert.ok(prose.includes(phrase), phrase);
  // Linked contracts must exist in the installed package; examples still use
  // the canonical parser. These checks cover documentation, not Grok behavior.
  for (const [, path] of decisions.matchAll(/\]\(((?:schemas|examples)\/[^)]+\.json)\)/g)) {
    const value = JSON.parse(await readFile(new URL(`../../../../${path}`, import.meta.url), "utf8"));
    if (path!.startsWith("examples/")) parseAction(value);
  }
  const effectSchema = JSON.parse(await readFile(new URL("../../../../schemas/effect.send.json", import.meta.url), "utf8"));
  const effectExample = JSON.parse(await readFile(new URL("../../../../examples/wt-08/effect.send.json", import.meta.url), "utf8"));
  for (const effect of ["confetti", "balloons", "fireworks"]) {
    assert.ok(prose.includes(`\`${effect}\``), effect);
    assert.ok(effectSchema.properties.arguments.properties.content.properties.effect.enum.includes(effect), effect);
    parseAction({ ...effectExample, arguments: { ...effectExample.arguments,
      content: { ...effectExample.arguments.content, effect } } });
  }
  const block = skill.slice(skill.indexOf(generatedStart), skill.indexOf(generatedEnd) + generatedEnd.length);
  assert.equal(createHash("sha256").update(block).digest("hex"),
    // Completion adds the verified progressive provider declaration; all 44
    // operations and strict action payloads remain checked by the generator.
    "b33e3ddda3a06e79e729cce5cab2a1f5b4070706049eaeefa4540804b9eca9ec");
});
