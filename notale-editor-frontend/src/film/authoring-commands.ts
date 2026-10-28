import {arrangePlan,commitSchema,type Command,type Snapshot,type Slide} from '@notale/editor/browser';
import {applyFilmCommands,clipObjects,type FilmDocument,type FilmClip,type FilmCommand} from '@notale/editor/film';
import {cleanOverlayHtml} from './overlay-page';
import {overlayStructure} from './overlay-structure';
export interface FilmAuthorObject {id:string;parent?:string;namespace?:string;tag:string;text:string;html:string;kind:string;locked:boolean;style:Record<string,string>;attributes:Record<string,string>;}
export function overlayHtml(doc:FilmDocument,clip:FilmClip){const source=doc.sources.find(source=>source.id===clip.sourceId);return source?.kind==='overlay'?clip.overlayHtml??source.html??'':undefined;}
export function overlayObjects(doc:FilmDocument,clip:FilmClip,position:number,locked=false):FilmAuthorObject[]{
 const html=overlayHtml(doc,clip);if(html===undefined)return [];
 const dom=new DOMParser().parseFromString(cleanOverlayHtml(html),'text/html'),sample=clipObjects(clip,position-clip.at);
 return [...dom.body.querySelectorAll<HTMLElement>('[data-notale-id]')].map(node=>{
  const id=node.dataset.notaleId!;let inherited=locked;for(let ancestor:HTMLElement|null=node;ancestor&&ancestor!==dom.body;ancestor=ancestor.parentElement)inherited ||= !!clip.objects?.[ancestor.dataset.notaleId??'']?.locked;
  return {id,parent:node.parentElement?.dataset.notaleId,namespace:node.namespaceURI??'',tag:node.localName,text:node.textContent??'',html:node.outerHTML,kind:node.localName,locked:inherited,
   attributes:Object.fromEntries([...node.attributes].map(attribute=>[attribute.name,attribute.value])),style:{...Object.fromEntries(Array.from(node.style).map(name=>[name,node.style.getPropertyValue(name)])),...sample[id]}};
 });
}
export function objectStyleCommand(clip:FilmClip,position:number,target:string,property:string,value:string):FilmCommand{
 const keys=clip.objects?.[target]?.keyframes?.[property],frame=position-clip.at+(clip.animationOffset??0);
 if(keys?.length){if(!value)throw Error('动画属性不能清空；请先移除该属性的关键帧');return {type:'film.object.key.put',clipId:clip.id,target,property,keyframe:{frame,value,easing:keys.find(key=>key.frame===frame)?.easing??'linear'}};}
 return {type:'film.object.property',clipId:clip.id,target,property,value:value||undefined};
}
/** Native handles consolidate CSS transforms. Restore animated independent
 * channels before writing so a drag never bakes the sampled frame into HTML. */
