import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import sharp from '../../../notale-editor/node_modules/sharp/lib/index.js';
import {chromium} from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';assert.equal((await fetch(base+'/film')).status,200);
await mkdir('.local/motale-film/assets',{recursive:true});await writeFile('.local/motale-film/assets/mask-white.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="white"/></svg>');
const doc={kind:'film',schemaVersion:1,id:'masks',title:'遮罩',width:1280,height:720,frameRate:{numerator:30,denominator:1},sources:[{id:'s',kind:'image',title:'白色测试画面',uri:'/assets/mask-white.svg'}],tracks:[{id:'v',kind:'media',title:'画面',locked:false,hidden:false,muted:false,clips:[{id:'a',sourceId:'s',title:'画面',in:0,at:0,duration:150}]}],markers:[]};
const animationOnly=process.env.MOTALE_MASK_PHASE==='animation';
if(animationOnly)doc.tracks[0].clips[0].masks=[{id:'mask',values:{shape:'rect',x:25,width:50,height:100}}];
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(7000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/film');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'打开影片 JSON'}).click();await(await chooser).setFiles({name:'masks.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.locator('[data-clip-id="a"] .film-clip-body').click();
 const picture=page.locator('[data-preview-clip-id="a"]');await picture.locator('img').waitFor();
 const set=async(name,value)=>{await page.getByRole('combobox',{name:'遮罩属性',exact:true}).selectOption(name);const input=page.getByLabel('遮罩属性值',{exact:true});if(await input.evaluate(n=>n.tagName==='SELECT'))await input.selectOption(String(value));else{await input.fill(String(value));await input.press('Tab');}};
 const pixels=async()=>{await page.waitForTimeout(45);const {data,info}=await sharp(await picture.screenshot()).raw().toBuffer({resolveWithObject:true});return (x,y=.5)=>data[(Math.floor(y*(info.height-1))*info.width+Math.floor(x*(info.width-1)))*info.channels];};
 const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载工作副本'}).click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
 const seek=at=>page.locator('[data-role="seek"]').evaluate((node,at)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(at));node.dispatchEvent(new Event('input',{bubbles:true}));},at);
 let p;
 if(!animationOnly){
 await page.getByRole('button',{name:'添加椭圆遮罩',exact:true}).click();
 for(const shape of ['ellipse','rect','star','heart','linear','mirror']){
  await set('shape',shape);const p=await pixels();if(shape==='linear'){assert.ok(p(.5,.75)>240,shape);assert.ok(p(.5,.25)<30,shape);}else{assert.ok(p(.5,.6)>240,shape+' center');assert.ok(p(.05,.05)<30,shape+' corner');}
 }
 await set('shape','ellipse');await set('width',80);await set('height',20);await set('rotation',90);p=await pixels();assert.ok(p(.5,.1)>240,'ellipse rotation respects actual non-square geometry');assert.ok(p(.7,.5)<30);
 await set('rotation',0);await set('width',50);await set('height',80);await set('feather',40);p=await pixels();assert.ok(p(.75)>60&&p(.75)<220,`feather boundary ${p(.75)}`);assert.ok(p(.5)>240);assert.ok(p(.95)<30);
 await set('invert','inverse');p=await pixels();assert.ok(p(.5)<30);assert.ok(p(.95)>240);await set('invert','normal');await set('feather',0);
 await set('shape','rect');await set('x',25);await set('width',50);await set('height',100);
 await page.getByRole('button',{name:'添加矩形遮罩',exact:true}).click();await set('width',50);await set('height',100);
 for(const [combine,expected] of [['add',[1,1,1,0]],['subtract',[1,0,0,0]],['intersect',[0,1,0,0]],['exclude',[1,0,1,0]]]){
  await set('combine',combine);p=await pixels();[.125,.375,.625,.875].forEach((x,i)=>assert.ok(expected[i]?p(x)>240:p(x)<30,`${combine} at ${x}: ${p(x)}`));
 }
 await page.getByRole('button',{name:'删除遮罩',exact:true}).click();
 }
 await set('x',25);await page.getByRole('button',{name:'添加遮罩关键帧',exact:true}).click();await seek(60);await set('x',75);await seek(30);assert.equal(await page.getByLabel('遮罩属性值',{exact:true}).inputValue(),'50');p=await pixels();assert.ok(p(.5)>240&&p(.1)<30&&p(.9)<30);
 await seek(0);await page.getByLabel('遮罩关键帧缓动',{exact:true}).selectOption('custom');await page.getByLabel('遮罩贝塞尔 X1',{exact:true}).fill('.4');await page.getByLabel('遮罩贝塞尔 X1',{exact:true}).press('Tab');let saved=await download();assert.deepEqual(saved.tracks[0].clips[0].masks[0].keyframes.x[0].easing,[.4,0,.75,1]);await page.getByLabel('遮罩关键帧缓动',{exact:true}).selectOption('linear');
 await seek(30);await page.locator('[data-action="split"]').click();saved=await download();const right=saved.tracks[0].clips.find(c=>c.at===30);assert.equal(right.animationOffset,30);
 await page.getByRole('button',{name:'轨道设置：画面',exact:true}).click();await page.getByRole('checkbox',{name:'锁定轨道',exact:true}).check();await page.locator(`[data-clip-id="${right.id}"] .film-clip-body`).click();assert.equal(await page.getByRole('button',{name:'添加椭圆遮罩',exact:true}).isDisabled(),true);
 await page.screenshot({path:'.local/motale-film/masks.png'});assert.deepEqual(errors,[]);console.log(animationOnly?'PASS mask keyframes/custom easing/split/locked UI':'PASS six mask shapes + rotated ellipse + feather/inverse pixels + ordered add/subtract/intersect/exclude pixels + keyframes/split/locked UI');
}finally{await browser.close();}
