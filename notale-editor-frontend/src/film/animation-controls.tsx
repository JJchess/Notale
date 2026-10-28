'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useI18n} from '../i18n/react';
import {editorActions} from '../state/editor-session';
import {filmAuthoringActions,filmAuthoringState,type FilmAuthoringModel} from './authoring-state';
import {easingPresets,validEasing,propertyOptionLabels} from './authoring-properties';
import {bindNumericScrub} from '../state/numeric-scrub';
import './animation-controls.css';
const run=(action:Promise<unknown>)=>{void action.catch(editorActions.reportError);};
const easingLabels:Record<string,string>={linear:'线性',hold:'保持',ease:'平滑','ease-in':'缓入','ease-out':'缓出','ease-in-out':'缓入缓出',custom:'自定义贝塞尔'};
export function FilmAnimationControls({compact=false}:{compact?:boolean}){
 const model=useSyncExternalStore(filmAuthoringState.subscribe,filmAuthoringState.getSnapshot,filmAuthoringState.getServerSnapshot);
 if(!model.properties.length)return null;
 return <PropertyTiming key={model.scope+':'+model.property} model={model} compact={compact}/>;
}
function PropertyTiming({model,compact}:{model:FilmAuthoringModel;compact:boolean}){
 const t=useI18n(),property=model.properties.find(item=>item.name===model.property)??model.properties[0];
 const [value,setValue]=useState(String(property.value)),[custom,setCustom]=useState(false),[name,setName]=useState(property.name),[issue,setIssue]=useState('');
 const editing=useRef(false),busy=useRef(false),latest=useRef(model),origin=useRef(model);latest.current=model;
 const numericInput=useRef<HTMLInputElement>(null),scrubValue=useRef(value),scrubHandlers=useRef({start:()=>{},change:(_value:string)=>{},finish:(_cancelled:boolean)=>{}});
 useEffect(()=>{if(!editing.current)setValue(String(property.value));},[property.value,model.frame]);
 async function commit(edited=value){
  if(busy.current||!editing.current)return;editing.current=false;
  const source=origin.current,current=latest.current;if(source.scope!==current.scope||source.property!==current.property||source.frame!==current.frame){filmAuthoringActions.cancelPreview();setValue(String(property.value));return;}
  if(edited===String(property.value)){filmAuthoringActions.cancelPreview();return;}const next=property.kind==='number'?Number(edited):edited;
  if(property.kind==='number'&&(!edited.trim()||!Number.isFinite(next))){setIssue('请输入有效数值');return;}
  busy.current=true;try{await filmAuthoringActions.commit(next,source);setIssue('');}catch(error){setIssue(error instanceof Error?error.message:String(error));}finally{busy.current=false;}
 }
 scrubHandlers.current={
  start:()=>{editing.current=true;origin.current=latest.current;scrubValue.current=String(property.value);},
  change:next=>{scrubValue.current=next;setValue(next);try{filmAuthoringActions.preview(Number(next),origin.current);setIssue('');}catch(error){filmAuthoringActions.cancelPreview();editing.current=false;setIssue(String(error instanceof Error?error.message:error));}},
  finish:cancelled=>{if(cancelled){editing.current=false;filmAuthoringActions.cancelPreview();setValue(String(property.value));}else void commit(scrubValue.current);},
 };
 useEffect(()=>{
  if(compact||property.kind!=='number'||!numericInput.current)return;
  return bindNumericScrub(numericInput.current,{read:()=>numericInput.current?.value??'',limits:()=>({min:property.min,max:property.max,step:['opacity','scaleX','scaleY','cropTop','cropRight','cropBottom','cropLeft'].includes(property.name)?0.01:1}),start:()=>scrubHandlers.current.start(),change:next=>scrubHandlers.current.change(next),finish:cancelled=>scrubHandlers.current.finish(cancelled)});
 },[compact,model.scope,model.property,model.frame,property.kind,property.min,property.max]);
 const select=(value:string)=>{try{filmAuthoringActions.selectProperty(value);setIssue('');}catch(error){setIssue(error instanceof Error?error.message:String(error));}};
 const hint=property.keyed?'移除当前帧关键帧':property.animated?'在当前帧添加关键帧；修改此属性也会创建关键帧':'为此属性添加动画';
 const groups=[...new Set(model.properties.map(item=>item.group??'属性'))];
 return <section className={'film-property-timing'+(compact?' compact':'')} aria-label={t('属性动画')}>
  <div className="film-property-timing-row">
   <select aria-label={t('动画属性')} value={custom?'custom-property':property.name} onChange={event=>{if(event.target.value==='custom-property'){setCustom(true);setName(property.kind==='css'?property.name:'--');}else{setCustom(false);select(event.target.value);}}}>
    {groups.map(group=><optgroup key={group} label={t(group)}>{model.properties.filter(item=>(item.group??'属性')===group).map(item=><option key={item.name} value={item.name}>{t(item.label)}</option>)}</optgroup>)}
    {model.customProperties&&<option value="custom-property">{t('自定义 CSS 属性')}</option>}
   </select>
   <output aria-label={t('当前帧')} title={t('当前帧')}>{model.frame} {t('帧')}</output>
   <button type="button" className="film-property-key" disabled={model.disabled} aria-label={t(hint)} title={t(hint)} aria-pressed={property.keyed} data-animated={property.animated} onClick={()=>run(filmAuthoringActions.toggleKey(model))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 8-8 8-8-8Z" fill={property.keyed?'currentColor':'none'}/></svg></button>
  </div>
  {custom&&<form className="film-custom-property" onSubmit={event=>{event.preventDefault();select(name.trim());}}><input aria-label={t('CSS 属性名')} placeholder="--progress" value={name} onChange={event=>setName(event.target.value)}/><button type="submit" title={t('选择属性')} aria-label={t('选择属性')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></form>}
  {!compact&&<label className="film-property-value"><span>{t(property.label)}</span>{property.kind==='enum'?<select aria-label={t(property.label)} disabled={model.disabled} value={String(property.value)} onChange={event=>run(filmAuthoringActions.commit(event.target.value,model))}>{property.options?.map(option=><option key={option} value={option}>{t(propertyOptionLabels[option]??option)}</option>)}</select>:<input ref={numericInput} aria-label={t(property.label)} disabled={model.disabled} type={property.kind==='number'?'number':'text'} min={property.min} max={property.max} step="any" inputMode={property.kind==='number'?'decimal':undefined} value={value} onFocus={()=>{editing.current=true;origin.current=latest.current;}} onChange={event=>{editing.current=true;setValue(event.target.value);}} onBlur={()=>void commit()} onKeyDown={event=>{event.stopPropagation();if(event.nativeEvent.isComposing)return;if(event.key==='Enter'){event.preventDefault();void commit();event.currentTarget.blur();}else if(event.key==='Escape'){event.preventDefault();editing.current=false;filmAuthoringActions.cancelPreview();setValue(String(property.value));event.currentTarget.blur();}}}/>}</label>}
  {!compact&&<div className="film-animation-value-actions"><button type="button" disabled={model.disabled} title={t('重置基础值；保留关键帧')} aria-label={t('重置基础值；保留关键帧')} onClick={()=>run(filmAuthoringActions.resetBase(model))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg></button></div>}
  {!compact&&<EasingEditor model={model}/>}
  {!compact&&!!model.keys?.length&&<div className="film-property-keys" aria-label={t('关键帧')}>{model.keys.map(key=><button type="button" key={key.frame} aria-current={key.frame===model.frame} title={`${key.frame} ${t('帧')}`} onClick={()=>filmAuthoringActions.seek(key.frame)}>{key.frame}</button>)}</div>}
  {(issue||model.error)&&<p className="hint" role="status">{t(issue||model.error!)}</p>}
 </section>;
}
function EasingEditor({model}:{model:FilmAuthoringModel}){
 const t=useI18n(),easing=model.currentEasing??'linear',preset=Object.keys(easingPresets).find(name=>JSON.stringify(easingPresets[name])===JSON.stringify(easing))??'custom';
 const initial=Array.isArray(easing)?easing:[.25,.1,.25,1],[values,setValues]=useState(initial.map(String)),[issue,setIssue]=useState('');
 const pending=useRef(false),drafting=useRef(false),cancelled=useRef(false),editOrigin=useRef(model);
 useEffect(()=>{if(!drafting.current)setValues(initial.map(String));},[JSON.stringify(easing)]);
 const submit=async(next:string[],origin=model)=>{drafting.current=false;if(cancelled.current){cancelled.current=false;return;}if(pending.current)return;const curve=next.map(Number);if(next.some(value=>!value.trim())||!validEasing(curve)){setIssue('请输入有效贝塞尔参数，X1/X2 必须在 0 到 1 之间');return;}if(JSON.stringify(curve)===JSON.stringify(easing))return;pending.current=true;try{await filmAuthoringActions.easing(curve,origin);setIssue('');}catch(error){setIssue(error instanceof Error?error.message:String(error));}finally{pending.current=false;}};
 const curve=values.map(Number),coords=validEasing(curve)?curve:initial,min=Math.min(0,coords[1],coords[3]),max=Math.max(1,coords[1],coords[3]),x=(value:number)=>16+value*208,y=(value:number)=>112-(value-min)/(max-min)*96;
 return <div className="film-easing-editor">
  <label className="film-control-row"><span>{t('到下一关键帧的缓动')}</span><select aria-label={t('关键帧缓动')} disabled={!model.easingEditable} value={preset} onChange={event=>run(filmAuthoringActions.easing(event.target.value==='custom'?[.25,.1,.75,.9]:easingPresets[event.target.value],model))}>{Object.entries(easingLabels).map(([name,label])=><option key={name} value={name}>{t(label)}</option>)}</select></label>
  {preset==='custom'&&<>
   <svg className="film-easing-curve" viewBox="0 0 240 128" role="img" aria-label={t('贝塞尔缓动曲线')}><path className="film-easing-guide" d={`M${x(0)} ${y(0)}L${x(1)} ${y(1)}M${x(0)} ${y(0)}L${x(coords[0])} ${y(coords[1])}M${x(1)} ${y(1)}L${x(coords[2])} ${y(coords[3])}`}/><path d={`M${x(0)} ${y(0)}C${x(coords[0])} ${y(coords[1])} ${x(coords[2])} ${y(coords[3])} ${x(1)} ${y(1)}`}/>{[0,2].map(index=><circle key={index} cx={x(coords[index])} cy={y(coords[index+1])} r="4"/>)}</svg>
   <div className="film-easing-values">{['X1','Y1','X2','Y2'].map((label,index)=><label key={label}>{label}<input type="number" step=".01" min={index%2===0?0:undefined} max={index%2===0?1:undefined} disabled={!model.easingEditable} aria-label={`${t('贝塞尔')} ${label}`} value={values[index]} onFocus={()=>{drafting.current=true;cancelled.current=false;editOrigin.current=model;}} onChange={event=>{const next=[...values];next[index]=event.target.value;setValues(next);}} onBlur={()=>void submit(values,editOrigin.current)} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){drafting.current=false;cancelled.current=true;setValues(initial.map(String));event.currentTarget.blur();}else if(event.key==='Enter'){event.preventDefault();void submit(values,editOrigin.current);event.currentTarget.blur();}}}/></label>)}</div>
  </>}
  {issue&&<p className="hint" role="status">{t(issue)}</p>}
 </div>;
}
