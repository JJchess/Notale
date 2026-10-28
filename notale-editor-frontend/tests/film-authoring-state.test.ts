import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountFilmAuthoring} from '../src/film/authoring';
import {filmAuthoringActions,filmAuthoringState} from '../src/film/authoring-state';
import {EditorSession} from '../src/state/editor-session';
import {applyFilmCommands,type FilmDocument,type FilmClip} from '@notale/editor/film';
test('shared film controls edit the authored frame, reject stale input, and preserve keys when resetting base',async()=>{
 let doc:FilmDocument={kind:'film',schemaVersion:1,id:'controls',title:'Controls',width:640,height:360,frameRate:{numerator:30,denominator:1},sources:[{id:'image',kind:'image',title:'Image',uri:'/image.png',width:640,height:360}],tracks:[{id:'visual',kind:'media',title:'Visual',locked:false,hidden:false,muted:false,clips:[{id:'clip',sourceId:'image',title:'Clip',at:100,in:0,duration:60,animationOffset:30}]}],markers:[]};
 let position=100,commits=0,preview:FilmDocument|undefined;const errors:unknown[]=[],controller=new AbortController(),clip=():FilmClip=>(doc.tracks[0] as Extract<FilmDocument['tracks'][number],{kind:'media'}>).clips[0];
 const authoring=mountFilmAuthoring({document:()=>doc,clip,selected:()=>[],position:()=>position,selectionChanged:()=>{},executeFilm:commands=>{doc=applyFilmCommands(doc,commands);commits++;return true;},capture:async()=>({computedStyles:{},rectangles:[]}),previewDraft:value=>{preview=value;},runtimeSelect:()=>{},report:error=>errors.push(error),shell:new EditorSession(),signal:controller.signal});
 try{
  filmAuthoringActions.selectProperty('blur');assert.equal(filmAuthoringState.getSnapshot().properties.length,22);
  await filmAuthoringActions.commit(3,filmAuthoringState.getSnapshot());assert.equal(clip().appearance?.values?.blur,3);
  const editOrigin=filmAuthoringState.getSnapshot(),saved=doc,previousCommits=commits;
  filmAuthoringActions.preview(5,editOrigin);filmAuthoringActions.preview(7,editOrigin);
  assert.equal(doc,saved);assert.equal(commits,previousCommits);assert.equal((preview!.tracks[0] as Extract<FilmDocument['tracks'][number],{kind:'media'}>).clips[0].appearance?.values?.blur,7);
  filmAuthoringActions.cancelPreview();assert.equal(preview,undefined);assert.equal(clip().appearance?.values?.blur,3);
  filmAuthoringActions.preview(6,editOrigin);await filmAuthoringActions.commit(6,editOrigin);assert.equal(commits,previousCommits+1);assert.equal(preview,undefined);
  await filmAuthoringActions.commit(3,filmAuthoringState.getSnapshot());
  await filmAuthoringActions.toggleKey(filmAuthoringState.getSnapshot());assert.equal(clip().appearance?.keyframes?.blur?.[0].frame,30);
  const stale=filmAuthoringState.getSnapshot();position=130;authoring.update();const before=commits;
  await assert.rejects(()=>filmAuthoringActions.commit(8,stale),/已变化/);assert.equal(commits,before);
  await filmAuthoringActions.commit(7,filmAuthoringState.getSnapshot());assert.deepEqual(clip().appearance?.keyframes?.blur?.map(key=>[key.frame,key.value]),[[30,3],[60,7]]);
  await filmAuthoringActions.easing([.2,-.2,.8,1.3],filmAuthoringState.getSnapshot());assert.deepEqual(clip().appearance?.keyframes?.blur?.[1].easing,[.2,-.2,.8,1.3]);
  const keys=structuredClone(clip().appearance?.keyframes);await filmAuthoringActions.resetBase(filmAuthoringState.getSnapshot());assert.equal(clip().appearance?.values?.blur,undefined);assert.deepEqual(clip().appearance?.keyframes,keys);
  filmAuthoringActions.selectProperty('fit');await filmAuthoringActions.commit('cover',filmAuthoringState.getSnapshot());assert.equal(clip().appearance?.values?.fit,'cover');
  await assert.rejects(()=>filmAuthoringActions.commit('not-a-fit',filmAuthoringState.getSnapshot()),/有效范围/);
  await Promise.resolve();assert.deepEqual(errors,[]);
 }finally{controller.abort();}
 assert.equal(filmAuthoringState.getSnapshot().disabled,true);
});
