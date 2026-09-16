import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorKernel} from '../src/editor-kernel';
import type {Pending} from '../src/pending-journal';
test('kernel idle includes command preparation before persistent enqueue',async()=>{
 const queue:Pending[]=[];let release!:()=>void,entered!:()=>void,done=false;const preparing=new Promise<void>(resolve=>{entered=resolve;});
 const kernel=new EditorKernel({operations:()=>queue,owner:()=> 'owner',stage:async task=>{const at=queue.findIndex(item=>item.request.mutationId===task.request.mutationId);if(at<0)queue.push(structuredClone(task));else queue[at]=structuredClone(task);},finalize:async()=>{},enqueue:async task=>{queue.push(task);},cancel:async()=>true,prepare:async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});return {protocol:2,documentId:'doc',fromVersion:1,toVersion:1,slideIds:[],changes:[]};},barrier:async()=>{},changed:()=>{},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 const operation=kernel.execute([{type:'scene.set',slideId:'page',sceneId:'scene',values:{count:5}}]);await preparing;
 const waiting=kernel.whenIdle().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);assert.equal(queue.length,1);assert.equal(queue[0].kernel?.prepared,undefined);release();await Promise.all([operation,waiting]);assert.equal(queue.length,1);assert.equal(done,true);
});
