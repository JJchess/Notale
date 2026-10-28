/** The container version is independent of the editor author-document schema. */
export const NOTALE_FORMAT = {format:'notale',formatVersion:1,entry:'index.html'} as const;
export interface NotaleEnvelope<T> {format:'notale';formatVersion:1;entry:'index.html';document:T;}
export function isNotaleEnvelope(value: unknown): value is NotaleEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Record<string, unknown>;
  return envelope.format === NOTALE_FORMAT.format && envelope.formatVersion === NOTALE_FORMAT.formatVersion && envelope.entry === NOTALE_FORMAT.entry && !!envelope.document && typeof envelope.document === 'object';
}
export function notaleFilename(title: string): string {
  return (title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,120) || 'Notale')+'.notale';
}
/** A Motale film as one file (Motale's docs/MOTALE-FORMAT.md): the film as delivered, a manifest of every file with its sha256,
 * and optionally author data (author.json) and viewer versions (versions.json), each named in acts.json. */
export const MOTALE_FORMAT = {format:'motale',formatVersion:1,entry:'index.html'} as const;
export const MOTALE_MANIFEST = 'motale-project.json';
export interface MotaleEnvelope {format:'motale';formatVersion:1;entry:'index.html';film:{id:string;title:string;cut:number;cover?:string;bridge:string};files:Record<string,{hash:string;size:number;mime:string}>;}
export function isMotaleEnvelope(value: unknown): value is MotaleEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Record<string, unknown>;
  return envelope.format === MOTALE_FORMAT.format && envelope.formatVersion === MOTALE_FORMAT.formatVersion && envelope.entry === MOTALE_FORMAT.entry
    && !!envelope.film && typeof envelope.film === 'object' && !!envelope.files && typeof envelope.files === 'object' && !Array.isArray(envelope.files);
}
export function motaleFilename(title: string): string {
  return (title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,120) || 'Motale')+'.motale';
}
export interface PageRuntime {
  version: 1;
  kind: 'slide' | 'code-workbench';
  nativeStepMax: number;
  /** Authored iframe paths; execution state never belongs to the author document. */
  workbenches: {target:string;entry:string;lesson?:import('./code-lesson.js').CodeLessonDescriptor}[];
}
export function pageRuntime(nativeStepMax: number, workbenches: PageRuntime['workbenches']): PageRuntime {
  return {version:1,kind:workbenches.length?'code-workbench':'slide',nativeStepMax,workbenches};
}
export { CODE_RUNTIME_VERSION, CODE_FILES, codeResourcePath, codeRevision, discoverCodeLessons } from './code-lesson.js';
export type { CodeFile, CodeSources, CodeLessonDescriptor } from './code-lesson.js';
