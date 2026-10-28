/** Optional real-sample check. Uses the built editor and player; no HTTP listener. */
import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {createScopeCapture as createCapture} from '../../../notale-editor/dist/server/film/scope-capture.mjs';import {createExportService} from '../../../notale-editor/dist/server/film/export-service.mjs';import {run} from '../../../notale-editor/dist/server/film/export-runtime.mjs';import {parseFilmDocument,filmDuration,filmFrame,frameSeconds} from '../../../notale-editor/dist/film/index.js';
const repository=fileURLToPath(new URL('../../../',import.meta.url)),root=path.join(repository,'.local/motale-film');
function createScopeCapture(options){const runtime={playerDir:path.join(repository,'notale-editor-frontend/.local/film-runtime'),editorRuntimeDir:path.join(repository,'notale-editor/dist'),chromium:process.env.EDITOR_CHROMIUM_PATH,commands:{}};const service=createExportService({root,actor:'scope-smoke',scope:'scope-smoke',runtime});const capture=createCapture({...options,runtime});capture.dispose=async()=>{await capture.close();await service.close();};return capture;}
test('final scope samples include PTS-selected video grade, native title and captions; cancellation releases its slot',async(t)=>{
 const origin='https://film-render.invalid';
 const assets=await mkdtemp(path.join(root,'assets/scope-check-')),sharp=(await import('sharp')).default,task={cancelled:false,children:new Set()};
 try{
  for(let i=0;i<3;i++)await sharp({create:{width:192,height:128,channels:3,background:{r:[32,64,128][i],g:[32,64,128][i],b:[32,64,128][i]}}}).png().toFile(path.join(assets,i+'.png'));
  await run(task,'ffmpeg',['-v','error','-framerate','25','-i',path.join(assets,'%d.png'),'-c:v','libx264','-crf','0','-pix_fmt','yuv444p',path.join(assets,'video.mp4')]);
  const source={id:'v',kind:'video',title:'Video',uri:'/assets/'+path.basename(assets)+'/video.mp4',width:192,height:128,duration:.12},track=(id,sourceId)=>({id,kind:'media',title:id,hidden:false,muted:false,locked:false,clips:[{id:id+'clip',sourceId,title:id,at:0,in:0,duration:1}]});
  const doc={kind:'film',schemaVersion:1,id:'scope-point-in-time',title:'Scope',width:192,height:128,frameRate:{numerator:25,denominator:1},sources:[source,{id:'title',kind:'overlay',title:'Native title',uri:'about:blank',html:'<div id="box" data-type="text" style="position:absolute;left:100px;top:10px;width:30px;height:20px;background:rgb(255,0,0)"> </div>'}],tracks:[track('titles','title'),track('video','v'),{id:'sub',kind:'subtitle',title:'Caption',language:'en',hidden:false,muted:false,locked:false,style:{fontSize:24,color:'#00ff00',outlineWidth:0,shadowBlur:0,x:50,y:80},cues:[{id:'cue',at:0,duration:1,text:'HHHH'}]}],markers:[]};
  doc.tracks[1].clips[0].in=.08;doc.tracks[1].clips[0].color={curves:{rgb:[[0,0],[.5,.25],[1,1]]}};
  const capture=createScopeCapture({root,renderOrigin:origin,parseFilmDocument,filmDuration,frameSeconds,filmFrame}),request={document:doc,frame:0,requestId:'scope_test_request'};
  t.after(()=>capture.dispose());const abort=new AbortController(),cancelled=capture(request,abort.signal);await assert.rejects(capture(request),error=>error.status===429);abort.abort();await assert.rejects(cancelled,/取消/);
  const result=await capture(request);assert.equal(result.requestId,request.requestId);assert.equal(result.documentId,doc.id);assert.equal(result.frame,0);assert.equal(result.width,192);assert.equal(result.height,128);
  const pixel=(x,y)=>[...result.pixels.subarray((y*result.width+x)*4,(y*result.width+x)*4+3)];assert.ok(pixel(20,20).every(v=>Math.abs(v-64)<5),'PTS-selected frame is graded in final compositor');assert.deepEqual(pixel(110,15),[255,0,0],'native title contributes final pixels');let green=0;for(let i=0;i<result.pixels.length;i+=4)if(result.pixels[i+1]>150&&result.pixels[i]<50&&result.pixels[i+2]<50)green++;assert.ok(green>20,'caption contributes final pixels');
  const nested={...doc,id:'nested',sources:[{...source,id:'m',kind:'openfilm',uri:'/assets/unselected-page/index.html',duration:1}],tracks:[track('web','m')]};const outer={...doc,id:'outer',sources:[{id:'seq',kind:'sequence',title:'Nested',uri:'sequence:nested',sequence:nested,duration:.04,width:192,height:128}],tracks:[track('nest','seq')]};await assert.rejects(capture({...request,document:outer}),/网页或讲义/);await assert.rejects(capture({...request,frame:1}),/范围/);
 }finally{await rm(assets,{recursive:true,force:true});}
});

