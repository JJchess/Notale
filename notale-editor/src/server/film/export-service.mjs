import {packageSlides,slideFrames} from './slides-export.mjs';
import {ExportJobs} from './export-jobs.mjs';
import {exportPlan,sampleTimes,validateEncoded} from './export-plan.mjs';
import {snapshotResources,copySnapshot,portableResources,mapDocumentResources,packageManifest,resourceName} from './export-resources.mjs';
import {ExportVideoFrames} from './export-video.mjs';
/** Local candidate export worker. No shared persistence or Motale bridge changes. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,readdir,realpath,stat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {check,run,browser,captureScreenshot,renderResource} from './export-runtime.mjs';
import {createScopeCapture} from './scope-capture.mjs';
import {assertFilmRate,parseFilmDocument,filmDuration,filmFrame,filmAudioLayers,filmSubtitleTracks,frameSeconds,exportVtt} from '../../film/index.js';
export function createExportService({root,actor,scope,runtime}) {
const output=path.join(root,'exports'),store=new ExportJobs(output,{actor,scope,runtime}),jobs=store.jobs,renderOrigin='https://film-render.invalid',playerRoot=runtime.playerDir;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.zip':'application/zip','.png':'image/png','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.gif':'image/gif','.vtt':'text/vtt','.srt':'application/x-subrip','.pdf':'application/pdf','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.wav':'audio/wav','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.wasm':'application/wasm'};
const playerHtml=(autoload=false)=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><title>Notale Film</title><style>html,body{margin:0;width:100%;height:100%;background:#111218;color:#eee;font:14px system-ui;overscroll-behavior:none}*{box-sizing:border-box;overscroll-behavior:none}body{display:flex;flex-direction:column}#picture{position:relative;flex:1;min-height:0;overflow:hidden}#controls{height:52px;display:flex;gap:12px;align-items:center;padding:8px 16px}#controls[hidden]{display:none}button,select{color:inherit;background:#24252f;border:0;border-radius:4px;padding:6px 10px}#seek{flex:1;min-width:40px}#status{font-size:12px}.capture #status{display:none}</style></head><body${autoload?' data-autoload="true"':''}><main id="picture"></main><nav id="controls"><button id="play">播放</button><input id="seek" type="range" min="0" value="0" aria-label="播放位置"><select id="language" aria-label="字幕语言"></select><span id="status" role="status"></span></nav><script type="module" src="player.js"></script></body></html>`;
function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
const ff=(job,args)=>run(job,'ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','2',...args]);
async function bounded(base,relative){const actual=await realpath(path.join(base,relative)),parent=await realpath(base);if(!actual.startsWith(parent+path.sep))throw Error('Path outside export root');return actual;}
async function localSource(uri){
 const u={pathname:'/'+resourceName(uri)};
 if(u.pathname.startsWith('/assets/'))return bounded(path.join(root,'assets'),decodeURIComponent(u.pathname.slice(8)));
 if(/^\/fixtures\/motale\/(motion|manim|whiteboard)\//.test(u.pathname))return bounded(path.join(root,'fixtures/motale'),decodeURIComponent(u.pathname.slice(17)));
 throw Error('Unsupported export source path');
}
async function playerFiles(dir,autoload){
 await mkdir(path.join(dir,'film-runtime'),{recursive:true});await writeFile(path.join(dir,'index.html'),playerHtml(autoload));
 await copyFile(path.join(playerRoot,'player.js'),path.join(dir,'player.js'));
 await copyFile(path.join(playerRoot,'player.css'),path.join(dir,'style.css'));
 await copyFile(path.join(playerRoot,'film-overlay.html'),path.join(dir,'film-overlay.html'));
 for(const name of ['bridge.js','text-editor.js'])await copyFile(path.join(runtime.editorRuntimeDir,name),path.join(dir,'film-runtime',name));
}
async function checkpoint(job,phase){check(job);job.phase=phase;await store.save(job);}
function sourceFile(job,uri){return path.join(job.dir,'input',resourceName(uri));}

function srt(track,rate){const stamp=n=>{const ms=Math.round(frameSeconds(n,rate)*1000),s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};return [...track.cues].sort((a,b)=>a.at-b.at).map((c,i)=>`${i+1}\n${stamp(c.at)} --> ${stamp(c.at+c.duration)}\n${c.text.replace(/<[^>]*>/g,'')}\n`).join('\n');}
async function captions(job,dir){for(const [i,track] of filmSubtitleTracks(job.doc).entries()){const authoredIndex=job.doc.tracks.findIndex(t=>t.id===track.id);const name=`${authoredIndex>=0?authoredIndex+1:job.doc.tracks.length+i+1}-${track.language.replace(/[^\w-]/g,'_')}`;await writeFile(path.join(dir,name+'.vtt'),exportVtt(track,job.doc.frameRate));await writeFile(path.join(dir,name+'.srt'),srt(track,job.doc.frameRate));}}
async function packageHtml(job){
 await checkpoint(job,'packaging');const dir=path.join(job.dir,'html');await playerFiles(dir,true);
 await portableResources(job.resources,path.join(job.dir,'input'),dir,()=>check(job));
 const doc=mapDocumentResources(job.doc,'');await writeFile(path.join(dir,'film.json'),JSON.stringify(doc,null,2));await captions(job,dir);
 await writeFile(path.join(dir,'README.txt'),'Notale portable film project v1\nOpen this ZIP in Notale to continue editing, or serve this directory over HTTP to play index.html.\nfilm.json keeps the editable author document. Referenced assets and explicit imported page bundles are included; unrelated assets are excluded.\nInteractive playback uses the Motale shell. Supported BRIDGE-v0 films use renderAct for transitions and fixed-frame capture; legacy films remain playback-only. Canvas output is opaque, and bridge captions are typeset by Notale.\n');
 const runtime=await readFile(path.join(playerRoot,'player-build.json'),'utf8').then(JSON.parse).catch(()=>({version:'unversioned'}));
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify(await packageManifest(dir,doc.id,{runtime,portable:true,resources:job.resources.files.map(file=>file.path)}),null,2));
 await run(job,'zip',['-qr',path.join(job.dir,'interactive.zip'),'.'],{cwd:dir});job.preview=`/film-export/jobs/${job.id}/files/html/index.html`;return 'interactive.zip';
}
async function frames(job,doc,start,end,dir,transparent=false,rate=doc.frameRate,samples=1,atFrames){
 await checkpoint(job,'decoding');const plan=exportPlan(doc,{start,end,frameRate:rate}),times=atFrames?atFrames.map(frame=>[frameSeconds(frame,doc.frameRate)]):Array.from({length:plan.frames},(_,i)=>sampleTimes(plan,i,samples));
 const requests=[];function videos(value,time){for(const layer of filmFrame(value,time).layers){if(layer.source.kind==='video')requests.push({uri:layer.source.uri,time:layer.sourceTime});else if(layer.source.kind==='sequence')videos(layer.source.sequence,layer.sourceTime);}}
 for(const group of times)for(const time of group)videos(doc,time);
 job.videoFrames??=new ExportVideoFrames(job,{run,check});const decoded=await job.videoFrames.prepare(requests);
 const base=`/film-export/jobs/${job.id}/files/input/`,frozen=mapDocumentResources(doc,base),videoFrames=Object.fromEntries(Object.entries(decoded).map(([uri,value])=>[base+resourceName(uri),value]));
 await mkdir(dir,{recursive:true});const instance=await browser(job),page=await instance.newPage({viewport:{width:job.width,height:job.height},deviceScaleFactor:1,serviceWorkers:'block'});
 try {
  // Every source request must resolve to the immutable job snapshot. Dynamic
  // Motale imports are included by the explicit source bundle closure.
  const allowed=new Set(job.resources.files.map(file=>base+file.path));
  for(const value of Object.values(videoFrames))for(const frame of value.frames)allowed.add(frame.uri);
  const runtime=new Set(['/film-export/render.html','/film-export/player.js','/film-export/style.css','/film-export/film-overlay.html','/film-export/film-runtime/bridge.js','/film-export/film-runtime/text-editor.js']);
  let resourceError;const checked=()=>{check(job);if(resourceError)throw resourceError;};
  page.on('pageerror',error=>{
    // Playwright's serviceWorkers:'block' init script reads this getter without
    // a try/catch. Chromium forbids it in our intentionally opaque overlay
    // iframe. Keep SW blocking and ignore only that exact injected-script error.
    const blockedWorkerProbe=error.name==='SecurityError'
      &&error.message==="Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag."
      &&/\n {4}at <anonymous>:3:15\n {4}at <anonymous>:5:7$/.test(error.stack??'');
    if(!blockedWorkerProbe)resourceError??=error;
  });
  page.on('response',response=>{if(response.status()>=400)resourceError??=Error('导出资源加载失败：'+response.status()+' '+response.url());});
  await page.context().routeWebSocket('**/*',socket=>socket.close());
  await page.context().route('**/*',async route=>{try{
    if(!['GET','HEAD'].includes(route.request().method()))throw Error('导出仅允许读取快照资源');
    const url=new URL(route.request().url());
    if(['data:','blob:'].includes(url.protocol)){await route.continue();return;}
    let pathname=decodeURIComponent(url.pathname);
    if((url.origin===renderOrigin||url.protocol==='http:'&&['127.0.0.1','localhost','film-build.localhost'].includes(url.hostname))&&/^\/(?:assets\/|fixtures\/motale\/|film-media\/font-files\/)/.test(pathname))pathname=base+pathname.slice(1);
    else if(url.origin!==new URL(renderOrigin).origin)throw Error('导出素材引用了未归档的远程资源：'+url.href);
    if(!allowed.has(pathname)&&!runtime.has(pathname))throw Error('导出素材依赖未包含在快照中：'+pathname);
    await renderResource(route,job,pathname);
  }catch(error){resourceError??=error;await route.abort().catch(()=>{});}});
  await page.goto(renderOrigin+'/film-export/render.html');await page.waitForFunction(()=>!!window.NotaleFilmRenderer);
  await page.evaluate(async({doc,languages,transparent,videoFrames,initialTime})=>window.NotaleFilmRenderer.load(doc,{capture:true,languages,transparent,videoFrames,initialTime}),{doc:frozen,languages:job.options.burnCaptions===false?[]:job.options.languages,transparent,videoFrames,initialTime:times[0][0]});
  checked();await checkpoint(job,'rendering');
  const screenshot=async()=>{checked();const pixels=await captureScreenshot(page,job.width,job.height,transparent);checked();return pixels;};
  for(let frame=0;frame<times.length;frame++){check(job);const filename=path.join(dir,`${String(frame).padStart(8,'0')}.png`);let sums;
   for(const t of times[frame]){check(job);await page.evaluate(t=>window.NotaleFilmRenderer.frame(t),t);checked();
    if(times[frame].length===1)await writeFile(filename,await screenshot());
    else {const sharp=(await import('sharp')).default;const {data}=await sharp(await screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});sums??=new Float64Array(data.length);for(let i=0;i<data.length;i+=4){const alpha=data[i+3]/255;sums[i]+=data[i]*alpha;sums[i+1]+=data[i+1]*alpha;sums[i+2]+=data[i+2]*alpha;sums[i+3]+=alpha;}}
    job.done++;job.progress=Math.min(.94,job.done/job.total*.9);
   }
   if(sums){const sharp=(await import('sharp')).default,raw=Buffer.alloc(sums.length);for(let i=0;i<raw.length;i+=4){const alpha=sums[i+3];if(alpha){raw[i]=Math.round(sums[i]/alpha);raw[i+1]=Math.round(sums[i+1]/alpha);raw[i+2]=Math.round(sums[i+2]/alpha);}raw[i+3]=Math.round(alpha/times[frame].length*255);}await sharp(raw,{raw:{width:job.width,height:job.height,channels:4}}).png().toFile(filename);}
   if(frame%15===0)await store.save(job);
  }
 }finally{await page.close();}
}

