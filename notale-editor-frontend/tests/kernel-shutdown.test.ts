import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorKernel} from '../src/editor-kernel';

test('kernel sealing waits for accepted commands and rejects new work',async()=>{
 let release!:()=>void,entered!:()=>void,painted=0,enqueued=0;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const kernel=new EditorKernel({operations:()=>[],owner:()=> 'owner',stage:async()=>{},finalize:async()=>{},enqueue:async()=>{entered();await wait;enqueued++;},cancel:async()=>true,prepare:async()=>{throw Error('unexpected prepare');},barrier:async()=>{},changed:()=>{painted++;},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 const accepted=kernel.execute([{type:'deck.update',title:'after'}] as any);
 await Promise.race([started,accepted.then(()=>{throw Error("command finished too early");})]);
 let finished=false;const closing=kernel.seal().then(()=>{finished=true;});
 await assert.rejects(kernel.execute([]),/已关闭/);
 await Promise.resolve();assert.equal(finished,false);
 release();await accepted;await closing;assert.equal(enqueued,1);assert.equal(painted,0);
});
