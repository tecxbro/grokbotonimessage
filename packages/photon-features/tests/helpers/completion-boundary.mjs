// Test-only external boundary. The installed host, Spectrum factory/provider and
// feature adapters remain real. No production endpoint is reachable from this process.
import { mock } from 'node:test';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(process.env.COMPLETION_PACKAGE + '/package.json');
const specifier = require.resolve('@photon-ai/advanced-imessage/grpc');
const sdk = await import(pathToFileURL(specifier).href);
const log = (type, value) => appendFileSync(process.env.COMPLETION_BOUNDARY_LOG, JSON.stringify({ type, value }) + '\n');
const streams = [];
function emptyStream() {
  let finish; const stopped = new Promise(resolve => { finish = resolve; });
  const stream = { async *[Symbol.asyncIterator]() { await stopped; }, close: async () => finish() };
  streams.push(stream); return stream;
}
const readEvents = () => process.env.COMPLETION_BOUNDARY_INPUT ? readFileSync(process.env.COMPLETION_BOUNDARY_INPUT, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line, (key, value) => ['occurredAt', 'dateCreated'].includes(key) ? new Date(value) : value)) : [];
function eventStream(prefix) {
  if (!process.env.COMPLETION_BOUNDARY_INPUT) return emptyStream();
  let closed = false, seen = 0;
  const stream = { async *[Symbol.asyncIterator]() {
    while (!closed) {
      const events = readEvents();
      while (seen < events.length) { const event = events[seen++]; if (event.type.startsWith(prefix)) yield event; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }, close: async () => { closed = true; } };
  streams.push(stream); return stream;
}
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const pollStates = new Map();
let next = 0;
const messages = new Map();
const record = text => ({ guid: 'message-' + ++next, text, dateCreated: new Date(), isFromMe: true, attachments: [], chats: [] });
const remote = {
  messages: {
    sendText: async (chat, text, options) => { const sent = record(text); log('send', { chat, text, guid: sent.guid, ...(options ? { options } : {}) }); return sent; },
    sendAttachment: async (chat, guid, options) => { const sent = record('media'); log('attachment-send', { chat, guid, options }); return sent; },
    setReaction: async (chat, guid, reaction, selected) => { log('reaction', { chat, guid, reaction, selected }); return record('reaction'); },
    edit: async (chat, guid, text) => { log('edit', { chat, guid, text }); if (text.includes('BOUNDARY_FAIL')) throw new Error('controlled edit disconnect'); },
    sendCustomizedMiniApp: async (chat, content) => {
      const value = record('card'); value.miniAppCardSession = { chatGuid: chat, messageGuid: value.guid, sessionId: 'native-session-' + value.guid, targetMessageGuid: value.guid };
      messages.set(value.guid, value); log('card-send', { chat, content, guid: value.guid, metadata: value.miniAppCardSession }); return value;
    },
    updateCustomizedMiniApp: async (session, content) => {
      const value = record('card-update'); value.miniAppCardSession = { ...session, messageGuid: value.guid, targetMessageGuid: value.guid };
      log('card-update', { session, content, metadata: value.miniAppCardSession }); return value;
    },
    get: async id => { log('get-message', { id }); return readEvents().find(e => e.message?.guid === id)?.message ?? { ...record('Original card'), guid: id, isFromMe: true, ...(id === 'cold-reaction' ? { reaction: { kind: 'like' }, reactionTargetGuid: 'parent-message', reactionSelected: true } : {}), content: { text: 'Original card', attachments: [] } }; },
    subscribeEvents: () => eventStream("message."),
  },
  attachments: {
    upload: async value => { const guid = 'upload-' + ++next; log('attachment-upload', { guid, bytes: value.data.length, fileName: value.fileName }); return { attachment: { guid } }; },
    get: async guid => ({ guid, fileName: 'received.png', mimeType: 'image/png', totalBytes: png.length }),
    downloadStream: guid => ({ async *[Symbol.asyncIterator]() { log('attachment-download', { guid }); yield { type: 'primaryChunk', data: png }; }, close: async () => {} }),
  },
  polls: { subscribeEvents: () => eventStream('poll.'),
    create: async (chatGuid, title, labels) => { const pollMessageGuid = 'native-poll-' + ++next;
      const state = { pollMessageGuid, chatGuid, title, options: labels.map((text, index) => ({ text, optionIdentifier: 'native-option-' + index })), votes: [] };
      pollStates.set(pollMessageGuid, state); log('poll-create', state); return state; },
    get: async guid => { log('poll-read-by-sdk-ingress', { guid }); return pollStates.get(guid); },
  }, groups: { subscribeEvents: emptyStream, getIcon: async chat => { log("avatar", { chat }); return { data: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]), mimeType: "image/png" }; } },
  chats: { create: async addresses => { log('create-chat', { addresses }); return { chat: { guid: 'iMessage;+;created-group', isGroup: true } }; }, setTyping: async (...args) => log('typing', args), markRead: async () => {} },
  events: { catchUp: emptyStream },
  close: async () => { await Promise.all(streams.map(stream => stream.close())); log('closed', {}); },
};
mock.module(specifier, { namedExports: { ...sdk, createGrpcClient: options => { log('constructed', { address: options.address }); return remote; } } });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input).startsWith('https://cards.example.invalid/') && process.env.COMPLETION_CARD_PORT) {
    const url = new URL(String(input)); url.protocol = 'http:'; url.host = '127.0.0.1:' + process.env.COMPLETION_CARD_PORT;
    return nativeFetch(url, options);
  }
  const url = String(input); log('http', { url });
  let data;
  if (url === 'https://spectrum.photon.codes/projects/project-1/imessage/tokens') data = { type: 'dedicated', auth: { 'fixture-instance': 'fixture-token' }, numbers: { 'fixture-instance': '+15555550101' }, expiresIn: 3600 };
  else if (url === 'https://spectrum.photon.codes/projects/project-1/') data = {};
  else if (url === 'https://spectrum.photon.codes/projects/project-1/platforms/') data = {};
  else throw new Error('UNEXPECTED_EXTERNAL_BOUNDARY:' + url);
  return Response.json({ succeed: true, data });
};

// OGS uses the public undici HTTP export. Keep its real HTML parser.
require("undici").fetch = (input, options) => globalThis.fetch(input, options);
