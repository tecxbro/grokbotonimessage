import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { resolveContents, type Message, type Space, type ContentInput } from 'spectrum-ts';
import { createTextMessageModule } from '../../src/features/text-messages/module.js';
import { DurableLocalProtocol, listenDurableLocal } from '../../src/runtime/core/local-server.js';
import { DurableWork } from '../../src/runtime/core/work-handoff.js';
import { requestIdentity } from '../../src/runtime/core/idempotency.js';
import { run } from '../../src/cli/main.js';
import { runtime, action, context, principal, scope } from '../lanes/wt-09/harness.js';
import { execution, unusedDependencies, offlineCapability } from '../lanes/wt-09/execution-harness.js';

test('CLI → authenticated host → durable executor → production text feature reaches offline SDK send', async t => {
  const r=runtime();t.after(()=>r.close());let sends=0;
  const offlineSpace={id:'offline-chat',__platform:'imessage',phone:'offline-line',
    send:async(input:ContentInput)=>{
      sends++;const content=(await resolveContents([input]))[0]!;
      return {id:'accepted-message',platform:'imessage',space:offlineSpace,content,direction:'outbound',timestamp:new Date(10000),sender:undefined} as Message;
    }} as unknown as Space;
  const {executor}=execution(r,{...unusedDependencies,resources:{...unusedDependencies.resources,space:async()=>offlineSpace}});
  const feature=createTextMessageModule({binding:()=>({scope,phone:'offline-line',nativeSpaceId:'offline-chat'}),requestId:(a,s)=>requestIdentity(a,s.context)});
  const protocol=new DurableLocalProtocol({contexts:r.contexts,submission:r.submission,work:new DurableWork(r.store,r.contexts),
    capabilities:()=>[offlineCapability],diagnostics:()=>({ready:true,activation:'enabled'})});
  const socket=join(r.dir,'runtime.sock'),credentialFile=join(r.dir,'credential');const token='a'.repeat(64);
  writeFileSync(credentialFile,token,{mode:0o600});
  const server=await listenDurableLocal(socket,[{token,principal}],protocol);t.after(()=>server.close());
  let stdout='',stderr='';const code=await run(['execute','--json-stdin'],{GROK_PHOTON_CONTEXT_ID:context.contextId,GROK_PHOTON_SOCKET:socket,GROK_PHOTON_CREDENTIAL_FILE:credentialFile},
    Readable.from([JSON.stringify(action())]),{write:(s:any)=>{stdout+=s;return true;}},{write:(s:any)=>{stderr+=s;return true;}});
  assert.equal(code,0,stdout+stderr);assert.ok(!stdout.includes(token));const reply=JSON.parse(stdout);assert.equal(reply.result.status,'queued');
  const result=await executor.execute(reply.result.requestId,{boundary:'durable-children',handler:feature.handlers.find(h=>h.operation==='text.send')!,capability:()=>offlineCapability});
  assert.equal(result?.status,'executor-completed',JSON.stringify(result));
  assert.equal(sends,1);assert.equal(result.references.length,1);
  assert.equal(await executor.execute(reply.result.requestId,{boundary:'durable-children',handler:feature.handlers[0]!,capability:()=>offlineCapability}),null);
  assert.equal(sends,1);
});
