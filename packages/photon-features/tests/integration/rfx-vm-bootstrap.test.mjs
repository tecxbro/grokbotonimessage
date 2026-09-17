import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDiscovery } from '../../dist/src/cli/setup.js';
import { setupCommandOptions } from '../../dist/src/cli/commands.js';
import { formatCommandResult, formatSetupResult } from '../../dist/src/cli/output.js';
import { main } from '../../dist/src/cli/main.js';
import { runDiscoveryProcess } from '../../dist/src/host/grok-discovery.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const local = join(repo, '.photon-local', 'rfx-bootstrap-tests');
mkdirSync(local, { recursive: true });
const secret = 'private-project-secret-DO-NOT-PRINT';
const fixtureScript = `#!${process.execPath}
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
const args = process.argv.slice(2), fixture = JSON.parse(process.env.RFX_FIXTURE);
const tool = basename(process.argv[1]);
const log = value => appendFileSync(fixture.log, JSON.stringify(value) + '\\n');
log({tool, args, home: process.env.HOME, config: process.env.PHOTON_CONFIG_DIR, cwd: process.cwd()});
const out = value => console.log(JSON.stringify(value));
const fail = () => { console.error(fixture.secret); process.exit(9); };
if (tool === 'npm') {
  if (fixture.installFail) fail();
  const prefix = args[args.indexOf('--prefix') + 1];
  const cache = args[args.indexOf('--cache') + 1];
  mkdirSync(cache, {recursive: true}); writeFileSync(join(cache, 'fixture-cache'), 'npm');
  const target = join(prefix, 'node_modules', '.bin', 'photon');
  mkdirSync(dirname(target), {recursive: true}); copyFileSync(fixture.photonSource, target); chmodSync(target, 0o700);
} else if (tool === 'gbot') {
  if (args[0] === '--version') console.log('gbot 1.2.3');
  else if (args[0] === '--help') console.log(fixture.grokUnsupported ? 'gbot --files bots list' : 'gbot\\n  bots list\\nFlags: --gateway --json' + (fixture.current ? '\\n  bots current' : ''));
  else if (JSON.stringify(args) === JSON.stringify(['--gateway', '--json', 'bots', 'list'])) {
    if (fixture.grokFail) fail();
    out(fixture.bots ?? [{id:'live-agent', name:'Live orchestrator', kind:'bot'}]);
  } else if (args.join(' ') === '--gateway --json bots current' && fixture.current) out({id:fixture.current});
  else fail();
} else {
  if (args[0] === '--version') console.log('photon 2.2.0');
  else if (args[0] === 'login') {
    if (JSON.stringify(args) !== JSON.stringify(['login', '--no-browser'])) fail();
    process.stdout.write('Approve at https://app.photon.codes/device\\n');
    process.stderr.write('Code: FRESH-1234\\n');
    if (fixture.holdLogin) {
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => { if (existsSync(fixture.release)) { clearInterval(timer); clearTimeout(limit); resolve(); } }, 5);
        const limit = setTimeout(() => { clearInterval(timer); reject(new Error('stream not forwarded')); }, 3000);
      });
    }
    if (fixture.loginFail) fail();
    mkdirSync(process.env.PHOTON_CONFIG_DIR, {recursive:true});
    writeFileSync(join(process.env.PHOTON_CONFIG_DIR, 'credentials.json'), JSON.stringify({token:fixture.secret}), {mode:0o600});
    log({event:'login-exit'});
  } else if (args[0] === 'whoami') {
    if (args.length !== 1 || fixture.whoamiFail) fail();
    console.log('Owner <owner@example.test>');
  } else if (args[0] === '--help') console.log('Commands:\\n  projects\\n' + (fixture.noAuth ? '' : '  auth'));
  else if (args.join(' ') === 'auth --help') console.log('Commands:\\n  status');
  else if (args.join(' ') === 'auth status --help') console.log('Options: --json');
  else if (args.join(' ') === 'auth status --json') out([{url:'https://app.photon.codes', loggedIn: !fixture.authFail, user:{id:'owner',email:'owner@example.test',token:fixture.secret}}]);
  else if (args.join(' ') === 'projects ls --json') {
    if (fixture.badProjects) console.log('{"projects": "not an array"}');
    else out(fixture.projects ?? [{id:'project-1',name:'Shared project',projectSecret:fixture.secret}]);
  } else if (args.join(' ') === 'projects --help') console.log(fixture.noSecret ? 'Commands:\\n  regenerate-secret [id]' : fixture.oldSecret ? 'Commands:\\n  show [id]\\n  regenerate-secret [id]' : 'Commands:\\n  secret [id]\\n  show [id]');
  else if (args[0] === 'projects' && args[2] === '--help') console.log('Options: --json');
  else if (args[0] === 'projects' && ['secret','show'].includes(args[1])) {
    if (fixture.secretFail) fail();
    console.error(fixture.secret);
    out({id:fixture.secretWrongId ? 'wrong' : args[2],projectSecret:fixture.secret});
  } else if (args.slice(0,3).join(' ') === 'spectrum users ls') out(fixture.users ?? [{id:'user-1',accountId:'account-1',phoneNumber:'+14155550001',assignedPhoneNumber:'+14155550002',accessToken:fixture.secret}]);
  else if (args.slice(0,3).join(' ') === 'spectrum lines ls') {
    if (fixture.linesFail) fail();
    out(fixture.lines ?? []);
  } else fail();
}
`;

