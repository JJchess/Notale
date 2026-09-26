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
