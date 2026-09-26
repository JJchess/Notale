import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DocumentSession} from '../src/geometry-session';
import type {SavedOperation,SyncJournal} from '../src/sync-journal';
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
function environment(){
 const originals=new Map(['window','document','sessionStorage','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 let held=0;const values={window:new EventTarget(),document:{hidden:false},sessionStorage:{getItem:()=>null,setItem:()=>{}},navigator:{locks:{request:async(name:string,options:any,callback?:any)=>{const fn=callback??options;if(name.startsWith('notale-tab:')){held++;try{return await fn({});}finally{held--;}}return fn({});},query:async()=>({held:[]})}}};
 for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,value});
 return {held:()=>held,restore(){for(const [key,value]of originals)if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as any)[key];}};
}
function fixture(){
 const entries=new Map<string,SavedOperation>();let fail=false;
 const journal={namespace:'test',ready:async()=>{},migrate:async()=>{},list:async()=>[...entries.values()],get:async(id:string)=>entries.get(id),put:async(entry:SavedOperation)=>{if(fail)throw Error('disk failed');entries.set(entry.id,entry);},stage:async(entry:SavedOperation)=>{if(fail)throw Error('disk failed');entries.set(entry.id,entry);return true;},markSending:async()=>true,acknowledge:async(id:string)=>{entries.delete(id);}};
 const operation=()=>{const id=randomUUID();return {id,documentId:'doc',createdAt:Date.now(),state:'pending',task:{documentId:'doc',request:{baseVersion:1,mutationId:id,commands:[{type:'deck.update',title:'saved'}]}}} as SavedOperation;};
 return {entries,journal:journal as unknown as SyncJournal,operation,fail:(value:boolean)=>fail=value};
}
const context=(submit:()=>Promise<number>)=>({task:()=>{throw Error('unexpected task generation');},submit,paint:()=>{},changed:()=>{},error:()=>{},remote:async()=>{},confirm:()=>{},recovered:()=>{},snapshot:()=>({})});
test('recovery lookup failure leaves the original command available for export and close retry',async()=>{
 const env=environment(),f=fixture(),session=new DocumentSession(context(async()=>2),f.journal);
 const get=f.journal.get;
 try{
  await session.load('doc');const operation=f.operation();f.journal.get=async()=>{throw Error('lookup failed');};
  await assert.rejects(session.retainPreparation(operation.task!,Error('prerequisite failed')),/lookup failed/);
  const exported=JSON.parse(await session.exportDraft());
  assert.deepEqual(exported.operations[0].task.request,operation.task!.request);
  f.journal.get=get;await session.close();await Promise.resolve();
  assert.equal(env.held(),0);assert.equal(f.entries.get(operation.id)?.state,'recovery');
 }finally{f.journal.get=get;await session.close();env.restore();}
});
test('close acknowledges the in-flight write but preserves the next durable operation',async()=>{
 const env=environment(),f=fixture(),started=deferred<void>(),reply=deferred<number>();let calls=0;
 const first=f.operation(),second=f.operation();f.entries.set(first.id,first);f.entries.set(second.id,second);
 const session=new DocumentSession(context(()=>{calls++;started.resolve();return reply.promise;}),f.journal);
 try{
  await session.load('doc');const drain=session.drain();await started.promise;
  const close=session.close();assert.equal(env.held(),1);reply.resolve(2);await drain;await close;await Promise.resolve();
  assert.equal(calls,1);assert.equal(f.entries.has(first.id),false);assert.equal(f.entries.has(second.id),true);assert.equal(env.held(),0);
  await assert.rejects(session.enqueueTask(f.operation().task!),/已关闭/);
 }finally{reply.resolve(2);await session.close();env.restore();}
});
test('failed local drafts retain ownership until a close retry persists them',async()=>{
 const env=environment(),f=fixture(),session=new DocumentSession(context(async()=>2),f.journal);
 try{
  await session.load('doc');f.fail(true);const operation=f.operation();await assert.rejects(session.enqueueTask(operation.task!),/disk failed/);
  await assert.rejects(session.whenLocallySaved(),/本机保存失败/);
  await assert.rejects(session.close(),/disk failed/);assert.equal(env.held(),1);
  const list=f.journal.list;f.journal.list=async()=>{throw Error('read failed');};
  const exported=JSON.parse(await session.exportDraft());assert.equal(exported.operations.length,1);assert.equal(exported.operations[0].id,operation.id);assert.equal(exported.localReadError,'read failed');f.journal.list=list;
  f.fail(false);await session.close();await Promise.resolve();assert.equal(env.held(),0);assert.equal(f.entries.has(operation.id),true);
 }finally{f.fail(false);await session.close();env.restore();}
});

