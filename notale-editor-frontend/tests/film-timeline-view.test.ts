import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FilmDocument, FilmMediaTrack, FilmRate, FilmSource, FilmSubtitleTrack} from '@notale/editor/film';
import {TIMELINE_GUTTER, timelineFrame, timelineX, zoomScroll, rulerTicks, trackHeight} from '../src/film/timeline-view';

test('timeline coordinates retain the shared gutter after scrolling and at fractional zoom', () => {
  const zooms: number[] = [.002, .125, 1.5, 6];
  const frames: number[] = [0, 1, 29, 1800, 123456789];
  for (const zoom of zooms) {
    assert.equal(timelineX(0, zoom), TIMELINE_GUTTER);
    for (const frame of frames) assert.equal(timelineFrame(timelineX(frame, zoom), zoom), frame);
  }
  // A pointer's viewport position must first be translated into scrolled content coordinates.
  const clientX = 341, viewportLeft = 40, scrollLeft = 750;
  assert.equal(timelineFrame(clientX - viewportLeft + scrollLeft, .5), 1862);
  assert.equal(timelineFrame(151.24, 2.5), 12);
  assert.equal(timelineFrame(151.26, 2.5), 13);
});

test('zoom preserves the frame under its viewport anchor except at the start scroll boundary', () => {
  const frame = 2000, anchor = 320, oldScroll = 800;
  const nextScroll = zoomScroll(.5, 2, oldScroll, anchor);
  assert.equal(nextScroll, 3800);
  assert.equal(timelineX(frame, 2) - nextScroll, anchor);
  assert.equal(zoomScroll(2, .5, nextScroll, anchor), oldScroll);
  assert.equal(zoomScroll(1, .25, 0, 420), 0, 'zooming out near the start cannot create negative scroll');
  assert.equal(zoomScroll(.5, 6, 900, TIMELINE_GUTTER), 10800, 'the fixed gutter edge can also anchor zoom');
});

test('fractional-rate ruler boundaries agree with non-drop frame timecode and stay windowed', () => {
  const rates: {rate: FilmRate; minute: number}[] = [
    {rate: {numerator: 30000, denominator: 1001}, minute: 1800},
    {rate: {numerator: 24000, denominator: 1001}, minute: 1440},
  ];
  for (const {rate, minute} of rates) {
    const ticks = rulerTicks(minute * 2, .05, rate);
    assert.equal(ticks.find(tick => tick.major && tick.frame === minute)?.label, '01:00');
    assert.equal(ticks.find(tick => tick.major && tick.frame === minute * 2)?.label, '02:00');
    const frameTicks = rulerTicks(minute, 100, rate, minute - 1, minute);
    assert.equal(frameTicks.at(-1)?.label, '01:00:00');
    assert.ok(frameTicks.every(tick => Number.isSafeInteger(tick.frame)));
    const from = minute * 500 + 137, to = from + 1000;
    const window = rulerTicks(minute * 600, .05, rate, from, to);
    assert.ok(window.length > 0 && window.length < 20, 'a late viewport must not enumerate earlier hours');
    assert.ok(window.filter(tick => tick.frame < from).length <= 1, 'only the leading grid tick may precede the viewport');
    assert.ok(window.every(tick => tick.frame >= 0 && tick.frame <= to));
    assert.equal(new Set(window.map(tick => tick.frame)).size, window.length);
    const zooms: number[] = [.002, .05, .125, 1.5, 6, 100];
    for (const zoom of zooms) {
      const majors = rulerTicks(minute * 600, zoom, rate, from, from + 1000 / zoom).filter(tick => tick.major);
      for (let index = 1; index < majors.length; index++) {
        assert.ok(timelineX(majors[index].frame, zoom) - timelineX(majors[index - 1].frame, zoom) >= 72 - 1e-7,
          `ruler labels need 72px clearance at zoom ${zoom}`);
      }
    }
  }
  const hourly = rulerTicks(216000, .001, rates[0].rate);
  assert.equal(hourly.find(tick => tick.major && tick.frame === 108000)?.label, '60:00');
  assert.equal(hourly.find(tick => tick.major && tick.frame === 216000)?.label, '120:00');
});

test('mixed media tracks allocate enough height regardless of clip order without mutating the document', () => {
  const kinds: FilmSource['kind'][] = ['overlay', 'audio', 'video', 'image', 'motale'];
  const sources: FilmSource[] = kinds.map(kind => ({id: kind, kind, title: kind, uri: `/fixtures/${kind}`, duration: 5, ...(kind === 'overlay' ? {html: '<div>Title</div>'} : {})}));
  const track: FilmMediaTrack = {id: 'mixed', kind: 'media', title: 'Mixed', locked: false, hidden: false, muted: false, clips: []};
  const subtitles: FilmSubtitleTrack = {id: 'captions', kind: 'subtitle', title: '字幕', language: 'zh-CN', locked: false, hidden: false, muted: false, cues: []};
  const doc: FilmDocument = {id: 'view', title: 'View', kind: 'film', schemaVersion: 1, width: 1280, height: 720,
    frameRate: {numerator: 30, denominator: 1}, sources, tracks: [track, subtitles], markers: []};
  const withSources = (ids: string[]): FilmMediaTrack => ({...track, clips: ids.map((sourceId, index) => ({id: `clip-${index}`, title: sourceId, sourceId, at: index * 30, duration: 30, in: 0}))});
  const before: FilmDocument = structuredClone(doc);
  assert.equal(trackHeight(track, doc), 40);
  assert.equal(trackHeight(subtitles, doc), 32);
  assert.equal(trackHeight(withSources(['overlay', 'motale']), doc), 40);
  assert.equal(trackHeight(withSources(['overlay', 'audio']), doc), 48);
  assert.equal(trackHeight(withSources(['audio', 'video', 'overlay']), doc), 64);
  assert.equal(trackHeight(withSources(['image', 'audio']), doc), 64);
  assert.equal(trackHeight(withSources(['overlay', 'video', 'audio']), doc), 64);
  assert.deepEqual(doc, before);
});
