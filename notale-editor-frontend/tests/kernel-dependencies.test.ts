import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorKernel} from '../src/editor-kernel';
import {isPending,type Pending} from '../src/pending-journal';
test('kernel retains predecessor identities in durable tasks and excludes already confirmed work',async()=>{
 const queue:Pending[]=[];
 const kernel=new EditorKernel({operations:()=>queue,owner:()=> 'owner',stage:async()=>{},finalize:async()=>{},enqueue:async task=>{queue.push(structuredClone(task));},cancel:async()=>true,prepare:async()=>{throw Error('unexpected prepare');},barrier:async()=>{},changed:()=>{},preview:()=>{},error:()=>{}});
 kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'before',width:1600,height:900,slides:[]}} as any);
 await kernel.execute([{type:'deck.update',title:'first'}]);
 await kernel.execute([{type:'deck.update',title:'second'}]);
 assert.deepEqual(queue[1].kernel?.dependencies,[queue[0].request.mutationId]);
 assert.equal(isPending(JSON.parse(JSON.stringify(queue[1]))),true);
 kernel.acknowledge(queue[0].request.mutationId,2);
 await kernel.execute([{type:'deck.update',title:'third'}]);
 assert.deepEqual(queue[2].kernel?.dependencies,[queue[1].request.mutationId]);
 for(const dependencies of ['bad',[queue[1].request.mutationId],[''],[queue[0].request.mutationId,queue[0].request.mutationId]])assert.equal(isPending({...queue[1],kernel:{...queue[1].kernel,dependencies}}),false);
});
