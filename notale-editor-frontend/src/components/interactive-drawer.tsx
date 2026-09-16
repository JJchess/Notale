'use client';
import {useSyncExternalStore} from 'react';
import {RevealInsert} from './reveal-preset';
import {LinkInsertButton} from './link-editor';
import {aiEditsState} from '../state/ai-edits';
import {isComposingKey} from '../keyboard';
/** The 互动 drawer: ask for an interaction in words, or reach for one of the two presets
 * that already exist. The presets moved here from the 插入 catalog, which is for static
 * content; anything that responds to a click belongs on this tab. */
export function InteractiveDrawer(){
 const model=useSyncExternalStore(aiEditsState.subscribe,aiEditsState.getSnapshot,aiEditsState.getServerSnapshot);
 const running=model.status==='running',candidate=model.status==='candidate'?model.candidate:undefined;
 return <div id="interactive-panel" className="interactive-panel">
  <section aria-label="AI 构建">
   <h3 className="insert-group-title">{"AI 构建"}</h3>
   <p id="ai-target" className="hint">{model.intent==='edit-selection'?`修改选中的「${model.targetLabel}」`:'未选中对象，将新建一个互动'}</p>
   <textarea id="ai-instruction" rows={3} placeholder="例如：加一个点开才显示答案的提示框"
    value={model.instruction} disabled={running||!model.available}
    onChange={event=>model.change?.({instruction:event.target.value})}
    onKeyDown={event=>{if(isComposingKey(event.nativeEvent))return;if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void model.submit?.();}}}/>
   {model.available
    ? <div className="inline">
       <button id="ai-submit" className="primary" disabled={running||!model.instruction.trim()} onClick={()=>void model.submit?.()}>{running?'生成中…':'生成'}</button>
       {running&&<button id="ai-stop" onClick={()=>model.stop?.()}>{"停止"}</button>}
      </div>
    : <p id="ai-unavailable" className="hint" role="status">{model.reason||'模型服务不可用'}</p>}
   {candidate&&<div id="ai-candidate" className="ai-candidate">
    <strong>{"待应用的修改"}</strong>
    <ul>{candidate.summary.map(entry=><li key={entry}>{entry}</li>)}</ul>
    <div className="inline">
     <button id="ai-apply" className="primary" onClick={()=>void model.apply?.()}>{"应用"}</button>
     <button id="ai-discard" onClick={()=>model.discard?.()}>{"取消"}</button>
    </div>
   </div>}
   {model.error&&<p id="ai-error" role="alert">{model.error}</p>}
  </section>
  <section aria-label="现成互动">
   <h3 className="insert-group-title">{"现成互动"}</h3>
   <RevealInsert/>
   <LinkInsertButton/>
  </section>
 </div>;
}
