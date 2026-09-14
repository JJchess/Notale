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
export interface PageRuntime {
  version: 1;
  kind: 'slide' | 'code-workbench';
  nativeStepMax: number;
  /** Authored iframe paths; execution state never belongs to the author document. */
  workbenches: {target:string;entry:string}[];
}
export function pageRuntime(nativeStepMax: number, workbenches: PageRuntime['workbenches']): PageRuntime {
  return {version:1,kind:workbenches.length?'code-workbench':'slide',nativeStepMax,workbenches};
}
