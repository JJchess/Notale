'use client';
import {useI18n} from '../i18n/react';

import {AnimationEffectIcon} from './animation-effect-icon';
import {useRef,useState,useSyncExternalStore} from 'react';
import {animationGalleryState,animationEffectGroups,animationEffectLabels,selectAnimationGroup,applyAnimationGallery} from '../state/animation-gallery';
export function AnimationGallery(){
 const t=useI18n();

 const model=useSyncExternalStore(animationGalleryState.subscribe,animationGalleryState.getSnapshot,animationGalleryState.getServerSnapshot);
 const busyRef=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function apply(effect?:string){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await applyAnimationGallery(model,effect);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{busyRef.current=false;setBusy(false);}}
 return <div id="animation-gallery">{!model.presetOnly&&<button id="clear-object-animations" title={t("移除所选对象的全部动画")} disabled={busy||!model.clearable} onClick={()=>void apply()}>{t("无动画")}</button>}
 <div className="animation-category-tabs" role="tablist" aria-label={t("动画效果分类")}>{animationEffectGroups.map(group=><button key={group.kind} role="tab" data-animation-category={group.kind} aria-selected={model.group===group.kind} onClick={()=>selectAnimationGroup(group.kind)}>{t(group.name)}</button>)}</div>
 {animationEffectGroups.map(group=><section key={group.kind} className={`animation-effect-group ${group.kind}`} hidden={model.group!==group.kind}><div>{group.effects.map(effect=>{const unavailable=!!model.supportedEffects&&!model.supportedEffects.includes(effect),reason=model.reasons?.[effect];return <button key={effect} data-animation-effect={effect} title={t(reason??animationEffectLabels[effect])} aria-label={t(animationEffectLabels[effect])} disabled={busy||!model.enabled||unavailable} aria-pressed={model.presetOnly?undefined:model.selected===effect} onClick={()=>void apply(effect)}><span className="effect-symbol" aria-hidden="true"><AnimationEffectIcon effect={effect}/></span></button>;})}</div></section>)}
 {error && <p role="alert">{t(error)}</p>}
 </div>;
}
