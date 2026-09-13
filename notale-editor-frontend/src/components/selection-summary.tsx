'use client';
import {RevealEditor} from './reveal-preset';
import {NativeChartProperties} from './chart-properties';
import {StaticChartButtons} from './static-chart-editor';
import {CodeButton} from './code-editor';
import {EquationButton} from './equation-editor';
import {TableEditor} from './table-editor';
import {ImageCropButton} from './image-crop';
import {RichEditorButton} from './rich-editor';
import {LinkInspectorPanel} from './link-editor';
import {useEditorSelector} from '../state/use-editor-selector';
export function SelectionSummary(){const selection=useEditorSelector(state=>state.inspector);return <>
 <div className="selection-name" id="selection-name" hidden={selection.typography && selection.label === "文字"}>{selection.label}</div>
 <RevealEditor/><RichEditorButton/><ImageCropButton/><EquationButton/><CodeButton/><StaticChartButtons/><NativeChartProperties/>
 <LinkInspectorPanel/><TableEditor/>
 <p id="property-lock-hint" className="hint" hidden={!selection.locked}>对象已锁定。在“名称与可见性”中解锁后可编辑。</p>
 <p id="property-empty" className="property-empty" hidden={selection.count>0}>未选中对象</p>
 </>;}