function fixture(t, changes = {}, { photon = true, grok = true } = {}) {
  const root = mkdtempSync(join(local, 'vm-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'), installationRoot = join(root, 'installation'), toolRoot = join(root, 'tools');
  mkdirSync(bin);
  const photonSource = join(root, 'photon-source.mjs');
  writeFileSync(photonSource, fixtureScript, { mode: 0o700 });
  for (const name of ['npm', ...(photon ? ['photon'] : []), ...(grok ? ['gbot'] : [])]) {
    copyFileSync(photonSource, join(bin, name)); chmodSync(join(bin, name), 0o700);
  }
  const data = { log: join(root, 'events.jsonl'), release: join(root, 'release'), photonSource, secret, ...changes };
  const env = { PATH: bin, RFX_FIXTURE: JSON.stringify(data), HOME: join(root, 'outside-home'), PHOTON_TOKEN: 'must-not-override-login', npm_config_prefix: join(root, 'outside-npm') };
  const options = { installationRoot, toolRoot };
  let stderr = '';
  const services = { env, platform: 'linux', stderr: { write(bytes) { stderr += bytes.toString(); return true; } } };
  return { root, bin, data, options, services, events: () => existsSync(data.log) ? readFileSync(data.log, 'utf8').trim().split('\n').map(JSON.parse) : [], stderr: () => stderr };
}
const command = event => event.args?.join(' ');
const runFixture = f => setupDiscovery(f.options, f.services);

// Each test invokes real spawned processes, but no installed Photon/Grok/npm executable.
test('missing CLI installs at the private VM prefix using npm --prefix', async t => {
  const f = fixture(t, {}, { photon: false });
  const result = await runFixture(f);
  assert.equal(result.photon.source, 'installed');
  assert.equal(result.photon.version, '2.2.0');
  assert.equal(result.photon.executable, join(f.options.toolRoot, 'photon-cli/node_modules/.bin/photon'));
  const args = f.events().find(e => e.tool === 'npm').args;
  assert.equal(args[args.indexOf('--prefix') + 1], join(f.options.toolRoot, 'photon-cli'));
  assert.ok(args.includes('@photon-ai/cli@2.2.0'));
  assert.ok(args.includes('--ignore-scripts'));
  assert.ok(!args.includes('-g') && !args.includes('--global'));
  assert.equal(result.status, 'discovered');
});

test('existing PATH CLI is reused without npm', async t => {
  const f = fixture(t); const result = await runFixture(f);
  assert.equal(result.photon.source, 'path');
  assert.equal(result.photon.executable, join(f.bin, 'photon'));
  assert.ok(!f.events().some(e => e.tool === 'npm'));
});

test('configured executable wins over PATH; invalid configured path fails closed', async t => {
  const f = fixture(t); const alternate = join(f.root, 'configured'); mkdirSync(alternate);
  const path = join(alternate, 'photon'); copyFileSync(f.data.photonSource, path); chmodSync(path, 0o700);
  const result = await setupDiscovery({ ...f.options, photonExecutable: path }, f.services);
  assert.equal(result.photon.source, 'configured'); assert.equal(result.photon.executable, path);
  await assert.rejects(setupDiscovery({ ...f.options, photonExecutable: join(f.root, 'missing') }, f.services), { code: 'PHOTON_EXECUTABLE_NOT_FOUND' });
});

test('existing private CLI is reused on subsequent discovery', async t => {
  const f = fixture(t, {}, { photon: false }); await runFixture(f);
  const result = await runFixture(f); assert.equal(result.photon.source, 'private');
  assert.equal(f.events().filter(e => e.tool === 'npm').length, 1);
});

test('real login URL and fresh code reach stderr before login exits', async t => {
  const f = fixture(t, { holdLogin: true }); let streamed = '';
  f.services.stderr = { write(bytes) {
    streamed += bytes.toString();
    if (streamed.includes('https://app.photon.codes/device') && streamed.includes('FRESH-1234')) {
      assert.ok(!f.events().some(e => e.event === 'login-exit'));
      writeFileSync(f.data.release, 'continue');
    }
    return true;
  } };
  const result = await runFixture(f);
  assert.ok(existsSync(f.data.release));
  assert.ok(!JSON.stringify(result).includes('FRESH-1234'));
  for (const path of files(join(f.options.installationRoot, 'runtime'))) assert.ok(!readFileSync(path, 'utf8').includes('FRESH-1234'));
});

test('failed login stops before identity, projects, or Grok discovery', async t => {
  const f = fixture(t, { loginFail: true });
  await assert.rejects(runFixture(f), { code: 'PHOTON_LOGIN_FAILED' });
  assert.deepEqual(f.events().map(command), ['--version', 'login --no-browser']);
});

test('failed whoami and logged-out auth status stop project discovery', async t => {
  for (const changes of [{ whoamiFail: true }, { authFail: true }]) {
    const f = fixture(t, changes);
    await assert.rejects(runFixture(f), { code: 'PHOTON_AUTHENTICATION_FAILED' });
    assert.ok(!f.events().some(e => command(e) === 'projects ls --json'));
  }
});

test('secret is stored 0600 and excluded from normal JSON, diagnostics and logs', async t => {
  const f = fixture(t); const result = await runFixture(f); const output = formatSetupResult(result);
  assert.ok(!output.stdout.includes(secret)); assert.ok(!output.stderr.includes(secret)); assert.ok(!f.stderr().includes(secret));
  assert.ok(!readFileSync(f.data.log, 'utf8').includes(secret));
  assert.equal(statSync(result.secretFile.path).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(result.secretFile.path)).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse(readFileSync(result.secretFile.path)), { version: 1, projectId: 'project-1', projectSecret: secret });
  assert.equal(result.photon.identity.id, 'owner'); assert.equal(result.photon.authStatus, 'verified');
});

