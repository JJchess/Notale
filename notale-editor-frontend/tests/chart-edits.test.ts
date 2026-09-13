import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChartEdits,type ChartEdit} from '../src/state/chart-edits';
test('queued chart edits capture identity and models, retaining failed writes across sealing',async()=>{
 let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),seen:ChartEdit[]=[];
 const edits=new ChartEdits(async edit=>{seen.push(edit);if(seen.length===1){started();await gate;}else throw Error('document changed');});
 const source={documentId:'original',slideId:'page',target:'chart',before:{appearance:{title:'before'}} as any,after:{appearance:{title:'after'}} as any};
 const first=edits.enqueue(source);source.after.appearance.title='mutated';source.documentId='other';const second=edits.enqueue(source);const failed=assert.rejects(second,/document changed/);
 await entered;assert.equal(seen.length,1);release();await first;await failed;
 assert.equal(seen[0].documentId,'original');assert.equal(seen[0].after.appearance.title,'after');assert.equal(seen[1].documentId,'other');assert.equal(edits.pending().length,1);
 await assert.rejects(edits.seal(),/document changed/);await assert.rejects(edits.enqueue(source),/已关闭/);assert.equal(edits.pending()[0].id,seen[1].id);
 const exported=edits.pending();exported[0].after.appearance.title='external change';assert.equal(edits.pending()[0].after.appearance.title,'mutated');
});

test('chart sealing retries the original mutation once and retains failures for another attempt',async()=>{
 let fail=true;const ids:string[]=[];
 const edits=new ChartEdits(async edit=>{ids.push(edit.id);if(fail)throw Error('disk');});
 await assert.rejects(edits.enqueue({documentId:'doc',slideId:'page',target:'chart',before:{} as any,after:{} as any}));
 await assert.rejects(edits.seal(),/disk/);fail=false;
 const pending=edits.seal();assert.equal(edits.seal(),pending);await pending;await edits.seal();
 assert.equal(new Set(ids).size,1);assert.equal(ids.length,3);assert.equal(edits.pending().length,0);
});