test('final scope renders the real Motale bridge and per-clip author, rejects legacy and unrelated dynamic resources',async(t)=>{
 const origin='https://film-render.invalid';
 const capture=createScopeCapture({root,renderOrigin:origin,parseFilmDocument,filmDuration,frameSeconds,filmFrame});
 const doc={kind:'film',schemaVersion:1,id:'scope-motale-bridge',title:'Bridge scope',width:1280,height:720,frameRate:{numerator:30,denominator:1},sources:[{id:'motale',kind:'motale',title:'Real bridge fixture',uri:'/assets/motale-bridge-manim/index.html',width:1280,height:720,duration:620}],tracks:[{id:'picture',kind:'media',title:'Picture',hidden:false,muted:false,locked:false,clips:[{id:'sum',sourceId:'motale',title:'Sum',at:0,in:190,duration:2}]}],markers:[]};
 t.after(()=>capture.dispose());const request={document:doc,frame:0,requestId:'scope_bridge_request'},before=JSON.stringify(doc);
 const baseline=await capture(request);assert.equal(baseline.width,256);assert.equal(baseline.height,144);assert.equal(JSON.stringify(doc),before,'sampling leaves its document untouched');
 const colors=new Set();for(let i=0;i<baseline.pixels.length;i+=4)colors.add(baseline.pixels.subarray(i,i+3).toString('hex'));assert.ok(colors.size>30,'bridge produces scene pixels, not an empty placeholder');
 const authored=structuredClone(doc);authored.tracks[0].clips[0].motale={schema:'motale-author/0',acts:{sum:{objects:{'Text#1':{x:400,color:'#ff0000'}}}}};
 const changed=await capture({...request,document:authored,requestId:'scope_author_request'});let changedPixels=0;for(let i=0;i<baseline.pixels.length;i+=4)if(Math.abs(baseline.pixels[i]-changed.pixels[i])+Math.abs(baseline.pixels[i+1]-changed.pixels[i+1])+Math.abs(baseline.pixels[i+2]-changed.pixels[i+2])>20)changedPixels++;
 assert.ok(changedPixels>5,'saved per-clip author overrides contribute to renderAct pixels');
 const assets=await mkdtemp(path.join(root,'assets/scope-bridge-'));
 try{
  const folder=path.join(assets,'legacy');await mkdir(folder);
  const shell='<script>window.shell={state:()=>({time:0,playing:false,activeBranch:"film",parameters:{}}),pause(){},seek(){}};</script>';
  await writeFile(path.join(folder,'index.html'),'<!doctype html><body>'+shell);
  const legacy=structuredClone(doc);legacy.sources[0].uri='/assets/'+path.basename(assets)+'/legacy/index.html';legacy.tracks[0].clips[0].in=0;
  await assert.rejects(capture({...request,document:legacy}),/旧版播放/,'legacy shell alone never passes final capture');
  await writeFile(path.join(assets,'outside.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  await writeFile(path.join(folder,'index.html'),'<!doctype html><body><script>const image=new Image();image.src=["/assets","'+path.basename(assets)+'","outside.svg"].join("/");document.body.append(image);</script>');
  await assert.rejects(capture({...request,document:legacy}),/依赖范围内/,'dynamic requests cannot read unrelated files outside the explicit Motale bundle');
 }finally{await rm(assets,{recursive:true,force:true});}
});
