import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { Message } from 'spectrum-ts';
import { parseAction, type Action, type ActionFor, type ExecutionServices, type OperationResult, type ResourceRef } from '../../index.js';
import { CardError, requireCard, templateFor, approvedUrl, type CardOptions } from './configuration.js';
import { cardContent, checkSpace, checkMessage, preparedSend, preparedEdit } from './sdk.js';
import { restoreOriginal, sessionMetadata, type CardSession } from './session-codec.js';
import { CardOrdering, fence } from './update-ordering.js';
import { key, ownedReference, loadSession, saveSession, assertSession } from './state.js';

type CardAction = ActionFor<'app.send'> | ActionFor<'app.sendCustomized'> | ActionFor<'app.update'>;
export class CardOperations {
  private readonly ordering = new CardOrdering();
  private readonly retained = new Map<string, Message>();
  constructor(private readonly options: CardOptions) {}
  async execute(input: Action, s: ExecutionServices): Promise<OperationResult> {
    const requestId = this.options.requestId(input, s);
    try {
      const action = parseAction(input);
      requireCard(action.operation === 'app.send' || action.operation === 'app.sendCustomized' || action.operation === 'app.update',
        'INVALID_REQUEST', 'Operation is not owned by the cards module.');
      if (action.operation === 'app.update') {
        const expectedRevision = this.options.updateRevision?.(action, s);
        requireCard(expectedRevision !== undefined && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
          'UNAVAILABLE', 'An immutable card revision binding from shared request admission is required.', 'card_update_revision_required');
        const initial = s.transactions.transaction(tx => loadSession(tx, action.arguments.session.id));
        return await this.ordering.run(key('card', initial.data.card.id), () => this.update(action, requestId, s, expectedRevision));
      }
      return await this.ordering.run(key('send', requestId), () => this.send(action, requestId, s));
    } catch (error) {
      const known = error instanceof CardError;
      const code = known ? error.code : error instanceof ZodError ? 'INVALID_REQUEST' : 'INTERNAL';
      return { version: 1, requestId, revision: 0, updatedAt: s.clock.now(), references: [], observations: [],
        status: code === 'CANCELLED' ? 'cancelled' : code === 'UNAVAILABLE' || code === 'UNSUPPORTED' ? 'blocked' : 'failed',
        error: { code, message: known ? error.message : 'Card operation failed before dispatch.',
          retry: known && error.blockerId === 'card_update_outcome_unknown' ? 'reconcile-first' : code === 'UNAVAILABLE' ? 'safe-before-dispatch' : 'never',
          blockerId: known ? error.blockerId : undefined } };
    }
  }
  private unknown(requestId: string, s: ExecutionServices, references: ResourceRef[] = []): OperationResult {
    return { version: 1, requestId, revision: 0, status: 'unknown-outcome', updatedAt: s.clock.now(), references,
      error: { code: 'UNKNOWN_OUTCOME', message: 'Card dispatch or subsequent durable commit has an uncertain outcome; reconcile before retry.', retry: 'reconcile-first' },
      observations: [{ kind: 'unknown', source: 'sdk-return', at: s.clock.now() }] };
  }
  private async send(action: Exclude<CardAction, ActionFor<'app.update'>>, requestId: string, s: ExecutionServices): Promise<OperationResult> {
    const { arguments: args } = action, template = templateFor(this.options, args.templateId);
    requireCard(template.kind === (action.operation === 'app.send' ? 'universal' : 'customized'), 'INVALID_REQUEST', 'Operation does not match the registered template kind.');
    s.transactions.transaction(tx => { fence(tx, requestId, action, s); ownedReference(tx, args.space, s); });
    const space = await s.resources.space(args.space, s.context);
    checkSpace(space, s, this.options);
    const mapping = s.transactions.transaction(tx => tx.get('references', args.space.id));
    requireCard(mapping?.providerId === space.id, 'SCOPE_MISMATCH', 'Space mapping differs from the SDK conversation.');
    const content = await preparedSend(await cardContent(template, args.url, 'layout' in args ? args.layout : undefined, s));
    const markerId = key('send', requestId);
    const admitted = s.transactions.transaction(tx => {
      fence(tx, requestId, action, s);
      if (tx.get('checkpoints', markerId)) return false;
      tx.put('checkpoints', { id: markerId, scope: s.context.scope, revision: 0, requestId,
        codecId: 'wt06.card-dispatch', codecVersion: 1,
        payloadJson: JSON.stringify({ version: 1, requestId, phase: 'dispatching' }), nextChildIndex: 0, claim: s.claim }, null);
      return true;
    });
    if (!admitted) return this.unknown(requestId, s);
    try {
      const message = await space.send(content);
      // Undefined on send can mean unsupported/warn-and-skip, never a successful card.
      if (!message) return this.unknown(requestId, s);
      checkMessage(message, s, this.options);
      const metadata = sessionMetadata(message);
      requireCard(!metadata || metadata.chatGuid === space.id, 'SCOPE_MISMATCH', 'Provider session points at a different conversation.');
      const scope = s.context.scope;
      const messageRef: Extract<ResourceRef, { kind: 'message' }> = { version: 1, kind: 'message', id: key('message', requestId), scope };
      const card: CardSession['card'] = { version: 1, kind: 'card', id: key('card', requestId), messageId: messageRef.id, scope };
      const session: CardSession['session'] = { version: 1, kind: 'card-session', id: key('handle', requestId), cardId: card.id, scope };
      const interaction = template.interactions;
      const data: CardSession = { version: 1, sdkVersion: '12.8.0', card, session, message: messageRef, providerMessageId: message.id,
        templateId: template.id, kind: template.kind, taskId: s.context.taskId, principalId: s.context.principalId,
        generation: s.context.generation, cardRevision: 0, url: args.url, phase: 'ready', metadata,
        callback: interaction ? { backendContractId: interaction.backendContractId, nonce: randomUUID(), participantIds: [...interaction.participantIds],
          actionIds: [...interaction.actionIds], expiresAt: s.clock.now() + interaction.ttlMs } : null };
      s.transactions.transaction(tx => {
        fence(tx, requestId, action, s);
        for (const reference of [messageRef, card, session]) tx.put('references', {
          id: reference.id, scope, revision: 0, reference, providerId: message.id, ownedByPrincipalId: s.context.principalId,
          taskId: s.context.taskId, generation: s.context.generation }, null);
        tx.put('cards', { id: card.id, scope, revision: 0, reference: card, templateId: template.id }, null);
        tx.put('sessions', { id: session.id, scope, revision: 0, reference: session,
          allowedActionIds: data.callback?.actionIds ?? [], expiresAt: data.callback?.expiresAt ?? Number.MAX_SAFE_INTEGER, generation: data.generation }, null);
        saveSession(tx, data, requestId, s);
        const marker = tx.get('checkpoints', markerId)!;
        tx.put('checkpoints', { ...marker, revision: marker.revision + 1, payloadJson: JSON.stringify({ version: 1, requestId, phase: 'returned' }) }, marker.revision);
      });
      // Bounded cache contains only live handles; evicted entries use the public resolver.
      if (this.retained.size >= 1000) this.retained.delete(this.retained.keys().next().value!);
      this.retained.set(session.id, message);
      return { version: 1, requestId, revision: 0, status: 'provider-accepted', updatedAt: s.clock.now(), references: [messageRef, card, session],
        observations: [{ kind: 'accepted', source: 'sdk-return', at: s.clock.now() }] };
    } catch { return this.unknown(requestId, s); }
  }
  private async update(action: ActionFor<'app.update'>, requestId: string, s: ExecutionServices, expectedRevision: number): Promise<OperationResult> {
    const { data } = s.transactions.transaction(tx => {
      fence(tx, requestId, action, s);
      const loaded = loadSession(tx, action.arguments.session.id);
      requireCard(isDeepStrictEqual(loaded.data.card, action.arguments.card) &&
        isDeepStrictEqual(loaded.data.session, action.arguments.session), 'SCOPE_MISMATCH', 'Requested card/session differs from the original binding.');
      assertSession(tx, loaded.data, s);
      requireCard(loaded.data.cardRevision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'A newer card revision already completed.');
      return loaded;
    });
    const template = templateFor(this.options, data.templateId);
    requireCard(template.kind === data.kind, 'UNAVAILABLE', 'Registered card kind changed.', 'card_template_changed');
    let url = data.url;
    if (data.kind === 'universal') {
      requireCard(template.updateUrl, 'UNAVAILABLE', 'Universal layout updates require a configured backend URL mapping; F0 has no update URL.', 'universal_update_url_required');
      url = approvedUrl(template, await template.updateUrl(action.arguments.layout, s.context));
    }
    const message = await restoreOriginal(data, s, this.options, this.retained.get(data.session.id));
    const builder = await cardContent(template, url, data.kind === 'customized' ? action.arguments.layout : undefined, s);
    const content = await preparedEdit(builder, message);
    s.transactions.transaction(tx => {
      const current = loadSession(tx, data.session.id).data;
      assertSession(tx, current, s);
      requireCard(current.cardRevision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'Card changed while preparing an update.');
      fence(tx, requestId, action, s);
      saveSession(tx, { ...current, phase: 'dispatching' }, requestId, s);
    });
    const refs = [data.message, data.card, data.session];
    try {
      // The pinned API returns void. Keep the original target even if a fixture/provider returns something else.
      await message.space.send(content);
      const metadata = sessionMetadata(message);
      requireCard(metadata && metadata.chatGuid === message.space.id && metadata.sessionId === data.metadata?.sessionId,
        'UNAVAILABLE', 'Card session refresh is unavailable or mismatched.', 'requires_original_session');
      s.transactions.transaction(tx => {
        fence(tx, requestId, action, s);
        const current = loadSession(tx, data.session.id);
        requireCard(current.checkpoint.requestId === requestId && current.data.phase === 'dispatching' &&
          current.data.cardRevision === expectedRevision, 'STALE_FENCE', 'Card dispatch ownership changed.');
        const card = tx.get('cards', data.card.id)!;
        requireCard(card.revision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'Card revision changed during dispatch.');
        tx.put('cards', { ...card, revision: card.revision + 1 }, card.revision);
        saveSession(tx, { ...data, phase: 'ready', url, cardRevision: expectedRevision + 1, metadata }, requestId, s);
      });
      return { version: 1, requestId, revision: 0, status: 'executor-completed', updatedAt: s.clock.now(), references: refs,
        value: { type: 'void' }, observations: [] };
    } catch {
      // If this write also fails, the durable dispatching marker still prevents an unsafe retry.
      try { s.transactions.transaction(tx => {
        const current = loadSession(tx, data.session.id);
        if (current.checkpoint.requestId === requestId && current.data.phase === 'dispatching')
          saveSession(tx, { ...current.data, phase: 'unknown' }, requestId, s);
      }); } catch { /* Keep the earlier durable dispatching marker. */ }
      return this.unknown(requestId, s, refs);
    }
  }
}
