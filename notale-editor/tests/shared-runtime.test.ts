import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {documentSchema} from '../src/domain/model.js';
import {renderSlide} from '../src/server/render.js';

test('online slides share a relative runtime while export keeps its runtime inline',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'notale-runtime-')),previous=process.env.EDITOR_RUNTIME_DIR;
 try{
  process.env.EDITOR_RUNTIME_DIR=directory;await writeFile(join(directory,'bridge.js'),'window.__runtime_fixture__=true;');
  const document=documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'Runtime',width:1600,height:900,slides:[{id:'page',name:'Page',sourcePath:'nested/page.html',html:'<html><body><h1 data-notale-id="title">Title</h1></body></html>'}]});
  const online=await renderSlide(document,document.slides[0],'preview-channel');
  assert.match(online,/src="\.\.\/__notale_runtime__\/bridge\.js"/);assert.doesNotMatch(online,/__runtime_fixture__/);assert.ok(online.indexOf('window.__NOTALE__=')<online.indexOf('src="../__notale_runtime__/bridge.js"'));
  const exported=await renderSlide(document,document.slides[0],'export');assert.match(exported,/__runtime_fixture__/);assert.doesNotMatch(exported,/src="[^"\n]*__notale_runtime__\/bridge\.js"/);
 }finally{if(previous===undefined)delete process.env.EDITOR_RUNTIME_DIR;else process.env.EDITOR_RUNTIME_DIR=previous;await rm(directory,{recursive:true,force:true});}
});

test('shared runtime conditional requests still require an active preview lease',async()=>{
 const {createApps}=await import('../src/server/app.js');
 const directory=await mkdtemp(join(tmpdir(),'notale-runtime-http-')),previous=process.env.EDITOR_RUNTIME_DIR;
 process.env.EDITOR_RUNTIME_DIR=directory;
 const document=documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'Runtime',slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body><h1 data-notale-id="title">Title</h1></body></html>'}]});
 let active=true;
 const apps=createApps({store:{get:async()=>({document,version:1}),renewPreview:async()=>Date.now()+3600000,previewActive:async()=>active} as any,secret:'runtime-test-key',contentOrigin:'http://content.test',integration:{context:async()=>({scope:'test',actor:'author'}),authorize:async()=>true}});
 try{
  await writeFile(join(directory,'bridge.js'),'runtime-v1');
  const preview=await apps.api.inject(`/api/documents/${document.id}/preview`);
  assert.equal(preview.statusCode,200);
  const url=new URL('__notale_runtime__/bridge.js',preview.json().slides[0].url).pathname;
  const first=await apps.content.inject(url);assert.equal(first.statusCode,200);assert.equal(first.body,'runtime-v1');assert.match(String(first.headers['cache-control']),/private.*must-revalidate/);
  const cached=await apps.content.inject({url,headers:{'if-none-match':String(first.headers.etag)}});assert.equal(cached.statusCode,304);assert.equal(cached.body,'');
  await writeFile(join(directory,'bridge.js'),'runtime-v2');const updated=await apps.content.inject({url,headers:{'if-none-match':String(first.headers.etag)}});assert.equal(updated.statusCode,200);assert.equal(updated.body,'runtime-v2');
  active=false;const expired=await apps.content.inject({url,headers:{'if-none-match':String(updated.headers.etag)}});assert.equal(expired.statusCode,403);
 }finally{await apps.api.close();await apps.content.close();if(previous===undefined)delete process.env.EDITOR_RUNTIME_DIR;else process.env.EDITOR_RUNTIME_DIR=previous;await rm(directory,{recursive:true,force:true});}
});
