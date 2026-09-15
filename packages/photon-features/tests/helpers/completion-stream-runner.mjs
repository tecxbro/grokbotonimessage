import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(process.env.COMPLETION_PACKAGE + '/package.json');
const { Spectrum, text } = await import(pathToFileURL(require.resolve('spectrum-ts')).href);
const { imessage } = await import(pathToFileURL(require.resolve('spectrum-ts/providers/imessage')).href);
const { readFile } = await import('node:fs/promises');
const app = await Spectrum({ projectId: 'project-1', projectSecret: 'fixture-secret', providers: [imessage.config()], telemetry: false });
try {
  assert.equal(imessage(app).polls, undefined, 'pinned public provider lacks shared-owner poll management');
  const space = await imessage(app).space.get('any;-;+15555550202', { phone: '+15555550101' });
  let resume; const more = new Promise(resolve => { resume = resolve; });
  const sent = space.send(text((async function* () { yield 'First thought.'; await more; yield ' Second thought.'; })()));
  let events;
  for (let attempt = 0; attempt < 500; attempt++) {
    events = (await readFile(process.env.COMPLETION_BOUNDARY_LOG, 'utf8')).trim().split('\n').map(JSON.parse);
    if (events.some(event => event.type === 'send')) break;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.equal(events.filter(event => event.type === 'send').length, 1, 'first content reaches actual SDK transport before source closes');
  assert.equal(events.filter(event => event.type === 'edit').length, 0);
  resume(); const result = await sent;
  events = (await readFile(process.env.COMPLETION_BOUNDARY_LOG, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(event => event.type === 'constructed').length, 1);
  assert.equal(events.filter(event => event.type === 'send').length, 1);
  assert.deepEqual(events.find(event => event.type === 'edit').value, { chat: 'any;-;+15555550202', guid: result.id, text: 'First thought. Second thought.' });
  assert.equal(result.content.text, 'First thought. Second thought.');
  const restored = await space.getMessage('card-original');
  assert.equal(restored.miniAppCardSession, undefined, 'public getMessage does not restore native card sessions');
  const reaction = await space.getMessage('cold-reaction');
  assert.equal(reaction.reactionRecord.targetGuid, 'parent-message');
  assert.notEqual(reaction.content.type, 'reaction', 'cold public lookup does not restore the reaction content handle');
  console.log('actual pinned SDK: progressive first send, same-message edit, final content PASS');
} finally { await app.stop(); }
