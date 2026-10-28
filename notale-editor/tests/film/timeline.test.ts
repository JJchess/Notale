import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emptyFilm, parseFilmDocument, filmDuration, frameSeconds,
  type FilmDocument, type FilmMediaTrack, type FilmSubtitleTrack,
} from '../../../notale-format/src/film.js';
import { applyFilmCommands, type FilmCommand } from '../../src/film/commands.js';
import { filmFrame, clipMarkers, MotaleTransport } from '../../src/film/frame.js';
import { importMotaleActs } from '../../src/film/motale.js';
import { importVtt, exportVtt } from '../../src/film/subtitles.js';
import { timecode, parseTimecode, snapFrame, stepFrame } from '../../src/film/time.js';

const rate = { numerator: 30, denominator: 1 };
function fixture(): FilmDocument {
  const d = emptyFilm('film-test', '测试影片');
  d.sources = [{ id: 'source', kind: 'motale', title: '样片', uri: '/fixtures/motion/index.html', duration: 120,
    markers: [{ id: 'act-1', title: '起点', time: 10 }, { id: 'step-2', title: '讲授步骤', time: 12 }] }];
  (d.tracks[0] as FilmMediaTrack).clips = [
    { id: 'a', sourceId: 'source', title: '一', at: 0, duration: 300, in: 10 },
    { id: 'b', sourceId: 'source', title: '二', at: 300, duration: 300, in: 30 },
    { id: 'c', sourceId: 'source', title: '三', at: 600, duration: 300, in: 60 },
  ];
  d.tracks.push({ id: 'zh', title: '中文', kind: 'subtitle', language: 'zh-CN', locked: false, hidden: false, muted: false,
    cues: [{ id: 'cue-a', at: 300, duration: 60, text: '你好' }] });
  return parseFilmDocument(d);
}
const clips = (d: FilmDocument) => (d.tracks[0] as FilmMediaTrack).clips;
const edit = (command: FilmCommand, doc = fixture()) => applyFilmCommands(doc, [command]);

test('additive format rejects invalid references, overlap, duplicate IDs and source overruns', () => {
  const base = fixture();
  for (const mutate of [
    (d: FilmDocument) => { clips(d)[0].sourceId = 'missing'; },
    (d: FilmDocument) => { clips(d)[1].at = 299; },
    (d: FilmDocument) => { clips(d)[1].id = 'a'; },
    (d: FilmDocument) => { clips(d)[0].in = 115; },
    (d: FilmDocument) => { clips(d)[0].duration = 0; },
    (d: FilmDocument) => { d.frameRate.denominator = 0; },
    (d: FilmDocument) => { clips(d)[0].at = NaN; },
    (d: FilmDocument) => { d.sources[0].uri = 'javascript:alert(1)'; },
  ]) { const d = structuredClone(base); mutate(d); assert.throws(() => parseFilmDocument(d)); }
  assert.equal(parseFilmDocument(base).kind, 'film');
  assert.notEqual(parseFilmDocument(base).tracks[0], base.tracks[0]);
});

test('command batch is atomic and deterministic; invalid/locked edits cannot alter a prior revision', () => {
  const d = fixture(), before = structuredClone(d);
  const split: FilmCommand = { type: 'film.clip.split', clipId: 'a', at: 150, rightId: 'a-right' };
  assert.deepEqual(edit(split, d), edit(split, d));
  assert.throws(() => applyFilmCommands(d, [split, { type: 'film.clip.move', clipId: 'b', trackId: 'v1', at: 100 }]));
  assert.deepEqual(d, before);
  d.tracks[0].locked = true;
  for (const command of [split, { type: 'film.clip.delete', clipId: 'a' }, { type: 'film.clip.slip', clipId: 'a', delta: 1 }] as FilmCommand[])
    assert.throws(() => edit(command, d), /locked/);
});

