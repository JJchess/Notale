<sample id="music-sample-pair" category="general" variant="mini">
  <file path="samples/general/music-sample-pair/mini/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>听见同一条低音线 · Music DNA</title><link rel="stylesheet" href="style.css"><body><main><section class="intro"><a class="back" href="../../../../../../index.html" target="_top">← Pudding Samples</a><p class="eyebrow">MUSIC DNA / 1981 → 1990</p><h1>听见同一条<br>低音线</h1><p class="description">一段熟悉的声音，怎样成为另一首歌的起点？先听 Queen &amp; David Bowie，再听 Vanilla Ice。</p><p class="caption">原作以这对歌曲说明声音的继承：<i>Under Pressure</i> 的低音线被用于 <i>Ice Ice Baby</i>。</p><div class="transport"><button id="sequence" disabled>顺序试听 A → B</button><button id="pause" disabled>暂停</button><button id="reset" disabled>回到开头</button></div><p id="status" role="status">正在载入两段音频…</p><label class="seek-label" for="seek">当前片段 <output id="clock">0.0 / 7.0 秒</output></label><input id="seek" type="range" min="0" max="7" value="0" step="0.01" disabled><p class="hint">点波形可定位；也可用滑块方向键微调。顺序试听结束后自动停止。</p><footer><a href="https://pudding.cool/2025/04/music-dna/" target="_blank" rel="noreferrer">The Pudding 原作 ↗</a><a href="SAMPLE.md">复核记录</a><span>Stephen Lurie · Jared Whalen</span></footer></section><section class="pair" aria-label="两段原始音频对照"><article class="track active" data-track="0"><header><button class="track-play" data-play="0" disabled aria-label="试听 A：Under Pressure">A · 试听</button><div><h2>Under Pressure</h2><p>Queen &amp; David Bowie (1981)</p></div></header><img src="assets/252744.jpeg" alt="Under Pressure 原唱片封面"><div class="wave" id="wave-0" aria-label="Under Pressure 波形"></div></article><div class="connection" aria-hidden="true"><div id="needle"></div></div><article class="track" data-track="1"><div class="wave" id="wave-1" aria-label="Ice Ice Baby 波形"></div><img src="assets/243164.jpeg" alt="Vanilla Ice 的 To the Extreme 原专辑封面"><header><button class="track-play" data-play="1" disabled aria-label="试听 B：Ice Ice Baby">B · 试听</button><div><h2>Ice Ice Baby</h2><p>Vanilla Ice (1990)</p></div></header></article><p class="clip-note">原作音频摘录：A 7 秒 · B 8.5 秒</p></section></main><script type="module" src="app.js"></script></body></html>
