import {clipAppearance,clipGain,filmNumericLimits,filmEnumValues,validFilmProperty,type FilmDocument,type FilmClip,type FilmCommand,type FilmProperty,type FilmPropertyValue} from '@notale/editor/film';
import {clipStyleCommand} from './authoring-animation';
import {propertyLabels,propertyOptionLabels} from './authoring-properties';
import {bindNumericScrub} from '../state/numeric-scrub';
import {inspectorSection} from './inspector-view';
import {translateUi as t} from '../i18n/store';

export function commonProperty(values:readonly FilmPropertyValue[]){return values.length&&values.every(value=>value===values[0])?values[0]:undefined;}
const localFrame=(clip:FilmClip,position:number)=>Math.max(0,Math.min(clip.duration-1,position-clip.at));
export function clipPropertyValue(doc:FilmDocument,clip:FilmClip,position:number,property:FilmProperty|'gain'):FilmPropertyValue{
 const at=localFrame(clip,position),source=doc.sources.find(source=>source.id===clip.sourceId);
 if(property==='gain')return 20*Math.log10(Math.max(.001,clipGain({...clip,audio:{...clip.audio,fadeIn:0,fadeOut:0,muted:false}},at)));
 return ({x:doc.width/2,y:doc.height/2,width:source?.width??doc.width,height:source?.height??doc.height,...clipAppearance(clip,at)})[property]??0;
}
/** Prepare the entire batch before committing. Existing curves are edited at the displayed frame. */
export function clipPropertyCommands(doc:FilmDocument,ids:readonly string[],position:number,property:FilmProperty|'gain',value:FilmPropertyValue,relative=false):FilmCommand[]{
 return ids.map(id=>{
  const track=doc.tracks.find(track=>track.kind==='media'&&track.clips.some(clip=>clip.id===id));
  if(!track||track.kind!=='media'||track.locked)throw Error('选区包含锁定或已移除的片段');
  const clip=track.clips.find(clip=>clip.id===id)!,source=doc.sources.find(source=>source.id===clip.sourceId);
  if(!source||(property==='gain'?!['video','audio'].includes(source.kind):source.kind==='audio'))throw Error('所选片段不共同支持此属性');
  const next=relative?Number(clipPropertyValue(doc,clip,position,property))+Number(value):value;
  if(property==='gain'){
   if(typeof next!=='number'||!Number.isFinite(next)||next< -60||next>12)throw Error('音量须在 -60 至 12 dB 之间');
   const gain=10**(next/20),frame=localFrame(clip,position)+(clip.animationOffset??0),keys=clip.audio?.keys;
   return {type:'film.audio.set',clipId:id,audio:keys?.length?{...clip.audio,keys:[...keys.filter(key=>key.frame!==frame),{frame,value:gain,easing:keys.find(key=>key.frame===frame)?.easing??'linear'}].sort((a,b)=>a.frame-b.frame)}:{...clip.audio,gain}};
  }
  if(!validFilmProperty(property,next))throw Error('属性值超出有效范围');
  return clipStyleCommand(clip,clip.at+localFrame(clip,position),property,next);
 });
}

