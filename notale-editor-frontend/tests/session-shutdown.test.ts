import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionShutdown} from '../src/state/session-shutdown';

test('shutdown stops every producer before waiting, and closes the session after retention',async()=>{
 const calls:string[]=[];let release!:()=>void;
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const shutdown=new SessionShutdown([
  {name:'text',seal:()=>{calls.push('text');return wait;}},
  {name:'chart',seal:async()=>{calls.push('chart');}},
 ],{close:async()=>{calls.push('close');},exportDraft:async()=> 'draft'});
 const pending=shutdown.close();assert.equal(shutdown.close(),pending);
 assert.deepEqual(calls,['text','chart']);release();await pending;
 assert.deepEqual(calls,['text','chart','close']);await shutdown.close();assert.equal(calls.length,3);
});

test('failed producer retains session ownership, retries only unfinished work and permits export',async()=>{
 let first=0,second=0,closed=0;
 const shutdown=new SessionShutdown([
  {name:'first',seal:async()=>{first++;}},
  {name:'second',seal:()=>{if(++second===1)throw Error('local write failed');return Promise.resolve();}},
 ],{close:async()=>{closed++;},exportDraft:async()=> 'retained draft'});
 await assert.rejects(shutdown.close(),/部分编辑/);assert.equal(closed,0);
 assert.equal(await shutdown.exportDraft(),'retained draft');
 await shutdown.close();assert.equal(first,1);assert.equal(second,2);assert.equal(closed,1);
});
