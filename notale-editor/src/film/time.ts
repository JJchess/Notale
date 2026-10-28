import { type FilmDocument, type FilmRate, filmAssert, filmDuration, clipEnd, assertFilmRate } from '@notale/format/film';
/** Non-drop frame timecode; fractional rates count frames with the nominal rounded rate.
 * Never label elapsed seconds as drop-frame timecode. */
export function timecode(frame: number, rate: FilmRate): string {
  assertFilmRate(rate); filmAssert(Number.isSafeInteger(frame) && frame >= 0, 'Invalid frame');
  const fps = Math.round(rate.numerator / rate.denominator);
  const f = frame % fps, total = Math.floor(frame / fps);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60, f].map(v => String(v).padStart(2, '0')).join(':');
}
export function parseTimecode(value: string, rate: FilmRate): number {
  assertFilmRate(rate);
  const m = /^(\d{2,}):(\d{2}):(\d{2}):(\d{2,3})$/.exec(value);
  filmAssert(m, 'Use non-drop HH:MM:SS:FF timecode');
  const [h, minutes, seconds, frames] = m.slice(1).map(Number), fps = Math.round(rate.numerator / rate.denominator);
  const result = ((h * 60 + minutes) * 60 + seconds) * fps + frames;
  filmAssert(minutes < 60 && seconds < 60 && frames < fps && Number.isSafeInteger(result), 'Invalid timecode');
  return result;
}
export function stepFrame(doc: FilmDocument, frame: number, delta: number): number {
  filmAssert(Number.isSafeInteger(frame) && Number.isSafeInteger(delta), 'Invalid frame step');
  return Math.max(0, Math.min(filmDuration(doc), frame + delta));
}
/** Stable tie-break toward the earlier boundary. Tolerance is supplied by UI pixels/zoom. */
export function snapFrame(doc: FilmDocument, frame: number, tolerance: number, options: { excludeIds?: readonly string[]; playhead?: number; points?:readonly number[] } = {}): { frame: number; snapped: boolean } {
  filmAssert(Number.isSafeInteger(frame) && Number.isSafeInteger(tolerance) && tolerance >= 0, 'Invalid snap request');
  const exclude = new Set(options.excludeIds ?? []);
  const points = [0, ...doc.markers.map(m => m.at), ...(options.points??[]).filter(at=>Number.isSafeInteger(at)&&at>=0)];
  if (options.playhead !== undefined) { filmAssert(Number.isSafeInteger(options.playhead) && options.playhead >= 0, 'Invalid playhead'); points.push(options.playhead); }
  for (const t of doc.tracks) for (const c of t.kind === 'media' ? t.clips : t.cues) if (!exclude.has(c.id)) points.push(c.at, clipEnd(c));
  points.sort((a, b) => Math.abs(a - frame) - Math.abs(b - frame) || a - b);
  return Math.abs(points[0] - frame) <= tolerance ? { frame: points[0], snapped: true } : { frame, snapped: false };
}