const sampleRate=48000;
async function pcm(job,source){
 if(job.pcm.has(source.uri))return job.pcm.get(source.uri);const filename=sourceFile(job,source.uri);
 const probe=JSON.parse((await run(job,'ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',filename])).toString());
 if(!probe.streams.some(s=>s.codec_type==='audio')){job.pcm.set(source.uri,null);return null;}
 const data=await ff(job,['-i',filename,'-map','0:a:0','-f','f32le','-ac','2','-ar',String(sampleRate),'pipe:1']);const value=new Float32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));job.pcm.set(source.uri,value);return value;
}
function writeWav(samples){const out=Buffer.alloc(44+samples.length*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*8,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);out.write('data',36);out.writeUInt32LE(samples.length*4,40);Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength).copy(out,44);return out;}
async function mixAudio(job,start,end,filename,onlyClip,outputSamples){
 const doc=job.doc,count=outputSamples??Math.round(frameSeconds(end-start,doc.frameRate)*sampleRate),origin=frameSeconds(start,doc.frameRate),stems=new Map(),retimed=new Map();
 const stop=frameSeconds(end,doc.frameRate),audioAt=time=>time<stop?filmAudioLayers(doc,time):[];
 const accepted=layer=>!onlyClip||(Array.isArray(onlyClip)?onlyClip:[onlyClip]).some(id=>layer.clipId===id||layer.clipId.startsWith(id+'/'));
 async function samples(layer){const raw=await pcm(job,layer.source);if(!raw)return null;const rate=layer.playbackRate;if(!layer.preservePitch||rate<=0||rate===1)return {data:raw,scale:1};const key=layer.source.uri+'|'+rate;if(!retimed.has(key)){let remaining=rate,filters=[];while(remaining>2){filters.push('atempo=2');remaining/=2;}while(remaining<.5){filters.push('atempo=0.5');remaining/=.5;}filters.push(`atempo=${remaining}`);const bytes=await ff(job,['-i',sourceFile(job,layer.source.uri),'-map','0:a:0','-af',filters.join(','),'-f','f32le','-ac','2','-ar',String(sampleRate),'pipe:1']);retimed.set(key,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));}return {data:retimed.get(key),scale:rate};}
 for(let offset=0;offset<count;offset+=240){check(job);const n=Math.min(240,count-offset),a=audioAt(origin+offset/sampleRate),b=audioAt(origin+(offset+n-1)/sampleRate),first=new Map(a.map(l=>[l.clipId,l])),last=new Map(b.map(l=>[l.clipId,l]));
  for(const key of new Set([...first.keys(),...last.keys()])){const one=first.get(key),two=last.get(key),layer=one??two;if(!accepted(layer))continue;const source=await samples(layer);if(!source)continue;let stem=stems.get(key);if(!stem){stem={first:offset,last:offset,chunks:[],gain:[],effects:layer.audioEffects};stems.set(key,stem);}const raw=new Float32Array(n*2),gains=[];const discontinuous=!one||!two||Math.abs((two.sourceTime-one.sourceTime)/Math.max(1/sampleRate,(n-1)/sampleRate)-(one.playbackRate+two.playbackRate)/2)>.02;
   for(let i=0;i<n;i++){const fraction=n===1?0:i/(n-1),current=discontinuous?audioAt(origin+(offset+i)/sampleRate).find(l=>l.clipId===key):undefined;
    const gain=discontinuous?(current?.gain??0):one.gain+(two.gain-one.gain)*fraction,rate=discontinuous?(current?.playbackRate??0):layer.playbackRate,time=discontinuous?current?.sourceTime:one.sourceTime+(two.sourceTime-one.sourceTime)*fraction;
    if(i===0||i===n-1)gains.push({time:(offset+i)/sampleRate,value:gain});if(time===undefined||Math.abs(rate)<1e-7)continue;
    const position=time/source.scale*sampleRate,index=Math.floor(position),blend=position-index;if(index<0||index*2>=source.data.length)continue;for(let c=0;c<2;c++){const x=source.data[index*2+c]??0,y=source.data[(index+1)*2+c]??x;raw[i*2+c]=x+(y-x)*blend;}
   }stem.chunks.push({offset,data:raw});stem.gain.push(...gains);stem.last=offset+n;
  }
 }
 const list=[...stems.values()],withEffects=list.some(s=>s.effects&&s.effects.enabled!==false&&((s.effects.eq?.length??0)>0||s.effects.compressor));
 if(withEffects){const descriptors=[];for(const [i,stem] of list.entries()){const data=new Float32Array((stem.last-stem.first)*2);for(const chunk of stem.chunks)data.set(chunk.data,(chunk.offset-stem.first)*2);const name=`audio-input-${randomUUID()}.wav`;await writeFile(path.join(job.dir,name),writeWav(data));descriptors.push({uri:`${renderOrigin}/film-export/jobs/${job.id}/files/${name}`,start:stem.first/sampleRate,effects:stem.effects,gain:stem.gain});}
  const page=await(await browser(job)).newPage();try{await page.goto(renderOrigin+'/film-export/render.html');await page.waitForFunction(()=>!!window.NotaleFilmRenderer);const encoded=await page.evaluate(({stems,count})=>window.NotaleFilmRenderer.audio(stems,count),{stems:descriptors,count}),bytes=Buffer.from(encoded,'base64');await writeFile(filename,writeWav(new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))));}finally{await page.close();}
 }else{const mixed=new Float32Array(count*2);for(const stem of list)for(const [index,chunk] of stem.chunks.entries()){const a=stem.gain[index*2].value,b=stem.gain[index*2+1].value,n=chunk.data.length/2;for(let i=0;i<n;i++){const gain=a+(b-a)*(n===1?0:i/(n-1));mixed[(chunk.offset+i)*2]+=chunk.data[i*2]*gain;mixed[(chunk.offset+i)*2+1]+=chunk.data[i*2+1]*gain;}}await writeFile(filename,writeWav(mixed));}return filename;
}

