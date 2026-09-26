import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CanvasResources} from '../src/canvas/resources';
import {EditorSession} from '../src/state/editor-session';
test('revision fencing, request deduplication and bounded LRU eviction',async()=>{
  const paths:string[]=[];
  const cache=new CanvasResources<string[]>(async <T>(path:string)=>{paths.push(path);return [] as T;},2);
  const first=cache.getObjects('doc',1,'a');
  assert.equal(cache.getObjects('doc',1,'a'),first);
  await cache.getObjects('doc',1,'b');await cache.getObjects('doc',1,'a');await cache.getObjects('doc',1,'c');
  assert.equal(paths.length,3);
  await cache.getObjects('doc',1,'b');assert.equal(paths.length,4);
  await cache.getObjects('doc',2,'a');assert.match(paths.at(-1)!,/version=2/);
  assert.equal(cache.getPreview('doc',2),cache.getPreview('doc',2));
});
test('failed requests can be retried without erasing a newer revision',async()=>{
  let reject!:(e:Error)=>void;let calls=0;
  const cache=new CanvasResources<unknown>(async <T>()=>{if(++calls===1)return await new Promise<T>((_,r)=>{reject=r;});return {} as T;});
  const old=cache.getPreview('doc',1);const next=cache.getPreview('doc',2);
  reject(Error('offline'));await assert.rejects(old);assert.equal(cache.getPreview('doc',2),next);
});
test('session snapshots are stable and subscriptions are removable',()=>{
 const session=new EditorSession();let changes=0;
 const stop=session.subscribe(()=>changes++);const before=session.getSnapshot();
 session.update({activePageId:'a'});assert.equal(changes,1);assert.equal(before.activePageId,'');
 session.update({activePageId:'a'});assert.equal(changes,1);stop();session.update({activePageId:'b'});assert.equal(changes,1);
});
test('disposed resource caches reject new requests even after clear',async()=>{
 let calls=0,resolve!:(value:unknown)=>void;
 const cache=new CanvasResources<unknown>(async<T>()=>{calls++;return await new Promise<T>(done=>{resolve=value=>done(value as T);});});
 const pending=cache.getObjects('doc',1,'page');cache.dispose();cache.dispose();cache.clear();
 await assert.rejects(cache.getObjects('doc',1,'page'),/关闭/);await assert.rejects(cache.getPreview('doc',1),/关闭/);
 resolve(['old']);assert.deepEqual(await pending,['old']);assert.equal(calls,1);
});
test('unchanged page content reuses its object index across unrelated saves',async()=>{
 let calls=0;const cache=new CanvasResources<unknown>(async<T>()=>{calls++;return [] as T;});
 const first=cache.getObjects('doc',1,'a','same-content');assert.equal(cache.getObjects('doc',2,'a','same-content'),first);assert.equal(calls,1);
 await cache.getObjects('doc',2,'a','changed-content');assert.equal(calls,2);cache.clear();await cache.getObjects('doc',2,'a','changed-content');assert.equal(calls,3);
});
