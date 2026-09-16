import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AuthorScheduler} from '../resources/code-observer/core/author-scheduler.js';
import {WorkerRuntimeAdapter} from '../resources/code-observer/core/runtime-client.js';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('author requests coalesce, stop invalidates initialization and stale replies',async()=>{
 const first=deferred(),executed:number[]=[],replies:number[]=[];
 const scheduler=new AuthorScheduler({stop:()=>{},reply:(m:any)=>replies.push(m.id),run:async(m:any,{current}:any)=>{if(m.id===1)await first.promise;if(current())executed.push(m.id);},render:async()=>{}});
 scheduler.submit({action:'run',id:1});scheduler.submit({action:'run',id:2});scheduler.submit({action:'run',id:3});first.resolve();await settle();assert.deepEqual(executed,[3]);assert.deepEqual(replies,[3]);
 const waiting=deferred();scheduler.run=async(m:any,{current}:any)=>{await waiting.promise;if(current())executed.push(m.id);};scheduler.submit({action:'run',id:4});scheduler.submit({action:'run',id:5});scheduler.submit({action:'stop',id:6});waiting.resolve();await settle();assert.deepEqual(executed,[3]);assert.deepEqual(replies,[3,6]);scheduler.dispose();
});
test('renderer typing does not cancel a running Python snapshot',async()=>{
 const waiting=deferred(),seen:string[]=[];const scheduler=new AuthorScheduler({stop:()=>{},reply:()=>{},run:async()=>{await waiting.promise;seen.push('run');},render:async(m:any)=>{seen.push('render '+m.id);}});
 scheduler.submit({action:'run',id:1});scheduler.submit({action:'render',id:2});scheduler.submit({action:'render',id:3});waiting.resolve();await settle();assert.deepEqual(seen,['run','render 3']);scheduler.dispose();
});
test('stopping a worker during initialization settles its promise without restarting',async()=>{
 let created=0,terminated=0;const original=(globalThis as any).Worker;
 (globalThis as any).Worker=class {constructor(){created++;}addEventListener(){}terminate(){terminated++;}};
 try{const runtime=new WorkerRuntimeAdapter({workerUrl:'test'});const ready=runtime.start();const rejection=assert.rejects(ready,/运行已取消/);runtime.cancel({restart:false});await rejection;assert.equal(created,1);assert.equal(terminated,1);assert.equal(runtime.getState().ready,false);runtime.dispose();}finally{(globalThis as any).Worker=original;}
});
