import { type FilmDocument, type FilmClip, filmAssert, clipEnd } from '@notale/format/film';
/** Source seconds stay exact; the timeline uses whole frames and never reads
 * beyond the selected source out-point after quantization. */
export function sourceClip(doc: FilmDocument, options: {
  id: string; sourceId: string; trackId: string; from: number; to: number;
  position: number | 'append'; title?: string;
}): FilmClip {
  const source = doc.sources.find(s => s.id === options.sourceId);
  const track = doc.tracks.find(t => t.id === options.trackId);
  filmAssert(source, '请选择素材');
  filmAssert(track?.kind === 'media', '请选择画面/声音轨道'); filmAssert(!track.locked, '目标轨道已锁定');
  filmAssert(Number.isFinite(options.from) && Number.isFinite(options.to) && options.from >= 0 && options.to > options.from, '素材出点须大于入点');
  filmAssert(source.duration === undefined || options.to <= source.duration + 1e-8, '选区超出素材时长');
  const duration = Math.floor((options.to - options.from) * doc.frameRate.numerator / doc.frameRate.denominator + 1e-8);
  filmAssert(duration >= 1, '素材选区不足一帧');
  const at = options.position === 'append' ? Math.max(0, ...track.clips.map(clipEnd)) : options.position;
  filmAssert(Number.isSafeInteger(at) && at >= 0, '片段位置须是非负整数帧');
  return { id: options.id, sourceId: source.id, title: options.title ?? source.title, in: options.from, at, duration };
}
export function adjacentTime(points: readonly number[], time: number, direction: -1 | 1): number | undefined {
  const candidates = points.filter(p => direction === -1 ? p < time : p > time);
  if (!candidates.length) return undefined;
  return direction === -1 ? Math.max(...candidates) : Math.min(...candidates);
}
