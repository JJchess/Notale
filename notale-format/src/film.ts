import {validFilmColorValue,validFilmSubtitleStyle,type FilmSubtitleStyle} from './film-presentation.js';
import {validFilmFonts,validFilmCaptions,type FilmFont,type FilmSourceCaption} from './film-media.js';
import {validFilmMotaleAuthor,type FilmMotaleAuthor} from './film-motale.js';
export * from './film-motale.js';
export * from './film-media.js';
export * from './film-presentation.js';
import {validFilmInterchange,validFilmTrackAttrs,type FilmInterchangeClip} from './film-openfilm.js';
export * from './film-openfilm.js';
import {validFilmColor,type FilmColor} from './film-color.js';
export * from './film-color.js';
import {validFilmTiming,validFilmTransition,type FilmTiming,type FilmTransition} from './film-timing.js';
export * from './film-timing.js';
import {validFilmAudio,validFilmWords,type FilmAudio,type FilmWord} from './film-audio.js';
export * from './film-audio.js';
import {validFilmMasks,type FilmMask} from './film-masks.js';
export * from './film-masks.js';
import {validFilmObjects,type FilmObjects} from './film-objects.js';
export * from './film-objects.js';
import { validFilmAppearance, type FilmAppearance } from './film-appearance.js';
export * from './film-appearance.js';
/** Additive film document format. Persistence uses an additive film envelope in the shared document API.
 * Edit positions are integer frames; source time is seconds. Half-open intervals [at,end).
 * Rational frame rates preserve exact frame stepping at 24000/1001 and 30000/1001. */
