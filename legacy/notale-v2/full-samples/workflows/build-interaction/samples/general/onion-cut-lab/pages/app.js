import Onion from './assets/onion.js';
const $=s=>document.querySelector(s),ns='http://www.w3.org/2000/svg';
const state={layers:10,cuts:10,type:'vertical',depth:0,explode:false};
let pieces=[],model;const svg=$('#diagram');paper.setup(new paper.Size(1,1));paper.view.autoUpdate=false;
function el(tag,attrs,parent=svg){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e}
function render(){
 paper.project.clear();svg.replaceChildren();
 model=new Onion({radius:240,numLayers:state.layers,numCuts:state.cuts,cutType:state.type,cutTargetDepthPercentage:state.depth/100,numHorizontalCuts:0});
 const layers=model.layerRadii.map(r=>{const p=r-model.layerThickness;return new paper.Path(`M ${r} 300 A ${r} ${r} 0 0 0 ${-r} 300 H ${-p} A ${p} ${p} 0 0 1 ${p} 300 z`)});
 const cuts=model.cutNumbers.map(c=>{if(state.type==='vertical'){const x=model.cutWidthScale(c);return new paper.Path(`M ${x} 300 V 0 h ${model.cutThickness} V 300 z`)}const t=c/state.cuts*Math.PI/2,u=(c+1)/state.cuts*Math.PI/2,d=model.cutTargetDepth;return new paper.Path(`M 0 ${300+d} L ${480*Math.sin(t)} ${300-480*Math.cos(t)-d} L ${480*Math.sin(u)} ${300-480*Math.cos(u)-d} z`)});
 const data=state.type==='vertical'?model.verticalAreas.flatMap(({cutX,pieceColumn},cutNum)=>pieceColumn.map(p=>({area:p.pieceArea,layerNum:model.layerRadii.indexOf(p.layerRadius),cutNum}))):model.radialAreas.flatMap(({pieces},layerNum)=>pieces.map(p=>({area:p.area,layerNum,cutNum:p.cutNum})));
 pieces=data.sort((a,b)=>b.area-a.area).map(p=>{const path=layers[p.layerNum].intersect(cuts[p.cutNum]);return {...p,path,bounds:path.bounds}});
 const guides=el('g',{class:'guides',id:'guides'});
 model.layerRadii.forEach(r=>el('path',{d:`M ${-r} 300 A ${r} ${r} 0 0 1 ${r} 300`},guides));
 el('line',{x1:-280,x2:280,y1:300,y2:300},guides);
 model.cutNumbers.forEach(c=>{let x1,x2,y2;if(state.type==='vertical'){x1=x2=model.cutWidthScale(c);y2=20}else{x1=0;x2=240*Math.sin(c/state.cuts*Math.PI/2);y2=300-240*Math.cos(c/state.cuts*Math.PI/2)}el('line',{x1,y1:300+(state.type==='radial'?model.cutTargetDepth:0),x2,y2,'stroke-dasharray':'2 3'},guides)});
 if(state.type==='radial'){el('circle',{cx:0,cy:300+model.cutTargetDepth,r:5,fill:'#891555'},guides);el('text',{x:12,y:305+model.cutTargetDepth,fill:'#50092f',stroke:'none','font-size':10},guides).textContent=`砧板下方 ${state.depth}%`}
 let x=-280,y=24,rowHeight=0;
 const maxDiff=Math.max(...pieces.map(p=>Math.abs(p.area-model.meanArea)));
 for(const p of pieces){const b=p.bounds;if(x+b.width>280){x=-280;y+=rowHeight+12;rowHeight=0}p.dx=x-b.x;p.dy=y-b.y;x+=b.width+12;rowHeight=Math.max(rowHeight,b.height);p.color=d3.interpolateHcl('#2B7679','#891555')(Math.abs(p.area-model.meanArea)/(maxDiff||1));p.node=el('path',{d:p.path.pathData,class:'piece','data-area':p.area});el('title',{},p.node).textContent=`面积 ${p.area.toFixed(2)} · 平均值的 ${(p.area/model.meanArea).toFixed(2)} 倍`}
 svg.dataset.explodedHeight=Math.max(340,y+rowHeight+24);
 $('#rsd').textContent=model.standardDeviationString+'%';$('#count').textContent=pieces.length+' 块 / 右半边';
 ['layers','cuts','depth'].forEach(k=>{$('#'+k).value=state[k];$('#'+k+'-out').textContent=state[k]+(k==='depth'?'%':'')});$('#depth').disabled=state.type!=='radial';document.querySelectorAll('[name=type]').forEach(e=>e.checked=e.value===state.type);
 const selected=state.layers===10&&state.cuts===10?(state.type==='vertical'?'vertical':({0:'center',60:'below',96:'optimal'}[state.depth])):null;document.querySelectorAll('[data-preset]').forEach(e=>e.setAttribute('aria-pressed',e.dataset.preset===selected));
 $('#caption').textContent=state.type==='vertical'?'垂直刀线在边缘留下较大的弯曲碎块。散开后，比较它们与中间窄条的大小。':state.depth===0?'刀线汇聚于圆心。外层碎块比内层更大，层数相同也不意味着大小相同。':`汇聚点下移到半径的 ${state.depth}%。${state.layers===10&&state.cuts===10&&state.depth===96?'这是原作在 10 层、10 等分、无水平刀条件下找到的最佳深度。':'观察右侧碎块的面积差异如何变化。'}`;
 display();window.onionDebug={state:{...state},rsd:model.standardDeviation,areas:pieces.map(p=>p.area),pathAreas:pieces.map(p=>Math.abs(p.path.area))};
}
function display(){for(const p of pieces){p.node.style.transform=state.explode?`translate(${p.dx}px,${p.dy}px)`:'translate(0px,0px)';p.node.style.fill=state.explode?p.color:'transparent';p.node.style.stroke=state.explode?'#50092f':'transparent'}$('#guides').style.opacity=state.explode?0:1;svg.setAttribute('viewBox',`-300 0 600 ${state.explode?svg.dataset.explodedHeight:state.type==='radial'?560:360}`);$('#explode').setAttribute('aria-pressed',state.explode);$('#explode').textContent=state.explode?'还原剖面 ↙':'散开碎块 ↗';$('#view-label').textContent=state.explode?'按面积从大到小 / 青色接近平均，紫红色偏离平均':'完整剖面 / 只分析对称的右半边'}
for(const k of ['layers','cuts','depth'])$('#'+k).addEventListener('input',e=>{state[k]=+e.target.value;render()});document.querySelectorAll('[name=type]').forEach(e=>e.addEventListener('change',()=>{state.type=e.value;render()}));document.querySelectorAll('[data-preset]').forEach(e=>e.addEventListener('click',()=>{Object.assign(state,{layers:10,cuts:10,type:e.dataset.preset==='vertical'?'vertical':'radial',depth:({vertical:0,center:0,below:60,optimal:96})[e.dataset.preset]});render()}));$('#explode').onclick=()=>{state.explode=!state.explode;display()};$('#reset').onclick=()=>{Object.assign(state,{layers:10,cuts:10,type:'vertical',depth:0,explode:false});render()};render();
