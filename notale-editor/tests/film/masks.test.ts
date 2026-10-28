import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilm,filmMaskDefaults,type FilmMediaTrack,parseFilmDocument} from '../../../notale-format/src/film.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {filmFrame} from '../../src/film/frame.js';
import {filmMaskCss,filmMaskSvg} from '../../src/film/masks.js';
function fixture(){const doc=emptyFilm('mask');doc.sources=[{id:'s',kind:'image',title:'Image',uri:'/image.svg'}];(doc.tracks[0] as FilmMediaTrack).clips=[{id:'a',sourceId:'s',title:'Image',in:0,at:0,duration:150,masks:[{id:'m',values:{shape:'ellipse'},keyframes:{x:[{frame:0,value:20},{frame:120,value:80}],invert:[{frame:0,value:'normal'},{frame:60,value:'inverse'}]}}]}];return doc;}
test('mask frame sampling is pure, clamps easing and serializes all shapes with aspect-correct rotation/feather',()=>{
 const doc=fixture(),original=structuredClone(doc);for(const at of [90,30,60,30])assert.equal(filmFrame(doc,at/30).layers[0].masks[0].values.x,20+at/2);
 assert.equal(filmFrame(doc,2).layers[0].masks[0].values.invert,'inverse');assert.deepEqual(doc,original);
 for(const shape of ['linear','mirror','ellipse','rect','star','heart']){const svg=filmMaskSvg({id:'m',values:{...filmMaskDefaults,shape,rotation:30,feather:20}},1280,720);assert.match(svg,/viewBox="0 0 1280 720"/);assert.match(svg,/rotate\(30\)/);assert.match(svg,/stdDeviation="10"/);assert.equal(svg,filmMaskSvg({id:'m',values:{...filmMaskDefaults,shape,rotation:30,feather:20}},1280,720));}
 const eased=applyFilmCommands(doc,[{type:'film.mask.key.put',clipId:'a',maskId:'m',property:'width',keyframe:{frame:0,value:100,easing:[.1,-4,.8,-4]}},{type:'film.mask.key.put',clipId:'a',maskId:'m',property:'width',keyframe:{frame:120,value:200}}]);assert.equal(filmFrame(eased,2).layers[0].masks[0].values.width,0);
});
test('mask-only animation preserves authored time and fork independence through edits',()=>{
 const doc=fixture(),value=(d:typeof doc)=>filmFrame(d,3).layers[0].masks[0].values.x;
 for(const commands of [[{type:'film.clip.split' as const,clipId:'a',at:45,rightId:'b'}],[{type:'film.clip.trim' as const,clipId:'a',edge:'in' as const,delta:30}],[{type:'film.range.delete' as const,trackIds:['v1'],from:30,to:60,ripple:false,cutId:'cut'}]])assert.equal(value(applyFilmCommands(doc,commands)),65);
 const split=applyFilmCommands(doc,[{type:'film.clip.split',clipId:'a',at:45,rightId:'b'},{type:'film.mask.key.put',clipId:'b',maskId:'m',property:'x',keyframe:{frame:120,value:100}}]);assert.equal(filmFrame(split,1).layers[0].masks[0].values.x,35);assert.equal(value(split),80);
});
test('ordered composites subtract the next mask; invalid, duplicate and locked edits are atomic',()=>{
 const doc=fixture(),next=applyFilmCommands(doc,[{type:'film.mask.add',clipId:'a',mask:{id:'n',values:{combine:'subtract',shape:'rect'}}}]);
 const css=filmMaskCss(filmFrame(next,0).layers[0].masks,100,100);assert.equal(css.maskComposite,'intersect,add');assert.match(decodeURIComponent(css.maskImage),/fill="white"\/><g><g.*fill="black"/);
 const moved=applyFilmCommands(next,[{type:'film.mask.move',clipId:'a',maskId:'n',index:0}]);assert.equal(filmFrame(moved,0).layers[0].masks[0].id,'n');
 const locked=applyFilmCommands(doc,[{type:'film.track.update',trackId:'v1',patch:{locked:true}}]);assert.throws(()=>applyFilmCommands(locked,[{type:'film.mask.delete',clipId:'a',maskId:'m'}]),/locked/);
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.mask.add',clipId:'a',mask:{id:'m'}}]));assert.throws(()=>applyFilmCommands(doc,[{type:'film.mask.property',clipId:'a',maskId:'m',property:'feather',value:-1}]));
 const disabled=applyFilmCommands(doc,[{type:'film.mask.property',clipId:'a',maskId:'m',property:'enabled',value:'off'}]);assert.equal(filmFrame(disabled,0).layers[0].masks.length,0);assert.deepEqual(parseFilmDocument(JSON.parse(JSON.stringify(next))),next);
});
