import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Snapshot} from '@notale/editor/browser';
import {EditorSession} from '../src/state/editor-session';
test('selection is published once and page changes atomically clear stale inspector state',()=>{
 const session=new EditorSession();let notifications=0;session.subscribe(()=>notifications++);
 session.select(['a','a','b']);const selection=session.selection;
 assert.deepEqual([...selection],['a','b']);session.select(['a','b']);assert.equal(notifications,1);assert.equal(session.selection,selection);
 session.update({canvas:'ready',textField:{key:'old',documentId:'doc',slideId:'old',target:'a',value:'draft',editable:true}});
 session.subscribe(()=>{if(session.pageId==='next'){assert.equal(session.selection.size,0);assert.equal(session.canvasReady,false);assert.equal(session.getSnapshot().textField,undefined);}});
 session.openPage('next');assert.deepEqual([...selection],['a','b']);assert.equal(session.getSnapshot().selectedIds.length,0);
});
test('a delayed catalogue response cannot replace the current authored title',()=>{
 const session=new EditorSession(),snapshot={document:{id:'doc',title:'Current title'},version:2} as Snapshot;
 session.update({document:snapshot});session.update({documents:[{id:'doc',title:'Old title'},{id:'other',title:'Other'}]});
 assert.equal(session.snapshot,snapshot);assert.equal(session.getSnapshot().documents[0].title,'Current title');assert.equal(session.getSnapshot().documents[1].title,'Other');
});

test('step bounds and nested selection scope reset when opening a different page',()=>{
 const session=new EditorSession();session.setStepRange(3,2,99);assert.equal(session.canvasStep,3);
 session.seekStep(-1);assert.equal(session.canvasStep,0);session.update({selectionScope:'nested-group'});
 session.openPage('second');assert.deepEqual(session.getSnapshot().steps,{current:0,max:0,nativeMax:0});assert.equal(session.selectionScope,undefined);
});

test('search filters persist across revisions but reset when another document opens',()=>{
 const session=new EditorSession(),snapshot={document:{id:'one',title:'One'},version:1} as Snapshot;
 session.update({document:snapshot});session.update({pageQuery:'old page',objectQuery:'old object',overview:true,overviewPage:3});
 session.update({document:{...snapshot,version:2}});assert.equal(session.getSnapshot().pageQuery,'old page');assert.equal(session.getSnapshot().objectQuery,'old object');
 session.update({document:{document:{id:'two',title:'Two'},version:1} as Snapshot});
 assert.equal(session.getSnapshot().pageQuery,'');assert.equal(session.getSnapshot().objectQuery,'');assert.equal(session.getSnapshot().overview,false);assert.equal(session.getSnapshot().overviewPage,0);
});
