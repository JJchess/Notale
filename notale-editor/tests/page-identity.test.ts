import {test} from 'node:test';import assert from 'node:assert/strict';
import {runtimeIdentity} from '../src/domain/page-identity.js';import {documentSchema} from '../src/domain/model.js';
test('runtime identity ignores appearance and unrelated saves but includes iframe sources',()=>{
 const doc=documentSchema.parse({schemaVersion:1,id:'identity',title:'Identity',slides:[{id:'a',name:'A',sourcePath:'page.html',html:'<iframe src="https://example.com/a"></iframe>'}]});
 const slide=doc.slides[0],before=runtimeIdentity(doc,slide);assert.equal(runtimeIdentity({...doc,theme:{color:'red'}}, {...slide,theme:{color:'blue'}}),before);assert.notEqual(runtimeIdentity(doc,{...slide,html:'<iframe src="https://example.com/b"></iframe>'}),before);
});
