'use client';
import {useSyncExternalStore} from 'react';
import {revealPresetState} from '../state/reveal-preset';
function usePreset(){return useSyncExternalStore(revealPresetState.subscribe,revealPresetState.getSnapshot,revealPresetState.getServerSnapshot);}
export function RevealInsert(){const model=usePreset();return <div id="reveal-preset"><button id="insert-reveal" className="preset-card" disabled={!model.available||model.busy} onClick={()=>void model.insert?.()}><strong>点击展开解释</strong><span>先提问，再揭示答案；支持再次收起。</span></button>{!model.draft&&model.error&&<p role="alert">{model.error}</p>}</div>;}
export function RevealEditor(){const model=usePreset(),draft=model.draft;return <fieldset id="reveal-editor" hidden={!draft} disabled={model.busy||model.locked}>
 <legend>展开解释</legend>
 <label>组件名称<input id="reveal-name" value={draft?.name??''} onChange={event=>model.change?.({name:event.target.value})}/></label>
 <label>展开按钮文字<input id="reveal-closed-label" value={draft?.closedLabel??''} onChange={event=>model.change?.({closedLabel:event.target.value})}/></label>
 <label>收起按钮文字<input id="reveal-open-label" value={draft?.openLabel??''} onChange={event=>model.change?.({openLabel:event.target.value})}/></label>
 <label>解释内容<textarea id="reveal-answer" rows={4} value={draft?.answer??''} onChange={event=>model.change?.({answer:event.target.value})}/></label>
 <label>打开页面时<select id="reveal-initial" value={draft?.initial??'closed'} onChange={event=>model.change?.({initial:event.target.value})}><option value="closed">收起解释</option><option value="open">显示解释</option></select></label>
 <button id="save-reveal" onClick={()=>void model.save?.()}>保存互动内容</button>{model.error&&<><p role="alert">{model.error}</p><button onClick={()=>model.reset?.()}>载入最新内容</button></>}
 
 </fieldset>;}
