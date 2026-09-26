import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardQueue,type KeyboardIntent} from '../src/state/keyboard-queue';
const item=(action:KeyboardIntent['action']):KeyboardIntent=>({action,documentId:'doc',slideId:'page',ids:['a'],focusCanvas:false});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
test('nudge admission captures inputs and coalesces only matching scopes',async()=>{
 const executed:KeyboardIntent[]=[];const queue=new KeyboardQueue({prepare:async()=>{},execute:async value=>{executed.push(value);return undefined;},error:cause=>assert.fail(String(cause))},new AbortController().signal);
 const first=item({type:'nudge',dx:1,dy:0});queue.enqueue(first);first.ids[0]='changed';queue.enqueue(item({type:'nudge',dx:2,dy:0}));queue.enqueue({...item({type:'nudge',dx:1,dy:0}),slideId:'other'});await queue.whenIdle();assert.equal(executed.length,2);assert.deepEqual(executed[0].ids,['a']);assert.deepEqual(executed[0].action,{type:'nudge',dx:3,dy:0});
});
test('close while preparing keeps queued intent without executing it',async()=>{
 const started=deferred(),gate=deferred(),controller=new AbortController();let executed=false;
 const queue=new KeyboardQueue({prepare:async()=>{started.resolve();await gate.promise;},execute:async()=>{executed=true;return undefined;},error:cause=>assert.fail(String(cause))},controller.signal);queue.enqueue(item({type:'delete'}));await started.promise;controller.abort();let idle=false;const waiting=queue.whenIdle().then(()=>{idle=true;});await Promise.resolve();assert.equal(idle,false);gate.resolve();await waiting;assert.equal(executed,false);assert.equal(queue.retained().length,1);
});
test('failure preserves active and pending intents instead of dropping the batch',async()=>{
 const errors:unknown[]=[];const queue=new KeyboardQueue({prepare:async()=>{},execute:async()=>{throw Error('capture failed');},error:cause=>errors.push(cause)},new AbortController().signal);queue.enqueue(item({type:'duplicate'}));queue.enqueue(item({type:'delete'}));await queue.whenIdle();assert.equal(errors.length,1);assert.deepEqual(queue.retained().map(value=>value.intent.action.type),['duplicate','delete']);
});

test('completed document effects are not offered again after focus fails',async()=>{
 const queue=new KeyboardQueue({prepare:async()=>{},execute:async(_item,complete)=>{complete(['new']);throw Error('focus failed');},error:()=>{}},new AbortController().signal);
 queue.enqueue(item({type:'duplicate'}));queue.enqueue(item({type:'delete'}));await queue.whenIdle();const records=queue.retained();assert.equal(records.length,1);assert.equal(records[0].phase,'queued');assert.deepEqual(records[0].intent.ids,['new']);
});
test('uncertain execution and untouched successors retain distinct stable identities',async()=>{
 const queue=new KeyboardQueue({prepare:async()=>{},execute:async()=>{throw Error('unknown outcome');},error:()=>{}},new AbortController().signal);
 queue.enqueue(item({type:'delete'}));queue.enqueue(item({type:'undo'}));await queue.whenIdle();const first=queue.retained(),second=queue.retained();assert.deepEqual(first,second);assert.equal(first[0].phase,'executing');assert.equal(first[1].phase,'queued');assert.notEqual(first[0].id,first[1].id);
});
test('shutdown retries failed persistence with the same queued record identity',async()=>{
 let fail=true;const saved:string[][]=[];const controller=new AbortController();const queue=new KeyboardQueue({prepare:async()=>{},execute:async()=>undefined,error:()=>{},retain:async rows=>{saved.push(rows.map(row=>row.id));if(fail)throw Error('disk failed');}},controller.signal);
 queue.enqueue(item({type:'delete'}));controller.abort();await assert.rejects(queue.seal(),/disk failed/);fail=false;await queue.seal();assert.deepEqual(saved[0],saved[1]);assert.equal(saved[0].length,1);
});
