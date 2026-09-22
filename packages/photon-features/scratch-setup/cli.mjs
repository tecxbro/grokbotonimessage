import { pathToFileURL } from 'node:url';
import { parseArgs, only, check, inputJson, errorCode, runtimeClient } from './common.mjs';
import { bindWebhook, connect, account } from './setup.mjs';
import { serviceCommand } from './service.mjs';

export async function dispatch(argv, read = inputJson) {
  const { command, root, options } = parseArgs(argv);
  if (command === 'bind-webhook') { only(options, ['--json-stdin']); check(options['--json-stdin'], 'JSON_STDIN_REQUIRED'); return bindWebhook(root, await read()); }
  if (command === 'connect') { only(options, ['--address','--project']); return connect(root, { address: options['--address'], projectId: options['--project'] }); }
  if (command === 'account') { only(options, ['--json-stdin']); check(options['--json-stdin'], 'JSON_STDIN_REQUIRED'); return account(root, await read()); }
  if (['start','stop','restart','service-status','install-user-service'].includes(command)) { only(options, []); return serviceCommand(command, root); }
  const { features, scoped } = await runtimeClient(root);
  if (command === 'capabilities' || command === 'doctor') { only(options, []); return command === 'capabilities' ? features.capabilities() : scoped('diagnostics'); }
  if (command === 'inbox') { only(options, []); return scoped('work.list', { limit: 100 }); }
  if (command === 'read-batch') {
    only(options, ['--batch-id', '--next']); check(Boolean(options['--batch-id']) !== Boolean(options['--next']), 'CHOOSE_BATCH_OR_NEXT');
    let id = options['--batch-id'];
    if (!id) { const result = await scoped('work.list', { limit: 100 }); id = result.work.find(row => row.state === 'pending' || row.state === 'claimed' && row.claim?.leaseUntil <= Date.now())?.id; }
    check(id, 'NO_PENDING_WORK'); return scoped('work.claim', { handoffId: id, leaseMs: 60000 });
  }
  if (command === 'heartbeat') {
    only(options, ['--batch-id','--fence']); const fence = Number(options['--fence']);
    check(options['--batch-id'] && options['--fence'] !== undefined && Number.isSafeInteger(fence) && fence >= 0, 'BATCH_AND_FENCE_REQUIRED');
    return scoped('work.heartbeat', { handoffId: options['--batch-id'], fence, leaseMs: 60000 });
  }
  if (command === 'respond' || command === 'finish') {
    only(options, ['--batch-id', '--fence', '--json-stdin']); const fence = Number(options['--fence']);
    check(options['--batch-id'] && options['--fence'] !== undefined && Number.isSafeInteger(fence) && fence >= 0, 'BATCH_AND_FENCE_REQUIRED');
    if (command === 'respond') check(options['--json-stdin'], 'JSON_STDIN_REQUIRED');
    else check(!options['--json-stdin'], 'FINISH_HAS_NO_PAYLOAD');
    const input = command === 'respond' ? await read() : [], specs = Array.isArray(input) ? input : [input];
    check(specs.length <= 16 && (command === 'finish' || specs.length > 0), 'INVALID_FINAL_OPERATIONS');
    const actions = await Promise.all(specs.map(value => features.prepare(value)));
    return scoped('work.complete', { handoffId: options['--batch-id'], fence, actions });
  }
  if (command === 'execute' || command === 'prepare') {
    only(options, ['--json-stdin']); check(options['--json-stdin'], 'JSON_STDIN_REQUIRED'); return features[command](await read());
  }
  if (command === 'status' || command === 'cancel') {
    only(options, ['--request-id']); check(options['--request-id'], 'REQUEST_ID_REQUIRED');
    return command === 'status' ? features.status(options['--request-id']) : scoped('request.cancel', { requestId: options['--request-id'] });
  }
  if (['media.import','stream.open','stream.append','stream.close','stream.abort'].includes(command)) {
    only(options, ['--json-stdin']); check(options['--json-stdin'], 'JSON_STDIN_REQUIRED'); const data = await read();
    check(data && typeof data === 'object' && !Array.isArray(data) && !['contextId','method'].some(key => key in data), 'INVALID_PRODUCER_INPUT');
    return scoped(command, data);
  }
  throw new Error('UNKNOWN_COMMAND');
}
export async function main(argv = process.argv.slice(2)) {
  try { process.umask(0o077); console.log(JSON.stringify({ ok: true, result: await dispatch(argv) })); return 0; }
  catch (error) { console.error(JSON.stringify({ ok: false, error: errorCode(error) })); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
