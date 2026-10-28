import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilm,applyFilmCommands,type FilmClip} from '@notale/editor/film';
import {commonProperty,clipPropertyValue,clipPropertyCommands} from '../src/film/clip-properties';
function fixture(){
 const doc=emptyFilm('properties','Properties');doc.sources=[{id:'video',kind:'video',title:'Video',uri:'/video.mp4',duration:30,width:640,height:360}];
 const clips:FilmClip[]=[{id:'a',sourceId:'video',title:'A',at:0,in:0,duration:90,appearance:{values:{opacity:.3,rotation:15}}},{id:'b',sourceId:'video',title:'B',at:90,in:3,duration:90,appearance:{values:{opacity:.7,rotation:45}}}];
 doc.tracks=[{id:'track',kind:'media',title:'Video',locked:false,hidden:false,muted:false,clips}];return {doc,clips};
}
test('multi-selection reads actual common or mixed values without inventing defaults',()=>{
 const {doc,clips}=fixture();assert.equal(commonProperty(clips.map(c=>clipPropertyValue(doc,c,15,'opacity'))),undefined);
 assert.equal(commonProperty(clips.map(c=>clipPropertyValue(doc,c,15,'width'))),640);assert.equal(commonProperty([]),undefined);
});
test('relative batch edits preserve differences; typed values set all selected clips',()=>{
 const {doc}=fixture(),before=structuredClone(doc);
 const changed=applyFilmCommands(doc,clipPropertyCommands(doc,['a','b'],15,'rotation',10,true));
 assert.deepEqual(changed.tracks.flatMap(t=>t.kind==='media'?t.clips.map(c=>c.appearance?.values?.rotation):[]),[25,55]);
 const equal=applyFilmCommands(doc,clipPropertyCommands(doc,['a','b'],15,'opacity',.6));
 assert.deepEqual(equal.tracks.flatMap(t=>t.kind==='media'?t.clips.map(c=>c.appearance?.values?.opacity):[]),[.6,.6]);assert.deepEqual(doc,before);
});
test('locked, unsupported and invalid batch edits reject before any change',()=>{
 const {doc}=fixture();doc.sources.push({id:'sound',kind:'audio',title:'Audio',uri:'/audio.wav',duration:30});
 doc.tracks.push({id:'audio',kind:'media',title:'Audio',locked:true,hidden:false,muted:false,clips:[{id:'c',sourceId:'sound',title:'C',at:0,in:0,duration:90}]});
 const before=structuredClone(doc);assert.throws(()=>clipPropertyCommands(doc,['a','c'],0,'opacity',.5),/锁定/);assert.throws(()=>clipPropertyCommands(doc,['a','missing'],0,'rotation',30));assert.throws(()=>clipPropertyCommands(doc,['a','b'],0,'opacity',.5,true),/有效范围/);assert.deepEqual(doc,before);
 doc.tracks[1].locked=false;assert.throws(()=>clipPropertyCommands(doc,['a','c'],0,'opacity',.5),/共同支持/);
});
test('current-frame edits retain trimmed animation clocks and future keys',()=>{
 const {doc,clips}=fixture();clips[0].animationOffset=30;clips[0].appearance={keyframes:{opacity:[{frame:30,value:.2,easing:'hold'},{frame:90,value:.8}]}};
 const commands=clipPropertyCommands(doc,['a'],0,'opacity',.4);assert.deepEqual(commands,[{type:'film.keyframe.put',clipId:'a',property:'opacity',keyframe:{frame:30,value:.4,easing:'hold'}}]);
 const changed=applyFilmCommands(doc,commands),track=changed.tracks[0];assert.equal(track.kind,'media');if(track.kind==='media')assert.equal(track.clips[0].appearance?.keyframes?.opacity?.[1].value,.8);
});
test('audio batches preserve automation and clamp sampling to each clip range',()=>{
 const {doc,clips}=fixture();clips[1].audio={gain:.5,keys:[{frame:0,value:.5},{frame:60,value:1}]};
 const commands=clipPropertyCommands(doc,['a','b'],15,'gain',-6);assert.equal(commands[1].type,'film.audio.set');
 if(commands[1].type==='film.audio.set'){assert.equal(commands[1].audio?.keys?.[0].frame,0);assert.equal(commands[1].audio?.keys?.[1].value,1);}
 assert.ok(Math.abs(Number(clipPropertyValue(doc,clips[1],15,'gain'))-20*Math.log10(.5))<1e-6);
});
