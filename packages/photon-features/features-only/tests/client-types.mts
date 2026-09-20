// Compile-only checks for the public client declaration; never executed or sent.
import {createPhotonFeatureClient} from '../client.mjs';
import type {ActionRequest} from '../../dist/src/contracts/actions.js';
declare const space: Extract<ActionRequest,{operation:'text.send'}>['arguments']['space'];
const client=await createPhotonFeatureClient({
  contextId:()=> 'context:example',
  capabilities:()=>({availability:'unknown' as const}),
  submit:(_action:ActionRequest)=>({state:'queued' as const}),
  status:(_id:string)=>({state:'unknown' as const}),
});
const response=await client.execute({operation:'text.send',arguments:{space,text:'Example'},idempotencyKey:'example:1'});
const queued:'queued'=response.state;
const availability:'unknown'=(await client.capabilities()).availability;
void queued;void availability;
// @ts-expect-error Context must be supplied by the binding, not an input override.
client.execute({operation:'text.send',arguments:{space,text:'Example'},idempotencyKey:'example:1',contextId:'forged'});
// @ts-expect-error Missing required text cannot be accepted as text.send.
client.execute({operation:'text.send',arguments:{space},idempotencyKey:'example:1'});
// @ts-expect-error Unknown operations are not arbitrary strings.
client.execute({operation:'send.anything',arguments:{space},idempotencyKey:'example:1'});
