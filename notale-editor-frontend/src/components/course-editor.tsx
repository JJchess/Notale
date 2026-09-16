'use client';
import {useLayoutEffect,useEffect,useRef,useState,useSyncExternalStore,type CSSProperties} from 'react';
import type * as Monaco from 'monaco-editor';
import {CODE_FILES,type CodeFile,type CodeSources} from '@notale/editor/browser';
import {courseState,courseActions,courseKey,type CourseEditing,type CoursePreview} from '../state/course-editor';
import {CourseSession,sameSources} from '../state/course-session';
import {loadCourseMonaco,courseModels} from '../course-monaco';
const roles:Record<CodeFile,string>={'starter.py':'默认示例代码','observe.py':'执行状态采集','tests.py':'验证规则','view/render.js':'可视化渲染'};
function Icon({name}:{name:'run'|'stop'|'save'|'close'|'discard'|'output'}){return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='run'?<path d="m8 4 12 8-12 8Z"/>:name==='stop'?<rect x="6" y="6" width="12" height="12" rx="1"/>:name==='save'?<><path d="M5 3h12l4 4v14H3V3h2M7 3v6h9V3"/><path d="M7 21v-8h10v8"/></>:name==='close'?<path d="m6 6 12 12M18 6 6 18"/>:name==='discard'?<><path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/></>:<><path d="m5 7 5 5-5 5M13 17h6"/></>}</svg>;}
export function CourseDialog(){
  const {editing,session,loading}=useSyncExternalStore(courseState.subscribe,courseState.getSnapshot,courseState.getServerSnapshot);
  return editing&&session?<CourseForm key={editing.id} editing={editing} session={session}/>:loading?<CourseLoading/>:null;
}
function CourseLoading(){const node=useRef<HTMLDialogElement>(null);useLayoutEffect(()=>{node.current?.showModal();void loadCourseMonaco().catch(()=>{});return()=>node.current?.close();},[]);
  return <dialog ref={node} id="course-editor-dialog" aria-label="课程代码" aria-busy="true" onCancel={e=>{e.preventDefault();courseActions.close();}}><header className="course-heading"><h2>课程代码</h2><div className="course-actions"><button title="关闭" aria-label="关闭课程编辑" onClick={()=>courseActions.close()}><Icon name="close"/></button></div></header><div className="course-loading" role="status" aria-label="正在打开课程"/></dialog>;
}
function CourseForm({editing,session}:{editing:CourseEditing;session:CourseSession}){
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  const dialog=useRef<HTMLDialogElement>(null),container=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null),body=useRef<HTMLDivElement>(null);
  const editor=useRef<Monaco.editor.IStandaloneCodeEditor|undefined>(undefined),cache=useRef<ReturnType<typeof courseModels>|undefined>(undefined),monaco=useRef<typeof Monaco|undefined>(undefined);
  const live=useRef(true),restoring=useRef(false),sequence=useRef(0),requests=useRef<Record<string,number>>({}),runSources=useRef<CodeSources|undefined>(undefined);
  const preview=useRef<{value:CoursePreview;sources:CodeSources}|undefined>(undefined);
  const [file,setFile]=useState<CodeFile>('starter.py'),[ready,setReady]=useState(false),[frameReady,setFrameReady]=useState(false),[running,setRunning]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[output,setOutput]=useState(''),[outputOpen,setOutputOpen]=useState(false),[split,setSplit]=useState(52),[comparing,setComparing]=useState(false);
  const [displayedSources,setDisplayedSources]=useState<CodeSources>(editing.sources);
  const [failure,setFailure]=useState<{file:CodeFile;line:number}|undefined>(undefined);
  const dirty=session.dirty;
  const post=(action:string)=>{if(!frame.current?.contentWindow)return;const id=++sequence.current;requests.current[action]=id;const current=session.getSnapshot();frame.current.contentWindow.postMessage({source:'notale-course-editor',session:editing.id,channel:editing.channel,id,action,draftRevision:current.revision,sources:{...current.sources}},new URL(editing.url).origin);};
  const run=()=>{if(!ready||!frameReady)return;runSources.current={...session.getSnapshot().sources};setRunning(true);setError('');setFailure(undefined);setStatus('正在运行');for(const m of cache.current?.models.values()??[])monaco.current?.editor.setModelMarkers(m,'notale-course',[]);post('run');};
  const stop=()=>{requests.current.run=++sequence.current;post('stop');setRunning(false);setStatus('已停止');};
  const close=async()=>{try{if(state.ready)await session.flush();courseActions.close();}catch(e){setError(String(e));}};
  const save=()=>{const value=preview.current;void session.save(value&&sameSources(value.sources,session.getSnapshot().sources)?value.value:undefined);};
  const actions=useRef({run,save,close});actions.current={run,save,close};
  useLayoutEffect(()=>{
    live.current=true;const node=dialog.current!;node.showModal();const disposables:Monaco.IDisposable[]=[];
    void (async()=>{
      const [api]=await Promise.all([loadCourseMonaco(),session.initialized]);if(!live.current)return;monaco.current=api;
      api.editor.defineTheme('notale-author',{base:'vs',inherit:true,rules:[{token:'keyword',foreground:'8050A0'},{token:'string',foreground:'3F755A'},{token:'number',foreground:'99612C'},{token:'comment',foreground:'817888'},{token:'identifier',foreground:'29272E'},{token:'delimiter',foreground:'625B6A'}],colors:{'editor.background':'#ffffff','editorLineNumber.foreground':'#a49fab','editor.selectionBackground':'#ece1ff','editor.lineHighlightBackground':'#f7f6f9','editorCursor.foreground':'#6c18f5'}});
      const saved=courseModels(api,courseKey(editing),session.getSnapshot().sources);cache.current=saved;
      for(const [f,model] of saved.models){
        const source=session.getSnapshot().sources[f];if(model.getValue()!==source)model.pushEditOperations([],[{range:model.getFullModelRange(),text:source}],()=>null);
        api.editor.setModelMarkers(model,'notale-course',[]);
        disposables.push(model.onDidChangeContent(()=>{if(restoring.current)return;session.edit(f,model.getValue());api.editor.setModelMarkers(model,'notale-course',[]);setFailure(current=>current?.file===f?undefined:current);setError('');}));
      }
      editor.current=api.editor.create(container.current!,{model:saved.models.get(saved.active),theme:'notale-author',fontSize:14,lineHeight:23,fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',minimap:{enabled:false},padding:{top:16,bottom:16},scrollBeyondLastLine:false,automaticLayout:true,tabSize:4,glyphMargin:true,roundedSelection:false});
      const view=saved.views.get(saved.active);if(view)editor.current.restoreViewState(view);setFile(saved.active);setSplit(saved.split);
      disposables.push(editor.current.addAction({id:'notale-course-run',label:'试运行',keybindings:[api.KeyMod.CtrlCmd|api.KeyCode.Enter],run:()=>actions.current.run()}),editor.current.addAction({id:'notale-course-save',label:'保存到讲义',keybindings:[api.KeyMod.CtrlCmd|api.KeyCode.KeyS],run:()=>actions.current.save()}));
      setReady(true);editor.current.focus();
    })().catch(e=>live.current&&setError(e instanceof Error?e.message:String(e)));
    const receive=(event:MessageEvent)=>{
      const data=event.data;if(event.source!==frame.current?.contentWindow||event.origin!==new URL(editing.url).origin||data?.source!=='notale-course-preview'||data.channel!==editing.channel||data.session!==editing.id||data.id!==requests.current[data.action])return;
      if(data.action==='ready'){setFrameReady(!data.error);if(data.error)setError(data.error);return;}
      if(data.action==='stop')return;
      if(data.action==='run'){setRunning(false);setOutput(data.state?.output??'');setStatus(data.state?.outputKind==='success'?'运行完成':data.state?.outputKind==='warning'?'测试未通过':data.state?.outputKind==='error'?'运行失败':'');}
      if(data.error){setError(data.error);return;}
      if(data.preview&&data.previewSources){preview.current={value:data.preview,sources:data.previewSources};setDisplayedSources(data.previewSources);}
      const execution=data.action==='run'?data.state?.executionError:undefined;
      if(execution){setError(execution.message);setOutputOpen(true);const f=execution.source?.file as CodeFile;
        if(cache.current?.models.has(f)&&monaco.current&&runSources.current?.[f]===session.getSnapshot().sources[f]){
          const model=cache.current.models.get(f)!,line=Math.max(1,Math.min(model.getLineCount(),execution.source.line||1));
          monaco.current.editor.setModelMarkers(model,'notale-course',[{severity:8,message:execution.message,startLineNumber:line,endLineNumber:line,startColumn:1,endColumn:2}]);setFailure({file:f,line});
        }
      }else if(data.action==='run'&&!data.state?.viewError)setError('');
      if(data.state?.viewError)setError(data.state.viewError);
    };window.addEventListener('message',receive);
    const flush=()=>{void session.flush().catch(()=>{});};
    const visibility=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);
    return()=>{live.current=false;window.removeEventListener('message',receive);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);const saved=cache.current;if(saved&&editor.current)saved.views.set(saved.active,editor.current.saveViewState());disposables.forEach(d=>d.dispose());editor.current?.dispose();node.close();};
  },[]);
  useEffect(()=>{if(!ready)return;restoring.current=true;for(const [f,model] of cache.current!.models){const source=state.sources[f];if(model.getValue()!==source){model.pushEditOperations([],[{range:model.getFullModelRange(),text:source}],()=>null);monaco.current!.editor.setModelMarkers(model,'notale-course',[]);}}restoring.current=false;},[state.sources,ready]);
  // Only renderer changes reach the preview while typing. Python snapshots change on Run.
  useEffect(()=>{if(!ready||!frameReady)return;const timer=setTimeout(()=>post('render'),300);return()=>clearTimeout(timer);},[state.sources['view/render.js'],ready,frameReady]);
  useEffect(()=>{
    if(frameReady)return;let stopped=false,delay=100;let retry:ReturnType<typeof setTimeout>;
    // Module readiness does not depend on the iframe's full load event (nested frames can delay it).
    const hello=()=>{if(stopped)return;post('ready');retry=setTimeout(hello,delay);delay=Math.min(2000,delay*2);};hello();
    const deadline=setTimeout(()=>{stopped=true;clearTimeout(retry);setError('课程预览未就绪，请重新打开或重新导入当前代码产物。');},15000);
    return()=>{stopped=true;clearTimeout(retry);clearTimeout(deadline);};
  },[frameReady]);
  function switchFile(next:CodeFile){const saved=cache.current;if(saved&&editor.current){saved.views.set(saved.active,editor.current.saveViewState());saved.active=next;editor.current.setModel(saved.models.get(next)!);const view=saved.views.get(next);if(view)editor.current.restoreViewState(view);editor.current.focus();}setFile(next);}
  const stale=!sameSources(displayedSources,state.sources);
  const visibleStatus=state.saving?'正在保存':state.saved&&!dirty?'已保存到讲义':running?'正在运行':status|| (dirty?'草稿':'');
  return <dialog ref={dialog} id="course-editor-dialog" aria-labelledby="course-editor-title" onCancel={event=>{event.preventDefault();void close();}} onKeyDown={event=>{event.stopPropagation();if(event.defaultPrevented)return;if(!event.nativeEvent.isComposing&&(event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==='s'||event.key==='Enter')){event.preventDefault();event.key==='Enter'?run():save();}}}>
    <header className="course-heading"><h2 id="course-editor-title">课程代码</h2><span className="course-title">{editing.title}</span><span className="course-status" role="status" title={stale?'预览来自上次运行，尚未运行当前草稿':undefined}>{visibleStatus}{stale&&<span className="course-stale" aria-label="预览尚未对应当前草稿"> · </span>}</span><div className="course-actions">
      <button title={running?'停止运行':'试运行 (Ctrl/⌘+Enter)'} aria-label={running?'停止运行':'试运行'} disabled={!ready||!frameReady} onClick={()=>running?stop():run()}><Icon name={running?'stop':'run'}/></button>
      <button title="放弃草稿" aria-label="放弃草稿" disabled={!ready||state.saving||!dirty} onClick={()=>{session.discard();setError('');setFailure(undefined);}}><Icon name="discard"/></button>
      <button className="course-save" title="保存到讲义 (Ctrl/⌘+S)" aria-label="保存到讲义" disabled={!ready||!session.canSave||!!state.conflict} onClick={save}><Icon name="save"/></button>
      <button title="关闭" aria-label="关闭课程编辑" onClick={()=>void close()}><Icon name="close"/></button>
    </div></header>
    <div ref={body} className="course-body" style={{'--course-split':split+'%'} as CSSProperties}>
      <section className="course-source"><div className="course-tabs" role="tablist" aria-label="课程文件">{CODE_FILES.map((name,index)=><button key={name} role="tab" disabled={!ready} aria-selected={file===name} tabIndex={file===name?0:-1} title={roles[name]} onClick={()=>switchFile(name)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;switchFile(CODE_FILES[next]);(event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();}}}>{name}{(state.conflict?.files.includes(name)||session.changed(name))&&<span className="course-dirty" aria-label={state.conflict?.files.includes(name)?'存在冲突':'未保存'}/>}</button>)}</div>
      <div className="course-monaco" ref={container} aria-label="课程源代码" hidden={comparing&&!!state.conflict}/>
      {comparing&&state.conflict&&ready&&<CourseDiff api={monaco.current!} model={cache.current!.models.get(file)!} remote={state.conflict.sources[file]} unresolved={state.conflict.files.includes(file)} onLocal={()=>session.resolveFile(file,false)} onRemote={()=>session.resolveFile(file,true)}/>}
      </section>
      <div className="course-sash" role="separator" aria-label="调整代码与预览宽度" aria-orientation="vertical" aria-valuenow={split} aria-valuemin={30} aria-valuemax={75} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const value=Math.max(30,Math.min(75,split+(e.key==='ArrowRight'?2:-2)));setSplit(value);if(cache.current)cache.current.split=value;}}} onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const rect=body.current!.getBoundingClientRect(),value=Math.max(30,Math.min(75,(e.clientX-rect.left)/rect.width*100));setSplit(value);if(cache.current)cache.current.split=value;}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
      <section className="course-preview"><iframe ref={frame} title="课程运行预览" src={editing.url} sandbox="allow-scripts allow-same-origin" onLoad={()=>post('ready')}/></section>
    </div>
    <footer className="course-footer"><button title="输出与测试" aria-label="输出与测试" aria-expanded={outputOpen} onClick={()=>setOutputOpen(v=>!v)}><Icon name="output"/></button>
      {(error||state.error||state.storageError)&&<span className="course-error" role="alert">{error||state.error||state.storageError}</span>}
      {failure&&<button className="course-text-action" onClick={()=>{setComparing(false);switchFile(failure.file);editor.current?.revealLineInCenter(failure.line);}}>{failure.file}:{failure.line}</button>}
      {state.conflict&&<><button className="course-text-action" onClick={()=>setComparing(v=>!v)}>{comparing?'返回编辑':'查看差异'}</button><button className="course-text-action" disabled={state.conflict.files.length>0} onClick={()=>{session.confirmMerge();setComparing(false);}}>确认合并</button></>}
    </footer>
    {outputOpen&&<pre className="course-output" aria-label="输出与测试结果">{output}</pre>}
  </dialog>;
}
function CourseDiff({api,model,remote,unresolved,onLocal,onRemote}:{api:typeof Monaco;model:Monaco.editor.ITextModel;remote:string;unresolved:boolean;onLocal:()=>void;onRemote:()=>void}){
  const node=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const original=api.editor.createModel(remote,model.getLanguageId());const diff=api.editor.createDiffEditor(node.current!,{theme:'notale-author',automaticLayout:true,originalEditable:false,renderSideBySide:true,minimap:{enabled:false},fontSize:13,scrollBeyondLastLine:false});diff.setModel({original,modified:model});return()=>{diff.dispose();original.dispose();};},[api,model,remote]);
  return <div className="course-diff"><div className="course-diff-actions"><span>讲义版本 / 本机合并结果</span>{unresolved&&<><button onClick={onRemote}>采用讲义版本</button><button onClick={onLocal}>采用本机结果</button></>}</div><div ref={node} className="course-diff-editor"/></div>;
}
