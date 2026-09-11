import {test,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {Store} from '../src/server/store.js';import {documentSchema,slideSchema,commitSchema} from '../src/domain/model.js';import {importHtml,inspectSlide} from '../src/domain/html.js';import {applyCommands} from '../src/domain/commands.js';import {mergeDocuments} from '../src/domain/sync-merge.js';
const fixture=()=>documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'Sync fixture',slides:[slideSchema.parse({id:randomUUID(),sourcePath:'page.html',...importHtml('<html><body><main id="stage"><h1 style="color:red">Title</h1><p>Keep</p></main></body></html>')})]});
const target=(d:any)=>inspectSlide(d.slides[0]).find((o:any)=>o.tag==='h1')!.id;
const patch=(d:any,style:any)=>({type:'element.patch' as const,slideId:d.slides[0].id,target:target(d),patch:{style}});
test('property merge and compensation preserve unrelated changes',()=>{const base=fixture(),local=applyCommands(base,[patch(base,{color:'blue'})]),remote=applyCommands(base,[patch(base,{'font-size':'44px'})]);const merged=mergeDocuments(base,local,remote);const obj=inspectSlide(merged.slides[0]).find(o=>o.id===target(base))!;assert.equal(obj.style.color,'blue');assert.equal(obj.style['font-size'],'44px');const undo=mergeDocuments(local,base,merged);assert.equal(inspectSlide(undo.slides[0]).find(o=>o.id===target(base))!.style['font-size'],'44px');assert.equal(inspectSlide(undo.slides[0]).find(o=>o.id===target(base))!.style.color,'red');});
test('undo newly added style preserves later properties',()=>{const b=fixture();b.slides[0].html=b.slides[0].html.replace(' style="color:red"','');const a=applyCommands(b,[patch(b,{color:'blue'})]),h=applyCommands(a,[patch(a,{'font-size':'46px'})]);const result=mergeDocuments(a,b,h),o=inspectSlide(result.slides[0]).find(o=>o.id===target(b))!;assert.equal(o.style['font-size'],'46px');assert.equal(o.style.color,undefined);});
test('same property uses latest write; deleted objects require recovery',()=>{const b=fixture(),a=applyCommands(b,[patch(b,{color:'blue'})]),h=applyCommands(b,[patch(b,{color:'green'})]);assert.equal(inspectSlide(mergeDocuments(b,a,h).slides[0]).find(o=>o.id===target(b))!.style.color,'blue');const deleted=applyCommands(b,[{type:'element.delete',slideId:b.slides[0].id,target:target(b)}]);assert.throws(()=>mergeDocuments(b,a,deleted),/删除/);});
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL??'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor'}),store=new Store(pool),ctx={scope:'sync-test-'+randomUUID(),actor:'author'};
after(async()=>{for(const table of ['editor_mutations','editor_revision_assets','editor_revisions'])await pool.query(`DELETE FROM ${table} WHERE document_id IN (SELECT id FROM editor_documents WHERE scope=$1)`,[ctx.scope]);await pool.query('DELETE FROM editor_documents WHERE scope=$1',[ctx.scope]);await pool.end();});
test('Postgres sync: concurrent bases, exact replay after newer head, inverse transaction and legacy CAS',async()=>{await store.migrate();const base=await store.create(ctx,fixture()),doc=base.document;const request=(commands:any[],baseVersion=1)=>commands.length?commitSchema.parse({baseVersion,mutationId:randomUUID(),commands}):{baseVersion,mutationId:randomUUID(),commands};const first=request([patch(doc,{color:'blue'})]);const a=await store.sync(ctx,doc.id,first);const second=await store.sync(ctx,doc.id,request([patch(doc,{'font-size':'44px'})]));assert.equal(second.version,3);assert.equal((await store.sync(ctx,doc.id,first)).version,a.version);assert.equal((await store.get(ctx,doc.id)).version,3);const undo=await store.sync(ctx,doc.id,{...request([],3),inverseVersion:2});const h=inspectSlide(undo.document.slides[0]).find(o=>o.id===target(doc))!;assert.equal(h.style.color,'red');assert.equal(h.style['font-size'],'44px');await assert.rejects(store.commit(ctx,doc.id,request([patch(doc,{color:'yellow'})])),(e:any)=>e.code==='VERSION_CONFLICT');await assert.rejects(store.sync(ctx,doc.id,{...first,commands:[patch(doc,{color:'black'})]}),(e:any)=>e.code==='IDEMPOTENCY_MISMATCH');});

test('geometry returning to its original value still wins over an intervening move',async()=>{const d=fixture(),id=target(d),slideId=d.slides[0].id;const transform=(x:number)=>({type:'element.transform' as const,slideId,target:id,transform:{x:0,y:0,rotate:0,scaleX:1,scaleY:1,matrix:[1,0,0,1,x,0]}});const first=await store.create(ctx,applyCommands(d,[transform(0)]));await store.sync(ctx,d.id,{baseVersion:1,mutationId:randomUUID(),commands:[transform(40)],geometry:true});const last=await store.sync(ctx,d.id,{baseVersion:1,mutationId:randomUUID(),commands:[transform(0)],geometry:true});assert.equal(last.document.slides[0].transforms[id].matrix![4],0);assert.equal(first.version,1);});

