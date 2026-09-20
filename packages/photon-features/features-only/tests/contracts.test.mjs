// Run only after the actual locked package build. Missing dependencies are a failure,
// not a skip or permission to replace the canonical contracts with test doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPhotonFeatureClient} from '../client.mjs';
import {loadCatalog,profileRoot,verifyProfile} from '../verify.mjs';
import {operations,parseActionRequest} from '../../dist/src/contracts/actions.js';
import {assembleDocumentedFeatureSurface} from '../../dist/src/integration/assembly.js';
const catalog=await loadCatalog();
for(const row of catalog.operations){
  test(`canonical example + bound client: ${row.operation}`,async()=>{
    const example=JSON.parse(await readFile(resolve(profileRoot,row.example),'utf8'));
    const canonical=parseActionRequest(example);let submitted=0;
    const client=await createPhotonFeatureClient({contextId:()=>canonical.contextId,capabilities:()=>({available:'unknown'}),submit(action){submitted++;assert.deepEqual(action,canonical);return {state:'queued'};},status:()=>({state:'unknown'})});
    const input={operation:canonical.operation,arguments:canonical.arguments,idempotencyKey:canonical.idempotencyKey};
    assert.deepEqual(await client.prepare(input),canonical);assert.equal(submitted,0);
    assert.deepEqual(await client.execute(input),{state:'queued'});assert.equal(submitted,1);
  });
  test(`canonical validator rejects additional argument for ${row.operation}`,async()=>{
    const example=JSON.parse(await readFile(resolve(profileRoot,row.example),'utf8'));
    assert.throws(()=>parseActionRequest({...example,arguments:{...example.arguments,unrecognized:true}}));
  });
}
test('full links/examples/import verification',async()=>{const r=await verifyProfile({full:true});assert.equal(r.validatedExamples,operations.length);assert.equal(r.canonicalParser,'checked');});
test('existing structural assembly still accounts for all operations, not live execution',()=>{const assembled=assembleDocumentedFeatureSurface();assert.equal(assembled.publicRegistry.handlers.size,operations.length);assert.ok(assembled.operationRegistrations.every(x=>x.handlerRegistration==='registered'));});
test('canonical parser rejects cross-poll and cross-card references',async()=>{for(const [op,key,field]of[['poll.vote','option','pollId'],['app.update','session','cardId']]){const value=JSON.parse(await readFile(resolve(profileRoot,`../examples/wt-08/${op}.json`),'utf8'));value.arguments[key][field]='different:parent';assert.throws(()=>parseActionRequest(value));}});
test('canonical parser rejects executable/accessor and cyclic arguments before submit',async()=>{let calls=0;const c=await createPhotonFeatureClient({contextId:()=> 'context:1',capabilities:()=>[],submit(){calls++;},status:()=>null});const args={};Object.defineProperty(args,'text',{enumerable:true,get(){throw new Error('ACCESSOR_EVALUATED');}});await assert.rejects(c.execute({operation:'text.send',arguments:args,idempotencyKey:'key:1'}),e=>e.message!=='ACCESSOR_EVALUATED');const cyclic={};cyclic.self=cyclic;await assert.rejects(c.execute({operation:'text.send',arguments:cyclic,idempotencyKey:'key:1'}));assert.equal(calls,0);});

test('npm package includes the neutral imports and full feature profile',async()=>{const {spawnSync}=await import('node:child_process');const child=spawnSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:resolve(profileRoot,'..'),encoding:'utf8'});assert.equal(child.status,0,child.stderr);const [pack]=JSON.parse(child.stdout);const names=new Set(pack.files.map(row=>row.path));for(const name of ['dist/src/feature-library.js','dist/src/feature-library.d.ts','features-only/SKILL.md','features-only/LIBRARY.md','features-only/client.mjs','features-only/client-core.mjs','features-only/client.d.mts'])assert.ok(names.has(name),name);for(const row of catalog.operations){assert.ok(names.has('schemas/'+row.operation+'.json'));assert.ok(names.has('examples/wt-08/'+row.operation+'.json'));}});