export function clipPropertiesPanel(o:{doc:FilmDocument;ids:string[];position:()=>number;scope:()=>string;execute:(commands:FilmCommand[])=>boolean;draft:(doc?:FilmDocument,commands?:FilmCommand[])=>void;pause:()=>void;report:(text:string)=>void;key:(property:FilmProperty)=>void}){
 const node=document.createElement('section');node.className='film-common-properties';
 const clips=o.ids.flatMap(id=>o.doc.tracks.flatMap(track=>track.kind==='media'?track.clips.filter(clip=>clip.id===id):[]));
 const visual=clips.length===o.ids.length&&clips.every(clip=>o.doc.sources.find(source=>source.id===clip.sourceId)?.kind!=='audio');
 const sound=clips.length===o.ids.length&&clips.every(clip=>['video','audio'].includes(o.doc.sources.find(source=>source.id===clip.sourceId)?.kind??''));
 const locked=o.doc.tracks.some(track=>track.locked&&track.kind==='media'&&track.clips.some(clip=>o.ids.includes(clip.id)));
 const cleanup:(()=>void)[]=[],refreshers:(()=>void)[]=[];let disposed=false;
 const identity=o.scope();
 const attempt=(fn:()=>void)=>{try{if(disposed||o.scope()!==identity)throw Error('选区或播放头已变化，请重新操作');fn();o.report('');}catch(error){o.draft();o.report(String(error instanceof Error?error.message:error));}};
 function add(parent:HTMLElement,property:FilmProperty|'gain'){
  const limits=property==='gain'?[-60,12]:filmNumericLimits[property as keyof typeof filmNumericLimits],choices=property==='gain'?undefined:filmEnumValues[property as keyof typeof filmEnumValues];
  const row=document.createElement('div');row.className='film-property-row';row.dataset.property=property;
  const label=document.createElement('label');label.className='film-control-row';const caption=document.createElement('span');caption.textContent=t(property==='gain'?'音量 dB':propertyLabels[property]??property);label.append(caption);
  const control=choices?document.createElement('select'):document.createElement('input');control.setAttribute('aria-label',caption.textContent);control.disabled=locked;label.append(control);row.append(label);
  const values=()=>clips.map(clip=>clipPropertyValue(o.doc,clip,o.position(),property));
  const displayed=()=>commonProperty(values());
  if(control instanceof HTMLSelectElement){
   control.append(new Option('—',''),...choices!.map(value=>new Option(t(propertyOptionLabels[value]??value),value)));
   control.onchange=()=>attempt(()=>{if(!control.value)return;if(!o.execute(clipPropertyCommands(o.doc,o.ids,o.position(),property,control.value)))throw Error('修改未应用');});
  }else{
   control.type='number';control.step=['opacity','scaleX','scaleY'].includes(property)?'.01':property==='gain'?'.1':'1';
   if(limits?.[0]!==undefined)control.min=String(limits[0]);if(limits?.[1]!==undefined)control.max=String(limits[1]);
   let start='',scrubbing=false,editing=false,frameScope='';
   const begin=()=>{o.pause();if(!editing){start=control.value;frameScope=JSON.stringify([o.scope(),o.position()]);editing=true;}};
   const commands=()=>{if(JSON.stringify([o.scope(),o.position()])!==frameScope||!control.value.trim())throw Error('编辑位置已变化或数值为空');return clipPropertyCommands(o.doc,o.ids,o.position(),property,scrubbing&&clips.length>1?Number(control.value)-Number(start||0):Number(control.value),scrubbing&&clips.length>1);};
   const cancel=()=>{editing=false;scrubbing=false;control.value=start;o.draft();};
   const commit=()=>{if(!editing)return;attempt(()=>{const edits=control.value===start?[]:commands();editing=false;scrubbing=false;o.draft();if(edits.length&&!o.execute(edits))throw Error('修改未应用');});};
   control.onfocus=begin;control.oninput=()=>{begin();};control.onchange=()=>{if(!scrubbing)commit();};control.onblur=()=>{if(!scrubbing)commit();};
   control.onkeydown=e=>{e.stopPropagation();if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();cancel();control.blur();}else if(e.key==='Enter'){e.preventDefault();commit();control.blur();}};
   cleanup.push(bindNumericScrub(control,{read:()=>control.value||'0',limits:()=>({min:clips.length>1&&limits?.[0]!==undefined?Number(start||0)+Math.max(...values().map(value=>limits[0]!-Number(value))):limits?.[0],max:clips.length>1&&limits?.[1]!==undefined?Number(start||0)+Math.min(...values().map(value=>limits[1]!-Number(value))):limits?.[1],step:Number(control.step)}),start:()=>{begin();scrubbing=true;},change:value=>{control.value=value;attempt(()=>o.draft(o.doc,commands()));},finish:aborted=>{if(aborted)cancel();else commit();}}));
   cleanup.push(()=>{if(editing)o.draft();});
  }
  label.append(control);row.append(label);
  if(clips.length===1&&property!=='gain'){
   const key=document.createElement('button');key.type='button';key.className='film-property-key';key.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 8-8 8-8-8Z"/></svg>';
   key.onclick=()=>attempt(()=>o.key(property));row.append(key);
   refreshers.push(()=>{const clip=clips[0],frame=o.position()-clip.at+(clip.animationOffset??0),keys=clip.appearance?.keyframes?.[property];const keyed=!!keys?.some(key=>key.frame===frame);key.disabled=locked||o.position()<clip.at||o.position()>=clip.at+clip.duration;key.dataset.animated=String(!!keys?.length);key.setAttribute('aria-pressed',String(keyed));key.title=t((keyed?'移除':'添加')+'当前关键帧')+' · '+caption.textContent;key.setAttribute('aria-label',key.title);});
  }
  refreshers.push(()=>{if(document.activeElement===control)return;const value=displayed();control.value=value===undefined?'':typeof value==='number'?String(Number(value.toFixed(6))):String(value);if(control instanceof HTMLInputElement)control.placeholder=value===undefined?'—':'';control.title=value===undefined?t('多个值'):'';});
  parent.append(row);
 }
 if(visual){
  const geometry=inspectorSection(t('位置与尺寸'),'geometry',true);for(const property of ['x','y','width','height','rotation','scaleX','scaleY'] as const)add(geometry,property);node.append(geometry);
  const appearance=inspectorSection(t('外观'),'appearance',true);for(const property of ['opacity','fit'] as const)add(appearance,property);node.append(appearance);
  const advanced=inspectorSection(t('更多外观'),'appearance-more');for(const property of ['blendMode','radius','blur','skewX','cropTop','cropRight','cropBottom','cropLeft'] as const)add(advanced,property);node.append(advanced);
 }
 if(sound&&clips.length>1){const audio=inspectorSection(t('声音'),'audio',true);add(audio,'gain');node.prepend(audio);}
 if(locked){node.title=t('选区包含锁定轨道');const message=document.createElement('p');message.className='hint';message.textContent=node.title;node.prepend(message);}
 const refresh=()=>refreshers.forEach(fn=>fn());refresh();
 return {node,refresh,dispose(){disposed=true;cleanup.splice(0).forEach(fn=>fn());}};
}
