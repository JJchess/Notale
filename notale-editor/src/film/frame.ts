import {clipSourceTime,clipPlaybackRate,sourceIntervals} from './timing.js';
import {filmGain,clipFadeGain} from './audio.js';
import {clipMasks} from './masks.js';
import {clipObjects,filmObjectLocks} from './objects.js';
import { clipAppearance } from './appearance.js';
import { type FilmDocument, type FilmSource, type FilmCue, filmAssert, frameSeconds, clipEnd, filmDuration } from '@notale/format/film';
export interface FilmLayer {
  trackId: string; clipId: string; source: FilmSource; sourceTime: number;
  masks:ReturnType<typeof clipMasks>;
  objectStyles: ReturnType<typeof clipObjects>; objectLocks:string[];
  appearance: ReturnType<typeof clipAppearance>;
  playbackRate:number;transition?:{kind:import('@notale/format/film').FilmTransition['kind'];progress:number;incoming:boolean};
  preservePitch:boolean;
  color?:import('@notale/format/film').FilmColor;
  audioEffects?:import('@notale/format/film').FilmAudioEffects;
  openfilm?:import('@notale/format/film').FilmInterchangeClip;
  gain:number;
  localTime: number; duration: number; muted: boolean;
}
export interface FilmFrame {
  time: number; duration: number; ended: boolean;
  /** First track is topmost, matching the document and OpenFilm paint order. */
  layers: FilmLayer[];
  subtitles: { trackId: string; language: string; cue: FilmCue; style?:import('@notale/format/film').FilmSubtitleStyle }[];
}
/** Pure shared composition plan for preview/export. Fractional t is accepted for
 * supersampling; never advances state or asks a source to play its own clock. */
export function filmFrame(doc: FilmDocument, t: number, languages?: readonly string[]): FilmFrame {
  filmAssert(Number.isFinite(t) && t >= 0, 'Invalid composition time');
  const duration = frameSeconds(filmDuration(doc), doc.frameRate), sources = new Map(doc.sources.map(s => [s.id, s]));
  const frame: FilmFrame = { time: t, duration, ended: t >= duration, layers: [], subtitles: [] };
  const active = (c: { at: number; duration: number }) => t >= frameSeconds(c.at, doc.frameRate) && t < frameSeconds(clipEnd(c), doc.frameRate);
  for (const track of doc.tracks) {
    if (track.hidden) continue;
    if (track.kind === 'subtitle') {
      if (languages && !languages.includes(track.language)) continue;
      for (const cue of track.cues) if (active(cue)) frame.subtitles.push({ trackId: track.id, language: track.language, style:track.style, cue: { ...cue } });
    } else {
      const at=t*doc.frameRate.numerator/doc.frameRate.denominator;
      const ordered=[...track.clips].sort((a,b)=>a.at-b.at);
      const transitions=new Map<string,NonNullable<FilmLayer['transition']>>();
      for(let i=1;i<ordered.length;i++){const right=ordered[i],tr=right.transitionIn;if(!tr)continue;const from=right.at-tr.duration/2,to=right.at+tr.duration/2;if(at<from||at>=to)continue;const progress=(at-from)/tr.duration;transitions.set(right.id,{kind:tr.kind,progress,incoming:true});transitions.set(ordered[i-1].id,{kind:tr.kind,progress,incoming:false});}
      // Incoming clips composite above the outgoing clip within their shared track.
      for (const clip of [...ordered].reverse()) if(active(clip)||transitions.has(clip.id)) {
        const source=sources.get(clip.sourceId);filmAssert(source,`Missing source: ${clip.sourceId}`);const localTime=t-frameSeconds(clip.at,doc.frameRate),localFrame=at-clip.at,transition=transitions.get(clip.id);
        const mapped=clipSourceTime(clip,localFrame,doc.frameRate),sourceTime=Math.max(0,Math.min(source.duration===undefined?Infinity:Math.max(0,source.duration-1e-7),mapped));
        const appearance=clipAppearance(clip,localFrame);if(clip.fade)appearance.opacity=Number(appearance.opacity??1)*clipFadeGain(clip,localFrame);if(transition){if(transition.kind==='dissolve'&&transition.incoming)appearance.opacity=Number(appearance.opacity??1)*transition.progress;if(transition.kind.startsWith('dip-'))appearance.opacity=Number(appearance.opacity??1)*(transition.incoming?(transition.progress>=.5?1:0):(transition.progress<.5?1:0));if(transition.kind==='push')appearance.x=Number(appearance.x??doc.width/2)+(transition.incoming?1-transition.progress:-transition.progress)*doc.width;}
        frame.layers.push({trackId:track.id,clipId:clip.id,source:structuredClone(clip.overlayHtml===undefined?source:{...source,html:clip.overlayHtml}),sourceTime,playbackRate:clipPlaybackRate(clip,localFrame,doc.frameRate),preservePitch:!clip.timing?.map?.length,transition,
          openfilm:clip.openfilm,audioEffects:clip.audio?.effects,color:clip.color,masks:clipMasks(clip,localFrame),objectStyles:clipObjects(clip,localFrame),objectLocks:filmObjectLocks(clip.objects),appearance,
          gain:(track.muted?0:filmGain(doc,clip,at))*(transition?(transition.kind.startsWith('dip-')?Math.max(0,transition.incoming?2*transition.progress-1:1-2*transition.progress):transition.incoming?transition.progress:1-transition.progress):1),localTime,duration:frameSeconds(clip.duration,doc.frameRate),muted:track.muted});
      }
    }
  }
  return frame;
}
/** Teaching/act markers only appear where the trimmed source is actually visible. */
export function clipMarkers(doc: FilmDocument, clipId: string): { id: string; title: string; at: number }[] {
  for (const t of doc.tracks) if (t.kind === 'media') {
    const c = t.clips.find(c => c.id === clipId); if (!c) continue;
    const s = doc.sources.find(s => s.id === c.sourceId);
    return (s?.markers??[]).flatMap(m=>sourceIntervals(c,m.time,m.time+1e-6,doc.frameRate).map((range,i)=>({id:`${c.id}:${m.id}${i?`:${i}`:''}`,title:m.title,at:c.at+range.from})));
  }
  return [];
}
export interface MotaleShell {
  seek(time: number): void; pause(): void;
  state(): { time: number; playing: boolean; activeBranch: string; parameters: unknown };
}
/** Adapter does not overlay/capture pointer events. A new viewer branch pauses the
 * host clock via a returned signal, so continuing host seeks cannot erase a drag. */
export class MotaleTransport {
  private branch: string;
  private takenOver = false;
  constructor(private shell: MotaleShell) { this.branch = shell.state().activeBranch; shell.pause(); }
  frame(time: number): 'rendered' | 'viewer-takeover' {
    filmAssert(Number.isFinite(time) && time >= 0, 'Invalid source time');
    const state = this.shell.state();
    if (state.activeBranch !== this.branch) this.takenOver = true;
    if (this.takenOver) { this.shell.pause(); return 'viewer-takeover'; }
    this.shell.pause(); this.shell.seek(time); return 'rendered';
  }
  /** Explicit resume/seek from the editor after takeover. Never reset branch data. */
  resume(time: number) { filmAssert(Number.isFinite(time) && time >= 0, 'Invalid source time'); this.takenOver = false; this.branch = this.shell.state().activeBranch; this.shell.pause(); this.shell.seek(time); }
}
