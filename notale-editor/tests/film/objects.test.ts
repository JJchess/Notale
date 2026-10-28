import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilm,type FilmMediaTrack} from '../../../notale-format/src/film.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {filmFrame} from '../../src/film/frame.js';
import {clipObjects,interpolateFilmStyle} from '../../src/film/objects.js';
function fixture(){const doc=emptyFilm('objects');doc.sources=[{id:'s',kind:'overlay',title:'标题',uri:'overlay:s',html:'<p data-notale-id="title">Title</p>'}];(doc.tracks[0] as FilmMediaTrack).clips=[{id:'a',sourceId:'s',title:'Title',at:0,in:0,duration:150,objects:{title:{keyframes:{translate:[{frame:0,value:'0px 0px'},{frame:120,value:'240px 120px'}],color:[{frame:0,value:'#ff0000'},{frame:120,value:'#0000ff'}],visibility:[{frame:0,value:'visible'},{frame:120,value:'hidden'}]}}}}];return doc;}
test('pure object samples interpolate CSS units and colors; keyword/unit changes stay discrete',()=>{
 const doc=fixture(),original=structuredClone(doc);for(const at of [90,30,60,30])assert.equal(filmFrame(doc,at/30).layers[0].objectStyles.title.translate,`${at*2}px ${at}px`);
 assert.equal(filmFrame(doc,2).layers[0].objectStyles.title.color,'rgba(128, 0, 128, 1)');assert.equal(filmFrame(doc,2).layers[0].objectStyles.title.visibility,'visible');
 assert.equal(interpolateFilmStyle('20px','50%',.5),'20px');assert.equal(interpolateFilmStyle('blur(0px) brightness(1)','blur(20px) brightness(2)',.5),'blur(10px) brightness(1.5)');
 assert.equal(interpolateFilmStyle('url(a1)','url(a2)',.5),'url(a1)');assert.equal(interpolateFilmStyle('Font2','Font4',.5),'Font2');assert.equal(interpolateFilmStyle('1','3',1.5),'4');assert.deepEqual(doc,original);
});
test('object-only curves retain time through split/head trim/range edits; branches edit independently',()=>{
 const doc=fixture(),before=filmFrame(doc,3).layers[0].objectStyles;
 for(const commands of [
  [{type:'film.clip.split' as const,clipId:'a',at:45,rightId:'b'}],
  [{type:'film.clip.trim' as const,clipId:'a',edge:'in' as const,delta:30}],
  [{type:'film.range.delete' as const,trackIds:['v1'],from:30,to:60,ripple:false,cutId:'cut'}],
 ])assert.deepEqual(filmFrame(applyFilmCommands(doc,commands),3).layers[0].objectStyles,before);
 const split=applyFilmCommands(doc,[{type:'film.clip.split',clipId:'a',at:45,rightId:'b'},{type:'film.object.key.put',clipId:'b',target:'title',property:'translate',keyframe:{frame:120,value:'480px 240px'}}]);
 assert.equal(filmFrame(split,1).layers[0].objectStyles.title.translate,'60px 30px');assert.equal(filmFrame(split,3).layers[0].objectStyles.title.translate,'360px 180px');
 const hold=applyFilmCommands(doc,[{type:'film.object.key.put',clipId:'a',target:'title',property:'translate',keyframe:{frame:0,value:'0px 0px',easing:'hold'}}]);assert.equal(filmFrame(hold,3).layers[0].objectStyles.title.translate,'0px 0px');
});
test('object writes validate identity, CSS clock exclusion, ordering, lock and atomicity',()=>{
 const doc=fixture(),copy=structuredClone(doc);
 const locked=applyFilmCommands(doc,[{type:'film.object.lock',clipId:'a',target:'title',locked:true}]);assert.deepEqual(filmFrame(locked,1).layers[0].objectLocks,['title']);
 assert.throws(()=>applyFilmCommands(locked,[{type:'film.object.property',clipId:'a',target:'title',property:'color',value:'#fff'}]),/locked/);
 for(const property of ['transition','animation-name','__proto__'])assert.throws(()=>applyFilmCommands(doc,[{type:'film.object.property',clipId:'a',target:'title',property,value:'red'}]));
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.object.lock',clipId:'a',target:'__proto__',locked:true}]));
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.object.key.put',clipId:'a',target:'title',property:'opacity',keyframe:{frame:.5,value:'.5'}}]));
 assert.deepEqual(doc,copy);
 const unlocked=applyFilmCommands(locked,[{type:'film.object.lock',clipId:'a',target:'title',locked:false},{type:'film.object.property',clipId:'a',target:'title',property:'--accent',value:'#fff'}]);assert.equal(clipObjects((unlocked.tracks[0] as FilmMediaTrack).clips[0],0).title['--accent'],'#fff');
});
