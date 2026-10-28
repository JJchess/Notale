'use client';
import {useEffect,useRef,useSyncExternalStore} from 'react';
import {PageList,type PageListAdapter} from '../components/page-list';
import {filmSurfaceActions} from './surface-state';
import {filmUIState} from './ui-state';
import {PropertyAnimationContext} from '../components/property-animation';
import {useEditorSelector} from '../state/use-editor-selector';
import {formatPanelState,chooseFormatTab} from '../state/format-panel';
import type {FormatScope,FormatTab} from '../state/format-tabs';
import {FilmInlineKey} from './inline-key';
import {useI18n} from '../i18n/react';
import {Layers} from '../components/layers';
import {AnimationHeading} from '../components/animation-controls';
import {AnimationGallery} from '../components/animation-gallery';
import {FilmAnimationControls} from './animation-controls';
export function FilmWorkspace(){const t=useI18n();
 return <>
   <section className="film-viewer film-ui" aria-label={t("画布视口")}><nav className="film-edit-path" data-role="edit-path" aria-label={t('编辑层级')} hidden/><div className="film-preview-area"><div className="film-picture" data-role="picture"/><div className="film-source-host" data-role="source-preview-host" hidden/></div><div className="film-transport" data-film-host="transport"/></section>
   <footer className="film-status" role="status" data-role="status"/>
  <input data-role="file" type="file" hidden/>
 </>;
}
export function FilmTimeline(){const t=useI18n();return <section className="film-timeline film-ui" aria-label={t("时间线")} data-film-host="timeline"/>;}
const emptyPages:PageListAdapter={documentId:'',pages:[],activePageId:'',select(){},mountThumbnail(){}};
export function FilmPageNavigation(){const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot);return <PageList adapter={state.pages??emptyPages}/>;}
export function FilmMediaSources(){return <div className="film-media-sources film-ui" data-film-host="library"/>;}
export function FilmClipInspector(){const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot);return <div className="film-clip-properties film-ui" data-film-host="inspector" hidden={!state.clipInspectorVisible}/>;}
export function FilmNativeProperties({children}:{children:React.ReactNode}){
 const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot),kind=useEditorSelector(state=>state.inspector.kind);
 const chosen=useSyncExternalStore(formatPanelState.subscribe,formatPanelState.getSnapshot,formatPanelState.getServerSnapshot),last=useRef(''),choices=useRef(new Map<string,{scope:FormatScope;tab:FormatTab}>());
 useEffect(()=>{if(state.inspectorKind!=='native')return;if(last.current!==kind){last.current=kind;const next=choices.current.get(kind)??(kind==='text'?{scope:'text' as const,tab:'font' as const}:['equation','code','image','video','audio','chart','table','diagram','vector','canvas'].includes(kind)?{scope:'object' as const,tab:'special' as const}:{scope:'object' as const,tab:'fill' as const});chooseFormatTab(next.scope,next.tab);}else choices.current.set(kind,{scope:chosen.scope,tab:chosen.tab});},[state.inspectorKind,kind,chosen.scope,chosen.tab]);
 return <PropertyAnimationContext.Provider value={FilmInlineKey}><div hidden={state.inspectorKind!=='native'}>{children}</div></PropertyAnimationContext.Provider>;
}
export function FilmLayers(){const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot);return <><div hidden={state.inspectorKind==='motale'||state.inspectorKind==='source'}><Layers/></div><div className="film-ui film-scene-layers" data-role="scene-layers" hidden={state.inspectorKind!=='motale'}/></>;}
export function FilmAnimation(){const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot);return <><div hidden={state.inspectorKind==='motale'||state.inspectorKind==='source'}><FilmAnimationControls/></div><div className="film-ui" data-role="scene-animation" hidden={state.inspectorKind!=='motale'}/></>;}
export function FilmCommand({name,children}:{name:string;children:React.ReactNode}){const t=useI18n();return <button type="button" data-film-command={name} aria-label={t(({ 'stage-settings':'影片设置',layout:'视图设置',fullscreen:'预览全屏'} as Record<string,string>)[name]??'')} title={t(({ 'stage-settings':'影片设置',layout:'视图设置',fullscreen:'预览全屏'} as Record<string,string>)[name]??'')} onClick={()=>filmSurfaceActions.run(name)}>{typeof children==='string'?t(children):children}</button>;}
export function FilmImports(){return <><FilmCommand name="media-upload">导入文件</FilmCommand><FilmCommand name="media-folder">导入目录</FilmCommand><FilmCommand name="lecture-import">导入讲义页</FilmCommand><FilmCommand name="open">打开影片文件</FilmCommand><FilmCommand name="html-open">导入网页影片</FilmCommand></>;}
export function FilmExports(){return <><FilmCommand name="export">导出视频与图像</FilmCommand><FilmCommand name="download">下载工作副本</FilmCommand><FilmCommand name="html-download">导出 film.html</FilmCommand></>;}
export function FilmViewControls(){return <div className="header-history film-header-tools"><FilmCommand name="stage-settings"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 2v5m10-5v5M7 17v5m10-5v5M1 9h4m14 0h4M1 15h4m14 0h4"/></svg></FilmCommand><FilmCommand name="layout"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M8 15h13"/></svg></FilmCommand><FilmCommand name="fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/></svg></FilmCommand></div>;}

export function FilmAnimationTools(){const state=useSyncExternalStore(filmUIState.subscribe,filmUIState.getSnapshot,filmUIState.getServerSnapshot);return <div hidden={state.inspectorKind==='motale'||state.inspectorKind==='source'}><AnimationHeading/><AnimationGallery/></div>;}
