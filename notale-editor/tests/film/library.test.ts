import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilm, parseFilmDocument, type FilmMediaTrack } from '../../../notale-format/src/film.js';
import { applyFilmCommands } from '../../src/film/commands.js';
import { sourceClip, adjacentTime } from '../../src/film/library.js';
import { filmFrame } from '../../src/film/frame.js';
import { importMotaleActs } from '../../src/film/motale.js';
function fixture() {
  const doc = emptyFilm('library');
  doc.sources = [{ id:'s', title:'素材', kind:'video', uri:'/clip.mp4', duration:20 }, { id:'unused', title:'备用', kind:'image', uri:'/overlay.svg' }];
  (doc.tracks[0] as FilmMediaTrack).clips = [{ id:'a', sourceId:'s', title:'底层', at:0, duration:300, in:0 }];
  doc.tracks.unshift({id:'top',title:'叠加',kind:'media',locked:false,hidden:false,muted:false,clips:[{id:'b',sourceId:'s',title:'上层',at:0,duration:30,in:10}]});
  return doc;
}
test('source windows quantize down, append to selected track, and reject bounds/overlap/lock atomically', () => {
  const doc=fixture(), before=structuredClone(doc);
  const clip=sourceClip(doc,{id:'new',sourceId:'s',trackId:'top',from:2.01,to:3.025,position:'append'});
  assert.deepEqual([clip.at,clip.in,clip.duration],[30,2.01,30]);
  assert.ok(clip.in+clip.duration/30<=3.025);
  const next=applyFilmCommands(doc,[{type:'film.clip.add',trackId:'top',clip}]);
  assert.equal((next.tracks[0] as FilmMediaTrack).clips.length,2);
  assert.throws(()=>applyFilmCommands(doc,[{type:'film.clip.add',trackId:'top',clip:{...clip,at:15}}]));
  for (const [from,to] of [[-1,2],[3,2],[19,21],[1,1.001],[NaN,3]]) assert.throws(()=>sourceClip(doc,{id:'bad',sourceId:'s',trackId:'top',from,to,position:0}));
  assert.deepEqual(doc,before);
  doc.tracks[0].locked=true;
  assert.throws(()=>sourceClip(doc,{id:'bad',sourceId:'s',trackId:'top',from:0,to:2,position:'append'}),/锁定/);
});
test('track order changes compositing; hidden/muted honor track settings; locked crossings are rejected', () => {
  const doc=fixture(), before=structuredClone(doc);
  assert.equal(filmFrame(doc,.5).layers[0].clipId,'b');
  const moved=applyFilmCommands(doc,[{type:'film.track.move',trackId:'top',index:1}]);
  assert.equal(filmFrame(moved,.5).layers[0].clipId,'a');
  const hidden=applyFilmCommands(doc,[{type:'film.track.update',trackId:'top',patch:{hidden:true}},{type:'film.track.update',trackId:'v1',patch:{muted:true}}]);
  assert.deepEqual(filmFrame(hidden,.5).layers.map(l=>[l.clipId,l.muted]),[['a',true]]);
  assert.deepEqual(doc,before);
  doc.tracks[1].locked=true;
  assert.throws(()=>applyFilmCommands(doc,[{type:'film.track.move',trackId:'top',index:1}]),/锁定/);
  assert.throws(()=>applyFilmCommands(doc,[{type:'film.track.delete',trackId:'v1'}]),/locked/);
});
test('deleting tracks preserves sources, and deleting referenced sources never cascades', () => {
  const doc=fixture(), before=structuredClone(doc);
  assert.throws(()=>applyFilmCommands(doc,[{type:'film.source.remove',sourceId:'s'}]),/使用/);
  const without=applyFilmCommands(doc,[{type:'film.track.delete',trackId:'top'},{type:'film.track.delete',trackId:'v1'}]);
  assert.equal(without.tracks.length,0); assert.deepEqual(without.sources,doc.sources);
  const empty=applyFilmCommands(without,[{type:'film.source.remove',sourceId:'s'},{type:'film.source.remove',sourceId:'unused'}]);
  assert.deepEqual(empty.sources,[]);
  assert.throws(()=>applyFilmCommands(doc,[{type:'film.source.remove',sourceId:'unused'},{type:'film.source.remove',sourceId:'s'}]));
  assert.deepEqual(doc,before);
});
test('act ranges preserve explicit ends across gaps and marker navigation skips current/duplicate times', () => {
  const doc=importMotaleActs({title:'幕间有空隙',acts:[{id:'one',title:'一',start:1,end:3},{id:'two',title:'二',start:5,end:8}]},{id:'film',sourceId:'s',uri:'/index.html'});
  assert.deepEqual(doc.sources[0].markers?.map(m=>[m.time,m.end]),[[1,3],[5,8]]);
  const invalid=structuredClone(doc); invalid.sources[0].markers![0].end=9;
  assert.throws(()=>parseFilmDocument(invalid),/marker end/);
  assert.equal(adjacentTime([60,0,30,30],30,-1),0);
  assert.equal(adjacentTime([60,0,30,30],30,1),60);
  assert.equal(adjacentTime([0,30],30,1),undefined);
});
