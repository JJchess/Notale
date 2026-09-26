'use client';
import {useI18n} from '../i18n/react';

import {useSyncExternalStore} from 'react';
import {componentNavigationState} from '../state/component-navigation';
export function ComponentNavigation(){
 const t=useI18n();
const model=useSyncExternalStore(componentNavigationState.subscribe,componentNavigationState.getSnapshot,componentNavigationState.getServerSnapshot);return <fieldset id="component-members" hidden={!model.options.length}><legend>{t("互动组件")}</legend><label>{t("编辑对象")}<select id="component-member" value={model.selected} onChange={event=>model.choose?.(event.target.value)}>{model.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button id="select-component-member" disabled={!model.selected} onClick={()=>model.select?.()}>{t("选择对象")}</button></fieldset>;}
