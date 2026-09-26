import {diagramTheme as t} from '../../src/diagram-theme.js';
export const diagramNames:Record<string,string>={steps:'流程图一',compare:'对比图',pyramid:'金字塔图',cycle:'循环图一',matrix:'四象限图',timeline:'时间轴',cards:'列表图一',tree:'组织结构图'};
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const label=(s:string,x:number,y:number,w:number,size=28,color=t.ink,align='center')=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:600 ${size}px/1.4 ${t.font};color:${color};text-align:${align};white-space:pre-wrap">${esc(s)}</div>`;
const card=(x:number,y:number,w:number,h:number,fill=t.soft)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border:2px solid ${t.border};border-radius:18px;background:${fill}"></div>`;
const path=(d:string)=>`<svg style="position:absolute;inset:0;width:1040px;height:540px;pointer-events:none" viewBox="0 0 1040 540" fill="none" stroke="${t.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const number=(i:number,x:number,y:number)=>card(x,y,44,36,t.paper)+label(String(i+1).padStart(2,'0'),x,y+3,44,21,t.accent);
export function originalDiagram(kind:string,labels:readonly string[]):string {
 let s='';
 if(kind==='steps'){
  labels.forEach((v,i)=>{const x=32+i*250;s+=card(x,176,226,188)+number(i,x+20,198)+label(v,x+16,277,194);if(i<3)s+=path(`M${x+231} 270h14m-6-6 6 6-6 6`);});
 }else if(kind==='compare'){
  labels.slice(0,2).forEach((v,i)=>{const x=52+i*486;s+=card(x,74,450,392)+label(v,x+28,110,394,32,t.accent,'left');['核心特点','适用条件','需要权衡'].forEach((v,j)=>s+=path(`M${x+28} ${183+j*82}h394`)+label(v,x+28,203+j*82,394,25,t.ink,'left'));});
 }else if(kind==='pyramid'){
  const points=['520,42 656,176 384,176','368,192 672,192 814,332 226,332','210,348 830,348 982,498 58,498'];
  labels.forEach((v,i)=>{s+=`<svg style="position:absolute;inset:0;width:1040px;height:540px" viewBox="0 0 1040 540"><polygon points="${points[i]}" fill="${t.bands[3-i]}" stroke="${t.border}" stroke-width="2" stroke-linejoin="round"/></svg>`+label(v,310,[124,246,406][i],420);});
 }else if(kind==='cycle'){
  const positions=[[84,70],[624,70],[624,330],[84,330]];
  s+=path('M420 140h176m-9-9 9 9-9 9 M784 225v76m-9-9 9 9 9-9 M620 400H444m9-9-9 9 9 9 M244 315v-76m-9 9 9-9 9 9');
  positions.forEach(([x,y],i)=>s+=card(x,y,332,140)+number(i,x+22,y+22)+label(labels[i],x+84,y+51,220));
 }else if(kind==='matrix'){
  s+=path('M72 482V46m-8 10 8-10 8 10 M72 482h916m-10-8 10 8-10 8')+label('价值',14,14,100,20,t.muted)+label('实施难度：高 → 低',687,502,300,20,t.muted,'right');
  labels.forEach((v,i)=>{const x=102+(i%2)*444,y=64+Math.floor(i/2)*208;s+=card(x,y,416,182,t.bands[i%2+1])+label(v,x+24,y+69,368);});
 }else if(kind==='timeline'){
  s+=path('M114 250H926');
  labels.forEach((v,i)=>{const x=36+i*250;s+=card(x,288,218,100)+label(v,x+12,320,194)+number(i,x+87,166)+`<svg style="position:absolute;left:${x+99}px;top:240px;width:20px;height:20px" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="${t.paper}" stroke="${t.accent}" stroke-width="3"/></svg>`;});
 }else if(kind==='cards'){
  labels.forEach((v,i)=>{const x=40+i*328;s+=card(x,90,304,360)+number(i,x+24,116)+label(v,x+24,204,256,28,t.ink,'left')+label('填写内容或补充说明',x+24,330,256,22,t.muted,'left');});
 }else{
  s+=path('M520 184V250 M196 250H844 M196 250v72 M520 250v72 M844 250v72')+card(354,60,332,124)+label(labels[0],378,102,284,30,t.accent);
  labels.slice(1).forEach((v,i)=>{const x=48+i*324;s+=card(x,322,296,142)+label(v,x+24,373,248);});
 }
 return s;
}
