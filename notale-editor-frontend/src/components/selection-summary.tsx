'use client';
import {RichEditorButton} from './rich-editor';
import {useEditorSelector} from '../state/use-editor-selector';
/** The panel header: what is selected, and the one action that must stay reachable whatever
 * facet is open. Everything type-specific now lives in the facet that type owns. */
export function SelectionSummary(){const selection=useEditorSelector(state=>state.inspector);return <>
 <div className="selection-name" id="selection-name" hidden={selection.typography && selection.label === "文字"}>{selection.label}</div>
 <RichEditorButton/>
 <p id="property-lock-hint" className="hint" hidden={!selection.locked}>对象已锁定。在“名称与可见性”中解锁后可编辑。</p>
 <p id="property-empty" className="property-empty" hidden={selection.count>0}>未选中对象</p>
 </>;}
