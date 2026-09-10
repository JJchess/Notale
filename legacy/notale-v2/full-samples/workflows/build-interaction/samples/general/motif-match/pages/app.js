(()=>{
"use strict";
Deck.init({keys:false});
const selectors=["#stage","#slots","#message","#check","#audioState",".piano"];
const [stage,slots,message,check,audioState,piano]=selectors.map(s=>document.querySelector(s));
const marks=[...document.querySelectorAll(".mark")];
const clips=[...document.querySelectorAll(".clip")];
const REFERENCE=[60,72,71,67];
const TARGET=[12,-1,-4];
const CLIPS={u:[5512,2042,2834,3622,3893],r:[6949,784,2042,3376,4326]};
const NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const KEYBOARD="zsxdcvgbhnjmq2w3er5t6y7u";
const forcedAudioOff=new URLSearchParams(location.search).get("audio")==="off";
const voices=new Map(),sounding=new Map(),captures=new Map();
let audio,mounted=false,audioOff=forcedAudioOff;
let frame=0,activity=0,timers=[],keys=[];
let eventController;
let phase,round,notes,selected,clip,progress,markers;
function freshState(round=0){
 phase=round?"transfer":"build";
 notes=[round?62:60,null,null,null];
 selected=1;
 clip=null;
 progress=0;
 markers=[false,false,false,false];
 return round;
}
round=freshState();
const noteName=midi=>NAMES[midi % 12]+(Math.floor(midi/12)-1);
const signed=value=>(value>0?"+":"")+value;
const intervals=()=>notes.slice(1).map((note,i)=> note==null||notes[i]==null?null:note-notes[i]);
const deviations=()=>intervals().map((value,i)=>value==null?null:value-TARGET[i]);
const hasEvidence=()=>/error|edited|success|complete/.test(phase);
function ensureAudio(){
 if(audioOff) return null;
 try{
  audio ||=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume();
  return audio;
 }catch{
  audioOff=true;
  render();
  return null;
 }
}
function stopVoice(id){
 const voice=voices.get(id);
 if(!voice) return;
 const [oscillator,gain]=voice,now=audio.currentTime;
 gain.gain.cancelScheduledValues(now);
 gain.gain.setTargetAtTime(1e-4,now,.03);
 oscillator.stop(now+.12);
 voices.delete(id);
}
function startVoice(note,id){
 stopVoice(id);
 const context=ensureAudio();
 if(!context) return;
 const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
 oscillator.type="triangle";
 oscillator.frequency.value=440*2 ** ((note-69)/12);
 gain.gain.setValueAtTime(1e-4,now);
 gain.gain.exponentialRampToValueAtTime(.2,now+.012);
 gain.gain.exponentialRampToValueAtTime(.012,now+2.4);
 oscillator.connect(gain).connect(context.destination);
 oscillator.start();
 voices.set(id,[oscillator,gain]);
}
function later(callback,delay){
 const timer=setTimeout(callback,delay);
 timers.push(timer);
}
function stopActivity(){
 const wasPlaying=Boolean(clip);
 activity++;
 timers.forEach(clearTimeout);
 timers=[];
 cancelAnimationFrame(frame);
 frame=0;
 for(const [id,key] of captures){
  captures.delete(id);
  if(key.hasPointerCapture?.(id)) key.releasePointerCapture(id);
 }
 voices.forEach(([oscillator])=>{ try{ oscillator.stop(); }catch{}});
 voices.clear();
 sounding.clear();
 clip=null;
 progress=0;
 if(wasPlaying) markers.fill(false);
 renderKeys();
}
function pressNote(note,id,learn=true){
 if(learn){
  if(clip) stopActivity();
  notes[selected]=note;
  selected=Math.min(3,selected+1);
  if(hasEvidence()) phase="edited";
  else if(phase==="missing") phase=round?"transfer":"build";
 }
 sounding.set(id,note);
 startVoice(note,id);
 render();
}
function releaseNote(id){
 sounding.delete(id);
 stopVoice(id);
 renderKeys();
}
function playClip(clipId){
 if(clip===clipId) return stopActivity();
 stopActivity();
 ensureAudio();
 const [duration,...markerTimes]=CLIPS[clipId],run=activity,started=performance.now();
 clip=clipId;
 progress=0;
 markers.fill(false);
 render();
 markerTimes.forEach((delay,index)=>later(()=>{
  if(run !==activity) return;
  markers[index]=true;
  const id=`s${index}`;
  pressNote(REFERENCE[index],id,false);
  later(()=>releaseNote(id),330);
 },delay));
 function updateProgress(now){
  if(run !==activity) return;
  const elapsed=now-started;
  progress=Deck.reduced()?100:Math.min(100,elapsed/duration*100);
  renderKeys();
  if(elapsed<duration) frame=requestAnimationFrame(updateProgress);
 }
 frame=requestAnimationFrame(updateProgress);
 later(()=>{
  if(run !==activity) return;
  clip=null;
  progress=0;
  render();
 },duration);
}
function update(type,index=0,step=0){
 const focusedSlot=document.activeElement?.dataset.i;
 if(/nudge|check|transfer|reset/.test(type)) stopActivity();
 if(type==="select") selected=index;
 if(type==="nudge"){
  const fallback=round?62:60;
  notes[index]=Math.max(60,Math.min(83,(notes[index]??fallback)+step));
  if(hasEvidence()) phase="edited";
 }
 if(type==="check") phase=notes.includes(null)?"missing"
 :deviations().some(Boolean)?"error":round?"complete":"success";
 if(type==="transfer") round=freshState(1);
 if(type==="reset") round=freshState();
 render();
 if(focusedSlot) slots.querySelector(`[data-i="${focusedSlot}"]`)?.focus();
 if(type==="check"&&!notes.includes(null)) playClip("r");
}
function renderKeys(){
 clips.forEach(button=>{
  const playing=clip===button.dataset.clip;
  button.classList.toggle("playing",playing);
  button.querySelector(".progress").style.width=playing?`${progress}%`:0;
 });
 marks.forEach((mark,i)=>mark.classList.toggle("show",markers[i]));
 const active=new Set(sounding.values());
 keys.forEach(key=>key.classList.toggle("down",active.has(Number(key.dataset.note))));
}
function render(){
 const gaps=intervals(),errors=deviations(),evidence=hasEvidence();
 let html="";
 notes.forEach((note,index)=>{
  if(index){
   const gap=gaps[index-1],error=errors[index-1];
   const detail=gap==null?"":signed(gap)+(evidence?` · 偏 ${signed(error)}`:"");
   html +=`<span class="interval ${evidence&&error?"bad":""}">${detail}</span>`;
  }
  html +=`<button class="slot ${selected===index?"selected":""}" ${index
  ?`data-a=s data-i=${index}`:""}>${note==null?"?":noteName(note)}</button>`;
 });
 slots.innerHTML=html;
 const errorText=errors.map((error,i)=>error
  ?`第${i+1}段：${signed(gaps[i])}，应为 ${signed(TARGET[i])}，偏 ${signed(error)} 半音`:"").filter(Boolean);
 const missing=notes.map((note,i)=>note==null?i+1:0).filter(Boolean);
 if(phase==="missing") message.textContent=`还缺第 ${missing.join("、")} 音。`;
 else if(phase==="error"||phase==="edited") message.textContent=errorText.length
 ?errorText.join("；")+"。选中对应音可局部修改。":"三段偏差均为 0；可再次检验。";
 else if(phase==="success") message.textContent="偏差均为 0。换起点再构造。";
 else if(phase==="complete") message.textContent="迁移完成：D4 起，+12、−1、−4 不变。";
 else message.textContent="";
 check.dataset.a=phase==="success"?"t":phase==="complete"?"p":"c";
 check.dataset.clip="r";
 check.textContent=phase==="success"?"换到 D4":phase==="complete"?"重放证据"
 :evidence?"重试检验":round?"检验迁移":"检验音程";
 audioState.textContent=audioOff?"声音不可用；按键、音名与音程证据仍完整。":"";
 stage.dataset.phase=phase;
 renderKeys();
}
function buildPiano(){
 let html="",white=0;
 for(let note=60; note<84; note++){
  const black=[1,3,6,8,10].includes(note % 12);
  const left=black?(white-1)/14*100+4.72:white++/14*100;
  const width=black?4.8:100/14,name=noteName(note);
  html +=`<button class="key ${black?"black":"white"}" style="left:${left}%;width:${width}%"`
  +` data-note=${note} data-name=${name} aria-label=${name}></button>`;
 }
 piano.innerHTML=html;
 keys=[...piano.children];
}
function pointerDown(event){
 const key=event.target.closest(".key");
 if(!key) return;
 event.preventDefault();
 const id=event.pointerId;
 pressNote(Number(key.dataset.note),`p${id}`);
 key.setPointerCapture(id);
 captures.set(id,key);
}
function pointerRelease(event){
 const id=event.pointerId,key=captures.get(id);
 if(!key&&!sounding.has(`p${id}`)) return;
 captures.delete(id);
 releaseNote(`p${id}`);
 if(event.type !=="lostpointercapture"&&key?.hasPointerCapture?.(id)) key.releasePointerCapture(id);
}
function click(event){
 const control=event.target.closest("[data-a]");
 if(control){
  const action=control.dataset.a;
  if(action==="play"||action==="p") playClip(control.dataset.clip);
  else if(action==="check"||action==="c") update("check");
  else if(action==="reset") reset();
  else if(action==="t") update("transfer");
  else if(action==="s") update("select",Number(control.dataset.i));
  return;
 }
 const key=event.target.closest(".key");
 if(key&&event.detail===0){
  const id=`f${key.dataset.note}`;
  pressNote(Number(key.dataset.note),id);
  later(()=>releaseNote(id),180);
 }
}
function keyDown(event){
 const slot=event.target.closest('[data-a="s"]');
 if(slot&&["ArrowUp","ArrowDown"].includes(event.key)){
  event.preventDefault();
  update("nudge",Number(slot.dataset.i),event.key==="ArrowUp"?1:-1);
  return;
 }
 const index=KEYBOARD.indexOf(event.key.toLowerCase());
 if(index<0||event.repeat||event.ctrlKey||event.metaKey||event.altKey) return;
 event.preventDefault();
 pressNote(60+index,`k${event.code}`);
}
function keyUp(event){
 if(KEYBOARD.includes(event.key.toLowerCase())) releaseNote(`k${event.code}`);
}
function releaseKeyboard(){
 [...sounding.keys()].filter(id=>id.startsWith("k")).forEach(releaseNote);
}
function bindEvents(){
 eventController=new AbortController();
 const options={signal:eventController.signal};
 stage.addEventListener("pointerdown",pointerDown,options);
 for(const type of ["pointerup","pointercancel","lostpointercapture"]){
  stage.addEventListener(type,pointerRelease,options);
 }
 stage.addEventListener("click",click,options);
 window.addEventListener("keydown",keyDown,options);
 window.addEventListener("keyup",keyUp,options);
 window.addEventListener("blur",releaseKeyboard,options);
 window.addEventListener("pagehide",dispose,{...options,once:true});
}
function unbindEvents(){
 eventController?.abort();
 eventController=null;
}
function init(){
 if(mounted) return;
 mounted=true;
 round=freshState();
 audioOff=forcedAudioOff;
 if(!piano.children.length) buildPiano();
 else keys=[...piano.children];
 bindEvents();
 render();
}
function reset(){
 if(mounted) update("reset");
}
function dispose(){
 if(!mounted) return;
 mounted=false;
 stopActivity();
 unbindEvents();
 if(audio){
  audio.close().catch(()=>{});
  audio=null;
 }
}
window.MotifMatch={init,reset,dispose};
init();
})();
