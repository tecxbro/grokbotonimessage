import { cardBackendConfigurationSchema, type CardBackendConfiguration } from "./card-backend-configuration.js";
import { createHash, createPublicKey, verify, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { z } from "zod";
import { idSchema, sameScope, type TrustedContext } from "../contracts/index.js";
import { cardLayoutSchema } from "../contracts/content.js";
import type { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import type { CardTemplate, CardLayout } from "../features/cards/configuration.js";
import { authenticatedInteractionSchema, type AppBackendContract, type InteractionResult } from "../features/cards/interaction-adapter.js";
import { loadSession } from "../features/cards/state.js";
import { assertPrivateDirectory } from "./configuration.js";
import { cardBrowserScript } from "./card-browser.js";

const wireSchema = z.strictObject({ version: z.literal(1),
  payload: z.string().min(1).max(14000), signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) });
const pageSchema = z.strictObject({ version: z.literal(1), caption: z.string().max(300), subcaption: z.string().max(300).optional(),
  image: z.string().regex(/^[a-f0-9]{64}\.(?:png|jpg)$/).optional() });
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Application-owned signed-card-v1 protocol. Photon supplies neither this
 * callback protocol nor participant authentication. Each key must be enrolled
 * by the owner against a verified iMessage account outside the forwarded link. */
export class SignedCardBackend implements AppBackendContract {
  readonly source = "grok-photon:signed-card-v1";
  readonly id: string;
  constructor(readonly config: CardBackendConfiguration, private readonly directory: string, private readonly store: DurableSQLiteStore) {
    cardBackendConfigurationSchema.parse(config); this.id = config.id;
    for (const p of config.participants) createPublicKey({ key: p.publicKey, format: "jwk" });
  }
  async authenticate(request: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<unknown> {
    if (request.body.byteLength > 16384 || request.headers["content-type"] !== "application/json") throw new Error("INVALID_CALLBACK");
    const wire = wireSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(request.body)));
    const assertion = authenticatedInteractionSchema.parse(JSON.parse(wire.payload));
    const participant = this.config.participants.find(p => p.id === assertion.participantId);
    if (!participant || !verify(null, Buffer.from("grok-photon:signed-card-v1\n" + wire.payload),
      createPublicKey({ key: participant.publicKey, format: "jwk" }), Buffer.from(wire.signature, "base64url"))) throw new Error("UNAUTHENTICATED_PARTICIPANT");
    return assertion;
  }
  async initialize() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await assertPrivateDirectory(this.directory); }
  async url(layout: CardLayout, context: TrustedContext, media: import("../contracts/services.js").ExecutionServices["media"], previousUrl: string): Promise<string> {
    cardLayoutSchema.parse(layout);
    const page: z.infer<typeof pageSchema> = { version: 1, caption: layout.caption, ...(layout.subcaption ? { subcaption: layout.subcaption } : {}) };
    if (layout.image) {
      const image = await media.resolve(layout.image, context);
      if (image.bytes.length > 5 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(image.mimeType)) throw new Error("CARD_IMAGE_REJECTED");
      page.image = createHash("sha256").update(image.bytes).digest("hex") + (image.mimeType === "image/png" ? ".png" : ".jpg");
      await this.immutable(page.image, image.bytes);
    }
    const bytes = Buffer.from(JSON.stringify(page)), hash = createHash("sha256").update(bytes).digest("hex");
    await this.immutable(hash + ".json", bytes);
    const url = new URL("/card", this.config.origin);
    url.searchParams.set("layout", hash);
    const session = new URL(previousUrl).searchParams.get("session");
    if (session) url.searchParams.set("session", session);
    return url.href;
  }
  private async immutable(name: string, bytes: Uint8Array) {
    try { await writeFile(join(this.directory, name), bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !Buffer.from(bytes).equals(await readFile(join(this.directory, name)))) throw error;
    }
  }
  template(template: CardTemplate): CardTemplate {
    if (!template.origins.includes(this.config.origin)) throw new Error("CARD_BACKEND_ORIGIN_REQUIRED");
    if (template.interactions && (template.interactions.backendContractId !== this.id ||
      template.interactions.participantIds.some(id => !this.config.participants.some(p => p.id === id)))) throw new Error("CARD_PARTICIPANT_ENROLLMENT_REQUIRED");
    return { ...template,
      prepareUrl: async (url, sessionId, context, media, layout) => {
        const base = new URL(url); base.searchParams.set("session", sessionId);
        return this.url(layout ?? { caption: "Open card" }, context, media, base.href);
      },
      updateUrl: (layout, context, media, previous) => this.url(layout, context, media!, previous!),
    };
  }
  async listen(accept: (request: { body: Uint8Array; headers: Readonly<Record<string, string>> }) => Promise<InteractionResult>) {
    await this.initialize();
    const server = createServer(async (req, res) => {
      res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
      try {
        if ((req.url?.length ?? 0) > 4096) throw new Error("URL_TOO_LARGE");
        const url = new URL(req.url ?? "/", this.config.origin);
        if (req.method === "POST" && url.pathname === "/interactions") {
          if (req.headers["content-type"] !== "application/json" || Number(req.headers["content-length"] ?? 0) > 16384) { res.writeHead(413).end(); return; }
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 16384) { res.writeHead(413).end(); return; } chunks.push(Buffer.from(chunk)); }
          const result = await accept({ body: Buffer.concat(chunks), headers: { "content-type": "application/json" } });
          const status = result.status === "blocked" || (result.status === "rejected" && result.reason === "transaction_failed") ? 503 : result.status === "rejected" ? 403 : 200;
          res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(result)); return;
        }
        if (req.method !== "GET") { res.writeHead(405).end(); return; }
        if (/^\/images\/[a-f0-9]{64}\.(png|jpg)$/.test(url.pathname)) {
          const bytes = await readFile(join(this.directory, url.pathname.slice(8)));
          res.writeHead(200, { "Content-Type": url.pathname.endsWith("png") ? "image/png" : "image/jpeg" }).end(bytes); return;
        }
        if (url.pathname !== "/card") { res.writeHead(404).end(); return; }
        const hash = url.searchParams.get("layout");
        if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("INVALID_LAYOUT");
        const page = pageSchema.parse(JSON.parse(await readFile(join(this.directory, hash + ".json"), "utf8")));
        let binding: unknown = null;
        const sessionId = url.searchParams.get("session");
        if (sessionId && idSchema.safeParse(sessionId).success) {
          try {
            const data = this.store.transaction(tx => loadSession(tx, sessionId).data);
            if (data.callback?.backendContractId === this.id && new URL(data.url).searchParams.get("layout") === hash && data.callback.expiresAt > Date.now())
              binding = { session: data.session, scope: data.card.scope, taskId: data.taskId, generation: data.generation,
                nonce: data.callback.nonce, actionIds: data.callback.actionIds, expiresAt: data.callback.expiresAt };
          } catch { /* A send may still be in progress; unknown sessions get no action binding. */ }
        }
        const nonce = randomUUID();
        res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
        const image = page.image ? this.config.origin + "/images/" + page.image : undefined;
        const bootstrap = JSON.stringify(binding).replace(/</g, "\\u003c");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(page.caption)}</title><meta property="og:title" content="${escape(page.caption)}"><meta property="og:description" content="${escape(page.subcaption ?? "")}">${image ? `<meta property="og:image" content="${escape(image)}">` : ""}</head><body><main><h1>${escape(page.caption)}</h1><p>${escape(page.subcaption ?? "")}</p>${image ? `<img alt="Card image" width="320" src="${escape(image)}">` : ""}<div id="actions"></div><p id="status"></p><details><summary>Participant enrollment</summary><label>Enrolled participant ID <input id="participant" maxlength="200"></label><button id="enroll">Show this device's enrollment key</button><pre id="key"></pre></details></main><script nonce="${nonce}">const binding=${bootstrap};${cardBrowserScript}</script></body></html>`);
      } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
    });
    server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 64;
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(this.config.port, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
    let closed = false;
    return { close: async () => { if (closed) return; closed = true; server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
  }
}
