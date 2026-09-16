import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CODE_FILES,type CodeSources,type CodeLessonDescriptor} from '@notale/editor/browser';
import {CourseSession,CourseDraftWriter,mergeCourseSources,type CourseDraft,type CourseSessionIO} from '../src/state/course-session';
const sources=Object.fromEntries(CODE_FILES.map(f=>[f,'base '+f])) as CodeSources;
const lesson={revision:'base',entry:'base/index.html'} as CodeLessonDescriptor;
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(overrides:Partial<CourseSessionIO>={}){const writes:CourseDraft[]=[];const session=new CourseSession({sources,lesson},{readDraft:async()=>undefined,writeDraft:async d=>{writes.push(d);},read:async()=>({sources,lesson}),save:async()=>({...lesson,revision:'saved'}),...overrides});return {session,writes};}

test('saving snapshots never marks later typing as saved; explicit requests coalesce',async()=>{
 const first=deferred<CodeLessonDescriptor>(),calls:CodeSources[]=[];
 const {session}=setup({save:async(_base,source)=>{calls.push(source);return calls.length===1?first.promise:{...lesson,revision:'second'};}});await session.initialized;
 session.edit('starter.py','A');const saving=session.save();await settle();assert.equal(calls.length,1);
 session.edit('starter.py','B');void session.save();session.edit('starter.py','C');void session.save();session.edit('starter.py','D');
 first.resolve({...lesson,revision:'first'});await saving;
 assert.deepEqual(calls.map(s=>s['starter.py']),['A','C']);assert.equal(session.getSnapshot().sources['starter.py'],'D');assert.equal(session.dirty,true);assert.equal(session.getSnapshot().saved,false);await session.flush();
});
test('returning to the previous baseline during a save can be explicitly saved',async()=>{
 const first=deferred<CodeLessonDescriptor>(),calls:string[]=[];
 const {session}=setup({save:async(_b,s)=>{calls.push(s['starter.py']);return calls.length===1?first.promise:{...lesson,revision:'back'};}});await session.initialized;
 session.edit('starter.py','A');const saving=session.save();await settle();session.edit('starter.py',sources['starter.py']);assert.equal(session.canSave,true);void session.save();first.resolve({...lesson,revision:'A'});await saving;
 assert.deepEqual(calls,['A',sources['starter.py']]);assert.equal(session.dirty,false);
});
test('server saves survive unavailable local storage',async()=>{
 let saved=0;const {session}=setup({readDraft:async()=>{throw Error('unavailable');},writeDraft:async()=>{throw Error('quota');},save:async()=>{saved++;return {...lesson,revision:'saved'};}});await session.initialized;session.edit('tests.py','new');await session.save();assert.equal(saved,1);assert.equal(session.dirty,false);assert.match(session.getSnapshot().storageError,/quota/);
});
test('remote conflicts merge separate files and require confirmation for shared edits',async()=>{
 const remote={...sources,'starter.py':'remote','tests.py':'remote tests'},local={...sources,'starter.py':'local','observe.py':'local observer'};
 const merged=mergeCourseSources(sources,local,remote);assert.deepEqual(merged.files,['starter.py']);assert.equal(merged.sources['tests.py'],'remote tests');assert.equal(merged.sources['observe.py'],'local observer');
 const {session}=setup({readDraft:async()=>({sources:local,baseSources:sources,revision:'old',updatedAt:0}),read:async()=>({sources:remote,lesson:{...lesson,revision:'remote'}})});await session.initialized;
 session.attach({readDraft:async()=>undefined,writeDraft:async()=>{},read:async()=>({sources:remote,lesson}),save:async()=>lesson},{sources:remote,lesson:{...lesson,revision:'remote'}});
 assert.ok(session.getSnapshot().conflict);session.resolveFile('starter.py',false);session.confirmMerge();assert.equal(session.getSnapshot().lesson.revision,'remote');assert.equal(session.getSnapshot().sources['starter.py'],'local');assert.equal(session.dirty,true);await session.flush();
});
test('old drafts without a baseline remain available for manual conflict resolution',async()=>{
 const {session}=setup({readDraft:async()=>({sources:{...sources,'starter.py':'draft'},revision:'old',updatedAt:0})});await session.initialized;assert.deepEqual(session.getSnapshot().conflict?.files,['starter.py']);session.confirmMerge();assert.ok(session.getSnapshot().conflict);session.resolveFile('starter.py',false);session.confirmMerge();assert.equal(session.getSnapshot().sources['starter.py'],'draft');await session.flush();
});
test('draft writer serializes slow storage and writes only the newest pending snapshot',async()=>{
 const first=deferred<void>(),writes:number[]=[];const writer=new CourseDraftWriter(async d=>{writes.push(d.sequence!);if(writes.length===1)await first.promise;},()=>{});
 const draft=(sequence:number):CourseDraft=>({sources,revision:'base',updatedAt:sequence,sequence});writer.schedule(draft(1));const flush=writer.flush();writer.schedule(draft(2));writer.schedule(draft(3));first.resolve();await flush;await writer.flush();assert.deepEqual(writes,[1,3]);
});
