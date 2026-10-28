import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilm,parseFilmDocument,type FilmMediaTrack} from '../../../notale-format/src/film.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {filmFrame} from '../../src/film/frame.js';
test('overlay edits are immutable per-clip copies, survive split/import and respect source/lock boundaries',()=>{
 const doc=emptyFilm('overlay');doc.sources.push({id:'s',title:'文字',kind:'overlay',uri:'overlay:s',html:'<p>原始</p>'});
 (doc.tracks[0] as FilmMediaTrack).clips.push({id:'a',title:'文字',sourceId:'s',in:0,at:0,duration:150});
 const split=applyFilmCommands(doc,[{type:'film.clip.split',clipId:'a',at:60,rightId:'b'},{type:'film.overlay.set',clipId:'b',html:'<p>改后</p>'}]);
 assert.equal(filmFrame(split,1).layers[0].source.html,'<p>原始</p>');assert.equal(filmFrame(split,3).layers[0].source.html,'<p>改后</p>');
 assert.equal(doc.sources[0].html,'<p>原始</p>');assert.equal((doc.tracks[0] as FilmMediaTrack).clips.length,1);
 assert.deepEqual(parseFilmDocument(JSON.parse(JSON.stringify(split))),split);
 assert.throws(()=>applyFilmCommands(split,[{type:'film.overlay.set',clipId:'b',html:''}]));
 const locked=applyFilmCommands(split,[{type:'film.track.update',trackId:'v1',patch:{locked:true}}]);assert.throws(()=>applyFilmCommands(locked,[{type:'film.overlay.set',clipId:'b',html:'<p>x</p>'}]),/locked/);
 const image=structuredClone(doc);image.sources[0]={id:'s',title:'图片',kind:'image',uri:'/x.png'};assert.throws(()=>applyFilmCommands(image,[{type:'film.overlay.set',clipId:'a',html:'<p>x</p>'}]));
 const invalid=structuredClone(doc);delete invalid.sources[0].html;assert.throws(()=>parseFilmDocument(invalid));
});
