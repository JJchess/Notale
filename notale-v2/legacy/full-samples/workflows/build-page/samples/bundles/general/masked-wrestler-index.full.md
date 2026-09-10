<sample id="masked-wrestler-index" category="general" variant="full">
  <file path="samples/general/masked-wrestler-index/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masked Wrestlers · Sample</title><link rel="stylesheet" href="style.css"><script type="importmap">{"imports":{"d3-array":"./vendor/range.js"}}</script><body><header><a href="../../../../../index.html" target="_top">← Samples</a><strong>MASKED WRESTLERS</strong><button id="language">Lire en français</button></header><main><section class="intro"><div class="title" role="img" aria-label="An illustrated guide to masked wrestlers"></div><p>226 illustrated masks · Original archive, May 11, 2020</p><p class="credit">Illustrations & research: Gwendal Uguen · Development: Russell Samora & Jan Diehm · Translation: Sonia Blinderman<br><a href="https://pudding.cool/2020/05/wrestling/" target="_blank" rel="noopener">The Pudding original ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section><section class="controls" aria-label="Filters"><label><span id="nationality-label">Nationality</span><select id="nationality"></select></label><label><span id="decade-label">Decade</span><select id="decade"></select></label><label><span id="theme-label">Theme</span><select id="theme"></select></label><button id="reset">Reset</button><output id="count" aria-live="polite"></output></section><div class="workspace"><aside id="profile" aria-label="Wrestler details"><button id="close">← Back to masks</button><canvas width="800" height="800" aria-label="Selected wrestler mask" role="img"></canvas><p id="crew"></p><h1 id="name"></h1><button id="more" aria-expanded="false">More info +</button><div id="info" hidden></div><div id="description"></div></aside><section id="grid" aria-label="Masks"></section></div></main><script type="module" src="app.js"></script></body></html>
