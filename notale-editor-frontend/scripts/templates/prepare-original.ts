import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const out=resolve('templates/original');
const ink='#29272e', muted='#77747e', purple='#7042dc', pale='#eee8fb', mint='#d9eee8', gold='#f6dc9a';
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const box=(x:number,y:number,w:number,h:number,fill:string,r=20)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${fill};border-radius:${r}px"></div>`;
const text=(value:string,x:number,y:number,w:number,size=26,color=ink,weight=500)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;line-height:1.35;color:${color};font-weight:${weight};white-space:pre-wrap">${escape(value)}</div>`;
const line=(x:number,y:number,w:number)=>box(x,y,w,3,'#d8d0e5',0);
const arrow=(x1:number,y1:number,x2:number,y2:number)=>{
 const left=Math.min(x1,x2)-10,top=Math.min(y1,y2)-10,w=Math.abs(x2-x1)+20,h=Math.abs(y2-y1)+20;
 const a=Math.atan2(y2-y1,x2-x1),endX=x2-left,endY=y2-top;
 const wing=(delta:number)=>`${endX-10*Math.cos(a+delta)} ${endY-10*Math.sin(a+delta)}`;
 return `<svg style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px" viewBox="0 0 ${w} ${h}" fill="none" stroke="${purple}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M${x1-left} ${y1-top} L${endX} ${endY} M${wing(.55)} L${endX} ${endY} L${wing(-.55)}"/></svg>`;
};
const specs=[
 {id:'N01',name:'从问题到发现',subtitle:'用一个好问题开始，让观察成为理解的起点。',labels:['提出问题','收集证据','形成解释','验证结论'],kind:'steps'},
 {id:'N02',name:'比较，找到关键差异',subtitle:'把共同点与差异放在一起，建立判断的依据。',labels:['方案 A','方案 B','适用条件','需要权衡'],kind:'compare'},
 {id:'N03',name:'从基础走向理解',subtitle:'先建立基础，再连接概念，最后迁移到新的情境。',labels:['迁移应用','连接概念','基础知识'],kind:'pyramid'},
 {id:'N04',name:'让反馈推动学习',subtitle:'每次尝试都留下证据，让下一次行动更有方向。',labels:['计划','行动','观察','调整'],kind:'cycle'},
 {id:'N05',name:'用两个维度看问题',subtitle:'定义清楚横纵坐标，再讨论不同情境中的选择。',labels:['深入探索','优先行动','暂缓处理','快速尝试'],kind:'matrix'},
 {id:'N06',name:'把过程讲清楚',subtitle:'用关键时刻组织叙述，让变化的原因变得可见。',labels:['起点','转折','突破','下一步'],kind:'timeline'},
 {id:'N07',name:'三条证据，一个结论',subtitle:'区分事实、解释与推论，建立可以讨论的论证。',labels:['观察到的事实','合理的解释','待验证的推论'],kind:'cards'},
 {id:'N08',name:'从整体到细节',subtitle:'先说明整体结构，再逐层展开，让听众始终知道位置。',labels:['核心主题','视角一','视角二','视角三'],kind:'tree'},
] as const;
function figure(kind:string,labels:readonly string[]){
 let html='';
 if(kind==='steps'||kind==='timeline'){
  html+=line(90,260,860);
  labels.forEach((label,i)=>{const x=30+i*260;html+=box(x,kind==='steps'?170:220,220,kind==='steps'?210:80,i%2?pale:mint,kind==='steps'?20:40)+text(String(i+1).padStart(2,'0'),x+24,kind==='steps'?192:238,170,24,purple,650)+text(label,x+24,kind==='steps'?270:330,220,28);});
 }else if(kind==='compare'){
  labels.slice(0,2).forEach((label,i)=>{const x=30+i*530;html+=box(x,50,480,440,i?pale:mint)+text(label,x+32,85,410,38,ink,650)+line(x+32,160,416)+text('核心特点\n\n适用条件\n\n需要权衡',x+32,198,410,28);});
 }else if(kind==='pyramid'){
  labels.forEach((label,i)=>{const w=300+i*250,x=(1040-w)/2;html+=box(x,45+i*155,w,130,[purple,pale,mint][i])+text(label,x+30,85+i*155,w-60,32,i===0?'#ffffff':ink,600);});
 }else if(kind==='cycle'){
  const positions=[[80,45],[600,45],[600,330],[80,330]];
  html+=arrow(440,120,580,120)+arrow(770,215,770,310)+arrow(580,405,440,405)+arrow(250,310,250,215);
  positions.forEach(([x,y],i)=>html+=box(x,y,340,150,i%2?mint:pale,75)+text(`${i+1}  ${labels[i]}`,x+55,y+52,260,32,ink,600));
 }else if(kind==='matrix'){
  html+=arrow(50,485,50,45)+arrow(70,495,1010,495)+text('价值 ↑',15,5,180,22,purple,600)+text('实施较难',70,510,300,20,muted)+text('实施较易 →',855,510,180,20,muted);
  labels.forEach((label,i)=>{const x=80+(i%2)*465,y=50+Math.floor(i/2)*225;html+=box(x,y,435,200,[pale,gold,'#f1f0f3',mint][i])+text(label,x+30,y+75,375,32,ink,600);});
 }else if(kind==='cards'){
  labels.forEach((label,i)=>{const x=20+i*345;html+=box(x,60,320,420,[pale,mint,'#fbefd3'][i])+text(String(i+1).padStart(2,'0'),x+28,90,260,54,purple,650)+text(label,x+28,200,260,30,ink,600)+text('写下支持这一点的\n例子或数据。',x+28,305,260,24,muted);});
 }else{
  html+=box(360,25,320,130,purple)+text(labels[0],400,67,240,32,'#fff',650)+box(519,155,3,95,'#d8d0e5',0)+line(170,248,700);
  labels.slice(1).forEach((label,i)=>{const x=20+i*345;html+=box(x+159,250,3,60,'#d8d0e5',0)+box(x,310,320,170,[pale,mint,'#fbefd3'][i])+text(label,x+35,375,250,32,ink,600);});
 }
 return html;
}
const root=(html:string,w:number,h:number)=>`<section data-template style="position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;color:${ink}">${html}</section>`;
const pageHtml=(html:string)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>html,body{margin:0;background:white}*{box-sizing:border-box}</style><body>${html}</body></html>`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
try{
 const page=await browser.newPage();const entries=[];
 for(const [index,spec] of specs.entries()){
  const diagram=figure(spec.kind,spec.labels);
  const sideLayout=index===1||index===3||index===7;
  const header=sideLayout?text(spec.kind==='cycle'?'让反馈\n推动学习':spec.kind==='tree'?'从整体\n到细节':'比较，\n找到关键差异',80,210,360,52,ink,650)+text(spec.subtitle,80,440,320,26,muted):text(spec.name,80,125,1420,60,ink,650)+text(spec.subtitle,80,215,1400,26,muted);
  const content=box(0,0,1600,900,index%3===1?'#fbfaf7':'#fff',0)+text('NOTALE  /  TEACHING STUDIO',80,55,1000,18,purple,600)+header+`<div style="position:absolute;left:${sideLayout?490:280}px;top:${sideLayout?200:300}px;width:1040px;height:540px">${diagram}</div>`+text('讲授 · 讨论 · 探索',80,850,700,18,muted)+text(String(index+1).padStart(2,'0'),1460,850,80,18,purple);
  for(const kind of ['page','diagram'] as const){
   const width=kind==='page'?1600:1040,height=kind==='page'?900:540,key=spec.id+(kind==='diagram'?'-diagram':'');
   await page.setViewportSize({width,height});await page.setContent(pageHtml(root(kind==='page'?content:diagram,width,height)));
   const html=await page.evaluate(key=>{const root=document.querySelector('[data-template]')!;[root,...root.querySelectorAll('*')].forEach((node,i)=>node.setAttribute('data-notale-id',`${key}-${i}`));return root.outerHTML;},key);
   await writeFile(resolve(out,key+'.html'),pageHtml(html));
   await writeFile(resolve(out,key+'.json'),JSON.stringify({id:spec.id,name:spec.name,width,height,html,fontCss:'',assets:[]},null,2)+'\n');
   await page.screenshot({path:resolve(out,key+'.png')});
  }
  entries.push({id:spec.id,name:spec.name,category:'teaching',width:1600,height:900,diagram:true,thumbnail:spec.id+'.png',source:'original-notale',provenance:'Created in scripts/templates/prepare-original.ts; no reference images or bundled fonts.'});
 }
 await writeFile(resolve(out,'manifest.json'),JSON.stringify({version:1,templates:entries},null,2)+'\n');
 console.log(`Created ${entries.length} original page templates and ${entries.length} standalone diagrams in ${out}`);
}finally{await browser.close();}
