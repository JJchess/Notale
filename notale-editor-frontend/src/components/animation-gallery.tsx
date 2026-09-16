'use client';
import {AnimationEffectIcon} from './animation-effect-icon';
import {useRef,useState,useSyncExternalStore} from 'react';
import {animationGalleryState,animationEffectGroups,animationEffectLabels,selectAnimationGroup,applyAnimationGallery} from '../state/animation-gallery';
export function AnimationGallery(){
 const model=useSyncExternalStore(animationGalleryState.subscribe,animationGalleryState.getSnapshot,animationGalleryState.getServerSnapshot);
 const busyRef=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function apply(effect?:string){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await applyAnimationGallery(model,effect);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{busyRef.current=false;setBusy(false);}}
 return <div id="animation-gallery"><button id="clear-object-animations" title="移除所选对象的全部动画" disabled={busy||!model.clearable} onClick={()=>void apply()}>无动画</button>
 <div className="animation-category-tabs" role="tablist" aria-label="动画效果分类">{animationEffectGroups.map(group=><button key={group.kind} role="tab" data-animation-category={group.kind} aria-selected={model.group===group.kind} onClick={()=>selectAnimationGroup(group.kind)}>{group.name}</button>)}</div>
 {animationEffectGroups.map(group=><section key={group.kind} className={`animation-effect-group ${group.kind}`} hidden={model.group!==group.kind}><div>{group.effects.map(effect=><button key={effect} data-animation-effect={effect} title={animationEffectLabels[effect]} aria-label={animationEffectLabels[effect]} disabled={busy||!model.enabled} aria-pressed={model.selected===effect} onClick={()=>void apply(effect)}><span className="effect-symbol" aria-hidden="true"><AnimationEffectIcon effect={effect}/></span></button>)}</div></section>)}
 {error&&<p role="alert">{error}</p>}
 </div>;
}
