import type {FilmDocument, FilmRate, FilmSource, FilmTrack} from '@notale/editor/film';

/** One origin for ruler, clips, markers and expanded animation lanes. */
export const TIMELINE_GUTTER = 120;
export const TIMELINE_END_PADDING = 64;
export const timelineX = (frame: number, zoom: number) => TIMELINE_GUTTER + frame * zoom;
export const timelineFrame = (x: number, zoom: number) => Math.round((x - TIMELINE_GUTTER) / zoom);

export function timelineKind(source?: FilmSource): 'video'|'image'|'audio'|'overlay'|'scene' {
  return source && ['video','image','audio','overlay'].includes(source.kind)
    ? source.kind as 'video'|'image'|'audio'|'overlay' : 'scene';
}
export function trackHeight(track: FilmTrack, doc: FilmDocument): number {
  if (track.kind === 'subtitle') return 32;
  return track.clips.reduce((height, clip) => {
    const kind = timelineKind(doc.sources.find(source => source.id === clip.sourceId));
    return Math.max(height, kind === 'video' || kind === 'image' ? 64 : kind === 'audio' ? 48 : 40);
  }, 40);
}

/** Anchor the same time to the same viewport pixel while zooming. */
export function zoomScroll(oldZoom: number, nextZoom: number, scroll: number, anchorX: number): number {
  const frame = (scroll + anchorX - TIMELINE_GUTTER) / oldZoom;
  return Math.max(0, timelineX(frame, nextZoom) - anchorX);
}

export function rulerTicks(length: number, zoom: number, rate: FilmRate, from = 0, to = length) {
  // Match the editor’s existing non-drop timecode, including fractional rates.
  const fps = Math.round(rate.numerator / rate.denominator);
  const required = 72 / zoom;
  const frameSteps = [1,2,5,10,15].filter(step => step < fps);
  const secondSteps = [1,2,5,10,15,30,60,120,300,600,1800,3600];
  const major = [...frameSteps, ...secondSteps.map(seconds => Math.round(seconds * fps))]
    .find(step => step >= required) ?? Math.ceil(required / (3600 * fps)) * Math.round(3600 * fps);
  const division = [5,4,3,2].find(count => major % count === 0 && major / count * zoom >= 8) ?? 1;
  const minor = major / division;
  const ticks: {frame: number; major: boolean; label: string}[] = [];
  for (let frame = Math.max(0, Math.floor(from / minor) * minor); frame <= Math.min(length, to); frame += minor) {
    const whole = frame % major === 0;
    const nominal = Math.round(fps), seconds = Math.floor(frame / nominal);
    const label = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2,'0')).join(':')
      + (major < fps ? ':' + String(frame % nominal).padStart(2,'0') : '');
    ticks.push({frame, major: whole, label});
  }
  return ticks;
}
