'use client';
import {useI18n} from '../i18n/react';

import {RichEditorButton} from './rich-editor';
import {useEditorSelector} from '../state/use-editor-selector';
/** The panel header: what is selected, and the one action that must stay reachable whatever
 * facet is open. Everything type-specific now lives in the facet that type owns. */
export function SelectionSummary(){
 const t=useI18n();
const selection=useEditorSelector(state=>state.inspector);return <>
 <div className="selection-name" id="selection-name" hidden={selection.typography && selection.label === "文字"}>{selection.authoredName?selection.authoredName+(selection.locked?t(' · 已锁定'):''):t(selection.label)}</div>
 <RichEditorButton/>
 <p id="property-lock-hint" className="hint" hidden={!selection.locked}>{t("对象已锁定。在“名称与可见性”中解锁后可编辑。")}</p>
 <p id="property-empty" className="property-empty" hidden={selection.count>0}>{t("未选中对象")}</p>
 </>;}
