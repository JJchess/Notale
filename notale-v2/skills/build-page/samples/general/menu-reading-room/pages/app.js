// Source model: SwiperStory.svelte / soupSlideXform; original scans from slides 7–9.
const $=s=>document.querySelector(s);let records=[],selected=2,mode='overview';const main=$('main'),desk=$('#desk');
const opening={title:$('#title').textContent,description:$('#description').textContent};
function render(){
 if(!records.length)return;const w=main.clientWidth,h=main.clientHeight,mobile=w<600,areaH=mobile?h*.53:h-100;
 main.classList.toggle('reading',mode!=='overview');main.classList.toggle('focal',mode==='focal');main.dataset.mode=mode;main.dataset.selected=selected;
 records.forEach((r,i)=>{const el=desk.children[i];let scale,tx,ty,rot=0;
  if(mode==='overview'){scale=mobile?areaH*.78/r.height:(h*.88)/r.height;tx=mobile?w*(.01+i*.23):w*(.1+i*.235);ty=mobile?100+i*14:80+(i%2)*35;rot=[-11,3,10][i]}
  else if(mode==='reading'){scale=Math.min(areaH/r.height,w*(mobile?.86:.58)/r.width);tx=(mobile?w*.5:w*.67)-r.width*scale/2;ty=mobile?76:60}
  else{scale=(mobile?w/r.width*1.7:w/r.width*.7);tx=(mobile?w*.5:w*.70)-r.focalX*scale;ty=(mobile?areaH*.38:areaH*.22)-r.focalY*scale+(mobile?70:50)}
  el.style.width=`${r.width}px`;el.style.transform=`translate(${tx}px,${ty}px) rotate(${rot}deg) scale(${scale})`;el.style.zIndex=i===selected?3:i;el.classList.toggle('active',i===selected);
  el.tabIndex=mode==='overview'||i===selected?0:-1;el.setAttribute('aria-hidden',mode!=='overview'&&i!==selected);el.querySelector('.caption').style.fontSize=`${12/scale}px`;
 });
 const r=records[selected];$('#label').textContent=mode==='overview'?'THE BUTTOLPH COLLECTION':r.label;$('#title').textContent=mode==='overview'?opening.title:r.title;$('#description').textContent=mode==='overview'?opening.description:r.description;
 $('#read').hidden=mode!=='overview';$('#focus').hidden=mode==='overview';$('#inspect').hidden=mode==='overview';$('#focus').textContent=mode==='focal'?'See the full menu':'Closer to the soup';
 document.querySelectorAll('nav button').forEach((b,i)=>b.setAttribute('aria-pressed',mode!=='overview'&&selected===i));
}
function choose(i){selected=i;mode='reading';render()}
fetch('data.json').then(r=>r.json()).then(data=>{records=data;records.forEach((r,i)=>{const b=document.createElement('button');b.className='document';b.setAttribute('aria-label',`Read ${r.label}`);b.innerHTML=`<img src="assets/${r.file}" alt="${r.label}" draggable="false"><span class="caption">${r.label}</span>${r.sourceSlide===7?`<img class="pointer" src="assets/pointer.png" alt="" style="left:${r.annotationX-90}px;top:${r.annotationY}px">`:""}`;b.onclick=()=>mode==='overview'?choose(i):openInspector();desk.append(b)});render()}).catch(()=>$('#description').textContent='The local scans could not load. Please reload.');
$('#read').onclick=()=>choose(2);$('#overview').onclick=()=>{mode='overview';render()};$('#focus').onclick=()=>{mode=mode==='focal'?'reading':'focal';render()};$('#inspect').onclick=openInspector;
 document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>choose(+b.dataset.index));
const dialog=$('dialog'),vp=$('#viewport'),original=$('#original');let zoom=1,fitScale=1,px=0,py=0,returnFocus=null;
function fit(){const r=records[selected];fitScale=Math.min((vp.clientWidth-30)/r.width,(vp.clientHeight-30)/r.height);zoom=1;px=(vp.clientWidth-r.width*fitScale)/2;py=(vp.clientHeight-r.height*fitScale)/2;draw()}
function draw(){const r=records[selected],s=fitScale*zoom;original.style.width=r.width+'px';original.style.transform=`translate(${px}px,${py}px) scale(${s})`;$('#zoom-label').value=Math.round(zoom*100)+'%';vp.dataset.zoom=zoom;}
function changeZoom(factor){const next=Math.min(5,Math.max(1,zoom*factor)),ratio=next/zoom;px=vp.clientWidth/2-(vp.clientWidth/2-px)*ratio;py=vp.clientHeight/2-(vp.clientHeight/2-py)*ratio;zoom=next;draw()}
function openInspector(){returnFocus=document.activeElement;original.src='assets/'+records[selected].file;original.alt=records[selected].label;$('#inspector-label').textContent=records[selected].label;dialog.showModal();fit();$('#close').focus()}
$('#plus').onclick=()=>changeZoom(1.4);$('#minus').onclick=()=>changeZoom(1/1.4);$('#fit').onclick=fit;$('#close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>returnFocus?.focus());
let drag=null;vp.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,px,py};vp.setPointerCapture(e.pointerId)};vp.onpointermove=e=>{if(!drag)return;px=drag.px+e.clientX-drag.x;py=drag.py+e.clientY-drag.y;draw()};vp.onpointerup=vp.onpointercancel=()=>drag=null;vp.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.12:1/1.12)},{passive:false});
document.addEventListener('keydown',e=>{if(dialog.open){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&document.activeElement===vp){e.preventDefault();px+=e.key==='ArrowLeft'?35:e.key==='ArrowRight'?-35:0;py+=e.key==='ArrowUp'?35:e.key==='ArrowDown'?-35:0;draw()}else if(e.key==='+'||e.key==='='){e.preventDefault();changeZoom(1.4)}else if(e.key==='-'){e.preventDefault();changeZoom(1/1.4)}return}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();choose((selected+(e.key==='ArrowRight'?1:2))%3)}});
let swipeX;desk.addEventListener('touchstart',e=>swipeX=e.touches[0].clientX,{passive:true});desk.addEventListener('touchend',e=>{if(Math.abs(e.changedTouches[0].clientX-swipeX)>60)choose((selected+(e.changedTouches[0].clientX<swipeX?1:2))%3)},{passive:true});
window.addEventListener('resize',()=>{render();if(dialog.open)fit()});
