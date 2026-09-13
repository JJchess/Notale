import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession,EditorSessionChannel} from '../src/state/editor-session';
test('React subscription follows the attached session without copying its state',()=>{
 const channel=new EditorSessionChannel(),first=new EditorSession(),second=new EditorSession();const read=channel.view.getSnapshot;let updates=0;const unsubscribe=channel.view.subscribe(()=>updates++);
 const closeFirst=channel.attach(first);first.update({pageQuery:'first'});assert.equal(read(),first.getSnapshot());const oldUpdate=channel.view.update;
 const closeSecond=channel.attach(second);const before=updates;first.update({pageQuery:'late save'});oldUpdate({pageQuery:'captured old action'});assert.equal(updates,before);assert.equal(first.getSnapshot().pageQuery,'captured old action');assert.equal(read(),second.getSnapshot());
 closeFirst();assert.equal(read(),second.getSnapshot());channel.view.update({pageQuery:'second'});assert.equal(second.getSnapshot().pageQuery,'second');closeSecond();assert.equal(read().pageQuery,'');unsubscribe();
});
test('detaching leaves the old session available for shutdown without notifying the UI',()=>{
 const channel=new EditorSessionChannel(),session=new EditorSession();const close=channel.attach(session);session.update({pageQuery:'draft'});close();let changes=0;const unsubscribe=channel.view.subscribe(()=>changes++);session.update({busy:true});assert.equal(changes,0);assert.equal(session.getSnapshot().pageQuery,'draft');assert.equal(channel.view.getSnapshot().busy,false);unsubscribe();
});
