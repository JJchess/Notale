import type {CodeSources,CodeLessonDescriptor} from '@notale/editor/browser';
import {CourseSession,type CourseBase,type CourseDraft,type CoursePreview} from './course-session';
export type {CourseDraft,CoursePreview} from './course-session';
export interface CourseEditing {
  id:string;identity:string;documentId:string;slideId:string;target:string;title:string;
  lesson:CodeLessonDescriptor;sources:CodeSources;url:string;channel:string;release:()=>void;
}
type CourseState={editing?:CourseEditing;session?:CourseSession;loading:boolean};
const empty:CourseState={loading:false};let model=empty;
const listeners=new Set<()=>void>();
const publish=(next:CourseState)=>{model=next;listeners.forEach(f=>f());};
export const courseState={getSnapshot:()=>model,getServerSnapshot:()=>empty,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
type Save=(editing:CourseEditing,sources:CodeSources,preview?:CoursePreview)=>Promise<CodeLessonDescriptor>;
export const courseActions={open:async(_target?:string)=>{},close:()=>{},save:(async()=>{throw Error('课程编辑尚未就绪');}) as Save};
export const courseKey=(editing:CourseEditing)=>JSON.stringify([editing.identity,editing.documentId,editing.slideId,editing.target]);
export function bindCourseEditor(context:{open:(target?:string)=>Promise<CourseEditing|undefined>;save:Save;read:(editing:CourseEditing)=>Promise<CourseBase>;error:(e:unknown)=>void}) {
  let active=true,request=0;const sessions=new Map<string,CourseSession>();
  courseActions.open=async target=>{
    const id=++request;publish({...model,loading:true});
    try{
      const editing=await context.open(target);if(!active||id!==request){editing?.release();return;}
      if(!editing){publish({...model,loading:false});return;}
      const key=courseKey(editing),io={readDraft:()=>readCourseDraft(editing),writeDraft:(draft:CourseDraft)=>writeCourseDraft(editing,draft),read:()=>context.read(editing),save:async(base:CourseBase,sources:CodeSources,preview?:CoursePreview)=>{
        if(!active)throw Error('讲义已切换，课程草稿已保留');
        return context.save({...editing,lesson:base.lesson},sources,preview);
      }};
      let session=sessions.get(key);
      if(session)session.attach(io,editing);else session=new CourseSession(editing,io);
      sessions.delete(key);sessions.set(key,session);
      for(const [k,s] of sessions){if(sessions.size<=3)break;if(k!==key&&!s.getSnapshot().saving&&!s.getSnapshot().storageError)sessions.delete(k);}
      model.editing?.release();publish({editing,session,loading:false});
    }catch(e){if(active&&id===request){publish({...model,loading:false});context.error(e);}}
  };
  courseActions.close=()=>{++request;model.editing?.release();publish(empty);};
  courseActions.save=async(...args)=>{if(!active)throw Error('讲义已切换，课程草稿已保留');return context.save(...args);};
  return {dispose(){active=false;++request;model.editing?.release();publish(empty);}};
}
const databases=new Map<string,Promise<IDBDatabase>>();
export async function courseIdentity(){const response=await fetch('/api/sync-context');if(!response.ok)throw Error('无法确认课程草稿所属身份');const {scope,actor}=await response.json();return JSON.stringify([scope,actor]);}
async function db(identity:string){let result=databases.get(identity);if(!result){result=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('notale-course-drafts:'+identity,1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});databases.set(identity,result);result.catch(()=>databases.delete(identity));}return result;}
const key=(editing:CourseEditing)=>JSON.stringify([editing.documentId,editing.slideId,editing.target]);
export async function readCourseDraft(editing:CourseEditing):Promise<CourseDraft|undefined>{const database=await db(editing.identity);return new Promise((resolve,reject)=>{const request=database.transaction('drafts').objectStore('drafts').get(key(editing));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function writeCourseDraft(editing:CourseEditing,draft:CourseDraft){const database=await db(editing.identity);await new Promise<void>((resolve,reject)=>{const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,key(editing));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('课程草稿未能保存'));});}
