import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorChanges,applyAuthorChanges} from '../src/domain/author-changes.js';
import {documentSchema,type Snapshot} from '../src/domain/model.js';
const base:Snapshot={version:1,createdAt:"2026-09-13T00:00:00Z",actor:"test-author",document:documentSchema.parse({schemaVersion:1,id:'doc',title:'Order',width:1600,height:900,slides:[{id:'a',name:'A',sourcePath:'a.html',html:'<p>A</p>'},{id:'b',name:'B',sourcePath:'b.html',html:'<p>B</p>'}]})};
function jsonb(value:any):any {if(Array.isArray(value))return value.map(jsonb);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,jsonb(value[key])]));return value;}
test('persisted structural changes accept equivalent objects with different key order',()=>{
  const after={...base,version:2,document:{...base.document,slides:[...base.document.slides].reverse()}};
  const persisted=jsonb(authorChanges(base,after));
  assert.deepEqual(applyAuthorChanges(base,persisted),after);
  assert.equal(authorChanges(base,jsonb(base)).changes.length,0);
});
test('semantic equality still rejects different content and array order',()=>{
  const after={...base,version:2,document:{...base.document,slides:[...base.document.slides].reverse()}};
  const patch=jsonb(authorChanges(base,after));
  assert.throws(()=>applyAuthorChanges({...base,document:{...base.document,slides:[...base.document.slides].reverse()}},patch),/AUTHOR_BASE_MISMATCH/);
  const edited=structuredClone(base);edited.document.slides[0].name='Changed';assert.throws(()=>applyAuthorChanges(edited,patch),/AUTHOR_BASE_MISMATCH/);
});
