import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DraftWrites} from '../src/state/draft-writes';
import type {Pending} from '../src/pending-journal';
test('retention retries the newest failed snapshot without replaying successful writes',async()=>{
 let fail=true;const saved:Pending[]=[];
 const writes=new DraftWrites(async task=>{if(fail)throw Error('disk');saved.push(task);});
 const task=(id:string,text:string)=>({documentId:'doc',request:{mutationId:id,baseVersion:1,commands:[{type:'element.content',slideId:'page',target:'text',html:text}]}} as Pending);
 await assert.rejects(writes.stage(task('a','old')));
 const latest=task('a','latest');const pending=writes.stage(latest);((latest.request as {commands:any[]}).commands[0]).html='mutated';await assert.rejects(pending);
 fail=false;await writes.stage(task('b','other'));await writes.retain();await writes.retain();
 assert.equal(saved.length,2);assert.equal(((saved[1].request as {commands:any[]}).commands[0]).html,'latest');
});
