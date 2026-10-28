import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilm, parseFilmDocument, type FilmMediaTrack } from '../../../notale-format/src/film.js';
import { applyFilmCommands } from '../../src/film/commands.js';
import { clipAppearance, filmEase } from '../../src/film/appearance.js';
import { filmFrame } from '../../src/film/frame.js';
function fixture(){const doc=emptyFilm('appearance');doc.sources=[{id:'s',title:'s',kind:'video',uri:'/video.mp4',duration:30}];(doc.tracks[0] as FilmMediaTrack).clips=[{id:'a',title:'a',sourceId:'s',at:0,duration:120,in:2,appearance:{values:{opacity:.5},keyframes:{x:[{frame:0,value:0},{frame:90,value:90}],blendMode:[{frame:0,value:'normal'},{frame:45,value:'multiply'}]}}}];return doc;}
const x=(doc:ReturnType<typeof fixture>,frame:number)=>filmFrame(doc,frame/30).layers[0].appearance.x;
test('appearance samples pure numeric/hold/discrete curves, with Bezier x inversion and bounded overshoot',()=>{
 const doc=fixture(),before=structuredClone(doc),clip=(doc.tracks[0] as FilmMediaTrack).clips[0];
 for(const frame of [60,15,90,15])assert.equal(x(doc,frame),frame);
 assert.equal(clipAppearance(clip,44).blendMode,'normal');assert.equal(clipAppearance(clip,45).blendMode,'multiply');assert.equal(clipAppearance(clip,15).opacity,.5);
 assert.ok(filmEase(.5,[.42,0,1,1])<.5);assert.ok(Math.abs(filmEase(.25,[0,0,1,1])-.25)<1e-8);assert.equal(filmEase(.9,'hold'),0);
 clip.appearance!.keyframes!.opacity=[{frame:0,value:0,easing:[.1,3,.9,3]},{frame:90,value:1}];assert.equal(clipAppearance(clip,45).opacity,1);delete clip.appearance!.keyframes!.opacity;
 assert.deepEqual(doc,before);
});
test('split, head trim, roll and range deletion preserve animation time; slip preserves clip animation placement',()=>{
 const doc=fixture();
 const split=applyFilmCommands(doc,[{type:'film.clip.split',clipId:'a',at:45,rightId:'b'}]);assert.equal(x(split,60),60);
 const trim=applyFilmCommands(doc,[{type:'film.clip.trim',clipId:'a',edge:'in',delta:15}]);assert.equal(x(trim,30),30);
 const roll=applyFilmCommands(split,[{type:'film.clip.roll',leftId:'a',rightId:'b',delta:10}]);assert.equal(x(roll,60),60);
 const lift=applyFilmCommands(doc,[{type:'film.range.delete',trackIds:['v1'],from:30,to:60,ripple:false,cutId:'cut'}]);assert.equal(x(lift,75),75);
 const extract=applyFilmCommands(doc,[{type:'film.range.delete',trackIds:['v1'],from:30,to:60,ripple:true,cutId:'cut'}]);assert.equal(x(extract,45),75);
 const slip=applyFilmCommands(doc,[{type:'film.clip.slip',clipId:'a',delta:30}]);assert.equal(x(slip,45),45);
 const edited=applyFilmCommands(split,[{type:'film.keyframe.put',clipId:'b',property:'x',keyframe:{frame:0,value:100}}]);assert.equal(x(edited,30),30,'forked clips never share mutable keyframe arrays');
 const rangeEdited=applyFilmCommands(lift,[{type:'film.keyframe.put',clipId:'a~cut',property:'x',keyframe:{frame:0,value:200}}]);assert.equal(x(rangeEdited,15),15);
});
test('author edits are atomic, reject invalid property/range/easing/duplicate keys and respect locked tracks',()=>{
 const doc=fixture(),before=structuredClone(doc);
 const changed=applyFilmCommands(doc,[{type:'film.property.set',clipId:'a',property:'mask',value:'ellipse'},{type:'film.keyframe.delete',clipId:'a',property:'blendMode',frame:45}]);assert.equal(clipAppearance((changed.tracks[0] as FilmMediaTrack).clips[0],60).mask,'ellipse');assert.deepEqual(doc,before);
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.property.set',clipId:'a',property:'x',value:10},{type:'film.property.set',clipId:'a',property:'opacity',value:2}]));assert.deepEqual(doc,before);
 for(const keys of [[{frame:0,value:1},{frame:0,value:2}],[{frame:1.5,value:1}],[{frame:0,value:1,easing:[-1,0,1,1]}]]){const bad=structuredClone(doc);(bad.tracks[0] as FilmMediaTrack).clips[0].appearance!.keyframes!.x=keys as never;assert.throws(()=>parseFilmDocument(bad));}
 doc.tracks[0].locked=true;assert.throws(()=>applyFilmCommands(doc,[{type:'film.property.set',clipId:'a',property:'x',value:1}]),/locked/);
});
