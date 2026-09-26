'use client';
import {useI18n} from '../i18n/react';

import {useSyncExternalStore} from 'react';
import {revealPresetState} from '../state/reveal-preset';
function usePreset(){return useSyncExternalStore(revealPresetState.subscribe,revealPresetState.getSnapshot,revealPresetState.getServerSnapshot);}
export function RevealEditor(){
 const t=useI18n();
const model=usePreset(),draft=model.draft;return <fieldset id="reveal-editor" hidden={!draft} disabled={model.busy||model.locked}>
 <legend>{t("展开解释")}</legend>
 <label>{t("组件名称")}<input id="reveal-name" value={draft?.name??''} onChange={event=>model.change?.({name:event.target.value})}/></label>
 <label>{t("展开按钮文字")}<input id="reveal-closed-label" value={draft?.closedLabel??''} onChange={event=>model.change?.({closedLabel:event.target.value})}/></label>
 <label>{t("收起按钮文字")}<input id="reveal-open-label" value={draft?.openLabel??''} onChange={event=>model.change?.({openLabel:event.target.value})}/></label>
 <label>{t("解释内容")}<textarea id="reveal-answer" rows={4} value={draft?.answer??''} onChange={event=>model.change?.({answer:event.target.value})}/></label>
 <label>{t("打开页面时")}<select id="reveal-initial" value={draft?.initial??'closed'} onChange={event=>model.change?.({initial:event.target.value})}><option value="closed">{t("收起解释")}</option><option value="open">{t("显示解释")}</option></select></label>
 <button id="save-reveal" onClick={()=>void model.save?.()}>{t("保存互动内容")}</button>{model.error && <><p role="alert">{t(model.error)}</p><button onClick={()=>model.reset?.()}>{t("载入最新内容")}</button></>}

 </fieldset>;}
