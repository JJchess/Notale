import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decomposeClipMatrix,clipGeometryCommands,type ClipGeometry} from '../../../notale-editor-frontend/src/film/clip-geometry.js';
import {type FilmClip,emptyFilm,type FilmMediaTrack} from '../../../notale-format/src/film.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {clipAppearance} from '../../src/film/appearance.js';
function matrix(g:ClipGeometry){const r=g.rotation*Math.PI/180,k=Math.tan(g.skewX*Math.PI/180),c=Math.cos(r),s=Math.sin(r);return [c*g.scaleX,s*g.scaleX,(c*k-s)*g.scaleY,(s*k+c)*g.scaleY,0,0];}
test('native affine geometry preserves skew, reflected axes and authored rotation turns',()=>{
 for(const base of [{x:600,y:300,rotation:390,skewX:25,scaleX:1.4,scaleY:.7},{x:600,y:300,rotation:-350,skewX:-32,scaleX:-.8,scaleY:1.7}]){
  const m=matrix(base);m[0]*=1.3;m[2]*=1.3;m[1]*=.7;m[3]*=.7;m[4]=35;m[5]=-12;
  const result=decomposeClipMatrix(m,400,200,400,200,base),reconstructed=matrix(result);
  m.slice(0,4).forEach((n,i)=>assert.ok(Math.abs(n-reconstructed[i])<1e-9));assert.equal(result.x,635);assert.equal(result.y,288);assert.ok(Math.abs(result.rotation-base.rotation)<90);
 }
 assert.throws(()=>decomposeClipMatrix([0,0,0,0,0,0],0,0,10,10,{x:0,y:0,rotation:0,skewX:0,scaleX:1,scaleY:1}),/缩放/);
});
test('handle edits update only changed properties and preserve a split curve clock and easing',()=>{
 const before:ClipGeometry={x:500,y:360,rotation:370,skewX:0,scaleX:1,scaleY:1};
 const clip:FilmClip={id:'c',sourceId:'s',title:'c',at:30,in:0,duration:120,animationOffset:40,appearance:{keyframes:{x:[{frame:0,value:400},{frame:70,value:500,easing:'hold'},{frame:100,value:600}]}}};
 const commands=clipGeometryCommands(clip,60,before,{...before,x:550,skewX:20});
 assert.deepEqual(commands,[{type:'film.keyframe.put',clipId:'c',property:'x',keyframe:{frame:70,value:550,easing:'hold'}},{type:'film.property.set',clipId:'c',property:'skewX',value:20}]);
 const doc=emptyFilm('geometry');doc.sources=[{id:'s',title:'s',kind:'image',uri:'/image.svg'}];(doc.tracks[0] as FilmMediaTrack).clips=[clip];
 const edited=applyFilmCommands(doc,commands),sample=clipAppearance((edited.tracks[0] as FilmMediaTrack).clips[0],30);assert.equal(sample.x,550);assert.equal(sample.skewX,20);assert.equal(clip.appearance!.keyframes!.x![1].value,500);
});