test('shared project with zero dedicated lines is valid and uses assigned serving number', async t => {
  const f = fixture(t); const result = await runFixture(f);
  assert.equal(result.status, 'discovered'); assert.equal(result.spectrum.mode, 'shared');
  assert.equal(result.spectrum.dedicatedLineId, null); assert.equal(result.spectrum.servingE164, '+14155550002');
  assert.equal(result.spectrum.user.accountId, 'account-1');
  assert.equal(formatSetupResult(result).exitCode, 0);
});

test('multiple projects return candidates and require exact --project resolution', async t => {
  const projects = [{id:'a', name:'A'}, {id:'b',name:'B'}]; const f = fixture(t, { projects });
  const result = await runFixture(f);
  assert.equal(result.project, null); assert.deepEqual(result.projectCandidates, projects);
  assert.equal(result.nextDecision.field, 'project'); assert.equal(formatSetupResult(result).exitCode, 3);
  assert.ok(!f.events().some(e => command(e)?.startsWith('spectrum ') || command(e)?.startsWith('projects secret')));
  const selected = await setupDiscovery({...f.options, projectId:'b'}, f.services);
  assert.equal(selected.project.id, 'b');
  for (const event of f.events().filter(e => command(e)?.startsWith('spectrum '))) assert.ok(event.args.includes('b'));
  await assert.rejects(setupDiscovery({...f.options, projectId:'not-listed'}, f.services), {code:'PHOTON_PROJECT_NOT_FOUND'});
});

test('stale profile ID cannot override the live Grok roster', async t => {
  const f = fixture(t); mkdirSync(f.services.env.HOME); writeFileSync(join(f.services.env.HOME, 'grok-profile.json'), '{"agentId":"stale-profile-id"}');
  f.services.env.GROK_AGENT_ID = 'stale-profile-id';
  const result = await runFixture(f);
  assert.equal(result.grok.agentId, 'live-agent'); assert.equal(result.grok.evidence, 'live-gateway-roster');
  assert.ok(!JSON.stringify(result).includes('stale-profile-id'));
});