function transformPatch(clip:FilmClip,item:FilmAuthorObject,input:Record<string,string>){
 const animated=['translate','rotate','scale'].some(name=>clip.objects?.[item.id]?.keyframes?.[name]?.length);
 if(!animated||!input.transform||!['translate','rotate','scale'].some(name=>name in input))return input;
 const number=(raw:string|undefined,fallback:number,unit:string)=>{if(!raw||raw==='none')return fallback;if(!new RegExp(`^[-+]?(?:\\d*\\.)?\\d+${unit}$`).test(raw))throw Error('当前动画变换暂不能无损调整，请编辑对应关键帧');return parseFloat(raw);};
 const base=new DOMMatrix(item.style.transform&&item.style.transform!=='none'?item.style.transform:undefined),next=new DOMMatrix(input.transform==='none'?undefined:input.transform);
 const relative=next.multiply(base.inverse());
 if(![relative.a,relative.b,relative.c,relative.d,relative.e,relative.f].every(Number.isFinite))throw Error('当前变换不可逆，请调整对应关键帧');
 const oldScale=(item.style.scale||'none').split(/\s+/),sign=number(oldScale[0],1,'')<0?-1:1,sx=Math.hypot(relative.a,relative.b)*sign;
 if(Math.abs(sx)<1e-9)throw Error('当前缩放不可逆，请调整对应关键帧');
 const sy=(relative.a*relative.d-relative.b*relative.c)/sx,skew=(relative.a*relative.c+relative.b*relative.d)/(sx*sx);
 if(Math.abs(skew)>1e-6)throw Error('当前动画变换含斜切，不能无损调整；请编辑对应关键帧');
 const angle=Math.atan2(relative.b/sign,relative.a/sign)*180/Math.PI;
 const values={translate:`${relative.e}px ${relative.f}px`,rotate:`${angle}deg`,scale:`${sx} ${sy}`};
 const out={...input};delete out.transform;
 for(const [name,value]of Object.entries(values)){
  const old=(item.style[name]||'none').split(/\s+/),next=value.split(/\s+/),unit=name==='translate'?'px':name==='rotate'?'deg':'',fallback=name==='scale'?1:0;
  const same=next.every((value,index)=>Math.abs(number(value,fallback,unit)-number(old[index]??(name==='scale'?old[0]:undefined),fallback,unit))<1e-6);
  if(same)delete out[name];else out[name]=value;
 }
 return out;
}
function snapshot(doc:FilmDocument,clip:FilmClip):Snapshot{
 const slide:Slide={id:clip.id,name:clip.title,sourcePath:'overlay.html',html:`<!doctype html><html><body>${cleanOverlayHtml(overlayHtml(doc,clip)??'')}</body></html>`,notes:'',hidden:false,section:'',layoutId:null,theme:{},guides:[],transition:'none',advanceAfter:0,nativeStepCount:0,stepMap:[],animations:[],bindings:[],groups:[],connectors:[],nativeCharts:{},locked:[],transforms:{}};
 return {version:1,createdAt:'',actor:'film-authoring',document:{schemaVersion:1,id:doc.id,title:doc.title,width:doc.width,height:doc.height,theme:{},layouts:[],slides:[slide],assets:{},comments:[],presentation:{loop:false,showSlideNumber:false}}};
}
/** Only authored fields are translated. Sampled presentation HTML is never persisted. */
export function filmAuthorCommands(doc:FilmDocument,clip:FilmClip,position:number,input:Command[],locked=false):FilmCommand[]{
 if(locked)throw Error('轨道已锁定');
 let working=doc,current=clip;const result:FilmCommand[]=[];
 const add=(commands:FilmCommand[])=>{if(!commands.length)return;working=applyFilmCommands(working,commands);current=working.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(item=>item.id===clip.id)!;result.push(...commands);};
 const checked=commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:input.map(command=>'slideId'in command?{...command,slideId:clip.id}:command)}).commands;
 const visit=(command:Command)=>{
  const items=overlayObjects(working,current,position),item='target'in command?items.find(item=>item.id===command.target):undefined;
  if('target'in command&&(!item||item.locked&&command.type!=='element.lock'))throw Error('对象已删除或锁定');
  if(command.type==='elements.arrange'){
   if(command.rectangles.some(rect=>!items.some(item=>item.id===rect.id&&!item.locked)))throw Error('选区含锁定或已删除对象');
   const view=snapshot(working,current);for(const edit of arrangePlan(view.document,view.document.slides[0],command))visit(edit);return;
  }
  if(command.type==='element.transform'){
   const t=command.transform;
   const styles={...(t.matrix?{transform:`matrix(${t.matrix.join(',')})`}:{}),translate:`${t.x}px ${t.y}px`,rotate:`${t.rotate}deg`,scale:`${t.scaleX} ${t.scaleY}`,...(t.width===null?{width:'auto'}:t.width?{width:`${t.width}px`}:{}),...(t.height===null?{height:'auto'}:t.height?{height:`${t.height}px`}:{})};
   add(Object.entries(transformPatch(current,item!,styles)).filter(([name,value])=>item!.style[name]!==value).map(([name,value])=>objectStyleCommand(current,position,command.target,name,value)));return;
  }
  if(command.type==='element.lock'){add([{type:'film.object.lock',clipId:current.id,target:command.target,locked:command.locked}]);return;}
  if(command.type==='element.delete'||command.type==='element.duplicate'){
   add([overlayStructure(current,overlayHtml(working,current)!,command.target,command.type==='element.delete'?'delete':'duplicate',position).command]);return;
  }
  if(command.type!=='element.patch'&&command.type!=='element.content')throw Error(`当前对象不支持此操作：${command.type}`);
  if(command.type==='element.patch'&&command.patch.style)add(Object.entries(transformPatch(current,item!,command.patch.style)).map(([name,value])=>objectStyleCommand(current,position,command.target,name,value)));
  const patch=command.type==='element.patch'?command.patch:undefined;
  if(command.type==='element.patch'&&patch?.text===undefined&&patch?.richText===undefined&&!patch?.attributes)return;
  const dom=new DOMParser().parseFromString(cleanOverlayHtml(overlayHtml(working,current)!),'text/html'),node=dom.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(command.target)}"]`)!;
  if(command.type==='element.content')node.innerHTML=command.html;
  else {
   if(patch!.text!==undefined)node.textContent=patch!.text;
   if(patch!.richText!==undefined)node.innerHTML=patch!.richText;
   for(const [name,value]of Object.entries(patch!.attributes??{})){
    if(name.startsWith('on')||['id','data-notale-id','style','srcdoc'].includes(name))throw Error('不可修改对象身份或执行属性');
    if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);
   }
  }
  const html=cleanOverlayHtml(dom.body.innerHTML),parsed=new DOMParser().parseFromString(html,'text/html'),ids=new Set([...parsed.querySelectorAll('[data-notale-id]')].map(node=>node.getAttribute('data-notale-id')));
  add([{type:'film.overlay.set',clipId:current.id,html,objects:Object.fromEntries(Object.entries(current.objects??{}).filter(([id])=>ids.has(id)))}]);
 };
 for(const command of checked)visit(command);return result;
}
