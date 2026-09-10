<sample id="brand-size-atlas" category="chart" variant="full">
  <file path="samples/chart/brand-size-atlas/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Same label, different measurements</title><link rel="stylesheet" href="style.css">
<main><header><a href="../../../../../index.html" target="_top">Pudding studies / 03</a><h1>Same label.<br>Different measurements.</h1><p>Women’s regular size charts, compared on one waistline axis.</p></header>
<section class="controls"><nav aria-label="Compare size labels"><button data-mode="all" aria-pressed="true">All sizes</button><button data-mode="8" aria-pressed="false">Size 8</button><button data-mode="L" aria-pressed="false">Large</button></nav><p id="summary" aria-live="polite"></p><p id="detail" aria-live="polite">Select a point to inspect its measurements.</p></section>
<p class="chart-hint">Waistline in inches · Swipe to explore →</p><div class="chart-scroll" tabindex="0" aria-label="Scroll across the brand comparison"><section id="chart" aria-label="Brand waistline comparison"><div id="rows"></div><div id="axis"></div><p class="axis-title">WAISTLINE IN INCHES</p></section></div>
<footer><span>Purple: brand charts · Blue: ASTM 2021 · Select a point for its recorded size range.</span><a href="https://pudding.cool/2026/02/womens-sizing/">Amanda Sakuma & Jan Diehm / The Pudding</a></footer></main><script src="app.js"></script></html>
```
  </file>
  <file path="samples/chart/brand-size-atlas/pages/app.js">
```javascript
// SizeChartJD.svelte: same regular-range filters, omissions, order, and 20–60 inch scale.
let data=[],mode='all',selected=null;
const $=s=>document.querySelector(s),numeric=d=>[...new Set([d.numericSizeMin,d.numericSizeMax].filter(v=>v!==null&&v!==undefined&&v!==''))].join('–');
function matches(d){return mode==='all'||(mode==='L'?d.alphaSize==='L':(d.numericSizeMin!=null&&+d.numericSizeMin<=8&&+(d.numericSizeMax??d.numericSizeMin)>=8))}
function render(){
 const map=new Map();data.forEach((d,i)=>{if(!map.has(d.brand))map.set(d.brand,[]);map.get(d.brand).push({...d,id:i})});
 const groups=[...map].sort((a,b)=>a[0]==='ASTM'?1:b[0]==='ASTM'?-1:Math.max(...a[1].map(d=>d.waistMax??d.waistMin))-Math.max(...b[1].map(d=>d.waistMax??d.waistMin)));
 const h=$('#chart').clientHeight,rowh=h/groups.length,x=v=>(v-20)/40*100;
 $('#rows').innerHTML='';
 groups.forEach(([brand,rows],i)=>{
  const min=Math.min(...rows.map(d=>d.waistMin)),max=Math.max(...rows.map(d=>d.waistMax??d.waistMin)),row=document.createElement('div');
  row.className=`row ${brand==='ASTM'?'astm':''}`;row.style.top=`${i*rowh}px`;row.style.setProperty('--rowh',`${rowh}px`);
  row.innerHTML=`<span class="brand" style="left:${x(min)}%;top:calc(50% - 14px)">${brand}</span><div class="line" style="left:${x(min)}%;width:${x(max)-x(min)}%"></div>`;
  rows.forEach(d=>{
   // Original draws range endpoints; preserve both, including their recorded numeric labels.
   const values=d.waistMax!=null&&d.waistMax!==d.waistMin?[d.waistMin,d.waistMax]:[d.waistMin];
   if(values.length>1){const pill=document.createElement('span');pill.className=`pill ${matches(d)?'':'faded'}`;pill.style.left=`${x(values[0])}%`;pill.style.width=`${x(values[1])-x(values[0])}%`;row.append(pill)}
   values.forEach((v,k)=>{const button=document.createElement('button');button.className=`dot ${matches(d)?'':'faded'} ${selected===d.id?'selected':''}`;button.style.left=`${x(v)}%`;
    button.setAttribute('aria-label',`${brand}, ${d.alphaSize||''}, size ${numeric(d)}, waist ${v} inches`);
    button.dataset.id=d.id;button.dataset.waist=v;
    if(mode!=='all'&&matches(d)&&k===0)button.innerHTML=`<span class="badge">${d.alphaSize||'Size'}${d.numericSizeMin!=null&&d.numericSizeMin!==''?' / '+d.numericSizeMin:''}</span>`;
    button.addEventListener('click',()=>{selected=d.id;document.querySelectorAll('.dot').forEach(b=>b.classList.toggle('selected',+b.dataset.id===selected));$('#detail').textContent=`${brand} · ${d.alphaSize||'Numeric size'} / ${numeric(d)} · Waist: ${d.waistMin}${d.waistMax!=null&&d.waistMax!==d.waistMin?'–'+d.waistMax:''}″ · ${d.dateCollected?'Collected '+d.dateCollected:'ASTM 2021'}`});
    row.append(button);
   });
  });$('#rows').append(row);
 });
 $('#axis').innerHTML=Array.from({length:41},(_,i)=>i+20).map(v=>`<div class="tick" style="left:${x(v)}%"><span>${v%5===0?`${v}″`:''}</span></div>`).join('');
 const active=data.filter(d=>d.brand!=='ASTM'&&matches(d));const min=Math.min(...active.map(d=>d.waistMin)),max=Math.max(...active.map(d=>d.waistMax??d.waistMin));
 $('#summary').textContent=mode==='all'?`${groups.length-1} brands and one standard. A size label is not a shared measurement.`:`${mode==='L'?'“Large”':'Size 8'} spans ${min}–${max} inches across these brand charts.`;
 document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));$('#chart').dataset.mode=mode;$('#chart').dataset.brands=groups.length;$('#chart').dataset.min=min;$('#chart').dataset.max=max;
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;selected=null;$('#detail').textContent='Select a highlighted point to inspect its measurements.';render()}));
fetch('data.json').then(r=>r.json()).then(rows=>{data=rows;render()}).catch(()=>$('#summary').textContent='Could not load the local data. Please reload.');
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,120)});
```
  </file>
  <file path="samples/chart/brand-size-atlas/pages/style.css">
```css
@font-face{font-family:Atlas;src:url(assets/Atlas-Regular.woff2)}:root{font-family:Atlas,Arial,sans-serif;color:#292929;background:white;--purple:#b67bdf;--blue:#92b7d7}*{box-sizing:border-box}body{margin:0;background-image:linear-gradient(#efefef 1px,transparent 1px),linear-gradient(90deg,#efefef 1px,transparent 1px);background-size:25px 25px}a{color:inherit}button{cursor:pointer;font:inherit;color:inherit}button:focus-visible,a:focus-visible{outline:3px solid #d66c29;outline-offset:4px}main{position:relative;height:100svh;min-height:760px;overflow:hidden}header{position:absolute;top:25px;left:3%}header>a{font:11px monospace;text-decoration:none}h1{font:bold clamp(24px,2.2vw,36px)/1.1 monospace;margin:13px 0}header p{font-size:13px}.controls{position:absolute;top:43px;right:3%;width:44%;max-width:620px}nav{display:flex;gap:8px}nav button{background:white;border:1px solid #ccc;border-radius:4px;padding:9px 18px;font:13px monospace}nav button[aria-pressed=true]{background:#f1e5f9;border:2px solid #a962d4;padding:8px 17px}#summary{font-size:15px;line-height:1.5;margin:13px 0 8px;min-height:22px}#detail{font:12px/1.5 monospace;color:#6a397f;min-height:36px;margin:0;max-width:610px}.chart-scroll{position:absolute;top:210px;bottom:110px;left:3%;right:3%}#chart{position:relative;width:100%;height:100%}#rows{position:absolute;inset:0}.row{position:absolute;height:var(--rowh);left:0;right:0;--color:var(--purple)}.row.astm{--color:var(--blue)}.brand{position:absolute;top:-13px;transform:translateY(-50%);font:bold 12px monospace;text-transform:uppercase;white-space:nowrap}.line{position:absolute;top:50%;height:2px;background:var(--color);opacity:.6}.dot{position:absolute;top:50%;width:18px;height:22px;transform:translate(-50%,-50%);padding:0;border:0;background:transparent;z-index:1}.dot::after{content:"";position:absolute;width:7px;height:7px;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--color)}.dot:hover::after,.dot:focus-visible::after,.dot.selected::after{width:12px;height:12px;background:#683183}.row.astm .dot:hover::after{background:#436c8f}.dot.faded{opacity:.22}.badge{pointer-events:none;position:absolute;left:50%;bottom:17px;transform:translateX(-50%);background:white;padding:5px 7px;font:10px/1.2 monospace;box-shadow:0 2px 7px #0001;border-radius:4px;color:#292929;white-space:nowrap}.badge b{font-weight:normal;display:block;border-bottom:1px solid #aaa;padding-bottom:2px;margin-bottom:2px}#axis{position:absolute;top:calc(100% + 8px);width:100%;height:35px;border-top:1px solid #222}.tick{position:absolute;height:6px;border-left:1px solid #888;font:12px monospace}.tick span{position:absolute;top:9px;transform:translateX(-50%)}.axis-title{position:absolute;top:calc(100% + 40px);font:bold 12px monospace;text-align:center;width:100%;margin:0}footer{position:absolute;bottom:18px;left:3%;right:3%;display:flex;justify-content:space-between;gap:24px;font-size:10px;color:#666}
@media(max-width:850px){header h1{font-size:26px}.controls{width:45%;top:34px}#summary{font-size:13px}header>p{max-width:260px;font-size:12px}.brand{font-size:10px}.chart-scroll{top:215px}nav button{padding:8px 12px;font-size:12px}nav button[aria-pressed=true]{padding:7px 11px}}
@media(max-width:600px){main{height:auto;min-height:1120px}header{left:20px;top:20px}h1{font-size:27px!important}header p{max-width:100%}.controls{top:190px;left:20px;right:20px;width:auto}.chart-scroll{top:370px;bottom:130px;left:20px;right:20px;overflow-x:auto;overflow-y:hidden;padding-top:5px;padding-bottom:65px}#chart{width:830px;height:100%}footer{bottom:18px;left:20px;right:20px;font-size:9px;line-height:1.5}footer span{max-width:210px}.brand{font-size:11px}#detail{font-size:11px}}
/* Preserve the original continuous size intervals, and keep annotations legible at 720p. */
main{min-height:680px}.pill{position:absolute;top:calc(50% - 3px);height:6px;border-radius:4px;background:var(--color);opacity:.38}.pill.faded{opacity:.16}.dot.faded{opacity:.45}.badge{bottom:16px;padding:4px 6px;font-size:10px;line-height:1;box-shadow:0 1px 5px #0002}
@media(min-width:601px) and (max-height:800px){.chart-scroll{top:185px;bottom:98px}.brand{font-size:10px}.badge{font-size:9px;padding:3px 4px;bottom:14px}footer{font-size:9px}}
@media(max-width:600px){main{min-height:1120px}}
.chart-hint{display:none}@media(max-width:600px){.chart-hint{display:block;position:absolute;top:335px;left:20px;font:10px monospace;color:#777}}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
</sample>
