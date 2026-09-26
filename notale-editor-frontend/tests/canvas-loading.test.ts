import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasLoading} from '../src/canvas/loading-controller';
import {canvasLoadingState as state,canvasLoadingActions as actions} from '../src/state/canvas-loading';
test('loading timers and late retries cannot revive a disposed loading controller',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const pending=new Map<number,()=>void>();let id=0,retries=0,reports=0;
 globalThis.setTimeout=((fn:()=>void)=>{pending.set(++id,fn);return id;}) as any;
 globalThis.clearTimeout=((id:number)=>pending.delete(id)) as any;
 try{
  let reject!:(error:Error)=>void;
  const controller=createCanvasLoading(()=>{retries++;return new Promise((_,fail)=>reject=fail);},()=>reports++);
  controller.start();assert.equal(pending.size,2);
  for(const callback of pending.values())callback();assert.equal(state.getSnapshot().timedOut,true);
  const first=actions.retry();await actions.retry();assert.equal(retries,1);
  controller.dispose();controller.dispose();assert.equal(pending.size,0);assert.deepEqual(state.getSnapshot(),{visible:false,timedOut:false,retrying:false});
  reject(Error('late failure'));await first;assert.equal(reports,0);
  controller.start();await actions.retry();assert.equal(pending.size,0);assert.equal(retries,1);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