test('retaining a registered operation retries storage without duplicating queue entries',async()=>{
 const env=environment(),f=fixture(),session=new DocumentSession(context(async()=>2),f.journal);
 try{
  await session.load('doc');f.fail(true);const operation=f.operation();
  await assert.rejects(session.enqueueTask(operation.task!),/disk/);
  await assert.rejects(session.retainOperation(operation.id),/disk/);
  f.fail(false);assert.equal(await session.retainOperation(operation.id),true);
  assert.equal(await session.retainOperation(operation.id),true);
  assert.equal(session.count,1);assert.equal(f.entries.size,1);
  assert.equal(await session.retainOperation('missing'),false);
 }finally{f.fail(false);await session.close();env.restore();}
});

test('failed preparation becomes recovery without blocking the next save',async()=>{
 const env=environment(),f=fixture();let submitted=0;const session=new DocumentSession(context(async()=>{submitted++;return 2;}),f.journal);
 try{
  await session.load('doc');const operation=f.operation();await session.stageText(operation.task!);await session.retainPreparation(operation.task!,Error('prepare offline'));
  assert.equal(session.count,0);const recovered=await session.recoveries();assert.equal(recovered.length,1);assert.deepEqual(recovered[0].task?.request,operation.task!.request);assert.equal(recovered[0].staged,undefined);
  await session.enqueueTask(f.operation().task!);await session.barrier();assert.equal(submitted,1);assert.equal((await session.recoveries()).length,1);
 }finally{await session.close();env.restore();}
});
test('failed recovery writes survive close and keep the original transaction identity',async()=>{
 const env=environment(),f=fixture(),session=new DocumentSession(context(async()=>2),f.journal);
 try{
  await session.load('doc');const operation=f.operation();await session.stageText(operation.task!);f.fail(true);await assert.rejects(session.retainPreparation(operation.task!,Error('prepare offline')),/disk failed/);await assert.rejects(session.close(),/disk failed/);
  f.fail(false);await session.close();const saved=f.entries.get(operation.id)!;assert.equal(saved.state,'recovery');assert.equal(saved.task?.request.mutationId,operation.id);assert.deepEqual(saved.task?.request,operation.task!.request);
 }finally{f.fail(false);await session.close();env.restore();}
});
test('retrying a recovery write updates retained status and removes its staged queue entry',async()=>{
 const env=environment(),f=fixture(),session=new DocumentSession(context(async()=>2),f.journal);
 try{
  await session.load('doc');const operation=f.operation();await session.stageText(operation.task!);f.fail(true);await assert.rejects(session.retainPreparation(operation.task!,Error('prepare offline')),/disk failed/);f.fail(false);await session.retry();assert.equal(session.count,0);assert.match(session.status,/恢复草稿/);
 }finally{f.fail(false);await session.close();env.restore();}
});

 test('local save boundary waits for storage but not server acknowledgement',async()=>{
  const env=environment(),f=fixture(),disk=deferred<void>(),network=deferred<number>();let stored=false,remoteDone=false;
  const put=f.journal.put.bind(f.journal);f.journal.put=async entry=>{await disk.promise;await put(entry);stored=true;};
  const session=new DocumentSession(context(async()=>{const version=await network.promise;remoteDone=true;return version;}),f.journal);
  try{
   await session.load('doc');const queued=session.enqueueTask(f.operation().task!);let localDone=false;
   const local=session.whenLocallySaved().then(()=>{localDone=true;});await Promise.resolve();assert.equal(localDone,false);
   disk.resolve();await queued;await local;assert.equal(stored,true);assert.equal(remoteDone,false);
   network.resolve(2);await session.barrier();
  }finally{disk.resolve();network.resolve(2);await session.close();env.restore();}
 });
