import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {build} from '../../../notale-editor/node_modules/esbuild/lib/main.js';
const root=new URL('../../../',import.meta.url).pathname;
const bundled=await build({stdin:{contents:"export {emptyFilm} from '@notale/editor/film';export {videoFrameRate,prepareFirstVideoRate} from './notale-editor-frontend/src/film/first-video-rate.ts';export {rhythmFrames,rhythmSnapPoints} from './notale-editor-frontend/src/film/rhythm.ts';",resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',target:'node20',loader:{'.css':'empty'},alias:{'@notale/editor/film':root+'notale-editor/src/film/index.ts','@notale/format/film':root+'notale-format/src/film.ts'}});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {emptyFilm,videoFrameRate,prepareFirstVideoRate,rhythmFrames,rhythmSnapPoints}=module.exports;
const rate={numerator:10,denominator:1},ntsc={numerator:30000,denominator:1001};
const video={id:'video',kind:'video',title:'video',uri:'/video.mp4',duration:10,frameRate:ntsc};
const clip=(patch={})=>({id:'clip',sourceId:'video',title:'clip',at:20,in:0,duration:60,...patch});
const rhythm=(beats,onsets=[])=>({version:1,fingerprint:'a'.repeat(64),duration:10,confidence:.8,beats,onsets});
test('first video uses exact CFR rational; mismatched/VFR and invalid hints remain unset',()=>{
 assert.deepEqual(videoFrameRate({avg_frame_rate:'30000/1001',r_frame_rate:'60000/2002'}),ntsc);
 assert.equal(videoFrameRate({avg_frame_rate:'2997/100',r_frame_rate:'30000/1001'}),undefined);
 assert.equal(videoFrameRate({avg_frame_rate:'24/1',r_frame_rate:'30/1'}),undefined);
 for(const raw of ['0/0','0/1','1/0','999999/1','30','-30/1'])assert.equal(videoFrameRate({avg_frame_rate:raw,r_frame_rate:raw}),undefined);
});
test('only empty auto projects adopt first eligible video; caller data stays unchanged',()=>{
 const document={...emptyFilm('new'),frameRateMode:'auto'},before=structuredClone(document);
 const prepared=prepareFirstVideoRate(document,[{id:'image',kind:'image',uri:'/image.png',title:'image'},video,{...video,id:'later',frameRate:{numerator:24,denominator:1}}]);
 assert.deepEqual(prepared.frameRate,ntsc);assert.equal(prepared.frameRateMode,'manual');assert.deepEqual(document,before);
 const noHint=prepareFirstVideoRate(document,[{...video,frameRate:undefined}]);assert.deepEqual(noHint.frameRate,document.frameRate);assert.equal(noHint.frameRateMode,'auto');
 for(const policy of [undefined,'manual']){const existing={...document,frameRateMode:policy};const result=prepareFirstVideoRate(existing,[video]);assert.deepEqual(result.frameRate,document.frameRate);assert.equal(result.frameRateMode,policy);}
});
test('existing media, subtitle cues or markers freeze an auto grid instead of re-quantizing',()=>{
 const base={...emptyFilm('used'),frameRateMode:'auto'};
 const media={...base,sources:[video],tracks:[{...base.tracks[0],clips:[clip({at:0,duration:30})]}]};
 const captions={...base,tracks:[...base.tracks,{id:'subtitles',kind:'subtitle',title:'subtitles',language:'zh',locked:false,hidden:false,muted:false,cues:[{id:'cue',at:1,duration:20,text:'caption'}]}]};
 const marked={...base,markers:[{id:'marker',at:12,title:'mark'}]};
 for(const document of [media,captions,marked]){const before=structuredClone(document),result=prepareFirstVideoRate(document,[video]);assert.deepEqual(result.frameRate,document.frameRate);assert.equal(result.frameRateMode,'manual');assert.deepEqual(document,before);}
});
test('rhythm inverse maps forward/rate/reverse/repeated/frozen source time without duplicate holds',()=>{
 const beats=rhythm([1,2,3]);assert.deepEqual(rhythmFrames(clip(),rate,beats),[10,20,30]);
 assert.deepEqual(rhythmFrames(clip({timing:{rate:2}}),rate,beats),[5,10,15]);
 assert.deepEqual(rhythmFrames(clip({in:4,timing:{rate:-1}}),rate,beats),[10,20,30]);
 const map=[{frame:0,value:0},{frame:20,value:2},{frame:40,value:0},{frame:60,value:2}];
 assert.deepEqual(rhythmFrames(clip({timing:{map}}),rate,rhythm([1])),[10,30,50]);
 assert.deepEqual(rhythmFrames(clip({duration:40,animationOffset:20,timing:{map}}),rate,rhythm([1])),[10,30]);
 assert.deepEqual(rhythmFrames(clip({in:1,timing:{rate:0}}),rate,beats),[0]);
 assert.deepEqual(rhythmFrames(clip({in:.5,timing:{rate:0}}),rate,beats),[]);
 assert.deepEqual(rhythmFrames(clip({timing:{map:[{frame:0,value:0},{frame:10,value:1,easing:'hold'},{frame:30,value:2},{frame:60,value:3}]}}),rate,rhythm([1])),[10]);
 assert.deepEqual(rhythmFrames(clip({duration:30}),ntsc,rhythm([15*1001/30000,30*1001/30000])),[15]);
 assert.deepEqual(rhythmFrames(clip(),rate,rhythm([],[.2,.2001,.3])),[2,3]);
});
test('snap points use timeline placement and omit hidden or explicitly excluded clips',()=>{
 const source={...video,rhythm:rhythm([1,2])},a=clip(),b=clip({id:'b',at:100,in:3,timing:{rate:-1}});
 const document={frameRate:rate,sources:[source],tracks:[{kind:'media',hidden:false,muted:true,clips:[a,b]},{kind:'media',hidden:true,clips:[clip({id:'hidden',at:500})]},{kind:'subtitle',cues:[]}]};
 assert.deepEqual(rhythmSnapPoints(document),[30,40,110,120]);assert.deepEqual(rhythmSnapPoints(document,['b']),[30,40]);
});