test('Grok ambiguity returns candidates; unsupported help never attempts a live command', async t => {
  const f = fixture(t, { bots: [{id:'one',kind:'bot'}, {id:'two',kind:'bot'}, {id:'group',kind:'group'}] });
  const result = await runFixture(f); assert.equal(result.grok.agentId, null);
  assert.deepEqual(result.grok.candidates, [{id:'one'}, {id:'two'}]);
  const unsupported = fixture(t, { grokUnsupported: true }); const missing = await runFixture(unsupported);
  assert.ok(missing.unresolved.includes('grok.liveRosterUnsupported'));
  assert.ok(!unsupported.events().some(e => e.args?.includes('--gateway')));
});

test('discovery never sends, buys, creates resources, rotates secrets or opens browsers', async t => {
  const f = fixture(t); await runFixture(f);
  for (const event of f.events()) for (const arg of event.args ?? []) {
    assert.ok(!['send', 'create', 'add', 'regenerate-secret', 'rotate-secret', 'open', '--files', 'sudo'].includes(arg));
  }
  assert.ok(f.events().some(e => command(e) === '--gateway --json bots list'));
});

function files(root) { return readdirSync(root, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]); }
test('all fixture child writes stay inside supplied VM/tool/runtime roots', async t => {
  const f = fixture(t, {}, {photon:false});
  mkdirSync(f.services.env.HOME); const outside = join(f.services.env.HOME, 'sentinel'); writeFileSync(outside, 'unchanged');
  const before = statSync(outside).mtimeMs;
  const result = await runFixture(f);
  assert.equal(readFileSync(outside, 'utf8'), 'unchanged'); assert.equal(statSync(outside).mtimeMs, before);
  assert.deepEqual(readdirSync(f.services.env.HOME), ['sentinel']);
  assert.ok(!existsSync(join(f.root, 'outside-npm')));
  for (const event of f.events().filter(e => e.args)) {
    assert.ok(event.home.startsWith(f.options.installationRoot + '/runtime/'));
    assert.ok(event.config.startsWith(f.options.installationRoot + '/runtime/'));
    assert.ok(event.cwd.startsWith(f.options.installationRoot + '/runtime/'));
  }
  assert.ok(realpathSync(result.secretFile.path).startsWith(f.options.installationRoot + '/runtime/'));
});

test('non-Linux setup refuses before any writes or child process, including the actual CLI entry point', async t => {
  const f = fixture(t);
  await assert.rejects(setupDiscovery(f.options, {...f.services,platform:'darwin'}), {code:'SETUP_VM_REQUIRED'});
  assert.ok(!existsSync(f.options.installationRoot)); assert.equal(f.events().length, 0);
  if (process.platform !== 'linux') {
    let stdout = ''; const exit = await main(['setup','--installation-root',f.options.installationRoot,'--json'], f.services.env, undefined,
      {write: value => {stdout += value; return true;}}, {write:()=>true});
    assert.equal(exit, 2); assert.equal(JSON.parse(stdout).error.code, 'SETUP_VM_REQUIRED');
  }
});

test('symlink runtime and tool roots cannot escape supplied roots', async t => {
  for (const which of ['runtime','tools']) {
    const f = fixture(t, {}, {photon:false}); const outside = join(f.root, 'outside'); mkdirSync(outside);
    mkdirSync(f.options.installationRoot);
    symlinkSync(outside, which === 'runtime' ? join(f.options.installationRoot,'runtime') : f.options.toolRoot);
    await assert.rejects(runFixture(f), {code:'SETUP_UNSAFE_ROOT'});
    assert.deepEqual(readdirSync(outside), []);
  }
});

test('old CLI uses read-only project show; unsupported secret lookup remains unresolved', async t => {
  const f = fixture(t, {oldSecret:true}); const result = await runFixture(f); assert.ok(result.secretFile);
  assert.ok(f.events().some(e => command(e) === 'projects show project-1 --json'));
  const unsupported = fixture(t, {noSecret:true}); const incomplete = await runFixture(unsupported);
  assert.equal(incomplete.secretFile, null); assert.ok(incomplete.unresolved.includes('project.secret'));
  assert.ok(!unsupported.events().some(e => e.args?.includes('regenerate-secret')));
});

test('secret retrieval failures and project mismatches stay redacted and fail closed', async t => {
  for (const changes of [{secretFail:true}, {secretWrongId:true}, {badProjects:true}, {linesFail:true}]) {
    const f = fixture(t, changes);
    await assert.rejects(runFixture(f), error => {
      const formatted = formatCommandResult(error);
      assert.ok(!JSON.stringify(formatted).includes(secret)); return true;
    });
    assert.ok(!f.stderr().includes(secret));
  }
});

