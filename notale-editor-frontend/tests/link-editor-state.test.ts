import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedLink,validateLink,linkAttributes,bindLinkEditor,linkActions,linkEditorState,type LinkObject} from '../src/state/link-editor';
test('link lookup terminates parent cycles and validates both selection and href',()=>{
 const objects:LinkObject[]=[{id:'a',tag:'a',attributes:{href:'https://example.com'},locked:false},{id:'text',parent:'a',tag:'span',attributes:{},locked:false}];const source={documentId:'doc',pageId:'page',target:'a',href:'https://example.com',selected:['text']};
 assert.equal(selectedLink(objects,['text'])?.id,'a');validateLink(source,{id:'doc'} as any,{id:'page'} as any,objects,['text']);objects[0].attributes.href='https://other.example';assert.throws(()=>validateLink(source,{id:'doc'} as any,{id:'page'} as any,objects,['text']),/链接已变化/);
 assert.equal(selectedLink([{id:'loop',tag:'span',parent:'loop',attributes:{},locked:false}],['loop']),undefined);
 assert.equal(linkAttributes({slides:[{id:'next',sourcePath:'中文/页.html'}]} as any,{sourcePath:'chapter/first.html'} as any,{kind:'page',pageId:'next',url:''}).href,'../%E4%B8%AD%E6%96%87/%E9%A1%B5.html');
 assert.throws(()=>linkAttributes({} as any,{} as any,{kind:'url',pageId:'',url:'javascript:alert(1)'}),/请输入/);
});

test('replaced link controllers cannot save or remove through the old editor',async()=>{
 let finish!:()=>void;
 const page={id:'page',name:'Page',sourcePath:'page.html'};
 const anchor:LinkObject={id:'a',tag:'a',attributes:{href:'https://example.com'},locked:false};
 const context={document:()=>({id:'doc',slides:[page]} as any),slide:()=>page as any,objects:()=>[anchor],selected:()=>['a'],commands:()=>new Promise<void>(resolve=>{finish=resolve;})};
 const old=bindLinkEditor(context);old.render();
 const oldSave=linkActions.save,oldRemove=linkActions.remove;
 const saving=oldSave(linkEditorState.getSnapshot()!,JSON.stringify({kind:'url',pageId:'',url:'https://example.org'}));
 const current=bindLinkEditor(context);current.render();
 const source=linkEditorState.getSnapshot();assert.ok(source);
 old.dispose();assert.equal(linkEditorState.getSnapshot(),source);
 finish();await saving;assert.equal(linkEditorState.getSnapshot(),source,'the superseded controller could not act even though its promise resolved');
 await assert.rejects(oldSave(source!,'{}'),/编辑器已关闭/);
 await assert.rejects(oldRemove(source!),/编辑器已关闭/);
 current.dispose();assert.equal(linkEditorState.getSnapshot(),undefined);
});
