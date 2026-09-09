import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseAction, scopeSchema, resultSchema } from '../../src/index.js';
import { localRequest } from '../../src/cli/local-client.js';

// Disabled unless an operator records explicit user authorization for THIS exact action.
// Credentials/config alone are never consent. The approval record does not grant runtime permissions.
const approvalFile=process.env.WT09_LIVE_APPROVAL_FILE;
test('authorized exact text action: provider acceptance only', {skip:!approvalFile,timeout:40000}, async()=>{
  const approval=z.strictObject({version:z.literal(1),approved:z.literal(true),approvedBy:z.string().min(1),
    authorizationReference:z.string().min(1),candidateSha:z.string().regex(/^[a-f0-9]{40}$/),
    expiresAt:z.number().int(),scope:scopeSchema,action:z.unknown(),actionSha256:z.string().regex(/^[a-f0-9]{64}$/),
    socket:z.string(),credentialFile:z.string()}).parse(JSON.parse(readFileSync(approvalFile!,'utf8')));
  assert.ok(approval.expiresAt>Date.now(),'expired authorization');
  assert.equal(process.env.WT09_LIVE_CANDIDATE_SHA,approval.candidateSha,'exact assembled candidate must be independently verified');
  const action=parseAction(approval.action);assert.equal(action.operation,'text.send','smoke authorizes only one text; no groups, billing, provisioning, or other actions');
  assert.equal(createHash('sha256').update(JSON.stringify(approval.action)).digest('hex'),approval.actionSha256);
  assert.ok(action.operation==='text.send');assert.deepEqual(action.arguments.space.scope,approval.scope);
  const config={socket:approval.socket,credentialFile:approval.credentialFile};
  const response=await localRequest({version:1,method:'submit',action},config) as {ok:boolean;result:unknown};assert.equal(response.ok,true);
  let result=resultSchema.parse(response.result);const deadline=Date.now()+30000;
  while(result.status==='queued'&&Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,250));
    const status=await localRequest({version:1,method:'status',contextId:action.contextId,requestId:result.requestId},config) as {ok:boolean;result:unknown};
    assert.equal(status.ok,true);result=resultSchema.parse(status.result);
  }
  assert.ok(result.observations.some(o=>o.kind==='accepted'),`provider acceptance pending: ${result.status}`);
  // No delivery/read/device rendering or incoming vote claim follows from this assertion.
});
