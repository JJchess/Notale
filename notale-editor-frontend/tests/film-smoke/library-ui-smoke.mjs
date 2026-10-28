import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';
assert.equal((await fetch(base+'/film')).status,200,'Candidate must be ready');
await mkdir('.local/motale-film/assets',{recursive:true});
await writeFile('.local/motale-film/assets/library-overlay.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect x="30" y="24" width="300" height="48" rx="8" fill="#282932"/><text x="50" y="56" font-family="sans-serif" font-size="24" fill="#e8e8f1">Motale · edited sequence</text></svg>');
const overlayKind=process.env.MOTALE_OVERLAY_KIND??'image';
assert.ok(['image','openfilm','overlay'].includes(overlayKind));
await writeFile('.local/motale-film/assets/library-overlay.html', '<!doctype html><html><body style="margin:0;background:transparent;color:white;font:24px sans-serif"><p style="position:absolute;left:30px;top:24px;background:#282932;padding:12px">OpenFilm overlay <span id="time"></span></p><script>window.film={width:1280,height:720,frame(t){document.getElementById("time").textContent=t.toFixed(2);window.filmDrawn=t;}}</script></body></html>');
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 const action=name=>page.locator(`[data-action="${name}"]`).click();
 const input=async(label,value)=>{const node=page.getByLabel(label,{exact:true});await node.fill(String(value));await node.press('Tab');};
 const seek=frame=>page.locator('[data-role="seek"]').evaluate((node,frame)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(frame));node.dispatchEvent(new Event('input',{bubbles:true}));},frame);
 const output=async()=>{const pending=page.waitForEvent('download');await action('download');const file=await pending;return JSON.parse(await readFile(await file.path(),'utf8'));};
 for(const sample of (process.env.MOTALE_SAMPLES?.split(',')??['motion','manim','whiteboard'])) {
  await page.goto(base+'/film');
  let doc,mainId,overlayId,overlayClip,at;
  if(sample==='motion'&&process.env.MOTALE_RESUME_TRACKS==='1'){
   doc=JSON.parse(await readFile('.local/motale-film/motion-three-acts.film.json','utf8'));
   const chooser=page.waitForEvent('filechooser');await action('open');await(await chooser).setFiles({name:'motion.film.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
   await page.getByRole('button',{name:'轨道设置：叠加图',exact:true}).waitFor();
   overlayId=doc.tracks[0].id;overlayClip=doc.tracks[0].clips[0].id;at=doc.markers[1].at;
   await seek(at);await page.locator('.film-pool-item').last().click();
   if(overlayKind==='image')await page.waitForFunction(()=>!!document.querySelector('.film-source img')?.complete);
   else await page.locator(`[data-preview-clip-id="${overlayClip}"] iframe`).waitFor();
  }else{
  const manifest=JSON.parse(await readFile(`fixtures/motale/${sample}/acts.json`,'utf8'));
  const importSample=async()=>{if(await page.locator('[data-role="sample"]').count()){await page.locator('[data-role="sample"]').selectOption(sample);await action('sample-import');}else{const details=page.locator('details').filter({has:page.locator('[data-role="motale-uri"]')});if(!await details.evaluate(n=>n.open))await details.locator('summary').click();await page.locator('[data-role="motale-uri"]').fill(`/fixtures/motale/${sample}/index.html`);const chooser=page.waitForEvent('filechooser');await action('motale-import');await(await chooser).setFiles({name:'acts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(manifest))});}};
  await importSample();
  await page.locator('.film-pool-item').waitFor();assert.equal(await page.locator('.film-clip').count(),0,'Import keeps timeline intact');
  const order=sample==='motion'?[3,1,2]:[0,2,1];
  for(const index of order){await page.locator('[data-role="source-act"]').selectOption(String(index));await action('source-append');}
  doc=await output();mainId=doc.tracks[0].id;
  if(doc.tracks[0].clips.length!==3)console.log('APPEND DIAGNOSTIC',await page.evaluate(async()=>({status:document.querySelector('[data-role="status"]').textContent,save:document.querySelector('[data-role="save-state"]').textContent,server:await fetch('/api/documents/'+new URL(location.href).searchParams.get('film')).then(r=>r.json())})));
  assert.deepEqual(doc.tracks[0].clips.map(c=>[c.in,c.duration]),order.map(i=>[manifest.acts[i].start,Math.floor((manifest.acts[i].end-manifest.acts[i].start)*30+1e-8)]));
  assert.equal(doc.tracks[0].clips[2].at,doc.tracks[0].clips[0].duration+doc.tracks[0].clips[1].duration);
  await importSample();assert.equal(await page.locator('.film-pool-item').count(),1,'Re-import reuses existing source');
  await action('source-remove');assert.match(await page.locator('[data-role="status"]').innerText(),/仍被片段使用/);
  await page.getByLabel('搜索素材',{exact:true}).fill('no-such-source');assert.equal(await page.locator('.film-pool-item').count(),0);
  assert.equal(await page.locator('[data-role="sources"]').innerText(),'没有匹配的素材');await page.getByLabel('搜索素材',{exact:true}).fill('');
  const overlaySeconds=manifest.acts[order[0]].end-manifest.acts[order[0]].start;
  if(overlayKind==='overlay'){
   await page.getByRole('button',{name:'下三分之一字幕条',exact:true}).click();
   await input('时长（帧）',Math.floor(overlaySeconds*30));await page.getByRole('button',{name:'完成对象编辑',exact:true}).click();await page.getByRole('button',{name:'轨道设置：下三分之一字幕条',exact:true}).click();await input('轨道名称','叠加图');
  }else{
   await action('track-add');await input('轨道名称','叠加图');
   await page.getByText('添加普通素材',{exact:true}).click();
   await page.locator('[name="kind"]').selectOption(overlayKind);await page.locator('[name="uri"]').fill(overlayKind==='image'?'/assets/library-overlay.svg':'/assets/library-overlay.html');
   await page.locator('[name="duration"]').fill(String(overlaySeconds));await page.getByRole('button',{name:'加入素材库',exact:true}).click();
   assert.equal(await page.locator('.film-track.media .film-clip').count(),3,'Media form only imports to library');await action('source-append');
  }
  doc=await output();overlayId=doc.tracks[0].id;overlayClip=doc.tracks[0].clips[0].id;
  assert.equal(doc.tracks[0].clips[0].at,0,'Append targets empty overlay track, not sequence end');
  assert.equal(doc.tracks[1].id,mainId);
  const sourceTime={motion:108,manim:32,whiteboard:30}[sample];at=(sourceTime-manifest.acts[order[0]].start)*30;
  await seek(at-30);await page.locator('[data-role="caption"]').fill(`${sample} · 剪辑字幕`);await action('caption');
  await seek(0);await action('mark');await input('标记名称','开场');
  await seek(at);await action('mark');await input('标记名称','观众接手');await input('标记位置（帧）',at+1);await input('标记位置（帧）',at);
  await action('marker-prev');assert.equal(await page.locator('[data-role="seek"]').inputValue(),'0');
  await action('marker-next');assert.equal(await page.locator('[data-role="seek"]').inputValue(),String(at));
  try {await page.waitForFunction(time=>[...document.querySelectorAll('.film-source:not([hidden]) iframe[src*="fixtures"]')].some(f=>f.contentWindow?.shell?.state().time===time),sourceTime,{timeout:12000});} catch(error) {console.log(await page.evaluate(()=>({status:document.querySelector('[data-role="status"]').textContent,position:document.querySelector('[data-role="seek"]').value,frames:[...document.querySelectorAll('iframe[src*="fixtures"]')].map(f=>({uri:f.src,hidden:f.parentElement.hidden,state:f.contentWindow?.shell?.state()}))})),errors);throw error;}

  if(overlayKind==='overlay')await page.frames().find(f=>f.url().includes('/film-overlay.html')).waitForFunction(()=>!!window.NotaleBridge);
  else await page.waitForFunction(({id,kind})=>{const node=document.querySelector(`[data-preview-clip-id="${id}"]`);const img=node?.querySelector('img');return kind==='image'?img?.complete&&img.naturalWidth>0:typeof node?.querySelector('iframe')?.contentWindow?.filmDrawn==='number';},{id:overlayClip,kind:overlayKind});
  assert.equal(await page.locator(`[data-preview-clip-id="${overlayClip}"]`).evaluate(node=>getComputedStyle(node).pointerEvents),'none');
  await page.waitForFunction(text=>document.querySelector('.film-subtitles').textContent===text,`${sample} · 剪辑字幕`);
  await action('play');await page.waitForFunction(at=>Number(document.querySelector('[data-role="seek"]').value)>at,at);
  const target=page.frames().find(f=>f.url().includes(`/fixtures/motale/${sample}/index.html`));assert.ok(target);
  const hit=await target.evaluate(()=>{
   for(let y=88;y<680;y+=16)for(let x=24;x<1250;x+=16){
    if([[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy])=>globalThis.shell.hitTest({x:x+dx,y:y+dy}))){
     const r=document.querySelector('#stage').getBoundingClientRect();return {x,y,rect:{x:r.x,y:r.y,width:r.width,height:r.height},before:globalThis.shell.state().activeBranch};
    }
   }return null;
  });assert.ok(hit,`${sample}: actual interactive object while playing`);
  const box=await page.locator(`[data-preview-clip-id="${doc.tracks.find(t=>t.id===mainId).clips[0].id}"] iframe`).boundingBox();
  const x=box.x+(hit.rect.x+hit.x/1280*hit.rect.width)*box.width/1280,y=box.y+(hit.rect.y+hit.y/720*hit.rect.height)*box.height/720;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+12,{steps:6});await page.mouse.up();
  await target.waitForFunction(before=>globalThis.shell.state().activeBranch!==before,hit.before);
  assert.match(await page.locator('[data-role="status"]').innerText(),/观众已接手/);
  assert.equal(await page.locator('[data-action="play"]').getAttribute('aria-pressed'),'false');
  doc=await output();await writeFile(`.local/motale-film/${sample}-three-acts.film.json`,JSON.stringify(doc,null,2));
  await page.screenshot({path:`.local/motale-film/${sample}-library.png`});
  console.log(`PASS ${sample}: import → three acts → ${overlayKind} overlay + subtitle → real pointer takeover during playback`);
  }
  if(sample==='motion'){
   await page.getByRole('button',{name:'轨道设置：叠加图',exact:true}).click();
   await page.getByLabel('隐藏轨道',{exact:true}).check();await page.waitForFunction(id=>document.querySelector(`[data-preview-clip-id="${id}"]`).hidden,overlayClip);
   await page.getByLabel('隐藏轨道',{exact:true}).uncheck();await page.getByLabel('静音轨道',{exact:true}).check();
   await page.getByRole('button',{name:'轨道下移',exact:true}).click();doc=await output();assert.equal(doc.tracks[1].id,overlayId);assert.equal(doc.tracks[1].muted,true);
   await page.getByRole('button',{name:'轨道上移',exact:true}).click();
   await page.getByRole('checkbox',{name:'锁定轨道',exact:true}).check();assert.equal(await page.getByRole('button',{name:'删除轨道及片段',exact:true}).isDisabled(),true);
   await page.getByRole('checkbox',{name:'锁定轨道',exact:true}).uncheck();
   await page.getByRole('button',{name:'删除轨道及片段',exact:true}).click();await page.waitForFunction(id=>!document.querySelector(`[data-preview-clip-id="${id}"]`),overlayClip);
   await action('source-remove');doc=await output();assert.equal(doc.sources.length,1);assert.equal(doc.tracks.filter(t=>t.kind==='media').length,1);
   assert.equal(doc.markers[1].title,'观众接手');assert.equal(doc.markers[1].at,at);
   await page.locator('.film-marker').last().click();await page.getByRole('button',{name:'删除标记',exact:true}).click();assert.equal((await output()).markers.length,1);
   for(const role of ['scroll','sources','inspector'])assert.equal(await page.locator(`[data-role="${role}"]`).evaluate(n=>getComputedStyle(n).overscrollBehavior),'none');
   assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
   console.log('PASS track order/hidden/muted/lock/delete + unused source removal + marker edit/navigation/delete + scroll CSS');
  }
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
