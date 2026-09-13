import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindDocumentIO,documentIOState} from '../src/state/document-io';
test('imports finish without taking over a switched document and retired actions cannot run',async()=>{
 let current='one',resolve!:(result:{id:string})=>void;const opened:string[]=[];
 const binding=bindDocumentIO({documentId:()=>current,importFile:()=>new Promise(done=>{resolve=done;}),open:async id=>{opened.push(id);},exportFile:async()=>{},notice:()=>{}});
 const task=documentIOState.getSnapshot().importFile!({} as File,'project');current='two';resolve({id:'imported'});await task;assert.deepEqual([...opened],[]);assert.equal(documentIOState.getSnapshot().result,'imported');await documentIOState.getSnapshot().openResult!();assert.deepEqual([...opened],['imported']);
 const stale=documentIOState.getSnapshot().importFile!;binding.dispose();await stale({} as File,'project');assert.equal(documentIOState.getSnapshot().available,false);
});
