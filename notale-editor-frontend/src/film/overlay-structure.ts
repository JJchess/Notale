import {clipObjects,type FilmClip,type FilmCommand} from '@notale/editor/film';
import {cleanOverlayHtml} from './overlay-page.js';
import {isSvgLayer,type Command} from '@notale/editor/browser';
import type {OrderObject} from '../state/layer-reorder';
export function overlayOrderObjects(clip:FilmClip,html:string):OrderObject[]{
 const dom=new DOMParser().parseFromString(cleanOverlayHtml(html),'text/html');
  return [...dom.body.querySelectorAll<HTMLElement>('[data-notale-id]')].map(node=>{let locked=false;for(let parent:HTMLElement|null=node;parent&&parent!==dom.body;parent=parent.parentElement)locked ||= !!clip.objects?.[parent.dataset.notaleId??'']?.locked;return {id:node.dataset.notaleId!,parent:node.parentElement?.dataset.notaleId,tag:node.localName,namespace:node.namespaceURI??'',locked};});
}
/** Preserve SVG definitions and text slots; never reorder HTML flow boxes. */
export function reorderOverlaySvg(clip:FilmClip,html:string,commands:Command[]):FilmCommand{
 const dom=new DOMParser().parseFromString(cleanOverlayHtml(html),'text/html');
 const info=(node:Element)=>({tag:node.localName,namespace:node.namespaceURI??''});
 for(const command of commands){
  if(command.type!=='elements.order')throw Error('无效图形排序');
  const chosen=command.targets.map(id=>dom.querySelector(`[data-notale-id="${CSS.escape(id)}"]`));if(chosen.some(node=>!node))throw Error('图层已不存在');
  const groups=new Map<Element,Element[]>();for(const node of chosen){const parent=node!.parentElement;if(!parent||!isSvgLayer(info(node!),info(parent)))throw Error('只能排列同一 SVG 内的完整图形');groups.set(parent,[...groups.get(parent)??[],node!]);}
  for(const [parent,selected]of groups){const nodes=[...parent.childNodes],siblings=[...parent.children].filter(node=>isSvgLayer(info(node),info(parent))),moving=new Set(selected),slots=new Set<Node>(siblings);let ordered=[...siblings];
  if(command.action==='front'||command.action==='back'){const picked=ordered.filter(node=>moving.has(node)),rest=ordered.filter(node=>!moving.has(node));ordered=command.action==='front'?[...rest,...picked]:[...picked,...rest];}
  else if(command.action==='forward'){for(let i=ordered.length-2;i>=0;i--)if(moving.has(ordered[i])&&!moving.has(ordered[i+1]))[ordered[i],ordered[i+1]]=[ordered[i+1],ordered[i]];}
  else for(let i=1;i<ordered.length;i++)if(moving.has(ordered[i])&&!moving.has(ordered[i-1]))[ordered[i],ordered[i-1]]=[ordered[i-1],ordered[i]];
  let index=0;parent.replaceChildren(...nodes.map(node=>slots.has(node)?ordered[index++]:node));}
 }
 return {type:'film.overlay.set',clipId:clip.id,html:cleanOverlayHtml(dom.body.innerHTML),objects:clip.objects};
}
export type OverlayAction='front'|'back'|'forward'|'backward'|'duplicate'|'delete';
/** Detached author data adapter; native editing runtime is never cloned. */
export function overlayStructure(clip:FilmClip,html:string,target:string,action:OverlayAction,at:number){
 const dom=new DOMParser().parseFromString(cleanOverlayHtml(html),'text/html'),node=dom.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(target)}"]`);if(!node)throw Error('对象已不存在');
 const descendants=[node,...node.querySelectorAll<HTMLElement>('[data-notale-id]')],objects=structuredClone(clip.objects??{});
 for(let p:HTMLElement|null=node;p&&p!==dom.body;p=p.parentElement)if(objects[p.dataset.notaleId!]?.locked)throw Error('对象或容器已锁定');
 if(descendants.some(n=>objects[n.dataset.notaleId!]?.locked))throw Error('对象包含锁定的子对象');
 let selected:string|undefined=target;
 if(action==='delete'){for(const n of descendants)delete objects[n.dataset.notaleId!];node.remove();selected=undefined;}
 else if(action==='duplicate'){
  const copy=node.cloneNode(true) as HTMLElement;for(const n of [copy,...copy.querySelectorAll<HTMLElement>('[data-notale-id]')]){const old=n.dataset.notaleId!,id='copy-'+crypto.randomUUID();n.dataset.notaleId=id;if(objects[old])objects[id]=structuredClone(objects[old]);}
  node.after(copy);selected=copy.dataset.notaleId;
 }else{
  const sampled=clipObjects(clip,at-clip.at),siblings=[...node.parentElement!.children] as HTMLElement[];
  const z=(n:HTMLElement)=>{const raw=sampled[n.dataset.notaleId!]?.['z-index']??n.style.zIndex;return Number.isFinite(Number(raw))?Number(raw):0;};
  const ordered=siblings.map((n,i)=>({n,i,z:z(n)})).sort((a,b)=>a.z-b.z||a.i-b.i).map(x=>x.n),index=ordered.indexOf(node);
  const anchor=action==='front'?ordered.at(-1):action==='back'?ordered[0]:ordered[index+(action==='forward'?1:-1)];
  if(anchor&&anchor!==node){const front=action==='front'||action==='forward',value=String(z(anchor));if(front)anchor.after(node);else anchor.before(node);node.style.zIndex=value;
   const state=objects[target]??={};const keys=state.keyframes?.['z-index'];if(keys?.length){const frame=at-clip.at+(clip.animationOffset??0),key=keys.find(k=>k.frame===frame);state.keyframes!['z-index']=[...keys.filter(k=>k.frame!==frame),{frame,value,easing:key?.easing??'hold'}].sort((a,b)=>a.frame-b.frame);}else{state.values??={};state.values['z-index']=value;}
  }
 }
 const command:FilmCommand={type:'film.overlay.set',clipId:clip.id,html:cleanOverlayHtml(dom.body.innerHTML),objects};return {command,selected};
}
