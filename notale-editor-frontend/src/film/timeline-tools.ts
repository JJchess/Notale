import { type FilmDocument, filmAssert, clipEnd, filmDuration, planFilmTimeline, type FilmTimelinePreferences, type FilmCommand } from '@notale/editor/film';
import {TIMELINE_GUTTER, TIMELINE_END_PADDING} from './timeline-view.js';

export type TimelineTool = 'select' | 'ripple' | 'roll' | 'slip' | 'slide';
export type ClipEdge = 'in' | 'out';
export function timelineItem(doc: FilmDocument, id: string | undefined) {
  for (const track of doc.tracks) {
    if (track.kind === 'media') {
      const item = track.clips.find(c => c.id === id);
      if (item) return { kind: 'media' as const, track, item };
    } else {
      const item = track.cues.find(c => c.id === id);
      if (item) return { kind: 'subtitle' as const, track, item };
    }
  }
}
/** Plan the whole gesture against its starting revision. Pointer motion never
 * incrementally mutates a clip, and releasing it submits one command batch. */
export function gestureCommands(doc: FilmDocument, id: string, delta: number, options: {
  edge?: ClipEdge; tool: TimelineTool; ripple: boolean; sync: boolean; destination?: string;preferences?:FilmTimelinePreferences;ids?:string[];
}): FilmCommand[] {
  const found = timelineItem(doc, id);
  filmAssert(found, '片段不存在'); filmAssert(!found.track.locked, '轨道已锁定');
  filmAssert(Number.isSafeInteger(delta), '修剪量必须是整数帧');
  const { item, track } = found, { edge, tool } = options;
  if(options.preferences&&!edge&&(tool==='select'||tool==='ripple'))return planFilmTimeline(doc,{type:'move',ids:options.ids?.length?options.ids:[id],anchorId:id,delta,destination:options.destination},options.preferences).commands;
  if(options.preferences&&found.kind==='media'){
    if(edge&&tool==='roll'){
      const neighbor=found.track.clips.find(c=>edge==='in'?clipEnd(c)===item.at:c.at===clipEnd(item));filmAssert(neighbor,'滚动修剪需要相邻片段');
      return planFilmTimeline(doc,{type:'roll',leftId:edge==='in'?neighbor.id:id,rightId:edge==='in'?id:neighbor.id,delta},options.preferences).commands;
    }
    if(edge)return planFilmTimeline(doc,{type:'trim',clipId:id,edge,delta,ripple:options.ripple||tool==='ripple'},options.preferences).commands;
    if(tool==='slip'||tool==='slide')return planFilmTimeline(doc,{type:tool,clipId:id,delta},options.preferences).commands;
    return planFilmTimeline(doc,{type:'move',ids:options.ids?.length?options.ids:[id],anchorId:id,delta,destination:options.destination},options.preferences).commands;
  }
  if (found.kind === 'subtitle') {
    const cue = { ...found.item };
    if (edge === 'in') { cue.at += delta; cue.duration -= delta; }
    else if (edge === 'out') cue.duration += delta;
    else cue.at += delta;
    return [{ type: 'film.cue.put', trackId: track.id, cue }];
  }
  if (edge) {
    if (tool === 'roll') {
      const neighbor = found.track.clips.find(c => edge === 'in' ? clipEnd(c) === item.at : c.at === clipEnd(item));
      filmAssert(neighbor, '滚动修剪需要相邻片段');
      return [{ type: 'film.clip.roll', leftId: edge === 'in' ? neighbor.id : id, rightId: edge === 'in' ? id : neighbor.id, delta }];
    }
    return [{ type: 'film.clip.trim', clipId: id, edge, delta, ripple: options.ripple || tool === 'ripple', sync: options.sync }];
  }
  if (tool === 'slip' || tool === 'slide') return [{ type: tool === 'slip' ? 'film.clip.slip' : 'film.clip.slide', clipId: id, delta }];
  return [{ type: 'film.clip.move', clipId: id, trackId: options.destination ?? track.id, at: item.at + delta }];
}
export function deleteRangeCommand(doc: FilmDocument, from: number | undefined, to: number | undefined, trackIds: ReadonlySet<string>, ripple: boolean, cutId: string): FilmCommand {
  filmAssert(from !== undefined && to !== undefined && Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to > from && to <= filmDuration(doc), '区间须在影片内，且出点大于入点');
  const ids = doc.tracks.filter(t => trackIds.has(t.id)).map(t => { filmAssert(!t.locked, '区间包含锁定轨道'); return t.id; });
  filmAssert(ids.length > 0, '请选择要编辑的轨道');
  return { type: 'film.range.delete', trackIds: ids, from, to, ripple, cutId };
}
export function fitZoom(frames: number, viewport: number): number {
  return Math.max(0.002, Math.min(6, (viewport - TIMELINE_GUTTER - TIMELINE_END_PADDING) / Math.max(1, frames)));
}
