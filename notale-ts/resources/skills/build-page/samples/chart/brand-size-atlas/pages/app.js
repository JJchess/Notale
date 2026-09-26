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
