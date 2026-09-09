import { isDeepStrictEqual } from 'node:util';
import { sameScope, type Transaction, type EventReducer } from '../../index.js';
import type { AuthenticatedInteraction } from './interaction-adapter.js';
import type { CardSession } from './session-codec.js';
import { requireCard } from './configuration.js';
import { key } from './state.js';

/** Only invoked after backend authentication and the complete session binding checks. */
export function reduceAuthenticatedInteraction(tx: Transaction, input: AuthenticatedInteraction, data: CardSession, backendId: string, now: number):
  { status: 'unresolved' | 'replayed' } | { status: 'committed'; pointer: { handoffId: string; taskId: string; generation: number } } {
  const eventId = key('callback-event', backendId + ':' + input.eventId);
  const nonceId = key('callback-nonce', backendId + ':' + data.session.id + ':' + input.nonce);
  if (tx.get('inbox', eventId) || tx.get('inbox', nonceId)) return { status: 'replayed' };
  const task = tx.get('tasks', data.taskId), card = tx.get('cards', data.card.id), session = tx.get('sessions', data.session.id);
  const refs = [data.card, data.session, data.message].map(ref => tx.get('references', ref.id));
  const event = { version: 1 as const, type: 'app-interaction' as const, eventId,
    direction: 'inbound' as const, scope: data.card.scope, occurredAt: input.occurredAt, receivedAt: now,
    ordering: { source: backendId }, targets: [data.session, data.card, data.message],
    interactionId: input.eventId, session: data.session, actionId: input.actionId, selection: input.selection };
  if (!task || !card || !session || refs.some(ref => !ref)) {
    tx.put('inbox', { id: eventId, scope: event.scope, revision: 0, event, state: 'unresolved' }, null);
    tx.put('unresolved', { id: eventId, scope: event.scope, revision: 0, eventId, reason: 'unknown-card-or-task', checkpointId: key('session', data.session.id) }, null);
    return { status: 'unresolved' };
  }
  requireCard(sameScope(task.scope, data.card.scope) && task.principalId === data.principalId &&
    task.generation === data.generation && task.cancelledAt === null && session.generation === data.generation && session.expiresAt > now,
    'FORBIDDEN', 'Callback task or session is stale or cancelled.');
  requireCard(isDeepStrictEqual(card.reference, data.card) && isDeepStrictEqual(session.reference, data.session) &&
    session.allowedActionIds.includes(input.actionId) && refs.every((ref, index) => ref && sameScope(ref.scope, data.card.scope) &&
      ref.taskId === data.taskId && ref.generation === data.generation && ref.ownedByPrincipalId === data.principalId &&
      isDeepStrictEqual(ref.reference, [data.card, data.session, data.message][index])),
    'FORBIDDEN', 'Authoritative callback resources differ.');
  // Single-use nonce. To permit another interaction the backend/host must register a new session binding.
  tx.put('inbox', { id: eventId, scope: event.scope, revision: 0, event, state: 'reduced' }, null);
  tx.put('inbox', { id: nonceId, scope: event.scope, revision: 0, event: { ...event, eventId: nonceId }, state: 'reduced' }, null);
  tx.put('sessions', { ...session, revision: session.revision + 1 }, session.revision);
  const handoffId = key('callback-handoff', eventId);
  tx.put('handoffs', { id: handoffId, scope: event.scope, revision: 0, taskId: data.taskId, generation: data.generation,
    principalId: data.principalId, eventIds: [eventId], state: 'pending', claim: null, createdAt: now }, null);
  return { status: 'committed', pointer: { handoffId, taskId: data.taskId, generation: data.generation } };
}
/** F0 app-interaction events have no authenticated participant/nonce. They cannot
 * bypass the app backend by arriving through app.messages or a generic reducer. */
export const unverifiedInteractionReducer: EventReducer = {
  type: 'app-interaction',
  reduce(event, tx) {
    if (event.type !== 'app-interaction') return;
    const id = key('unverified-event', event.eventId);
    if (!tx.get('unresolved', id)) tx.put('unresolved', { id, scope: event.scope, revision: 0,
      eventId: event.eventId, reason: 'app_backend_authentication_required', checkpointId: null }, null);
  },
};
