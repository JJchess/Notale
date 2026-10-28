import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,copyFile,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {exportPlan,sampleTimes,validateEncoded} from '../src/server/film/export-plan.mjs';
import {ExportJobs} from '../src/server/film/export-jobs.mjs';
import {ExportVideoFrames,frameIndexAt} from '../src/server/film/export-video.mjs';
import {snapshotResources,portableResources,packageManifest,collectResources} from '../src/server/film/export-resources.mjs';
const execute=promisify(execFile),rate={numerator:30000,denominator:1001};

test('one rational output grid covers a half-open range and defines encoded duration',()=>{
 const plan=exportPlan({frameRate:rate},{start:3,end:8,frameRate:{numerator:24,denominator:1}});
 assert.equal(plan.frames,5);assert.equal(plan.audioSamples,10000);assert.equal(plan.duration,5/24);
 assert.equal(sampleTimes(plan,0)[0],.1001);assert.ok(sampleTimes(plan,4)[0]<8*1001/30000);
 assert.deepEqual(sampleTimes(plan,0,4).slice(0,2),[.1001,.1001]);
 assert.throws(()=>validateEncoded(plan,{streams:[{codec_type:'video',nb_read_frames:'4',width:96,height:64,r_frame_rate:'24/1'}]},96,64),/校验失败/);
});

test('persisted jobs deduplicate, cancel without downgrading completion, and recover interruption',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'notale-export-jobs-'));let release;
 try{
  const jobs=new ExportJobs(dir),input={doc:{id:'test'},options:{format:'png'},requestId:'request_0001'};
  const work=async job=>{await new Promise(resolve=>{release=resolve;});if(job.cancelled)throw Error('cancelled');await writeFile(path.join(job.dir,'frame.png'),'done');job.file='frame.png';};
  const first=await jobs.create(input,async()=>{},work),same=await jobs.create({...input,options:{format:'png'}},async()=>{throw Error('must not prepare twice');},work);
  assert.equal(first.id,same.id);await assert.rejects(jobs.create({...input,options:{format:'wav'}},async()=>{},work),/内容发生变化/);
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));await jobs.cancel(first);assert.equal(first.state,'cancelling');release();await jobs.tail;assert.equal(first.state,'cancelled');
  const complete=await jobs.create({...input,requestId:'request_0002'},async()=>{},async job=>{await writeFile(path.join(job.dir,'frame.png'),'done');job.file='frame.png';});await jobs.tail;await jobs.cancel(complete);assert.equal(complete.state,'complete');
  const record=JSON.parse(await readFile(path.join(complete.dir,'job.json'),'utf8'));assert.equal(record.state,'complete');
  const interrupted={...record,id:'00000000-0000-4000-8000-000000000000',state:'running',requestId:'request_0003'};await mkdir(path.join(dir,interrupted.id));await writeFile(path.join(dir,interrupted.id,'job.json'),JSON.stringify(interrupted));
  const reopened=new ExportJobs(dir);await reopened.ready;assert.equal(reopened.jobs.get(complete.id).state,'complete');assert.equal(reopened.jobs.get(interrupted.id).errorCode,'interrupted');
 }finally{release?.();await rm(dir,{recursive:true,force:true});}
});

