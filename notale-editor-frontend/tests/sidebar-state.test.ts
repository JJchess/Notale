import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorSession} from '../src/state/editor-session';
import {sidebar} from '../src/state/sidebar';
import {initialSidebar} from '../src/state/sidebar-state';
test('sidebar transitions preserve mutual exclusion, notes and focus restoration',()=>{
 editorSession.update({sidebar:initialSidebar});sidebar.toggle('notes');sidebar.openPages();
 assert.equal(editorSession.getSnapshot().sidebar.pages,true);
 sidebar.tool('style');let state=editorSession.getSnapshot().sidebar;assert.equal(state.pages,false);assert.equal(state.inspector,true);assert.equal(state.tab,'format');assert.equal(state.notes,true);
 sidebar.tool('insert');state=editorSession.getSnapshot().sidebar;assert.equal(state.inspector,false);assert.equal(state.tool,'insert');
 sidebar.inspect('animation');sidebar.focus();assert.equal(editorSession.getSnapshot().sidebar.notes,false);sidebar.focus();state=editorSession.getSnapshot().sidebar;assert.equal(state.inspector,true);assert.equal(state.notes,true);assert.equal(state.tab,'animation');
 sidebar.tool('animation');assert.equal(editorSession.getSnapshot().sidebar.inspector,false);
});
test('restored preferences reject invalid values and do not open competing panels',()=>{
 editorSession.update({sidebar:initialSidebar});sidebar.restore({pages:true,inspector:true,notes:'yes'});const state=editorSession.getSnapshot().sidebar;assert.equal(state.pages,false);assert.equal(state.inspector,true);assert.equal(state.notes,false);
});
test('object selection preserves the current task and restores the last collapsed inspector',()=>{
 editorSession.update({sidebar:initialSidebar});sidebar.onObjectSelection();assert.equal(editorSession.getSnapshot().sidebar.tab,'format');
 for(const tool of ['animation','objects','style','insert','templates','pages']){
  sidebar.tool(tool);const before=editorSession.getSnapshot().sidebar;sidebar.onObjectSelection();assert.equal(editorSession.getSnapshot().sidebar,before,tool);
 }
 sidebar.inspect('animation');sidebar.closeInspector();sidebar.onObjectSelection();assert.equal(editorSession.getSnapshot().sidebar.tab,'animation');assert.equal(editorSession.getSnapshot().sidebar.inspector,true);
 sidebar.focus();const focused=editorSession.getSnapshot().sidebar;sidebar.onObjectSelection();assert.equal(editorSession.getSnapshot().sidebar,focused);
 sidebar.inspect('format');assert.equal(editorSession.getSnapshot().sidebar.tab,'format');
});
