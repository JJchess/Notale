import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitCropRatio,resizeCrop,panCrop,type Crop} from '../../../notale-editor-frontend/src/film/crop-geometry.js';
import {transitionDurationCommands} from '../../../notale-editor-frontend/src/film/transition-plan.js';
import {emptyFilm,type FilmMediaTrack} from '../../../notale-format/src/film.js';

test('crop presets stay within the old frame; locked edges preserve aspect and anchor',()=>{
 const crop:Crop={cropLeft:10,cropRight:20,cropTop:5,cropBottom:15};
 const preset=fitCropRatio(crop,1920,1080,1);
 for(const side of Object.keys(crop) as (keyof Crop)[])assert.ok(preset[side]>=crop[side]);
 const ratio=(c:Crop)=>(100-c.cropLeft-c.cropRight)*1920/((100-c.cropTop-c.cropBottom)*1080);
 assert.ok(Math.abs(ratio(preset)-1)<1e-9);
 for(const value of [-100,20,99,200]){const next=resizeCrop(preset,'cropLeft',value,1920,1080,1);assert.ok(Math.abs(ratio(next)-1)<1e-9);assert.equal(next.cropRight,preset.cropRight);assert.ok(next.cropTop>=0&&next.cropBottom>=0);assert.ok(Math.abs((next.cropTop-next.cropBottom)-(preset.cropTop-preset.cropBottom))<1e-9);}
});
test('pan compensates the crop corners under rotated, skewed and nonuniform transforms',()=>{
 const crop:Crop={cropLeft:20,cropRight:30,cropTop:10,cropBottom:25},w=1280,h=720;
 for(const [a,b,c,d]of [[0,2,-.5,0],[-1,.2,.3,1.4],[1,0,0,1]])for(const [dx,dy]of [[80,-20],[1e6,-1e6]]){
  const next=panCrop(crop,w,h,dx,dy);
  const oldPoint=[w*crop.cropLeft/100,h*crop.cropTop/100],newPoint=[w*next.crop.cropLeft/100,h*next.crop.cropTop/100];
  assert.ok(Math.abs(a*oldPoint[0]+c*oldPoint[1]-(a*newPoint[0]+c*newPoint[1]+a*next.dx+c*next.dy))<1e-8);
  assert.ok(Math.abs(b*oldPoint[0]+d*oldPoint[1]-(b*newPoint[0]+d*newPoint[1]+b*next.dx+d*next.dy))<1e-8);
  assert.ok(Object.values(next.crop).every(value=>value>=0));assert.equal(next.crop.cropLeft+next.crop.cropRight,50);assert.equal(next.crop.cropTop+next.crop.cropBottom,35);
 }
});
test('transition duration clamps to adjacent clips and leaves the cut fixed',()=>{
 const doc=emptyFilm('transition');doc.sources=[{id:'s',kind:'image',title:'s',uri:'/s.png'}];const track=doc.tracks[0] as FilmMediaTrack;
 track.clips=[{id:'a',sourceId:'s',title:'a',at:20,in:0,duration:30},{id:'b',sourceId:'s',title:'b',at:50,in:0,duration:80,transitionIn:{kind:'dissolve',duration:15}}];
 for(const [input,expected]of [[0,1],[100,30],[17.4,17]]){const command=transitionDurationCommands(doc,track.clips[1],input)[0];assert.equal(command.type,'film.transition.set');if(command.type==='film.transition.set')assert.equal(command.transition?.duration,expected);assert.equal(track.clips[1].at,50);}
 track.locked=true;assert.throws(()=>transitionDurationCommands(doc,track.clips[1],10));track.locked=false;doc.sources[0].kind='motale';assert.deepEqual(transitionDurationCommands(doc,track.clips[1],10),[{type:'film.transition.set',clipId:'b',transition:{kind:'dissolve',duration:10}}]);
});
