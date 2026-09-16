import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coalescedRefresh} from '../src/state/coalesced-refresh';
const deferred=()=>{let resolve!:()=>void;const task=new Promise<void>(done=>resolve=done);return {task,resolve};};
test('later callers share a follow-up without delaying earlier callers',async()=>{
 const first=deferred(),second=deferred();let reads=0,settled=false;
 const refresh=coalescedRefresh(async()=>{await (++reads===1?first.task:second.task);});
 const a=refresh('doc');await Promise.resolve();const b=refresh('doc');const c=refresh('doc');assert.notEqual(a,b);assert.equal(b,c);void a.then(()=>settled=true);
 first.resolve();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(reads,2);assert.equal(settled,true);second.resolve();await Promise.all([a,b,c]);assert.equal(reads,2);
});
test('documents remain independent and a failed read can be retried',async()=>{
 const held=deferred();let reads=0;
 const refresh=coalescedRefresh(async key=>{if(key==='held')return held.task;if(++reads===1)throw Error('network');});
 const a=refresh('held');await assert.rejects(refresh('other'),/network/);await refresh('other');assert.equal(reads,2);held.resolve();await a;
});
