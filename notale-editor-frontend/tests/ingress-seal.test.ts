import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTextIngress} from '../src/text-ingress';
import {createVectorIngress} from '../src/vector-ingress';
test('sealed text and vector producers finish staging without finalizing or accepting new edits',async()=>{
 const set=globalThis.setTimeout,clear=globalThis.clearTimeout,timers=new Map<number,unknown>();let id=0;
 globalThis.setTimeout=((callback:unknown)=>{timers.set(++id,callback);return id;}) as any;globalThis.clearTimeout=((key:number)=>timers.delete(key)) as any;
 try{
  const tasks:any[]=[];let finalized=0;
  const queue={stageText:async(task:unknown)=>{tasks.push(task);},finalizeText:async()=>{finalized++;}} as any;
  const text=createTextIngress({queue,documentId:()=> 'doc',version:()=>1,error:()=>{},confirm:()=>{}});
  const draft={sessionId:'text',target:'title',sequence:1,html:'最后的文字',immediate:false,composing:false,slideId:'page',runtimeId:'runtime'};
  text.receive(draft);await text.seal();text.receive({...draft,sequence:2,html:'不再接收'});
  assert.equal(timers.size,0);assert.equal(tasks.length,1);assert.equal(tasks[0].request.commands[0].patch.richText,'最后的文字');assert.equal(finalized,0);
  const vector=createVectorIngress(queue,()=> 'doc',()=>1,()=>{});
  const edit={id:'vector',slideId:'page',selection:['shape'],commands:[{type:'element.patch'}],final:false};vector.receive(edit);await vector.seal();vector.receive({...edit,id:'late'});
  assert.equal(tasks.length,2);assert.equal(tasks[1].request.mutationId,'vector');assert.equal(finalized,0);
 }finally{globalThis.setTimeout=set;globalThis.clearTimeout=clear;}
});

test('seal waits for already-started finalization and blocks later flushes',async()=>{
 for(const kind of ['text','vector']){
  let release!:()=>void,started!:()=>void,finished=false,count=0;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const queue={stageText:async()=>{},finalizeText:async()=>{count++;started();await blocked;}} as any;
  const producer=kind==='text'?createTextIngress({queue,documentId:()=> 'doc',version:()=>1,error:()=>{},confirm:()=>{}}):createVectorIngress(queue,()=> 'doc',()=>1,()=>{});
  (producer.receive as any)(kind==='text'?{sessionId:'text',target:'title',sequence:1,html:'draft',immediate:true,composing:false,slideId:'page',runtimeId:'runtime'}:{id:'vector',slideId:'page',selection:['shape'],commands:[],final:true});
  await entered;
  const closing=producer.seal().then(()=>{finished=true;});
  await Promise.resolve();await Promise.resolve();assert.equal(finished,false);
  release();await closing;await producer.flush();assert.equal(count,1);
 }
});

test('vector staging owns a snapshot of the incoming command',async()=>{
 let saved:any;
 const vector=createVectorIngress({stageText:async(task:unknown)=>{saved=task;}} as any,()=> 'doc',()=>1,()=>{});
 const data={id:'v',slideId:'page',selection:['shape'],commands:[{type:'element.patch',patch:{style:{fill:'red'}}}],final:false};
 vector.receive(data);data.selection[0]='other';data.commands[0].patch.style.fill='blue';await vector.seal();
 assert.deepEqual(saved.selection,['shape']);assert.equal(saved.request.commands[0].patch.style.fill,'red');
});

test('sealed producers retry failed local staging with the final snapshot',async()=>{
 for(const kind of ['text','vector']){
  let fail=true;const saved:any[]=[];
  const queue={stageText:async(task:any)=>{if(fail)throw Error('disk unavailable');saved.push(task);},finalizeText:async()=>{}} as any;
  const producer=kind==='text'?createTextIngress({queue,documentId:()=> 'doc',version:()=>1,error:()=>{},confirm:()=>{}}):createVectorIngress(queue,()=> 'doc',()=>1,()=>{});
  (producer.receive as any)(kind==='text'?{sessionId:'text',target:'title',sequence:1,html:'latest',immediate:false,composing:true,slideId:'page',runtimeId:'runtime'}:{id:'vector',slideId:'page',selection:['shape'],commands:[],final:false});
  await assert.rejects(producer.seal(),/草稿/);fail=false;await producer.seal();assert.equal(saved.length,1);
  await producer.seal();assert.equal(saved.length,1);
 }
});
