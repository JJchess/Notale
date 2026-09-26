'use client';
import {useI18n} from '../i18n/react';

import {unavailableFeature} from '../feature-availability';
import {useRef,useState,useSyncExternalStore} from 'react';
import {layoutValueState,layoutValueActions} from '../layout-values';
import {useAuthorDraft} from '../state/use-author-draft';
export function LayoutValues(){
 const t=useI18n();

 const model=useSyncExternalStore(layoutValueState.subscribe,layoutValueState.getSnapshot,layoutValueState.getServerSnapshot),form=useAuthorDraft(model,layoutValueActions.save),values=form.draft?JSON.parse(form.draft):{},[busy,setBusy]=useState(false),[error,setError]=useState(''),running=useRef(false),[key,setKey]=useState(''),[label,setLabel]=useState('');
 const run=async(action:()=>Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{running.current=false;setBusy(false);}};
 return <fieldset id="layout-values" hidden={!model||!model.author&&!model.texts.length&&!model.images.length} disabled={busy||form.pending}><legend>{t("本页版式内容")}</legend><div id="layout-value-fields">{model?.texts.map(text=><label key={text.id}>{text.label}<textarea rows={3} data-key={text.id} value={values[text.id]??''} onChange={e=>form.change(JSON.stringify({...values,[text.id]:e.target.value}))}/></label>)}{model?.images.map(image=><label key={image.id}>{image.label} · {image.overridden ? t("本页图片") : t("母版图片")}<input type="file" accept="image/*" data-image-key={image.id} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>layoutValueActions.image(model,image.id,file));}}/><button type="button" data-reset-image={image.id} disabled={!image.overridden} onClick={()=>void run(()=>layoutValueActions.image(model,image.id,null))}>{t("恢复母版图片")}</button></label>)}</div><button id="save-layout-values" type="button" disabled={!model?.texts.length} onClick={()=>void form.apply()}>{t("保存本页内容")}</button><button id="reset-layout-values" type="button" disabled={!model?.texts.length} onClick={()=>model&&void run(()=>layoutValueActions.reset(model))}>{t("恢复母版默认文字")}</button><div id="layout-placeholder-author" {...unavailableFeature}><label>{t("逐页内容标识")}<input id="placeholder-key" placeholder={t("例如 title 或 explanation")} value={key} onChange={e=>setKey(e.target.value)}/></label><label>{t("名称")}<input id="placeholder-label" placeholder={t("例如 本页标题")} value={label} onChange={e=>setLabel(e.target.value)}/></label><button id="set-layout-placeholder" type="button" onClick={()=>model&&void run(()=>layoutValueActions.placeholder(model,key,label))}>{t("将选中对象设为逐页内容")}</button></div><p role="status">{t(error) || t(form.error)}</p></fieldset>;
}
