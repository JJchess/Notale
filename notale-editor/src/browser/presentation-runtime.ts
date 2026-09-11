import type {PresentationRole,PresentationRuntimeState,PresentationRuntimePatch} from '../domain/presentation.js';
import type {Slide} from '../domain/model.js';
export interface PresentationAdapter {capture:()=>unknown;apply:(value:any)=>void;subscribe?:(changed:()=>void)=>()=>void;pause?:()=>void;}
declare global {interface Window {__NOTALE_PRESENTATION_ADAPTERS__?:Record<string,PresentationAdapter>;}}
const copy=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='function'?undefined:v));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function presentationRuntime(context:{slide:Slide;send:(type:string,data:unknown)=>void;components:{state:()=>Record<string,string>;select:(id:string,state:string,animate:boolean)=>void};sceneApply:(id:string,value:any)=>void}){
 let enabled=false,role:PresentationRole='controller',applying=false,sound=false,last:PresentationRuntimeState|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const cleanup=new AbortController(),subscriptions=new Map<string,()=>void>();
 const get=(id:string)=>document.querySelector<HTMLElement>('[data-notale-id="'+CSS.escape(id)+'"]');
 const nodes=()=>[...document.querySelectorAll<HTMLElement>('[data-notale-id]')].filter(n=>!['SCRIPT','STYLE','LINK','META'].includes(n.tagName));
 function chart(node:HTMLElement){return window.__NOTALE_CHART_ENGINE__?.getInstanceByDom(node)??window.echarts?.getInstanceByDom(node);}
 function capture():PresentationRuntimeState{
  const value:PresentationRuntimeState={controls:{},components:context.components.state(),charts:{},scenes:{},media:{},dom:{},capabilities:[]};
  for(const node of nodes()){
   const id=node.dataset.notaleId!;
   if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement){if(node instanceof HTMLInputElement&&['file','password'].includes(node.type))continue;value.controls[id]={value:node.value,...(node instanceof HTMLInputElement?{checked:node.checked}:{})};}
   const instance=chart(node);if(instance){try{value.charts[id]=copy(instance.getOption());}catch{value.capabilities.push('无法同步图表 '+id);}}
   if(node instanceof HTMLMediaElement)value.media[id]={time:node.currentTime,paused:node.paused,rate:node.playbackRate,volume:node.volume,muted:node.dataset.notaleDesiredMuted==='true',at:Date.now()};
   // Only leaf author content is mirrored, never scripts or whole runtime subtrees.
   if(!node.querySelector('[data-notale-id]')&&!['CANVAS','VIDEO','AUDIO','IFRAME'].includes(node.tagName)&&!instance){
    const attributes=Object.fromEntries(['class','style','hidden','aria-pressed','aria-expanded','d','points','fill','stroke','transform','cx','cy','r','x','y','width','height'].map(name=>[name,node.getAttribute(name)]));
    value.dom[id]={attributes,...(!node.children.length?{text:node.textContent??''}:{})};
   }
  }
  for(const [id,hook] of Object.entries(window.__NOTALE_CHECKPOINTS__??{}))try{value.scenes[id]={kind:'checkpoint',value:hook.capture()};}catch{value.capabilities.push('场景状态暂不可读取');}
  for(const [id,hook] of Object.entries(window.__NOTALE_PRESENTATION_ADAPTERS__??{}))try{value.scenes[id]={kind:'adapter',value:copy(hook.capture())};}catch{value.capabilities.push('场景状态暂不可读取');}
  for(const scene of window.__NOTALE__.scenes??[])if(!value.scenes[scene.id]){const read=window.__NOTALE_SCENES__?.[scene.id];if(read)value.scenes[scene.id]={kind:'values',value:read()};if(scene.targets.some(id=>get(id)?.tagName==='CANVAS'))value.capabilities.push('此模拟需要状态适配器才能完整同步');}
  const supported=new Set([...Object.keys(value.charts),...Object.keys(value.scenes)]);
  for(const canvas of document.querySelectorAll('canvas'))if(![...supported].some(id=>get(id)?.contains(canvas))&&!canvas.closest('[_echarts_instance_]')&&!Object.values(window.__NOTALE__.scenes??[]).some(s=>(value.scenes[s.id] as any)?.kind!=='values'&&s.targets.some(id=>get(id)?.contains(canvas))))value.capabilities.push('此画布尚未声明双屏状态适配器');
  value.capabilities=[...new Set(value.capabilities)];return value;
 }
 function changes(next:PresentationRuntimeState):PresentationRuntimePatch{
  if(!last)return next;const patch:PresentationRuntimePatch={};
  for(const key of ['controls','components','charts','scenes','media','dom'] as const){const entries=Object.entries(next[key]).filter(([id,value])=>!same(last![key][id],value));if(entries.length)patch[key]=Object.fromEntries(entries) as never;}
  if(!same(last.capabilities,next.capabilities))patch.capabilities=next.capabilities;
  return patch;
 }
 function publish(full=false){if(!enabled||role!=='controller'||applying)return;const next=capture(),patch=full?next:changes(next);last=next;if(Object.keys(patch).length)context.send('presentation-runtime',{slideId:context.slide.id,patch,full});}
 function schedule(){if(!enabled||role!=='controller'||applying||timer)return;timer=setTimeout(()=>{timer=undefined;publish();},80);}
 function audio(){for(const el of document.querySelectorAll<HTMLMediaElement>('audio,video')){if(el.dataset.notaleDesiredMuted===undefined)el.dataset.notaleDesiredMuted=String(el.muted);el.muted=!sound||el.dataset.notaleDesiredMuted==='true';if(role==='preview')el.pause();}}
 function apply(patch:PresentationRuntimePatch){
  applying=true;
  try{
   for(const [id,control] of Object.entries(patch.controls??{})){const node=get(id);if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement){if(node.value!==control.value||(node instanceof HTMLInputElement&&node.checked!==control.checked)){node.value=control.value;if(node instanceof HTMLInputElement&&control.checked!==undefined)node.checked=control.checked;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}}}
   for(const [id,state] of Object.entries(patch.components??{}))if(context.components.state()[id]!==state)context.components.select(id,state,false);
   for(const [id,raw] of Object.entries(patch.scenes??{})){const state=raw as any;if(state.kind==='checkpoint')window.__NOTALE_CHECKPOINTS__?.[id]?.restore(state.value);else if(state.kind==='adapter')window.__NOTALE_PRESENTATION_ADAPTERS__?.[id]?.apply(state.value);else context.sceneApply(id,state.value);}
   for(const [id,option] of Object.entries(patch.charts??{})){const node=get(id),instance=node&&chart(node);if(instance)instance.setOption({...option as object,animation:false},{silent:true,lazyUpdate:false});}
   for(const [id,value] of Object.entries(patch.dom??{})){const node=get(id);if(!node)continue;if(value.text!==undefined&&node.textContent!==value.text&&!node.children.length)node.textContent=value.text;for(const [key,v] of Object.entries(value.attributes))if(['class','style','hidden','aria-pressed','aria-expanded','d','points','fill','stroke','transform','cx','cy','r','x','y','width','height'].includes(key)){if(v===null)node.removeAttribute(key);else node.setAttribute(key,v);}}
   for(const [id,value] of Object.entries(patch.media??{})){const el=get(id);if(!(el instanceof HTMLMediaElement))continue;el.playbackRate=value.rate;el.volume=value.volume;el.dataset.notaleDesiredMuted=String(value.muted);el.muted=!sound||value.muted;const time=value.time+(value.paused?0:Math.max(0,Date.now()-value.at)/1000*value.rate);if(el.readyState>=1&&Math.abs(el.currentTime-time)>.25)el.currentTime=Math.min(time,Number.isFinite(el.duration)?el.duration:time);if(value.paused||role==='preview')el.pause();else if(el.paused)void el.play().catch(()=>context.send('media-blocked',{target:id}));}
   if(role==='preview')for(const animation of document.getAnimations())animation.pause();
  }finally{applying=false;}
 }
 const interactive=(el:Element|null)=>!!el&&(!!el.closest('input,textarea,select,button,a,video,audio,canvas,[contenteditable="true"],[role="button"],[role="slider"],[_echarts_instance_]')||[...(context.slide.components??[]).map(c=>c.root),...Object.keys(context.slide.nativeCharts),...(window.__NOTALE__.scenes??[]).flatMap(s=>s.root?[s.root]:s.targets)].some(id=>get(id)?.contains(el)));
 document.addEventListener('keydown',event=>{if(!enabled||role!=='controller'||event.isComposing)return;const el=event.target as HTMLElement;if(el?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(el?.tagName))return;if(['ArrowRight','ArrowLeft','PageDown','PageUp',' ','Escape','Home','End','b','B','o','O','l','L','p','P','f','F'].includes(event.key)||((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))){event.preventDefault();event.stopImmediatePropagation();context.send('presentation-key',{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey});}},{capture:true,signal:cleanup.signal});
 let down:{x:number;y:number}|undefined;
 document.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};},{capture:true,signal:cleanup.signal});
 document.addEventListener('click',event=>{if(!enabled||role!=='controller'||event.defaultPrevented||interactive(event.target as Element)||!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>4)return;context.send('presentation-key',{key:'ArrowRight'});},{signal:cleanup.signal});
 let activity=0;document.addEventListener('pointermove',()=>{if(enabled&&Date.now()-activity>200){activity=Date.now();context.send('presentation-activity',{});}},{passive:true,signal:cleanup.signal});
 const notify=()=>schedule();
 for(const type of ['input','change','click','pointerup','play','pause','seeked','ratechange','timeupdate'])document.addEventListener(type,notify,{capture:true,signal:cleanup.signal});
 // Observe source-driven results, coalescing after a user interaction without polling the document.
 const observer=new MutationObserver(()=>{if(enabled&&role==='controller'&&!applying)schedule();});
 function attach(){for(const node of nodes()){const instance=chart(node),id=node.dataset.notaleId!;if(instance?.on&&!subscriptions.has('chart:'+id)){const event=()=>schedule();for(const type of ['legendselectchanged','datazoom','selectchanged','finished'])instance.on(type,event);subscriptions.set('chart:'+id,()=>{for(const type of ['legendselectchanged','datazoom','selectchanged','finished'])instance.off?.(type,event);});}}
 for(const [id,adapter] of Object.entries(window.__NOTALE_PRESENTATION_ADAPTERS__??{}))if(adapter.subscribe&&!subscriptions.has(id))subscriptions.set(id,adapter.subscribe(schedule));}
 return {capture,apply,receive(type:string,data:any){
  if(type==='presentation-config'){enabled=true;role=data.role;sound=!!data.sound;document.documentElement.dataset.notalePresentation=role;audio();attach();observer.disconnect();if(role==='controller')observer.observe(document.body,{subtree:true,childList:true,characterData:true});if(role==='preview')Object.values(window.__NOTALE_PRESENTATION_ADAPTERS__??{}).forEach(a=>a.pause?.());publish(true);return true;}
  if(type==='presentation-capture'){context.send('presentation-runtime',{slideId:context.slide.id,requestId:data.requestId,patch:capture(),full:true});return true;}
  if(type==='presentation-apply'){apply(data.patch);return true;}
  if(type==='presentation-sound'){sound=!!data.enabled;audio();return true;}
  if(type==='presentation-flush'){clearTimeout(timer);timer=undefined;publish(true);context.send('presentation-flushed',{requestId:data.requestId});return true;}
  return false;
 },stop(){observer.disconnect();cleanup.abort();clearTimeout(timer);subscriptions.forEach(fn=>fn());}};
}
