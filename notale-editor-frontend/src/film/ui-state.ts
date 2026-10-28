import type {PageListAdapter} from '../components/page-list';

/** View-only projections. Authoring state and history remain in the editor session. */
export type FilmUIState={pages?:PageListAdapter;clipInspectorVisible:boolean;inspectorKind:'clip'|'native'|'motale'|'other'|'source';contentEditing:boolean};
const initial:FilmUIState={clipInspectorVisible:true,inspectorKind:'other',contentEditing:false};
let current=initial;
const listeners=new Set<()=>void>();
export const filmUIState={
 getSnapshot:()=>current,
 getServerSnapshot:()=>initial,
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 update(patch:Partial<FilmUIState>){current={...current,...patch};listeners.forEach(listener=>listener());},
 reset(){current=initial;listeners.forEach(listener=>listener());},
};