test('multiple Spectrum users or dedicated lines require choices; never fabricate account IDs', async t => {
  const f = fixture(t, {users:[{id:'u1'}, {id:'u2'}], lines:[{id:'line1',platform:'imessage',phoneNumber:'+14155550003'}, {id:'line2',platform:'imessage',phoneNumber:'+14155550004'}]});
  const result = await runFixture(f);
  assert.equal(result.spectrum.user, null); assert.equal(result.spectrum.dedicatedLineId, null);
  assert.ok(result.unresolved.includes('spectrum.user')); assert.ok(result.unresolved.includes('spectrum.dedicatedLineId'));
  assert.ok(!('accountId' in result.spectrum.userCandidates[0]));
  const single = fixture(t, {lines:[{id:'line1',platform:'imessage',phoneNumber:'+14155550003'}]});
  const dedicated = await runFixture(single);
  assert.equal(dedicated.spectrum.mode, 'dedicated'); assert.equal(dedicated.spectrum.dedicatedLineId, 'line1');
  assert.equal(dedicated.spectrum.servingE164, '+14155550003');
});

test('missing assigned number does not substitute the owner phone; unsupported auth is explicit', async t => {
  const f = fixture(t, {noAuth:true,users:[{id:'u1',phoneNumber:'+14155550001'}]});
  const result = await runFixture(f);
  assert.equal(result.spectrum.servingE164, null); assert.ok(result.unresolved.includes('spectrum.servingE164'));
  assert.equal(result.photon.authStatus, 'unsupported'); assert.ok(result.unresolved.includes('photon.identity'));
});

test('setup parser requires exact arguments and supports configured tool roots', () => {
  const env = {GROK_PHOTON_TOOL_ROOT:'/vm/tools',GROK_PHOTON_PHOTON_EXECUTABLE:'/vm/photon'};
  const parsed = setupCommandOptions(['setup','--installation-root','/vm/install','--project','project','--json'], env);
  assert.equal(parsed.toolRoot, '/vm/tools'); assert.equal(parsed.projectId, 'project');
  for (const args of [['setup'],['setup','--json'],['setup','--installation-root','/vm'],['setup','--installation-root','/vm','--json','--json'],['setup','--installation-root','/vm','--json','--unknown','x']]) {
    assert.throws(() => setupCommandOptions(args, env), {code:'INVALID_ARGUMENTS'});
  }
});

test('bounded spawn times out and cancellation stops the child without exposing diagnostics', async t => {
  const f = fixture(t); const sleepy = join(f.root, 'sleepy');
  writeFileSync(sleepy, '#!' + process.execPath + '\nsetInterval(()=>{},1000);', {mode:0o700});
  await assert.rejects(runDiscoveryProcess(sleepy, [], {cwd:f.root, env:f.services.env, timeoutMs:30}), /SETUP_PROCESS_TIMEOUT/);
  const controller = new AbortController();
  const pending = runDiscoveryProcess(sleepy, [], {cwd:f.root,env:f.services.env,signal:controller.signal});
  controller.abort(); await assert.rejects(pending, /SETUP_CANCELLED/);
});


test('advertised current bot must match the live roster; stale current remains unresolved', async t => {
  for (const current of ['two','stale']) {
    const f = fixture(t, {bots:[{id:'one',kind:'bot'},{id:'two',kind:'bot'}],current});
    const result = await runFixture(f);
    assert.equal(result.grok.agentId, current === 'two' ? 'two' : null);
    assert.ok(f.events().some(e => command(e) === '--gateway --json bots current'));
  }
});

test('failed private installation is a blocker, and occupied npm projects are preserved', async t => {
  const failed = fixture(t, {installFail:true}, {photon:false});
  await assert.rejects(runFixture(failed), {code:'PHOTON_INSTALL_FAILED'});
  assert.ok(!failed.stderr().includes(secret));
  const occupied = fixture(t, {}, {photon:false});
  const prefix = join(occupied.options.toolRoot, 'photon-cli'); mkdirSync(prefix, {recursive:true});
  writeFileSync(join(prefix,'package.json'), '{"name":"unrelated"}');
  await assert.rejects(runFixture(occupied), {code:'PHOTON_PRIVATE_PREFIX_OCCUPIED'});
  assert.equal(readFileSync(join(prefix,'package.json'),'utf8'), '{"name":"unrelated"}');
  assert.ok(!occupied.events().some(e => e.tool === 'npm'));
});
