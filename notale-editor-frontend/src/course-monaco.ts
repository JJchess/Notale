import type * as Monaco from 'monaco-editor';
let loading:Promise<typeof Monaco>|undefined;
let workerUrl:string|undefined;
/** Only trusted frontend assets execute in the editor origin. */
export function loadCourseMonaco():Promise<typeof Monaco>{
  return loading??=new Promise((resolve,reject)=>{
    const host=window as any;
    const load=()=>{
      host.MonacoEnvironment={getWorkerUrl:()=>workerUrl??=(URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:${JSON.stringify(location.origin+'/monaco/')}};importScripts(${JSON.stringify(location.origin+'/monaco/vs/base/worker/workerMain.js')});`],{type:'text/javascript'})))};
      host.require.config({paths:{vs:'/monaco/vs'}});
      host.require(['vs/editor/editor.main'],()=>resolve(host.monaco),(error:unknown)=>{loading=undefined;reject(error);});
    };
    if(host.monaco?.editor){resolve(host.monaco);return;}
    if(host.require?.config){load();return;}
    const script=document.createElement('script');script.src='/monaco/vs/loader.js';script.onload=load;script.onerror=()=>{loading=undefined;reject(Error('代码编辑器加载失败，请重新打开'));};document.head.append(script);
  });
}

import {CODE_FILES,type CodeFile,type CodeSources} from '@notale/editor/browser';
interface CourseModels {models:Map<CodeFile,Monaco.editor.ITextModel>;views:Map<CodeFile,Monaco.editor.ICodeEditorViewState|null>;active:CodeFile;split:number}
const courses=new Map<string,CourseModels>();
export function courseModels(api:typeof Monaco,key:string,sources:CodeSources):CourseModels{
  let cached=courses.get(key);courses.delete(key);
  if(!cached){cached={models:new Map(),views:new Map(),active:'starter.py',split:52};
    for(const file of CODE_FILES)cached.models.set(file,api.editor.createModel(sources[file],file.endsWith('.js')?'javascript':'python',api.Uri.parse('inmemory://notale-course/'+encodeURIComponent(key)+'/'+file)));
  }
  courses.set(key,cached);
  while(courses.size>3){const first=courses.keys().next().value!;courses.get(first)!.models.forEach(m=>m.dispose());courses.delete(first);}
  return cached;
}