export interface FilmRate { numerator: number; denominator: number }
export interface FilmFingerprint {sha256:string;bytes:number;relativePath?:string;kind?:'file'|'bundle'}
export interface FilmRhythm {version:1;fingerprint:string;duration:number;onsets:number[];beats:number[];bpm?:number;confidence:number}
export interface FilmMarker { id: string; at: number; title: string }
export interface FilmSource {
  fingerprint?:FilmFingerprint;
  frameRate?:FilmRate;
  rhythm?:FilmRhythm;
  bin?:string;
  captions?:FilmSourceCaption[];
  /** Inline, versioned nested sequence; parent instances share this author copy. */
  sequence?:FilmDocument;
  words?:FilmWord[];
  id: string;
  kind: 'motale' | 'lecture' | 'openfilm' | 'video' | 'image' | 'audio' | 'overlay' | 'sequence';
  /** Authored Notale overlay fragment. Runtime scripts are supplied by the host. */
  html?: string;
  title: string;
  uri: string;
  /** Finite source bound in seconds; omit only for still images / indefinite pages. */
  duration?: number;
  width?: number;
  height?: number;
  /** Teaching steps / acts in source seconds, retained when a clip is trimmed. */
  markers?: { id: string; time: number; end?: number; title: string }[];
}
export interface FilmClip {
  /** Independent Motale author copy, with keyframes in source-act seconds. */
  motale?:FilmMotaleAuthor;
  linkGroup?:string;
  openfilm?:FilmInterchangeClip;
  fade?:{in:number;out:number;span:number;start?:number};
  color?:FilmColor;
  timing?:FilmTiming;transitionIn?:FilmTransition;
  audio?:FilmAudio;
  masks?: FilmMask[];
  objects?: FilmObjects;
  /** Per-clip author copy: editing one instance never changes another. */
  overlayHtml?: string;
  appearance?: FilmAppearance;
  /** Bias into the authored animation frame clock; trim/split preserve curves. */
  animationOffset?: number;
  id: string;
  sourceId: string;
  title: string;
  at: number;
  duration: number;
  in: number;
}
export interface FilmCue {
  /** Word highlight positions relative to the cue start, in seconds. */
  words?:FilmWord[];
  id: string;
  at: number;
  duration: number;
  /** WebVTT cue payload; render as text or sanitized cue nodes, never innerHTML. */
  text: string;
  settings?: string;
  vttId?: string;
}
interface TrackBase { openfilmAttrs?:Record<string,string>; id: string; title: string; locked: boolean; hidden: boolean; muted: boolean }
export interface FilmMediaTrack extends TrackBase { kind: 'media'; clips: FilmClip[] }
export interface FilmSubtitleTrack extends TrackBase {
  kind: 'subtitle'; language: string; cues: FilmCue[]; style?:FilmSubtitleStyle;
  wordSourceId?:string;wordGroupSize?:number;
  /** Linked sidecar projection. Editing a cue detaches the entire track. */
  sourceClipId?:string;sourceCaptionId?:string;
  /** Preserve WebVTT metadata blocks (NOTE / STYLE / REGION) during interchange. */
  vttBlocks?: string[];
  vttHeader?: string;
}
export type FilmTrack = FilmMediaTrack | FilmSubtitleTrack;
export interface FilmDocument {
  /** Missing on legacy projects: their existing grid is always kept. */
  frameRateMode?:'auto'|'manual';
  fonts?:FilmFont[];
  openfilm?:{html:string;baseUrl:string};
  kind: 'film'; schemaVersion: 1; id: string; title: string;
  width: number; height: number; frameRate: FilmRate; background?:string;
  sources: FilmSource[]; tracks: FilmTrack[]; markers: FilmMarker[];
}
export class FilmError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'FilmError'; }
}
export function filmAssert(value: unknown, message: string, code = 'INVALID_FILM'): asserts value {
  if (!value) throw new FilmError(code, message);
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, minimum = 0): v is number => Number.isSafeInteger(v) && (v as number) >= minimum;
const text = (v: unknown): v is string => typeof v === 'string';
const identifier = (v: unknown): v is string => text(v) && v.length > 0 && v.length <= 256 && !/[\u0000-\u001f\r\n]/.test(v);
export function assertFilmRate(rate: unknown): asserts rate is FilmRate {
  filmAssert(record(rate) && integer(rate.numerator, 1) && integer(rate.denominator, 1), 'Invalid frame rate');
  filmAssert(rate.numerator / rate.denominator >= 1 && rate.numerator / rate.denominator <= 240, 'Frame rate must be 1–240 fps');
}
export function frameSeconds(frame: number, rate: FilmRate): number {
  return frame * rate.denominator / rate.numerator;
}
export function secondsFrame(seconds: number, rate: FilmRate): number {
  return Math.round(seconds * rate.numerator / rate.denominator);
}
export const clipEnd = (clip: Pick<FilmClip, 'at' | 'duration'>) => clip.at + clip.duration;
export function filmDuration(doc: FilmDocument): number {
  return Math.max(0, ...doc.tracks.flatMap(t => (t.kind === 'media' ? t.clips : t.cues).map(clipEnd)));
}
export function emptyFilm(id: string, title = '未命名影片', frameRate: FilmRate = { numerator: 30, denominator: 1 }): FilmDocument {
  const doc: FilmDocument = { kind: 'film', schemaVersion: 1, id, title, width: 1280, height: 720,
    frameRate, sources: [], tracks: [{ id: 'v1', title: '画面', kind: 'media', locked: false, hidden: false, muted: false, clips: [] }], markers: [] };
  return parseFilmDocument(doc);
}
/** Validate at the document boundary, including references and cross-clip invariants.
 * Returns a detached document; callers can draft without mutating an input revision. */
