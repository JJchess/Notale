import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keepPreviewAlive} from '../src/preview-lease';
import {resourceNotices} from '../src/state/resource-notices';
test('renewal publishes failure and recovery without UI ownership, and stopped requests cannot revive notices',async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};
 Object.assign(globalThis,{window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible'})});
 const statuses:string[]=[],preview={channel:'c',version:1,expiresAt:Date.now()+60000,renewAfterMs:1800000};
 const lease=keepPreviewAlive('doc',preview,status=>statuses.push(status));
 try{
  globalThis.fetch=async()=>new Response('',{status:503});await lease.renew();assert.deepEqual(statuses,['failed']);
  globalThis.fetch=async()=>Response.json(preview);await lease.renew();assert.deepEqual(statuses,['failed','retrying','healthy']);
  let finish!:(response:Response)=>void;globalThis.fetch=()=>new Promise<Response>(resolve=>finish=resolve);
  const pending=lease.renew();lease.stop();finish(new Response('',{status:503}));await pending;assert.deepEqual(statuses,['failed','retrying','healthy','stopped']);
 }finally{lease.stop();Object.assign(globalThis,original);}
});
test('multiple resource failures share a notice and disposed leases are never retried',async()=>{
 let retries=0;const first=resourceNotices.register('preview',async()=>{retries++;}),second=resourceNotices.register('preview',async()=>{retries++;});
 try{first('failed');second('failed');assert.deepEqual(resourceNotices.getSnapshot(),[{scope:'preview',pending:false}]);first('stopped');await resourceNotices.retry('preview');assert.equal(retries,1);second('retrying');assert.equal(resourceNotices.getSnapshot()[0].pending,true);second('healthy');assert.equal(resourceNotices.getSnapshot().length,0);}finally{first('stopped');second('stopped');}
});