```
  </file>
  <file path="samples/general/masked-wrestler-index/pages/app.js">
```javascript
import prepareTransition from './vendor/prepare-transition.js';
import move from './vendor/move.js';
const $=s=>document.querySelector(s), raw=await(await fetch('data.json')).json();
const data=raw.map((d,i)=>({...d,index:d.name_crew==='Author'?d.name_real[0]:i,x:+d.x,y:+d.y,decade:d.year_start?Array.from({length:(Math.floor(+(d.year_end||2020)/10)-Math.floor(+d.year_start/10))+1},(_,j)=>Math.floor(+d.year_start/10)*10+j*10):[],...Object.fromEntries(['nationality_en','nationality_fr','mask_theme_en','mask_theme_fr'].map(k=>[k,d[k].split(',').map(s=>s.trim()).filter(Boolean)]))}));
const sprite=new Image();sprite.src='assets/spritesheet.png';await sprite.decode();
let language='en',selected=data[0],frame,previous=[],lastButton;
const canvas=$('canvas'),ctx=canvas.getContext('2d'),scratch=document.createElement('canvas');scratch.width=scratch.height=80;const sc=scratch.getContext('2d');
const words={en:{nationality:'Nationality',decade:'Decade',theme:'Theme',all:'All',reset:'Reset',back:'← Back to masks',more:'More info +',less:'Biography',real:'Real name',aka:'Also known as',active:'Active years',present:'present (2020 archive)',masks:'matching masks'},fr:{nationality:'Nationalité',decade:'Décennie',theme:'Thème',all:'Tous',reset:'Réinitialiser',back:'← Retour aux masques',more:"Plus d’infos +",less:'Biographie',real:'Nom réel',aka:'Alias',active:'Années actives',present:'présent (archives 2020)',masks:'masques correspondants'}};
function setup(){const w=words[language];document.documentElement.lang=language;$('#language').textContent=language==='en'?'Lire en français':'Read in English';for(const key of ['nationality','decade','theme']){const field=key==='theme'?'mask_theme_'+language:key==='nationality'?key+'_'+language:key;const vals=[...new Set(data.flatMap(d=>d[field]))].sort((a,b)=>a<b?-1:a>b?1:0);const options=key==='decade'?['Pre-1950',...vals.filter(x=>x>=1950)]:vals;$('#'+key).replaceChildren(new Option(w.all,'label'),...options.map(v=>new Option(key==='decade'?v+'s':v,v)));$('#'+key+'-label').textContent=w[key]}$('#reset').textContent=w.reset;$('#close').textContent=w.back;render();show(selected,false,false)}
function match(d){for(const key of ['nationality','decade','theme']){let val=$('#'+key).value;if(val==='label')continue;if(d.name_crew==='Author')return false;if(key==='decade'){if(val==='Pre-1950'){if(Math.min(...d.decade)>=1950)return false}else if(!d.decade.includes(+val))return false}else if(!d[(key==='theme'?'mask_theme':key)+'_'+language].includes(val))return false}return true}
function render(){const sorted=[...data].sort((a,b)=>Number(!match(a))-Number(!match(b))||Number(typeof a.index==='string')-Number(typeof b.index==='string')||(a.id<b.id?-1:a.id>b.id?1:0));$('#grid').replaceChildren(...sorted.map(d=>{const b=document.createElement('button');b.className='mask'+(match(d)?'':' inactive');b.dataset.id=d.id;b.setAttribute('aria-label',d.name_wrestling||d.name_real);b.setAttribute('aria-pressed',d.id===selected.id);const f=document.createElement('figure');const size=matchMedia('(max-width:959px)').matches?72:80;f.style.backgroundPosition=`-${Math.round(d.x/(160/size))}px -${Math.round(d.y/(160/size))}px`;const n=document.createElement('small');n.textContent=typeof d.index==='number'?d.index+1:d.index;b.append(f,n);b.onclick=()=>show(d,true);return b}));$('#count').textContent=`${data.filter(match).length} / 226 ${words[language].masks}`;if(!match(selected)){const next=sorted.find(match);if(next)show(next,false)}}
function pixels(d){sc.clearRect(0,0,80,80);sc.drawImage(sprite,d.x,d.y,160,160,0,0,80,80);const a=sc.getImageData(0,0,80,80).data,ps=[];for(let i=0;i<a.length;i+=4)if(a[i+3])ps.push({index:i/4,x:i/4%80,y:Math.floor(i/4/80),rgb:`rgb(${a[i]},${a[i+1]},${a[i+2]})`});return ps}
function animate(d){cancelAnimationFrame(frame);const enter=pixels(d),exit=previous.map(p=>({...p}));previous=enter.map(p=>({...p}));if(matchMedia('(prefers-reduced-motion:reduce)').matches){ctx.clearRect(0,0,800,800);for(const p of enter){ctx.fillStyle=p.rgb;ctx.fillRect(p.x*10,p.y*10,10,10)}canvas.dataset.settled=d.id;return}delete canvas.dataset.settled;const live=prepareTransition({enter,exit,width:80,height:80,style:'fax'});function run(){const a=move(live.exit),b=move(live.enter);ctx.clearRect(0,0,800,800);for(let i=0;i<Math.max(live.enter.length,live.exit.length);i++)for(const p of [live.enter[i],live.exit[i]])if(p){ctx.fillStyle=p.rgb;ctx.fillRect(p.rx*10,p.ry*10,10,10)}if(a||b)frame=requestAnimationFrame(run);else canvas.dataset.settled=d.id}run()}
function show(d,open=true,draw=true){selected=d;const w=words[language];$('#name').textContent=d.name_wrestling||d.name_real;$('#crew').textContent=d.name_crew;$('#description').innerHTML=d['info_'+language];$('#description').querySelectorAll('span[data-id]').forEach(e=>{const aliases={'los_ice_creams_ice-cream_jr':'los_ice_creams_ice_cream_jr','black_tiger-ii':'black_tiger_ii','sicodelico_sr':'el_psicodelico_sr','el_espectro_del_ultratumba':'el_espectro_de_ultratumba','masked_canadian':'the_masked_canadian','_dr_wagner_sr':'dr_wagner_sr','rey-mysterio_jr':'rey_mysterio_jr','goobledy_gooker':'gobbledy_gooker','el_hijo_del_santor':'el_hijo_del_santo','los_psycho_circus_psycho_clown':'psycho_clown'};const original=e.dataset.id.toLowerCase();e.dataset.id=aliases[original]||original;if(!data.some(d=>d.id===e.dataset.id)){e.dataset.unavailable=e.dataset.id;e.removeAttribute('data-id');return}e.tabIndex=0;e.role='link';const go=()=>{const t=data.find(x=>x.id===e.dataset.id.toLowerCase());if(t)show(t)};e.onclick=go;e.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();go()}}});$('#description').querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener'});$('#info').replaceChildren(...[[w.real,d.name_real],[w.aka,d.name_alt],[w.nationality,d['nationality_'+language].join(', ')],[w.active,d.year_start?`${d.year_start} – ${d.year_end||w.present}`:'']].filter(x=>x[1]).map(([k,v])=>{const p=document.createElement('p'),a=document.createElement('strong'),b=document.createElement('span');a.textContent=k;b.textContent=v;p.append(a,b);return p}));$('#info').hidden=true;$('#description').hidden=false;$('#more').textContent=w.more;$('#more').setAttribute('aria-expanded','false');document.querySelectorAll('.mask').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===d.id));canvas.setAttribute('aria-label',d.name_wrestling||d.name_real);if(draw)animate(d);if(open&&matchMedia('(max-width:959px)').matches){lastButton=$(`.mask[data-id="${d.id}"]`);$('#profile').classList.add('open');$('#profile').setAttribute('role','dialog');$('#profile').setAttribute('aria-modal','true');document.body.style.overflow='hidden';$('#close').focus()}}
function close(){ $('#profile').classList.remove('open');$('#profile').removeAttribute('role');$('#profile').removeAttribute('aria-modal');document.body.style.overflow='';lastButton?.focus()}
$('#close').onclick=close;$('#more').onclick=()=>{const open=$('#info').hidden;$('#info').hidden=!open;$('#description').hidden=open;$('#more').textContent=words[language][open?'less':'more'];$('#more').setAttribute('aria-expanded',String(open))};$('#language').onclick=()=>{language=language==='en'?'fr':'en';setup()};$('#reset').onclick=()=>{for(const e of document.querySelectorAll('select'))e.value='label';render()};for(const e of document.querySelectorAll('select'))e.onchange=render;
document.addEventListener('keydown',e=>{if(!$('#profile').classList.contains('open'))return;if(e.key==='Escape')close();if(e.key==='Tab'){const es=[...$('#profile').querySelectorAll('button,a,[tabindex="0"]')].filter(e=>e.getClientRects().length),first=es[0],last=es.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});addEventListener('resize',()=>{if(!matchMedia('(max-width:959px)').matches)close();render()});setup();animate(selected);window.wrestling={data,match,show,get selected(){return selected}};
```
  </file>
  <file path="samples/general/masked-wrestler-index/pages/style.css">
```css
@font-face{font-family:National;src:url('assets/National2Web-Regular.woff2')}@font-face{font-family:National;src:url('assets/National2Web-Bold.woff2');font-weight:700}*{box-sizing:border-box}body{margin:0;background:linear-gradient(#4822f3,#17037c);background-attachment:fixed;color:white;font-family:National,Arial,sans-serif}header{height:52px;background:#17037c;display:flex;align-items:center;justify-content:space-between;padding:0 24px;gap:12px}a{color:inherit;text-underline-offset:4px}button,select{font:inherit;cursor:pointer}button{border:0;padding:8px 12px;background:#fff;color:#282828;box-shadow:3px 3px #000}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #fffd02;outline-offset:4px}header button{background:transparent;color:white;box-shadow:none}.intro{text-align:center;padding:28px 16px 20px}.intro img{width:min(460px,90%);image-rendering:pixelated}.intro p{margin:10px 0}.credit{font-size:13px;line-height:1.5;opacity:.85}.controls{display:flex;align-items:end;gap:16px;max-width:1460px;margin:auto;padding:12px 24px 24px;flex-wrap:wrap}.controls label{display:grid;gap:5px}.controls span{font-size:13px;text-transform:uppercase;letter-spacing:1px}.controls select{width:220px;max-width:100%;height:38px;padding:0 10px;color:#282828;border:0;border-radius:0}.controls button{height:38px}output{margin-left:auto;align-self:center}.workspace{display:grid;grid-template-columns:432px minmax(0,1fr);gap:20px;max-width:1460px;margin:auto;padding:0 24px 32px;align-items:start}#profile{position:sticky;top:16px;background:#fff;color:#282828;padding:16px 24px 24px;box-shadow:6px 6px #100255;max-height:calc(100vh - 32px);overflow-y:auto}canvas{display:block;width:100%;aspect-ratio:1;image-rendering:pixelated}#name{text-align:center;font-size:27px;margin:0 0 16px;line-height:1.1}#crew{text-align:center;font-style:italic;margin:0 0 8px}#more{display:block;margin:0 auto 12px;background:#fffd02;font-size:14px}#description{font-size:17px;line-height:1.4}#description a,#description span[data-id]{color:#282828;border-bottom:2px solid #f75a01;cursor:pointer}#info p{display:flex;gap:16px;justify-content:space-between;border-bottom:1px solid #ccc;padding:10px 0;margin:0}#info strong{font-size:12px;text-transform:uppercase}#info span{text-align:right}#grid{display:grid;grid-template-columns:repeat(auto-fill,80px);gap:16px;justify-content:center}.mask{position:relative;width:80px;height:80px;padding:0;box-shadow:none;background:#fff;transition:opacity .15s,transform .15s}.mask figure{margin:0;width:100%;height:100%;background-image:url('assets/spritesheet.png');background-size:1280px 1200px}.mask small{position:absolute;top:3px;right:4px;font-size:8px;color:#777}.mask.inactive{opacity:.25}.mask[aria-pressed=true]{outline:2px solid #f75a01;box-shadow:4px 4px #000;transform:scale(1.1);z-index:1}@media(hover:hover){.mask:hover{outline:2px solid #fffd02;transform:scale(1.1);z-index:2}}#close{display:none}@media(max-width:959px){header{padding:0 12px;font-size:12px}.intro{padding-top:20px}.controls{gap:12px;padding:12px 16px 24px}.controls label{width:calc(50% - 6px)}.controls select{width:100%}output{font-size:14px}.workspace{display:block;padding:0 16px 32px}#grid{grid-template-columns:repeat(auto-fill,72px);gap:16px}.mask{width:72px;height:72px}.mask figure{background-size:1152px 1080px}#profile{display:none;position:fixed;inset:0;z-index:10;max-height:100dvh;padding:18px 24px 32px;box-shadow:none;overflow:auto}#profile.open{display:block}#close{display:block;position:sticky;top:0;background:#fffd02;z-index:1;margin-bottom:10px}canvas{max-width:320px;margin:auto}#description,#info{max-width:480px;margin:auto}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
.title{width:min(360px,90%);aspect-ratio:2/1;margin:auto;background:url('assets/title.png') top/100% 200% no-repeat;image-rendering:pixelated}html[lang=fr] .title{background-position:bottom}.intro{padding-top:20px;padding-bottom:12px}#description span[data-unavailable]{border:0;cursor:default}
```
  </file>
  <file path="samples/general/masked-wrestler-index/pages/vendor/prepare-transition.js">
```javascript
import * as d3Array from "d3-array";

function generateSpeeds({ chunks, chunkType }) {
  const s = {};
  const base = 0.5;
  d3Array.range(chunks).map(a => {
    d3Array.range(chunks).map(b => {
      if (chunkType === "grains") {
        const y = (b / chunks) * 1.5;
        const r = (b / chunks) * Math.random() * 0.5;
        s[`${a}${b}`] = base + y + r;
      } else if (chunkType === "ordered")
        s[`${a}${b}`] = 0.25 + b * 0.25 + Math.random() * b * 0.25;
      else if (chunkType === "index") s[`${a}${b}`] = 2 + b / a;
    });
  });
  return s;
}

export default function prepareTransition({
  enter = [],
  exit = [],
  width,
  height,
  style = "fax",
  chunks = 2,
  chunkType = "index"
}) {
  const speeds =
    style === "sand" ? generateSpeeds({ chunks, chunkType }) : null;

  const setSpeed = (p, dir) => {
    switch (style) {
      case "fax":
        const base = dir === "exit" ? 2.5 : 1;
        p.speed = base + (p.y / height) * (p.y / height) * 3;
        break;

      case "sand":
        const x = Math.floor(p.x / (width / chunks));
        const y = Math.floor(p.y / (width / chunks));
        p.speed = speeds[`${x}${y}`];
        break;

      default:
        p.speed = 1;
        break;
    }
  };

  let l = enter.length;
  let i = 0;
  while (i < l) {
    const p = enter[i];

    // start render positions
    setSpeed(p, "enter");
    p.rx = p.x;
    // TODO maybe set 0 on scan?
    p.ry = -height + p.y;
    p.update = true;
    i++;
  }

  i = 0;
  l = exit.length;
  while (i < l) {
    const p = exit[i];

    setSpeed(p, "exit");
    p.ry = p.y;
    // TODO make more uniform?
    p.y = height + p.y + Math.floor(Math.random() * 0.25 * height);
    p.update = true;
    i++;
  }
  return { enter, exit };
}
```
  </file>
  <file path="samples/general/masked-wrestler-index/pages/vendor/move.js">
```javascript
export default function(pixels = []) {
  let i = 0;
  let l = pixels.length;
  let inProgress = false;
  while (i < l) {
    const p = pixels[i];
    if (p.update) {
      inProgress = true;
      p.ry += p.speed;
      if (p.y <= p.ry) {
        p.ry = p.y;
        p.update = false;
      }
    }
    i++;
  }
  return inProgress;
}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
</sample>
