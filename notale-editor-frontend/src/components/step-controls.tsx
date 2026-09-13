'use client';
import {editorActions} from '../state/editor-session';
import {useEditorSelector} from '../state/use-editor-selector';
export function StepControls(){
 const steps=useEditorSelector(state=>state.steps),ready=useEditorSelector(state=>state.canvas==='ready');
 return <div className="stepbar">
  <button id="step-prev" disabled={!ready||steps.current===0} onClick={()=>editorActions.seekStep(steps.current-1)}>← 上一步</button>
  <label>讲授步骤 <input id="step" type="range" min="0" max={steps.max} value={steps.current} disabled={!ready||steps.max===0} onChange={event=>editorActions.seekStep(Number(event.target.value),false)}/></label>
  <output id="step-label">{steps.current} / {steps.max}</output>
  <button id="step-next" disabled={!ready||steps.current===steps.max} onClick={()=>editorActions.seekStep(steps.current+1)}>下一步 →</button>
 </div>;
}