```
  </file>
  <file path="samples/general/music-sample-pair/mini/pages/app.js">
```javascript
import WaveSurfer from './vendor/wavesurfer.esm.js';
const $=s=>document.querySelector(s), names=['Under Pressure','Ice Ice Baby'];
const waves=[], player=new Audio(); player.preload='auto';
let active=0, sequence=false, ready=false, generation=0;
const files=['252744','243164'].map(id=>`assets/88888888057-${id}.mp3`);
function render(){
 const d=waves[active]?.getDuration()||7,t=player.currentTime||0;
 $('#seek').max=d;$('#seek').value=t;$('#clock').textContent=`${t.toFixed(1)} / ${d.toFixed(1)} 秒`;
 $('#pause').textContent=player.paused?'继续':'暂停';
 document.querySelectorAll('.track').forEach((e,i)=>e.classList.toggle('active',i===active));
 $('#needle').style.top=`${(active+t/d)/2*100}%`;
 if(ready) $('#status').textContent=`${sequence?'顺序试听 · ':''}${active?'B':'A'} · ${names[active]} · ${player.ended?'已结束':player.paused?'已暂停':'播放中'}`;
}
async function start(i, auto=true, time=0, keepSequence=false){
 const token=++generation;player.pause();active=i;if(!keepSequence)sequence=false;
 player.src=waves[i].getMediaElement().src;player.currentTime=time;waves[i].setTime(time);render();
 if(auto)try{await player.play();}catch(e){if(token===generation){sequence=false;$('#status').textContent='播放未能开始，请再次点击试听。';}}
}
player.addEventListener('timeupdate',()=>{waves[active]?.setTime(player.currentTime);render()});
for(const event of ['play','pause','loadedmetadata']) player.addEventListener(event,render);
player.addEventListener('ended',()=>{if(sequence&&active===0)start(1,true,0,true);else{sequence=false;render()}});
player.addEventListener('error',()=>{$('#status').textContent='音频加载失败，请刷新后重试。'});
$('#sequence').onclick=()=>{sequence=true;start(0,true,0,true)};
$('#pause').onclick=async()=>{if(player.paused){if(player.ended)player.currentTime=0;try{await player.play()}catch{$('#status').textContent='请点击歌曲试听按钮重试。'}}else player.pause()};
$('#reset').onclick=()=>{waves.forEach(w=>w.setTime(0));start(0,false)};
$('#seek').oninput=e=>{player.currentTime=Number(e.target.value);waves[active].setTime(player.currentTime);render()};
document.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>start(Number(b.dataset.play)));
document.addEventListener('visibilitychange',()=>{if(document.hidden){sequence=false;player.pause()}});
try{
 await Promise.all(files.map((url,i)=>new Promise((resolve,reject)=>{
 const w=WaveSurfer.create({container:`#wave-${i}`,url,volume:0,waveColor:i?'#a3c69b':'#fefbd7',progressColor:i?'#517D45':'#CBB600',height:28,barAlign:'center',normalize:true,barRadius:0});waves[i]=w;
 w.on('ready',resolve);w.on('error',reject);w.on('interaction',time=>{if(i!==active)start(i,false,time);else{player.currentTime=time;render()}});
 })));
 ready=true;document.querySelectorAll('button,input').forEach(b=>b.disabled=false);await start(0,false);
}catch{$('#status').textContent='音频或波形载入失败，请刷新重试。'}
window.samplePair={player,waves,get state(){return {active,sequence,ready}}};
```
  </file>
  <file path="samples/general/music-sample-pair/mini/pages/style.css">
```css
@font-face{font-family:Atlas;src:url(assets/AtlasGrotesk-Regular-Web.woff2)}@font-face{font-family:Atlas;src:url(assets/AtlasGrotesk-Bold-Web.woff2);font-weight:700}*{box-sizing:border-box}body{margin:0;background:#fdfaf2;color:#303030;font-family:Atlas,Arial,sans-serif}main{max-width:1120px;margin:auto;min-height:100vh;display:grid;grid-template-columns:1fr 1fr;gap:100px;padding:36px 55px;align-items:center}.intro{max-width:400px}.back{font-size:12px}.eyebrow{font-size:11px;letter-spacing:2px;margin-top:60px}h1{font-size:52px;line-height:1.2;letter-spacing:-2px;margin:22px 0}a{color:inherit;text-underline-offset:4px}.description{font-size:18px;line-height:1.8}.caption{font-size:14px;line-height:1.8;border-left:3px solid #cbb600;padding-left:15px;margin:26px 0}.transport{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;color:inherit;border:1px solid #9c9b92;background:transparent;cursor:pointer;padding:10px 12px;border-radius:2px;font-size:12px}button:disabled{opacity:.45;cursor:wait}#sequence{background:#303030;color:#fff;border-color:#303030}button:hover:enabled{box-shadow:0 0 0 1px currentColor}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #517d45;outline-offset:4px}#status{font-size:13px;min-height:22px;margin-top:20px}.seek-label{display:flex;justify-content:space-between;font-size:12px}input{width:100%;accent-color:#517d45;margin:15px 0}.hint,.clip-note{font-size:11px;color:#69695f;line-height:1.6}footer{font-size:11px;border-top:1px solid #d8d6cd;padding-top:20px;margin-top:36px;display:flex;gap:18px;flex-wrap:wrap}footer span{width:100%;color:#69695f}.pair{width:280px;justify-self:center}.track{width:100%}.track>img{display:block;width:100%;aspect-ratio:1;object-fit:contain;box-shadow:0 17px 20px #0000000d,0 8px 15px #0000000d,0 -2px 8px #0000000d}.track header{text-align:center;position:relative;margin:10px -30px}h2{font-size:20px;margin:0 0 2px}.track header p{font-size:17px;margin:0}.track-play{position:absolute;right:100%;top:5px;white-space:nowrap;padding:7px 9px}.track.active .track-play{background:#303030;color:white}.wave{height:34px;padding:3px 0;cursor:pointer;background:#eee7ac}.track:nth-of-type(2) .wave{background:#cadcc2}.connection{height:72px;width:6px;margin:auto;position:relative;background:linear-gradient(#cbb600,#517d45)}#needle{width:30px;height:9px;left:-12px;position:absolute;top:0;background:linear-gradient(#555,#eee 45%,#555 70%);box-shadow:0 2px 3px #5555;border:1px solid #777;transform:translateY(-4px)}.clip-note{text-align:center;margin-bottom:0}@media(min-width:900px) and (max-height:850px){.pair{width:260px}.connection{height:52px}main{padding-top:20px;padding-bottom:20px}}@media(max-width:800px){main{grid-template-columns:1fr;gap:42px;padding:28px 24px}.intro{max-width:500px;margin:auto;width:100%}.eyebrow{margin-top:30px}h1{font-size:42px}h1 br{display:none}.pair{width:min(260px,calc(100vw - 130px));margin-bottom:20px}.track-play{right:calc(100% + 4px);font-size:10px;padding:7px 5px}.track header{margin:10px 0}.track header h2{font-size:18px}.track header p{font-size:13px}.connection{height:62px}footer{margin-top:22px}}

.track{position:relative}.track:after{content:"";position:absolute;inset:0;background-image:url(assets/noise-light.png);pointer-events:none}

/* Keep the two recordings and transport within one 1600 × 900 slide. */
@media(min-width:1200px) and (min-height:700px){main{height:900px;min-height:0;max-width:1280px;gap:140px;padding:28px 60px}.pair{width:250px}.connection{height:60px}.eyebrow{margin-top:36px}footer{margin-top:24px}}
```
  </file>
  <omitted path="../../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
  <omitted path="assets/243164.jpeg">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
  <omitted path="assets/252744.jpeg">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
</sample>
