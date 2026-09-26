import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindNotesEditor,notesState,notesActions} from '../src/state/notes-editor';
test('notes retain per-page drafts, reject remote conflicts and save only the captured page',async()=>{
 let pageId='a',listener=()=>{},writes=0;
 let snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{writes++;const command:any=commands[0];snapshot.document.slides.find((page:any)=>page.id===command.slideId).notes=command.patch.notes;listener();},present:async()=>{}});
 notesActions.edit(notesState.getSnapshot()!,'Local A');pageId='b';listener();assert.equal(notesState.getSnapshot()?.value,'B');notesActions.edit(notesState.getSnapshot()!,'Local B');
 pageId='a';listener();assert.equal(notesState.getSnapshot()?.value,'Local A');
 snapshot.document.slides[0].notes='Remote A';listener();await notesActions.save(notesState.getSnapshot()!);assert.equal(writes,0);assert.equal(notesState.getSnapshot()?.conflict,'Remote A');
 await notesActions.resolve(notesState.getSnapshot()!,false);assert.equal(notesState.getSnapshot()?.value,'Remote A');assert.equal(notesState.getSnapshot()?.dirty,false);
 pageId='b';listener();assert.equal(notesState.getSnapshot()?.value,'Local B');await notesActions.save(notesState.getSnapshot()!);assert.equal(writes,1);assert.equal(snapshot.document.slides[1].notes,'Local B');assert.equal(snapshot.document.slides[0].notes,'Remote A');
 const old=notesState.getSnapshot()!;pageId='a';listener();await assert.rejects(notesActions.save(old),/页面已切换/);editor.dispose();assert.equal(notesState.getSnapshot(),undefined);
});
test('notes typed during an accepted save retain their value with the new baseline',async()=>{
 let release!:()=>void,listener=()=>{};
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'page',notes:'before'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=> 'page',subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{await new Promise<void>(resolve=>{release=resolve;});snapshot.document.slides[0].notes=(commands[0] as any).patch.notes;listener();},present:async()=>{}});
 notesActions.edit(notesState.getSnapshot()!,'first');const saving=notesActions.save(notesState.getSnapshot()!);notesActions.edit(notesState.getSnapshot()!,'second');release();await saving;
 assert.equal(notesState.getSnapshot()?.value,'second');assert.equal(notesState.getSnapshot()?.baseline,'first');assert.equal(notesState.getSnapshot()?.dirty,true);editor.dispose();
});

test('restoring saved notes clears the draft, but returning to an in-flight baseline stays dirty',async()=>{
 let release!:()=>void,listener=()=>{},pageId='a';
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{await new Promise<void>(resolve=>{release=resolve;});snapshot.document.slides[0].notes=(commands[0] as any).patch.notes;listener();},present:async()=>{}});
 try {
  notesActions.edit(notesState.getSnapshot()!,'changed');
  notesActions.edit(notesState.getSnapshot()!,'A');
  assert.equal(notesState.getSnapshot()?.dirty,false);
  pageId='b';listener();snapshot.document.slides[0].notes='Remote';pageId='a';listener();
  assert.equal(notesState.getSnapshot()?.value,'Remote');
  notesActions.edit(notesState.getSnapshot()!,'submitted');
  const saving=notesActions.save(notesState.getSnapshot()!);
  notesActions.edit(notesState.getSnapshot()!,'Remote');
  assert.equal(notesState.getSnapshot()?.dirty,true);
  release();await saving;
  assert.equal(notesState.getSnapshot()?.value,'Remote');
  assert.equal(notesState.getSnapshot()?.baseline,'submitted');
  assert.equal(notesState.getSnapshot()?.dirty,true);
 } finally {editor.dispose();}
});

test('presentation flush saves all page drafts together and retains input typed during the flush',async()=>{
 let pageId='a',listener=()=>{},release!:()=>void;
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const batches:any[][]=[];
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{batches.push(commands);await new Promise<void>(resolve=>{release=resolve;});for(const command of commands as any[])snapshot.document.slides.find((page:any)=>page.id===command.slideId).notes=command.patch.notes;listener();},present:async()=>{}});
 try{
  notesActions.edit(notesState.getSnapshot()!,'Draft A');pageId='b';listener();notesActions.edit(notesState.getSnapshot()!,'Draft B');
  const pending=editor.flush();assert.equal(batches.length,1);assert.equal(batches[0].length,2);
  pageId='a';listener();notesActions.edit(notesState.getSnapshot()!,'A');assert.equal(notesState.getSnapshot()?.dirty,true);
  pageId='b';listener();notesActions.edit(notesState.getSnapshot()!,'New B');release();await assert.rejects(pending,/备注输入已变化/);
  assert.equal(snapshot.document.slides[0].notes,'Draft A');assert.equal(snapshot.document.slides[1].notes,'Draft B');
  assert.equal(notesState.getSnapshot()?.value,'New B');assert.equal(notesState.getSnapshot()?.baseline,'Draft B');assert.equal(notesState.getSnapshot()?.dirty,true);
  const retry=editor.flush();release();await retry;assert.equal(snapshot.document.slides[1].notes,'New B');assert.equal(notesState.getSnapshot()?.dirty,false);
  pageId='a';listener();assert.equal(notesState.getSnapshot()?.dirty,false);assert.equal(snapshot.document.slides[0].notes,'A');
 }finally{editor.dispose();}
});

