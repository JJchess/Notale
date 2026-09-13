import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replacementCommands,type FindResult} from '../src/state/find-replace';
test('replacement treats query and dollar text literally and rejects stale pages',()=>{
 const result:FindResult={documentId:'doc',query:'a.b',sensitive:false,pages:{page:'original'},hits:[{slideId:'page',slideName:'Page',target:'text',text:'a.b A.B axb'}]};const doc={id:'doc',slides:[{id:'page',html:'original'}]};
 assert.equal((replacementCommands(doc as any,result,'$& $1')[0] as any).patch.text,'$& $1 $& $1 axb');
 doc.slides[0].html='changed';assert.throws(()=>replacementCommands(doc as any,result,'next'),/页面已变化/);
 assert.throws(()=>replacementCommands({...doc,id:'other'} as any,result,'next'),/讲义已切换/);
});
