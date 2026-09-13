import type {Command,Slide} from '@notale/editor/browser';
export interface SelectionObject {id:string;parent?:string;locked?:boolean;namespace?:string;tag:string;}
function index(objects:SelectionObject[]){const byId=new Map(objects.map(object=>[object.id,object]));return {byId,ancestor(parent:string,child:string){const seen=new Set<string>();let next=byId.get(child)?.parent;while(next&&!seen.has(next)){if(next===parent)return true;seen.add(next);next=byId.get(next)?.parent;}return false;}};}
export function assertSelectionEditable(targets:string[],objects:SelectionObject[]){
 const tree=index(objects);if(targets.some(id=>!tree.byId.has(id)))throw Error('选区对象已变化，请重新选择');
 if(objects.some(object=>object.locked&&targets.some(id=>id===object.id||tree.ancestor(object.id,id)||tree.ancestor(id,object.id))))throw Error('选区含锁定对象，请先解锁');
}
export function deleteSelectionCommands(slideId:string,targets:string[],objects:SelectionObject[]):Command[]{
 assertSelectionEditable(targets,objects);const tree=index(objects),unique=[...new Set(targets)];
 // Deleting a parent already deletes its descendants; never issue a second delete for them.
 return unique.filter(id=>!unique.some(parent=>parent!==id&&tree.ancestor(parent,id))).map(target=>({type:'element.delete',slideId,target}));
}
export type GroupPlan={kind:'commands';commands:Command[]}|{kind:'canvas';action:'group'|'ungroup'};
export function groupingPlan(action:'group'|'ungroup',slide:Pick<Slide,'id'|'groups'>,targets:string[],objects:SelectionObject[],makeId:()=>string):GroupPlan{
 targets=[...new Set(targets)];assertSelectionEditable(targets,objects);const selected=objects.filter(object=>targets.includes(object.id));
 if(action==='group'){
  if(targets.length<2)return {kind:'commands',commands:[]};
  if(selected.every(object=>object.namespace==='http://www.w3.org/2000/svg'))return {kind:'canvas',action};
  return {kind:'commands',commands:[{type:'group.set',slideId:slide.id,id:makeId(),name:'组合',members:[...new Set(targets)]}]};
 }
 if(selected.length===1&&selected[0].tag==='g')return {kind:'canvas',action};
 return {kind:'commands',commands:slide.groups.filter(group=>group.members.some(id=>targets.includes(id))).map(group=>({type:'group.remove',slideId:slide.id,id:group.id}))};
}
