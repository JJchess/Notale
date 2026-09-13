import type {PresentationRole,PresentationRuntimeState,PresentationRuntimePatch} from '../domain/presentation.js';
import type {Slide} from '../domain/model.js';
export interface PresentationAdapter {capture:()=>unknown;apply:(value:any)=>void;subscribe?:(changed:()=>void)=>()=>void;pause?:()=>void;}
declare global {interface Window {__NOTALE_PRESENTATION_SOUND__?:boolean;__NOTALE_PRESENTATION_ADAPTERS__?:Record<string,PresentationAdapter>;}}
export function subscribePresentationChart(instance:{on:(type:string,handler:()=>void)=>unknown;off?:(type:string,handler:()=>void)=>unknown},changed:()=>void){
 const attached:string[]=[];let active=true;
 const stop=()=>{if(!active)return;active=false;const errors:unknown[]=[];for(const type of attached)try{instance.off?.(type,changed);}catch(error){errors.push(error);}if(errors.length)throw errors[0];};
 try{for(const type of ['legendselectchanged','datazoom','selectchanged','finished']){attached.push(type);instance.on(type,changed);}}catch(error){try{stop();}catch{/* Preserve the registration error after attempting all cleanup. */}throw error;}
 return stop;
}
type PresentationMedia=PresentationRuntimeState['media'][string];
export function samePresentationMedia(a:PresentationMedia|undefined,b:PresentationMedia):boolean {
 if(!a)return false;
 return a.time===b.time&&a.paused===b.paused&&a.rate===b.rate&&a.volume===b.volume&&a.muted===b.muted&&(a.paused||a.at===b.at);
}
export function hasPresentationSceneState(value:unknown):boolean {
 return !!value&&typeof value==='object'&&['checkpoint','adapter'].includes((value as {kind?:string}).kind??'');
}
const mirroredAttributes=['class','style','hidden','aria-pressed','aria-expanded','d','points','fill','stroke','transform','cx','cy','r','x','y','width','height'];
const canvasSyncNotice='部分互动动画可能与观众窗口不同步';
const copy=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='function'?undefined:v));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function presentationRuntime(context:{slide:Slide;getStep:()=>number;send:(type:string,data:unknown)=>void;components:{state:()=>Record<string,string>;select:(id:string,state:string,animate:boolean)=>void};sceneApply:(id:string,value:any)=>void}){
 let enabled=false,role:PresentationRole='controller',applying=false,sound=false,last:PresentationRuntimeState|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const cleanup=new AbortController(),subscriptions=new Map<string,{source:unknown;stop:()=>void}>();
 const get=(id:string)=>document.querySelector<HTMLElement>('[data-notale-id="'+CSS.escape(id)+'"]');
 const nodes=()=>[...document.querySelectorAll<HTMLElement>('[data-notale-id]')].filter(n=>!['SCRIPT','STYLE','LINK','META'].includes(n.tagName));
 function chart(node:HTMLElement){return window.__NOTALE_CHART_ENGINE__?.getInstanceByDom(node)??window.echarts?.getInstanceByDom(node);}
 function capture():PresentationRuntimeState{
  const subscriptionErrors=attach();
  const value:PresentationRuntimeState={step:context.getStep(),controls:{},components:context.components.state(),charts:{},scenes:{},media:{},dom:{},capabilities:subscriptionErrors};
  for(const node of nodes()){
   const id=node.dataset.notaleId!;
   if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement){if(node instanceof HTMLInputElement&&['file','password'].includes(node.type))continue;value.controls[id]={value:node.value,...(node instanceof HTMLInputElement?{checked:node.checked}:{})};}
   const instance=chart(node);if(instance){try{value.charts[id]=copy(instance.getOption());}catch{value.capabilities.push('无法同步图表 '+id);}}
   if(node instanceof HTMLMediaElement)value.media[id]={time:node.currentTime,paused:node.paused,rate:node.playbackRate,volume:node.volume,muted:node.dataset.notaleDesiredMuted==='true',at:Date.now()};
   // Mirror allowlisted author attributes; text only for leaves, never replace runtime subtrees.
   if(!['CANVAS','VIDEO','AUDIO','IFRAME'].includes(node.tagName)&&!instance){
    const attributes=Object.fromEntries(mirroredAttributes.map(name=>[name,node.getAttribute(name)]));
    value.dom[id]={attributes,...(!node.children.length?{text:node.textContent??''}:{})};
   }
  }
  for(const [id,hook] of Object.entries(window.__NOTALE_CHECKPOINTS__??{}))try{value.scenes[id]={kind:'checkpoint',value:hook.capture()};}catch{value.capabilities.push('场景状态暂不可读取');}
  for(const [id,hook] of Object.entries(window.__NOTALE_PRESENTATION_ADAPTERS__??{}))try{value.scenes[id]={kind:'adapter',value:copy(hook.capture())};}catch{value.capabilities.push('场景状态暂不可读取');}
  for(const scene of window.__NOTALE__.scenes??[])if(!value.scenes[scene.id]){const read=window.__NOTALE_SCENES__?.[scene.id];if(read)value.scenes[scene.id]={kind:'values',value:read()};if(scene.targets.some(id=>get(id)?.tagName==='CANVAS'))value.capabilities.push(canvasSyncNotice);}
  const supported=new Set([...Object.keys(value.charts),...Object.keys(value.scenes).filter(id=>hasPresentationSceneState(value.scenes[id]))]);
  for(const canvas of document.querySelectorAll('canvas'))if(![...supported].some(id=>get(id)?.contains(canvas))&&!canvas.closest('[_echarts_instance_]')&&!Object.values(window.__NOTALE__.scenes??[]).some(s=>hasPresentationSceneState(value.scenes[s.id])&&s.targets.some(id=>get(id)?.contains(canvas))))value.capabilities.push(canvasSyncNotice);
  value.capabilities=[...new Set(value.capabilities)];return value;
 }
 function changes(next:PresentationRuntimeState):PresentationRuntimePatch{
  if(!last)return next;const patch:PresentationRuntimePatch={};if(next.step!==last.step)patch.step=next.step;
  for(const key of ['controls','components','charts','scenes','dom'] as const){const entries=Object.entries(next[key]).filter(([id,value])=>!same(last![key][id],value));if(entries.length)patch[key]=Object.fromEntries(entries) as never;}
  const media=Object.entries(next.media).filter(([id,value])=>!samePresentationMedia(last!.media[id],value));if(media.length)patch.media=Object.fromEntries(media);
  if(!same(last.capabilities,next.capabilities))patch.capabilities=next.capabilities;
  return patch;
 }
 function publish(full=false){if(!enabled||role!=='controller'||applying)return;const next=capture();full=full||!!last&&(['controls','components','charts','scenes','media','dom'] as const).some(key=>Object.keys(last![key]).some(id=>!(id in next[key])));const patch=full?next:changes(next);last=next;if(Object.keys(patch).length)context.send('presentation-runtime',{slideId:context.slide.id,patch,full});}
 function schedule(){if(!enabled||role!=='controller'||applying||timer)return;timer=setTimeout(()=>{timer=undefined;publish();},80);}
 function audio(){window.__NOTALE_PRESENTATION_SOUND__=sound;for(const el of document.querySelectorAll<HTMLMediaElement>('audio,video')){if(el.dataset.notaleDesiredMuted===undefined)el.dataset.notaleDesiredMuted=String(el.muted);el.muted=!sound||el.dataset.notaleDesiredMuted==='true';if(role==='preview')el.pause();}}
 const applyFailures=new Map<string,()=>void>();let reportedApplyFailure=false;
 function applyOne(key:string,action:()=>void){try{action();applyFailures.delete(key);}catch{applyFailures.set(key,action);}}
 function reportApply(){const failed=applyFailures.size>0;if(failed!==reportedApplyFailure){reportedApplyFailure=failed;context.send('presentation-apply-status',{failed});}}
 function apply(patch:PresentationRuntimePatch,full=false){
  if(full)for(const key of applyFailures.keys()){const split=key.indexOf(':'),kind=key.slice(0,split),id=key.slice(split+1);if(!(id in (kind==='scene'?patch.scenes??{}:patch.charts??{})))applyFailures.delete(key);}
  applying=true;
  try{
   for(const [id,control] of Object.entries(patch.controls??{})){const node=get(id);if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement){if(node.value!==control.value||(node instanceof HTMLInputElement&&node.checked!==control.checked)){node.value=control.value;if(node instanceof HTMLInputElement&&control.checked!==undefined)node.checked=control.checked;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}}}
   for(const [id,state] of Object.entries(patch.components??{}))if(context.components.state()[id]!==state)context.components.select(id,state,false);
   for(const [id,raw] of Object.entries(patch.scenes??{})){applyOne('scene:'+id,()=>{const state=raw as any;if(state.kind==='checkpoint'){const hook=window.__NOTALE_CHECKPOINTS__?.[id];if(!hook)throw Error('场景尚未就绪');hook.restore(state.value);}else if(state.kind==='adapter'){const hook=window.__NOTALE_PRESENTATION_ADAPTERS__?.[id];if(!hook)throw Error('场景尚未就绪');hook.apply(state.value);}else context.sceneApply(id,state.value);});}
   for(const [id,option] of Object.entries(patch.charts??{})){applyOne('chart:'+id,()=>{const node=get(id),instance=node&&chart(node);if(!instance)throw Error('图表尚未就绪');instance.setOption({...option as object,animation:false},{silent:true,lazyUpdate:false});});}
   for(const [id,value] of Object.entries(patch.dom??{})){const node=get(id);if(!node)continue;if(value.text!==undefined&&node.textContent!==value.text&&!node.children.length)node.textContent=value.text;for(const [key,v] of Object.entries(value.attributes))if(mirroredAttributes.includes(key)){if(v===null)node.removeAttribute(key);else node.setAttribute(key,v);}}
   for(const [id,value] of Object.entries(patch.media??{})){const el=get(id);if(!(el instanceof HTMLMediaElement))continue;el.playbackRate=value.rate;el.volume=value.volume;el.dataset.notaleDesiredMuted=String(value.muted);el.muted=!sound||value.muted;const time=value.time+(value.paused?0:Math.max(0,Date.now()-value.at)/1000*value.rate);if(el.readyState>=1&&Math.abs(el.currentTime-time)>.25)el.currentTime=Math.min(time,Number.isFinite(el.duration)?el.duration:time);if(value.paused||role==='preview')el.pause();else if(el.paused)void el.play().catch(()=>context.send('media-blocked',{target:id}));}
   if(role==='preview')for(const animation of document.getAnimations())animation.pause();
  }finally{applying=false;reportApply();}
 }
 const interactive=(el:Element|null)=>!!el&&(!!el.closest('input,textarea,select,button,a,video,audio,canvas,[contenteditable="true"],[role="button"],[role="slider"],[_echarts_instance_]')||[...(context.slide.components??[]).map(c=>c.root),...Object.keys(context.slide.nativeCharts),...(window.__NOTALE__.scenes??[]).flatMap(s=>s.root?[s.root]:s.targets)].some(id=>get(id)?.contains(el)));
 document.addEventListener('keydown',event=>{if(!enabled||role!=='controller'||event.isComposing||event.defaultPrevented)return;const history=(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase());if(event.altKey||((event.ctrlKey||event.metaKey)&&!history))return;const el=event.target as HTMLElement;if(el?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(el?.tagName))return;if(event.key===' '&&el?.closest('button,summary,a[href],[role=button],audio,video'))return;if(['ArrowRight','ArrowLeft','PageDown','PageUp',' ','Escape','Home','End','b','B','o','O','l','L','p','P','f','F'].includes(event.key)||((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))){event.preventDefault();event.stopImmediatePropagation();context.send('presentation-key',{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey});}},{capture:true,signal:cleanup.signal});
 let down:{x:number;y:number}|undefined;
 document.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};},{capture:true,signal:cleanup.signal});
 document.addEventListener('click',event=>{if(!enabled||role!=='controller'||event.defaultPrevented||interactive(event.target as Element)||!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>4)return;context.send('presentation-key',{key:'ArrowRight'});},{signal:cleanup.signal});
 let activity=0;document.addEventListener('pointermove',()=>{if(enabled&&Date.now()-activity>200){activity=Date.now();context.send('presentation-activity',{});}},{passive:true,signal:cleanup.signal});
 const notify=()=>schedule();
 for(const type of ['input','change','click','pointerup','play','pause','seeked','ratechange','volumechange','timeupdate'])document.addEventListener(type,notify,{capture:true,signal:cleanup.signal});
 // Observe source-driven results, coalescing after a user interaction without polling the document.
 const observer=new MutationObserver(records=>{if(enabled&&role==='controller'&&!applying&&records.some(record=>record.type!=='attributes'||(record.target instanceof Element&&record.target.hasAttribute('data-notale-id'))))schedule();});
 function attach(){
  const found=new Set<string>(),errors:string[]=[];
  const register=(key:string,source:unknown,subscribe:()=>()=>void)=>{
   found.add(key);const previous=subscriptions.get(key);if(previous?.source===source)return;
   subscriptions.delete(key);
   try{previous?.stop();}catch{errors.push('部分互动内容的状态监听暂不可用');}
   try{subscriptions.set(key,{source,stop:subscribe()});}catch{errors.push('部分互动内容的状态监听暂不可用');}
  };
  for(const node of nodes()){
   const instance=chart(node),id=node.dataset.notaleId!;
   if(instance?.on)register('chart:'+id,instance,()=>subscribePresentationChart(instance as typeof instance & {on:NonNullable<typeof instance.on>},schedule));
  }
  for(const [id,adapter] of Object.entries(window.__NOTALE_PRESENTATION_ADAPTERS__??{}))
   if(adapter.subscribe)register('adapter:'+id,adapter,()=>adapter.subscribe!(schedule));
  for(const [key,subscription] of subscriptions)if(!found.has(key)){subscriptions.delete(key);try{subscription.stop();}catch{errors.push('部分互动内容的状态监听暂不可用');}}
  return errors;
 }
 return {capture,apply,receive(type:string,data:any){
  if(type==='presentation-config'){enabled=true;role=data.role;sound=!!data.sound;document.documentElement.dataset.notalePresentation=role;audio();attach();observer.disconnect();if(role==='controller')observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:mirroredAttributes});if(role==='preview')Object.values(window.__NOTALE_PRESENTATION_ADAPTERS__??{}).forEach(a=>a.pause?.());publish(true);return true;}
  if(type==='presentation-capture'){context.send('presentation-runtime',{slideId:context.slide.id,requestId:data.requestId,patch:capture(),full:true});return true;}
  if(type==='presentation-retry'){if(role!=='controller'&&applyFailures.size){applying=true;try{for(const [key,action] of [...applyFailures])applyOne(key,action);}finally{applying=false;reportApply();}}return true;}
  if(type==='presentation-apply'){apply(data.patch,data.full===true);return true;}
  if(type==='presentation-sound'){sound=!!data.enabled;audio();return true;}
  if(type==='presentation-flush'){clearTimeout(timer);timer=undefined;publish(true);context.send('presentation-flushed',{requestId:data.requestId});return true;}
  return false;
 },stop(){applyFailures.clear();observer.disconnect();cleanup.abort();clearTimeout(timer);subscriptions.forEach(subscription=>{try{subscription.stop();}catch{/* Continue releasing the remaining subscriptions. */}});subscriptions.clear();}};
}
