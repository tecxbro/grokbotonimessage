import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFeatureClient } from '../client-core.mjs';
import { loadCatalog } from '../verify.mjs';
const catalog=await loadCatalog();
// Deliberate contract-boundary double. Canonical Zod behavior is tested separately
// in contracts.test.mjs after the actual package build, never claimed by this file.
function parser(action) {
  if(typeof action.contextId!=='string'||!action.contextId)throw new Error('BAD_CONTEXT');
  if(!action.arguments||action.arguments.reject)throw new Error('SCHEMA_REJECTED');
  if(typeof action.idempotencyKey!=='string'||!action.idempotencyKey)throw new Error('BAD_KEY');
  return JSON.parse(JSON.stringify(action));
}
function setup() {
  const calls=[];const result={state:'queued',requestId:'request:1'};
  const binding={contextId(){calls.push(['context']);return 'authorized:context';},capabilities(){calls.push(['capabilities']);return {availability:'unknown'};},submit(action){calls.push(['submit',action]);return result;},status(id){calls.push(['status',id]);return {state:'unknown'};}};
  return {calls,binding,result,client:bindFeatureClient(binding,parser)};
}
const input=(operation='text.send')=>({operation,arguments:{fixture:true},idempotencyKey:'request:one'});
for(const row of catalog.operations)test(`client preserves ${row.operation} and delegates once`,async()=>{
  const f=setup(),value=input(row.operation);const result=await f.client.execute(value);
  assert.strictEqual(result,f.result);assert.deepEqual(f.calls.filter(c=>c[0]==='submit'),[['submit',{version:1,contextId:'authorized:context',...value}]]);
});
test('prepare validates without submitting',async()=>{const f=setup();const action=await f.client.prepare(input());assert.equal(action.contextId,'authorized:context');assert.equal(f.calls.filter(c=>c[0]==='submit').length,0);});
test('read-only capability call does not read context or submit',()=>{const f=setup();assert.deepEqual(f.client.capabilities(),{availability:'unknown'});assert.deepEqual(f.calls,[['capabilities']]);});
test('status preserves an unknown result',()=>{const f=setup();assert.deepEqual(f.client.status('request:1'),{state:'unknown'});assert.deepEqual(f.calls,[['status','request:1']]);});
for(const key of ['contextId','version','recipient','authorized','token','spaceId','extra'])test(`rejects caller override ${key}`,async()=>{const f=setup();await assert.rejects(f.client.execute({...input(),[key]:'override'}),/FIELDS/);assert.equal(f.calls.length,0);});
for(const key of ['operation','arguments','idempotencyKey'])test(`rejects missing ${key}`,async()=>{const f=setup();const value=input();delete value[key];await assert.rejects(f.client.execute(value),/FIELDS/);assert.equal(f.calls.length,0);});
for(const value of [null,undefined,[],42,'text',new Date()])test(`rejects non-data input ${String(value)}`,async()=>{const f=setup();await assert.rejects(f.client.execute(value),/DATA/);assert.equal(f.calls.length,0);});
test('rejects accessor without evaluating it',async()=>{const f=setup();let read=false;const value=input();Object.defineProperty(value,'operation',{enumerable:true,get(){read=true;return 'text.send';}});await assert.rejects(f.client.execute(value),/DATA/);assert.equal(read,false);});
test('rejects symbol fields',async()=>{const f=setup();const value=input();value[Symbol('hidden')]=1;await assert.rejects(f.client.execute(value),/FIELDS/);});
test('rejects non-enumerable fields',async()=>{const f=setup();const value=input();Object.defineProperty(value,'operation',{value:'text.send',enumerable:false});await assert.rejects(f.client.execute(value),/DATA/);});
test('allows plain null-prototype input without adding authority',async()=>{const f=setup();await f.client.execute(Object.assign(Object.create(null),input()));assert.equal(f.calls.at(-1)[1].contextId,'authorized:context');});
test('schema rejection happens before context lookup or submission',async()=>{const f=setup();await assert.rejects(f.client.execute({...input(),arguments:{reject:true}}),/SCHEMA/);assert.equal(f.calls.length,0);});
test('invalid returned context is rejected before submission',async()=>{const f=setup();f.binding.contextId=()=>null;const c=bindFeatureClient(f.binding,parser);await assert.rejects(c.execute(input()),/CONTEXT/);assert.equal(f.calls.length,0);});
test('submission throw is propagated with no retry or fallback',async()=>{const f=setup();let n=0;const err=new Error('outcome uncertain');f.binding.submit=()=>{n++;throw err;};const c=bindFeatureClient(f.binding,parser);await assert.rejects(c.execute(input()),e=>e===err);assert.equal(n,1);});
test('no-result submission is not upgraded to sent',async()=>{const f=setup();f.binding.submit=()=>undefined;assert.equal(await bindFeatureClient(f.binding,parser).execute(input()),undefined);});
test('repeated caller submissions retain the same key for the existing executor',async()=>{const f=setup();await f.client.execute(input());await f.client.execute(input());const submitted=f.calls.filter(c=>c[0]==='submit');assert.equal(submitted.length,2);assert.deepEqual(submitted[0][1],submitted[1][1]);});
test('captures existing ports instead of switching to replacement functions',async()=>{const f=setup();f.binding.submit=()=>{throw new Error('replacement');};assert.strictEqual(await f.client.execute(input()),f.result);});
test('detaches parsed arguments before asynchronous context lookup',async()=>{const f=setup();let release;f.binding.contextId=()=>new Promise(r=>release=r);const c=bindFeatureClient(f.binding,parser);const value=input();const pending=c.execute(value);value.arguments.fixture='changed';release('context:1');await pending;assert.equal(f.calls.at(-1)[1].arguments.fixture,true);});
for(const name of ['contextId','capabilities','submit','status'])test(`binding requires ${name}`,()=>{const f=setup();delete f.binding[name];assert.throws(()=>bindFeatureClient(f.binding,parser),new RegExp(name));});
test('binding and parser are mandatory',()=>{assert.throws(()=>bindFeatureClient(null,parser),/REQUIRED/);assert.throws(()=>bindFeatureClient({},null),/REQUIRED/);});
for(const id of ['',null,{},'has space','x'.repeat(201),'../bad?x'])test(`rejects invalid status ID ${String(id).slice(0,30)}`,()=>{const f=setup();assert.throws(()=>f.client.status(id),/INVALID/);assert.equal(f.calls.length,0);});
test('public client object is frozen',()=>assert.ok(Object.isFrozen(setup().client)));
