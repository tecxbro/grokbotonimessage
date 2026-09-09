import { isDeepStrictEqual } from 'node:util';
import { assertClaim, sameScope, type Action, type ExecutionServices, type Transaction } from '../../index.js';
import { requireCard } from './configuration.js';
export class CardOrdering {
  private readonly tails = new Map<string, Promise<void>>();
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await work(); }
    finally { release(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
}
/** Synchronous transaction immediately before dispatch; durable card phase also
 * excludes dispatch from a second process/module, even after lease expiry. */
export function fence(tx: Transaction, requestId: string, action: Action, s: ExecutionServices): void {
  const c = s.context, now = s.clock.now();
  requireCard(!s.signal.aborted, 'CANCELLED', 'Card operation was cancelled.');
  requireCard(c.contextId === action.contextId && c.revokedAt === null && c.expiresAt > now && c.permissions.includes(action.operation),
    'FORBIDDEN', 'Card execution context is not authorized.');
  const task = tx.get('tasks', c.taskId), outbox = tx.get('outbox', requestId);
  requireCard(task && outbox?.claim, 'STALE_FENCE', 'Shared executor task and claim are required.');
  requireCard(sameScope(task.scope, c.scope) && sameScope(outbox.scope, c.scope) && task.principalId === c.principalId &&
    outbox.principalId === c.principalId && outbox.taskId === c.taskId && outbox.generation === c.generation &&
    isDeepStrictEqual(outbox.action, action), 'FORBIDDEN', 'Shared executor record does not match the card action.');
  requireCard(task.generation === c.generation && s.claim.generation === c.generation, 'STALE_GENERATION', 'Card task generation is stale.');
  requireCard(task.cancelledAt === null && outbox.cancellationRequestedAt === null, 'CANCELLED', 'Card task or request was cancelled.');
  requireCard(outbox.claim.leaseUntil > now, 'STALE_FENCE', 'Shared executor lease expired.');
  try { assertClaim(s.claim, { ...outbox.claim, generation: task.generation, cancelled: false }, now); }
  catch { requireCard(false, 'STALE_FENCE', 'Card execution fence is stale.'); }
}
