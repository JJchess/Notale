<sample id="waistline-cohorts" category="chart" variant="mini">
  <file path="samples/chart/waistline-cohorts/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growing out of the size chart</title><link rel="stylesheet" href="style.css">
<main><header><a href="../../../../../index.html" target="_top">Pudding studies / 02</a><h1>Growing out of the size chart</h1><p>One distribution. Different ages. The same limited sizes.</p></header>
<nav aria-label="Age and clothing range"><button data-state="0" aria-pressed="true">10–11 / Junior’s</button><button data-state="1" aria-pressed="false">14–15 / Junior’s</button><button data-state="2" aria-pressed="false">14–15 / Women’s</button><button data-state="3" aria-pressed="false">20+ / Women’s</button></nav>
<p class="chart-hint">Waistline in inches · Swipe to explore →</p><section id="chart" tabindex="0" aria-label="Waistline distribution and clothing size ranges"><div id="bands"></div><div id="people"></div><div id="axis"></div><div class="axis-title">WAISTLINE IN INCHES</div></section>
<aside aria-live="polite"><p class="kicker" id="stage"></p><h2 id="headline"></h2><p id="description"></p><p id="median"></p></aside>
<footer><span>Illustrated distribution interpolated from study percentiles; figures are not individual participants.</span><a href="https://pudding.cool/2026/02/womens-sizing/">Amanda Sakuma & Jan Diehm / The Pudding</a></footer></main>
<script src="assets/d3.min.js"></script><script src="app.js"></script></html>
```
  </file>
  <file path="samples/chart/waistline-cohorts/pages/app.js">
```javascript
// Extracted model: IntroJD.svelte; original percentile data and layered PNG artwork.
const states=[
 {key:'value10_11',age:'10–11',range:"Junior's",year:'2015',title:'A medium at eleven.',text:'The median sits inside the junior’s medium band. The distribution already extends beyond the available size range.'},
 {key:'value14_15',age:'14–15',range:"Junior's",year:'2015',title:'Growing beyond junior’s.',text:'As the distribution moves to the right, more of it falls beyond the junior’s size chart. The bodies change; the range stays fixed.'},
 {key:'value14_15',age:'14–15',range:"Women's",year:'2021',title:'A different chart. The same people.',text:'Switching to women’s clothing moves the size bands, not the distribution. Compare how much of it now falls inside the chart.'},
 {key:'value20over',age:'20+',range:"Women's",year:'2021',title:'The middle has moved.',text:'For adult women, the median waistline is near the upper end of this standard’s range. Many bodies fall beyond the available sizes.'}
];
let dataset,current=0;
const chart=document.querySelector('#chart'),people=document.querySelector('#people'),bands=document.querySelector('#bands');
function avatarPaths(point,index,key){
 if(point.id==='p50')return [`${key==='value10_11'?'tween':'teen'}-avatar-bg.png`];
 const prefix=+point.percentile>=90?'24':+point.percentile>=70?'12':+point.percentile>=30?'2':'junior';
 // Deterministic wardrobe keeps the same person identifiable between states.
 return ['base','hair','bottom','top'].map((layer,j)=>`${prefix}-${layer}-${1+(index*7+j*3)%4}.png`);
}
function sizeBands(state){
 const rows=dataset.astm.filter(d=>d.year===state.year&&d.sizeRange===state.range);
 const grouped=[...d3.group(rows,d=>state.key==='value20over'?d.size:d.alphaSize)];
 return grouped.map(([name,items],i)=>({name,
  min:i?(+items[0].waist+d3.max(grouped[i-1][1],d=>+d.waist))/2:+items[0].waist-1,
  max:i===grouped.length-1?+items.at(-1).waist+1:(+items.at(-1).waist+d3.min(grouped[i+1][1],d=>+d.waist))/2}));
}
function render(){
 if(!dataset)return;const state=states[current],mobile=window.innerWidth<600,w=mobile?1000:chart.clientWidth,h=chart.clientHeight-(mobile?75:0),x=d3.scaleLinear([20,60],[0,w]);
 document.querySelector('main').classList.toggle('adult',current===3);
 const avatarHeight=window.innerWidth<600?58:Math.min(105,Math.max(74,h/6)),avatarWidth=avatarHeight*290/969;
 const data=dataset.points.filter(d=>d[state.key]!=='').map(d=>({...d,value:+d[state.key]}));
 data.forEach(d=>{if(d.id.startsWith('p')){d.fx=x(d.value);d.fy=h*.53+(d.id==='p50'?0:avatarHeight/2.5)}});
 const sim=d3.forceSimulation(data).force('x',d3.forceX(d=>x(d.value)).strength(window.innerWidth<600?5:1)).force('y',d3.forceY(h*.53).strength(.1)).force('collide',d3.forceCollide(avatarHeight/5).iterations(3)).alphaDecay(.02).stop();sim.tick(300);
 const med=data.find(d=>d.id==='p50'),ranges=sizeBands(state);
 bands.innerHTML=ranges.map(d=>`<div class="band ${med.value>=d.min&&med.value<d.max?'highlight':''}" style="left:${x(d.min)}px;width:${x(d.max)-x(d.min)}px"><span>${d.name}</span></div>`).join('');
 const visible=new Set(data.map(d=>d.id));[...people.children].forEach(el=>el.style.opacity=visible.has(el.dataset.id)?'1':'0');
 data.sort((a,b)=>Number(a.id==='p50')-Number(b.id==='p50')).forEach((d)=>{
  const index=dataset.points.findIndex(p=>p.id===d.id);let node=people.querySelector(`[data-id="${d.id}"]`);
  if(!node){node=document.createElement('div');node.className='person';node.dataset.id=d.id;people.append(node)}
  const featured=d.id==='p50';node.classList.toggle('featured',featured);node.style.width=`${avatarWidth}px`;node.style.height=`${avatarHeight}px`;node.style.transform=`translate(${d.x-avatarWidth/2}px,${d.y-avatarHeight/2}px)`;node.dataset.value=d.value;
  const imgs=avatarPaths(d,index,state.key);if(node.dataset.images!==imgs.join()){node.innerHTML=imgs.map(p=>`<img src="assets/${p}" alt="" draggable="false">`).join('')+(featured?'<span class="person-label">MEDIAN</span>':'');node.dataset.images=imgs.join()}
 });
 document.querySelector('#axis').innerHTML=d3.range(20,61).map(v=>`<div class="tick" style="left:${x(v)}px"><span>${v%5===0?`${v}″`:''}</span></div>`).join('');
 document.querySelector('#stage').textContent=`AGE ${state.age} / ${state.range.toUpperCase()} / ASTM ${state.year}`;
 document.querySelector('#headline').textContent=state.title;document.querySelector('#description').textContent=state.text;
 document.querySelector('#median').textContent=`Median waistline: ${med.value.toFixed(2)} inches`;
 document.querySelectorAll('nav button').forEach((b,i)=>b.setAttribute('aria-pressed',i===current));
 chart.dataset.state=current;chart.dataset.count=data.length;chart.dataset.median=med.value;
 if(mobile)chart.scrollLeft=Math.max(0,x(med.value)-chart.clientWidth*.48);
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{current=+b.dataset.state;render()}));
fetch('data.json').then(r=>r.json()).then(data=>{dataset=data;render()}).catch(()=>{document.querySelector('#headline').textContent='Could not load the local data. Please reload.'});
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,120)});
```
  </file>
  <file path="samples/chart/waistline-cohorts/pages/style.css">
```css
@font-face{font-family:Atlas;src:url(assets/Atlas-Regular.woff2)}:root{font-family:Atlas,Arial,sans-serif;color:#292929;background:white;--blue:#8eb3d1;--orange:#e87729}*{box-sizing:border-box}body{margin:0;background-image:linear-gradient(#eee 1px,transparent 1px),linear-gradient(90deg,#eee 1px,transparent 1px);background-size:25px 25px}a{color:inherit}button{font:inherit;cursor:pointer;color:inherit}button:focus-visible,a:focus-visible{outline:3px solid #a359cb;outline-offset:4px}main{height:100svh;min-height:680px;position:relative;overflow:hidden}header{position:absolute;top:25px;left:3%;z-index:3}header>a{font:11px monospace;text-decoration:none}h1{font:700 clamp(23px,2vw,31px)/1.2 monospace;margin:13px 0 8px}header>p{font-size:13px;margin:0}nav{position:absolute;top:42px;right:3%;display:flex;gap:6px;z-index:4}nav button{padding:10px 12px;background:white;border:1px solid #c3c3c3;border-radius:4px;font:12px monospace}nav button[aria-pressed=true]{border:2px solid var(--orange);padding:9px 11px;background:#fff6ee}#chart{position:absolute;inset:155px 3% 110px}#bands,#people{position:absolute;inset:0}.band{position:absolute;top:0;height:100%;background:#8eb3d180;transition:left .6s,width .6s;min-width:0}.band:nth-child(odd){background:#8eb3d1a0}.band.highlight{outline:2px solid var(--orange);outline-offset:-2px}.band span{position:absolute;bottom:12px;width:100%;text-align:center;font:bold 12px monospace}.person{position:absolute;top:0;left:0;filter:grayscale(1);transition:transform 700ms cubic-bezier(.4,0,.2,1),opacity .4s}.person img{position:absolute;width:100%;height:100%;object-fit:contain}.person.featured{filter:none;z-index:2}.person-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);background:white;padding:8px;border-radius:4px;box-shadow:0 2px 5px #0002;font:bold 10px monospace;text-align:center;line-height:1.1;white-space:nowrap}#axis{position:absolute;top:100%;left:0;width:100%;height:34px;border-top:1px solid #222}.tick{position:absolute;border-left:1px solid #777;height:6px;font:12px monospace}.tick span{position:absolute;top:10px;transform:translateX(-50%);white-space:nowrap}.axis-title{position:absolute;top:calc(100% + 45px);width:100%;text-align:center;font:bold 12px monospace}aside{position:absolute;right:4%;top:25%;width:30%;max-width:435px;background:white;padding:25px 28px;box-shadow:0 3px 15px #00000012;border-radius:5px;z-index:3}aside .kicker{font:12px monospace;margin:0 0 16px;color:#777}aside h2{font:bold 24px/1.25 monospace;margin:0 0 18px}aside p{font-size:16px;line-height:1.65}#median{font:13px monospace;border-top:1px solid #ddd;padding-top:16px;margin-bottom:0}footer{position:absolute;left:3%;right:3%;bottom:18px;display:flex;justify-content:space-between;gap:25px;font:10px/1.5 Atlas,Arial,sans-serif;color:#666}footer span{max-width:550px}
@media(max-width:900px){nav{top:122px;left:3%;right:auto}header{top:18px}#chart{top:215px;bottom:115px}aside{top:230px;padding:16px;width:34%;right:4%}aside h2{font-size:18px}aside p{font-size:13px}.person-label{padding:5px;font-size:9px}}
@media(max-width:600px){main{min-height:950px}header{left:20px;right:20px}h1{font-size:25px}header>p{font-size:12px}nav{top:135px;left:20px;right:20px;display:grid;grid-template-columns:1fr 1fr}nav button{font-size:11px}#chart{top:440px;bottom:120px;left:30px;right:30px}aside{top:240px;left:20px;right:20px;width:auto;max-width:none;padding:16px 20px}aside .kicker{margin:0 0 8px}aside h2{font-size:19px;margin:0 0 8px}aside p{font-size:13px;margin:8px 0}#median{padding-top:8px;font-size:11px}.band span{font-size:9px}.person-label{font-size:8px}footer{font-size:9px}.tick span{font-size:10px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
/* Adult tails must remain visible beneath the note. */
@media(min-width:901px){.adult aside{top:112px;width:44%;max-width:660px;padding:16px 22px}.adult aside .kicker{margin-bottom:9px}.adult aside h2{font-size:22px;margin-bottom:8px}.adult aside p{font-size:14px;line-height:1.5;margin:8px 0}.adult #median{padding-top:9px;font-size:12px}}
@media(max-width:600px){main{min-height:1030px}nav{top:153px}aside{top:255px}#chart{top:482px;bottom:105px;left:20px;right:20px;overflow-x:auto;overflow-y:hidden;padding-bottom:75px}#bands,#people{width:1000px;height:calc(100% - 75px)}#axis{width:1000px;top:calc(100% - 75px)}.axis-title{width:1000px;top:calc(100% - 30px)}.chart-hint{display:block;position:absolute;left:20px;top:447px;font:10px monospace;color:#777}.band span{font-size:11px}}

.chart-hint{display:none}@media(max-width:600px){.chart-hint{display:block}}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="assets/d3.min.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
