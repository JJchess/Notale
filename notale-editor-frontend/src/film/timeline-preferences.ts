import type {FilmTimelinePreferences} from '@notale/editor/film';

interface PreferenceStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const memory=new Map<string,FilmTimelinePreferences>();
const key=(scope:string)=>'notale-film-timeline-v1:'+scope;
function storage():PreferenceStorage|undefined {try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}}
function valid(value:unknown):value is FilmTimelinePreferences {
 if(!value||typeof value!=='object')return false;const v=value as FilmTimelinePreferences;
 return typeof v.magnet==='boolean'&&typeof v.linkage==='boolean'&&['current','main','all'].includes(v.follow)&&(v.mainTrackId===undefined||typeof v.mainTrackId==='string'&&v.mainTrackId.length>0&&v.mainTrackId.length<=256);
}
/** Scope is document ID + sequence path. Existing documents keep their previous editing mode. */
export function readTimelinePreferences(scope:string,options:{newProject?:boolean;legacySync?:boolean;legacyLinkage?:boolean}={},store:PreferenceStorage|undefined=storage()):FilmTimelinePreferences {
 let current:unknown;try{const raw=store?.getItem(key(scope));if(raw)current=JSON.parse(raw);}catch{}
 if(!valid(current))current=memory.get(scope);
 if(!valid(current))current={magnet:!!options.newProject,follow:options.newProject?'main':options.legacySync===false?'current':'all',linkage:options.legacyLinkage!==false} satisfies FilmTimelinePreferences;
 return writeTimelinePreferences(scope,current as FilmTimelinePreferences,store);
}
export function writeTimelinePreferences(scope:string,value:FilmTimelinePreferences,store:PreferenceStorage|undefined=storage()):FilmTimelinePreferences {
 if(!valid(value))throw Error('无效的时间线选项');const next:FilmTimelinePreferences={magnet:value.magnet,follow:value.follow,linkage:value.linkage,...(value.mainTrackId?{mainTrackId:value.mainTrackId}:{})};memory.set(scope,next);try{store?.setItem(key(scope),JSON.stringify(next));}catch{}return {...next};
}
