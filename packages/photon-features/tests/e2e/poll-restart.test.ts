import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingEvent, ResourceRef, Transaction } from '../../src/index.js';
import { createPollReducer } from '../../src/features/polls/reducer.js';
import { registerNativeOptions } from '../../src/features/polls/identity.js';
import { reconcilePollEvents } from '../../src/features/polls/reconciliation.js';
import { InboundRouter } from '../../src/runtime/inbound/router.js';
import { DurableSQLiteStore } from '../../src/adapters/state/sqlite.js';
import { runtime, context, scope } from '../lanes/wt-09/harness.js';

function poll(r: ReturnType<typeof runtime>, suffix = '1') {
  const message: Extract<ResourceRef,{kind:'message'}> = {version:1,kind:'message',id:`message-${suffix}`,scope};
  const ref: Extract<ResourceRef,{kind:'poll'}> = {version:1,kind:'poll',id:`poll-${suffix}`,messageId:message.id,scope};
  const options = r.store.transaction(tx => {
    for (const reference of [message,ref]) tx.put('references',{id:reference.id,scope,revision:0,reference,providerId:`native-${suffix}`,
      ownedByPrincipalId:context.principalId,taskId:context.taskId,generation:1},null);
    tx.put('polls',{id:ref.id,scope,revision:0,reference:ref,question:'Choose',options:[]},null);
    return registerNativeOptions(tx,{poll:ref,nativePollGuid:`native-${suffix}`,options:[{nativeId:'option-a',label:'Same'},{nativeId:'option-b',label:'Same'}]});
  });
  return {ref,options};
}
function vote(p:ReturnType<typeof poll>,id:string,seq:string,actor='voter-a',index=0,change:'vote'|'unvote'='vote'):IncomingEvent {
  return {version:1,type:'poll',eventId:id,scope,direction:'inbound',occurredAt:null,receivedAt:10000,
    ordering:{source:'verified-sequence-fixture',sequence:seq},targets:[p.ref,p.options[index]!],poll:p.ref,option:p.options[index]!,actorId:actor,change};
}
const reducer = () => createPollReducer({orderedSources:['verified-sequence-fixture'],selectionSemantics:'independent-option-deltas'});

test('two polls with duplicate labels, multiple voters/selections, unvote and out-of-order replay survive DB reopen', async t => {
  const r=runtime();t.after(()=>r.close());const a=poll(r),b=poll(r,'2'),reduce=reducer();
  for (const event of [vote(a,'a1','1'),vote(a,'a2','2','voter-a',1),vote(a,'a3','3','voter-b'),vote(b,'b1','1'),
    vote(a,'a4','4','voter-a',0,'unvote'),vote(a,'a1','1'),vote(a,'old','2')]) r.store.transaction(tx=>reduce.reduce(event,tx));
  const reopened=new DurableSQLiteStore(r.path);
  try {
    const votes=reopened.scan('votes'); assert.equal(votes.length,4);
    assert.equal(votes.find(v=>v.pollId===a.ref.id&&v.actorId==='voter-a'&&v.optionId===a.options[0]!.id)!.active,false);
    assert.equal(votes.filter(v=>v.active).length,3); assert.equal(reopened.scan('handoffs').length,5);
  } finally {reopened.close();}
});

test('early vote is retained then reconciled by identity; absent ordering stays unresolved', async t => {
  const r=runtime();t.after(()=>r.close());const p=poll(r);const reduce=reducer();
  const event=vote(p,'early','1'); if(event.type!=='poll')throw new Error('fixture');
  event.option={...event.option,id:'option-c'};
  r.store.transaction(tx=>reduce.reduce(event,tx));assert.equal(r.store.scan('votes').length,0);
  r.store.transaction(tx=>registerNativeOptions(tx,{poll:p.ref,nativePollGuid:'native-1',options:[
    {nativeId:'option-a',label:'Same'},{nativeId:'option-b',label:'Same'},{nativeId:'option-c',label:'Added'}]}));
  assert.equal(reconcilePollEvents(r.store,scope,reduce).resolved,1);
  const unordered=vote(p,'unordered','2');delete unordered.ordering.sequence;
  r.store.transaction(tx=>reduce.reduce(unordered,tx));assert.equal(r.store.scan('votes').length,1);
  assert.equal(r.store.transaction(tx=>tx.get('inbox','unordered'))!.state,'unresolved');
});

test('vote state and continuation roll back together on failed handoff commit', async t => {
  const r=runtime();t.after(()=>r.close());const p=poll(r),event=vote(p,'atomic','1');
  assert.throws(()=>r.store.transaction(tx=>{
    const intercepted:Transaction={...tx,get:tx.get.bind(tx),list:tx.list.bind(tx),listWork:tx.listWork.bind(tx),
      put:(table,row,revision)=>{if(table==='handoffs')throw new Error('CONTROLLED_DB_FAILURE');tx.put(table,row,revision);}};
    reducer().reduce(event,intercepted);
  }),/CONTROLLED_DB_FAILURE/);
  assert.equal(r.store.scan('votes').length,0);assert.equal(r.store.scan('handoffs').length,0);assert.equal(r.store.scan('inbox').length,0);
});

test('WT-02 router and WT-05 reducer commit one correlated continuation together', async t => {
  const r=runtime();t.after(()=>r.close());const p=poll(r);
  const router=new InboundRouter(r.store,r.clock,{route:()=>({taskId:context.taskId,generation:1,principalId:context.principalId}),continuation:e=>e.type==='poll'},[reducer()]);
  await router.accept(vote(p,'assembled-vote','1'));
  assert.equal(r.store.scan('votes').length,1);assert.equal(r.store.scan('handoffs').length,1);
  assert.equal(r.store.transaction(tx=>tx.get('inbox','assembled-vote'))!.state,'reduced');
});
