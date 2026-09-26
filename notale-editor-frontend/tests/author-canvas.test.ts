import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Snapshot} from '@notale/editor/browser';
import {documentSchema} from '@notale/editor';
import type {CanvasPreview} from '../src/canvas/resources';
import {AuthorCanvasController} from '../src/canvas/author-controller';
function snapshot(id:string,html:string):Snapshot{return {version:1,createdAt:'2026-09-11T00:00:00Z',actor:'test',document:documentSchema.parse({schemaVersion:1,id,title:id,slides:[{id:'page',name:'Page',sourcePath:'page.html',html}]})};}
test('author updates use the last rendered baseline without mutating the author document',async()=>{
 let current=snapshot('doc','old');const messages:{type:string;data:any}[]=[];
 const controller=new AuthorCanvasController({send:(type,data)=>messages.push({type,data}),onDispose:()=>()=>{}},{snapshot:()=>current,confirmed:()=>current,pageId:()=> 'page',preview:async()=>{throw Error('Unexpected resource request');},painted:()=>{},refreshed:()=>{},pageRemoved:async()=>{}});
 const first=current.document.slides[0];controller.seed(current,first,'https://content.test/a/page.html');
 current=snapshot('doc','second');await controller.update(first);current=snapshot('doc','third');await controller.update(first);
 assert.deepEqual(messages.filter(m=>m.type==='author-update').map(m=>[m.data.before,m.data.after]),[['old','second'],['second','third']]);assert.equal(first.html,'old');assert.equal(current.document.slides[0].html,'third');controller.dispose();
});
test('late resources cannot change the next document, even when page IDs are reused',async()=>{
 let current=snapshot('old','old'),resolve!:(preview:CanvasPreview)=>void;const messages:string[]=[];
 const preview=new Promise<CanvasPreview>(done=>resolve=done);
 const controller=new AuthorCanvasController({send:type=>messages.push(type),onDispose:()=>()=>{}},{snapshot:()=>current,confirmed:()=>current,pageId:()=> 'page',preview:()=>preview,painted:()=>{},refreshed:()=>{},pageRemoved:async()=>{}});
 controller.seed(current,current.document.slides[0],'https://old.test/a/page.html');current={...current,document:{...current.document,assets:{image:{hash:'a'.repeat(64),mime:'image/png',size:1}}}};
 const pending=controller.update();controller.resetDocument();current=snapshot('new','new');controller.seed(current,current.document.slides[0],'https://new.test/b/page.html');
 resolve({version:1,channel:'old',expiresAt:1000,renewAfterMs:1000,slides:[{id:'page',url:'https://old.test/a/page.html'}]});await pending;
 assert.equal(controller.assetBase,'https://new.test/b/');assert.deepEqual(messages,[]);controller.dispose();
});
test('disposing an author controller is terminal even if a late caller tries to start again',async()=>{
 const current=snapshot('doc','old');let requests=0,paints=0;const messages:string[]=[];
 const controller=new AuthorCanvasController({send:type=>messages.push(type),onDispose:()=>()=>{}},{snapshot:()=>current,confirmed:()=>current,pageId:()=> 'page',preview:async()=>{requests++;throw Error('Closed controller requested resources');},painted:()=>{paints++;},refreshed:()=>{paints++;},pageRemoved:async()=>{}});
 controller.seed(current,current.document.slides[0],'https://content.test/a/page.html');controller.dispose();controller.dispose();controller.seed(current,current.document.slides[0],'https://content.test/a/page.html');controller.preview([]);await controller.update(current.document.slides[0]);await controller.refreshRuntime(current,'page');assert.equal(requests,0);assert.equal(paints,0);assert.deepEqual(messages,[]);assert.equal(controller.assetBase,'');
});
test('an older runtime refresh cannot apply after a newer refresh supersedes it',async()=>{
 const current=snapshot('doc','old');let resolve!:(preview:CanvasPreview)=>void,calls=0;const messages:string[]=[];
 const first=new Promise<CanvasPreview>(done=>resolve=done);
 const controller=new AuthorCanvasController({send:type=>messages.push(type),onDispose:()=>()=>{}},{snapshot:()=>current,confirmed:()=>current,pageId:()=> 'page',preview:()=>++calls===1?first:Promise.reject(Error('Newest refresh failed')),painted:()=>{},refreshed:()=>{messages.push('refreshed');},pageRemoved:async()=>{}});
 const pending=controller.refreshRuntime(current,'page');await assert.rejects(controller.refreshRuntime({...current,version:2},'page'),/Newest refresh failed/);
 resolve({version:1,channel:'old',expiresAt:1000,renewAfterMs:1000,slides:[{id:'page',url:'https://content.test/a/page.html'}]});await pending;assert.deepEqual(messages,[]);controller.dispose();
});