test('split and ordinary trims preserve source/time mapping and gaps', () => {
  const d = edit({ type: 'film.clip.split', clipId: 'a', at: 120, rightId: 'a-right' });
  assert.deepEqual(clips(d).slice(0, 2).map(c => [c.id, c.at, c.duration, c.in]), [['a', 0, 120, 10], ['a-right', 120, 180, 14]]);
  assert.equal(filmFrame(d, 4).layers[0].sourceTime, 14);
  const trimmed = edit({ type: 'film.clip.trim', clipId: 'a', edge: 'in', delta: 30 });
  assert.equal(filmFrame(trimmed, 0).layers.length, 0);
  assert.equal(filmFrame(trimmed, 1).layers[0].sourceTime, 11);
  assert.equal(clips(trimmed)[1].at, 300);
});

test('ripple in/out and delete carry following media/captions/markers only when sync requested', () => {
  const original = fixture(); original.markers.push({ id: 'mark', at: 450, title: '讲解' });
  const d = edit({ type: 'film.clip.trim', clipId: 'a', edge: 'out', delta: -30, ripple: true, sync: true }, original);
  assert.deepEqual(clips(d).map(c => c.at), [0, 270, 570]);
  assert.equal((d.tracks[1] as FilmSubtitleTrack).cues[0].at, 270);
  assert.equal(d.markers[0].at, 420);
  const head = edit({ type: 'film.clip.trim', clipId: 'a', edge: 'in', delta: 60, ripple: true });
  assert.deepEqual([clips(head)[0].at, clips(head)[0].in, clips(head)[1].at], [0, 12, 240]);
  assert.equal((head.tracks[1] as FilmSubtitleTrack).cues[0].at, 300);
  const deleted = edit({ type: 'film.clip.delete', clipId: 'a', ripple: true, sync: true });
  assert.deepEqual(clips(deleted).map(c => c.at), [0, 300]);
  assert.equal(filmFrame(deleted, 0).layers[0].sourceTime, 30);
});

test('sync ripple rejects spanning clips and collisions instead of silently desynchronizing', () => {
  const d = fixture(), sub = d.tracks[1] as FilmSubtitleTrack;
  sub.cues[0] = { ...sub.cues[0], at: 290, duration: 30 };
  assert.throws(() => edit({ type: 'film.clip.trim', clipId: 'a', edge: 'out', delta: -30, ripple: true, sync: true }, d), /unsplit/);
  const overlay: FilmMediaTrack = { id: 'v2', title: '叠加', kind: 'media', locked: false, hidden: false, muted: false, clips: [
    { id: 'over-1', at: 0, duration: 299, in: 0, sourceId: 'source', title: '' },
    { id: 'over-2', at: 300, duration: 90, in: 10, sourceId: 'source', title: '' },
  ] };
  const collision = fixture(); collision.tracks.push(overlay);
  assert.throws(() => edit({ type: 'film.clip.trim', clipId: 'a', edge: 'out', delta: -30, ripple: true, sync: true }, collision), /overlap/);
});

test('roll preserves total duration; slip preserves placement; slide preserves middle source and overall duration', () => {
  const roll = edit({ type: 'film.clip.roll', leftId: 'a', rightId: 'b', delta: 30 });
  assert.deepEqual(clips(roll).slice(0, 2).map(c => [c.at, c.duration, c.in]), [[0, 330, 10], [330, 270, 31]]);
  const slip = edit({ type: 'film.clip.slip', clipId: 'b', delta: 60 });
  assert.deepEqual([clips(slip)[1].at, clips(slip)[1].duration, clips(slip)[1].in], [300, 300, 32]);
  const slide = edit({ type: 'film.clip.slide', clipId: 'b', delta: -30 });
  assert.deepEqual(clips(slide).map(c => [c.at, c.duration, c.in]), [[0, 270, 10], [270, 300, 30], [570, 330, 59]]);
  for (const d of [roll, slip, slide]) assert.equal(filmDuration(d), 900);
  assert.throws(() => edit({ type: 'film.clip.slip', clipId: 'a', delta: -301 }), /source/);
  assert.throws(() => edit({ type: 'film.clip.slide', clipId: 'a', delta: 30 }), /neighbors/);
  assert.throws(() => edit({ type: 'film.clip.roll', leftId: 'a', rightId: 'b', delta: 300 }), /interval/);
});

