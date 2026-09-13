import type {AnimationSpec} from '@notale/editor/browser';
export interface AnimationRow {id:string;animation:AnimationSpec;label:string;description:string;timing:string;summary:string;selected:boolean;start:number;end:number;extent:number;up:boolean;down:boolean;}
export interface AnimationListModel {scope:string;focus?:(focused:boolean)=>void;rows:AnimationRow[];current:()=>boolean;edit:(id:string)=>void;preview:(id:string)=>unknown;copy:(id:string)=>unknown;remove:(id:string)=>unknown;move:(id:string,direction:number)=>unknown;drop:(id:string,target:string)=>unknown;commit:(animation:AnimationSpec)=>Promise<unknown>;error:(error:unknown)=>void;}
let model:AnimationListModel|undefined,owner:symbol|undefined;
const listeners=new Set<()=>void>();
function publish(next:AnimationListModel|undefined){model=next;listeners.forEach(listener=>listener());}
export const animationListState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindAnimationList(){
 const token=Symbol();owner=token;let focused=false;publish(undefined);
 const focus=(value:boolean)=>{if(owner===token)focused=value;};
 return {get focused(){return owner===token&&focused;},update(next:AnimationListModel){if(owner===token)publish({...next,focus});},dispose(){if(owner===token){focused=false;owner=undefined;publish(undefined);}}};
}