const move=(d:ReturnType<typeof fixture>)=>applyCommands(d,[{type:'element.transform',slideId:d.slides[0].id,target:target(d),transform:{x:30,y:20,rotate:0,scaleX:1,scaleY:1}}]);
const duplicate=(d:ReturnType<typeof fixture>)=>applyCommands(d,commitSchema.parse({baseVersion:1,mutationId:randomUUID(),commands:[{type:'elements.transfer',slideId:d.slides[0].id,sourceSlideId:d.slides[0].id,targets:[target(d)],mode:'copy'}]}).commands);
test('inverse copy and delete remove empty transforms; redo preserves concurrent properties',()=>{
  const moved=move(fixture()),copied=duplicate(moved);
  const headingIds=(d:typeof moved)=>inspectSlide(d.slides[0]).filter(o=>o.tag==='h1').map(o=>o.id);
  assert.equal(headingIds(copied).length,2);
  const remote=applyCommands(copied,[patch(copied,{color:'green'})]);
  const undone=mergeDocuments(copied,moved,remote);
  assert.equal(headingIds(undone).length,1);
  assert.deepEqual(Object.keys(undone.slides[0].transforms),[target(moved)]);
  assert.doesNotThrow(()=>applyCommands(undone,[]));
  assert.equal(inspectSlide(undone.slides[0]).find(o=>o.id===target(moved))!.style.color,'green');
  const redone=mergeDocuments(undone,remote,undone);
  assert.equal(headingIds(redone).length,2);
  assert.doesNotThrow(()=>applyCommands(redone,[]));
  const deleted=applyCommands(moved,[{type:'element.delete',slideId:moved.slides[0].id,target:target(moved)}]);
  const restored=mergeDocuments(deleted,moved,deleted);
  assert.doesNotThrow(()=>applyCommands(restored,[]));
  const reDeleted=mergeDocuments(restored,deleted,restored);
  assert.deepEqual(reDeleted.slides[0].transforms,{});
  assert.doesNotThrow(()=>applyCommands(reDeleted,[]));
});

test('Postgres inverse copy is replayable, redo/reopen retain geometry, history recovery is isolated',async()=>{
  const created=await store.create(ctx,move(fixture())),d=created.document;
  const request=(extra:object,baseVersion:number)=>({baseVersion,mutationId:randomUUID(),commands:[],...extra});
  const copy=await store.sync(ctx,d.id,commitSchema.parse(request({commands:[{type:'elements.transfer',slideId:d.slides[0].id,sourceSlideId:d.slides[0].id,targets:[target(d)],mode:'copy'}]},1)));
  const inverse=request({inverseVersion:copy.version},copy.version);
  const undone=await store.sync(ctx,d.id,inverse);
  const redone=await store.sync(ctx,d.id,request({inverseVersion:undone.version},undone.version));
  assert.equal((await store.sync(ctx,d.id,inverse)).version,undone.version);
  const reopened=await store.get(ctx,d.id);
  assert.deepEqual(reopened,redone);
  assert.equal(inspectSlide(reopened.document.slides[0]).filter(o=>o.tag==='h1').length,2);
  const recovery=await store.recoverSync(ctx,d.id,request({inverseVersion:copy.version},redone.version));
  assert.notEqual(recovery.document.id,d.id);
  assert.equal(inspectSlide(recovery.document.slides[0]).filter(o=>o.tag==='h1').length,1);
  const historical=await store.recoverSync(ctx,d.id,request({restoreVersion:copy.version},redone.version));
  assert.deepEqual(historical.document.slides,copy.document.slides);
  assert.equal((await store.get(ctx,d.id)).version,redone.version);
});

test('concurrent dangling references preserve the head and recover the rejected operation',async()=>{
  const original=await store.create(ctx,move(fixture())),d=original.document;
  // A group reference is a concurrent relationship; deletion at the old base
  // must not commit a document containing a dangling member.
  const grouped=structuredClone(d);grouped.slides[0].groups=[{id:randomUUID(),name:'Concurrent group',members:[target(d),inspectSlide(d.slides[0]).find(o=>o.tag==='p')!.id]}];
  const remove=commitSchema.parse({baseVersion:1,mutationId:randomUUID(),commands:[{type:'element.delete',slideId:d.slides[0].id,target:target(d)}]});
  // Establish the concurrent group through the real command protocol.
  const groupCommand=commitSchema.parse({baseVersion:1,mutationId:randomUUID(),commands:[{type:'group.set',slideId:d.slides[0].id,...grouped.slides[0].groups[0]}]});
  await store.sync(ctx,d.id,groupCommand);
  await assert.rejects(store.sync(ctx,d.id,remove),(e:any)=>e.code==='SYNC_RECOVERY_REQUIRED');
  assert.equal((await store.get(ctx,d.id)).version,2);
  const recovery=await store.recoverSync(ctx,d.id,remove);
  assert.notEqual(recovery.document.id,d.id);
  assert.equal(inspectSlide(recovery.document.slides[0]).filter(o=>o.tag==='h1').length,0);
});