test('range deletion excises middle pieces with exact source offsets, with or without ripple', () => {
  const lift = edit({ type: 'film.range.delete', trackIds: ['v1'], from: 90, to: 210, ripple: false, cutId: 'cut1' });
  assert.deepEqual(clips(lift).slice(0, 2).map(c => [c.id, c.at, c.duration, c.in]), [['a', 0, 90, 10], ['a~cut1', 210, 90, 17]]);
  assert.equal(filmFrame(lift, 5).layers.length, 0);
  const ripple = edit({ type: 'film.range.delete', trackIds: ['v1', 'zh'], from: 90, to: 330, ripple: true, cutId: 'cut2' });
  assert.deepEqual(clips(ripple).map(c => [c.id, c.at, c.duration, c.in]), [['a', 0, 90, 10], ['b', 90, 270, 31], ['c', 360, 300, 60]]);
  assert.deepEqual((ripple.tracks[1] as FilmSubtitleTrack).cues.map(c => [c.at, c.duration]), [[90, 30]]);
  assert.equal(filmDuration(ripple), 660);
});

test('reordering changes the actual frame plan and rejects missing/duplicate clips', () => {
  const d = edit({ type: 'film.clip.reorder', trackId: 'v1', clipIds: ['c', 'a', 'b'] });
  assert.equal(filmFrame(d, 0).layers[0].sourceTime, 60);
  assert.equal(filmFrame(d, 10).layers[0].sourceTime, 10);
  assert.equal(filmFrame(d, 30).layers.length, 0);
  for (const ids of [['a'], ['a', 'a', 'c'], ['a', 'b', 'z']]) assert.throws(() => edit({ type: 'film.clip.reorder', trackId: 'v1', clipIds: ids }));
});

test('timecode, frame stepping, snapping and source teaching markers work at rational fps', () => {
  const rate = { numerator: 30000, denominator: 1001 };
  assert.equal(frameSeconds(30000, rate), 1001);
  assert.equal(timecode(108000, rate), '01:00:00:00');
  assert.equal(parseTimecode('01:00:00:00', rate), 108000);
  assert.throws(() => parseTimecode('00:00:00:30', rate));
  assert.throws(() => parseTimecode('00:60:00:00', rate));
  const d = fixture();
  assert.equal(stepFrame(d, 0, -1), 0); assert.equal(stepFrame(d, 899, 1), 900);
  assert.deepEqual(snapFrame(d, 297, 4), { frame: 300, snapped: true });
  assert.deepEqual(snapFrame(d, 297, 2), { frame: 297, snapped: false });
  assert.deepEqual(snapFrame(d, 610, 2, { playhead: 611 }), { frame: 611, snapped: true });
  assert.deepEqual(clipMarkers(d, 'a').map(m => m.at), [0, 60]);
  const trimmed = edit({ type: 'film.clip.trim', clipId: 'a', edge: 'in', delta: 90 });
  assert.deepEqual(clipMarkers(trimmed, 'a'), []);
});

