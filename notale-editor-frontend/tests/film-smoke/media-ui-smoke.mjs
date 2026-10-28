import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
assert.equal((await fetch('http://127.0.0.1:4322/film')).status,200);
const fixture='.local/motale-film/assets/native-check.mp4';
if(!existsSync(fixture)) {
 mkdirSync('.local/motale-film/assets',{recursive:true});
 const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',fixture],{stdio:'inherit'});
 if(encoded.error)throw encoded.error;assert.equal(encoded.status,0,'test media encoding');
}
const media=await readFile(fixture);
const rangeResponse=await fetch('http://127.0.0.1:4322/assets/native-check.mp4',{headers:{range:'bytes=4-31'}});
assert.equal(rangeResponse.status,206);assert.deepEqual(Buffer.from(await rangeResponse.arrayBuffer()),media.subarray(4,32));
assert.equal((await fetch('http://127.0.0.1:4322/assets/native-check.mp4',{headers:{range:'bytes=99999999-'}})).status,416);
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 // Real bytes served by the candidate, including browser HTTP Range requests.
 await page.addInitScript(()=>{const create=AudioContext.prototype.createMediaElementSource;AudioContext.prototype.createMediaElementSource=function(media){const source=create.call(this,media);globalThis.nativeAudioSources??=new Map();globalThis.nativeAudioSources.set(media,{audio:this,source});return source;};});
 await page.goto('http://127.0.0.1:4322/film');
 await page.waitForFunction(()=>document.querySelector('[data-role="save-state"]')?.textContent.startsWith('已保存'));
 const doc={kind:'film',schemaVersion:1,id:'media',title:'带声视频',width:1280,height:720,frameRate:{numerator:30,denominator:1},sources:[{id:'s',kind:'video',title:'测试视频',uri:'/assets/native-check.mp4',duration:4}],tracks:[{id:'v1',kind:'media',title:'画面',locked:false,hidden:false,muted:false,clips:[{id:'a',sourceId:'s',title:'前段',at:0,duration:30,in:0.5},{id:'b',sourceId:'s',title:'后段',at:30,duration:30,in:2}]}],markers:[]};
 const choose=page.waitForEvent('filechooser');await page.locator('[data-action="open"]').click();await(await choose).setFiles({name:'media.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
 try { await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-.5)<.02;}); } catch(error) { console.log(await page.evaluate(()=>{const v=document.querySelector('video');return {status:document.querySelector('[data-role="status"]').textContent,media:v&&{time:v.currentTime,ready:v.readyState,seeking:v.seeking,network:v.networkState,error:v.error?.message,duration:v.duration,seekable:Array.from({length:v.seekable.length},(_,i)=>[v.seekable.start(i),v.seekable.end(i)]),buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])},types:{mp4:document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')}};}),errors);throw error; }
 await page.locator('[data-action="play"]').click();
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>.6;});
 await page.evaluate(async()=>{const media=document.querySelector('video'),existing=globalThis.nativeAudioSources?.get(media),audio=existing?.audio??new AudioContext();await audio.resume();const source=existing?.source??audio.createMediaElementSource(media),analyser=audio.createAnalyser(),silent=audio.createGain();silent.gain.value=0;source.connect(analyser);analyser.connect(silent).connect(audio.destination);globalThis.audioCheck={audio,analyser};});
 await page.waitForFunction(()=>{const a=globalThis.audioCheck,bytes=new Uint8Array(a.analyser.fftSize);a.analyser.getByteTimeDomainData(bytes);return a.audio.state==='running'&&bytes.some(v=>Math.abs(v-128)>2);});
 console.log('PASS native video decodes and real unmuted audio signal reaches WebAudio analyser');
 await page.locator('[data-action="play"]').click();
 await page.waitForFunction(()=>document.querySelector('video').paused);
 const frame=Number(await page.locator('[data-role="seek"]').inputValue());
 await page.waitForFunction(t=>Math.abs(document.querySelector('video').currentTime-t)<.02,.5+frame/30);
 await page.locator('[data-role="seek"]').evaluate(node=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'29');node.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('[data-action="play"]').click();
 await page.waitForFunction(()=>{const nodes=[...document.querySelectorAll('video')],v=document.querySelector('.film-source:not([hidden]) video');return nodes.length===2&&nodes[0].paused&&v&&!v.paused&&v.currentTime>=2.03;});
 await page.locator('[data-action="play"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.paused));
 const after=Number(await page.locator('[data-role="seek"]').inputValue());
 await page.waitForFunction(t=>Math.abs(document.querySelector('.film-source:not([hidden]) video').currentTime-t)<.02,2+(after-30)/30);
 console.log('PASS pause/scrub + cut from source 0.5s to 2s; inactive media paused');
 await page.evaluate(()=>globalThis.audioCheck.audio.close());
 assert.deepEqual(errors,[]);assert.equal(await page.locator('[data-role="status"]').innerText(),'');
} finally {await browser.close();}
