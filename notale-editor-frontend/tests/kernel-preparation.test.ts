import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorKernel} from '../src/editor-kernel';
import type {Pending} from '../src/pending-journal';
test('preparation persists first, finalizes the same task and lets later commands depend on it',async()=>{
 const queue:Pending[]=[],events:string[]=[];
 const kernel=new EditorKernel({owner:()=> 'owner',operations:()=>queue,stage:async task=>{events.push('stage');const at=queue.findIndex(item=>item.request.mutationId===task.request.mutationId);if(at<0)queue.push(structuredClone(task));else queue[at]=structuredClone(task);kernel.refresh();},finalize:async()=>{events.push('finalize');kernel.refresh();},enqueue:async task=>{queue.push(task);},cancel:async()=>true,barrier:async()=>{events.push('barrier');assert.equal(queue.length,1);},prepare:async()=>{events.push('prepare');return {protocol:2,documentId:'doc',fromVersion:1,toVersion:1,slideIds:[],changes:[{path:['title'],before:'before',after:'prepared'}]};},changed:()=>{},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 const prepared=kernel.execute([{type:'scene.set',slideId:'page',sceneId:'scene',values:{count:5}}]);await prepared;assert.deepEqual(events,['stage','barrier','prepare','stage','finalize']);assert.equal(kernel.current.document.title,'prepared');const id=queue[0].request.mutationId;
 await kernel.execute([{type:'deck.update',title:'after'}]);assert.deepEqual(queue[1].kernel?.dependencies,[id]);
});
test('failed preparation is retained and does not prevent later commands',async()=>{
 const queue:Pending[]=[],retained:Pending[]=[];
 const kernel=new EditorKernel({owner:()=> 'owner',operations:()=>queue,stage:async task=>{queue.push(structuredClone(task));},finalize:async()=>{throw Error('must not finalize');},enqueue:async task=>{queue.push(task);},retainPreparation:async task=>{retained.push(task);queue.splice(0);},cancel:async()=>true,barrier:async()=>{},prepare:async()=>{throw Error('offline');},changed:()=>{},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 await assert.rejects(kernel.execute([{type:'scene.set',slideId:'page',sceneId:'scene',values:{count:5}}]),/offline/);assert.equal(retained.length,1);await kernel.execute([{type:'deck.update',title:'continued'}]);assert.equal(kernel.current.document.title,'continued');
});

test('queued commands capture their input before another preparation completes',async()=>{
 const queue:Pending[]=[];let release!:()=>void,entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const kernel=new EditorKernel({owner:()=> 'owner',operations:()=>queue,stage:async()=>{},finalize:async()=>{},enqueue:async task=>{queue.push(task);},cancel:async()=>true,barrier:async()=>{},prepare:async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});return {protocol:2,documentId:'doc',fromVersion:1,toVersion:1,slideIds:[],changes:[]};},changed:()=>{},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 const first=kernel.execute([{type:'scene.set',slideId:'page',sceneId:'scene',values:{count:5}}]);await started;const command={type:'deck.update' as const,title:'accepted'};const second=kernel.execute([command]);command.title='mutated';release();await Promise.all([first,second]);assert.equal(kernel.current.document.title,'accepted');
});
