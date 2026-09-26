'use client';
import {useI18n} from '../i18n/react';

import {NumberField} from './ui/number-field';
import {numericExpression} from '../state/numeric-expression';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useViewSettings,viewSettings,guideActions,type Guide,type GuideSource} from '../state/view-settings';
import {useEditorSelector} from '../state/use-editor-selector';
function GuideRow({guide,source}:{guide:Guide;source:GuideSource}){
 const t=useI18n();

 const [baseline,setBaseline]=useState(guide),[position,setPosition]=useState(String(guide.position)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(position===String(baseline.position)){setPosition(String(guide.position));setBaseline(guide);}},[guide,position,baseline]);
 const save=async(remove=false)=>{setBusy(true);setError('');try{const next=remove?baseline.position:numericExpression(position);await guideActions.edit(source,{...guide,position:next},baseline,remove);setPosition(String(next));setBaseline({...guide,position:next});}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}};
 return <div className="guide-row" data-guide={guide.id}><label>{guide.axis==='x' ? t("垂直 X") : t("水平 Y")}<input type="text" role="spinbutton" inputMode="decimal" data-editor-number="" data-guide-position={guide.id} aria-label={guide.axis.toUpperCase() + t(" 参考线坐标")} value={position} disabled={busy} onChange={e=>setPosition(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setPosition(String(guide.position));setBaseline(guide);setError('');e.currentTarget.blur();}else if(e.key==='Enter'){e.preventDefault();void save();}}}/></label><button data-save-guide={guide.id} disabled={busy} onClick={()=>void save()}>{t("更新")}</button><button data-remove-guide={guide.id} disabled={busy} onClick={()=>void save(true)}>{t("删除")}</button><span role="status">{t(error)}</span></div>;
}
function GuideDialog({close}:{close:()=>void}){
 const t=useI18n();

 const ref=useRef<HTMLDialogElement>(null),settings=useViewSettings(),state=useEditorSelector(s=>s),doc=state.document?.document,page=doc?.slides.find(p=>p.id===state.activePageId);
 const [axis,setAxis]=useState<'x'|'y'>('x'),[position,setPosition]=useState('100'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useLayoutEffect(()=>{const node=ref.current!;node.showModal();return()=>node.close();},[]);
 const source={documentId:doc?.id??'',pageId:page?.id??''};
 return <dialog ref={ref} id="view-settings-dialog" className="settings-dialog" aria-label={t("网格与参考线")} onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();close();}}><header><h2>{t("网格与参考线")}</h2><button aria-label={t("关闭")} onClick={close}>×</button></header><NumberField id="snap-grid" label={t("网格间距（0 关闭）")} min={0} max={10000} value={settings.grid} onCommit={grid=>viewSettings.update({grid})}/><div className="field-grid"><label>{t("方向")}<select id="guide-axis" value={axis} onChange={e=>setAxis(e.target.value as 'x'|'y')}><option value="x">{t("垂直 X")}</option><option value="y">{t("水平 Y")}</option></select></label><label>{t("页面坐标")}<input id="guide-position" type="text" inputMode="decimal" value={position} onChange={e=>setPosition(e.target.value)}/></label></div><button id="add-guide" disabled={!page||busy} onClick={async()=>{setBusy(true);setError('');try{const next=numericExpression(position);await guideActions.edit(source,{id:crypto.randomUUID(),axis,position:next});setPosition(String(next));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t("添加参考线")}</button><div id="guide-list">{page?.guides?.map(guide=><GuideRow key={doc!.id+page.id+guide.id} guide={guide} source={source}/>)}</div><p role="status" hidden={!error}>{t(error)}</p></dialog>;
}
export function ViewSettingsMenu(){
 const t=useI18n();

 const ref=useRef<HTMLDetailsElement>(null),settings=useViewSettings(),[dialog,setDialog]=useState(false);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))ref.current.open=false;};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[]);
 return <><details ref={ref} className="canvas-settings-menu" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){ref.current!.open=false;ref.current!.querySelector('summary')!.focus();}}}><summary title={t("视图设置")} aria-label={t("视图设置")}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg></summary><div className="editor-popup"><div id="view-preferences">{([['rulers','rulers-visible','显示标尺（拖出参考线）'],['visible','guides-visible','显示参考线'],['enabled','snap-enabled','吸附到对象、页面和参考线']] as const).map(([key,id,label])=><label key={key}><input id={id} type="checkbox" checked={settings[key]} onChange={e=>viewSettings.update({[key]:e.target.checked})}/>{t(label)}</label>)}</div><button id="open-guide-settings" onClick={()=>{ref.current!.open=false;setDialog(true);}}>{t("网格与参考线…")}</button></div></details>{dialog && <GuideDialog close={()=>{setDialog(false);ref.current?.querySelector('summary')?.focus();}}/>}</>;
}
