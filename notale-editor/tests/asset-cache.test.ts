import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {documentSchema} from '../src/domain/model.js';
import {createApps} from '../src/server/app.js';
test('asset cache revalidates leases and preserves byte ranges',async()=>{
 const document=documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'Asset cache',slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body>page</body></html>'}]});
 // Store metadata is authoritative for MIME; the mock supplies an immutable asset.
 document.assets['base.js']={mime:'text/javascript',hash:'a'.repeat(64),size:10};
 let active=true,reads=0;
 const apps=createApps({store:{get:async()=>({document,version:1}),renewPreview:async()=>Date.now()+3600000,previewActive:async()=>active,asset:async()=>{reads++;return {hash:'a'.repeat(64),data:Buffer.from('0123456789')};}} as any,secret:'asset-test-key',contentOrigin:'http://content.test',integration:{context:async()=>({scope:'test',actor:'author'}),authorize:async()=>true}});
 try {
  const preview=await apps.api.inject(`/api/documents/${document.id}/preview`);assert.equal(preview.statusCode,200);
  const url=new URL('base.js',preview.json().slides[0].url).pathname;
  const first=await apps.content.inject(url);assert.equal(first.statusCode,200);assert.equal(first.body,'0123456789');assert.match(String(first.headers['cache-control']),/private.*must-revalidate/);
  const cached=await apps.content.inject({url,headers:{'if-none-match':String(first.headers.etag)}});assert.equal(cached.statusCode,304);assert.equal(cached.body,'');assert.equal(reads,1,'cache hit must not fetch blob data');
  const changed=await apps.content.inject({url,headers:{'if-none-match':'"older"'}});assert.equal(changed.statusCode,200);
  const ranged=await apps.content.inject({url,headers:{range:'bytes=2-4','if-range':String(first.headers.etag)}});assert.equal(ranged.statusCode,206);assert.equal(ranged.body,'234');
  active=false;const denied=await apps.content.inject({url,headers:{'if-none-match':String(first.headers.etag)}});assert.equal(denied.statusCode,403);assert.equal(reads,3,'expired lease must not fetch blob data');
 } finally {await apps.api.close();await apps.content.close();}
});

test('signed font assets allow anonymous CORS after lease validation, including 304 and ranges',async()=>{
 const document=documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'Project fonts',slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body>page</body></html>'}],assets:{'font.woff2':{mime:'font/woff2',hash:'a'.repeat(64),size:10},'private.js':{mime:'text/javascript',hash:'a'.repeat(64),size:10}}});
 let active=true;
 const apps=createApps({store:{get:async()=>({document,version:1}),renewPreview:async()=>Date.now()+3600000,previewActive:async()=>active,asset:async()=>({hash:'a'.repeat(64),data:Buffer.from('0123456789')})} as any,secret:'font-cors-test-key',contentOrigin:'http://content.test',integration:{context:async()=>({scope:'test',actor:'author'}),authorize:async()=>true}});
 try{
  const preview=await apps.api.inject(`/api/documents/${document.id}/preview`),base=preview.json().slides[0].url,font=new URL('font.woff2',base).pathname;
  const requests:Record<string,string>[]=[{origin:'http://editor.test'},{origin:'http://editor.test','if-none-match':'"'+'a'.repeat(64)+'"'},{origin:'http://editor.test',range:'bytes=1-3'}];
  for(const headers of requests){const response=await apps.content.inject({url:font,headers});assert.ok([200,206,304].includes(response.statusCode));assert.equal(response.headers['access-control-allow-origin'],'*');assert.equal(response.headers['access-control-allow-credentials'],undefined);}
  for(const name of ['page.html','private.js']){const response=await apps.content.inject({url:new URL(name,base).pathname,headers:{origin:'http://editor.test'}});assert.equal(response.statusCode,200);assert.equal(response.headers['access-control-allow-origin'],undefined);}
  active=false;const expired=await apps.content.inject(font);assert.equal(expired.statusCode,403);assert.equal(expired.headers['access-control-allow-origin'],undefined);
  const forged=await apps.content.inject(font.replace('/content/','/content/invalid-'));assert.equal(forged.statusCode,403);assert.equal(forged.headers['access-control-allow-origin'],undefined);
 }finally{await apps.api.close();await apps.content.close();}
});
