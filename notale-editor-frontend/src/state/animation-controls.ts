import type {AnimationSequence} from '../animation-authoring';
export interface AnimationControlsModel {target:string;status:string;enabled:boolean;previewable:boolean;multiple:boolean;sequence:AnimationSequence;newDraft?:()=>unknown;preview?:()=>unknown;stop?:()=>unknown;present?:()=>unknown;error?:(cause:unknown)=>void;}
const initial:AnimationControlsModel={target:'',status:'',enabled:false,previewable:false,multiple:false,sequence:'together'};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:AnimationControlsModel){model=next;listeners.forEach(listener=>listener());}
export const animationControlsState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function setAnimationSequence(sequence:string){if(['together','after','click'].includes(sequence))publish({...model,sequence:sequence as AnimationSequence});}
export function bindAnimationControls(actions:Pick<AnimationControlsModel,'newDraft'|'preview'|'stop'|'present'|'error'>){const token=Symbol();owner=token;publish({...initial,...actions});return {
 get sequence(){return model.sequence;},
 update(next:Pick<AnimationControlsModel,'target'|'status'|'enabled'|'previewable'|'multiple'>){if(owner===token)publish({...model,...next});},
 dispose(){if(owner===token){owner=undefined;publish(initial);}},
};}
export async function runAnimationControl(source:AnimationControlsModel,action:'newDraft'|'preview'|'stop'|'present'){
 if(model!==source)return;
 if(action==='newDraft'&&!source.enabled||action==='preview'&&!source.previewable)return;
 try{await source[action]?.();}catch(cause){source.error?.(cause);}
}
