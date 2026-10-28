import { type FilmDocument, type FilmRate, emptyFilm, filmAssert, parseFilmDocument, secondsFrame } from '@notale/format/film';
/** Ingest an acts.json value, never fetch or mutate the source here. Source paths are
 * resolved by the host so fixture/asset ownership stays outside the timeline reducer. */
export function importMotaleActs(value: unknown, options: { id: string; sourceId: string; uri: string; rate?: FilmRate }): FilmDocument {
  filmAssert(!!value && typeof value === 'object', 'Invalid Motale acts manifest');
  const manifest = value as { title?: unknown; acts?: unknown };
  filmAssert(typeof manifest.title === 'string' && Array.isArray(manifest.acts) && manifest.acts.length > 0, 'Missing Motale title or acts');
  const acts: { id: string; title: string; start: number; end: number }[] = [];
  const ids = new Set<string>();
  for (const value of manifest.acts) {
    filmAssert(!!value && typeof value === 'object', 'Invalid Motale act');
    const a = value as Record<string, unknown>;
    filmAssert(typeof a.id === 'string' && a.id.length > 0 && !ids.has(a.id) && typeof a.title === 'string', 'Invalid or duplicate act identity');
    filmAssert(typeof a.start === 'number' && Number.isFinite(a.start) && a.start >= 0 && typeof a.end === 'number' && Number.isFinite(a.end) && a.end > a.start, 'Invalid Motale act interval');
    filmAssert(acts.length === 0 || acts[acts.length - 1].end <= a.start, 'Motale acts must be ordered and non-overlapping');
    ids.add(a.id); acts.push({ id: a.id, title: a.title, start: a.start, end: a.end });
  }
  const doc = emptyFilm(options.id, manifest.title, options.rate);
  const duration = acts[acts.length - 1].end;
  doc.sources.push({ id: options.sourceId, kind: 'motale', uri: options.uri, title: manifest.title, duration,
    width: 1280, height: 720, markers: acts.map(a => ({ id: a.id, time: a.start, end: a.end, title: a.title })) });
  let at = 0;
  doc.tracks = [{ id: `${options.id}:picture`, kind: 'media', title: '画面', locked: false, hidden: false, muted: false,
    clips: acts.map(a => {
      // Round down only when rounding to nearest would read beyond the act's end.
      const exact = (a.end - a.start) * doc.frameRate.numerator / doc.frameRate.denominator;
      const length = Math.floor(exact + 1e-8);
      filmAssert(length > 0, 'Motale act is shorter than one film frame');
      const clip = { id: `${options.id}:act:${a.id}`, sourceId: options.sourceId, title: a.title, at, duration: length, in: a.start };
      at += length; return clip;
    }) }];
  doc.markers = acts.map((a, i) => ({ id: `${options.id}:marker:${a.id}`, title: a.title,
    at: doc.tracks[0].kind === 'media' ? doc.tracks[0].clips[i].at : secondsFrame(a.start, doc.frameRate) }));
  return parseFilmDocument(doc);
}
