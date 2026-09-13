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
  'poll.get': ['features/polls/operations.ts', 'PollManagement.get: NO PUBLIC SHARED-OWNER SDK IMPLEMENTATION'],
  'poll.vote': ['features/polls/operations.ts', 'PollManagement.vote: NO PUBLIC SHARED-OWNER SDK IMPLEMENTATION'],
  'poll.unvote': ['features/polls/operations.ts', 'PollManagement.unvote: NO PUBLIC SHARED-OWNER SDK IMPLEMENTATION'],
  'poll.addOption': ['features/polls/operations.ts', 'PollManagement.addOption: NO PUBLIC SHARED-OWNER SDK IMPLEMENTATION'],
  'app.send': ['features/cards/operations.ts', 'app(HTTPS URL) -> space.send; configured signed-card-v1 URL/page backend'],
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
  const blockers = [];
  if (upstreamPollOperations.includes(operation)) blockers.push({ kind: 'missing-public-sdk-surface', detail: 'spectrum-ts/providers/imessage public PlatformInstance exposes no polls or client; latest registry version remains 12.8.0. Optional tests inject PollManagement, normal startup cannot construct it.' });
  if (operation === 'reaction.remove') blockers.push({ kind: 'missing-public-sdk-surface', detail: 'Warm owner SDK cache supplies the real reaction handle. After cold lookup Spectrum retains reactionRecord metadata but rebuilds text content; native reaction removal requires a real reaction content handle. No cast or re-send is permitted.' });
  if (operation === 'app.update') blockers.push({ kind: 'missing-public-sdk-surface', detail: 'Cold original-card SDK session restoration unavailable. Checkpoints restore callback state only; update after restart blocks without a replacement bubble.' });
  const feature = operation.startsWith('typing.') ? 'typing' : operation.startsWith('poll.') ? 'polls' : operation.startsWith('app.') ? 'cards' : nativeOperationMap[operation] ? 'native' : ['attachment.send', 'attachment.fetch', 'voice.send', 'contact.send'].includes(operation) ? 'media' : 'text-messages';
  const prerequisites = ['provider.availableOperations AND task.permissions include this operation', 'active durable context with exact project/account/line/conversation/task/generation', 'existing configured Spectrum account/serving phone'];
  if (administrativeOperations.includes(operation)) prerequisites.push('exact administrativeOperations grant; membership/create require explicit allowedRecipients');
  if (feature === 'cards') prerequisites.push('matching template ID/kind/HTTPS origin; customized: actual Apple identifiers; universal updates: cardBackend signed-card-v1; callbacks: separately enrolled participant public keys');
  if (operation === 'text.stream') prerequisites.push('authorized stream.open/append/close producer; complete thoughts; 30s lifetime/5s stall/8192 queued bytes; no restart replay');
  if (operation === 'custom.send') prerequisites.push('only native-account-contact-v1 codec; actual card resource from template of that ID; account.shareContact permission and intent; allowNativeContent');
  if (operation === 'effect.send') prerequisites.push('allowNativeContent; compilers authorize nested content');
  if (operation === 'space.create') prerequisites.push('new chat reference grants no follow-up context; current release has only one configured route');
  rows.push({ operation, handler: feature === 'typing' ? 'src/runtime/typing/operations.ts#createTypingFeatureModule' : 'src/features/' + feature + '/module.ts', implementationFile: 'src/' + file, sdkCall,
    productionDependencies: ['spectrum-ts@12.8.0', 'zod@4.5.4', 'Node@24.13.0 node:sqlite', 'private shared SQLite and credential files'],
    startup: 'bin/grok-photon-host -> host/process.ts -> createProductionComposition (no injected dependencies) -> one SpectrumOwner, shared resource ports and public feature factory',
    featureConstruction: feature === 'cards' ? 'production.ts constructs SignedCardBackend and trusted template functions from JSON; process owns separate callback listener' : feature === 'typing' ? 'production.ts constructs HostTypingBinding and TypingLeases' : operation === 'text.stream' ? 'production.ts constructs ProductionTextProducer and ProductionStreamRegistry; authenticated local dispatcher' : 'production.ts constructs ' + feature + ' module with shared owner and execution services',
    prerequisites, requiredResourceReferences: [...resources],
    launcher: 'bin/grok-photon-task --installation-root ROOT --task-id TASK --generation N execute --json-stdin; scoped capabilities/status/cancel use same launcher',
    evidence: { registration: declared.handlerRegistration, unit: 'tests/lanes/' + declared.owner + '/ (executed by photon:test:integration)',
      sdkContract: 'tests/lanes/' + declared.owner + '/sdk-contract.test.ts (public contract; fixtures do not prove provider)',
      productionIntegration: upstreamPollOperations.includes(operation) ? 'injected-management tests only; normal startup explicitly unavailable' : installed.has(operation) ? 'tests/helpers/completion-installed-runner.mjs: fresh artifact + actual adapter + controlled gRPC/HTTP boundary' : 'production construction inspected; existing lane/production composition tests; no dedicated installed operation journey',
      live: 'PENDING: no live external messages authorized' }, blockers });
}
const output = { version: 1, sdkVersion: '12.8.0', operations: rows, releaseGate: 'BLOCKED: four poll operations, cold card restoration and cold reaction-handle restoration require an upstream public API; approved artifact and target/live evidence remain separate.' };
const content = JSON.stringify(output, null, 2) + '\n';
const target = new URL('../examples/production-inventory.json', import.meta.url);
if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== content) throw new Error('PRODUCTION_INVENTORY_DRIFT'); }
else await writeFile(target, content);
console.log(JSON.stringify({ operations: rows.length, upstreamBlockedOperations: 4, coldCardRestoreBlocked: true }));
