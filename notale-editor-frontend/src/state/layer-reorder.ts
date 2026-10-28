import {isSvgLayer,type Command} from '@notale/editor/browser';
import {assertSelectionEditable,type SelectionObject} from './selection-commands';

export type LayerPlacement='before'|'after';
export type OrderObject=SelectionObject&{namespace:string};
export type LayerStyles=Record<string,Record<string,string>>;
export function stackingOrder(objects:readonly OrderObject[],styles:LayerStyles){
 const index=new Map(objects.map((object,i)=>[object.id,i]));
 return [...objects].sort((a,b)=>(parseInt(styles[a.id]?.['z-index'])||0)-(parseInt(styles[b.id]?.['z-index'])||0)||index.get(a.id)!-index.get(b.id)!);
}
/** A drop changes stacking within one container, never the authored layout tree. */
export function relativeLayerCommands(slideId:string,objects:OrderObject[],styles:LayerStyles,targets:string[],target:string,placement:LayerPlacement):Command[]{
 const selected=new Set(targets),byId=new Map(objects.map(object=>[object.id,object])),anchor=byId.get(target);
 if(!selected.size||selected.has(target))return [];
 assertSelectionEditable([...selected],objects);
 const protectedIds=new Set(objects.filter(object=>object.locked).map(object=>object.id));
 for(const object of objects.filter(object=>object.locked)){let parent=object.parent;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);protectedIds.add(parent);parent=byId.get(parent)?.parent;}}
 if(!anchor||[...selected].some(id=>byId.get(id)?.parent!==anchor.parent))throw Error('只能调整同一容器内的图层顺序');
 const isSvg=(object:OrderObject)=>isSvgLayer(object,byId.get(object.parent??''));
 const svg=isSvg(anchor);
 if([...selected].some(id=>isSvg(byId.get(id)!)!==svg))throw Error('请选择同一种容器内的完整图层');
 const siblings=objects.filter(object=>object.parent===anchor.parent&&isSvg(object)===svg);
 if(!svg&&siblings.some(object=>selected.has(object.id)&&object.namespace!=='http://www.w3.org/1999/xhtml'&&object.tag!=='svg'))throw Error('文字片段不能作为独立图层排序');
 const flow=/^(inline-)?(flex|grid)$/.test(styles[anchor.parent??'']?.display??'');
 const movable=(object:OrderObject)=>svg||flow||(styles[object.id]?.position??'static')!=='static';
 if(!svg&&[...selected].some(id=>!movable(byId.get(id)!)))throw Error('普通文字流中的对象不能拖动层级；请先设置定位');
 const candidates=siblings.filter(object=>movable(object));
 if(!candidates.includes(anchor))throw Error('目标不是可调整层级的对象');
 const before=svg?candidates:stackingOrder(candidates,styles),moving=before.filter(object=>selected.has(object.id)),ordered=before.filter(object=>!selected.has(object.id));
 // The layer list displays frontmost first; a visual "before" is above the anchor.
 ordered.splice(ordered.indexOf(anchor)+(placement==='before'?1:0),0,...moving);
 if(ordered.every((object,i)=>object===before[i]))return [];
 if(svg){
  const commands:Command[]=[{type:'elements.order',slideId,targets:moving.map(object=>object.id),action:'front'}];
  const after=ordered.length-ordered.indexOf(moving[0])-moving.length;
  for(let i=0;i<after;i++)commands.push({type:'elements.order',slideId,targets:moving.map(object=>object.id),action:'backward'});
  return commands;
 }
 const dom=new Map(candidates.map((object,i)=>[object.id,i])),z=(object:OrderObject)=>parseInt(styles[object.id]?.['z-index'])||0,distance=ordered.map(()=>0);
 for(let i=1;i<ordered.length;i++)distance[i]=distance[i-1]+(dom.get(ordered[i-1].id)!>dom.get(ordered[i].id)!?1:0);
 const anchors=ordered.flatMap((object,i)=>protectedIds.has(object.id)?[i]:[]);
 for(let i=1;i<anchors.length;i++)if(z(ordered[anchors[i]])-z(ordered[anchors[i-1]])<distance[anchors[i]]-distance[anchors[i-1]])throw Error('锁定图层之间没有可用层级');
 const base=anchors.length?z(ordered[anchors[0]])-distance[anchors[0]]:Math.min(0,...before.map(z));let lockedAnchor=-1;
 return ordered.flatMap((object,i):Command[]=>{
  if(protectedIds.has(object.id)){lockedAnchor=i;return [];}
  const value=lockedAnchor>=0?z(ordered[lockedAnchor])+distance[i]-distance[lockedAnchor]:base+distance[i];
  if(!Number.isSafeInteger(value)||Math.abs(value)>2147483647)throw Error('图层层级超出范围');
  return value===z(object)?[]:[{type:'element.patch',slideId,target:object.id,patch:{style:{'z-index':String(value)}}}];
 });
}
