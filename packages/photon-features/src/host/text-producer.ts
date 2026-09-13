import { createHash } from "node:crypto";
import type { AuthenticatedPrincipal, ResourceRef } from "../contracts/index.js";
import type { LocalRequest } from "../contracts/protocol.js";
import type { DurableContexts } from "../runtime/core/authorization.js";
import { RuntimeFault } from "../runtime/core/errors.js";
import { canonical } from "../runtime/core/idempotency.js";
import type { ProductionStreamRegistry } from "./stream-registry.js";

type Ref = Extract<ResourceRef, { kind: "stream" }>;
type Request = Extract<LocalRequest, { method: "stream.open" | "stream.append" | "stream.close" | "stream.abort" }>;
/** Inert, bounded single-consumer queue. A stopped producer fails its consumer;
 * input is never replayed after restart. One-shot command disconnects are normal;
 * lack of append/close progress is detected by the five-second stall deadline. */
class TextQueue implements AsyncIterable<string> {
  private items: string[] = [];
  private bytes = 0;
  private characters = 0;
  private hashes: string[] = [];
  private ended = false;
  private failure?: Error;
  private wake?: () => void;
  private timer?: NodeJS.Timeout;
  private consumed = false;
  constructor(private readonly finished: () => void, readonly expiresAt: number) { this.touch(); }
  private touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(), Math.max(1, Math.min(5000, this.expiresAt - Date.now())));
    this.timer.unref();
  }
  append(sequence: number, value: string) {
    if (this.failure || Date.now() >= this.expiresAt) throw new RuntimeFault("UNAVAILABLE");
    const hash = createHash("sha256").update(value).digest("hex");
    if (sequence < this.hashes.length) {
      if (this.hashes[sequence] !== hash) throw new RuntimeFault("INVALID_REQUEST");
      return; // exact retransmission never extends the stall deadline
    }
    if (this.ended || sequence !== this.hashes.length) throw new RuntimeFault("INVALID_REQUEST");
    if (this.hashes.length >= 4096 || this.characters + value.length > 16000 || this.bytes + Buffer.byteLength(value) > 8192) {
      this.fail(); throw new RuntimeFault("INVALID_REQUEST");
    }
    this.hashes.push(hash); this.characters += value.length;
    this.items.push(value); this.bytes += Buffer.byteLength(value);
    this.touch(); this.wake?.();
  }
  close(sequence: number) {
    if (this.failure || sequence !== this.hashes.length) throw new RuntimeFault("INVALID_REQUEST");
    this.ended = true; clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(), Math.max(1, this.expiresAt - Date.now()));
    this.timer.unref(); this.wake?.();
  }
  fail() {
    this.failure = new Error("STREAM_PRODUCER_TERMINATED");
    this.items = []; this.bytes = 0; clearTimeout(this.timer); this.wake?.(); this.finished();
  }
  async *[Symbol.asyncIterator]() {
    if (this.consumed) throw new Error("STREAM_ALREADY_CONSUMED");
    this.consumed = true;
    try {
      while (true) {
        if (this.failure) throw this.failure;
        if (Date.now() >= this.expiresAt) throw new Error("STREAM_EXPIRED");
        const value = this.items.shift();
        if (value !== undefined) { this.bytes -= Buffer.byteLength(value); yield value; continue; }
        if (this.ended) return;
        await new Promise<void>(resolve => { this.wake = resolve; });
        this.wake = undefined;
      }
    } finally { this.fail(); }
  }
}

/** Host-constructed producer endpoint; authorization is rechecked on every frame. */
export class ProductionTextProducer {
  private readonly sessions = new Map<string, { ref: Ref; contextId: string; queue: TextQueue }>();
  constructor(private readonly registry: ProductionStreamRegistry, private readonly contexts: DurableContexts) {}
  async dispatch(principal: AuthenticatedPrincipal, request: Request): Promise<unknown> {
    const context = await this.contexts.resolve(principal, request.contextId);
    if (!context.permissions.includes("text.stream")) throw new RuntimeFault("FORBIDDEN");
    if (request.method === "stream.open") {
      if (this.sessions.size >= 32) throw new RuntimeFault("UNAVAILABLE");
      const expiry = Math.min(Date.now() + request.ttlMs, context.expiresAt);
      let id: string | undefined;
      const queue = new TextQueue(() => { if (id) { this.sessions.delete(id); this.registry.forget(id); } }, expiry);
      try {
        const ref = await this.registry.register(principal, context.contextId, queue, expiry);
        id = ref.id; this.sessions.set(id, { ref, contextId: context.contextId, queue });
        return { stream: ref, protocolVersion: 1, stallMs: 5000, queuedBytes: 8192 };
      } catch (error) { queue.fail(); throw error; }
    }
    const session = this.sessions.get(request.stream.id);
    if (!session || session.contextId !== context.contextId || canonical(session.ref) !== canonical(request.stream) ||
      session.ref.generation !== context.generation || session.ref.expiresAt <= Date.now()) throw new RuntimeFault("UNAVAILABLE");
    if (request.method === "stream.append") session.queue.append(request.sequence, request.text);
    else if (request.method === "stream.close") session.queue.close(request.sequence);
    else session.queue.fail();
    return { accepted: true };
  }
  shutdown(): void { for (const session of this.sessions.values()) session.queue.fail(); this.sessions.clear(); }
}
