import {randomUUID} from 'node:crypto';
import {posix} from 'node:path';
import {CODE_FILES, codeRevision, type CodeSources, type CodeLessonDescriptor} from '@notale/format';
import {lessonFor,digestCode} from '../domain/code-lessons.js';
import {invariant,type Command,type Asset} from '../domain/model.js';
import {Store,type Context} from './store.js';
export async function readCourse(store:Store,ctx:Context,id:string,slideId:string,target:string,version?:number) {
  const snapshot=await store.get(ctx,id,version),slide=snapshot.document.slides.find(s=>s.id===slideId);
  invariant(slide,'SLIDE_NOT_FOUND','课程页面已删除',404);
  const lesson=lessonFor(snapshot.document,slide,target);
  const sources=Object.fromEntries(await Promise.all(CODE_FILES.map(async f=>[f,(await store.asset(ctx,id,snapshot.version,lesson.files[f])).data.toString('utf8')])) ) as CodeSources;
  return {snapshot,lesson,sources};
}
export async function prepareCourse(store:Store,ctx:Context,id:string,slideId:string,target:string,input:{expectedEntry:string;expectedRevision:string;sources:CodeSources;preview?:{sourceRevision:string;runtimeRevision:string;initialStep:unknown}}) {
  const {snapshot,lesson}=await readCourse(store,ctx,id,slideId,target);
  invariant(lesson.entry===input.expectedEntry&&lesson.revision===input.expectedRevision,'SYNC_RECOVERY_REQUIRED','课程已变化，编辑草稿已保留',409);
  const root=posix.dirname(lesson.lessonRoot)+'/edit-'+randomUUID();
  const assets:Record<string,Asset>={};
  // Immutable lesson snapshots make copies and inverse history independent.
  for(const [path,asset] of Object.entries(snapshot.document.assets))if(path.startsWith(lesson.lessonRoot+'/')&&!path.endsWith('/preview.json'))assets[root+path.slice(lesson.lessonRoot.length)]=asset;
  const files={} as CodeLessonDescriptor['files'];
  await Promise.all(CODE_FILES.map(async f=>{const path=root+'/lesson/'+f;files[f]=path;assets[path]=await store.upload(ctx,{data:Buffer.from(input.sources[f]),mime:f.endsWith('.js')?'text/javascript; charset=utf-8':'text/plain; charset=utf-8'});}));
  const next:CodeLessonDescriptor={...lesson,lessonRoot:root,entry:root+'/index.html',files};
  next.revision=codeRevision(next,{...snapshot.document.assets,...assets},digestCode);
  if(input.preview&&input.preview.sourceRevision===digestCode(JSON.stringify(CODE_FILES.map(f=>[f,input.sources[f]])))){
    const config=(await store.asset(ctx,id,snapshot.version,lesson.lessonRoot+'/lesson/lesson.js')).data.toString('utf8');
    const runtimeRevision=/\bruntimeRevision\s*:\s*["']([a-f0-9]{64})["']/.exec(config)?.[1];
    if(runtimeRevision&&input.preview.runtimeRevision===runtimeRevision)assets[root+'/lesson/preview.json']=await store.upload(ctx,{data:Buffer.from(JSON.stringify(input.preview)),mime:'application/json'});
  }
  assets[root+'/lesson/preview.json'] ??= await store.upload(ctx,{data:Buffer.from(JSON.stringify({sourceRevision:'',initialStep:null})),mime:'application/json'});
  const command:Command={type:'codeLesson.update',slideId,target,expectedEntry:lesson.entry,expectedRevision:lesson.revision,lesson:next,assets};
  return {command,lesson:next};
}
