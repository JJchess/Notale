<sample id="wine-bottle-choice" category="general" variant="mini">
  <file path="samples/general/wine-bottle-choice/pages/index.html">
```html
<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pick a label · The Pour-igin of Species</title>
<link rel="stylesheet" href="style.css">
<main>
 <header><a href="../../../../../index.html" target="_top">Pudding studies / 01</a><span>The pour-igin of species</span><button id="reset" hidden>Choose again ↺</button></header>
 <section class="intro" aria-live="polite"><p class="eyebrow">An experiment in first impressions</p><h1>Which label would you pick?</h1><p id="prompt">Four bottles. A $40 budget. Choose by the animal on the label, then compare your impression with the data.</p><p id="instruction">Move across a bottle to turn it. Click to reveal.</p><div id="result" hidden></div></section>
 <div class="bottles" aria-label="Choose a wine bottle"></div>
 <footer><span>Source: <a href="https://pudding.cool/2025/04/wine-animals/">Fox Meyer & Jan Diehm / The Pudding, 2025</a></span><span>Original study prices & ratings</span></footer>
</main><script src="app.js"></script></html>
```
  </file>
  <file path="samples/general/wine-bottle-choice/pages/app.js">
```javascript
// Data: Intro.Bottles.svelte. Rotation: SpinningBottle.svelte, original 8-frame WebP strips.
const wines=[
 {animal:'cat',sprite:'lion',name:'Poppóne',winery:'Antonutti',price:34.99,rating:4.3,description:'The lion led you to Poppóne. This bottle is above the study’s median rating, and above its median price.'},
 {animal:'bird',sprite:'bird',name:'Sauvignon Blanc',winery:'Tomtit',price:22.67,rating:4.1,description:'You picked the songbird. This Tomtit bottle sits below the study’s median price and above its median rating.'},
 {animal:'pig',sprite:'pig',name:'Sus Scrofa',winery:'Pardas',price:20.83,rating:3.6,description:'You picked the pig. Sus Scrofa is less expensive than the study’s median, with a lower rating too.'},
 {animal:'amphibian/reptile',sprite:'frog',name:'Tïn Bianco',winery:'Montesecondo',price:39.99,rating:3.8,description:'You picked the frog. This bottle costs more than the study’s median, while its rating is lower.'}
];
const main=document.querySelector('main'),rack=document.querySelector('.bottles'),prompt=document.querySelector('#prompt'),title=document.querySelector('h1'),reset=document.querySelector('#reset'),result=document.querySelector('#result');
const initial=prompt.textContent;
function select(index){
 const wine=wines[index];main.classList.add('chosen');main.dataset.selected=wine.animal;
 [...rack.children].forEach((button,i)=>{button.classList.remove('entering');button.classList.toggle('selected',i===index);button.tabIndex=i===index?0:-1;button.setAttribute('aria-pressed',i===index);button.querySelector('.sprite').style.backgroundPosition='0 0'});
 title.textContent=wine.name;prompt.textContent=wine.description;
 result.innerHTML=`<div><strong>$${wine.price.toFixed(2)}</strong>Study price</div><div><strong>${wine.rating.toFixed(1)} / 5</strong>Study rating</div><div><strong>$29.99 / 4.0</strong>All-wine medians</div>`;
 result.hidden=false;reset.hidden=false;
}
wines.forEach((wine,i)=>{
 const b=document.createElement('button');b.className='bottle entering';b.style.setProperty('--left',`${20+i*20}%`);b.style.setProperty('--sprite',`url(assets/${wine.sprite}spin.webp)`);b.setAttribute('aria-label',`Choose ${wine.animal}: ${wine.winery} ${wine.name}`);b.setAttribute('aria-pressed','false');
 b.innerHTML=`<span class="sprite" aria-hidden="true"></span><span class="label">${wine.winery}<small>${wine.animal}</small></span>`;
 b.addEventListener('animationend',()=>b.classList.remove('entering'));
 b.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=b.getBoundingClientRect(),frame=Math.min(4,Math.max(0,Math.floor((e.clientX-r.left)/r.width*5)));b.querySelector('.sprite').style.backgroundPosition=`${(2-frame)*100}% 0`});
 b.addEventListener('pointerleave',()=>b.querySelector('.sprite').style.backgroundPosition='0 0');b.addEventListener('click',()=>select(i));rack.append(b);
});
reset.addEventListener('click',()=>{main.classList.remove('chosen');delete main.dataset.selected;title.textContent='Which label would you pick?';prompt.textContent=initial;result.hidden=true;reset.hidden=true;[...rack.children].forEach(b=>{b.classList.remove('selected');b.tabIndex=0;b.setAttribute('aria-pressed','false')});rack.children[0].focus()});
```
  </file>
  <file path="samples/general/wine-bottle-choice/pages/style.css">