test('portable resource closure excludes unrelated files and keeps imported page dependencies',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'notale-export-resources-'));
 try{
  const assets=path.join(root,'assets');await mkdir(path.join(assets,'imports','bundle'),{recursive:true});
  await writeFile(path.join(assets,'unrelated-secret.txt'),'not in the project');await writeFile(path.join(assets,'picture.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(assets,'imports/bundle/index.html'),'<img src="/assets/picture.svg"><script src="app.js"></script>');await writeFile(path.join(assets,'imports/bundle/app.js'),'const base = new URL("./", import.meta.url);');
  await writeFile(path.join(assets,'imports/bundle/example.html'),'<a href="javascript:void(0)">documentation only</a>');
  const font='a'.repeat(64)+'.woff2';await mkdir(path.join(root,'fonts'),{recursive:true});await writeFile(path.join(root,'fonts',font),'fixed font bytes');
  const doc={id:'package',fonts:[{uri:'/film-media/font-files/'+font}],sources:[{kind:'openfilm',uri:'/assets/imports/bundle/index.html'}],tracks:[]},dir=path.join(root,'input');
  const resources=await snapshotResources(doc,{root,dir});assert.deepEqual(resources.files.map(f=>f.path).sort(),['assets/imports/bundle/app.js','assets/imports/bundle/example.html','assets/imports/bundle/index.html','assets/picture.svg','film-media/font-files/'+font]);
  await writeFile(path.join(assets,'picture.svg'),'changed after snapshot');const output=path.join(root,'portable');await portableResources(resources,dir,output);
  assert.match(await readFile(path.join(output,'assets/imports/bundle/index.html'),'utf8'),/\.\.\/\.\.\/picture.svg/);
  assert.match(await readFile(path.join(output,'assets/picture.svg'),'utf8'),/<svg/);
  const manifest=await packageManifest(output,doc.id);assert.equal(manifest.files.length,5);assert.ok(manifest.files.every(f=>f.sha256.length===64));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('FFmpeg provider selects actual CFR B-frames and VFR PTS frames',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'notale-export-video-')),sharp=(await import('sharp')).default;
 try{
  await mkdir(path.join(dir,'input/assets'),{recursive:true});const colors=[[220,20,20],[20,220,20],[20,20,220],[220,220,20],[220,20,220],[20,220,220]];
  for(let i=0;i<colors.length;i++)await sharp({create:{width:32,height:24,channels:3,background:{r:colors[i][0],g:colors[i][1],b:colors[i][2]}}}).png().toFile(path.join(dir,`${i}.png`));
  await execute('ffmpeg',['-v','error','-y','-framerate','25','-i',path.join(dir,'%d.png'),'-c:v','libx264','-bf','2','-g','25','-crf','1','-pix_fmt','yuv444p',path.join(dir,'input/assets/cfr.mp4')]);
  const concat=colors.map((_,i)=>`file '${i}.png'\nduration ${[.04,.12,.08,.16,.04,.08][i]}`).join('\n')+"\nfile '5.png'\n";await writeFile(path.join(dir,'frames.txt'),concat);
  await execute('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',path.join(dir,'frames.txt'),'-vsync','vfr','-c:v','libx264','-bf','2','-crf','1','-pix_fmt','yuv444p',path.join(dir,'input/assets/vfr.mp4')]);
  const job={id:'fixture',dir},run=async(_job,command,args)=>{const {stdout}=await execute(command,args,{encoding:'buffer',maxBuffer:16*1024*1024});return stdout;},provider=new ExportVideoFrames(job,{run,check:()=>{}});
  for(const [uri,times,expected]of [['/assets/cfr.mp4',[.08,.10,.12,.199],[2,2,3,4]],['/assets/vfr.mp4',[.04,.10,.16,.23,.40],[1,1,2,2,4]]]){
   const mapped=await provider.prepare(times.map(time=>({uri,time}))),source=await provider.source(uri);
   for(let i=0;i<times.length;i++){const selected=frameIndexAt(source.frames,times[i]);assert.equal(selected,expected[i]);const {data}=await sharp(path.join(source.dir,selected+'.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});for(let channel=0;channel<3;channel++)assert.ok(Math.abs(data[channel]-colors[expected[i]][channel])<8,`actual decoded color ${[...data.subarray(0,3)]}`);}
   assert.ok(mapped[uri].frames.length>0);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('Motale resource closure includes dynamic acts and bundled materials, with read-only limits',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'notale-motale-resources-'));
 try{
  const assets=path.join(root,'assets'),film=path.join(assets,'film');
  await mkdir(path.join(film,'acts'),{recursive:true});await mkdir(path.join(film,'materials'),{recursive:true});
  await writeFile(path.join(film,'index.html'),'<script type="module" src="scene.js"></script>');
  await writeFile(path.join(film,'scene.js'),'export {value} from "./materials/kit.js"; const act = id => import(`./acts/${id}.js`);');
  await writeFile(path.join(film,'acts/one.js'),'export const render = () => {};');
  await writeFile(path.join(film,'materials/kit.js'),"export const value = 42; /** @type {import('./not-a-runtime-file.js').Value} */");
  await writeFile(path.join(assets,'unrelated.txt'),'not selected');
  const doc={id:'motale',sources:[{kind:'motale',uri:'/assets/film/index.html'}],tracks:[]};
  const files=await collectResources(doc,{root,limits:{maxFiles:4,maxBytes:1024,maxFileBytes:1024}});
  assert.deepEqual([...files.keys()].sort(),['assets/film/acts/one.js','assets/film/index.html','assets/film/materials/kit.js','assets/film/scene.js']);
  await assert.rejects(stat(path.join(root,'input')),error=>error.code==='ENOENT','collection never writes a snapshot');
  await assert.rejects(collectResources(doc,{root,limits:{maxFiles:3}}),/超过限制/);
  await assert.rejects(collectResources(doc,{root,limits:{maxBytes:5}}),/超过限制/);
  await assert.rejects(collectResources({...doc,sources:[{kind:'motale',uri:'/assets/index.html'}]},{root}),/独立素材目录/);
  await assert.rejects(collectResources({...doc,sources:[{kind:'motale',uri:'/assets/imports/index.html'}]},{root}),/独立素材目录/);
  const snapshot=await snapshotResources(doc,{root,dir:path.join(root,'input')});assert.equal(snapshot.files.length,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
