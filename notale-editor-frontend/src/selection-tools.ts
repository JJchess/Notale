import {selectionUnits} from './object-geometry.js';
type Item = { id: string; parent?: string; locked: boolean };
export interface SelectionTool {id:string;disabled:boolean;title:string;}
const empty:SelectionTool[]=[];let model=empty;const listeners=new Set<()=>void>();
export const selectionToolsState={subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>model,getServerSnapshot:()=>empty};
export function renderSelectionTools(objects: Item[], selected: ReadonlySet<string>, groups: {members: string[]}[], ready: boolean) {
  const items = objects.filter(object => selected.has(object.id));
  const locked = items.some(object => object.locked);
  const nested = items.some(object => {
    const seen = new Set<string>(); let parent = object.parent;
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return true;
      seen.add(parent); parent = objects.find(item => item.id === parent)?.parent;
    }
    return false;
  });
  const visibility: Record<string, boolean> = {
    group: items.length >= 2,
    ungroup: groups.some(group => group.members.some(id => selected.has(id))),
    'align-left': items.length >= 2,
    distribute: selectionUnits(items,groups).length >= 3,
  };
  const next=Object.entries(visibility).filter(([,visible])=>visible).map(([id])=>({id,disabled:!ready||locked||(id==='group'&&nested),title:locked?'先解锁所选对象':id==='group'&&nested?'父对象与内部对象不能同时编组':''}));
  if(JSON.stringify(next)!==JSON.stringify(model)){model=next;listeners.forEach(fn=>fn());}
}
