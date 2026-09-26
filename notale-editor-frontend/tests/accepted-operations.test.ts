import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AcceptedOperations} from '../src/state/accepted-operations';
test('synchronization waits for accepted preparation and work accepted during the wait',async()=>{
 const operations=new AcceptedOperations();let prepare!:()=>void,enqueue!:()=>void,done=false;
 const first=operations.run(async()=>{await new Promise<void>(resolve=>{prepare=resolve;});});
 const waiting=operations.whenIdle().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 const second=operations.run(async()=>{await new Promise<void>(resolve=>{enqueue=resolve;});});prepare();await first;await Promise.resolve();assert.equal(done,false);enqueue();await Promise.all([second,waiting]);assert.equal(done,true);
});
test('a failing active operation rejects synchronization without retaining dead work',async()=>{
 const operations=new AcceptedOperations();let reject!:(error:Error)=>void;const task=operations.run(()=>new Promise<void>((_,fail)=>{reject=fail;}));const waiting=operations.whenIdle();reject(Error('prepare failed'));await assert.rejects(task,/prepare failed/);await assert.rejects(waiting,/prepare failed/);await operations.whenIdle();
});

test('failure does not finish the idle boundary before other accepted work settles',async()=>{
 const operations=new AcceptedOperations();let fail!:(reason:unknown)=>void,release!:()=>void,finished=false;
 const failed=operations.run(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));
 const active=operations.run(()=>new Promise<void>(resolve=>{release=resolve;}));
 const cause=Error('first failed');const waiting=operations.whenIdle().then(()=>{finished=true;},error=>{finished=true;assert.equal(error,cause);});
 fail(cause);await failed.catch(()=>{});await Promise.resolve();assert.equal(finished,false);
 release();await Promise.all([active,waiting]);assert.equal(finished,true);
});
