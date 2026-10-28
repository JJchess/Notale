import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilm, type FilmMediaTrack, type FilmSubtitleTrack } from '../../../notale-format/src/film.js';
import { applyFilmCommands } from '../../src/film/commands.js';
import { deleteRangeCommand, gestureCommands, fitZoom } from '../../../notale-editor-frontend/src/film/timeline-tools.js';
function fixture() {
  const doc = emptyFilm('gesture');
  doc.sources = [{ id: 's', title: 's', kind: 'video', uri: '/clip.mp4', duration: 50 }];
  (doc.tracks[0] as FilmMediaTrack).clips = ['a','b','c'].map((id,i) => ({ id, title:id, sourceId:'s', at:i*90, duration:90, in:10+i*5 }));
  doc.tracks.push({ id: 'zh', kind: 'subtitle', title: '中文', language:'zh', locked:false, hidden:false, muted:false, cues:[{id:'cue',at:80,duration:40,text:'跨剪辑点'}] });
  return doc;
}
const options = { tool: 'select' as const, ripple:false, sync:false };
test('drag handles use origin-based roll/ripple/slip/slide commands and do not modify a revision', () => {
  const doc=fixture(), before=structuredClone(doc);
  const roll=applyFilmCommands(doc,gestureCommands(doc,'b',10,{...options,edge:'in',tool:'roll'}));
  assert.deepEqual((roll.tracks[0] as FilmMediaTrack).clips.map(c=>[c.at,c.duration]), [[0,100],[100,80],[180,90]]);
  const ripple=applyFilmCommands(doc,gestureCommands(doc,'b',-10,{...options,edge:'out',tool:'ripple'}));
  assert.equal((ripple.tracks[0] as FilmMediaTrack).clips[2].at,170);
  const slip=applyFilmCommands(doc,gestureCommands(doc,'b',30,{...options,tool:'slip'}));
  assert.equal((slip.tracks[0] as FilmMediaTrack).clips[1].in,16);
  const slide=applyFilmCommands(doc,gestureCommands(doc,'b',-10,{...options,tool:'slide'}));
  assert.equal((slide.tracks[0] as FilmMediaTrack).clips[1].at,80);
  assert.deepEqual(doc,before);
  assert.throws(()=>gestureCommands(doc,'a',10,{...options,edge:'in',tool:'roll'}),/相邻/);
  assert.throws(()=>applyFilmCommands(doc,gestureCommands(doc,'a',-400,{...options,tool:'slip'})),/source/);
});
test('subtitle drag and trim retain payload/id and reject negative intervals and locked tracks', () => {
  const doc=fixture();
  const shifted=applyFilmCommands(doc,gestureCommands(doc,'cue',15,options));
  assert.deepEqual((shifted.tracks[1] as FilmSubtitleTrack).cues[0],{id:'cue',at:95,duration:40,text:'跨剪辑点'});
  const trimmed=applyFilmCommands(doc,gestureCommands(doc,'cue',10,{...options,edge:'in'}));
  assert.deepEqual((trimmed.tracks[1] as FilmSubtitleTrack).cues[0],{id:'cue',at:90,duration:30,text:'跨剪辑点'});
  assert.throws(()=>applyFilmCommands(doc,gestureCommands(doc,'cue',-100,options)));
  doc.tracks[1].locked=true;
  assert.throws(()=>gestureCommands(doc,'cue',1,options),/锁定/);
});
test('range UI command requires valid in/out and selected unlocked tracks; lift/extract keep other language timing', () => {
  const doc=fixture();
  for (const [from,to] of [[undefined,10],[0,undefined],[12,12],[-1,10],[0,271]]) assert.throws(()=>deleteRangeCommand(doc,from,to,new Set(['v1']),true,'cut'));
  assert.throws(()=>deleteRangeCommand(doc,10,20,new Set(),true,'cut'));
  const cmd=deleteRangeCommand(doc,60,120,new Set(['v1']),true,'cut');
  const result=applyFilmCommands(doc,[cmd]);
  assert.deepEqual((result.tracks[0] as FilmMediaTrack).clips.map(c=>[c.id,c.at,c.duration,c.in]),[['a',0,60,10],['b',60,60,16],['c',120,90,20]]);
  assert.deepEqual(result.tracks[1],doc.tracks[1]);
  doc.tracks[0].locked=true;
  assert.throws(()=>deleteRangeCommand(doc,0,10,new Set(['v1']),true,'cut'),/锁定/);
});
test('fit zoom allows long films to fit rather than enforcing a one-clip view', () => {
  assert.ok(398*30*fitZoom(398*30,1440)+152<=1440);
  assert.ok(fitZoom(0,1440)<=6);
});
