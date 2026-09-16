import {AnimationDraft} from './animation-draft';
export const animationTriggerLabels={'click':'单击时（本步骤）','with-previous':'与上一动画同时','after-previous':'上一动画之后',object:'点击指定对象'};
export interface AnimationFormModel {draft:AnimationDraft;scope:string;disabled:boolean;steps:{value:string;label:string}[];targets:{value:string;label:string}[];change:(id:string)=>void;refresh:()=>void;}
const initial:AnimationFormModel={draft:new AnimationDraft(),scope:'',disabled:true,steps:[],targets:[],change:()=>{},refresh:()=>{}};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:AnimationFormModel){model=next;listeners.forEach(listener=>listener());}
export const animationFormState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindAnimationForm(draft:AnimationDraft,change:AnimationFormModel['change'],refresh:()=>void){const token=Symbol();owner=token;publish({...initial,draft,change,refresh:()=>{if(owner===token)refresh();}});return {
 update(next:Partial<Omit<AnimationFormModel,'draft'|'change'|'refresh'>>){if(owner===token)publish({...model,...next});},
 dispose(){if(owner===token){owner=undefined;publish(initial);}},
};}
