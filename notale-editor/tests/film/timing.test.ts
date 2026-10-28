import {test} from 'node:test';import assert from 'node:assert/strict';import {emptyFilm,parseFilmDocument,applyFilmCommands,filmFrame,clipSourceTime,reversedClipTiming,type FilmClip,type FilmDocument} from '../../src/film/index.js';
const fixture=()=>parseFilmDocument({...emptyFilm('time'),sources:[{id:'s',kind:'video',uri:'/clip.mp4',title:'Video',duration:10}],tracks:[{id:'t',kind:'media',title:'Track',hidden:false,muted:false,locked:false,clips:[{id:'a',sourceId:'s',title:'A',in:1,at:0,duration:90},{id:'b',sourceId:'s',title:'B',in:4,at:90,duration:90}]}]});
const clip=(d:FilmDocument,id='a')=>(d.tracks[0] as any).clips.find((c:FilmClip)=>c.id===id) as FilmClip;
test('speed/reverse/freeze mapping preserves source time through trim, split and range deletion',()=>{let d=applyFilmCommands(fixture(),[{type:'film.timing.set',clipId:'a',timing:{rate:2},duration:45,ripple:true}]);assert.equal(clip(d,'b').at,45);assert.equal(filmFrame(d,.5).layers[0].sourceTime,2);d=applyFilmCommands(d,[{type:'film.timing.set',clipId:'a',timing:{rate:-2},sourceIn:clipSourceTime(clip(d),44,d.frameRate)}]);const source=clipSourceTime(clip(d),30,d.frameRate),split=applyFilmCommands(d,[{type:'film.clip.split',clipId:'a',at:20,rightId:'r'}]);assert.ok(Math.abs(clipSourceTime(clip(split,'r'),10,d.frameRate)-source)<1e-9);const trimmed=applyFilmCommands(d,[{type:'film.clip.trim',clipId:'a',edge:'in',delta:10}]);assert.ok(Math.abs(clipSourceTime(clip(trimmed),20,d.frameRate)-source)<1e-9);const extracted=applyFilmCommands(d,[{type:'film.range.delete',trackIds:['t'],from:10,to:20,ripple:true,cutId:'cut'}]);assert.ok(Math.abs(clipSourceTime(clip(extracted,'a~cut'),10,d.frameRate)-source)<1e-9);const freeze=applyFilmCommands(d,[{type:'film.timing.set',clipId:'a',timing:{rate:0},sourceIn:2}]);assert.equal(filmFrame(freeze,.8).layers[0].sourceTime,2);});
test('time-map easing survives split and slip and rejects out-of-range source values atomically',()=>{const base=fixture(),map=[{frame:0,value:1},{frame:45,value:3,easing:'hold' as const},{frame:89,value:2}];const d=applyFilmCommands(base,[{type:'film.timing.set',clipId:'a',timing:{map}}]);assert.equal(clipSourceTime(clip(d),60,d.frameRate),3);const split=applyFilmCommands(d,[{type:'film.clip.split',clipId:'a',at:30,rightId:'r'}]);assert.equal(clipSourceTime(clip(split,'r'),30,d.frameRate),3);const slipped=applyFilmCommands(d,[{type:'film.clip.slip',clipId:'a',delta:30}]);assert.equal(clipSourceTime(clip(slipped),60,d.frameRate),4);assert.throws(()=>applyFilmCommands(d,[{type:'film.timing.set',clipId:'a',timing:{map:[{frame:0,value:0},{frame:89,value:12}]}}]));assert.equal(clipSourceTime(clip(d),60,d.frameRate),3);});
test('adjacent transitions composite incoming above outgoing with exact midpoint',()=>{for(const kind of ['dissolve','wipe','push'] as const){const d=applyFilmCommands(fixture(),[{type:'film.transition.set',clipId:'b',transition:{kind,duration:30}}]);const f=filmFrame(d,3);assert.deepEqual(f.layers.map(l=>l.clipId),['b','a']);assert.equal(f.layers[0].transition!.progress,.5);assert.equal(f.layers[0].gain,.5);if(kind==='dissolve')assert.equal(f.layers[0].appearance.opacity,.5);if(kind==='push'){assert.equal(f.layers[0].appearance.x,1280);assert.equal(f.layers[1].appearance.x,0);}const moved=applyFilmCommands(d,[{type:'film.clip.move',clipId:'b',trackId:'t',at:100}]);assert.equal(clip(moved,'b').transitionIn,undefined);}});

test('Motale transitions preserve both source clocks across the cut and keep structural bounds',()=>{
 const base=fixture();base.sources[0].kind='motale';base.sources[0].uri='/assets/motale/index.html';
 clip(base,'b').in=6;clip(base,'a').animationOffset=900;clip(base,'b').animationOffset=-100;
 const doc=applyFilmCommands(base,[{type:'film.transition.set',clipId:'b',transition:{kind:'dissolve',duration:30}}]);
 assert.deepEqual(parseFilmDocument(doc),doc,'Motale transitions round-trip without a persisted bridge capability');
 const samples:readonly [number,number,number,number][]=[[2.5,5.5,3.5,0],[3,6,4,.5],[3.25,6.25,4.25,.75]];
 for(const [time,incoming,outgoing,progress]of samples){
  const layers=filmFrame(doc,time).layers;assert.deepEqual(layers.map(layer=>layer.clipId),['b','a']);
  assert.equal(layers[0].sourceTime,incoming);assert.equal(layers[1].sourceTime,outgoing);
  assert.equal(layers[0].transition?.progress,progress);
 }
 assert.deepEqual(filmFrame(doc,2.49).layers.map(layer=>layer.clipId),['a']);
 assert.deepEqual(filmFrame(doc,3.5).layers.map(layer=>[layer.clipId,layer.sourceTime]),[['b',6.5]]);
 // Transition handles may extend outside a clip, but never outside its source.
 const bounded=structuredClone(doc);clip(bounded,'a').in=7;clip(bounded,'b').in=0;
 const layers=filmFrame(parseFilmDocument(bounded),3).layers;
 assert.equal(layers[0].sourceTime,0);assert.ok(layers[1].sourceTime<10&&layers[1].sourceTime>9.999);
 assert.equal(filmFrame(bounded,2.5).layers[0].sourceTime,0);
 const gap=structuredClone(doc);clip(gap,'b').at++;
 assert.throws(()=>parseFilmDocument(gap),/adjacent/);
 const tooLong=structuredClone(doc);clip(tooLong,'b').transitionIn!.duration=91;
 assert.throws(()=>parseFilmDocument(tooLong),/sufficient duration/);
});

test('reversing an eased or hold time map preserves fractional source samples exactly',()=>{const d=fixture(),c=clip(d);c.animationOffset=10;c.timing={map:[{frame:0,value:0,easing:[.2,.1,.8,1]},{frame:45,value:3,easing:'hold'},{frame:100,value:4}]};const reversed=reversedClipTiming(c,d.frameRate),r={...c,timing:reversed.timing,in:reversed.sourceIn};for(const at of [0,.5,10,43.2,44,45,60,88,89])assert.ok(Math.abs(clipSourceTime(c,89-at,d.frameRate)-clipSourceTime(r,at,d.frameRate))<1e-7);});
