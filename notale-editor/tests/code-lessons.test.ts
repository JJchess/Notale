import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CODE_FILES,discoverCodeLessons} from '@notale/format';
import {documentSchema} from '../src/domain/model.js';
import {applyCommands,validateDocument} from '../src/domain/commands.js';
import {lessonFor,digestCode} from '../src/domain/code-lessons.js';
import {prepareCourse} from '../src/server/code-lessons.js';
import {mergeDocuments} from '../src/domain/sync-merge.js';
import type {Store} from '../src/server/store.js';
const root='assets/lessons/page-01',runtime='assets/code-runtime-observer-v1';
function fixture(){
 const source:Record<string,string>={[root+'/index.html']:'<script src="../../code-runtime-observer-v1/core.js"></script>',[root+'/lesson/lesson.js']:'export const lesson={};',[root+'/lesson/view/index.html']:'<main/>',[runtime+'/core.js']:'runtime',[root+'/.notale-code-lesson.json']:JSON.stringify({runtimeVersion:'observer-v1',editable:CODE_FILES.map(f=>'lesson/'+f),fixedRuntime:'../../code-runtime-observer-v1'})};
 for(const f of CODE_FILES)source[root+'/lesson/'+f]='original '+f;
 const files=Object.fromEntries(Object.entries(source).map(([p,s])=>[p,Buffer.from(s)])),assets=Object.fromEntries(Object.entries(source).map(([p,s])=>[p,{hash:digestCode(s),size:Buffer.byteLength(s),mime:'text/plain'}]));
 const codeLessons=discoverCodeLessons(files,assets,digestCode);
 const doc=documentSchema.parse({schemaVersion:1,id:'doc',title:'Course',assets,codeLessons,slides:[{id:'page',name:'Page',sourcePath:'page-01.html',html:`<iframe data-notale-id="code" class="code-workbench-frame" src="${root}/index.html?theme=../../theme.css" data-src="${root}/index.html?theme=../../theme.css"></iframe>`}]});
 return {doc,files};
}
test('course save is atomic, copies are independent, conflicts and inverse history preserve later edits',async()=>{
 const {doc,files}=fixture(),original=JSON.stringify(doc),sources=Object.fromEntries(CODE_FILES.map(f=>[f,'updated '+f])) as any;
 const fake={get:async()=>({document:doc,version:1}),asset:async(_ctx:any,_id:any,_version:any,p:string)=>({data:files[p]}),upload:async(_ctx:any,input:{data:Buffer;mime:string})=>({hash:digestCode(input.data.toString()),size:input.data.length,mime:input.mime})} as unknown as Store;
 const before=lessonFor(doc,doc.slides[0],'code');
 const prepared=await prepareCourse(fake,{actor:'a',scope:'s'},'doc','page','code',{expectedEntry:before.entry,expectedRevision:before.revision,sources});
 const next=applyCommands(doc,[prepared.command]);assert.equal(JSON.stringify(doc),original);assert.notEqual(lessonFor(next,next.slides[0],'code').entry,before.entry);assert.match(next.slides[0].html,/theme=\.\.\/\.\.\/theme.css/);assert.equal(next.assets[before.files['starter.py']].hash,doc.assets[before.files['starter.py']].hash);
 assert.throws(()=>applyCommands(next,[prepared.command]),{code:'SYNC_RECOVERY_REQUIRED'});
 const copy=structuredClone(doc);copy.slides.push({...structuredClone(doc.slides[0]),id:'copy',sourcePath:'copy.html'});
 const edited=applyCommands(copy,[prepared.command]);assert.equal(lessonFor(edited,edited.slides[1],'code').entry,before.entry);
 const concurrent=structuredClone(doc);concurrent.title='Unrelated title';assert.equal(mergeDocuments(doc,next,concurrent).title,'Unrelated title');
 assert.deepEqual(validateDocument(mergeDocuments(next,doc,next)),doc);
 const second={...prepared.command,expectedEntry:prepared.lesson.entry,expectedRevision:prepared.lesson.revision} as any;
 const moved=structuredClone(next);moved.slides[0].html=moved.slides[0].html.replaceAll(prepared.lesson.entry,'assets/lessons/other/index.html');assert.throws(()=>mergeDocuments(next,doc,moved),{code:'SYNC_RECOVERY_REQUIRED'});
 const copied=structuredClone(next);copied.slides.push({...structuredClone(next.slides[0]),id:'copy',sourcePath:'copy.html'});assert.throws(()=>validateDocument(mergeDocuments(next,doc,copied)),{code:'DANGLING_OBJECT'});
});
test('observer descriptors include all four author sources and fixed runtime resources',()=>{
 const {doc,files}=fixture(),before=Object.values(doc.codeLessons!)[0];
 for(const path of [...CODE_FILES.map(f=>before.files[f]),runtime+'/core.js']){const assets=structuredClone(doc.assets);assets[path].hash='f'.repeat(64);assert.notEqual(discoverCodeLessons(files,assets,digestCode)[before.entry].revision,before.revision);}
 const invalid={...files,[root+'/.notale-code-lesson.json']:Buffer.from('{"runtimeVersion":"legacy"}')};assert.throws(()=>discoverCodeLessons(invalid,doc.assets,digestCode),/重新生成/);
});
test('saved preview must match both the submitted source and the immutable runtime stamp',async()=>{
 const {doc,files}=fixture(),lesson=lessonFor(doc,doc.slides[0],'code'),sources=Object.fromEntries(CODE_FILES.map(f=>[f,'updated '+f])) as any;
 const stamp='a'.repeat(64),uploads:Buffer[]=[];
 const fake={get:async()=>({document:doc,version:1}),asset:async(_ctx:any,_id:any,_version:any,p:string)=>({data:p.endsWith('/lesson.js')?Buffer.from(`export const lesson={runtimeRevision:"${stamp}"};`):files[p]}),upload:async(_ctx:any,input:{data:Buffer;mime:string})=>{uploads.push(input.data);return {hash:digestCode(input.data.toString()),size:input.data.length,mime:input.mime};}} as unknown as Store;
 const input={expectedEntry:lesson.entry,expectedRevision:lesson.revision,sources,preview:{sourceRevision:digestCode(JSON.stringify(CODE_FILES.map(f=>[f,sources[f]]))),runtimeRevision:'b'.repeat(64),initialStep:{state:{value:1}}}};
 await prepareCourse(fake,{actor:'a',scope:'s'},'doc','page','code',input);assert.equal(JSON.parse(uploads.at(-1)!.toString()).initialStep,null);
 input.preview.runtimeRevision=stamp;await prepareCourse(fake,{actor:'a',scope:'s'},'doc','page','code',input);assert.deepEqual(JSON.parse(uploads.at(-1)!.toString()),input.preview);
});
