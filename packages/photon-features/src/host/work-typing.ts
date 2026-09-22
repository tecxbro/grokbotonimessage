import type { Scope, TrustedContext } from "../contracts/index.js";
import type { ResourceResolver } from "../contracts/ports.js";
import type { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import { scopeKey } from "../adapters/transport/provider-context.js";
import { authorizedConversation } from "../runtime/core/conversation-routes.js";
import { DurableContexts } from "../runtime/core/authorization.js";
import { scanAll } from "../runtime/core/recovery.js";
import type { TypingLeases, TypingTicket } from "../runtime/typing/leases.js";

/** One controller over the existing typing manager. Only authenticated pickup or
 * heartbeat reports establish activity; the daemon never extends a work claim.
 * This is a messaging lifecycle, not an agent/worker orchestration policy. */
export class WorkTyping {
  private timer?: ReturnType<typeof setInterval>;
  private readonly tickets = new Map<string, { ticket: TypingTicket; refreshedAt: number }>();
  private readonly read = new Set<string>();
  private readonly epoch: number;
  private stopped = false;
  constructor(private readonly store: DurableSQLiteStore, private readonly contexts: DurableContexts,
    private readonly context: TrustedContext, private readonly typing: TypingLeases,
    private readonly resources: ResourceResolver, private readonly now: () => number,
    private readonly report: (code: string) => void = () => {}) { this.epoch = now(); }
  start() { if (this.timer || this.stopped) throw new Error("ACTIVITY_ALREADY_STARTED"); this.tick(); this.timer = setInterval(() => this.tick(), 1000); this.timer.unref(); }
  tick() {
    if (this.stopped) return;
    const active = new Map<string, Scope>(), now = this.now();
    try {
      this.store.transaction(tx => {
        const context = this.contexts.refresh(tx, this.context);
        if (!context.permissions.includes("typing.begin")) return;
        for (const h of scanAll(this.store, "handoffs")) {
          if (h.principalId !== context.principalId || h.taskId !== context.taskId || h.generation !== context.generation ||
              !authorizedConversation(tx, context, h.scope)) continue;
          const working = h.state === "claimed" && h.claim && h.claim.leaseUntil > now &&
            (h.activityUpdatedAt ?? -1) >= this.epoch;
          const responding = h.state === "acknowledged" && h.completion && h.completion.finishedAt >= this.epoch &&
            now - h.completion.finishedAt < 60_000 && h.completion.requestIds.some(id =>
              tx.get("outbox", id)?.result.status === "queued");
          if (!working && !responding) continue;
          active.set(scopeKey(h.scope), h.scope);
          const readKey = `${h.id}:${h.claim?.fence}`;
          if (working && context.permissions.includes("message.markRead") && !this.read.has(readKey)) {
            this.read.add(readKey);
            const event = h.eventIds.map(id => tx.get("inbox", id)?.event).reverse().find(e => e?.type === "message");
            if (event?.type === "message") {
              // Execute after the transaction; a receipt failure must not block an answer.
              void Promise.resolve().then(async () => {
                this.store.transaction(tx => this.contexts.refresh(tx, context));
                const message = await this.resources.message(event.message, context);
                this.store.transaction(tx => this.contexts.refresh(tx, context));
                await message.read();
              }).catch(() => this.report("WORK_MARK_READ_UNVERIFIED"));
            }
          }
        }
      });
    } catch { this.report("WORK_ACTIVITY_UNAVAILABLE"); }
    for (const [key, state] of this.tickets) if (!active.has(key)) { this.typing.end(state.ticket); this.tickets.delete(key); }
    for (const [key, scope] of active) {
      const prior = this.tickets.get(key);
      if (prior && now - prior.refreshedAt < 8000) continue;
      const ticket = this.typing.begin(scope, this.context.generation, 30000, { validate: () => {
        this.store.transaction(tx => this.contexts.refresh(tx, this.context));
        if (this.stopped) throw new Error("WORK_NOT_ACTIVE");
      } });
      if (ticket) { this.tickets.set(key, { ticket, refreshedAt: now }); this.typing.reassert(ticket); }
    }
  }
  stop() { this.stopped = true; clearInterval(this.timer); for (const value of this.tickets.values()) this.typing.end(value.ticket); this.tickets.clear(); this.read.clear(); }
}
