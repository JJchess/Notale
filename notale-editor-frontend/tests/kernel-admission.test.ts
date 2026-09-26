import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorKernel} from '../src/editor-kernel';
import type {Pending} from '../src/pending-journal';
function fixture(retain:(task:Pending)=>Promise<void>){const queue:Pending[]=[];const kernel=new EditorKernel({operations:()=>queue,owner:()=> 'owner',stage:async()=>{},finalize:async()=>{},enqueue:async task=>{queue.push(task);},retainPreparation:retain,cancel:async()=>true,prepare:async()=>{throw Error('unexpected preparation');},barrier:async()=>{},changed:()=>{},preview:()=>{},error:()=>{}});kernel.load({version:1,document:{id:'doc',schemaVersion:1,title:'Before',width:1600,height:900,slides:[]}} as any);return {kernel,queue};}
test('shutdown owns commands admitted before any prerequisite starts',async()=>{
 const retained:Pending[]=[];const {kernel,queue}=fixture(async task=>{retained.push(task);});let prepared=false;const command={type:'deck.update' as const,title:'Accepted'};
 const accepted=kernel.executeAfter([command],async()=>{prepared=true;});command.title='Mutated';const closing=kernel.seal();await assert.rejects(accepted,/恢复草稿/);await closing;assert.equal(prepared,false);assert.equal(queue.length,0);assert.equal(retained.length,1);const request=retained[0].request;assert.ok('commands' in request);assert.equal((request.commands[0] as {title:string}).title,'Accepted');
});
test('failed prerequisite retention remains retryable with the same mutation identity',async()=>{
 let fail=true;const ids:string[]=[];const {kernel}=fixture(async task=>{ids.push(task.request.mutationId);if(fail)throw Error('storage unavailable');});
 await assert.rejects(kernel.executeAfter([{type:'deck.update',title:'Keep'}],async()=>{throw Error('prerequisite failed');}),/storage unavailable/);await assert.rejects(kernel.seal(),/尚未写入/);fail=false;await kernel.seal();assert.equal(new Set(ids).size,1);assert.equal(ids.length,3);
});
test('normal admitted commands still execute after their prerequisite',async()=>{const {kernel,queue}=fixture(async()=>{throw Error('unexpected retention');});let prepared=false;await kernel.executeAfter([{type:'deck.update',title:'After'}],async()=>{prepared=true;});assert.equal(prepared,true);assert.equal(queue.length,1);assert.equal(kernel.current.document.title,'After');});
test('shutdown waits for a running prerequisite and retains its command without applying it',async()=>{
 const retained:Pending[]=[];const {kernel,queue}=fixture(async task=>{retained.push(task);});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const accepted=kernel.executeAfter([{type:'deck.update',title:'Keep during close'}],async()=>{entered();await gate;});
 await started;let closed=false;const closing=kernel.seal().then(()=>{closed=true;});
 await Promise.resolve();assert.equal(closed,false);release();
 await assert.rejects(accepted,/恢复草稿/);await closing;
 assert.equal(queue.length,0);assert.equal(retained.length,1);assert.equal(kernel.current.document.title,'Before');
});
