<sample id="motif-match" category="general" variant="mini">
  <file path="samples/general/motif-match/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>共享旋律 mini</title>
<link rel="stylesheet" href="assets/base.css">
</head>
<body><div id="stage" data-phase="build">
<h1>四个音，共用一组音程</h1><main>
 <section><h2>先听四个音</h2><div class="references">
  <button class="clip" data-clip="u" aria-pressed="false"><strong>“UNLIMITED”</strong>
   <span class="rail"></span></button>
  <button class="clip" data-clip="r" aria-pressed="false"><strong>“OVER THE RAINBOW”</strong>
   <span class="rail"></span></button>
 </div></section>
 <section><h2>构造音程 <span class="target">目标 <b>+12</b><b>-1</b><b>-4</b></span></h2>
  <div id="slots"></div><div class="feedback">
   <div id="message" role="status" aria-live="polite"></div><div id="audioState"></div></div>
  <div class="actions"><button id="check" data-action="check">检验音程</button><button data-action="reset">重置</button></div>
 </section>
 <section class="piano-wrap"><h2>先选音位，再按琴键</h2>
  <div class="piano" aria-label="C4 到 D5 的可弹奏钢琴"></div></section>
</main></div>
<script src="assets/base.js"></script><script src="app.js"></script>
</body></html>
```
  </file>
  <file path="samples/general/motif-match/mini/pages/app.js">
```javascript
(() => {
const REFERENCE=[60,72,71,67],TARGET=[12,-1,-4];
const CLIPS={u:[5512,2042,2834,3622,3893],r:[6949,784,2042,3376,4326]};
const NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const [stage,slots,message,audioState,check,piano]=
 ["#stage","#slots","#message","#audioState","#check",".piano"]
 .map(selector=>document.querySelector(selector));
const clips=[...document.querySelectorAll(".clip")];
let state=initialState(),audio,oscillator,activeNote;
let audioOff=new URLSearchParams(location.search).get("audio")==="off";
let disposed=false,timers=[];

function initialState(round=0){
 return {phase:round?"transfer":"build",round,notes:[round?62:60,null,null,null],
  selected:1,clip:null,markers:[0,0,0,0]};
}
const noteName=note=>NAMES[note%12]+(Math.floor(note/12)-1);
const signed=value=>(value>0?"+":"")+value;
const intervals=()=>state.notes.slice(1).map((note,index)=>
 note==null||state.notes[index]==null?null:note-state.notes[index]);
const deviations=()=>intervals().map((gap,index)=>gap==null?null:gap-TARGET[index]);
function later(callback,delay){timers.push(setTimeout(callback,delay))}

function playTone(note){
 activeNote=note;
 try{oscillator?.stop()}catch{}
 if(!audioOff)try{
  audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();
  const gain=audio.createGain(),now=audio.currentTime;
  oscillator=audio.createOscillator();oscillator.type="triangle";
  oscillator.frequency.value=440*2**((note-69)/12);
  gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+.25);
  oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(now+.27);
 }catch{audioOff=true;audioState.textContent="声音不可用。音程检验仍可使用。"}
 renderKeys();
 later(()=>{if(activeNote===note)activeNote=null;renderKeys()},280);
}
function stopActivity(){
 timers.forEach(clearTimeout);timers=[];
 try{oscillator?.stop()}catch{} oscillator=null;activeNote=null;
 state.clip=null;state.markers.fill(0);
}
function playClip(name){
 stopActivity();
 const [duration,...times]=CLIPS[name];state.clip=name;render();
 times.forEach((time,index)=>later(()=>{
  state.markers[index]=true;playTone(REFERENCE[index]);
 },time));
 later(()=>{state.clip=null;render()},duration);
}
function chooseNote(note){
 stopActivity();state.notes[state.selected]=note;
 state.selected=Math.min(3,state.selected+1);
 if(/missing|error|edited/.test(state.phase))state.phase="edited";
 render();playTone(note);
}
function evaluate(){
 stopActivity();
 state.phase=state.notes.includes(null)?"missing":deviations().some(Boolean)?"error":
  state.round?"complete":"success";
 render();
}
function reset(round=0){stopActivity();state=initialState(round);render()}

function render(){
 const gaps=intervals(),errors=deviations();
 slots.innerHTML=state.notes.map((note,index)=>{
  const gap=index?gaps[index-1]:null,error=index?errors[index-1]:null;
  const detail=gap==null?"":signed(gap)+(error?` 偏 ${signed(error)}`:"");
  const interval=index?`<span class="interval ${error?"bad":""}">${detail}</span>`:"";
  const action=index?`data-action="slot" data-index="${index}"`:"disabled";
  return `${interval}<button class="slot ${state.selected===index?"selected":""}" ${action}>`
   +(note==null?"?":noteName(note))+"</button>";
 }).join("");
 const missing=state.notes.map((note,index)=>note==null?index+1:0).filter(Boolean);
 if(state.phase==="missing")message.textContent=`还缺第 ${missing.join("、")} 音。选中空位再按琴键。`;
 else if(/error|edited/.test(state.phase))message.textContent=errors.some(Boolean)?
  "红色音程标出偏差。选中相邻音再改。":"偏差归零，可以再次检验。";
 else if(state.phase==="success")message.textContent="偏差归零。换到 D4，保持同一结构。";
 else if(state.phase==="complete")message.textContent="迁移完成：D4 起，+12、-1、-4 保持不变。";
 else message.textContent="";
 audioState.textContent=audioOff?"声音不可用。音名和音程检验仍可使用。":"";
 check.textContent=state.phase==="success"?"换到 D4":"检验音程";
 check.dataset.action=state.phase==="success"?"transfer":"check";
 stage.dataset.phase=state.phase;renderKeys();
}
function renderKeys(){
 [...piano.children].forEach(key=>key.classList.toggle("down",+key.dataset.note===activeNote));
 clips.forEach(button=>{
 button.setAttribute("aria-pressed",String(state.clip===button.dataset.clip));
  [...button.querySelectorAll(".marker")].forEach((marker,index)=>
   marker.classList.toggle("on",state.clip===button.dataset.clip&&Boolean(state.markers[index])));
 });
}
function buildWorld(){
 clips.forEach(button=>{
  const [duration,...times]=CLIPS[button.dataset.clip];
  button.querySelector(".rail").innerHTML=times.map((time,index)=>
   `<span class="marker" style="--x:${time/duration*100}%">${index+1}</span>`).join("");
 });
 let white=0;
 for(let note=60;note<=74;note++){
  const black=[1,3,6,8,10].includes(note%12);
  const left=black?(white-1)/9*100+7.2:white++/9*100,width=black?7.2:100/9;
  piano.insertAdjacentHTML("beforeend",`<button class="key ${black?"black":"white"}" `+
   `style="left:${left}%;width:${width}%" data-note="${note}" data-name="${noteName(note)}" `+
   `aria-label="${noteName(note)}"></button>`);
 }
}
function click(event){
 const control=event.target.closest("[data-clip],[data-note],[data-action]");
 if(!control)return;
 if(control.dataset.clip)return playClip(control.dataset.clip);
 if(control.dataset.note)return chooseNote(+control.dataset.note);
 const action=control.dataset.action;
 if(action==="slot")state.selected=+control.dataset.index;
 if(action==="check")evaluate();if(action==="transfer")reset(1);if(action==="reset")reset();
 render();
}
function dispose(){
 if(disposed)return;stopActivity();disposed=true;
 stage.removeEventListener("click",click);window.removeEventListener("pagehide",dispose);
 audio?.close().catch(()=>{});audio=null;
}
buildWorld();stage.addEventListener("click",click);
window.addEventListener("pagehide",dispose,{once:true});
window.MotifMini={reset,dispose,snapshot:()=>structuredClone(state)};
render();
})();
```
  </file>
</sample>