async function packageNle(job){
 const dir=path.join(job.dir,'nle'),media=path.join(dir,'Media');await mkdir(media,{recursive:true});const plan={title:job.doc.title,frameRate:job.doc.frameRate,rate:job.doc.frameRate.numerator/job.doc.frameRate.denominator,tracks:[]};
 const visible=job.doc.tracks.filter(t=>t.kind==='media'&&!t.hidden),sources=new Map(job.doc.sources.map(s=>[s.id,s]));job.total=visible.reduce((n,t)=>n+t.clips.filter(c=>sources.get(c.sourceId)?.kind!=='audio').reduce((s,c)=>s+c.duration,0),0)||1;
 let sequence=0;
 for(const track of [...visible].reverse()){
  const video={title:track.title,kind:'Video',clips:[]},audio={title:track.title,kind:'Audio',clips:[]};
  for(const clip of [...track.clips].sort((a,b)=>a.at-b.at)){check(job);const key=String(++sequence).padStart(4,'0'),source=sources.get(clip.sourceId),record={id:clip.id,title:clip.title,at:clip.at,duration:clip.duration,authored:clip};
   if(source.kind!=='audio'){const frameDir=path.join(job.dir,'frames-'+key),single={...job.doc,tracks:[track]};await frames(job,single,clip.at,clip.at+clip.duration,frameDir,true);await ff(job,['-framerate',`${job.doc.frameRate.numerator}/${job.doc.frameRate.denominator}`,'-i',path.join(frameDir,'%08d.png'),'-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-threads','2',path.join(media,key+'.mov')]);await rm(frameDir,{recursive:true});video.clips.push({...record,uri:'Media/'+key+'.mov'});}
   if(!track.muted&&(source.kind==='sequence'||['video','audio'].includes(source.kind)&&await pcm(job,source))){await mixAudio(job,clip.at,clip.at+clip.duration,path.join(media,key+'.wav'),clip.id);audio.clips.push({...record,uri:'Media/'+key+'.wav'});}
  }
  if(video.clips.length)plan.tracks.push(video);if(audio.clips.length)plan.tracks.push(audio);
 }
 await writeFile(path.join(dir,'film.json'),JSON.stringify(job.doc,null,2));await captions(job,dir);await writeFile(path.join(dir,'plan.json'),JSON.stringify(plan));
 job.validation=(await run(job,'python3',[fileURLToPath(new URL('./write-otio.py',import.meta.url)),path.join(dir,'plan.json'),path.join(dir,'timeline.otio')])).toString().trim();
 await writeFile(path.join(dir,'README.txt'),'Open timeline.otio in an OTIO-capable NLE. Keep Media beside it.\nEach visual cut is baked with its track transitions/appearance into ProRes 4444 with alpha; audio is baked with gains/ducking/retiming into stereo 48 kHz WAV.\nClip boundaries and track order remain editable. Original animation/object controls remain in film.json as metadata; use the portable HTML project package to reopen with original assets. Subtitles are separate VTT/SRT files.\nBlend modes across tracks are not portable to OTIO; use the MP4 export when final compositing must be identical.\n');
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify(await packageManifest(dir,job.doc.id,{portable:false,delivery:'baked-otio',nativeProject:'Use the portable HTML project package to retain original editable assets.'}),null,2));await run(job,'zip',['-qr',path.join(job.dir,'timeline.zip'),'.'],{cwd:dir});return 'timeline.zip';
}
async function perform(job){
 job.state='running';await mkdir(job.dir,{recursive:true});await writeFile(path.join(job.dir,'snapshot.film.json'),JSON.stringify(job.doc,null,2));
 try {const format=job.options.format;let name;
  if(format==='html')name=await packageHtml(job);
  else if(format.startsWith('slides-'))name=await packageSlides(job,{frames,run,browser});
  else if(format==='otio')name=await packageNle(job);
  else if(format==='subtitles'){const dir=path.join(job.dir,'subtitles');await mkdir(dir);await captions(job,dir);await run(job,'zip',['-qr',path.join(job.dir,'subtitles.zip'),'.'],{cwd:dir});name='subtitles.zip';}
  else if(format==='loudness'){
   const wav=await mixAudio(job,job.start,job.end,path.join(job.dir,'analysis.wav'),job.options.clipId);
   const output=await run(job,'ffmpeg',['-hide_banner','-nostats','-i',wav,'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'],{},true),match=output.toString().match(/\{[^{}]*"input_i"[^{}]*\}/s);if(!match)throw Error('响度分析未返回结果');const measured=JSON.parse(match[0]),number=v=>Number.isFinite(Number(v))?Number(v):null;
   job.result={lufs:number(measured.input_i),truePeak:number(measured.input_tp),range:number(measured.input_lra),threshold:number(measured.input_thresh)};name='analysis.json';await writeFile(path.join(job.dir,name),JSON.stringify(job.result,null,2));
  }
  else if(format==='wav'){name='audio.wav';const raw=await mixAudio(job,job.start,job.end,path.join(job.dir,'mix.wav'));await ff(job,['-i',raw,'-c:a','pcm_s24le',path.join(job.dir,name)]);}
  else if(format==='stems'){
   const dir=path.join(job.dir,'stems');await mkdir(dir);const tracks=job.doc.tracks.filter(t=>t.kind==='media'&&!t.hidden&&!t.muted);const manifest={start:job.start,end:job.end,frameRate:job.doc.frameRate,sampleRate,tracks:[]};
   for(const [i,track] of tracks.entries()){check(job);const raw=path.join(job.dir,'stem-mix.wav'),name=`${String(i+1).padStart(2,'0')}-${track.title.replace(/[^\p{L}\p{N} _-]/gu,'_').slice(0,80)||'track'}.wav`;await mixAudio(job,job.start,job.end,raw,track.clips.map(c=>c.id));await ff(job,['-i',raw,'-c:a','pcm_f32le',path.join(dir,name)]);manifest.tracks.push({id:track.id,title:track.title,file:name});job.progress=(i+1)/Math.max(1,tracks.length)*.9;}
   await writeFile(path.join(dir,'stems.json'),JSON.stringify(manifest,null,2));await run(job,'zip',['-qr',path.join(job.dir,'stems.zip'),'.'],{cwd:dir});name='stems.zip';
  }
  else {const dir=path.join(job.dir,'frames'),rate=job.options.frameRate??job.doc.frameRate;await frames(job,job.doc,job.start,job.end,dir,!!job.options.transparent,rate,job.options.motionBlur??1);const fps=`${rate.numerator}/${rate.denominator}`;
   if(format==='png'){name='frame.png';await copyFile(path.join(dir,'00000000.png'),path.join(job.dir,name));}
   else if(format==='png-sequence'){await writeFile(path.join(dir,'sequence.json'),JSON.stringify({plan:job.plan,frameRate:rate,sourceFrameRate:job.doc.frameRate,start:job.start,end:job.end,width:job.width,height:job.height,transparent:!!job.options.transparent},null,2));await run(job,'zip',['-qr',path.join(job.dir,'frames.zip'),'.'],{cwd:dir});name='frames.zip';}
   else if(format==='gif'){name='film.gif';await ff(job,['-framerate',fps,'-i',path.join(dir,'%08d.png'),'-filter_complex_threads','1','-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',path.join(job.dir,name)]);}
   else {
    const codec=job.options.codec??'h264',quality=job.options.quality??'high',crf={standard:23,high:18,master:12}[quality];let video,extension='mp4',audio=['-c:a','aac','-b:a','192k'];
    if(codec==='h264')video=['-c:v','libx264','-preset','fast','-crf',String(crf),'-pix_fmt','yuv420p'];
    else if(codec==='hevc')video=['-c:v','libx265','-preset','fast','-crf',String(crf+3),'-pix_fmt','yuv420p','-tag:v','hvc1','-x265-params','pools=1:frame-threads=2'];
    else if(codec==='vp9'){extension='webm';video=['-c:v','libvpx-vp9','-crf',String(crf+10),'-b:v','0','-deadline','good','-cpu-used','4','-pix_fmt',job.options.transparent?'yuva420p':'yuv420p'];audio=['-c:a','libopus','-b:a','192k'];}
    else {extension='mov';video=['-c:v','prores_ks','-profile:v',codec==='prores4444'?'4':'3','-pix_fmt',codec==='prores4444'?'yuva444p10le':'yuv422p10le'];audio=['-c:a','pcm_s24le'];}
    name=`film.${extension}`;const wav=await mixAudio(job,job.start,job.end,path.join(job.dir,'mix.wav'),undefined,job.plan.audioSamples);
    await checkpoint(job,'encoding');await ff(job,['-framerate',fps,'-i',path.join(dir,'%08d.png'),'-i',wav,...video,'-threads','2',...audio,'-frames:v',String(job.plan.frames),'-t',String(job.plan.duration),...(extension==='mp4'?['-movflags','+faststart']:[]),path.join(job.dir,name)]);
    job.validation=validateEncoded(job.plan,JSON.parse((await run(job,'ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,pix_fmt,nb_read_frames,r_frame_rate,width,height:format=duration','-of','json',path.join(job.dir,name)])).toString()),job.width,job.height);
   }
   await rm(dir,{recursive:true});
  }
  check(job);job.file=name;job.progress=1;job.state='complete';await writeFile(path.join(job.dir,'manifest.json'),JSON.stringify(publicJob(job),null,2));
 }catch(error){throw error;}finally{await job.browser?.close();job.browser=undefined;job.pcm.clear();}
}
function publicJob(job){return {id:job.id,retryOf:job.retryOf,created:job.created,state:job.state,phase:job.phase,plan:job.plan,progress:job.progress,format:job.options.format,start:job.start,end:job.end,width:job.width,height:job.height,error:job.error,errorCode:job.errorCode,result:job.result,validation:job.validation,download:job.file?`/film-export/jobs/${job.id}/files/${job.file}`:undefined,preview:job.preview};}
async function serveFile(req,res,file){const info=await stat(file);if(!info.isFile())throw Error('Not a file');let start=0,end=info.size-1,status=200;const headers={'content-type':types[path.extname(file)]??'application/octet-stream','cache-control':'no-store','accept-ranges':'bytes',...(/\.(woff2?|ttf|otf)$/i.test(file)?{'access-control-allow-origin':'*'}:{})};if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end||start>=info.size){res.writeHead(416).end();return;}status=206;headers['content-range']=`bytes ${start}-${end}/${info.size}`;}headers['content-length']=String(Math.max(0,end-start+1));res.writeHead(status,headers);if(req.method==='HEAD'||!info.size){res.end();return;}const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
runtime.playerHtml=playerHtml;
const captureScope=createScopeCapture({root,renderOrigin,parseFilmDocument,filmDuration,frameSeconds,filmFrame,runtime});
async function exportRequest(req,res){
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);if(!pathname.startsWith('/film-export/'))return false;
 try {
  if(pathname==='/film-export/scope-frame'&&req.method==='POST'){
   const abort=new AbortController(),disconnected=()=>{if(!res.writableEnded)abort.abort();};res.once('close',disconnected);
   try{let length=0;const chunks=[];for await(const bytes of req){length+=bytes.length;if(length>20*1024*1024)throw Object.assign(Error('采样请求超过 20 MB'),{status:413});chunks.push(bytes);}
    const sample=await captureScope(JSON.parse(Buffer.concat(chunks).toString()),abort.signal);if(res.destroyed)return true;
    res.writeHead(200,{'content-type':'application/octet-stream','cache-control':'no-store','content-length':String(sample.pixels.length),'X-Scope-Width':String(sample.width),'X-Scope-Height':String(sample.height),'X-Scope-Frame':String(sample.frame),'X-Scope-Request-Id':sample.requestId,'X-Scope-Document-Id':encodeURIComponent(sample.documentId)});res.end(sample.pixels);
   }finally{res.removeListener('close',disconnected);}return true;
  }
  if(pathname==='/film-export/capabilities'){json(res,200,{formats:['mp4','gif','png','png-sequence','wav','stems','subtitles','otio','html','slides-png','slides-pdf','slides-pptx'],codecs:['h264','hevc','vp9','prores422hq','prores4444'],unsupported:{'hevc-alpha':'当前 Linux FFmpeg 没有 HEVC alpha 编码器'},local:true});return true;}
  if(pathname==='/film-export/jobs'&&req.method==='POST'){
   let length=0,chunks=[];for await(const data of req){length+=data.length;if(length>20*1024*1024)throw Error('Film export request too large');chunks.push(data);}
   const input=JSON.parse(Buffer.concat(chunks).toString()),doc=parseFilmDocument(input.document),options=input.options??{},duration=filmDuration(doc);
   if(!['mp4','gif','png','png-sequence','wav','stems','loudness','subtitles','otio','html','slides-png','slides-pdf','slides-pptx'].includes(options.format))throw Error('Unsupported export format');if(duration<1)throw Error('影片为空');
   const start=options.start??0,end=options.format==='png'?start+1:(options.end??duration),scale=options.scale??1;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>duration)throw Error('无效导出区间');if(![.25,.5,1,2].includes(scale))throw Error('无效导出尺寸');
   if(options.format.startsWith('slides-'))slideFrames(doc,start,end,options);
   if(options.clipId!==undefined&&!doc.tracks.some(t=>t.kind==='media'&&t.clips.some(c=>c.id===options.clipId)))throw Error('声音片段不存在');
   if(options.frameRate!==undefined)assertFilmRate(options.frameRate);
   if(options.codec!==undefined&&!['h264','hevc','vp9','prores422hq','prores4444'].includes(options.codec))throw Error('当前环境不支持该编码器');
   if(options.quality!==undefined&&!['standard','high','master'].includes(options.quality))throw Error('无效导出质量');
   if(options.motionBlur!==undefined&&![1,4,8].includes(options.motionBlur))throw Error('无效运动模糊采样数');
   if(options.transparent&&!['png','png-sequence'].includes(options.format)&&!(options.format==='mp4'&&['vp9','prores4444'].includes(options.codec)))throw Error('此格式不支持透明通道');
   const exportRate=options.format==='png'?doc.frameRate:options.frameRate??doc.frameRate;if(options.format==='png'){options.frameRate=doc.frameRate;options.motionBlur=1;}
   const total=Math.ceil(frameSeconds(end-start,doc.frameRate)*exportRate.numerator/exportRate.denominator-1e-9)*(options.motionBlur??1);
   if(input.clientRequestId!==undefined&&(typeof input.clientRequestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.clientRequestId)))throw Error('无效请求编号');
   const plan=exportPlan(doc,{start,end,frameRate:exportRate}),job=await store.create({doc,options,start,end,plan,requestId:input.clientRequestId,width:Math.max(2,Math.round(doc.width*scale/2)*2),height:Math.max(2,Math.round(doc.height*scale/2)*2),total},async job=>{job.resources=await snapshotResources(job.doc,{root,dir:path.join(job.dir,'input'),check:()=>check(job)});await writeFile(path.join(job.dir,'snapshot.film.json'),JSON.stringify(job.doc,null,2));},perform);json(res,202,publicJob(job));return true;
  }
  await store.ready;
  if(pathname==='/film-export/jobs/by-request'&&req.method==='GET'){const job=store.requests.get(actor+':'+url.searchParams.get('documentId')+':'+url.searchParams.get('requestId'));json(res,job?200:404,job?publicJob(job):{error:'任务不存在'});return true;}
  const retry=/^\/film-export\/jobs\/([a-f0-9-]{36})\/retry$/.exec(pathname);
  if(retry&&req.method==='POST'){
   const old=jobs.get(retry[1]);if(!old){json(res,404,{error:'任务不存在'});return true;}if(!['failed','cancelled'].includes(old.state)){json(res,409,{error:'仅失败或取消的任务可以重试'});return true;}
   let body='';for await(const bytes of req){body+=bytes;if(body.length>1024)throw Error('重试请求过大');}const request=JSON.parse(body||'{}');if(request.clientRequestId!==undefined&&!/^[a-zA-Z0-9_-]{8,100}$/.test(request.clientRequestId))throw Error('无效请求编号');
   const job=await store.create({requestId:request.clientRequestId,doc:old.doc,options:old.options,start:old.start,end:old.end,plan:old.plan,width:old.width,height:old.height,total:old.total,retryOf:old.id},async job=>{if(!old.resources)throw Error('原任务没有完整素材快照，请重新导出');await copySnapshot(old.resources,path.join(old.dir,'input'),path.join(job.dir,'input'),()=>check(job));job.resources=old.resources;await writeFile(path.join(job.dir,'snapshot.film.json'),JSON.stringify(job.doc,null,2));},perform);json(res,202,publicJob(job));return true;
  }
  const match=/^\/film-export\/jobs\/([a-f0-9-]{36})(?:\/files\/(.+))?$/.exec(pathname);
  if(match){const job=jobs.get(match[1]);if(match[2]&&['GET','HEAD'].includes(req.method)){await serveFile(req,res,await bounded(path.join(output,match[1]),match[2]));return true;}if(!job){json(res,404,{error:'任务不存在'});return true;}if(req.method==='DELETE')await store.cancel(job);else if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return true;}json(res,200,publicJob(job));return true;}
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return true;}
  if(pathname==='/film-export/render.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(playerHtml());return true;}
  const assets={'/film-export/player.js':path.join(playerRoot,'player.js'),'/film-export/style.css':path.join(playerRoot,'player.css'),'/film-export/film-overlay.html':path.join(playerRoot,'film-overlay.html'),'/film-export/film-runtime/bridge.js':path.join(runtime.editorRuntimeDir,'bridge.js'),'/film-export/film-runtime/text-editor.js':path.join(runtime.editorRuntimeDir,'text-editor.js')};
  if(assets[pathname]){await serveFile(req,res,path.isAbsolute(assets[pathname])?assets[pathname]:path.join(root,assets[pathname]));return true;}json(res,404,{error:'Not found'});
 }catch(error){if(!res.headersSent)json(res,error.status??400,{error:error.message});else res.destroy();}return true;
}

return {handle:exportRequest,store,playerHtml,close:async()=>{await Promise.all([captureScope.close(),store.close()]);}};
}
