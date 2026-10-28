import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type FilmClip,type FilmMask,filmMaskDefaults,type FilmMediaTrack,emptyFilm} from '../../../notale-format/src/film.js';
import {clipWorldMatrix,maskProxy,maskFromProxy,maskGeometryCommands,multiply,type Matrix} from '../../../notale-editor-frontend/src/film/mask-geometry.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {clipMasks,filmMaskSvg} from '../../src/film/masks.js';
const stage={width:1280,height:720},size={width:800,height:400};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
test('mask proxy roundtrips parent rotation/skew/nonuniform scale/reflection and native world gestures',()=>{
 for(const scaleX of [1.3,-1.3]){
  const clip:FilmClip={id:'c',sourceId:'s',title:'c',at:0,in:0,duration:90,appearance:{values:{x:600,y:330,width:700,height:300,rotation:37,skewX:15,scaleX,scaleY:.85}}};
  const world=clipWorldMatrix(clip,0,stage,size),sample={id:'m',values:{...filmMaskDefaults,x:42,y:55,width:46,height:63,rotation:23,skewX:-12}},proxy=maskProxy(sample,size,world);
  const unchanged=maskFromProxy(proxy.matrix,world,proxy,size,'rect');for(const k of Object.keys(unchanged) as (keyof typeof unchanged)[])close(unchanged[k],proxy.base[k]);
  const edits:Matrix[]=[[1,0,0,1,50,-20],[1.2,0,0,.8,-40,30],[0,-1,1,0,0,800]];
  for(const edit of edits){
   const moved=multiply(edit,proxy.matrix),values=maskFromProxy(moved,world,proxy,size,'rect'),next=maskProxy({id:'m',values:{...sample.values,...values}},size,world);
   // Compare all four corners, not just the axis-aligned bounding rectangle.
   for(const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){close(moved[0]*proxy.width*x+moved[2]*proxy.height*y+moved[4],next.matrix[0]*next.width*x+next.matrix[2]*next.height*y+next.matrix[4]);close(moved[1]*proxy.width*x+moved[3]*proxy.height*y+moved[5],next.matrix[1]*next.width*x+next.matrix[3]*next.height*y+next.matrix[5]);}
  }
 }
});
test('mask handle command targets only its mask, preserves authored clock/easing and feeds SVG skew',()=>{
 const mask:FilmMask={id:'m',keyframes:{x:[{frame:0,value:30},{frame:60,value:50,easing:'hold'}]}},clip:FilmClip={id:'c',sourceId:'s',title:'c',at:20,in:0,duration:90,animationOffset:30,masks:[mask,{id:'other'}]};
 const before={x:50,y:50,width:60,height:60,rotation:0,skewX:0},commands=maskGeometryCommands(clip,mask,50,before,{...before,x:57,skewX:14});
 assert.deepEqual(commands,[{type:'film.mask.key.put',clipId:'c',maskId:'m',property:'x',keyframe:{frame:60,value:57,easing:'hold'}},{type:'film.mask.property',clipId:'c',maskId:'m',property:'skewX',value:14}]);
 const doc=emptyFilm('masks');doc.sources=[{id:'s',kind:'image',title:'s',uri:'/s.svg'}];(doc.tracks[0] as FilmMediaTrack).clips=[clip];const changed=applyFilmCommands(doc,commands),sample=clipMasks((changed.tracks[0] as FilmMediaTrack).clips[0],30);assert.equal(sample[0].values.x,57);assert.equal(sample[1].values.skewX,0);assert.match(filmMaskSvg(sample[0],800,400),/skewX\(14\)/);assert.equal(mask.keyframes!.x![1].value,50);
});