```css
@font-face{font-family:National;src:url(assets/National-Regular.woff2)}@font-face{font-family:Tiempos;src:url(assets/Tiempos-Regular.woff2)}
:root{color-scheme:dark;--ink:#191b1f;--paper:#cbc7ba;--accent:#ffbb50;font-family:National,sans-serif;color:var(--paper);background:var(--ink)}*{box-sizing:border-box}body{margin:0}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit;color:inherit;cursor:pointer}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:7px}main{height:100svh;min-height:680px;position:relative;overflow:hidden}header{height:72px;display:flex;justify-content:space-between;align-items:center;margin:0 3%;border-bottom:1px solid #34363a;font-size:15px}header>span{position:absolute;left:50%;transform:translateX(-50%);font-family:Tiempos,serif}#reset{border:0;border-bottom:1px solid var(--accent);padding:4px 0;background:none;color:var(--accent)}.intro{position:relative;margin:30px auto 0;max-width:610px;text-align:center;z-index:3;padding:0 22px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:#9e9b92}h1{font:normal clamp(25px,2.6vw,40px)/1.15 Tiempos,serif;margin:14px 0}#prompt{font:18px/1.5 Tiempos,serif;margin:16px 0}#instruction{color:var(--accent);font-size:15px}.bottles{position:absolute;inset:0;pointer-events:none}.bottle{position:absolute;left:var(--left);bottom:11%;height:min(50svh,470px);aspect-ratio:1/3.5;transform:translateX(-50%);background:none;padding:0;border:0;pointer-events:auto;transition:left 850ms cubic-bezier(.4,0,.2,1),opacity 650ms;z-index:2}.bottle::before{content:"";position:absolute;background:black;inset:auto 3% 0;height:28px;filter:blur(22px);border-radius:50%;z-index:-1}.sprite{display:block;width:100%;height:100%;background-image:var(--sprite);background-size:auto 100%;background-repeat:repeat-x}.bottle .label{position:absolute;top:calc(100% + 18px);left:50%;transform:translateX(-50%);white-space:nowrap;font-size:15px}.label small{display:block;color:#858783;font-size:12px;margin-top:4px}.bottle:hover .label{color:var(--accent)}.bottle.entering .sprite{animation:spin 1.125s steps(8) 1}@keyframes spin{to{background-position:-800% 0}}.chosen .bottle{opacity:0;pointer-events:none}.chosen .bottle.selected{left:50%;opacity:1;pointer-events:auto}.chosen #instruction{display:none}.chosen .intro{margin-top:22px}.chosen .bottle{height:min(44svh,410px);bottom:10%}.chosen .label{display:none}#result{display:flex;justify-content:center;gap:28px;margin:14px auto}#result[hidden]{display:none}#result div{text-align:left;font-size:13px;color:#a6a296}#result strong{display:block;color:var(--accent);font:24px National,sans-serif;margin-bottom:3px}footer{position:absolute;bottom:20px;left:3%;right:3%;display:flex;justify-content:space-between;color:#96958e;font-size:11px}footer a{text-decoration:underline}
@media(max-width:700px){main{min-height:720px}header{font-size:12px;height:58px}header>span{display:none}.intro{margin-top:24px;max-width:450px}#prompt{font-size:16px}.bottle{height:34svh;max-height:310px;bottom:19%}.bottle .label{font-size:12px}.bottle .label small{display:none}footer{line-height:1.6;gap:25px;font-size:10px}.chosen .bottle{height:40svh;bottom:12%}.chosen .intro{margin-top:22px}#result{gap:18px}#result strong{font-size:21px}}
@media(prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}}
@media(min-width:701px) and (max-height:800px){.bottle .label small{display:none}.bottle{bottom:13%}.bottle .label{top:calc(100% + 14px)}}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
</sample>
