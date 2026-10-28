import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';assert.equal((await fetch(base+'/film')).status,200);
// handles.mp4 is a local two-second procedural ffmpeg fixture, never a user asset.
assert.equal((await fetch(base+'/assets/handles.mp4')).status,200);
await writeFile('.local/motale-film/assets/handles.html','<!doctype html><html><head><style>html,body{margin:0;background:transparent}div{width:600px;height:340px;background:#b3a0ed}</style></head><body><div>OpenFilm</div><script>window.film={width:600,height:340,duration:2,frame(t){document.querySelector("div").textContent="OpenFilm "+t.toFixed(2)}};</script></body></html>');
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(8000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/film');
 for(const kind of ['video','openfilm']){
  const doc={kind:'film',schemaVersion:1,id:kind,title:kind,width:1280,height:720,frameRate:{numerator:30,denominator:1},sources:[{id:'s',kind,title:kind,uri:'/assets/handles.'+(kind==='video'?'mp4':'html'),duration:2,width:400,height:200}],tracks:[{id:'v',kind:'media',title:'画面',locked:false,hidden:false,muted:false,clips:[{id:'a',sourceId:'s',title:kind,in:0,at:0,duration:60}]}],markers:[]};
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'打开影片 JSON'}).click();await(await chooser).setFiles({name:'media.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.locator('[data-clip-id="a"] .film-clip-body').click();
  const picture=page.locator('[data-preview-clip-id="a"]');
  if(kind==='video')await picture.locator('video').evaluate(async video=>{if(video.readyState<2)await new Promise(resolve=>video.addEventListener('loadeddata',resolve,{once:true}));});
  else await page.waitForFunction(()=>document.querySelector('[data-preview-clip-id="a"]')?.style.width==='600px');
  await page.getByRole('button',{name:'编辑片段位置与变换',exact:true}).click();const iframe=page.locator('iframe.film-clip-handles');await iframe.waitFor();const frame=await(await iframe.elementHandle()).contentFrame();await frame.locator('.moveable-control[data-direction="se"]').waitFor({state:'visible'});
  const b=await picture.boundingBox(),host=await iframe.boundingBox(),local=await frame.locator('[data-notale-id="film-clip"]').evaluate(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,vw:innerWidth,vh:innerHeight};});
  const proxy={x:host.x+local.x*host.width/local.vw,y:host.y+local.y*host.height/local.vh,width:local.width*host.width/local.vw,height:local.height*host.height/local.vh};for(const key of ['x','y','width','height'])assert.ok(Math.abs(proxy[key]-b[key])<1,kind+' proxy '+key);
  const x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+20,{steps:8});await page.waitForTimeout(60);const live=await picture.boundingBox();assert.ok(live.x-b.x>35,kind+' live');await page.mouse.up();await page.waitForTimeout(80);assert.ok(Math.abs((await picture.boundingBox()).x-live.x)<1,kind+' commit');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载工作副本'}).click();const saved=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.ok(saved.tracks[0].clips[0].appearance.values.x>680);
  await page.getByRole('button',{name:'编辑片段位置与变换',exact:true}).click();await iframe.waitFor({state:'detached'});assert.equal(await picture.evaluate(n=>n.style.pointerEvents),'none');
 }
 assert.deepEqual(errors,[]);console.log('PASS video + declared-viewport OpenFilm native handles: proxy alignment, live drag, commit, pointer release');
}finally{await browser.close();}
