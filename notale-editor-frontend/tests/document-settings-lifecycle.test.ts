import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindDocumentSettings} from '../src/state/document-settings';
import {editorActions} from '../src/state/editor-session';
test('closing settings during history loading rejects the stale response',async()=>{
 let resolve!:(rows:any[])=>void;const history=new Promise<any[]>(done=>{resolve=done;});const controller=new AbortController();
 const binding=bindDocumentSettings({signal:controller.signal,document:()=>({id:'doc'} as any),commands:async()=>{},history:()=>history,restore:async()=>{},flush:async()=>{}});
 const captured=editorActions.loadHistory;const pending=captured('doc');controller.abort();resolve([]);
 await assert.rejects(pending,/已关闭/);assert.throws(()=>captured('doc'),/已关闭/);binding.dispose();
});
test('closing settings while flushing prevents history restoration',async()=>{
 let release!:()=>void;const flushed=new Promise<void>(done=>{release=done;});let restored=false;
 const binding=bindDocumentSettings({document:()=>({id:'doc'} as any),commands:async()=>{},history:async()=>[],restore:async()=>{restored=true;},flush:()=>flushed});
 const pending=editorActions.restoreHistory('doc',1);binding.dispose();release();await assert.rejects(pending,/已关闭/);assert.equal(restored,false);
});