test('presentation flush checks every draft before writing and retains conflicts and failures',async()=>{
 let pageId='a',listener=()=>{},writes=0,fail=false;
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async()=>{writes++;if(fail)throw Error('offline');},present:async()=>{}});
 try{
  notesActions.edit(notesState.getSnapshot()!,'Draft A');pageId='b';listener();notesActions.edit(notesState.getSnapshot()!,'Draft B');
  snapshot.document.slides[0].notes='Remote A';
  await assert.rejects(editor.flush(),/第 1 页备注存在冲突/);assert.equal(writes,0);
  snapshot.document.slides[0].notes='A';fail=true;
  await assert.rejects(editor.flush(),/offline/);assert.equal(notesState.getSnapshot()?.value,'Draft B');assert.equal(notesState.getSnapshot()?.busy,false);
  pageId='a';listener();assert.equal(notesState.getSnapshot()?.value,'Draft A');assert.equal(notesState.getSnapshot()?.dirty,true);
 }finally{editor.dispose();}
});

test('copy reads the captured page draft without saving or consuming it',()=>{
 let pageId='a',listener=()=>{};
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async()=>{throw Error('must not save');},present:async()=>{}});
 notesActions.edit(notesState.getSnapshot()!,'Draft A');
 assert.equal(editor.value('a'),'Draft A');assert.equal(notesState.getSnapshot()?.dirty,true);
 pageId='b';listener();assert.equal(editor.value('a'),'Draft A');assert.equal(editor.value('b'),'B');assert.equal(snapshot.document.slides[0].notes,'A');
 assert.throws(()=>editor.value('missing'),/页面已不存在/);editor.dispose();assert.throws(()=>editor.value('a'),/会话已关闭/);
});

test('idle autosave batches page drafts, pauses for composition, and cancels on disposal',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let pageId='a',listener=()=>{},writes=0,canvasEditing=true;
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'},{id:'b',notes:'B'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=>pageId,subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{writes++;for(const c of commands as any[])snapshot.document.slides.find((p:any)=>p.id===c.slideId).notes=c.patch.notes;listener();},present:async()=>{},canAutosave:()=>!canvasEditing});
 try{
  notesActions.edit(notesState.getSnapshot()!,'Draft A');pageId='b';listener();
  notesActions.composing(notesState.getSnapshot()!,true);notesActions.edit(notesState.getSnapshot()!,'Draft B');
  t.mock.timers.tick(1000);await Promise.resolve();assert.equal(writes,0);
  notesActions.composing(notesState.getSnapshot()!,false);t.mock.timers.tick(650);assert.equal(writes,0);canvasEditing=false;t.mock.timers.tick(650);await Promise.resolve();await Promise.resolve();
  assert.equal(writes,1);assert.deepEqual(snapshot.document.slides.map((p:any)=>p.notes),['Draft A','Draft B']);assert.equal(notesState.getSnapshot()?.dirty,false);
  notesActions.edit(notesState.getSnapshot()!,'Not submitted');editor.dispose();t.mock.timers.tick(1000);assert.equal(writes,1);
 }finally{editor.dispose();}
});

test('autosave retains newer input and stops retrying failed writes until an edit',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let listener=()=>{},release!:()=>void,writes=0,fail=false;
 const snapshot:any={document:{id:crypto.randomUUID(),slides:[{id:'a',notes:'A'}]}};
 const editor=bindNotesEditor({snapshot:()=>snapshot,pageId:()=> 'a',subscribe:fn=>{listener=fn;return()=>{};},commands:async commands=>{writes++;if(fail)throw Error('offline');await new Promise<void>(resolve=>{release=resolve;});snapshot.document.slides[0].notes=(commands[0] as any).patch.notes;listener();},present:async()=>{}});
 const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 try{
  notesActions.edit(notesState.getSnapshot()!,'First');t.mock.timers.tick(650);notesActions.edit(notesState.getSnapshot()!,'Second');release();await settle();
  assert.equal(notesState.getSnapshot()?.value,'Second');assert.equal(notesState.getSnapshot()?.dirty,true);
  t.mock.timers.tick(650);release();await settle();assert.equal(snapshot.document.slides[0].notes,'Second');assert.equal(notesState.getSnapshot()?.dirty,false);
  fail=true;notesActions.edit(notesState.getSnapshot()!,'Offline draft');t.mock.timers.tick(650);await settle();assert.equal(notesState.getSnapshot()?.error,'offline');const failedWrites=writes;
  t.mock.timers.tick(10000);await settle();assert.equal(writes,failedWrites);assert.equal(notesState.getSnapshot()?.value,'Offline draft');
 }finally{editor.dispose();}
});
