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
