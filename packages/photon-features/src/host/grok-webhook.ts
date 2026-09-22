import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { ExistingGrokTaskHandoff } from "../adapters/legacy/index.js";
import { readPrivateFile } from "./configuration.js";

/** This is a local binding format, not an invented Grok registration API.
 * Values come from the real native routine created by the receiving bot. */
export const grokWebhookBindingSchema = z.strictObject({
  version: z.literal(1),
  url: z.string().url().max(4096).refine(value => {
    const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      (!url.port || url.port === "443") && host.includes(".") && !isIP(host) &&
      !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
  }, "public HTTPS routine URL required"),
  key: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/),
  routineId: z.string().min(1).max(512).optional(),
});
export type GrokWebhookBinding = z.infer<typeof grokWebhookBindingSchema>;
export async function readGrokWebhookBinding(filename: string): Promise<GrokWebhookBinding> {
  try { return grokWebhookBindingSchema.parse(JSON.parse(await readPrivateFile(filename, 16 * 1024))); }
  catch { throw new Error("INVALID_GROK_WEBHOOK_BINDING"); }
}
/** Opaque local routing identity, not a bot ID or an authentication credential. */
export function webhookBindingId(binding: GrokWebhookBinding): string {
  return "webhook:" + createHash("sha256").update(binding.url).digest("hex");
}

export class GrokWebhookTaskHandoff implements ExistingGrokTaskHandoff {
  private blockedUntil = 0;
  private readonly pending = new Map<string, Promise<"accepted" | "failed" | "unknown">>();
  constructor(
    private readonly binding: GrokWebhookBinding,
    private readonly owner: { taskId: string; generation: number; timeoutMs: number },
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    grokWebhookBindingSchema.parse(binding);
    if (!owner.taskId || !Number.isSafeInteger(owner.generation) || owner.generation < 0 ||
        !Number.isInteger(owner.timeoutMs) || owner.timeoutMs < 1000 || owner.timeoutMs > 60000)
      throw new Error("INVALID_GROK_WEBHOOK_BINDING");
  }
  static async load(filename: string, owner: { taskId: string; generation: number; timeoutMs: number }, fetcher: typeof fetch = fetch, now: () => number = Date.now) {
    return new GrokWebhookTaskHandoff(await readGrokWebhookBinding(filename), owner, fetcher, now);
  }
  async notifyExistingTask(pointer: { handoffId: string; taskId: string; generation: number }) {
    if (pointer.taskId !== this.owner.taskId || pointer.generation !== this.owner.generation ||
        !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(pointer.handoffId)) return "failed" as const;
    if (this.now() < this.blockedUntil) throw new Error("GROK_WAKE_TARGET_UNAVAILABLE");
    const previous = this.pending.get(pointer.handoffId);
    if (previous) return previous;
    const result = this.post(pointer.handoffId).finally(() => this.pending.delete(pointer.handoffId));
    this.pending.set(pointer.handoffId, result);
    return result;
  }
  private async post(batchId: string): Promise<"accepted" | "failed" | "unknown"> {
    let response: Response;
    try {
      response = await this.fetcher(this.binding.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(this.owner.timeoutMs),
        headers: { "content-type": "application/json", authorization: `Bearer ${this.binding.key}` },
        body: JSON.stringify({ batchId }),
      });
    } catch { return "unknown"; } // The endpoint may have accepted before the connection failed.
    // Never consume/log a body or a redirect containing a routine URL or secret.
    void response.body?.cancel().catch(() => undefined);
    if ([401, 403, 404, 410].includes(response.status)) {
      this.blockedUntil = this.now() + 15 * 60_000;
      throw new Error("GROK_WAKE_TARGET_UNAVAILABLE");
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      this.blockedUntil = this.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 15 * 60_000) : 60_000);
      return "failed";
    }
    return response.ok ? "accepted" : "failed";
  }
}
