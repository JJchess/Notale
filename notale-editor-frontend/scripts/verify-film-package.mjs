import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync, readFileSync } from 'node:fs';
import * as film from '@notale/editor/film';
import * as lecture from '@notale/editor/browser';
const entry = realpathSync(fileURLToPath(import.meta.resolve('@notale/editor/film')));
const installed = realpathSync(fileURLToPath(new URL('../node_modules/@notale/editor/', import.meta.url)));
assert.ok(entry.startsWith(installed + '/dist/film/'), 'Consume the installed tarball, not sibling sources');
assert.ok(!readFileSync(entry,'utf8').includes('notale-format/src'), 'Runtime uses format public exports');
const doc = film.importMotaleActs({ title: 'Package consumer', acts: [{ id:'act',title:'A',start:2,end:5 }] }, { id:'package-film',sourceId:'source',uri:'/media/index.html' });
const changed = film.applyFilmCommands(doc,[{type:'film.clip.slip',clipId:doc.tracks[0].clips[0].id,delta:-30}]);
assert.equal(film.filmFrame(changed,0.5).layers[0].sourceTime,1.5);
assert.equal(doc.tracks[0].clips[0].in,2);
const animated=film.applyFilmCommands(doc,[
  {type:'film.keyframe.put',clipId:doc.tracks[0].clips[0].id,property:'opacity',keyframe:{frame:0,value:0}},
  {type:'film.keyframe.put',clipId:doc.tracks[0].clips[0].id,property:'opacity',keyframe:{frame:30,value:1}},
]);
assert.equal(film.filmFrame(animated,.5).layers[0].appearance.opacity,.5);
assert.ok(Object.keys(lecture).length>0, 'Existing browser entry still imports');


const overlay=film.applyFilmCommands(doc,[{type:'film.source.add',source:{id:'overlay-source',title:'文字',kind:'overlay',uri:'overlay:local',html:'<p>原始</p>'}},{type:'film.track.add',index:0,track:{id:'overlay-track',title:'叠加',kind:'media',locked:false,hidden:false,muted:false,clips:[{id:'overlay-clip',sourceId:'overlay-source',title:'文字',at:0,in:0,duration:60}]}},{type:'film.overlay.set',clipId:'overlay-clip',html:'<p>已编辑</p>'}]);
assert.equal(film.filmFrame(overlay,.5).layers[0].source.html,'<p>已编辑</p>');

const objectKeys=film.applyFilmCommands(overlay,[{type:'film.object.key.put',clipId:'overlay-clip',target:'title',property:'translate',keyframe:{frame:0,value:'0px 0px'}},{type:'film.object.key.put',clipId:'overlay-clip',target:'title',property:'translate',keyframe:{frame:30,value:'120px 60px'}}]);
assert.equal(film.filmFrame(objectKeys,.5).layers[0].objectStyles.title.translate,'60px 30px');

const masked=film.applyFilmCommands(overlay,[{type:'film.mask.add',clipId:'overlay-clip',mask:{id:'shape-mask',values:{shape:'heart',feather:12,skewX:17}}}]);
const masks=film.filmFrame(masked,.5).layers[0].masks;assert.equal(masks[0].values.shape,'heart');assert.match(decodeURIComponent(film.filmMaskCss(masks,1280,720).maskImage),/feGaussianBlur/);assert.match(film.filmMaskSvg(masks[0],1280,720),/skewX\(17\)/);
const skewed=film.applyFilmCommands(doc,[{type:'film.property.set',clipId:doc.tracks[0].clips[0].id,property:'skewX',value:25}]);assert.equal(film.filmFrame(skewed,.5).layers[0].appearance.skewX,25);
console.log(`PASS installed @notale/editor/film + existing /browser: ${entry}`);
