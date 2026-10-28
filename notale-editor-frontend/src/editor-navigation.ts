import {writeTimelinePreferences} from './film/timeline-preferences';
import {emptyFilm} from '@notale/editor/film';
import {filmApi,filmEnvelope} from './film/session';
import type {Snapshot} from '@notale/editor/browser';
let navigate:((id:string)=>Promise<void>)|undefined;
export function bindEditorNavigation(open:(id:string)=>Promise<void>){navigate=open;return()=>{if(navigate===open)navigate=undefined;};}
export async function openEditorDocument(id:string){if(!navigate)throw Error('编辑器正在载入');await navigate(id);}
export async function newEditorFilm(){const film={...emptyFilm(crypto.randomUUID()),frameRateMode:'auto' as const};const saved=await filmApi<Snapshot>('/api/documents',filmEnvelope(film));writeTimelinePreferences(saved.document.id+':',{magnet:true,follow:'main',linkage:true});await openEditorDocument(saved.document.id);}
