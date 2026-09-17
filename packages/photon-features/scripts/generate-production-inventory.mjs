import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { operations } from '../dist/src/contracts/actions.js';
import { assembleDocumentedFeatureSurface } from '../dist/src/integration/assembly.js';
import { nativeOperationMap } from '../dist/src/features/native/sdk.js';
import { upstreamPollOperations, administrativeOperations } from '../dist/src/host/configuration-inventory.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const mappings = {
  'typing.begin': ['runtime/typing/operations.ts', 'HostTypingBinding + TypingLeases -> space.startTyping'],
  'typing.end': ['runtime/typing/operations.ts', 'HostTypingBinding + TypingLeases -> space.stopTyping'],
  'text.send': ['features/text-messages/text.ts', 'space.send(text)'],
  'text.stream': ['features/text-messages/streaming.ts', 'space.send(text(AsyncIterable)); remote sends first thought, edits original GUID; explicit buffered fallback'],
  'markdown.send': ['features/text-messages/text.ts', 'space.send(markdown)'],
  'link.send': ['features/text-messages/text.ts', 'space.send(richlink)'],
  'content.group': ['features/text-messages/composition.ts', 'space.send(group); registered compilers'],
  'content.compose': ['features/text-messages/composition.ts', 'ordered executeChild + space.send per compiled child'],
  'message.get': ['features/text-messages/module.ts', 'resources.message -> space.getMessage'],
  'message.reply': ['features/text-messages/replies.ts', 'message.reply'],
  'message.react': ['features/text-messages/reactions.ts', 'message.react'],
  'reaction.remove': ['features/text-messages/reactions.ts', 'reaction message.unsend'],
  'message.edit': ['features/text-messages/edits.ts', 'message.edit'],
  'message.unsend': ['features/text-messages/edits.ts', 'message.unsend'],
  'message.markRead': ['features/text-messages/mark-read.ts', 'message.read (provider marks conversation read)'],
  'attachment.send': ['features/media/attachments.ts', 'guarded stager -> space.send(attachment)'],
  'attachment.fetch': ['features/media/attachments.ts', 'imessage(app).getAttachment(native GUID, serving phone) -> stream once -> guarded stager'],
  'voice.send': ['features/media/voice.ts', 'guarded stager -> space.send(voice)'],
  'contact.send': ['features/media/contacts.ts', 'space.send(contact)'],
  'poll.create': ['features/polls/operations.ts', 'space.send(poll(question, options))'],
  'poll.get': ['features/polls/operations.ts', 'host-bound PollManagement.get'],
  'poll.vote': ['features/polls/operations.ts', 'host-bound PollManagement.vote'],
  'poll.unvote': ['features/polls/operations.ts', 'host-bound PollManagement.unvote'],
  'poll.addOption': ['features/polls/operations.ts', 'host-bound PollManagement.addOption'],
  'app.send': ['features/cards/operations.ts', 'app(HTTPS URL) -> space.send; static URL card; backend needed only for configured backend features'],
  'app.sendCustomized': ['features/cards/operations.ts', 'customizedMiniApp -> space.send'],
  'app.update': ['features/cards/operations.ts', 'space.send(edit(builder, original SDK Message)); refresh miniAppCardSession; no cold restoration API'],
};
for (const [op, sdk] of Object.entries(nativeOperationMap)) {
  const file = op.includes('Avatar') || op.includes('Background') ? 'appearance' :
    op.includes('Members') || op === 'space.leave' ? 'membership' :
    op === 'account.shareContact' ? 'account-contact' : op === 'effect.send' ? 'effects' :
    op === 'custom.send' ? 'custom-handlers' : op === 'metadata.get' ? 'metadata' : 'spaces';
  mappings[op] = ['features/native/' + file + '.ts', sdk];
}
const installed = new Set(['typing.begin', 'typing.end', 'message.react', 'reaction.remove', 'text.stream', 'message.reply', 'attachment.send', 'attachment.fetch', 'voice.send', 'poll.create', 'app.send', 'app.sendCustomized', 'app.update', 'space.getAvatar', 'space.create']);
const registration = assembleDocumentedFeatureSurface().operationRegistrations;
if (operations.length !== 44 || Object.keys(mappings).sort().join() !== [...operations].sort().join()) throw new Error('PRODUCTION_INVENTORY_DRIFT');
const rows = [];
for (const operation of operations) {
  const [file, sdkCall] = mappings[operation]; await access(root + 'src/' + file);
  const declared = registration.find(row => row.operation === operation);
  const example = JSON.parse(await readFile(root + 'examples/wt-08/' + operation + '.json', 'utf8'));
  const resources = new Set();
  const walk = value => { if (value && typeof value === 'object') { if (value.kind && value.scope) resources.add(value.kind); if (value.stagingId) resources.add('staged-media'); for (const item of Object.values(value)) walk(item); } };
  walk(example.arguments);
  const blockers = []; // No running account or request was evaluated by this source inventory.
  const conditionalBlockers = [];
  if (upstreamPollOperations.includes(operation)) conditionalBlockers.push({ kind: 'host-binding', when: 'approved poll-management binding is absent', detail: 'Requires the actual shared-owner PollManagement dependency. Registration and provider support do not establish host wiring.' });
  if (operation === 'reaction.remove') conditionalBlockers.push({ kind: 'request-resource', when: 'original reaction content handle is unavailable', detail: 'Warm owner SDK cache supplies the real reaction handle. After cold lookup Spectrum retains reactionRecord metadata but rebuilds text content; native reaction removal requires a real reaction content handle. No cast or re-send is permitted.' });
  if (operation === 'app.update') conditionalBlockers.push({ kind: 'request-resource', when: 'original SDK card session or admission revision is unavailable', detail: 'Cold original-card SDK session restoration unavailable. Checkpoints restore callback state only; update after restart blocks without a replacement bubble.' });
  const feature = operation.startsWith('typing.') ? 'typing' : operation.startsWith('poll.') ? 'polls' : operation.startsWith('app.') ? 'cards' : nativeOperationMap[operation] ? 'native' : ['attachment.send', 'attachment.fetch', 'voice.send', 'contact.send'].includes(operation) ? 'media' : 'text-messages';
  const prerequisites = ['provider.availableOperations AND task.permissions include this operation', 'active durable context with exact project/account/line/conversation/task/generation', 'owner ready AND actual shared/dedicated route ready', 'registered handler AND declared implementation; required resource references resolve in this scope'];
  if (administrativeOperations.includes(operation)) prerequisites.push('exact administrativeOperations grant; membership/create require explicit allowedRecipients');
  if (feature === 'cards') prerequisites.push('matching template ID/kind/HTTPS origin; static app.send needs no live extension; customized requires actual Apple identifiers; requested live rendering requires extension evidence; universal layout updates require a bound backend; callbacks require a separate enrolled backend contract');
  if (upstreamPollOperations.includes(operation)) prerequisites.push('actual approved shared-owner poll-management binding; absence blocks management only');
  if (resources.has('staged-media') || resources.has('attachment')) prerequisites.push('media staging binding for this request; text-only composition does not require it');
  if (operation === 'text.stream') prerequisites.push('authorized stream.open/append/close producer; complete thoughts; 30s lifetime/5s stall/8192 queued bytes; no restart replay');
  if (operation === 'custom.send') prerequisites.push('only native-account-contact-v1 codec; actual card resource from template of that ID; account.shareContact permission and intent; allowNativeContent');
  if (operation === 'effect.send') prerequisites.push('allowNativeContent; compilers authorize nested content');
  if (operation === 'space.create') prerequisites.push('shared Free/Pro supports DM creation only; multiple members require dedicated mode; new reference does not itself grant a follow-up context');
  rows.push({ operation, handler: feature === 'typing' ? 'src/runtime/typing/operations.ts#createTypingFeatureModule' : 'src/features/' + feature + '/module.ts', implementationFile: 'src/' + file, sdkCall,
    productionDependencies: ['spectrum-ts@12.8.0', 'zod@4.5.4', 'Node@24.13.0 node:sqlite', 'private shared SQLite and credential files'],
    startup: 'bin/grok-photon-host -> host/process.ts -> createProductionComposition (no injected dependencies) -> one SpectrumOwner, shared resource ports and public feature factory',
    featureConstruction: feature === 'cards' ? 'production.ts constructs trusted templates and, when configured, SignedCardBackend; callback listener is separate' : feature === 'typing' ? 'production.ts constructs HostTypingBinding and TypingLeases' : operation === 'text.stream' ? 'production.ts constructs ProductionTextProducer and ProductionStreamRegistry; authenticated local dispatcher' : 'production.ts constructs ' + feature + ' module with shared owner and execution services',
    prerequisites, requiredResourceReferences: [...resources],
    launcher: 'bin/grok-photon-task --installation-root ROOT --task-id TASK --generation N execute --json-stdin; scoped capabilities/status/cancel use same launcher',
    evidence: { registration: declared.handlerRegistration, unit: 'tests/lanes/' + declared.owner + '/ (executed by photon:test:integration)',
      sdkContract: 'tests/lanes/' + declared.owner + '/sdk-contract.test.ts (public contract; fixtures do not prove provider)',
      productionIntegration: upstreamPollOperations.includes(operation) ? 'injected-management tests; normal startup must supply the actual management binding before advertising readiness' : installed.has(operation) ? 'tests/helpers/completion-installed-runner.mjs: fresh artifact + actual adapter + controlled gRPC/HTTP boundary' : 'production construction inspected; existing lane/production composition tests; no dedicated installed operation journey',
      live: 'PENDING: no live external messages authorized' },
    state: { handlerRegistered: declared.handlerRegistration === 'registered', implementation: declared.implementation, implemented: declared.implementation === 'implemented', configured: 'not-evaluated', runtimeReady: 'not-evaluated', providerAccepted: 'not-observed', deviceObserved: 'not-observed', liveVerified: false },
    verificationNotes: ['Source inventory only; runtime dependencies and action resources must be evaluated by productionCapability.', 'Provider acceptance, device observation and live verification require separate scoped evidence.'],
    blockers, conditionalBlockers });
}
const output = { version: 2, sdkVersion: '12.8.0', inventoryKind: 'source-prerequisites',
  accountModes: { shared: { directMessages: true, groupCreation: false, inboundGroupEvents: false }, dedicated: { directMessages: true, groupCreation: true, inboundGroupEvents: true } },
  capabilityEvidence: { state: 'capability-state/v1', note: 'capability-note/v1', encoding: 'JSON in evidence.reference; sdk-contract tier means local evaluation, not execution proof' },
  operations: rows, releaseGate: 'NOT_EVALUATED: runtime bindings, request resources, approved artifact and target/live evidence require independent verification.' };
const content = JSON.stringify(output, null, 2) + '\n';
const target = new URL('../examples/production-inventory.json', import.meta.url);
if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== content) throw new Error('PRODUCTION_INVENTORY_DRIFT'); }
else await writeFile(target, content);
console.log(JSON.stringify({ operations: rows.length, inventoryKind: output.inventoryKind, runtimeReady: 'not-evaluated' }));
