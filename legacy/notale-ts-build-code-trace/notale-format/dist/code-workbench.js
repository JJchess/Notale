/** Deterministic adaptation of the official CodeLab chassis; never applies to arbitrary user code. */
export const officialCodeWorkbenchHashes = new Set([
    '3a7f0bf485743322dcd8047010e62ea55107fb31149d0305e953e2566d72eccf',
    '7ce1eec6c311a863619a689c044c3e4473c39f0d6696f48d45e8460b633ca2e5',
]);
export function stagedCodeWorkbench(source) {
    if (source.includes('NOTALE_STAGED_CODELAB_2'))
        return source;
    const start = source.lastIndexOf('  runtime = new WorkerRuntimeAdapter({'), end = source.indexOf('\n}\n\nwindow.addEventListener("beforeunload"', start);
    if (start < 0 || end < 0 || !source.includes('async function runCode()'))
        throw Error('Unsupported official code workbench');
    const adapter = source.slice(start, source.indexOf('\n  runtime.start()', start));
    source = source.slice(0, start) + `
  renderCodePoster();
  installSessionAdapter();
  const mode=window.__NOTALE_RENDER_MODE__ ?? new URLSearchParams(location.search).get('notaleMode');
  if(mode!=='poster')elements.editor.addEventListener('pointerdown',()=>void ensureEditor().catch(error=>setOutput('error',error.message)),{once:true});
` + source.slice(end);
    source = source.replace('async function runCode() {\n', `async function runCode() {
  if (runIntent || disposed) return;
  runIntent=true;
  try { await ensureInteractive(); } catch(error) {setOutput('error',error.message);return;} finally {runIntent=false;}
`);
    source = source.replace('  elements.runButton.disabled = !ready;', '  elements.runButton.disabled = disposed || !!runtime?.getState().running || !files.size;');
    source = source.replace('elements.runButtonIcon.className = ready ?', 'elements.runButtonIcon.className = (!interactiveTask || ready) ?').replace('elements.runButtonLabel.textContent = ready ?', 'elements.runButtonLabel.textContent = (!interactiveTask || ready) ?');
    source = source.replace('  disposed = true;', '  saveSession();stopSessionAdapter?.();clearTimeout(sessionTimer);sessionListeners.clear();disposed = true;');
    source = source.replace('function markDirty(filename) {', 'function markDirty(filename) { notifySession();').replace('function setOutput(kind, text) {', 'function setOutput(kind, text) { notifySession();').replace('function renderStep(rawStep, options = {}) {', 'function renderStep(rawStep, options = {}) { notifySession();');
    source = source.replace('    getEditor() { return editor; },', `    contractVersion: 2,
    ensureInteractive,
    pause,
    resume: play,
    captureSession() { return {files:Object.fromEntries([...files].map(([name,file])=>[name,models.get(name)?.getValue()??file.originalSource])),activeFile:activeFilename,view:editor?.saveViewState(),frames:playback.frames,index:playback.index,output:elements.outputContent.textContent,outputKind:elements.outputPanel.dataset.kind}; },
    async restoreSession(saved) { await ensureEditor(); if(disposed)return; for(const [name,value] of Object.entries(saved.files??{})){const model=models.get(name);if(model&&model.getValue()!==value)model.setValue(String(value));} if(saved.activeFile&&models.has(saved.activeFile))switchFile(saved.activeFile,{focus:false});if(saved.view)editor.restoreViewState(saved.view);if(Array.isArray(saved.frames)){playback.frames=saved.frames;showFrame(saved.index??0);}setOutput(saved.outputKind??'idle',saved.output??''); },
    getEditor() { return editor; },`);
    return source + `
// NOTALE_STAGED_CODELAB_2
let interactiveTask;
let editorTask;
function ensureEditor(){if(!editorTask)elements.editor.replaceChildren();return editorTask??=(initMonaco().then(()=>{const saved=readSession();if(saved)applySavedSession(saved,true);}).catch(error=>{editorTask=undefined;throw error;}));}
let runIntent=false;
function renderCodePoster(){
 const file=files.get(lesson.entry)||files.values().next().value;
 const pre=document.createElement('pre');pre.dataset.notaleCodePoster='';pre.textContent=file?.originalSource??'';
 pre.style.cssText='margin:0;padding:16px 24px;white-space:pre;overflow:hidden;height:100%;box-sizing:border-box;font:14px/22px var(--font-mono,monospace);color:var(--text);background:var(--editor)';
 elements.editor.replaceChildren(pre);elements.editorLoading.hidden=true;elements.runtimeText.textContent='Python';elements.runButton.disabled=false;
}
function ensureInteractive(){
 if(disposed)return Promise.reject(Error('工作台已关闭'));
 if(interactiveTask)return interactiveTask;
 interactiveTask=(async()=>{
 ${adapter}
 notifySession();
 const start=()=>runtime.start();
 await Promise.all([navigator.locks?navigator.locks.request('notale-python-start',start):start(),ensureEditor()]);
 })().catch(error=>{runtime?.dispose();interactiveTask=undefined;throw error;});
 return interactiveTask;
}

let sessionTimer;
let stopSessionAdapter;
const sessionListeners=new Set();
function sessionKey(){try{const parts=location.pathname.split('/');return 'notale-lab-2:'+parts[3]+':'+parts.slice(5).join('/')+':'+(frameElement?.getAttribute('data-notale-id')??'standalone');}catch{return 'notale-lab-2:'+location.pathname;}}
function authorSources(){return JSON.stringify([...files].map(([name,file])=>[name,file.originalSource]));}
function readSession(){try{const saved=JSON.parse(sessionStorage.getItem(sessionKey())??'null');return saved?.author===authorSources()?saved.value:null;}catch{return null;}}
function saveSession(){try{if(disposed||!window.CodeLab||!editorReady)return;const value=window.CodeLab.captureSession();const raw=JSON.stringify({author:authorSources(),value});if(raw.length<1500000)sessionStorage.setItem(sessionKey(),raw);}catch{}}
function notifySession(){clearTimeout(sessionTimer);sessionTimer=setTimeout(()=>{saveSession();for(const listener of sessionListeners)listener();try{parent.postMessage({source:'notale-code-lifecycle',busy:!!runIntent||!!runtime?.getState().running,heavy:!!runtime},location.origin);}catch{}},80);}
function applySavedSession(saved,editable=false){
 pause();
 if(editable){for(const [name,value] of Object.entries(saved.files??{})){const model=models.get(name);if(model&&model.getValue()!==value)model.setValue(String(value));}if(saved.activeFile&&models.has(saved.activeFile))switchFile(saved.activeFile,{focus:false});if(saved.view)editor.restoreViewState(saved.view);}
 else if(!editorReady){const pre=elements.editor.querySelector('pre');if(pre)pre.textContent=saved.files?.[saved.activeFile]??Object.values(saved.files??{})[0]??'';}
 if(Array.isArray(saved.frames)){playback.frames=saved.frames;playback.index=saved.index??0;const step=playback.frames[playback.index];if(step)renderStep(step,{reset:true,decorate:editable});updatePlaybackControls();}
 setOutput(saved.outputKind??'idle',saved.output??'');
}
function installSessionAdapter(){
 const mode=window.__NOTALE_RENDER_MODE__??new URLSearchParams(location.search).get('notaleMode');
 if(mode==='poster')return;
 const saved=readSession();if(saved)applySavedSession(saved);
 window.addEventListener('pagehide',saveSession);
 try{const id=frameElement?.getAttribute('data-notale-id');if(!id||parent===window)return;const registry=parent.__NOTALE_PRESENTATION_ADAPTERS__??=(Object.create(null));registry['code:'+id]={capture:()=>window.CodeLab.captureSession(),apply:value=>applySavedSession(value),pause,subscribe:fn=>{sessionListeners.add(fn);return()=>sessionListeners.delete(fn);}};const registered=registry['code:'+id];stopSessionAdapter=()=>{if(registry['code:'+id]===registered)delete registry['code:'+id];};parent.document.dispatchEvent(new Event('notale-adapter-ready'));}catch{}
}
`;
}