test('multilingual VTT preserves payload/word tags, settings, cue identifiers and metadata', () => {
  const raw = 'WEBVTT 中文\r\n\r\nNOTE original captions\r\n\r\nSTYLE\r\n::cue { color: white; }\r\n\r\nspoken\r\n00:00:01.000 --> 00:00:03.000 align:start position:10%\r\n<v Alice>你好 <00:00:02.000>世界\r\n第二行\r\n\r\n';
  const track = importVtt(raw, { id: 'zh', language: 'zh-CN', rate });
  assert.equal(track.cues[0].at, 30); assert.equal(track.cues[0].duration, 60);
  assert.deepEqual(importVtt(exportVtt(track, rate), { id: 'zh', language: 'zh-CN', rate }), track);
  const d = fixture(); d.tracks[1] = track;
  d.tracks.push(importVtt('WEBVTT\n\n00:01.000 --> 00:03.000\nHello\n', { id: 'en', language: 'en', rate }));
  assert.equal(filmFrame(d, 2).subtitles.length, 2);
  assert.deepEqual(filmFrame(d, 2, ['en']).subtitles.map(s => s.cue.text), ['Hello']);
  for (const invalid of ['bad', 'WEBVTT\n\n00:61.000 --> 00:62.000\nbad', 'WEBVTT\n\n00:01.000 --> 00:01.001\ntiny', 'WEBVTT\n\n00:03.000 --> 00:01.000\nreverse'])
    assert.throws(() => importVtt(invalid, { id: 'sub', language: 'en', rate }));
});

test('composition is order independent, half-open, respects hidden/muted and never mutates author data', () => {
  const d = fixture(), before = structuredClone(d), reference = filmFrame(d, 15);
  filmFrame(d, 27); filmFrame(d, 0); assert.deepEqual(filmFrame(d, 15), reference);
  assert.deepEqual(d, before);
  assert.equal(filmFrame(d, 10).layers[0].clipId, 'b');
  d.tracks[0].muted = true; assert.equal(filmFrame(d, 0).layers[0].muted, true);
  d.tracks[0].hidden = true; assert.equal(filmFrame(d, 0).layers.length, 0);
  assert.throws(() => filmFrame(d, NaN));
});

test('Motale transport latches viewer takeover until explicit resume without resetting parameters', () => {
  let activeBranch = 'main', time = 0, seeks = 0;
  const parameters = { amplitude: 2 };
  const shell = { state: () => ({ activeBranch, time, parameters, playing: false }), pause() {}, seek(t: number) { time = t; seeks++; } };
  const transport = new MotaleTransport(shell);
  assert.equal(transport.frame(12), 'rendered'); assert.equal(time, 12);
  activeBranch = 'viewer-1'; parameters.amplitude = 5;
  assert.equal(transport.frame(13), 'viewer-takeover');
  assert.equal(transport.frame(14), 'viewer-takeover'); assert.equal(seeks, 1);
  transport.resume(15); assert.equal(time, 15); assert.equal(parameters.amplitude, 5);
  assert.equal(transport.frame(16), 'rendered');
});

for (const sample of ['motion', 'manim', 'whiteboard']) test(`real read-only ${sample} acts import -> three reordered/truncated acts -> source frame plan`, () => {
  const raw = readFileSync(`fixtures/motale/${sample}/acts.json`, 'utf8');
  const d = importMotaleActs(JSON.parse(raw), { id: sample, sourceId: `${sample}:source`, uri: `/fixtures/${sample}/index.html` });
  assert.ok(clips(d).length >= 3);
  const first = clips(d).slice(0, 3), trimmed = applyFilmCommands(d, [
    ...clips(d).slice(3).map(c => ({ type: 'film.clip.delete' as const, clipId: c.id })),
    { type: 'film.clip.reorder', trackId: d.tracks[0].id, clipIds: [first[2].id, first[0].id, first[1].id] },
    { type: 'film.clip.trim', clipId: first[2].id, edge: 'out', delta: -30, ripple: true },
  ]);
  assert.equal(clips(trimmed).length, 3);
  assert.equal(filmFrame(trimmed, 0).layers[0].sourceTime, first[2].in);
  const cutTime = frameSeconds(clips(trimmed)[1].at, d.frameRate);
  assert.equal(filmFrame(trimmed, cutTime).layers[0].sourceTime, first[0].in);
  assert.equal(readFileSync(`fixtures/motale/${sample}/acts.json`, 'utf8'), raw);
});