export function parseFilmDocument(value: unknown,depth=0,ancestors=new Set<unknown>()): FilmDocument {
  filmAssert(record(value), 'Film must be an object');
  filmAssert(depth<=8&&!ancestors.has(value),'Nested sequence is cyclic or exceeds eight levels');
  const lineage=new Set(ancestors);lineage.add(value);
  filmAssert(value.kind === 'film' && value.schemaVersion === 1, 'Unsupported film schema');
  filmAssert(identifier(value.id) && text(value.title), 'Invalid film identity');
  filmAssert(integer(value.width, 1) && integer(value.height, 1), 'Invalid stage dimensions');
  filmAssert(value.background===undefined||validFilmColorValue(value.background),'Invalid stage background');
  assertFilmRate(value.frameRate);
  filmAssert(value.frameRateMode===undefined||value.frameRateMode==='auto'||value.frameRateMode==='manual','Invalid automatic frame rate policy');
  filmAssert(value.fonts===undefined||validFilmFonts(value.fonts),'Invalid project fonts');
  filmAssert(value.openfilm===undefined||record(value.openfilm)&&text(value.openfilm.html)&&value.openfilm.html.length<=5_000_000&&text(value.openfilm.baseUrl),'Invalid film.html metadata');
  filmAssert(Array.isArray(value.sources) && Array.isArray(value.tracks) && Array.isArray(value.markers), 'Missing film collections');
  const ids = new Set<string>();
  const id = (v: unknown) => { filmAssert(identifier(v) && !ids.has(v), `Invalid or duplicate id: ${String(v)}`); ids.add(v); };
  const sources = new Map<string, FilmSource>();
  for (const s of value.sources) {
    filmAssert(record(s), 'Invalid source'); id(s.id);
    if(s.frameRate!==undefined)assertFilmRate(s.frameRate);
    if(s.fingerprint!==undefined){const f=s.fingerprint;filmAssert(record(f)&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&integer(f.bytes)&& (f.kind===undefined||f.kind==='file'||f.kind==='bundle')&&(f.relativePath===undefined||typeof f.relativePath==='string'&&f.relativePath.length<=4096&&!/[\u0000-\u001f]/.test(f.relativePath)),'Invalid resource fingerprint');}
    if(s.rhythm!==undefined){
      const r=s.rhythm;filmAssert(record(r)&&r.version===1&&typeof r.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(r.fingerprint)&&finite(r.duration)&&r.duration>0&&finite(r.confidence)&&r.confidence>=0&&r.confidence<=1&&(r.bpm===undefined||finite(r.bpm)&&r.bpm>=30&&r.bpm<=300),'Invalid rhythm analysis');
      const duration=r.duration;for(const name of ['onsets','beats']){const points=r[name];filmAssert(Array.isArray(points)&&points.length<=100_000&&points.every((at,i)=>finite(at)&&at>=0&&at<duration&&(i===0||at>points[i-1])),'Invalid rhythm timestamps');}
      filmAssert(s.fingerprint===undefined||r.fingerprint===(s.fingerprint as FilmFingerprint).sha256,'Rhythm analysis belongs to another resource');
    }
    filmAssert(s.bin===undefined||text(s.bin)&&s.bin.length<=256&&!/[\u0000-\u001f]/.test(s.bin),'Invalid source bin');
    filmAssert(s.captions===undefined||validFilmCaptions(s.captions),'Invalid source captions');
    filmAssert(['motale', 'lecture', 'openfilm', 'video', 'image', 'audio', 'overlay','sequence'].includes(String(s.kind)), 'Invalid source kind');
    if(s.kind==='sequence'){const nested=parseFilmDocument(s.sequence,depth+1,lineage);filmAssert(s.duration===frameSeconds(Math.max(1,filmDuration(nested)),nested.frameRate)&&s.width===nested.width&&s.height===nested.height,'Nested sequence metadata must match its document');}
    else filmAssert(s.sequence===undefined,'Only sequence sources may contain documents');
    filmAssert(s.words===undefined||validFilmWords(s.words),'Invalid source word timings');
    filmAssert(text(s.title) && text(s.uri) && s.uri.trim().length > 0, 'Invalid source metadata');
    filmAssert(!/^(?:javascript|data|vbscript):/i.test(s.uri.trim()), 'Source URI must be a media path or URL');
    filmAssert(s.kind !== 'overlay' || text(s.html) && s.html.length > 0 && s.html.length <= 5_000_000, 'Invalid overlay HTML');
    filmAssert(s.duration === undefined || finite(s.duration) && s.duration > 0, 'Invalid source duration');
    filmAssert(!['motale', 'video', 'audio'].includes(String(s.kind)) || s.duration !== undefined, 'Source duration is required');
    for (const dim of ['width', 'height']) filmAssert(s[dim] === undefined || integer(s[dim], 1), 'Invalid source dimensions');
    if (s.markers !== undefined) {
      filmAssert(Array.isArray(s.markers), 'Invalid source markers');
      const markerIds = new Set<string>();
      for (const m of s.markers) {
        filmAssert(record(m) && identifier(m.id) && !markerIds.has(m.id) && finite(m.time) && m.time >= 0 && text(m.title), 'Invalid source marker');
        filmAssert(s.duration === undefined || m.time <= (s.duration as number), 'Source marker exceeds duration');
        filmAssert(m.end === undefined || finite(m.end) && m.end > m.time && (s.duration === undefined || m.end <= (s.duration as number)), 'Invalid source marker end');
        markerIds.add(m.id);
      }
    }
    sources.set(s.id as string, s as unknown as FilmSource);
  }
  for (const t of value.tracks) {
    filmAssert(record(t), 'Invalid track'); id(t.id);
    filmAssert(t.openfilmAttrs===undefined||validFilmTrackAttrs(t.openfilmAttrs),'Invalid track HTML attributes');
    filmAssert(text(t.title) && ['locked', 'hidden', 'muted'].every(k => typeof t[k] === 'boolean'), 'Invalid track metadata');
    filmAssert(t.kind === 'media' || t.kind === 'subtitle', 'Invalid track kind');
    const items = t.kind === 'media' ? t.clips : t.cues;
    filmAssert(Array.isArray(items), 'Invalid track items');
    if (t.kind === 'subtitle') {
      filmAssert(t.style===undefined||validFilmSubtitleStyle(t.style),'Invalid subtitle style');
      filmAssert(t.wordSourceId===undefined||sources.has(String(t.wordSourceId)),'Invalid word subtitle source');
      if(t.sourceClipId!==undefined||t.sourceCaptionId!==undefined){const clip=value.tracks.flatMap((row:any)=>row.kind==='media'?row.clips:[]).find((c:any)=>c.id===t.sourceClipId);filmAssert(identifier(t.sourceClipId)&&identifier(t.sourceCaptionId)&&clip&&sources.get(clip.sourceId)?.captions?.some(c=>c.id===t.sourceCaptionId)&&t.wordSourceId===undefined,'Invalid source subtitle binding');}
      filmAssert(t.wordGroupSize===undefined||integer(t.wordGroupSize,1)&&t.wordGroupSize<=30,'Invalid word subtitle grouping');
      filmAssert(text(t.language) && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(t.language), 'Invalid subtitle language');
      filmAssert(t.vttHeader === undefined || text(t.vttHeader) && !/[\r\n]/.test(t.vttHeader) && !t.vttHeader.includes('-->'), 'Invalid VTT header');
      filmAssert(t.vttBlocks === undefined || Array.isArray(t.vttBlocks) && t.vttBlocks.every(b => text(b) && /^(NOTE(?:[ \t\n]|$)|STYLE\n|REGION\n)/.test(b) && !/\n\s*\n/.test(b)), 'Invalid VTT blocks');
    }
    for (const c of items) {
      filmAssert(record(c), 'Invalid clip/cue'); id(c.id);
      filmAssert(integer(c.at) && integer(c.duration, 1) && integer(c.at + c.duration), 'Invalid frame interval');
      if (t.kind === 'media') {
        const s = sources.get(c.sourceId as string);
        filmAssert(c.linkGroup===undefined||identifier(c.linkGroup),'Invalid link group');
        filmAssert(c.openfilm===undefined||validFilmInterchange(c.openfilm),'Invalid film.html clip metadata');
        filmAssert(c.fade===undefined||record(c.fade)&&finite(c.fade.in)&&c.fade.in>=0&&finite(c.fade.out)&&c.fade.out>=0&&finite(c.fade.span)&&(c.fade.start===undefined||finite(c.fade.start))&&c.fade.span>(c.fade.start??0),'Invalid clip fades');
        filmAssert(c.timing===undefined||validFilmTiming(c.timing),'Invalid time mapping');
        filmAssert(c.transitionIn===undefined||validFilmTransition(c.transitionIn),'Invalid transition');
        filmAssert(c.audio===undefined||validFilmAudio(c.audio),'Invalid audio settings');
        filmAssert(c.masks === undefined || validFilmMasks(c.masks), 'Invalid mask stack');
        filmAssert(c.color===undefined||validFilmColor(c.color)&&['video','image'].includes(s?.kind??''),'Color grading requires valid image/video settings');
        filmAssert(c.appearance === undefined || validFilmAppearance(c.appearance), 'Invalid film appearance/keyframes');
        filmAssert(c.animationOffset === undefined || Number.isSafeInteger(c.animationOffset), 'Invalid animation offset');
        filmAssert(s && text(c.title) && finite(c.in) && c.in >= 0, 'Invalid clip source');
        filmAssert(c.overlayHtml === undefined || s.kind === 'overlay' && text(c.overlayHtml) && c.overlayHtml.length > 0 && c.overlayHtml.length <= 5_000_000, 'Invalid clip overlay HTML');
        filmAssert(c.objects === undefined || s.kind === 'overlay' && validFilmObjects(c.objects), 'Invalid overlay object properties');
        filmAssert(c.motale === undefined || s.kind === 'motale' && validFilmMotaleAuthor(c.motale), 'Invalid Motale author document');
        const timing=c.timing as FilmTiming|undefined;
        if(timing?.map)filmAssert(timing.map.every(k=>s.duration===undefined||k.value<=s.duration),'Time map exceeds source duration','SOURCE_BOUNDS');
        else if(timing?.rate!==undefined&&timing.rate!==1){const last=c.in+frameSeconds(c.duration-1,value.frameRate)*timing.rate;filmAssert(Math.min(c.in,last)>=-1e-8&&(s.duration===undefined||Math.max(c.in,last)<s.duration+1e-8),'Rate exceeds source duration','SOURCE_BOUNDS');}
        else filmAssert(s.duration === undefined || c.in + frameSeconds(c.duration, value.frameRate) <= s.duration + 1e-8, 'Clip exceeds source duration', 'SOURCE_BOUNDS');
      } else {
        filmAssert(c.words===undefined||validFilmWords(c.words),'Invalid cue word timings');
        filmAssert(text(c.text) && c.text.length > 0 && !/\r|\n\s*\n|-->/.test(c.text), 'Invalid subtitle payload');
        filmAssert(c.vttId === undefined || text(c.vttId) && c.vttId.length > 0 && !/[\r\n]/.test(c.vttId) && !c.vttId.includes('-->'), 'Invalid VTT cue identifier');
        filmAssert(c.settings === undefined || text(c.settings) && !/[\r\n]/.test(c.settings) && !c.settings.includes('-->'), 'Invalid cue settings');
      }
    }
    if (t.kind === 'media') {
      const ordered = [...items].sort((a, b) => a.at - b.at);
      for (let i = 1; i < ordered.length; i++) filmAssert(clipEnd(ordered[i - 1]) <= ordered[i].at, 'Clips overlap on one track', 'OVERLAP');
      for(let i=0;i<ordered.length;i++){const c=ordered[i] as unknown as FilmClip;if(!c.transitionIn)continue;const left=ordered[i-1] as unknown as FilmClip|undefined;filmAssert(left&&clipEnd(left)===c.at&&c.transitionIn.duration<=Math.min(left.duration,c.duration),'Transition requires adjacent clips with sufficient duration');}
    }
  }
  for (const m of value.markers) {
    filmAssert(record(m), 'Invalid marker'); id(m.id);
    filmAssert(integer(m.at) && text(m.title), 'Invalid marker position');
  }
  return structuredClone(value) as unknown as FilmDocument;
}
