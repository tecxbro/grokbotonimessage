/** Explicit post-package verification of a real fully assembled archive.
 * Not part of the archive builder's recursive installed-test gate. External
 * Photon/Grok calls are doubles; all installed code, IPC and SQLite are real. */
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { install } from '../../scratch-setup/install.mjs';
const [archivePath, checksum] = process.argv.slice(2);
assert.ok(archivePath && checksum, 'archive and checksum required');
const parent = await mkdtemp(join(await realpath(tmpdir()), 'ph-dist-'));
// The installer must create its own marked root, not adopt an existing directory.
const root = join(parent, 'install');
let composition, local, stop;
try {
  const first = await install(root, { archivePath, checksum });
  const pointer = JSON.parse(await readFile(join(root, 'selected-release.json'), 'utf8'));
  const releaseRoot = join(root, 'releases', pointer.release);
  const load = name => import(pathToFileURL(join(releaseRoot, name)).href);
  const { dispatch } = await load('scratch-setup/cli.mjs');
  const binding = {version:1,url:'https://offline-fixture.example.com/wake',key:'NOT_A_LIVE_KEY'};
  await dispatch(['bind-webhook','--json-stdin','--root',root],async()=>binding);
  const runtime=join(root,'runtime'), secretFile=join(runtime,'fixture-project-secret.json');
  await writeFile(secretFile,JSON.stringify({version:1,projectId:'fixture-project',projectSecret:'NOT_A_LIVE_SECRET'}),{mode:0o600});
  const user={id:'fixture-user',accountId:'fixture-account',phoneNumber:'+15555550202'};
  const discovery={version:1,kind:'setup-discovery',installationRoot:root,project:{id:'fixture-project'},projectCandidates:[{id:'fixture-project'}],
    spectrum:{mode:'shared',user,userCandidates:[user],servingE164:null,dedicatedLineId:null,lineCandidates:[]},
    secretFile:{path:secretFile,mode:'0600',format:'photon-project-secret-v1'},grok:{executable:null,agentId:null,candidates:[],evidence:null,commandStyle:null,commandStyleEvidence:null,unresolved:[]},unresolved:[]};
  const {generateInitialOwnerConfiguration,writeInitialConfiguration}=await load('dist/src/host/setup-configuration.js');
  const config=await generateInitialOwnerConfiguration({version:2,discovery,webhookFile:join(runtime,'grok-wake.json'),choices:{initialAddress:user.phoneNumber,initialConversationId:'fixture-chat'}});
  await writeInitialConfiguration(root,config);
  const {validateProductionInstallation,changeProductionActivation}=await load('dist/src/host/process.js');
  await validateProductionInstallation(root,releaseRoot);
  await changeProductionActivation(root,releaseRoot,'enabled');
  const {loadNormalizedHostConfiguration}=await load('dist/src/host/configuration.js');
  const actual=await loadNormalizedHostConfiguration(root);assert.equal(actual.task.permissions.length,44);assert.equal(actual.grok.mode,'webhook');
  const {createProductionComposition}=await load('dist/src/host/production.js');
  let emit,batchId,sends=0,owners=0;
  const stopped=new Promise(resolve=>stop=resolve),next=new Promise(resolve=>emit=resolve);
  const incoming={id:'fixture-incoming',direction:'inbound',platform:'imessage',timestamp:new Date(),sender:{id:user.phoneNumber},content:{type:'text',text:'verify installed path'}};
  const space={id:'fixture-chat',__platform:'imessage',phone:'shared',async startTyping(){},async stopTyping(){},
    getMessage:async()=>({...incoming,space,read:async()=>{}}),
    send:async()=>{sends++;return{id:'fixture-outgoing',space,direction:'outbound',platform:'imessage',timestamp:new Date(),content:{type:'text',text:'installed reply'}};}};
  incoming.space=space;
  composition=await createProductionComposition(actual,root,releaseRoot,{
    sdkFactory:async()=>{owners++;return{messages:()=>({async *[Symbol.asyncIterator](){await next;yield[space,incoming];await stopped;}}),space:async()=>space,provider:()=>({space:{},getMembers:async()=>[]}),stop:async()=>stop()};},
    webhookFetch:async(_url,init)=>{const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['batchId']);batchId=body.batchId;return new Response(null,{status:204});},
  });
  await composition.runtime.start();local=await composition.startLocalInterface();emit();
  const until=async fn=>{const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await delay(50);}assert.fail('installed fixture timed out');};
  await until(()=>batchId);
  const work=await dispatch(['read-batch','--batch-id',batchId,'--root',root]);assert.equal(work.events[0].content.text,'verify installed path');
  assert.equal((await dispatch(['capabilities','--root',root])).length,44);
  const scope=work.handoff.scope;
  const args=['respond','--batch-id',batchId,'--fence',String(work.handoff.claim.fence),'--json-stdin','--root',root];
  const action={operation:'text.send',idempotencyKey:batchId+':answer',arguments:{space:{version:1,kind:'space',id:scope.spaceId,scope},text:'installed reply'}};
  const result=await dispatch(args,async()=>action);await until(()=>sends===1);await dispatch(args,async()=>action);
  await until(async()=> (await dispatch(['status','--request-id',result.handoff.completion.requestIds[0],'--root',root])).status==='provider-accepted');
  assert.equal(owners,1);assert.equal(sends,1);
  await local.close();local=null;stop();await composition.runtime.stop();composition=null;
  const credential=await readFile(actual.local.credentialFile,'utf8');
  // Stopping a process does not revoke its activation. Upgrade/repeat install
  // must respect the real installer's explicit inactive-configuration boundary.
  await assert.rejects(install(root,{archivePath,checksum}), /DEACTIVATION_REQUIRED/);
  await changeProductionActivation(root,releaseRoot,'disabled');
  await install(root,{archivePath,checksum});
  assert.equal(await readFile(actual.local.credentialFile,'utf8'),credential);
  console.log(JSON.stringify({installedArchive:'passed',compiledModules:'actual-extracted-artifact',registeredOperations:44,
    nativeWakeRoundtrip:'offline-fixture-passed',duplicateFinal:'one-provider-call',repeatInstall:'authority-preserved',liveProvider:'not-tested'}));
} finally {
  await local?.close();stop?.();await composition?.runtime.stop();await rm(parent,{recursive:true,force:true});
}
