import {MotaleContentEditor} from './motale-content';
import {clipPropertiesPanel} from './clip-properties';
import {inspectorView,inspectorSection} from './inspector-view';
import {filmContextMenu,filmMenuItems,filmEditEntries,filmObjectEntries} from './context-menu';
import type {ObjectMenuItem} from '../state/object-menu';
import {additiveSelection,ClickSelection} from './selection-modifiers';
import './timeline-follow.css';
import {prepareFirstVideoRate,videoFrameRate} from './first-video-rate';
import {readTimelinePreferences,writeTimelinePreferences} from './timeline-preferences';
import {planFilmTimeline,mainFilmTrack,type FilmTimelineEdit,type FilmTimelinePreferences} from '@notale/editor/film';
import {relinkSource} from './source-relink';
import {analyzeRhythm,rhythmTicks,rhythmSnapPoints} from './rhythm';
import {localeStore,translateUi as filmText} from '../i18n/store';
import {TIMELINE_GUTTER, TIMELINE_END_PADDING, timelineX, timelineFrame, timelineKind, trackHeight, rulerTicks, zoomScroll} from './timeline-view';
import {FilmStoryboard} from './storyboard.js';
import {filmUIState} from './ui-state';
import {mountFilmAuthoring} from './authoring';
import {motaleStructure,motaleStructureKey,type MotaleStructureAction} from './motale-structure';
import {motaleInspector} from './motale-inspector';
import {motaleKeyFrames} from './motale-keyframes';
import {motaleOcclusionPanel} from './motale-occlusion-panel';
import {scopeInspector} from './scope-inspector';
import {filmAuthorCommands} from './authoring-commands';
import {filmInsertionReason,insertionDuration,nativeInsertPlan,navigationTrack} from './insert';
import {bindInsertActions} from '../state/insert-actions';
import {bindInsertionDrop} from '../state/insertion-drop';
import {bindTemplateLibrary} from '../state/template-library';
import {TEMPLATE_CATALOG_BASE} from '../template-catalog';
import type {Entry as TemplateEntry} from '../template-library';
import {keyframeTracks} from './keyframe-tracks.js';
import {bindEditorSession,editorActions as publicEditorActions} from '../state/editor-session.js';
import {scopeActions} from '../state/action-scope.js';
import {sizeValue} from '../state/document-settings.js';
import {sidebar} from '../state/sidebar.js';
import {openEditorDocument} from '../editor-navigation.js';
import {filmSurfaceActions} from './surface-state.js';
import {mountFilmPanels} from './panels.js';
import {cropCommands,cropPresetCommands,type CropRatio} from './crop-handles.js';
import {clipThumbnailStrip} from './video-thumbnails.js';
import {stageArrange} from './stage-arrange.js';
import {timelineTransition} from './timeline-transition';
import {filmAuthoringActions} from './authoring-state';
import {timelineFades} from './timeline-fades.js';
import {importLecture} from './lecture-import.js';
import {filmLayout} from './layout.js';
import {pageTemplate} from './page-template.js';
import {openFilmProjects} from './project-library.js';
import {showFilmHistory} from './history.js';
import {filmLibrary,libraryDialog} from './local-library.js';
import {sourceProperties} from './source-properties.js';
import {importMediaFiles,mediaJson} from './media-import.js';
import {audioMeters} from './audio-meters.js';
import {stageSettings,subtitleStyles} from './presentation.js';
import {sourceMonitor} from './source-monitor.js';
import {copyFilmSelection,pasteFilmSelection,pasteAttributesDialog,type FilmClipboard} from './clipboard.js';
import {sourceIntervals,linkedFilmIds} from '@notale/editor/film';
import {selectorInspector} from './selector-inspector.js';
import {openFilmFile} from './html-import.js';
import {exportOpenFilmHtml} from '@notale/editor/film';
import {overlayStructure} from './overlay-structure.js';
import {colorInspector} from './color-inspector.js';
import {showFilmExport} from './export-dialog.js';
import {mountMediaLibrary} from './media-library';
import {importFilmPackage} from './package-import';
import {sequenceAt,clipSourceTime} from '@notale/editor/film';
import {timingInspector} from './timing-inspector.js';
import {audioInspector} from './audio-inspector.js';
import {waveformCanvas} from './audio-engine.js';
import {FilmSession,filmApi} from './session.js';
import {maskInspector} from './mask-inspector.js';
import {cleanOverlayHtml} from './overlay-page.js';
import { emptyFilm, parseFilmDocument, filmDuration, frameSeconds, secondsFrame, clipEnd, type FilmDocument, type FilmClip, type FilmMediaTrack, type FilmSubtitleTrack, type FilmSource, type FilmProperty, type FilmMaskProperty, applyFilmCommands, type FilmCommand, importMotaleActs, importVtt, exportVtt, timecode, stepFrame, snapFrame, sourceClip, adjacentTime } from '@notale/editor/film';
import { FilmPreview } from './preview.js';
import { timelineItem, gestureCommands, deleteRangeCommand, fitZoom, type ClipEdge, type TimelineTool } from './timeline-tools.js';

const icons: Record<string, string> = {
  play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  back: '<path d="M6 5v14m13-14-10 7 10 7Z"/>', next: '<path d="M18 5v14M5 5l10 7-10 7Z"/>',
  split: '<path d="M12 3v18M3 7h6v10H3zm12 0h6v10h-6"/>',
  remove: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  edit: '<path d="m4 4 7 16 2-7 7-2Z"/>', 'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  audio: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  overlay: '<path d="m12 3 10 6-10 6L2 9Zm-9 10 9 6 9-6M3 17l9 5 9-5"/>',
  scene: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-13-5 3 5m3-5 3 5"/>',
  subtitle: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 12h5m4 0h5M5 16h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0M12 14v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="m3 3 18 18M9 5a13 13 0 0 1 13 7 19 19 0 0 1-4 4M6 6a22 22 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4Zm12 0 6 6m0-6-6 6"/>',
  diamond: '<path d="m12 3 9 9-9 9-9-9Z"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  fit: '<path d="M3 9V4h5m8 0h5v5M3 15v5h5m8 0h5v-5M8 12h8"/>',
  mark: '<path d="M6 21V3h13l-3 4 3 4H6"/>', magnet: '<path d="M5 4v9a7 7 0 0 0 14 0V4h-4v9a3 3 0 0 1-6 0V4ZM5 8h4m6 0h4"/>',
};
const svg = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const button = (action: string, label: string, icon: string) => `<button type="button" data-action="${action}" title="${label}" aria-label="${label}">${svg(icon)}</button>`;
const uid = () => crypto.randomUUID();
function download(name: string, text: string, type: string) {
  const uri = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = uri; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(uri), 1000);
}
/** Shared mounting entry for the Next film route and the isolated worktree preview. */
export function mountFilmWorkbench(root: HTMLElement, options: { documentId:string; sampleLibrary?: boolean }) {
  let doc = emptyFilm(uid()), selected: string | undefined, position = 0, playing = false, dirty = false;
  const expandedAnimations=new Set<string>();
  const soloTracks=new Set<string>();
  let clipboard:FilmClipboard|undefined,copiedAttributes:FilmClip|undefined,linkage=true,loop=false;const trackViews=new Map<string,{height:number;collapsed:boolean}>();
  let rootDocument=doc,sequencePath:string[]=[];const selectedIds=new Set<string>(),timelineClicks=new ClickSelection();let shuttle=1,holdK=false;
  let session:FilmSession|undefined;let sessionSerial=0;
  let authorReady=false;
  let disposed = false, raf = 0, last = performance.now(), carry = 0, needsResume = false;
  let loading = false, loadSerial = 0, editSerial = 0, snap = true, zoom = 1.5, fit = true;
  let activeTrack = doc.tracks[0]?.id, activeMarker: string | undefined, selectedSource: string | undefined;
  let rangeIn: number | undefined, rangeOut: number | undefined;
  let rangeTracks = new Set(doc.tracks.map(t => t.id));
  let gestureDraft: FilmDocument | undefined, cancelGesture: (() => void) | undefined;
  let canvasSelectionActive=false,rhythmVisible=true,rhythmSnap=true;
  let timelinePrefs:FilmTimelinePreferences={magnet:false,follow:'all',linkage:true};
  let overlayEditing=false,clipEditing=false,maskEditing=false,cropEditing=false;
  let cropRatio:CropRatio;
  let maskId:string|undefined,maskProperty:FilmMaskProperty='width',maskPanel:ReturnType<typeof maskInspector>|undefined;
  let objectIds:string[]=[],objectClip:string|undefined,editingDomain:'objects'|'clips'='clips';
  let authoring:ReturnType<typeof mountFilmAuthoring>|undefined;
  let authorDraft:FilmDocument|undefined;
  let contentOwner:string|undefined,sourceView:ReturnType<typeof sourceMonitor>|undefined,sourceViewTitle='';
  let propertiesPanel:ReturnType<typeof clipPropertiesPanel>|undefined;
  const sequenceViews=new Map<string,{position:number;selected?:string;ids:string[];zoom:number;fit:boolean;left:number;top:number}>();
  let motalePanel:ReturnType<typeof motaleInspector>|undefined,motaleEditing=false;
  const motaleSelection=new Map<string,string[]>();
  const motaleActs=new Map<string,{id:string;start:number;end:number}[]>();
  let mediaLibrary:ReturnType<typeof mountMediaLibrary>|undefined;
  let navTrackId:string|undefined,lastNavPage='';
  let pendingText:{clipId:string;target:string}|undefined;
  let appearanceProperty: FilmProperty = 'x';
  let timingPanel:ReturnType<typeof timingInspector>|undefined;
  let audioPanel:ReturnType<typeof audioInspector>|undefined;
  let colorPanel:ReturnType<typeof colorInspector>|undefined,finalScopes:ReturnType<typeof scopeInspector>|undefined;
  let colorScopeMode:'source'|'final'='source';
  let previewLanguages: string[] | undefined;
  const abort = new AbortController(), { signal } = abort;
  const cleanup:(()=>void)[]=[];
  try {
  const shell=bindEditorSession(signal),shellActions=scopeActions(publicEditorActions,signal);
  const surfaceActions=scopeActions(filmSurfaceActions,signal);
  const clearPanels = mountFilmPanels(root,button);cleanup.push(clearPanels);
  const saveStatus=(label:string)=>shell.update({save:{label:label.startsWith('已保存')?'已保存':label,detail:label,state:label.startsWith('已保存')?'saved':label.includes('失败')||label==='尚未保存'?'failed':'busy'}});
  const refreshCatalogue=()=>filmApi<{id:string;title:string}[]>('/api/documents').then(documents=>{if(!disposed)shell.update({documents});}).catch(error=>{if(!disposed)shell.update({catalogueNotice:String(error)});});
  const el = <T extends HTMLElement>(role: string) => root.querySelector<T>(`[data-role="${role}"]`)!;
  const propertyView=inspectorView(root.querySelector<HTMLElement>('#property-panel')!);
  cleanup.push(()=>sourceView?.close(),()=>propertiesPanel?.dispose(),()=>motalePanel?.dispose());
  let statusMessage='';
  const report = (message: string) => { statusMessage=message;el('status').textContent = filmText(message); };
  const preview = new FilmPreview(el('picture'), report, () => { playing = false; report('观众已接手；点击播放可从当前剪辑位置继续。'); updateTransport(); }, () => { playing = false; updateTransport(); },(clipId,html)=>execute([{type:'film.overlay.set',clipId,html}]),undefined,execute);
  cleanup.push(()=>preview.dispose());
  const motaleSelectionKey=(clipId:string,actId=preview.motaleContext(clipId)?.act.id)=>JSON.stringify([clipId,actId]);
  const selectedMotaleObjects=(clipId:string)=>motaleSelection.get(motaleSelectionKey(clipId))??[];
  const content=new MotaleContentEditor(el('picture'),{
    read:()=>{const clip=current(),context=selected?preview.motaleContext(selected):undefined;if(!clip||!context||!motaleEditing||playing||loading||disposed)return;
      const source=doc.sources.find(source=>source.id===clip.sourceId);return {clipId:clip.id,scope:JSON.stringify([rootDocument.id,sequencePath,clip.sourceId,source?.uri,position]),context,ids:selectedMotaleObjects(clip.id),author:clip.motale,locked:!!selectedTrack()?.locked};},
    commit:(clipId,author)=>execute([{type:'film.motale.author',clipId,author}]),
    history:async action=>{preview.cancelMotaleGesture();preview.cancelCanvasSelection();playing=false;await session?.[action]();},
    save:async()=>{await session?.save();},
    bounds:id=>selected?preview.motaleObjectBounds(selected,id):undefined,
    focus:()=>{if(selected)preview.focusMotaleSelection(selected);},report,
  });cleanup.push(()=>content.dispose());
  let contentDown:{id:string;clipId:string;pointer:number;x:number;y:number;moved:boolean}|undefined,lastContentClick:{id:string;clipId:string;x:number;y:number;at:number}|undefined;
  root.addEventListener('pointerdown',event=>{
    if(!motaleEditing||playing||event.button!==0||additiveSelection(event)||!selected||selectedTrack()?.locked)return;
    const target=event.target as Element;if(!target.closest('.film-picture')||target.closest('input,textarea,select,button,.film-content-inline'))return;
    const hit=preview.menuTarget({x:event.clientX,y:event.clientY});if(hit?.context.domain!=='motale'||!hit.id)return;
    contentDown={id:hit.id,clipId:selected,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  },{capture:true,signal});
  window.addEventListener('pointermove',event=>{if(contentDown?.pointer===event.pointerId&&Math.hypot(event.clientX-contentDown.x,event.clientY-contentDown.y)>=3)contentDown.moved=true;},{capture:true,signal});
  window.addEventListener('pointerup',event=>{
    const down=contentDown;contentDown=undefined;if(!down||down.pointer!==event.pointerId||down.moved){lastContentClick=undefined;return;}
    const previous=lastContentClick;lastContentClick={...down,at:performance.now()};
    if(!previous||previous.id!==down.id||previous.clipId!==down.clipId||performance.now()-previous.at>500||Math.hypot(previous.x-down.x,previous.y-down.y)>4)return;
    lastContentClick=undefined;queueMicrotask(()=>{if(disposed||selected!==down.clipId||playing||!motaleEditing)return;preview.cancelMotaleGesture();selectMotaleObjects(down.clipId,[down.id]);motalePanel?.refresh(true);content.open(down.id);});
  },{capture:true,signal});
  window.addEventListener('pointercancel',()=>{contentDown=undefined;lastContentClick=undefined;},{signal});
  function selectMotaleObjects(clipId:string,ids:string[],actId?:string){
    if(!content.finish())return;
    const key=motaleSelectionKey(clipId,actId),next=[...new Set(ids)];
    if(next.length)motaleSelection.set(key,next);else motaleSelection.delete(key);
    preview.selectMotaleObjects(clipId,next);
  }
  function clearContent(){
    if(!content.finish())return;
    preview.cancelMotaleGesture();preview.cancelCanvasSelection();preview.setMotaleAuthorMode();
    contentOwner=undefined;motaleEditing=overlayEditing=clipEditing=maskEditing=cropEditing=false;
    objectIds=[];objectClip=undefined;editingDomain='clips';
  }
  function returnToClip(){
    sourceView?.close();clearContent();syncSelection();updateTransport();
    if(selected)root.querySelector<HTMLElement>(`.film-clip[data-clip-id="${CSS.escape(selected)}"] .film-clip-body`)?.focus({preventScroll:true});
  }
  function updateEditPath(){
    const path=el('edit-path'),label=sourceView?sourceViewTitle:contentOwner?current()?.title:sequencePath.length?doc.title:undefined;
    const signature=JSON.stringify([sequencePath,contentOwner,!!sourceView,label]);if(path.dataset.scope===signature)return;path.dataset.scope=signature;
    path.replaceChildren();path.hidden=!label;if(!label)return;
    const back=document.createElement('button');back.type='button';back.title=filmText(sourceView?'返回成片':contentOwner?'返回片段':'返回上一级序列');back.setAttribute('aria-label',back.title);back.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>';
    back.onclick=()=>{if(sourceView)sourceView.close();else if(contentOwner)returnToClip();else showSequence(sequencePath.slice(0,-1));};
    const parent=document.createElement('span');parent.textContent=filmText(sourceView?'素材预览':contentOwner?'内容编辑':'序列');
    const title=document.createElement('span');title.className='film-edit-path-title';title.textContent=label;path.append(back,parent,title);
  }
  function openSourcePreview(source:FilmSource,clip?:FilmClip){
    sourceView?.close();playing=false;preview.pause();
    const focus=document.activeElement as HTMLElement|null,host=el('source-preview-host'),picture=el('picture'),transport=root.querySelector<HTMLElement>('.film-transport')!,savedFrame=position,scope=JSON.stringify([rootDocument.id,sequencePath]);
    const from=clip?clip.in:Number(el<HTMLInputElement>('source-in').value),to=clip?Math.min(source.duration??Infinity,Math.max(clip.in,clipSourceTime(clip,clip.duration-1,doc.frameRate))+frameSeconds(1,doc.frameRate)):Number(el<HTMLInputElement>('source-out').value);
    selectedSource=source.id;mediaLibrary?.select([source.id]);renderLibrary();
    picture.hidden=transport.hidden=true;host.hidden=false;sourceViewTitle=source.title;
    sourceView=sourceMonitor(host,source,doc.frameRate,Math.min(from,to),Math.max(to,from+frameSeconds(1,doc.frameRate)),(a,b)=>{if(JSON.stringify([rootDocument.id,sequencePath])!==scope)return;el<HTMLInputElement>('source-in').value=String(a);el<HTMLInputElement>('source-out').value=String(b);},{time:clip?clipSourceTime(clip,Math.max(0,Math.min(clip.duration-1,position-clip.at)),doc.frameRate):from,close:()=>{
      sourceView=undefined;host.hidden=true;picture.hidden=transport.hidden=false;
      if(!disposed&&JSON.stringify([rootDocument.id,sequencePath])===scope){position=savedFrame;playing=false;needsResume=true;syncSelection();updateTransport();if(focus?.isConnected)focus.focus({preventScroll:true});}
    }});filmUIState.update({clipInspectorVisible:false,inspectorKind:'source'});updateEditPath();
  }
  function enterClip(id:string){
    const found=timelineItem(doc,id);if(!found)return;sourceView?.close();
    const source=found.kind==='media'?doc.sources.find(source=>source.id===found.item.sourceId):undefined;
    if(source?.kind==='sequence'){showSequence([...sequencePath,source.id]);return;}
    if(source&&!['motale','overlay'].includes(source.kind)&&found.kind==='media'){openSourcePreview(source,found.item);return;}
    clearContent();playing=false;preview.pause();selected=id;selectedIds.clear();selectedIds.add(id);
    if(position<found.item.at||position>=clipEnd(found.item))seek(found.item.at);
    if(source?.kind==='motale'){contentOwner=id;motaleEditing=true;preview.setMotaleAuthorMode(id);}
    else if(source?.kind==='overlay'){contentOwner=id;overlayEditing=true;editingDomain='objects';objectClip=id;}
    syncSelection();sidebar.inspect('format');updateTransport();el('picture').tabIndex=-1;el('picture').focus({preventScroll:true});
    if(found.kind==='subtitle')el('caption').focus({preventScroll:true});
  }
  function seekMotaleSource(clip:FilmClip,sourceTime:number){
    const candidates=motaleKeyFrames(clip,doc.frameRate,sourceTime,position-clip.at);
    if(!candidates.length){report('该源时刻不在此片段的时间映射范围内');return;}
    const closest=candidates.reduce((a,b)=>Math.abs(a-(position-clip.at))<=Math.abs(b-(position-clip.at))?a:b);
    seek(clip.at+Math.max(0,Math.min(clip.duration-1,Math.round(closest))));
  }
  preview.bindMotaleAuthoring({
    scope:()=>JSON.stringify([rootDocument.id,sequencePath,editSerial,selected,position,selected?selectedMotaleObjects(selected):[],playing,loading]),
    commit:(clipId,author)=>{
      if(disposed||loading||playing||selected!==clipId||selectedIds.size!==1||!motaleEditing||selectedTrack()?.locked)return false;
      const context=preview.motaleContext(clipId);if(!context||context.error||context.bridge.mode()!=='author')return false;
      return execute([{type:'film.motale.author',clipId,author}]);
    },
  });
  preview.bindCanvasSelection({context:()=>{if(loading||playing||cropEditing||maskEditing||pendingText)return;return {domain:motaleEditing?'motale':editingDomain==='objects'?'overlay':'clips',clipId:selected,ids:motaleEditing&&selected?selectedMotaleObjects(selected):editingDomain==='objects'?objectIds:[...selectedIds],scope:JSON.stringify([rootDocument.id,sequencePath,editSerial,position,selected,[...selectedIds],objectIds,motaleEditing])};},select:(context,ids)=>{if(context.domain==='motale'&&context.clipId){selectMotaleObjects(context.clipId,ids);motalePanel?.refresh(true);}else if(context.domain==='overlay'&&context.clipId)chooseObjects(context.clipId,ids,false);else{canvasSelectionActive=true;objectIds=[];objectClip=undefined;editingDomain='clips';clipEditing=ids.length>0;selectedIds.clear();ids.forEach(id=>selectedIds.add(id));selected=ids[0];syncSelection();}}});
  const layout=filmLayout(root,signal);
  const storyboard=new FilmStoryboard();cleanup.push(()=>storyboard.dispose());
  const meters=audioMeters(preview),meterPanel=document.createElement('details'),meterToggle=document.createElement('summary');meterPanel.className='film-meter-panel';meterToggle.innerHTML=svg('volume');meterToggle.title=filmText('音量表');meterToggle.setAttribute('aria-label',filmText('音量表'));meterPanel.append(meterToggle,meters.node);root.querySelector('.film-transport')!.append(meterPanel);
  const occlusion=motaleOcclusionPanel(warning=>{
    const found=timelineItem(doc,warning.clipId);if(!found)return;
    preview.cancelMotaleGesture();preview.cancelCanvasSelection();playing=false;preview.pause();
    objectIds=[];objectClip=undefined;editingDomain='clips';activeMarker=undefined;
    selectedIds.clear();selectedIds.add(warning.clipId);selected=warning.clipId;activeTrack=found.track.id;
    syncSelection();sidebar.inspect('format');updateTransport();
  });
  root.querySelector('.film-transport')!.append(occlusion.node);preview.bindOcclusion(occlusion.update);
  cleanup.push(()=>occlusion.dispose());signal.addEventListener('abort',()=>occlusion.dispose(),{once:true});
  const current = () => doc.tracks.flatMap(t => t.kind === 'media' ? t.clips : []).find(c => c.id === selected);
  const selectedItem = () => timelineItem(doc, selected);
  const selectedTrack = () => doc.tracks.find(t => t.kind === 'media' && t.clips.some(c => c.id === selected)) as FilmMediaTrack | undefined;
  const structureActions=motaleStructure({
    context:()=>selected?preview.motaleContext(selected):undefined,author:()=>current()?.motale,
    selected:()=>selected?selectedMotaleObjects(selected):[],scope:()=>JSON.stringify([rootDocument.id,sequencePath,editSerial,selected,position]),
    locked:()=>loading||!!cancelGesture||!!selectedTrack()?.locked,editing:()=>motaleEditing&&!playing&&selectedIds.size===1,
    commit:author=>selected?execute([{type:'film.motale.author',clipId:selected,author}]):false,
    select:ids=>{if(selected)selectMotaleObjects(selected,ids);},report,
  });
  const menuScope=()=>JSON.stringify([rootDocument.id,sequencePath,editSerial,position,playing,loading,!!cancelGesture,selected,[...selectedIds],objectIds,motaleEditing,selected?selectedMotaleObjects(selected):[],selectedSource,mediaLibrary?.selected()]);
  const contextMenu=filmContextMenu({scope:menuScope,report,signal});
  const timelineActionIds=new Set(filmEditEntries.map(entry=>entry.id));
  function actionReason(name:string):string|undefined {
    if(!timelineActionIds.has(name))return;
    if(loading||cancelGesture)return '请先完成当前操作';
    if(playing&&!['copy','copy-attributes'].includes(name))return '请先暂停播放';
    const items=[...selectedIds].map(id=>timelineItem(doc,id)).filter(item=>!!item),clips=items.filter(item=>item.kind==='media');
    if(['copy','cut','delete','duplicate-selection','nest','link','unlink','copy-attributes','paste-attributes','clip-animation','clip-timing','detach'].includes(name)&&!items.length)return '请选择片段';
    if(['clip-animation','clip-timing','detach','copy-attributes'].includes(name)&&(!current()||selectedIds.size!==1))return '请选择一个画面或声音片段';
    if(['cut','delete','duplicate-selection','nest','link','unlink','detach','paste-attributes'].includes(name)&&items.some(item=>item.track.locked))return '选区包含锁定轨道';
    if(name==='paste')return !clipboard?.tracks.length?'请先复制片段':doc.tracks.find(track=>track.id===activeTrack)?.locked?'目标轨道已锁定':undefined;
    if(name==='paste-attributes')return !copiedAttributes?'请先复制片段属性':!clips.length?'请选择画面或声音片段':undefined;
    if(name==='link'&&clips.length<2)return '请选择至少两个画面或声音片段';
    if(name==='unlink'&&!clips.some(item=>item.kind==='media'&&item.item.linkGroup))return '所选片段没有链接';
    if(name==='detach'&&doc.sources.find(source=>source.id===current()?.sourceId)?.kind!=='video')return '请选择视频片段';
    if(name==='split'){
      const candidates=items.length?items:doc.tracks.filter(track=>!track.locked).flatMap(track=>track.kind==='media'?track.clips.map(clip=>timelineItem(doc,clip.id)!):[]);
      if(candidates.some(item=>item.track.locked))return '选区包含锁定轨道';
      if(!candidates.some(item=>item.kind==='media'&&position>item.item.at&&position<clipEnd(item.item)))return '播放头须位于片段内部';
    }
    if(['close-gap','close-gaps'].includes(name)&&timelinePrefs.follow!=='all'&&(!activeTrack||doc.tracks.find(track=>track.id===activeTrack)?.locked))return '请选择未锁定轨道';
    if(name==='rhythm-analyze'&&!doc.sources.some(source=>source.id===(current()?.sourceId??selectedSource)&&['audio','video'].includes(source.kind)))return '请选择音频或视频素材';
    if(['rhythm-visible','rhythm-snap'].includes(name)&&!doc.sources.some(source=>source.rhythm))return '请先识别节拍';
  }
  function refreshActionButtons(){
    for(const node of root.querySelectorAll<HTMLButtonElement>('button[data-action]')){
      const entry=filmEditEntries.find(entry=>entry.id===node.dataset.action);if(!entry)continue;
      const why=actionReason(entry.id);node.disabled=!!why;node.title=filmText(entry.label)+(entry.shortcut?' · '+entry.shortcut:'')+(why?' · '+filmText(why):'');
    }
  }
  function timelineMenu(blank=false){
    const names=blank?['paste','close-gap','close-gaps','select-before','select-after']:['copy','cut','paste','duplicate-selection','delete','split','copy-attributes','paste-attributes','clip-animation','clip-timing'];
    const rows=filmMenuItems(filmEditEntries.filter(entry=>names.includes(entry.id)).map(entry=>entry.id==='delete'&&el<HTMLInputElement>('ripple').checked?{...entry,label:'波纹删除'}:entry),actionReason,action);
    if(!blank){
      for(const [label,ids] of [['链接与序列',['link','unlink','detach','nest']],['节拍',['rhythm-analyze','rhythm-visible','rhythm-snap']],['空隙与选择',['close-gap','close-gaps','select-before','select-after']]] as const){
        rows.push({label,children:filmMenuItems(filmEditEntries.filter(entry=>(ids as readonly string[]).includes(entry.id)),actionReason,action)});
      }
    }
    return rows;
  }
  const focusTimeline=()=>{const node=selected?root.querySelector<HTMLElement>(`.film-clip[data-clip-id="${CSS.escape(selected)}"] .film-clip-body`):undefined;const target=node??root.querySelector<HTMLElement>('.film-timeline')!;if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});};
  const focusCanvas=()=>{el('picture').focus({preventScroll:true});if(selected&&editingDomain==='objects')preview.sendAuthor(selected,'focus');};
  function objectMenu(domain:'objects'|'motale'){
    const entries=domain==='motale'&&!preview.motaleContext(selected??'')?.act.structure?filmObjectEntries.filter(entry=>entry.id==='properties'):filmObjectEntries;
    const reason=(id:string)=>id==='properties'?undefined:loading||cancelGesture||playing?'请先暂停播放并完成当前操作':domain==='motale'?structureActions.reason(id==='delete'?'remove':id as MotaleStructureAction):authoring?.reason(id)??(!authoring?'对象尚未就绪':undefined);
    const run=(id:string)=>{if(id==='properties'){sidebar.inspect('format');return;}if(domain==='motale'){structureActions.run(id==='delete'?'remove':id as MotaleStructureAction);motalePanel?.refresh(true);return;}return authoring?.action(id);};
    const rows=filmMenuItems(entries,reason,run);
    if(domain==='objects')rows.push({label:'排列',children:filmMenuItems([{id:'front',label:'置于顶层'},{id:'forward',label:'上移一层'},{id:'backward',label:'下移一层'},{id:'back',label:'置于底层'}],reason,run)});
    return rows;
  }
  function menuSelectClip(id?:string,trackId?:string){
    canvasSelectionActive=false;objectIds=[];objectClip=undefined;editingDomain='clips';activeMarker=undefined;
    if(id&&!selectedIds.has(id)){selectedIds.clear();selectedIds.add(id);}if(!id)selectedIds.clear();
    selected=id;if(trackId)activeTrack=trackId;syncSelection();timelineClicks.accept([...selectedIds]);
  }
  function openContext(event:MouseEvent|KeyboardEvent){
    if(event.defaultPrevented||loading||cancelGesture)return;
    const target=event.target instanceof Element?event.target:undefined;if(!target||target.closest('input:not([type="checkbox"]),textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="menu"]'))return;
    const keyboard=event instanceof KeyboardEvent,rect=target.getBoundingClientRect(),x=keyboard?rect.left+Math.min(24,rect.width/2):(event as MouseEvent).clientX,y=keyboard?rect.bottom:(event as MouseEvent).clientY;
    const show=(rows:ObjectMenuItem[],focus:()=>void,label:string)=>{event.preventDefault();event.stopPropagation();contextMenu.open(x,y,rows,focus,label);};
    if(target.closest('.film-timeline')){
      const item=target.closest<HTMLElement>('[data-clip-id]'),track=target.closest<HTMLElement>('[data-track-id]');
      const id=item?.dataset.clipId??(keyboard?selected:undefined);menuSelectClip(id,track?.dataset.trackId);
      show(timelineMenu(!id),focusTimeline,'时间线快捷菜单');return;
    }
    if(target.closest('.film-media-library')){
      const id=target.closest<HTMLElement>('.film-media-item')?.dataset.sourceId;
      if(id&&!mediaLibrary?.selected().includes(id))mediaLibrary?.select([id]);
      const ids=mediaLibrary?.selected()??[];selectedSource=ids.length===1?ids[0]:undefined;renderLibrary();
      const rows=id||keyboard?mediaLibrary?.menu()??[]:[{label:'导入文件…',run:()=>action('media-upload')},{label:'导入目录…',run:()=>action('media-folder')}];
      show(rows,()=>mediaLibrary?.focus(),'素材快捷菜单');return;
    }
    const object=target.closest<HTMLElement>('[data-motale-object]');
    if(object&&selected){const id=object.dataset.motaleObject!;if(!selectedMotaleObjects(selected).includes(id))selectMotaleObjects(selected,[id]);motalePanel?.refresh(true);show(objectMenu('motale'),()=>{const node=root.querySelector<HTMLElement>(`[data-motale-object="${CSS.escape(selectedMotaleObjects(selected??'')[0]??id)}"]`);(node??el('picture')).focus({preventScroll:true});},'场景对象快捷菜单');return;}
    if(target.closest('.film-picture,.film-viewer')){
      if(keyboard){show(motaleEditing?objectMenu('motale'):editingDomain==='objects'?objectMenu('objects'):timelineMenu(!selectedIds.size),focusCanvas,'画布快捷菜单');return;}
      const hit=preview.menuTarget({x,y});if(!hit)return;
      if(hit.context.domain==='clips'){menuSelectClip(hit.id??undefined);show(timelineMenu(!hit.id),focusCanvas,'片段快捷菜单');}
      else if(hit.context.domain==='motale'&&selected){if(!hit.id||!selectedMotaleObjects(selected).includes(hit.id))selectMotaleObjects(selected,hit.id?[hit.id]:[]);motalePanel?.refresh(true);show(objectMenu('motale'),focusCanvas,'场景对象快捷菜单');}
      else if(hit.context.domain==='overlay'&&hit.id===null){if(selected)chooseObjects(selected,[],false);show(objectMenu('objects'),focusCanvas,'对象快捷菜单');}
    }
  }
  function editingOptions() { return { tool: el<HTMLSelectElement>('tool').value as TimelineTool, ripple: el<HTMLInputElement>('ripple').checked, sync: timelinePrefs.follow==='all',preferences:{...timelinePrefs},ids:[...selectedIds] }; }
  function saveTimelinePrefs(){timelinePrefs=writeTimelinePreferences(doc.id+':'+sequencePath.join('/'),timelinePrefs);linkage=timelinePrefs.linkage;syncSelection();updateTransport();}
  function timelineEdit(edit:FilmTimelineEdit,prefs=timelinePrefs){try{const plan=planFilmTimeline(doc,edit,prefs);if(plan.commands.length&&!execute(plan.commands))return false;selectedIds.clear();plan.selectedIds.forEach(id=>selectedIds.add(id));selected=plan.selectedIds[0];syncSelection();return true;}catch(error){report(error instanceof Error?error.message:String(error));return false;}}
  async function relink(id:string,mode:'relink'|'replace'='relink'){const scope=JSON.stringify([rootDocument.id,sequencePath]);await relinkSource(root,{sourceId:id,mode,document:()=>doc,report,signal,execute:async commands=>{if(JSON.stringify([rootDocument.id,sequencePath])!==scope)throw Error('影片已切换，请重新选择素材');if(!execute(commands))return false;await session?.save();if(session?.unsaved)throw Error('保存尚未确认，请检查保存状态');return true;}});}
  function importSources(sources:FilmSource[]){const next=prepareFirstVideoRate(doc,sources);next.sources.push(...sources);return execute([{type:'film.document.restore',document:parseFilmDocument(next),expected:doc}]);}

  function seek(at: number) { if(!content.finish())return;sourceView?.close();preview.cancelMotaleGesture();preview.cancelCanvasSelection();preview.invalidateOcclusion();playing=false;preview.pause();position = Math.max(0, Math.min(filmDuration(doc), at)); carry = 0; needsResume = true; updateTransport(); }
  let rangePlayback = false;
  function updateTransport() {
    timingPanel?.refresh();audioPanel?.refresh();maskPanel?.refresh();propertiesPanel?.refresh();updateEditPath();
    if(!playing)authoring?.update();updateNavigationPosition();
    const clipEdit=root.querySelector<HTMLButtonElement>('[data-action="clip-edit"]');if(clipEdit)clipEdit.setAttribute('aria-pressed',String(clipEditing&&!playing));
    const length = filmDuration(doc), time = el<HTMLOutputElement>('time'); time.value = timecode(position, doc.frameRate);
    el('duration').textContent = `/ ${timecode(length, doc.frameRate)} · ${Number((doc.frameRate.numerator/doc.frameRate.denominator).toFixed(3))} fps`;
    if(playing&&shuttle!==1)el('duration').textContent+=` · ${shuttle}×`;
    const parent=root.querySelector<HTMLButtonElement>('[data-action="sequence-up"]');if(parent){parent.hidden=!sequencePath.length;parent.title=sequencePath.length?`返回 ${sequenceAt(rootDocument,sequencePath.slice(0,-1)).title}`:'返回主序列';}
    const seek = el<HTMLInputElement>('seek'); seek.max = String(length); seek.value = String(position);
    const play = root.querySelector<HTMLButtonElement>('[data-action="play"]')!; play.innerHTML = svg(playing ? 'pause' : 'play'); play.setAttribute('aria-pressed', String(playing));
    root.querySelector('[data-action="main-magnet"]')?.setAttribute('aria-pressed',String(timelinePrefs.magnet));
    root.querySelector('[data-action="snap"]')!.setAttribute('aria-pressed', String(snap));root.querySelector('[data-action="loop"]')!.setAttribute('aria-pressed',String(loop));
    positionPlayhead();refreshActionButtons();
  }
  function changeFrameGrid(next:FilmDocument){
    const scale=next.frameRate.numerator*doc.frameRate.denominator/(next.frameRate.denominator*doc.frameRate.numerator);
    if(scale===1)return;playing=false;preview.pause();carry=0;position=Math.round(position*scale);if(rangeIn!==undefined)rangeIn=Math.round(rangeIn*scale);if(rangeOut!==undefined)rangeOut=Math.round(rangeOut*scale);if(!fit)zoom/=scale;
  }
  function execute(commands: FilmCommand[]): boolean {
    if(!content.applying&&!content.finish())return false;
    if (loading || cancelGesture) { report('请先完成当前载入或拖动'); return false; }
    preview.cancelMotaleGesture();preview.cancelCanvasSelection();
    try {
      const next = applyFilmCommands(doc, commands);
      if (JSON.stringify(next) === JSON.stringify(doc)) return true;
      if(!session)throw Error('保存会话尚未就绪，请重试保存或下载工作副本');
      let rootCommands=commands,nested=next;
      for(let i=sequencePath.length-1;i>=0;i--){const command:FilmCommand={type:'film.sequence.update',sourceId:sequencePath[i],document:nested};if(i===0)rootCommands=[command];else nested=applyFilmCommands(sequenceAt(rootDocument,sequencePath.slice(0,i)),[command]);}
      rootDocument=sequencePath.length?applyFilmCommands(rootDocument,rootCommands):next;
      saveStatus('正在保存…');
      void session.execute(rootCommands).catch(e=>report(String(e)));
      changeFrameGrid(sequenceAt(rootDocument,sequencePath));doc = sequenceAt(rootDocument,sequencePath); dirty = true; editSerial++; needsResume = true; report(''); if(!content.applying)render(); return true;
    } catch (e) { report(e instanceof Error ? e.message : String(e)); return false; }
  }
  function syncSelection() {
    if(contentOwner&&contentOwner!==selected)clearContent();
    if(!selected)selectedIds.clear();else if(!selectedIds.has(selected)){selectedIds.clear();selectedIds.add(selected);}
    for(const id of selectedIds)if(!timelineItem(doc,id))selectedIds.delete(id);if(linkage&&!canvasSelectionActive&&!contentOwner)for(const id of linkedFilmIds(doc,selectedIds))selectedIds.add(id);
    let following=new Set<string>();if(!canvasSelectionActive&&editingDomain==='clips'&&selectedIds.size&&timelinePrefs.follow!=='current')try{following=new Set(planFilmTimeline(doc,{type:'remove',ids:[...selectedIds],ripple:el<HTMLInputElement>('ripple').checked},timelinePrefs).affectedIds);}catch{}
    for (const node of root.querySelectorAll<HTMLElement>('.film-clip[data-clip-id]')) {
      node.dataset.following=String(following.has(node.dataset.clipId!)&&!selectedIds.has(node.dataset.clipId!));
      node.dataset.selected = String(selectedIds.has(node.dataset.clipId!));
      node.querySelector('.film-clip-body')?.setAttribute('aria-pressed', String(selectedIds.has(node.dataset.clipId!)));
    }
    const found = selectedItem();
    if (found) { activeMarker = undefined; activeTrack = found.track.id; }
    root.querySelector<HTMLElement>('[data-action="caption-update"]')!.hidden = found?.kind !== 'subtitle';
    const captionLinked=found?.kind==='subtitle'&&!!(found.track.sourceClipId||found.track.wordSourceId);
    el<HTMLTextAreaElement>('caption').disabled=captionLinked;el<HTMLInputElement>('language').disabled=captionLinked;
    root.querySelector<HTMLButtonElement>('[data-action="caption-update"]')!.disabled=captionLinked;root.querySelector<HTMLButtonElement>('[data-action="caption"]')!.disabled=captionLinked;
    if (found?.kind === 'subtitle') {
      el<HTMLInputElement>('language').value = found.track.language;
      el<HTMLTextAreaElement>('caption').value = found.item.text;
    }
    for (const row of root.querySelectorAll<HTMLElement>('.film-track')) row.dataset.active=String(row.dataset.trackId===activeTrack);
    for (const node of root.querySelectorAll<HTMLElement>('.film-track-name')) node.setAttribute('aria-pressed', String(node.closest<HTMLElement>('.film-track')?.dataset.trackId === activeTrack));
    if(objectClip!==selected){objectIds=[];objectClip=undefined;}
    if(!objectIds.length)preview.selectObjects(selected??'',[]);
    authoring?.update();filmUIState.update({clipInspectorVisible:!sourceView&&!overlayEditing&&!objectIds.length,inspectorKind:sourceView?'source':motaleEditing?'motale':overlayEditing||objectIds.length?'native':current()?'clip':'other',contentEditing:!!contentOwner});updateEditPath();
    renderInspector(); renderLibrary();refreshActionButtons();
  }
  function updateRange() {
    el<HTMLInputElement>('range-in').value = rangeIn === undefined ? '' : String(rangeIn);
    el<HTMLInputElement>('range-out').value = rangeOut === undefined ? '' : String(rangeOut);
    const valid = rangeIn !== undefined && rangeOut !== undefined && rangeIn >= 0 && rangeOut > rangeIn && rangeOut <= filmDuration(doc);
    for (const name of ['range-lift', 'range-extract', 'range-play']) root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.disabled = !valid;
    const area = el('timeline').querySelector<HTMLElement>('.film-range-selection');
    if (area) { area.hidden = !valid; area.style.left = `${timelineX(rangeIn ?? 0, zoom)}px`; area.style.width = `${((rangeOut ?? 0) - (rangeIn ?? 0)) * zoom}px`; }
  }
  function setFit() { fit = true; zoom = fitZoom(filmDuration(doc), el('scroll').clientWidth); el<HTMLInputElement>('zoom').value = String(Math.log10(zoom)); el('scroll').scrollLeft = 0; renderTimeline(); }
  function paintDraft(value: FilmDocument) {
    el('timeline').style.width=Math.max(el('scroll').clientWidth,timelineX(filmDuration(value),zoom)+TIMELINE_END_PADDING)+'px';
    for (const node of root.querySelectorAll<HTMLElement>('.film-clip[data-clip-id]')) {
      const found = timelineItem(value, node.dataset.clipId); if (!found) continue;
      const destination = [...root.querySelectorAll<HTMLElement>('.film-track')].find(row => row.dataset.trackId === found.track.id);
      if (destination && node.parentElement !== destination) destination.append(node);
      node.style.left = `${timelineX(found.item.at, zoom)}px`; node.style.width = `${Math.max(3, found.item.duration * zoom)}px`;
      if(destination)node.style.height=Math.max(20,parseFloat(destination.style.height)-8)+'px';
      node.dataset.narrow=String(found.item.duration*zoom<56);node.dataset.tiny=String(found.item.duration*zoom<24);
      const duration=node.querySelector('.film-clip-duration');if(duration)duration.textContent=timecode(found.item.duration,doc.frameRate);
    }
  }

  function startMarquee(event:PointerEvent){
    if(event.target!==event.currentTarget||event.button!==0||loading||cancelGesture)return;const content=el('timeline'),rect=content.getBoundingClientRect();if(event.clientX-rect.left<TIMELINE_GUTTER)return;event.preventDefault();const originalDomain={objectIds:[...objectIds],objectClip,editingDomain,canvasSelectionActive,selected};canvasSelectionActive=false;objectIds=[];objectClip=undefined;editingDomain='clips';timelineClicks.reset();const owner=event.currentTarget as HTMLElement;owner.tabIndex=-1;owner.focus({preventScroll:true});const initial=new Set(selectedIds),x=event.clientX-rect.left,y=event.clientY-rect.top,box=document.createElement('div');box.className='film-marquee';content.append(box);owner.setPointerCapture(event.pointerId);const listeners=new AbortController();let moved=false,finished=false;
    const finish=(accept:boolean)=>{if(finished)return;finished=true;listeners.abort();if(owner.hasPointerCapture(event.pointerId))owner.releasePointerCapture(event.pointerId);box.remove();cancelGesture=undefined;if(!accept){selectedIds.clear();initial.forEach(id=>selectedIds.add(id));({objectIds,objectClip,editingDomain,canvasSelectionActive,selected}=originalDomain);}else selected=[...selectedIds][0];syncSelection();};cancelGesture=()=>finish(false);
    window.addEventListener('pointermove',e=>{if(e.pointerId!==event.pointerId)return;const now=content.getBoundingClientRect(),xx=e.clientX-now.left,yy=e.clientY-now.top;if(Math.abs(xx-x)+Math.abs(yy-y)<4&&!moved)return;moved=true;const left=Math.min(x,xx),top=Math.min(y,yy),right=Math.max(x,xx),bottom=Math.max(y,yy);Object.assign(box.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});selectedIds.clear();if(event.ctrlKey||event.metaKey||event.shiftKey)initial.forEach(id=>selectedIds.add(id));for(const clip of content.querySelectorAll<HTMLElement>('.film-clip')){const r=clip.getBoundingClientRect(),item=timelineItem(doc,clip.dataset.clipId);if(item&&!item.track.locked&&r.right-now.left>=left&&r.left-now.left<=right&&r.bottom-now.top>=top&&r.top-now.top<=bottom)selectedIds.add(item.item.id);}if(linkage)linkedFilmIds(doc,selectedIds).forEach(id=>selectedIds.add(id));for(const clip of content.querySelectorAll<HTMLElement>('.film-clip'))clip.dataset.selected=String(selectedIds.has(clip.dataset.clipId!));},{signal:listeners.signal});
    window.addEventListener('pointerup',e=>{if(e.pointerId===event.pointerId){if(!moved&&!additiveSelection(event))selectedIds.clear();finish(true);}},{signal:listeners.signal});window.addEventListener('pointercancel',e=>{if(e.pointerId===event.pointerId)finish(false);},{signal:listeners.signal});
    owner.addEventListener('lostpointercapture',()=>finish(false),{signal:listeners.signal});window.addEventListener('blur',()=>finish(false),{signal:listeners.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);},{signal:listeners.signal});signal.addEventListener('abort',()=>finish(false),{once:true,signal:listeners.signal});
  }
  function startGesture(e: PointerEvent, id: string, edge?: ClipEdge) {
    if (e.button !== 0 || loading || cancelGesture) return;
    if(e.shiftKey||e.ctrlKey||e.metaKey)return;
    const found = timelineItem(doc, id); if (!found) return;
    sourceView?.close();clearContent();canvasSelectionActive=false;objectIds=[];objectClip=undefined;editingDomain='clips';selected = id; syncSelection();
    if (found.track.locked) { report('轨道已锁定'); return; }
    const origin = doc, originPosition = position, scroll = el('scroll'), startScroll = scroll.scrollLeft, startX = e.clientX, startY=e.clientY;
    const options = editingOptions(), startBoundary = edge === 'out' ? clipEnd(found.item) : found.item.at;
    const listeners = new AbortController(); let commands: FilmCommand[] | undefined, moved = false, stopped=false;
    const pointer = e.pointerId, owner = e.currentTarget as HTMLElement;
    let clientX=e.clientX,clientY=e.clientY,scrollRaf=0,lastScrollTime=0;
    const guide=document.createElement('div');guide.className='film-snap-guide';guide.hidden=true;
    const hint=document.createElement('output');hint.className='film-gesture-hint';hint.hidden=true;
    el('timeline').append(guide,hint);owner.setPointerCapture(pointer);
    const clearTarget=()=>root.querySelectorAll<HTMLElement>('.film-track[data-drop-target]').forEach(row=>delete row.dataset.dropTarget);
    const stop = (commit: boolean) => {
      if(stopped)return;stopped=true;cancelAnimationFrame(scrollRaf);listeners.abort();guide.remove();hint.remove();clearTarget();
      if (owner.hasPointerCapture(pointer)) owner.releasePointerCapture(pointer);
      cancelGesture = undefined; gestureDraft = undefined;
      if (commit && commands) execute(commands);
      else { position = originPosition; paintDraft(doc); updateTransport();report(''); }
      if (moved) { owner.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { once: true, capture: true }); }
    };
    cancelGesture = () => stop(false);
    const move=()=>{
      const pixels = clientX - startX + scroll.scrollLeft - startScroll;
      if (!moved && Math.abs(pixels) < 3 && Math.abs(clientY-startY)<3) return;
      moved = true; playing = false; rangePlayback = false;
      let delta = Math.round(pixels / zoom),snapped=false;
      if (snap && (edge || options.tool === 'select' || options.tool === 'ripple' || options.tool === 'roll')) {
        const result=snapFrame(origin,startBoundary+delta,Math.ceil(6/zoom),{excludeIds:[...selectedIds],playhead:originPosition,points:rhythmSnap?rhythmSnapPoints(origin,[...selectedIds]):[]});
        delta=result.frame-startBoundary;snapped=result.snapped;
      }
      clearTarget();
      try {
        const destinationRow = !edge && options.tool === 'select' ? document.elementFromPoint(clientX,clientY)?.closest<HTMLElement>('.film-track.media') : undefined;
        const destination=destinationRow?.dataset.trackId;
        const plan=gestureCommands(origin,id,delta,{...options,edge,destination});
        gestureDraft = applyFilmCommands(origin, plan); commands = plan;
        const changed = timelineItem(gestureDraft, id)!;
        position = edge === 'out' ? clipEnd(changed.item) - 1 : changed.item.at;
        if(destinationRow&&selectedIds.size===1)destinationRow.dataset.dropTarget='true';
        guide.hidden=!snapped;guide.style.left=timelineX(startBoundary+delta,zoom)+'px';
        hint.hidden=false;hint.textContent=timecode(edge==='out'?clipEnd(changed.item):changed.item.at,doc.frameRate);
        const bounds=el('timeline').getBoundingClientRect();
        hint.style.left=Math.max(scroll.scrollLeft+TIMELINE_GUTTER+8,Math.min(clientX-bounds.left+12,scroll.scrollLeft+scroll.clientWidth-120))+'px';
        hint.style.top=Math.max(scroll.scrollTop+32,clientY-bounds.top-36)+'px';
        needsResume = true; paintDraft(gestureDraft); updateTransport(); report('');
      } catch (error) { guide.hidden=true;hint.hidden=true;commands = undefined; gestureDraft = undefined; position = originPosition; paintDraft(origin); report(String(error instanceof Error ? error.message : error)); }
    };
    const autoScroll=(now:number)=>{
      if(stopped)return;
      const elapsed=Math.min(2,(now-lastScrollTime)/16.67||1);lastScrollTime=now;
      if(moved){
        const bounds=scroll.getBoundingClientRect(),left=bounds.left+TIMELINE_GUTTER,right=bounds.right;
        const velocity=(point:number,min:number,max:number)=>point<min+32?-Math.min(18,(min+32-point)*.45):point>max-32?Math.min(18,(point-max+32)*.45):0;
        const beforeX=scroll.scrollLeft,beforeY=scroll.scrollTop;
        scroll.scrollLeft+=velocity(clientX,left,right)*elapsed;
        if(!edge)scroll.scrollTop+=velocity(clientY,bounds.top+28,bounds.bottom)*elapsed;
        if(scroll.scrollLeft!==beforeX||scroll.scrollTop!==beforeY)move();
      }
      scrollRaf=requestAnimationFrame(autoScroll);
    };
    scrollRaf=requestAnimationFrame(autoScroll);
    window.addEventListener('pointermove', event => {if(event.pointerId!==pointer)return;clientX=event.clientX;clientY=event.clientY;move();}, { signal: listeners.signal });
    window.addEventListener('pointerup', event => { if (event.pointerId === pointer) stop(true); }, { signal: listeners.signal });
    window.addEventListener('pointercancel', event => { if (event.pointerId === pointer) stop(false); }, { signal: listeners.signal });
    window.addEventListener('blur', () => stop(false), { signal: listeners.signal });
    signal.addEventListener('abort',()=>stop(false),{once:true,signal:listeners.signal});
  }

  function field(label: string, value: number, action: (value: number) => void) {
    const line = document.createElement('label'); line.className = 'film-control-row'; const caption=document.createElement('span');caption.textContent=filmText(label);line.append(caption);
    const input = document.createElement('input'); input.type = 'number'; input.step = '1'; input.value = String(value);
    input.setAttribute('aria-label',filmText(label));input.addEventListener('change', () => action(Number(input.value))); line.append(input); return line;
  }
  function inspectorScope(){return JSON.stringify([rootDocument.id,sequencePath,editSerial,[...selectedIds],motaleEditing,objectIds]);}
  function renderInspector(){
    const kind=motaleEditing?'motale':objectIds.length?'native':selectedIds.size>1?'multiple':doc.sources.find(source=>source.id===current()?.sourceId)?.kind??selectedItem()?.kind??'other';
    const restore=propertyView.capture(JSON.stringify([sequencePath,[...selectedIds],objectIds,motaleEditing]),kind);
    buildInspector();el('inspector-title').hidden=motaleEditing;
    const box=el('inspector'),cue=selectedItem()?.kind==='subtitle',captions=root.querySelector<HTMLDetailsElement>('.film-caption-editor')!;
    captions.hidden=!!contentOwner;captions.open=cue;captions.dataset.section='caption';
    if(cue){captions.parentElement!.insertBefore(captions,box);const styles=box.querySelector('.film-subtitle-styles');if(styles)captions.append(styles);}else box.after(captions);
    if(!motaleEditing&&!overlayEditing&&!objectIds.length&&selectedIds.size){
      const clip=current(),visual=clip&&doc.sources.find(source=>source.id===clip.sourceId)?.kind!=='audio';
      const rest=inspectorSection(filmText('时间与剪辑'),'timing');
      const groups:[string,string,string,boolean][]=[['.film-audio-controls','声音','audio',!visual],['.film-color-controls','调色','color',false],['.film-mask-inspector','遮罩','mask',false]];
      for(const [selector,title,key,open]of groups){const child=box.querySelector(selector);if(child){const group=inspectorSection(filmText(title),key,open);group.append(child);box.append(group);}}
      const crop=box.querySelector('.film-crop-tools'),entry=box.querySelector('.film-open-content');
      for(const child of [...box.children])if(child!==crop&&child!==entry&&!child.matches('.film-property-section'))rest.append(child);
      if(rest.children.length>1)box.append(rest);
      if(!cue){
        propertiesPanel=clipPropertiesPanel({doc,ids:[...selectedIds],position:()=>position,scope:inspectorScope,execute,
          draft:(base,commands)=>{authorDraft=base&&commands?applyFilmCommands(base,commands):undefined;needsResume=true;},pause:()=>{playing=false;preview.pause();},report,
          key:property=>{filmAuthoringActions.selectProperty(property);void filmAuthoringActions.toggleKey().catch(error=>report(String(error)));},
        });box.prepend(propertiesPanel.node);
        if(crop)(propertiesPanel.node.querySelector('[data-section=geometry]')??box).append(crop);
        if(entry)box.prepend(entry);
        const audio=box.querySelector('[data-section=audio]');if(!visual&&audio)box.prepend(audio);
      }
    }
    restore();
  }
  function buildInspector() {
    propertiesPanel?.dispose();propertiesPanel=undefined;
    motalePanel?.dispose();motalePanel=undefined;finalScopes?.dispose();finalScopes=undefined;
    colorPanel?.dispose();colorPanel=undefined;preview.inspectColor(undefined);
    timingPanel=undefined;audioPanel=undefined;maskPanel=undefined;
    const box = el('inspector'); box.replaceChildren();root.querySelector('.film-caption-editor .film-subtitle-styles')?.remove();
    if(objectIds.length||overlayEditing)return;
    if(selectedIds.size>1){
      el('inspector-title').textContent=`${selectedIds.size} ${filmText('个片段')}`;
      box.append(stageArrange({doc,ids:new Set(selectedIds),at:()=>position,dimensions:id=>preview.dimensions(id),execute,error:report}));
      box.append(field(filmText('批量移动（帧）'),0,delta=>timelineEdit({type:'move',ids:[...selectedIds],delta})));
      for(const [label,name] of [['嵌套所选','nest'],['复制到播放头','duplicate-selection'],['删除所选','delete']] as const){const b=document.createElement('button');b.textContent=filmText(label);b.onclick=()=>action(name);box.append(b);}return;
    }
    const marker = doc.markers.find(m => m.id === activeMarker);
    el('inspector-title').textContent = filmText(marker ? '标记' : selectedItem() ? '片段' : '轨道');
    if (marker) {
      const label = document.createElement('label'); label.textContent = filmText('标记名称');
      const name = document.createElement('input'); name.value = marker.title;
      name.addEventListener('change', () => execute([{ type: 'film.marker.put', marker: { ...marker, title: name.value } }])); label.append(name);
      const remove = document.createElement('button'); remove.textContent = filmText('删除标记');
      remove.addEventListener('click', () => { if (execute([{ type: 'film.marker.delete', markerId: marker.id }])) { activeMarker = undefined; renderInspector(); } });
      box.append(label, field(filmText('标记位置（帧）'), marker.at, at => execute([{ type: 'film.marker.put', marker: { ...marker, at } }])), remove); return;
    }
    const found = selectedItem();
    if (!found) {
      const track = doc.tracks.find(t => t.id === activeTrack); if (!track) return;
      const label = document.createElement('label'); label.textContent = filmText('轨道名称');
      const input = document.createElement('input'); input.value = track.title; input.disabled = track.locked;
      input.addEventListener('change', () => execute([{ type: 'film.track.update', trackId: track.id, patch: { title: input.value } }])); label.append(input); box.append(label);
      for (const [property, title] of [['locked', '锁定轨道'], ['hidden', '隐藏轨道'], ['muted', '静音轨道']] as const) {
        const label = document.createElement('label'); label.className = 'film-track-toggle';
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = track[property]; input.disabled = track.locked && property !== 'locked';
        input.addEventListener('change', () => execute([{ type: 'film.track.update', trackId: track.id, patch: { [property]: input.checked } }])); label.append(input, filmText(title)); box.append(label);
      }
      if(track.kind==='media'){const row=document.createElement('label');row.className='film-track-toggle';const input=document.createElement('input');input.type='checkbox';input.checked=soloTracks.has(track.id);input.onchange=()=>{if(input.checked)soloTracks.add(track.id);else soloTracks.delete(track.id);preview.setSolo(soloTracks);};row.append(input,filmText('独听轨道'));box.append(row);}
      const view=trackViews.get(track.id)??{height:trackHeight(track,doc),collapsed:false};const height=field(filmText('轨道高度'),view.height,value=>{trackViews.set(track.id,{...view,height:Math.max(28,Math.min(180,value))});renderTimeline();});box.append(height);const collapse=document.createElement('button');collapse.textContent=filmText(view.collapsed?'展开轨道':'折叠轨道');collapse.onclick=()=>{trackViews.set(track.id,{...view,collapsed:!view.collapsed});renderTimeline();renderInspector();};box.append(collapse);
      if(track.kind==='media'){const navigation=document.createElement('button');navigation.textContent=filmText('用于页面导航');navigation.disabled=navigationTrack(doc,track.id)?.id!==track.id;navigation.setAttribute('aria-pressed',String(navTrackId===track.id));navigation.onclick=()=>{navTrackId=track.id;try{localStorage.setItem('notale-navigation-track:'+doc.id+':'+sequencePath.join('/'),track.id);}catch{}renderStoryboard();};box.append(navigation);}
      const index = doc.tracks.indexOf(track);
      for (const [title, offset] of [['轨道上移', -1], ['轨道下移', 1]] as const) {
        const move = document.createElement('button'); move.textContent = filmText(title);
        move.disabled = track.locked || !doc.tracks[index + offset] || doc.tracks[index + offset].locked;
        move.addEventListener('click', () => execute([{ type: 'film.track.move', trackId: track.id, index: index + offset }])); box.append(move);
      }
      const remove = document.createElement('button'); remove.textContent = filmText('删除轨道及片段'); remove.disabled = track.locked;
      remove.addEventListener('click', () => execute([{ type: 'film.track.delete', trackId: track.id }])); box.append(remove); return;
    }
    if (found?.kind === 'subtitle') {
      const { item: cue, track } = found;
      box.append(subtitleStyles(track,execute,{document:()=>doc,report}));
      if(track.sourceClipId||track.wordSourceId){const unlink=document.createElement('button');unlink.textContent=filmText('解除字幕关联');unlink.disabled=track.locked;unlink.onclick=()=>execute([{type:'film.caption.detach',trackId:track.id}]);box.append(unlink);return;}
      box.append(field(filmText('字幕开始（帧）'), cue.at, at => execute([{ type: 'film.cue.put', trackId: track.id, cue: { ...cue, at, text: el<HTMLTextAreaElement>('caption').value } }])),
        field(filmText('字幕结束（帧，不含）'), clipEnd(cue), end => execute([{ type: 'film.cue.put', trackId: track.id, cue: { ...cue, duration: end - cue.at, text: el<HTMLTextAreaElement>('caption').value } }])));
      return;
    }
    const c = current(); if (!c) return;
    el('inspector-title').textContent=c.title;
    if(doc.sources.find(s=>s.id===c.sourceId)?.kind==='openfilm'){box.append(pageTemplate({clip:c,locked:!!selectedTrack()?.locked,read:()=>preview.pageDocument(c.id),sources:doc.sources,seek:()=>{if(position<c.at||position>=clipEnd(c)){playing=false;seek(c.at);}},execute}));box.append(selectorInspector(c,!!selectedTrack()?.locked,execute,report));}
      timingPanel=timingInspector({preferences:()=>timelinePrefs,ripple:()=>el<HTMLInputElement>('ripple').checked,error:report,doc,clip:c,locked:!!selectedTrack()?.locked,position:()=>position,commands:execute,pause:()=>{playing=false;updateTransport();},seek:at=>{playing=false;seek(at);}});box.prepend(timingPanel.node);
    const audioSource=doc.sources.find(s=>s.id===c.sourceId)!;
    if(audioSource.kind==='sequence'){const enter=document.createElement('button');enter.textContent=filmText('进入嵌套序列');enter.onclick=()=>showSequence([...sequencePath,audioSource.id]);box.prepend(enter);}
    if(audioSource.kind==='motale'&&motaleEditing){
      motalePanel=motaleInspector({content,layers:el('scene-layers'),animation:el('scene-animation'),structure:structureActions,context:()=>preview.motaleContext(c.id),author:()=>current()?.motale,
        scope:()=>JSON.stringify([rootDocument.id,sequencePath,editSerial,selected,position]),locked:()=>!!selectedTrack()?.locked||loading,
        editing:()=>motaleEditing&&!playing,edit:value=>{if(value)enterClip(c.id);else returnToClip();},
        selected:()=>selectedMotaleObjects(c.id),select:ids=>selectMotaleObjects(c.id,ids),seek:sourceTime=>seekMotaleSource(c,sourceTime),
        commit:author=>execute([{type:'film.motale.author',clipId:c.id,author}]),
      });box.prepend(motalePanel.node);
      finalScopes=scopeInspector({pause:()=>{playing=false;preview.pause();updateTransport();},report,
        finalScope:{mode:'final',changeMode:()=>{},current:()=>{const state=preview.motaleContext(c.id)?.bridge.state();return {document:doc,frame:position,languages:previewLanguages,
          // Sampling reads the FilmDocument; bridge initialization is
          // not an edit and must not cancel an otherwise valid pending sample.
          revision:JSON.stringify([rootDocument.id,sequencePath,editSerial,selected]),
          draft:!!authorDraft||!!gestureDraft||!!state?.previewing||loading};}}
      });const scopes=inspectorSection(filmText('画面分析'),'scopes');scopes.append(finalScopes.node);box.replaceChildren(motalePanel.node,scopes);return;
    }else{motaleEditing=false;preview.setMotaleAuthorMode();}
    if(['motale','overlay'].includes(audioSource.kind)){const enter=document.createElement('button');enter.className='film-open-content';enter.textContent=filmText('编辑内容');enter.onclick=()=>enterClip(c.id);box.append(enter);}
    if(['image','video'].includes(audioSource.kind)){
      let colorDraft=false,colorRevision=0;
      preview.inspectColor(c.id);colorPanel=colorInspector({clip:c,locked:!!selectedTrack()?.locked,commands:execute,pick,
        pause:()=>{playing=false;preview.pause();updateTransport();},
        preview:color=>{colorDraft=!!color;colorRevision++;preview.draftColor(c.id,color);},scope:()=>preview.scope(c.id),report,
        finalScope:{mode:colorScopeMode,changeMode:mode=>{colorScopeMode=mode;},current:()=>({document:doc,frame:position,languages:previewLanguages,
          revision:JSON.stringify([rootDocument.id,sequencePath,editSerial,selected,[...selectedIds],objectIds,colorRevision]),
          draft:!!authorDraft||!!gestureDraft||colorDraft||loading})}
      });box.append(colorPanel.node);
    }
    if(['audio','video'].includes(audioSource.kind)){audioPanel=audioInspector({report,doc,clip:c,source:audioSource,locked:!!selectedTrack()?.locked,position:()=>position,language:()=>el<HTMLInputElement>('language').value,commands:execute,pick,seek:at=>{playing=false;seek(at);},pause:()=>{playing=false;updateTransport();}});box.prepend(audioPanel.node);}

    if(doc.sources.find(s=>s.id===c.sourceId)?.kind!=='audio'){
      const edit=document.createElement('button');edit.textContent='⤢';edit.title=filmText('编辑片段位置与变换');edit.setAttribute('aria-label',edit.title);edit.dataset.action='clip-edit';edit.setAttribute('aria-pressed',String(clipEditing&&!playing));edit.disabled=!!selectedTrack()?.locked;
      edit.onclick=()=>{playing=false;clipEditing=!clipEditing;overlayEditing=false;maskEditing=false;cropEditing=false;updateTransport();};box.prepend(edit);
      const crop=document.createElement('button');crop.textContent='⌗';crop.title=filmText('裁切画面');crop.setAttribute('aria-label',crop.title);crop.setAttribute('aria-pressed',String(cropEditing));crop.disabled=!!selectedTrack()?.locked;crop.onclick=()=>{playing=false;cropEditing=!cropEditing;clipEditing=false;maskEditing=false;overlayEditing=false;if(position<c.at||position>=clipEnd(c))seek(c.at);crop.setAttribute('aria-pressed',String(cropEditing));updateTransport();};const reset=document.createElement('button');reset.textContent='↺';reset.title=filmText('重置当前裁切');reset.setAttribute('aria-label',reset.title);reset.disabled=crop.disabled;reset.onclick=()=>{cropRatio=undefined;preview.setCropRatio();execute(cropCommands(c,position,{cropLeft:0,cropRight:0,cropTop:0,cropBottom:0}));};const tools=document.createElement('div');tools.className='film-actions film-crop-tools';tools.append(edit,crop,reset);
      const ratio=document.createElement('select');ratio.setAttribute('aria-label',filmText('裁切比例'));ratio.title=filmText('裁切比例');ratio.disabled=crop.disabled;
      for(const [label,value] of [['自由',''],['原始','original'],['1:1','1'],['4:3',String(4/3)],['16:9',String(16/9)],['9:16',String(9/16)]])ratio.add(new Option(filmText(label),value));ratio.value=cropRatio===undefined?'':String(cropRatio);
      ratio.onchange=()=>{cropRatio=ratio.value===''?undefined:ratio.value==='original'?'original':Number(ratio.value);preview.setCropRatio(cropRatio);playing=false;cropEditing=true;clipEditing=maskEditing=overlayEditing=false;if(position<c.at||position>=clipEnd(c))seek(c.at);const size=preview.dimensions(c.id);if(size&&cropRatio!==undefined)execute(cropPresetCommands(c,position,size,cropRatio==='original'?size.width/size.height:cropRatio));updateTransport();};tools.append(ratio);box.prepend(tools);

    }
    if(audioSource.kind!=='audio'){maskPanel=maskInspector({clip:c,maskId,editing:()=>maskEditing&&!playing,edit:()=>{playing=false;maskEditing=!maskEditing;clipEditing=false;overlayEditing=false;cropEditing=false;updateTransport();},property:maskProperty,locked:!!selectedTrack()?.locked,position:()=>position,select:id=>{maskId=id;renderInspector();},selectProperty:property=>{maskProperty=property;renderInspector();},commands:execute,seek:at=>{playing=false;seek(at);},pause:()=>{playing=false;updateTransport();}});box.append(maskPanel.node);}
    const editing = () => ({ ripple: el<HTMLInputElement>('ripple').checked, sync: (timelinePrefs.follow==='all') });
    box.append(field(filmText('开始（帧）'), c.at, at=>timelineEdit({type:'move',ids:[c.id],anchorId:c.id,delta:at-c.at})),
      field(filmText('源入点（帧）'), secondsFrame(c.in, doc.frameRate), value=>timelineEdit({type:'slip',clipId:c.id,delta:value-secondsFrame(c.in,doc.frameRate)})),
      field(filmText('时长（帧）'), c.duration, value=>timelineEdit({type:'trim',clipId:c.id,edge:'out',delta:value-c.duration,...editing()})));
    const ops = document.createElement('div'); ops.className = 'film-trim-grid';
    for (const [name, mode] of [['入点', 'in'], ['出点', 'out'], ['滚动', 'roll'], ['滑移', 'slip'], ['滑动', 'slide']] as const) {
      const label = document.createElement('span'); label.textContent = filmText(name); ops.append(label);
      for (const delta of [-1, 1]) {
        const b = document.createElement('button'); b.textContent = delta < 0 ? '−1' : '+1'; b.title = `${name} ${delta} 帧`; b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => {
          if (mode === 'in' || mode === 'out') timelineEdit({type:'trim',clipId:c.id,edge:mode,delta,...editing()});
          else if (mode === 'slip' || mode === 'slide') timelineEdit({type:mode,clipId:c.id,delta});
          else { const t = selectedTrack()!, next = [...t.clips].sort((a, b) => a.at - b.at).find(x => x.at === c.at + c.duration); if (next) timelineEdit({type:'roll',leftId:c.id,rightId:next.id,delta}); else report('滚动需要紧邻的下一个片段'); }
        }); ops.append(b);
      }
    }
    box.append(ops);
    for (const [label, offset] of [['向前排序', -1], ['向后排序', 1]] as const) {
      const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => {
        const t = selectedTrack()!, order = [...t.clips].sort((a, b) => a.at - b.at).map(x => x.id), i = order.indexOf(c.id), target = i + offset;
        if (target >= 0 && target < order.length) { const other=t.clips.find(x=>x.id===order[target])!;timelineEdit({type:'move',ids:[c.id],anchorId:c.id,delta:(offset<0?other.at:clipEnd(other))-c.at,destination:t.id},{...timelinePrefs,magnet:true,mainTrackId:t.id}); }
      }); box.append(b);
    }
  }
  function positionPlayhead() {
    const left = timelineX(position, zoom), hidden = position * zoom < el('scroll').scrollLeft;
    for (const node of root.querySelectorAll<HTMLElement>('.film-playhead,.film-playhead-cap')) {
      node.style.left = left + 'px'; node.hidden = hidden;
      if (node.classList.contains('film-playhead-cap')) {
        node.setAttribute('aria-valuenow', String(position));
        node.setAttribute('aria-valuemax', String(filmDuration(doc)));
        node.setAttribute('aria-valuetext', timecode(position, doc.frameRate));
      }
    }
  }
  function paintRuler() {
    const ruler=el('timeline').querySelector<HTMLElement>('.film-ruler');if(!ruler)return;
    ruler.querySelectorAll('.film-ruler-tick').forEach(node=>node.remove());
    const scroll=el('scroll'),from=Math.max(0,timelineFrame(scroll.scrollLeft,zoom)),to=timelineFrame(scroll.scrollLeft+scroll.clientWidth+72,zoom);
    for(const tick of rulerTicks(filmDuration(doc),zoom,doc.frameRate,from,to)) {
      const node=document.createElement('div');node.className='film-ruler-tick '+(tick.major?'major':'minor');
      node.style.left=timelineX(tick.frame,zoom)+'px';
      if(tick.major){const label=document.createElement('span');label.textContent=tick.label;node.append(label);}ruler.append(node);
    }
  }
  function scrubTimeline(event:PointerEvent) {
    if(event.button!==0||loading||cancelGesture)return;
    const bounds=el('scroll').getBoundingClientRect();if(event.clientX<bounds.left+TIMELINE_GUTTER)return;
    event.preventDefault();event.stopPropagation();
    const owner=event.currentTarget as HTMLElement,origin=position,events=new AbortController();owner.setPointerCapture(event.pointerId);
    const move=(clientX:number)=>seek(timelineFrame(clientX-el('timeline').getBoundingClientRect().left,zoom));
    const finish=(cancel:boolean)=>{events.abort();if(owner.hasPointerCapture(event.pointerId))owner.releasePointerCapture(event.pointerId);cancelGesture=undefined;if(cancel)seek(origin);};
    cancelGesture=()=>finish(true);move(event.clientX);
    window.addEventListener('pointermove',e=>{if(e.pointerId===event.pointerId)move(e.clientX);},{signal:events.signal});
    window.addEventListener('pointerup',e=>{if(e.pointerId===event.pointerId)finish(false);},{signal:events.signal});
    window.addEventListener('pointercancel',()=>finish(true),{signal:events.signal});
    window.addEventListener('blur',()=>finish(true),{signal:events.signal});
    signal.addEventListener('abort',()=>finish(true),{once:true,signal:events.signal});
  }
  function renderTimeline() {
    const timeline = el('timeline'); timeline.replaceChildren();
    el<HTMLInputElement>('zoom').value=String(Math.log10(zoom));
    const length = filmDuration(doc), width = Math.max(el('scroll').clientWidth, timelineX(length,zoom) + TIMELINE_END_PADDING); timeline.style.width = `${width}px`;
    const ruler = document.createElement('div'); ruler.className = 'film-ruler';
    const corner=document.createElement('div');corner.className='film-ruler-corner';ruler.append(corner);
    ruler.addEventListener('pointerdown',scrubTimeline);
    const cap=document.createElement('button');cap.className='film-playhead-cap';cap.type='button';cap.setAttribute('role','slider');cap.setAttribute('aria-label',filmText('播放位置'));cap.setAttribute('aria-valuemin','0');cap.title=filmText('播放位置');
    cap.addEventListener('pointerdown',scrubTimeline);
    cap.onkeydown=e=>{if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();seek(e.key==='Home'?0:e.key==='End'?length:position+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));};
    ruler.append(cap);timeline.append(ruler);paintRuler();
    const targets=el('range-tracks');targets.replaceChildren();
    const area = document.createElement('div'); area.className = 'film-range-selection'; timeline.append(area);
    for (const marker of doc.markers) {
      const m = document.createElement('button'); m.className = 'film-marker'; m.title = marker.title; m.setAttribute('aria-label', marker.title); m.style.left = `${timelineX(marker.at,zoom)}px`; m.innerHTML=svg('diamond');
      m.addEventListener('click', () => { selected = undefined; activeMarker = marker.id; seek(marker.at); syncSelection();sidebar.onObjectSelection(); }); ruler.append(m);
    }
    for (const t of doc.tracks) {
      const row = document.createElement('div'); row.className = `film-track ${t.kind}`; row.dataset.trackId = t.id;
      const view=trackViews.get(t.id),height=view?.collapsed?28:view?.height??trackHeight(t,doc);
      row.dataset.collapsed=String(!!view?.collapsed);row.dataset.active=String(t.id===activeTrack);row.dataset.locked=String(t.locked);row.dataset.hidden=String(t.hidden);row.style.height=height+'px';
      row.addEventListener('pointerdown',startMarquee);
      row.addEventListener('dragover',e=>{if(e.dataTransfer?.types.some(type=>['application/x-notale-film-source','application/x-notale-film-sources','application/x-notale-insert'].includes(type))&&!t.locked&&t.kind==='media'){e.preventDefault();row.dataset.dropTarget='true';}});
      row.addEventListener('dragleave',e=>{if(!row.contains(e.relatedTarget as Node))delete row.dataset.dropTarget;});
      row.addEventListener('drop',e=>{delete row.dataset.dropTarget;if(t.locked||t.kind!=='media')return;const raw=e.dataTransfer?.getData('application/x-notale-insert'),id=e.dataTransfer?.getData('application/x-notale-film-source'),many=e.dataTransfer?.getData('application/x-notale-film-sources');if(!raw&&!id&&!many)return;e.preventDefault();activeTrack=t.id;seek(Math.max(0,timelineFrame(e.clientX-row.getBoundingClientRect().left,zoom)));if(raw){try{const item=JSON.parse(raw);if(typeof item.kind!=='string'||item.value!==undefined&&typeof item.value!=='string')throw Error('无法识别素材');void insertCatalog(item.kind,item.value,undefined,t.id).catch(error=>report(String(error)));}catch(error){report(String(error));}return;}if(many){try{const ids=JSON.parse(many);if(!Array.isArray(ids)||!ids.every(id=>typeof id==='string'))throw Error('无法识别素材');addSources(ids,position,t.id);}catch(error){report(String(error));}}else if(id){selectedSource=id;mediaLibrary?.select([id]);renderLibrary();addSourceClip(false);}});
      const targetLabel=document.createElement('label'),target=document.createElement('input');target.type='checkbox';target.checked=rangeTracks.has(t.id);target.disabled=t.locked;target.setAttribute('aria-label',`区间编辑：${t.title}`);
      target.onchange=()=>{if(target.checked)rangeTracks.add(t.id);else rangeTracks.delete(t.id);};targetLabel.append(target,document.createTextNode(t.title));targets.append(targetLabel);
      const head = document.createElement('div'); head.className = 'film-track-head';
      const sources=t.kind==='media'?t.clips.map(c=>doc.sources.find(s=>s.id===c.sourceId)):[];
      const kind=t.kind==='subtitle'?'subtitle':sources.length&&sources.every(source=>timelineKind(source)===timelineKind(sources[0]))?timelineKind(sources[0]):'scene';
      const label = document.createElement('button'); label.className = 'film-track-name film-track-type'; label.innerHTML=svg(kind); label.title = t.title; label.setAttribute('aria-label', `轨道设置：${t.title}`);
      label.addEventListener('click', () => { objectIds=[];objectClip=undefined;activeTrack = t.id; activeMarker = undefined; selected = undefined; syncSelection();sidebar.inspect('format'); }); head.append(label);
      const control=(name:string,icon:string,title:string,pressed:boolean,action:()=>void)=>{const node=document.createElement('button');node.className='film-track-'+name;node.disabled=t.locked&&name!=='lock';node.innerHTML=svg(icon);node.title=title;node.setAttribute('aria-label',title+'：'+t.title);node.setAttribute('aria-pressed',String(pressed));node.onclick=action;head.append(node);return node;};
      control('lock',t.locked?'lock':'unlock',t.locked?'解锁轨道':'锁定轨道',t.locked,()=>execute([{type:'film.track.update',trackId:t.id,patch:{locked:!t.locked}}]));
      control('visibility',t.hidden?'hidden':'eye',t.hidden?'显示轨道':'隐藏轨道',t.hidden,()=>execute([{type:'film.track.update',trackId:t.id,patch:{hidden:!t.hidden}}]));
      if(sources.some(source=>source?.kind==='audio'||source?.kind==='video'))control('audio',t.muted?'muted':'volume',t.muted?'取消静音':'静音轨道',t.muted,()=>execute([{type:'film.track.update',trackId:t.id,patch:{muted:!t.muted}}]));
      else{const slot=document.createElement('span');slot.className='film-track-audio';head.append(slot);}row.append(head);
      for (const item of t.kind === 'media' ? t.clips : t.cues) {
        const clip = document.createElement('div'); clip.className = 'film-clip'; clip.dataset.clipId = item.id;clip.dataset.linked=String('linkGroup' in item&&!!item.linkGroup); clip.dataset.selected = String(selectedIds.has(item.id));
        const title = 'title' in item ? item.title : item.text;
        const source='sourceId' in item?doc.sources.find(s=>s.id===item.sourceId):undefined,kind=t.kind==='subtitle'?'subtitle':timelineKind(source);
        clip.dataset.kind=kind;clip.dataset.narrow=String(item.duration*zoom<56);clip.dataset.tiny=String(item.duration*zoom<24);
        clip.title = title;
        Object.assign(clip.style, { left: `${timelineX(item.at,zoom)}px`, width: `${Math.max(3, item.duration * zoom)}px`, height:`${height-8}px` });
        const body = document.createElement('button'); body.className = 'film-clip-body';
        const label=document.createElement('span');label.className='film-clip-label';label.innerHTML=svg(kind);
        const name=document.createElement('span');name.className='film-clip-title';name.textContent=title;
        const duration=document.createElement('span');duration.className='film-clip-duration';duration.textContent=timecode(item.duration,doc.frameRate);
        label.append(name,duration);body.append(label);
        body.setAttribute('aria-label', title); body.setAttribute('aria-pressed', String(selectedIds.has(item.id)));
        body.addEventListener('pointerdown', e => startGesture(e, item.id));
        body.addEventListener('click',e=>{sourceView?.close();clearContent();canvasSelectionActive=false;objectIds=[];objectClip=undefined;editingDomain='clips';const order=doc.tracks.flatMap(t=>[...(t.kind==='media'?t.clips:t.cues)].sort((a,b)=>a.at-b.at).map(c=>c.id)),before=[...selectedIds];let next=timelineClicks.click(order,before,item.id,e,selected);if(!e.shiftKey&&(e.ctrlKey||e.metaKey)&&before.includes(item.id)&&linkage){const group=new Set(linkedFilmIds(doc,[item.id]));next=next.filter(id=>!group.has(id));}selectedIds.clear();next.forEach(id=>selectedIds.add(id));selected=selectedIds.has(item.id)?item.id:[...selectedIds].at(-1);syncSelection();updateTransport();timelineClicks.accept([...selectedIds]);sidebar.onObjectSelection();});
        body.addEventListener('dblclick',event=>{if(!additiveSelection(event))enterClip(item.id);});
        clip.append(body);
        if('sourceId' in item){const origin=doc,originSerial=editSerial;clip.append(timelineFades({doc,clip:item,zoom,locked:t.locked,linked:()=>linkage,signal,current:()=>editSerial===originSerial,scroll:()=>el('scroll').scrollLeft,start:cancel=>{if(loading||cancelGesture)return false;playing=false;rangePlayback=false;cancelGesture=cancel;return true;},draft:commands=>{gestureDraft=commands?applyFilmCommands(origin,commands):undefined;needsResume=true;updateTransport();},finish:commands=>{cancelGesture=undefined;gestureDraft=undefined;if(commands)execute(commands);else{paintDraft(doc);updateTransport();}},execute,error:report}));}

        if('transitionIn' in item&&item.transitionIn){const origin=doc,serial=editSerial;row.append(timelineTransition({doc,clip:item,zoom,locked:t.locked,signal,current:()=>serial===editSerial&&!disposed&&!loading,scroll:()=>el('scroll').scrollLeft,start:cancel=>{if(loading||cancelGesture)return false;playing=false;rangePlayback=false;cancelGesture=cancel;return true;},draft:commands=>{gestureDraft=commands?applyFilmCommands(origin,commands):undefined;needsResume=true;updateTransport();},finish:commands=>{cancelGesture=undefined;gestureDraft=undefined;if(commands)execute(commands);else updateTransport();},execute,select:()=>{selected=item.id;selectedIds.clear();selectedIds.add(item.id);objectIds=[];objectClip=undefined;editingDomain='clips';syncSelection();sidebar.inspect('format');},error:report}));}
        if(source&&'sourceId' in item&&['video','image','audio'].includes(source.kind)){
          const media=document.createElement('span');media.className='film-clip-media';
          if(source.kind==='video')media.append(clipThumbnailStrip(source,item,doc.frameRate,item.duration*zoom));
          if(source.kind==='image'){const strip=document.createElement('span');strip.className='film-clip-filmstrip';for(let index=0,count=Math.max(1,Math.min(24,Math.ceil(item.duration*zoom/68)));index<count;index++){const image=document.createElement('img');image.src=source.uri;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();strip.append(image);}media.append(strip);}
          if(['audio','video'].includes(source.kind))media.append(waveformCanvas(source.uri,item.in,frameSeconds(item.duration,doc.frameRate),item.duration*zoom,f=>clipSourceTime(item,f*item.duration,doc.frameRate)));
          body.append(media);
        }
        if('sourceId' in item){const source=doc.sources.find(s=>s.id===item.sourceId);if(rhythmVisible&&source?.rhythm)clip.append(rhythmTicks(item,doc.frameRate,source.rhythm,zoom));for(const [index,marker]of (source?.markers??[]).entries()){const end=marker.end??source?.markers?.[index+1]?.time??source?.duration??marker.time+.001;for(const range of sourceIntervals(item,marker.time,end,doc.frameRate)){const point=document.createElement('button');point.className='film-source-marker';point.title=marker.title;point.setAttribute('aria-label','素材标记：'+marker.title);point.innerHTML=svg('diamond');point.style.left=Math.max(6,Math.min(item.duration*zoom-14,range.from*zoom))+'px';point.onpointerdown=e=>e.stopPropagation();point.onkeydown=e=>{if(e.key===' '||e.key==='Enter')e.stopPropagation();};point.onclick=e=>{e.stopPropagation();selected=item.id;selectedIds.clear();selectedIds.add(item.id);seek(item.at+Math.min(item.duration-1,Math.round(range.from)));syncSelection();};clip.append(point);}}}
        for (const edge of ['in', 'out'] as const) {
          const handle = document.createElement('button'); handle.className = `film-trim-handle ${edge}`;
          handle.title = `${edge === 'in' ? '入点' : '出点'}：${title}`; handle.setAttribute('aria-label', handle.title); handle.disabled = t.locked;
          handle.addEventListener('pointerdown', e => { e.stopPropagation(); startGesture(e, item.id, edge); });
          handle.addEventListener('keydown', e => {
            if (e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation(); selected = item.id;
            try { execute(gestureCommands(doc, item.id, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1), { ...editingOptions(), edge })); }
            catch (error) { report(String(error)); }
          });
          clip.append(handle);
        }
        if('sourceId' in item){const expand=document.createElement('button');expand.className='film-expand-animation';expand.innerHTML=svg('chevron-down');expand.title=filmText('展开对象动画');expand.setAttribute('aria-label','展开对象动画：'+title);expand.setAttribute('aria-expanded',String(expandedAnimations.has(item.id)));expand.onpointerdown=e=>e.stopPropagation();expand.onclick=e=>{e.stopPropagation();if(expandedAnimations.has(item.id))expandedAnimations.delete(item.id);else expandedAnimations.add(item.id);renderTimeline();};clip.append(expand);}
        row.append(clip);
      }
      timeline.append(row);
      if(t.kind==='media')for(const clip of t.clips)if(expandedAnimations.has(clip.id)){
        const serial=editSerial,source=doc.sources.find(source=>source.id===clip.sourceId);
        const acts=source?.kind==='motale'?(motaleActs.get(JSON.stringify([source.id,source.uri]))??source.markers?.filter(marker=>marker.end!==undefined).map(marker=>({id:marker.id,start:marker.time,end:marker.end!}))):undefined;
        timeline.append(keyframeTracks({clip,zoom,locked:t.locked,signal,current:()=>serial===editSerial&&!disposed&&!loading,
          motale:acts?{acts,rate:doc.frameRate,select:(actId,objectId,sourceTime)=>{
            selected=clip.id;selectedIds.clear();selectedIds.add(clip.id);objectIds=[];objectClip=undefined;editingDomain='clips';
            contentOwner=clip.id;motaleEditing=true;clipEditing=maskEditing=cropEditing=overlayEditing=false;
            selectMotaleObjects(clip.id,[objectId],actId);seekMotaleSource(clip,sourceTime);syncSelection();sidebar.inspect('format');
          }}:undefined,
          seek:at=>{playing=false;seek(at);},select:(target,property)=>{
            selected=clip.id;selectedIds.clear();selectedIds.add(clip.id);
            if(target){objectClip=clip.id;objectIds=[target];preview.selectObjects(clip.id,objectIds);}
            else{objectClip=undefined;objectIds=[];if(property)appearanceProperty=property as FilmProperty;}
            syncSelection();if(property)filmAuthoringActions.selectProperty(property);
          },execute,error:report}));
      }
    }
    const playhead = document.createElement('div'); playhead.className = 'film-playhead'; timeline.append(playhead); updateTransport(); updateRange();
  }
  el('source-kind').addEventListener('change',()=>renderLibrary(),{signal});
  function renderLibrary() {
    mediaLibrary?.update();
    const source = doc.sources.find(s => s.id === selectedSource&&s.kind!=='overlay'), controls = el('source-controls'); controls.hidden = !source||!!mediaLibrary&&mediaLibrary.selected().length!==1;
    if (!source) { controls.dataset.sourceId = ''; return; }
    const changed = controls.dataset.sourceId !== source.id; controls.dataset.sourceId = source.id;
    const acts = el<HTMLSelectElement>('source-act'), previous = changed ? '' : acts.value;
    acts.replaceChildren(new Option(filmText('整个素材'), ''), ...(source.markers ?? []).map((m, i) => new Option(m.title, String(i))));
    acts.value = previous; if (acts.selectedIndex < 0) acts.value = '';
    if (changed) { el<HTMLInputElement>('source-in').value = '0'; el<HTMLInputElement>('source-out').value = String(source.kind==='image'?frameSeconds(insertionDuration(doc,position,navTrackId),doc.frameRate):source.duration??5); }
    const targets = el<HTMLSelectElement>('source-track'), wanted = activeTrack ?? targets.value;
    targets.replaceChildren(...doc.tracks.filter(t => t.kind === 'media').map(t => { const option = new Option(t.title, t.id); option.disabled = t.locked; return option; }));
    targets.value = [...targets.options].some(o => o.value === wanted) ? wanted : (targets.options[0]?.value ?? '');
    for (const name of ['source-place', 'source-append','source-insert','source-overwrite']) root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.disabled = !targets.value || !!doc.tracks.find(t => t.id === targets.value)?.locked;
  }
  function addSources(ids:string[],at:number|'append',target=activeTrack){
    try{const track=doc.tracks.find(t=>t.id===target&&t.kind==='media');if(!track||track.kind!=='media'||track.locked)throw Error('请选择可写轨道');
      const sources=[...new Set(ids)].map(id=>{const source=doc.sources.find(s=>s.id===id);if(!source)throw Error('素材已移除');return source;});
      let draft=prepareFirstVideoRate(doc,sources),next=at==='append'?Math.max(0,...track.clips.map(clipEnd)):at;const clips:FilmClip[]=[];
      for(const source of sources){const clip=sourceClip(draft,{id:uid(),sourceId:source.id,trackId:track.id,from:0,to:source.duration??frameSeconds(insertionDuration(draft,next,navTrackId),draft.frameRate),position:next});
        draft=timelinePrefs.magnet&&mainFilmTrack(draft,timelinePrefs.mainTrackId)?.id===track.id?planFilmTimeline(draft,{type:'place',trackId:track.id,clip,mode:'magnet',idPrefix:uid()},timelinePrefs).document:applyFilmCommands(draft,[{type:'film.clip.add',trackId:track.id,clip}]);clips.push(clip);const added=timelineItem(draft,clip.id);next=clipEnd(added?.item??clip);}
      if(clips.length&&execute([{type:'film.document.restore',document:draft,expected:doc}])){canvasSelectionActive=false;selectedIds.clear();clips.forEach(c=>selectedIds.add(c.id));selected=clips[0].id;activeTrack=track.id;rangeTracks.add(track.id);syncSelection();}
    }catch(error){report(error instanceof Error?error.message:String(error));}
  }
  function addSourceClip(append:boolean,mode?:'insert'|'overwrite'){
    try{const trackId=el<HTMLSelectElement>('source-track').value,source=doc.sources.find(s=>s.id===selectedSource);if(!source)return;
      let draft=prepareFirstVideoRate(doc,[source]);const act=el<HTMLSelectElement>('source-act').value,clip=sourceClip(draft,{id:uid(),sourceId:source.id,trackId,from:Number(el<HTMLInputElement>('source-in').value),to:Number(el<HTMLInputElement>('source-out').value),position:append?'append':position,title:act===''?source.title:source.markers?.[Number(act)]?.title});
      const placement=mode??(timelinePrefs.magnet&&mainFilmTrack(draft,timelinePrefs.mainTrackId)?.id===trackId?'magnet':undefined);
      draft=placement?planFilmTimeline(draft,{type:'place',trackId,clip,mode:placement,idPrefix:uid()},timelinePrefs).document:applyFilmCommands(draft,[{type:'film.clip.add',trackId,clip}]);
      if(execute([{type:'film.document.restore',document:draft,expected:doc}])){canvasSelectionActive=false;selected=clip.id;activeTrack=trackId;activeMarker=undefined;rangeTracks.add(trackId);render();}
    }catch(error){report(error instanceof Error?error.message:String(error));}
  }
  function render() {
    const mainMenu=el<HTMLSelectElement>('main-track');mainMenu.replaceChildren(new Option('自动选择主轨',''),...doc.tracks.filter(t=>t.kind==='media'&&(!t.clips.length||t.clips.some(c=>doc.sources.find(s=>s.id===c.sourceId)?.kind!=='audio'))).map(t=>new Option(t.title,t.id)));mainMenu.value=timelinePrefs.mainTrackId??'';el<HTMLSelectElement>('follow').value=timelinePrefs.follow;el<HTMLInputElement>('linkage').checked=timelinePrefs.linkage;
    position = Math.min(position, filmDuration(doc));
    if (fit) zoom = fitZoom(filmDuration(doc), el('scroll').clientWidth);
    rangeTracks = new Set([...rangeTracks].filter(id => doc.tracks.some(t => t.id === id && !t.locked)));
    if (!selectedItem()) selected = undefined;
    if (!doc.tracks.some(t => t.id === activeTrack)) activeTrack = doc.tracks[0]?.id;
    if (!doc.markers.some(m => m.id === activeMarker)) activeMarker = undefined;
    if (rangeOut !== undefined && rangeOut > filmDuration(doc)) rangeOut = filmDuration(doc);
    renderTimeline(); renderStoryboard();syncSelection();
    const languageMenu = el<HTMLSelectElement>('preview-language'), previous = languageMenu.value;
    languageMenu.replaceChildren(...[['all','全部字幕'],['none','隐藏字幕'], ...[...new Set(doc.tracks.flatMap(t => t.kind === 'subtitle' ? [t.language] : []))].map(lang => [lang,lang])].map(([value,label]) => new Option(filmText(label),value)));
    languageMenu.value = [...languageMenu.options].some(o => o.value === previous) ? previous : 'all';
    previewLanguages = languageMenu.value === 'all' ? undefined : languageMenu.value === 'none' ? [] : [languageMenu.value];
    renderLibrary();
  }
  const selectNavigationPage=(id:string)=>{canvasSelectionActive=false;const clip=navigationTrack(doc,navTrackId)?.clips.find(c=>c.id===id);if(!clip)return;objectIds=[];objectClip=undefined;editingDomain='clips';selected=id;selectedIds.clear();selectedIds.add(id);playing=false;seek(clip.at);syncSelection();};
  function updateNavigationPosition(){const page=navigationTrack(doc,navTrackId)?.clips.find(c=>c.at<=position&&clipEnd(c)>position)?.id??'';if(page===lastNavPage)return;lastNavPage=page;const pages=filmUIState.getSnapshot().pages;if(pages)filmUIState.update({pages:{...pages,activePageId:page}});}
  function renderStoryboard(){
    const track=navigationTrack(doc,navTrackId);navTrackId=track?.id;
    const clips=[...(track?.clips??[])].filter(c=>doc.sources.find(s=>s.id===c.sourceId)?.kind!=='audio').sort((a,b)=>a.at-b.at);
    storyboard.update(doc,clips);lastNavPage=clips.find(c=>c.at<=position&&clipEnd(c)>position)?.id??'';
    filmUIState.update({pages:{documentId:doc.id+':'+sequencePath.join('/'),pages:clips.map(c=>({id:c.id,name:c.title})),activePageId:lastNavPage,select:selectNavigationPage,mountThumbnail:storyboard.mount,
      copy:id=>{const source=clips.find(c=>c.id===id);if(!source||!track)return;timelineEdit({type:'duplicate',ids:[id],at:clipEnd(source),idPrefix:uid()},{...timelinePrefs,magnet:true,mainTrackId:track.id});},
      remove:id=>{timelineEdit({type:'remove',ids:[id],ripple:true});},
      move:(id,index)=>{if(!track)return;const source=clips.find(c=>c.id===id),rest=clips.filter(c=>c.id!==id);if(!source)return;const at=index>=rest.length?Math.max(0,...rest.map(clipEnd)):rest[index].at;timelineEdit({type:'move',ids:[id],anchorId:id,delta:at-source.at,destination:track.id},{...timelinePrefs,magnet:true,mainTrackId:track.id});},
      settings:id=>{selectNavigationPage(id);sidebar.inspect('format');},
    }});
  }
  function paintReplacement(next: FilmDocument,resetDocument=true) {
    sourceView?.close();clearContent();if(resetDocument){rootDocument=next;sequencePath=[];sequenceViews.clear();}canvasSelectionActive=false;timelinePrefs=readTimelinePreferences(next.id+':'+sequencePath.join('/'),{newProject:next.frameRateMode==='auto'});linkage=timelinePrefs.linkage;selectedIds.clear();objectIds=[];objectClip=undefined;authorDraft=undefined;motaleEditing=false;motaleSelection.clear();motaleActs.clear();shuttle=1;
    try{navTrackId=localStorage.getItem('notale-navigation-track:'+next.id+':'+sequencePath.join('/'))??undefined;}catch{navTrackId=undefined;}
    cancelGesture?.(); maskEditing=false;clipEditing=false;overlayEditing=false;cropEditing=false; doc = next; activeTrack = next.tracks[0]?.id; activeMarker = undefined; selectedSource = next.sources[0]?.id; editSerial++; dirty = false; selected = undefined;mediaLibrary?.update();mediaLibrary?.select(selectedSource?[selectedSource]:[]); position = 0; playing = false; carry = 0; rangePlayback = false; rangeIn = rangeOut = undefined; rangeTracks = new Set(doc.tracks.filter(t => !t.locked).map(t => t.id)); fit = true; preview.reset(); render();
  }
  async function replace(input:FilmDocument|string) {
    if(!content.finish())return;
    sequencePath=[];
    const serial=++sessionSerial;loading=true;playing=false;cancelGesture?.();
    saveStatus('正在载入…');
    try {
      await session?.close();session=undefined;
      const next=await FilmSession.open(typeof input==='string'?input:{...input,id:uid()},(film,status,unsaved,undo,redo,snapshot)=>{
        if(disposed||serial!==sessionSerial)return;
        rootDocument=film;let view:FilmDocument;try{view=sequenceAt(film,sequencePath);}catch{sequencePath=[];view=film;preview.reset();}
        const changed=JSON.stringify(view)!==JSON.stringify(doc);
        changeFrameGrid(view);doc=view;dirty=unsaved;saveStatus(status);shell.update({document:snapshot,canUndo:undo,canRedo:redo,emptyMessage:null,canvas:'ready'});
        if(changed){cancelGesture?.();needsResume=true;editSerial++;render();}
      },error=>{if(!disposed&&serial===sessionSerial)report(String(error));});
      if(disposed||serial!==sessionSerial){await next.close();return;}
      session=next;paintReplacement(next.film);dirty=next.unsaved;
      const url=new URL(location.href);url.pathname='/';url.searchParams.delete('film');url.searchParams.set('document',next.id);history.replaceState(null,'',url);report('');void refreshCatalogue();
    }catch(error){if(!disposed){saveStatus('尚未保存');report(String(error));}}
    finally{if(serial===sessionSerial)loading=false;}
  }
  function showSequence(path:string[]){try{
    sourceView?.close();sequenceViews.set(JSON.stringify(sequencePath),{position,selected,ids:[...selectedIds],zoom,fit,left:el('scroll').scrollLeft,top:el('scroll').scrollTop});
    const next=sequenceAt(rootDocument,path),saved=sequenceViews.get(JSON.stringify(path));sequencePath=path;paintReplacement(next,false);
    if(saved){position=Math.min(saved.position,filmDuration(doc));selected=saved.selected;selectedIds.clear();saved.ids.forEach(id=>selectedIds.add(id));zoom=saved.zoom;fit=saved.fit;render();el('scroll').scrollLeft=saved.left;el('scroll').scrollTop=saved.top;}
    dirty=session?.unsaved??dirty;needsResume=true;updateEditPath();
  }catch(error){report(String(error));}}
  async function openSaved(){try{await openFilmProjects(root,id=>void replace(id));}catch(error){report(String(error));}}

  async function sample(intoLibrary = false) {
    if (!intoLibrary && dirty && !confirm(filmText('当前工作副本尚未保存。载入样片会替换它，继续吗？'))) return;
    if (loading || cancelGesture) return;
    const serial = ++loadSerial; loading = true;
    try {
      const name = el<HTMLSelectElement>('sample').value, response = await fetch(`/fixtures/motale/${name}/acts.json`, { signal });
      if (!response.ok) throw new Error(`样片载入失败（${response.status}）`);
      const value: unknown = await response.json(); if (serial !== loadSerial || disposed) return;
      const imported = importMotaleActs(value, { id: uid(), sourceId: uid(), uri: `/fixtures/motale/${name}/index.html` });
      if (intoLibrary) {
        const existing = doc.sources.find(s => s.kind === 'motale' && s.uri === imported.sources[0].uri);
        loading = false;
        if (existing || execute([{ type: 'film.source.add', source: imported.sources[0] }])) { selectedSource = existing?.id ?? imported.sources[0].id;mediaLibrary?.select([selectedSource]); renderLibrary(); }
        if (existing) report('');
      } else { await replace(imported); report(''); }
    } catch (e) { if (!disposed) report(String(e)); } finally { if (serial === loadSerial) loading = false; }
  }
  // A .motale file (Motale's docs/MOTALE-FORMAT.md) is a film: it opens as the working copy, as 载入幕表 does, and each act's clip
  // carries the author data it came with. The server keeps its files as an asset folder the preview and exports take whole.
  async function motaleFileImport() {
    if (dirty && !confirm(filmText('当前工作副本尚未保存。打开 .motale 会替换它，继续吗？'))) return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.motale';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file || loading || cancelGesture) return;
      const serial = ++loadSerial; loading = true;
      try {
        const response = await fetch('/api/film/motale-import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal });
        const data = await response.json() as { acts?: unknown; uri?: string; author?: unknown; message?: string; error?: string };
        if (!response.ok) throw new Error(data.message ?? data.error ?? `HTTP ${response.status}`);
        if (serial !== loadSerial || disposed) return;
        const imported = importMotaleActs(data.acts, { id: uid(), sourceId: uid(), uri: data.uri! });
        if (data.author) for (const track of imported.tracks) if (track.kind === 'media') for (const clip of track.clips) clip.motale = structuredClone(data.author) as NonNullable<FilmClip['motale']>;
        loading = false; await replace(imported); report('');
      } catch (e) { if (!disposed) report(String(e)); } finally { if (serial === loadSerial) loading = false; }
    };
    input.click();
  }
  /** The selected Motale source as a .motale file, with the author data of its clips (an act edited in two clips: the first one's). */
  async function motaleFileExport() {
    const source = doc.sources.find(s => s.id === selectedSource);
    if (source?.kind !== 'motale') { report('请先在素材库选择一个互动场景'); return; }
    const clips = doc.tracks.flatMap(track => track.kind === 'media' ? track.clips : []).filter(clip => clip.sourceId === source.id && clip.motale).sort((a, b) => a.at - b.at);
    const acts: NonNullable<FilmClip['motale']>['acts'] = {};
    for (const clip of clips) for (const [id, act] of Object.entries(clip.motale!.acts)) acts[id] ??= structuredClone(act);
    const author = clips.length ? { schema: clips.some(c => c.motale!.schema === 'motale-author/2') ? 'motale-author/2' : clips[0].motale!.schema, acts } : null;
    try {
      const response = await fetch('/api/film/motale-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uri: source.uri, author }), signal });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { message?: string; error?: string }; throw new Error(data.message ?? data.error ?? `HTTP ${response.status}`); }
      const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('content-disposition') ?? '')?.[1];
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await response.blob()), download: name ? decodeURIComponent(name) : 'Motale.motale' });
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 10_000); report('');
    } catch (e) { if (!disposed) report(String(e)); }
  }
  function pick(accept: string, apply: (text: string) => void) {
    const input = el<HTMLInputElement>('file'); input.accept = accept; input.value = '';
    const revision = editSerial;
    input.onchange = async () => { try { const file = input.files?.[0]; if (file) { const raw = await file.text(); if (disposed) return; if (revision !== editSerial || loading || cancelGesture) { report('影片已变化，请重新选择文件导入'); return; } apply(raw); } } catch (e) { report(String(e)); } }; input.click();
  }
  function action(name: string) {
    if(!['undo','redo'].includes(name)&&!content.finish())return;
    if(name==='lecture-import'){if(loading||cancelGesture)return;const scope=JSON.stringify([doc.id,sequencePath]);void importLecture(root,sources=>{if(disposed||JSON.stringify([doc.id,sequencePath])!==scope){report('影片已切换，请重新导入');return false;}return execute(sources.map(source=>({type:'film.source.add',source})));});return;}
    if (loading || cancelGesture) return;
    if(sourceView&&name!=='source-preview')sourceView.close();
    const unavailable=actionReason(name);if(unavailable){report(unavailable);return;}
    const c = current();
    switch (name) {
      case 'media-upload':case 'media-folder':{const id=JSON.stringify([doc.id,sequencePath]);void importMediaFiles(root,name==='media-folder',async sources=>{if(disposed||JSON.stringify([doc.id,sequencePath])!==id)throw Error('影片已切换，请重新导入');if(!importSources(sources))return false;selectedSource=sources.length===1?sources[0].id:undefined;mediaLibrary?.select(sources.map(s=>s.id));renderLibrary();await session?.save();if(session?.unsaved)throw Error('保存尚未确认，请检查保存状态');return true;},{signal}).catch(error=>{if(!signal.aborted)report(String(error));});break;}
      case 'rename':{const title=prompt(filmText('影片名称'),rootDocument.title);if(title?.trim()&&session){saveStatus('正在保存…');void session.rename(title.trim()).catch(error=>report(String(error)));}break;}
      case 'history':{if(sequencePath.length)showSequence([]);if(session)void showFilmHistory(root,session.id,()=>session!.save(),execute).catch(error=>report(String(error)));break;}
      case 'library-save':{if(!selectedIds.size){report('先选择要保存的片段');break;}const name=prompt(filmText('片段库名称'),current()?.title??filmText('片段组'));if(!name?.trim())break;const copy=copyFilmSelection(doc,selectedIds);for(const track of copy.tracks)if(track.kind==='subtitle')delete track.wordSourceId;const saved=parseFilmDocument({...doc,id:uid(),title:name.trim(),background:undefined,openfilm:undefined,tracks:copy.tracks,sources:copy.sources,fonts:copy.fonts,markers:[]});void filmLibrary.put({id:uid(),name:name.trim(),created:Date.now(),document:saved}).then(()=>report('已加入本机片段库')).catch(error=>report(String(error)));break;}
      case 'library-open':libraryDialog(root,saved=>{const ids=saved.tracks.flatMap(t=>(t.kind==='media'?t.clips:t.cues).map(c=>c.id)),copy=copyFilmSelection(saved,ids),plan=pasteFilmSelection(doc,copy,position,activeTrack,uid);if(!execute(plan.commands))return false;selectedIds.clear();plan.selected.forEach(id=>selectedIds.add(id));selected=plan.selected[0];syncSelection();return true;});break;
      case 'layout':layout.settings();break;
      case 'timeline-toggle':layout.toggleTimeline();break;
      case 'fullscreen':layout.fullscreen();break;
      case 'shortcuts':layout.help();break;
      case 'stage-settings':stageSettings(root,doc,execute,()=>doc);break;
      case 'sequence-up':if(sequencePath.length)showSequence(sequencePath.slice(0,-1));break;
      case 'sequence-import':pick('.json',text=>{const child=parseFilmDocument(JSON.parse(text)),id=uid();if(execute([{type:'film.source.add',source:{id,title:child.title,kind:'sequence',uri:`sequence:${id}`,sequence:child,width:child.width,height:child.height,duration:frameSeconds(Math.max(1,filmDuration(child)),child.frameRate)}}])){selectedSource=id;mediaLibrary?.select([id]);renderLibrary();}});break;
      case 'nest':{if(!selectedIds.size)break;const clipId=uid();if(execute([{type:'film.selection.nest',itemIds:[...selectedIds],id:uid(),sourceId:uid(),trackId:uid(),clipId,title:'嵌套序列'}])){selectedIds.clear();selected=clipId;syncSelection();}break;}
      case 'duplicate-selection':canvasSelectionActive=false;timelineEdit({type:'duplicate',ids:[...selectedIds],at:position,idPrefix:uid()});break;
      case 'new': void replace(emptyFilm(uid()));break;
      case 'server-open': void openSaved();break;
      case 'save': if(session)void session.save().catch(e=>report(String(e)));else void replace(doc);break;
      case 'undo':void content.history('undo');break;
      case 'redo':void content.history('redo');break;
      case 'motale-import': {
        const uri = el<HTMLInputElement>('motale-uri').value.trim();
        if (!uri) { report('请填写 Motale 网页地址'); el('motale-uri').focus(); break; }
        pick('.json', text => {
          const imported = importMotaleActs(JSON.parse(text), { id: uid(), sourceId: uid(), uri });
          const existing = doc.sources.find(s => s.kind === 'motale' && s.uri === uri);
          if (existing || execute([{ type: 'film.source.add', source: imported.sources[0] }])) { selectedSource = existing?.id ?? imported.sources[0].id;mediaLibrary?.select([selectedSource]); renderLibrary(); }
        }); break;
      }
      case 'motale-file-import': void motaleFileImport(); break;
      case 'source-motale-export': void motaleFileExport(); break;
      case 'sample': if (options.sampleLibrary) void sample(); break;
      case 'sample-import': if (options.sampleLibrary) void sample(true); break;
      case 'loop':loop=!loop;updateTransport();break;
      case 'clip-animation':if(c){if(expandedAnimations.has(c.id))expandedAnimations.delete(c.id);else expandedAnimations.add(c.id);renderTimeline();}break;
      case 'clip-timing':if(c){objectIds=[];objectClip=undefined;editingDomain='clips';syncSelection();sidebar.inspect('format');requestAnimationFrame(()=>{if(!disposed)timingPanel?.node.querySelector<HTMLInputElement>('[aria-label="音画淡入（秒）"]')?.focus();});}break;
      case 'edit-menu':{const origin=root.querySelector<HTMLElement>('[data-action=edit-menu]')!,rect=origin.getBoundingClientRect();contextMenu.open(rect.left,rect.bottom,timelineMenu(),focusTimeline,'时间线快捷菜单');break;}
      case 'copy':case 'cut':clipboard=copyFilmSelection(doc,selectedIds);if(name==='cut'&&clipboard.tracks.length)timelineEdit({type:'remove',ids:[...selectedIds],ripple:el<HTMLInputElement>('ripple').checked});break;
      case 'paste':if(clipboard)try{const plan=pasteFilmSelection(doc,clipboard,position,activeTrack,uid);if(execute(plan.commands)){selectedIds.clear();plan.selected.forEach(id=>selectedIds.add(id));selected=plan.selected[0];syncSelection();}}catch(error){report(String(error));}break;
      case 'copy-attributes':if(c)copiedAttributes=structuredClone(c);break;
      case 'paste-attributes':if(copiedAttributes&&selectedIds.size)pasteAttributesDialog(root,copiedAttributes,[...selectedIds].filter(id=>timelineItem(doc,id)?.kind==='media'),execute);break;
      case 'link':case 'unlink':execute([{type:'film.clips.link',clipIds:[...selectedIds].filter(id=>timelineItem(doc,id)?.kind==='media'),groupId:name==='link'?uid():undefined}]);break;
      case 'detach':if(c)execute([{type:'film.clip.detach',clipId:c.id,sourceId:uid(),audioClipId:uid(),trackId:uid(),groupId:uid()}]);break;
      case 'close-gap':case 'close-gaps':{const tracks=(timelinePrefs.follow==='all')?doc.tracks.filter(t=>!t.locked).map(t=>t.id):activeTrack?[activeTrack]:[];execute([{type:'film.gaps.close',trackIds:tracks,...(name==='close-gap'?{at:position}:{})}]);break;}
      case 'select-before':case 'select-after':{selectedIds.clear();for(const t of doc.tracks)if(!t.locked)for(const item of t.kind==='media'?t.clips:t.cues)if(name==='select-before'?clipEnd(item)<=position:item.at>=position)selectedIds.add(item.id);selected=[...selectedIds][0];syncSelection();break;}
      case 'source-properties':{const source=doc.sources.find(s=>s.id===selectedSource);if(source)sourceProperties(root,source,{relink:(id,mode)=>void relink(id,mode)});break;}
      case 'source-preview':{const source=doc.sources.find(s=>s.id===selectedSource);if(source)openSourcePreview(source);break;}
      case 'source-insert':addSourceClip(false,'insert');break;
      case 'source-overwrite':addSourceClip(false,'overwrite');break;
      case 'source-replace':if(c&&selectedSource)execute([{type:'film.clip.replace',clipId:c.id,sourceId:selectedSource}]);break;
      case 'source-place': addSourceClip(false); break;
      case 'source-append': addSourceClip(true); break;
      case 'source-remove': if (selectedSource) execute([{ type: 'film.source.remove', sourceId: selectedSource }]); break;
      case 'track-add': {
        const track: FilmMediaTrack = { id: uid(), title: `画面 / 声音 ${doc.tracks.filter(t => t.kind === 'media').length + 1}`, kind: 'media', locked: false, hidden: false, muted: false, clips: [] };
        if (execute([{ type: 'film.track.add', track, index: 0 }])) { selected = undefined; activeMarker = undefined; activeTrack = track.id; rangeTracks.add(track.id); render(); } break;
      }
      case 'marker-prev': case 'marker-next': {
        const at = adjacentTime(doc.markers.map(m => m.at), position, name === 'marker-prev' ? -1 : 1); if (at !== undefined) seek(at); break;
      }
      case 'cut-prev': case 'cut-next': {
        const at = adjacentTime(doc.tracks.flatMap(t => t.kind === 'media' ? t.clips.flatMap(c => [c.at, clipEnd(c)]) : []), position, name === 'cut-prev' ? -1 : 1); if (at !== undefined) seek(at); break;
      }
      case 'range-clip': { const found = selectedItem(); if (found) { rangeIn = found.item.at; rangeOut = clipEnd(found.item); updateRange(); } break; }
      case 'start': seek(0); break;
      case 'end': seek(filmDuration(doc)); break;
      case 'fit': setFit(); break;
      case 'range-in': rangeIn = position; updateRange(); break;
      case 'range-out': rangeOut = position; updateRange(); break;
      case 'range-clear': rangeIn = rangeOut = undefined; rangePlayback = false; updateRange(); break;
      case 'range-play': preview.resumeAudio(); if (rangeIn !== undefined && rangeOut !== undefined && rangeOut > rangeIn) { seek(rangeIn); rangePlayback = true; playing = true; } break;
      case 'range-lift': case 'range-extract': {
        try { const from = rangeIn!; const command = deleteRangeCommand(doc, rangeIn, rangeOut, rangeTracks, name === 'range-extract', uid()); if (execute([command])) { playing = false; rangePlayback = false; rangeIn = rangeOut = undefined; seek(from); updateRange(); } } catch (error) { report(String(error instanceof Error ? error.message : error)); } break;
      }
      case 'play': shuttle=1;preview.resumeAudio();rangePlayback = false; if (position >= filmDuration(doc)) position = 0; playing = !playing; carry = 0; needsResume = playing; updateTransport(); break;
      case 'back': case 'next': playing = false; position = stepFrame(doc, position, name === 'back' ? -1 : 1); needsResume = true; updateTransport(); break;
      case 'split': {const ids=selectedIds.size?[...selectedIds].filter(id=>timelineItem(doc,id)?.kind==='media'):doc.tracks.filter(t=>!t.locked).flatMap(t=>t.kind==='media'?t.clips.map(c=>c.id):[]);if(ids.length)timelineEdit({type:'split',ids,at:position,idPrefix:uid()});break;}
      case 'delete':timelineEdit({type:'remove',ids:[...selectedIds],ripple:el<HTMLInputElement>('ripple').checked});break;
      case 'mark': { const marker = { id: uid(), at: position, title: timecode(position, doc.frameRate) }; if (execute([{ type: 'film.marker.put', marker }])) { selected = undefined; activeMarker = marker.id; syncSelection(); } break; }
      case 'main-magnet':timelinePrefs.magnet=!timelinePrefs.magnet;saveTimelinePrefs();break;
      case 'rhythm-analyze':{const source=doc.sources.find(s=>s.id===(c?.sourceId??selectedSource));if(source)void analyzeRhythm(root,source,{document:()=>doc,execute,report,signal});break;}
      case 'rhythm-visible':rhythmVisible=!rhythmVisible;renderTimeline();break;
      case 'rhythm-snap':rhythmSnap=!rhythmSnap;break;
      case 'snap': snap = !snap; updateTransport(); break;
      case 'download': download(`${doc.title}.film.json`, JSON.stringify(doc, null, 2), 'application/json'); break;
      case 'export': playing=false;updateTransport();showFilmExport(root,structuredClone(doc),position,rangeIn!==undefined&&rangeOut!==undefined&&rangeOut>rangeIn?{start:rangeIn,end:rangeOut}:undefined);break;
      case 'html-open': {const uri=prompt(filmText('film.html 的 HTTP 地址（用于解析相对素材路径）'),new URL('/assets/film.html',location.href).href);if(uri)pick('.html,.htm',async text=>{const serial=++loadSerial;loading=true;playing=false;try{report('正在读取 film.html 与素材…');const imported=await openFilmFile(text,uri,uid(),'OpenFilm 影片');if(disposed||serial!==loadSerial)return;await replace(imported.document);report(imported.warnings.join('；'));}catch(error){report(String(error));}finally{if(serial===loadSerial)loading=false;}});break;}
      case 'html-download': {try{download('film.html',exportOpenFilmHtml(doc),'text/html');}catch(error){report(String(error));}break;}
      case 'open': if (!dirty || confirm(filmText('当前工作副本尚未保存。打开另一份影片会替换它，继续吗？'))) {
        const input=el<HTMLInputElement>('file'),revision=editSerial;input.accept='.json,.zip';input.value='';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;loading=true;playing=false;try{const imported=await importFilmPackage(file,{signal});if(disposed)return;if(revision!==editSerial)throw Error('影片已变化，请重新选择文件导入');await replace(imported);}catch(error){if(!disposed)report(String(error));}finally{loading=false;}};input.click();
      }break;
      case 'caption': case 'caption-update': {
        const language = el<HTMLInputElement>('language').value, text = el<HTMLTextAreaElement>('caption').value.trim(); if (!text) return;
        const found = selectedItem(), editing = name === 'caption-update' && found?.kind === 'subtitle' ? found : undefined;
        if (name === 'caption-update' && !editing) return;
        const t = editing?.track.language === language ? editing.track : doc.tracks.find(t => t.kind === 'subtitle' && t.language === language&&!t.sourceClipId&&!t.wordSourceId&&!t.locked) as FilmSubtitleTrack | undefined;
        const track: FilmSubtitleTrack = t ?? { id: uid(), title: language, kind: 'subtitle', language, locked: false, hidden: false, muted: false, cues: [] };
        const commands: FilmCommand[] = t ? [] : [{ type: 'film.track.add', track }];
        const cue = editing ? { ...editing.item, text } : { id: uid(), at: position, duration: secondsFrame(3, doc.frameRate), text };
        if (editing && editing.track.id !== track.id) commands.push({ type: 'film.cue.delete', trackId: editing.track.id, cueId: cue.id });
        commands.push({ type: 'film.cue.put', trackId: track.id, cue });
        if (execute(commands)) { rangeTracks.add(track.id); selected = cue.id; renderTimeline(); syncSelection(); } break;
      }
      case 'vtt-import': pick('.vtt', text => execute([{ type: 'film.track.add', track: importVtt(text, { id: uid(), language: el<HTMLInputElement>('language').value, rate: doc.frameRate }) }])); break;
      case 'vtt-export': {
        const t = doc.tracks.find(t => t.kind === 'subtitle' && t.language === el<HTMLInputElement>('language').value);
        if (t?.kind === 'subtitle') download(`${doc.title}.${t.language}.vtt`, exportVtt(t, doc.frameRate), 'text/vtt'); break;
      }
    }
    refreshActionButtons();
  }
  function chooseObjects(clipId:string,ids:string[],locate=true){
    const found=timelineItem(doc,clipId);if(found?.kind!=='media')return;
    playing=false;preview.pause();selected=clipId;selectedIds.clear();selectedIds.add(clipId);
    contentOwner=clipId;objectClip=clipId;objectIds=[...new Set(ids)];editingDomain='objects';motaleEditing=false;overlayEditing=true;clipEditing=maskEditing=cropEditing=false;
    if(locate&&(position<found.item.at||position>=clipEnd(found.item)))seek(found.item.at);
    syncSelection();if(ids.length)sidebar.onObjectSelection();updateTransport();
  }
  mediaLibrary=mountMediaLibrary(el('sources'),{
    document:()=>doc,execute,report,query:()=>el<HTMLInputElement>('source-search').value.trim(),kind:()=>el<HTMLSelectElement>('source-kind').value,
    select:id=>{selectedSource=id;mediaLibrary?.select([id]);renderLibrary();},selectionChanged:ids=>{selectedSource=ids.length===1?ids[0]:undefined;renderLibrary();},
    relink:(id,mode)=>void relink(id,mode),
    preview:id=>{selectedSource=id;mediaLibrary?.select([id]);renderLibrary();action('source-preview');},append:ids=>addSources(ids,'append'),
  });cleanup.push(()=>mediaLibrary?.dispose());
  authoring=mountFilmAuthoring({
    document:()=>doc,clip:()=>selectedIds.size>1||motaleEditing?undefined:current(),selected:()=>objectIds,position:()=>position,scope:()=>JSON.stringify([rootDocument.id,sequencePath]),locked:()=>!!selectedTrack()?.locked,
    selectionChanged:ids=>{if(selected)chooseObjects(selected,ids);},executeFilm:execute,
    readStyle:(id,property)=>selected?preview.readObjectStyle(selected,id,property):Promise.reject(Error('请选择对象')),
    capture:(ids)=>{
      if(!selected)return Promise.reject(Error('请选择对象'));
      preview.frame(authorDraft??gestureDraft??doc,frameSeconds(position,doc.frameRate),needsResume,previewLanguages,false);
      return preview.captureObjects(selected,ids);
    },
    previewDraft:value=>{authorDraft=value;needsResume=true;},runtimeSelect:ids=>{if(selected)preview.selectObjects(selected,ids);},
    report:error=>report(String(error)),shell,signal,pause:()=>{playing=false;preview.pause();},seek:at=>{playing=false;seek(at);},
  });cleanup.push(()=>authoring?.dispose());
  preview.bindAuthoring({selection:(clipId,ids)=>{
    const found=timelineItem(doc,clipId);
    if(found?.kind==='media'&&position>=found.item.at&&position<clipEnd(found.item))chooseObjects(clipId,ids,false);
  },commands:async(clipId,commands,origin)=>{
    const found=timelineItem(doc,clipId);
    if(found?.kind!=='media')throw Error('原片段已移除，修改未保存');
    if(origin&&(origin.documentId!==undefined&&origin.documentId!==doc.id||origin.sourceId!==undefined&&origin.sourceId!==found.item.sourceId||origin.clipAt!==undefined&&origin.clipAt!==found.item.at||origin.animationOffset!==undefined&&origin.animationOffset!==(found.item.animationOffset??0)))throw Error('原片段位置或来源已变化，修改未保存');
    const at=origin?.frame??position;
    if(!Number.isSafeInteger(at)||at<found.item.at||at>=clipEnd(found.item))throw Error('原编辑位置已变化，修改未保存');
    const changes=filmAuthorCommands(doc,found.item,at,commands,found.track.locked);
    if(changes.length&&!execute(changes))throw Error('对象修改未应用');
    authoring?.update(true);
  },event:(clipId,type,data)=>{
    if(type==='context-dismiss'){contextMenu.close();return;}
    if(type==='object-context'){
      const found=timelineItem(doc,clipId),point=preview.menuPoint(clipId,data.x,data.y);
      if(!point||found?.kind!=='media'||playing||loading||position<found.item.at||position>=clipEnd(found.item)||!Array.isArray(data.ids))return;
      chooseObjects(clipId,data.ids,false);
      const focus=()=>{el('picture').focus({preventScroll:true});preview.sendAuthor(clipId,data.text?'text-refocus':'focus',data.text?{sessionId:data.text.sessionId}:{});};
      if(!data.text){contextMenu.open(point.x,point.y,objectMenu('objects'),focus,'对象快捷菜单');return;}
      const text=data.text,stamp=menuScope(),locked=found.track.locked||data.info?.some((item:{locked?:boolean})=>item.locked);
      const send=(type:string,payload:Record<string,unknown>={})=>{if(stamp!==menuScope())throw Error('文字选区已变化，请重新操作');preview.sendAuthor(clipId,type,{sessionId:text.sessionId,selectionToken:text.selectionToken,...payload});};
      const write=()=>typeof navigator.clipboard?.write==='function'&&typeof window.ClipboardItem==='function'?navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text.selectedText],{type:'text/plain'}),'text/html':new Blob([text.selectedHtml],{type:'text/html'})})]):navigator.clipboard.writeText(text.selectedText);
      contextMenu.open(point.x,point.y,[
        {id:'text-copy',label:'复制文字',icon:'copy',shortcut:'Ctrl/⌘ C',disabled:text.collapsed,reason:text.collapsed?'请选择文字':undefined,run:write},
        {id:'text-cut',label:'剪切文字',icon:'cut',shortcut:'Ctrl/⌘ X',disabled:locked||text.collapsed,run:async()=>{await write();send('text-replace',{text:''});}},
        {id:'text-paste',label:'粘贴文字',icon:'paste',shortcut:'Ctrl/⌘ V',disabled:locked,run:async()=>send('text-replace',{text:await navigator.clipboard.readText()})},
        {id:'text-select-all',label:'全选文字',shortcut:'Ctrl/⌘ A',separator:true,run:()=>send('text-select-all')},
        {id:'text-end',label:'结束文字编辑',run:()=>send('text-end')},
      ],focus,'文字快捷菜单');return;
    }
    if(type==='ready' &&!playing)authoring?.update(true);
    if(type==='motale-ready'){
      const clip=doc.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(clip=>clip.id===clipId),source=doc.sources.find(source=>source.id===clip?.sourceId),context=preview.motaleContext(clipId);
      if(source&&context){motaleActs.set(JSON.stringify([source.id,source.uri]),context.hello.acts.map(({id,start,end})=>({id,start,end})));if(expandedAnimations.size)renderTimeline();}
      if(clipId===selected)motalePanel?.refresh(true);
    }
    if(type==='motale-author'&&!data.own&&clipId===selected){motaleEditing=false;motalePanel?.refresh(true);}
    if(type==='motale-select'&&clipId===selected&&motaleEditing&&!playing&&!selectedTrack()?.locked){
      const context=preview.motaleContext(clipId);if(context?.instance!==data.instance)return;
      const id=data.hit?.id,previous=selectedMotaleObjects(clipId);
      selectMotaleObjects(clipId,id?(data.shift?(previous.includes(id)?previous.filter(value=>value!==id):[...previous,id]):[id]):data.shift?previous:[]);
      motalePanel?.refresh(true);sidebar.onObjectSelection();preview.focusMotaleSelection(clipId);
    }
  },action:(clipId,name)=>{
    if(['undo','redo','save'].includes(name)){action(name);return;}
    if(clipId!==selected)throw Error('选区已变化，请重新操作');
    if(name==='escape'&&contentOwner){returnToClip();return;}
    return authoring!.action(name);
  }});
  const insertionScope=()=>JSON.stringify([rootDocument.id,sequencePath,position,activeTrack]);
  async function insertCatalog(kind:string,value?:string,client?:{x:number;y:number},targetTrack?:string){
    if(loading||!session)throw Error('编辑器仍在载入');
    const reason=filmInsertionReason(kind);if(reason)throw Error(reason);
    const chosen=doc.tracks.find(track=>track.id===(targetTrack??activeTrack));if(chosen?.locked)throw Error('轨道已锁定，请选择可写轨道');
    playing=false;preview.pause();
    if(['image','video','audio'].includes(kind)){
      const stamp=insertionScope();
      await importMediaFiles(root,false,async sources=>{
        if(disposed||insertionScope()!==stamp)throw Error('编辑位置已变化，请重新选择插入位置');
        let draft=prepareFirstVideoRate(doc,sources);draft.sources.push(...sources);const clips:FilmClip[]=[];let next=position;
        let trackId=targetTrack??(kind==='audio'?doc.tracks.find(t=>t.kind==='media'&&t.clips.length&&t.clips.every(c=>doc.sources.find(s=>s.id===c.sourceId)?.kind==='audio')&&!t.locked)?.id:mainFilmTrack(doc,timelinePrefs.mainTrackId)?.id);
        if(!trackId){trackId=uid();draft.tracks.unshift({id:trackId,title:kind==='audio'?'声音':'画面',kind:'media',locked:false,hidden:false,muted:false,clips:[]});}
        for(const source of sources){const duration=source.kind==='image'?insertionDuration(draft,next,navTrackId):secondsFrame(source.duration??0,draft.frameRate);if(duration<1)throw Error('无法读取素材时长');const clip:FilmClip={id:uid(),sourceId:source.id,title:source.title,at:next,in:0,duration};
          draft=timelinePrefs.magnet&&mainFilmTrack(draft,timelinePrefs.mainTrackId)?.id===trackId?planFilmTimeline(draft,{type:'place',trackId,clip,mode:'magnet',idPrefix:uid()},timelinePrefs).document:applyFilmCommands(draft,[{type:'film.clip.add',trackId,clip}]);clips.push(clip);next=clipEnd(timelineItem(draft,clip.id)!.item);}
        if(!execute([{type:'film.document.restore',document:parseFilmDocument(draft),expected:doc}]))return false;
        canvasSelectionActive=false;objectIds=[];objectClip=undefined;selected=clips[0]?.id;selectedIds.clear();clips.forEach(c=>selectedIds.add(c.id));activeTrack=trackId;syncSelection();await session?.save();if(session?.unsaved)throw Error('保存尚未确认，请检查保存状态');return true;
      },{kind:kind as FilmSource['kind'],signal});return;
    }
    const bounds=el('picture').getBoundingClientRect(),scale=Math.min(bounds.width/doc.width,bounds.height/doc.height)||1;
    const point=client?{x:(client.x-bounds.left-(bounds.width-doc.width*scale)/2)/scale,y:(client.y-bounds.top-(bounds.height-doc.height*scale)/2)/scale}:undefined;
    const plan=nativeInsertPlan({document:doc,kind,value,at:position,duration:insertionDuration(doc,position,navTrackId),point,trackId:targetTrack});
    if(!execute(plan.commands))throw Error('素材未插入');
    activeTrack=plan.trackId;selectedSource=plan.sourceId;mediaLibrary?.select([plan.sourceId]);chooseObjects(plan.clipId,[plan.target]);
    preview.selectObjects(plan.clipId,[plan.target]);if(plan.text)pendingText={clipId:plan.clipId,target:plan.target};
  }
  const insertionDrop=bindInsertionDrop({scope:insertionScope,bounds:()=>el('picture').getBoundingClientRect(),insert:insertCatalog,error:error=>report(String(error))});
  const insertion=bindInsertActions({insert:insertCatalog,drag:insertionDrop.show,error:error=>report(String(error)),unavailableReason:kind=>kind==='document:size'?(sequencePath.length?'子序列尺寸请在时间线的画面设置中调整':undefined):filmInsertionReason(kind)});
  const templates=bindTemplateLibrary({catalog:async()=>{const response=await fetch(TEMPLATE_CATALOG_BASE+'manifest.json',{signal});if(!response.ok)throw Error('模板暂时无法加载，请重试');return ((await response.json()) as {templates:TemplateEntry[]}).templates;},preload:async()=>{},insert:async(_id,kind)=>{throw Error(filmInsertionReason('template:'+kind));},error:error=>report(String(error))});
  signal.addEventListener('abort',()=>templates.dispose(),{once:true});

  cleanup.push(()=>{insertion.dispose();insertionDrop.dispose();});signal.addEventListener('abort',()=>{insertion.dispose();insertionDrop.dispose();filmUIState.reset();},{once:true});
  root.addEventListener('contextmenu',openContext,{signal});
  root.addEventListener('keydown',event=>{if(!event.isComposing&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'))openContext(event);},{signal});
  root.addEventListener('film-command',e=>action((e as CustomEvent<string>).detail),{signal});
  root.addEventListener('click', e => { const target = (e.target as Element).closest<HTMLElement>('[data-action]'); if (target&&!e.defaultPrevented) action(target.dataset.action!); }, { signal });
  el<HTMLInputElement>('linkage').addEventListener('change',()=>{timelinePrefs.linkage=el<HTMLInputElement>('linkage').checked;saveTimelinePrefs();},{signal});
  el<HTMLSelectElement>('follow').addEventListener('change',()=>{timelinePrefs.follow=el<HTMLSelectElement>('follow').value as FilmTimelinePreferences['follow'];saveTimelinePrefs();},{signal});
  el<HTMLSelectElement>('main-track').addEventListener('change',()=>{timelinePrefs.mainTrackId=el<HTMLSelectElement>('main-track').value||undefined;saveTimelinePrefs();},{signal});
  el<HTMLInputElement>('seek').addEventListener('input', e => { seek(Number((e.target as HTMLInputElement).value)); }, { signal });
  function changeZoom(next:number,anchor?:number) {
    if(cancelGesture)return;const scroll=el('scroll');
    const at=anchor??Math.max(TIMELINE_GUTTER,Math.min(scroll.clientWidth-32,timelineX(position,zoom)-scroll.scrollLeft));
    const offset=zoomScroll(zoom,next,scroll.scrollLeft,at);fit=false;zoom=next;
    renderTimeline();scroll.scrollLeft=offset;el<HTMLInputElement>('zoom').value=String(Math.log10(zoom));paintRuler();positionPlayhead();
  }
  el<HTMLInputElement>('zoom').addEventListener('input', e => changeZoom(10 ** Number((e.target as HTMLInputElement).value)), { signal });
  el('scroll').addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey)||cancelGesture)return;e.preventDefault();changeZoom(Math.max(.002,Math.min(6,zoom*Math.exp(-e.deltaY*.005))),Math.max(TIMELINE_GUTTER,e.clientX-el('scroll').getBoundingClientRect().left));},{signal,passive:false});
  let rulerRaf=0;
  el('scroll').addEventListener('scroll',()=>{positionPlayhead();if(!rulerRaf)rulerRaf=requestAnimationFrame(()=>{rulerRaf=0;paintRuler();});},{signal,passive:true});
  signal.addEventListener('abort',()=>cancelAnimationFrame(rulerRaf),{once:true});
  for (const which of ['in', 'out'] as const) el<HTMLInputElement>(`range-${which}`).addEventListener('change', event => {
    const raw = (event.target as HTMLInputElement).value, value = raw === '' ? undefined : Number(raw);
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > filmDuration(doc))) { report('区间点须是影片内的整数帧'); updateRange(); return; }
    if (which === 'in') rangeIn = value; else rangeOut = value; updateRange();
  }, { signal });
  el<HTMLSelectElement>('preview-language').addEventListener('change', () => {
    const value = el<HTMLSelectElement>('preview-language').value; previewLanguages = value === 'all' ? undefined : value === 'none' ? [] : [value];
  }, { signal });
  const resize = new ResizeObserver(() => { if (fit && !cancelGesture) setFit(); }); resize.observe(el('scroll'));cleanup.push(()=>resize.disconnect());
  el<HTMLInputElement>('source-search').addEventListener('input', renderLibrary, { signal });
  el<HTMLSelectElement>('source-track').addEventListener('change', () => { activeTrack = el<HTMLSelectElement>('source-track').value; selected = undefined; activeMarker = undefined; syncSelection(); renderLibrary(); }, { signal });
  el<HTMLSelectElement>('source-act').addEventListener('change', () => {
    const source = doc.sources.find(s => s.id === selectedSource); if (!source) return;
    const value = el<HTMLSelectElement>('source-act').value, index = Number(value);
    el<HTMLInputElement>('source-in').value = String(value === '' ? 0 : source.markers?.[index]?.time ?? 0);
    el<HTMLInputElement>('source-out').value = String(value === '' ? source.duration ?? 5 : source.markers?.[index]?.end ?? source.markers?.[index + 1]?.time ?? source.duration ?? 5);
  }, { signal });
  el<HTMLFormElement>('media-form').addEventListener('submit', async e => {
    e.preventDefault(); const scope=JSON.stringify([rootDocument.id,sequencePath]);const data = new FormData(el<HTMLFormElement>('media-form')), seconds = Number(data.get('duration')), uri = String(data.get('uri'));
    const source: FilmSource = { id: uid(), title: uri.split('/').at(-1) || uri, uri, kind: String(data.get('kind')) as FilmSource['kind'], duration: seconds };
    if(source.kind==='video'||source.kind==='audio')try{const meta=await mediaJson('/film-media/metadata?uri='+encodeURIComponent(uri),{signal}),video=meta.streams?.find((stream:{codec_type:string})=>stream.codec_type==='video');source.fingerprint=meta.fingerprint;if(meta.duration)source.duration=meta.duration;if(source.kind==='video')source.frameRate=videoFrameRate(video);}catch{}
    if(disposed||JSON.stringify([rootDocument.id,sequencePath])!==scope)return;
    if(importSources([source])){selectedSource=source.id;mediaLibrary?.select([source.id]);renderLibrary();}
  }, { signal });
  window.addEventListener('keydown', e => {
    if(e.defaultPrevented||e.isComposing)return;
    if (e.key === 'Escape' && cancelGesture) { e.preventDefault(); cancelGesture(); return; }
    const target=e.target instanceof Element?e.target:undefined;
    if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="menu"],[popover]')||e.key==='Escape'&&document.querySelector('[popover]:popover-open'))return;
    const modifier=e.ctrlKey||e.metaKey,keyName=e.key.toLowerCase();
    // Unassigned Alt/AltGraph combinations belong to the browser or OS.
    if(e.altKey&&(modifier||keyName!=='m'))return;
    if(modifier&&['z','s','y'].includes(keyName)){e.preventDefault();action(keyName==='s'?'save':keyName==='y'||e.shiftKey?'redo':'undo');return;}
    if(target?.closest('button,a,[role="button"]')&&[' ','Enter'].includes(e.key))return;
    const inTimeline=!!target?.closest('.film-timeline'),inSidebar=!!target?.closest('#tool-panel,#page-panel,#property-panel,.tool-rail,.app-header');
    if(sourceView){if(e.key==='Escape'){e.preventDefault();sourceView.close();}return;}
    if(e.key==='Escape'&&contentOwner){e.preventDefault();returnToClip();return;}
    if(e.key==='Escape'&&sequencePath.length){e.preventDefault();showSequence(sequencePath.slice(0,-1));return;}
    if(inSidebar)return;
    if(motaleEditing&&selected&&!inTimeline){
      if(modifier&&keyName==='a'){
        const context=preview.motaleContext(selected);
        if(context?.act.objects){e.preventDefault();selectMotaleObjects(selected,context.bridge.objects(context.act.id,context.time,{parameters:'film'}).filter(object=>object.editable&&object.visible).map(object=>object.id));motalePanel?.refresh(true);}
        return;
      }
      if(e.key==='Escape'){e.preventDefault();preview.cancelMotaleGesture();preview.cancelCanvasSelection();selectMotaleObjects(selected,[]);motalePanel?.refresh(true);return;}
      if(['Delete','Backspace'].includes(e.key)||modifier&&['c','x','v','d'].includes(keyName)){
        e.preventDefault();const command=motaleStructureKey(e);if(command&&!e.repeat){structureActions.run(command);motalePanel?.refresh(true);}return;
      }
    }
    if((objectIds.length||editingDomain==='objects')&&!inTimeline){
      const objectAction=modifier?({c:'copy',x:'cut',v:'paste',d:'duplicate',a:'select-all'} as Record<string,string>)[keyName]:({Delete:'delete',Backspace:'delete',Escape:'escape'} as Record<string,string>)[e.key];
      if(objectAction){e.preventDefault();void authoring?.action(objectAction).catch(error=>report(String(error)));return;}
    }
    if(!modifier&&e.key==='Escape'){e.preventDefault();preview.cancelMotaleGesture();preview.cancelCanvasSelection();canvasSelectionActive=false;objectIds=[];objectClip=undefined;editingDomain='clips';selectedIds.clear();selected=undefined;activeMarker=undefined;timelineClicks.reset();syncSelection();return;}
    if(modifier&&['c','x','v'].includes(keyName)){e.preventDefault();action(keyName==='c'?(e.shiftKey?'copy-attributes':'copy'):keyName==='x'?'cut':e.shiftKey?'paste-attributes':'paste');return;}
    if(modifier){if(keyName==='a'){e.preventDefault();objectIds=[];objectClip=undefined;selectedIds.clear();for(const t of doc.tracks)if(!t.locked)for(const item of t.kind==='media'?t.clips:t.cues)selectedIds.add(item.id);selected=[...selectedIds][0];syncSelection();}else if(keyName==='d'){e.preventDefault();action('duplicate-selection');}return;}
    const key=e.key.toLowerCase();if(e.shiftKey&&key==='l'){e.preventDefault();action('loop');return;}if(e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();playing=false;seek(position+(e.key==='ArrowLeft'?-10:10));return;}if(key===','||key==='.'||key==='['||key===']'){e.preventDefault();action(({',':'source-insert','.':'source-overwrite','[':'select-before',']':'select-after'} as Record<string,string>)[key]);return;}
    if(['j','k','l'].includes(key)){e.preventDefault();if(e.repeat&&!holdK)return;if(key==='k'){holdK=true;playing=false;shuttle=1;preview.pause();updateTransport();}else if(holdK)action(key==='j'?'back':'next');else{const direction=key==='j'?-1:1;shuttle=playing&&Math.sign(shuttle)===direction?direction*Math.min(8,Math.abs(shuttle)*2):direction;playing=true;rangePlayback=false;carry=0;needsResume=true;preview.resumeAudio();updateTransport();}return;}
    const mode=({v:'select',b:'ripple',n:'roll',y:'slip',u:'slide'} as const)[key as 'v'];if(mode&&!e.altKey){e.preventDefault();el<HTMLSelectElement>('tool').value=mode;return;}
    if(['q','w','e'].includes(key)&&current()){e.preventDefault();const clip=current()!,edge=key==='q'?'in':key==='w'?'out':position-clip.at<clipEnd(clip)-position?'in':'out';timelineEdit({type:'trim',clipId:clip.id,edge,delta:position-(edge==='in'?clip.at:clipEnd(clip)),ripple:key!=='e'});return;}
    if (e.key.toLowerCase() === 'm' && (e.shiftKey || e.altKey)) { e.preventDefault(); action(e.altKey ? 'marker-next' : 'marker-prev'); return; }
    if (e.altKey) return;
    const name = ({ ' ': 'play', ArrowLeft: 'back', ArrowRight: 'next', Home: 'start', End: 'end', ArrowUp: 'cut-prev', ArrowDown: 'cut-next', x: 'range-clip', m: 'mark', i: 'range-in', o: 'range-out', Delete: 'delete', Backspace: 'delete' } as Record<string, string>)[e.key];
    if (name) { e.preventDefault(); if(name==='play'&&e.repeat)return;action(name); }
  }, { signal });
  window.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='k')holdK=false;},{signal});
  window.addEventListener('blur',()=>{holdK=false;},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)holdK=false;},{signal});
  window.addEventListener('beforeunload', e => { if (dirty||content.pending) { e.preventDefault(); e.returnValue = ''; } }, { signal });
  function tick(now: number) {
    meters.refresh(now);
    if (disposed) return;
    contextMenu.refresh();content.refresh();
    if(sourceView){raf=requestAnimationFrame(tick);return;}
    maskPanel?.refresh();colorPanel?.refresh();finalScopes?.refresh();
    const dt = Math.min(100, now - last); last = now;
    preview.editMask(maskEditing&&!playing?selected:undefined,maskId);
    preview.editCrop(cropEditing&&!playing&&selectedIds.size===1?selected:undefined);
    preview.editClips(clipEditing&&!playing?[...selectedIds]:[]);
    preview.editOverlay(overlayEditing&&!playing?selected:undefined);
    preview.setMotaleAuthorMode(motaleEditing&&!playing&&selectedIds.size===1&&!selectedTrack()?.locked?selected:undefined);
    preview.setRate(shuttle);
    const ready = preview.frame(authorDraft ?? gestureDraft ?? doc, frameSeconds(position, doc.frameRate), needsResume, previewLanguages, playing && !loading);
    if (ready) {needsResume = false;if(!authorReady&&!playing)authoring?.update(true);}
    if(selected&&motaleEditing)preview.selectMotaleObjects(selected,selectedMotaleObjects(selected));
    authorReady=ready;motalePanel?.refresh();
    if(ready&&pendingText){const text=pendingText;pendingText=undefined;preview.selectObjects(text.clipId,[text.target]);void preview.startText(text.clipId,text.target,true).catch(error=>report(String(error)));}

    if (playing && ready && !loading) {
      carry += dt * doc.frameRate.numerator / doc.frameRate.denominator / 1000*Math.abs(shuttle);
      const advance = Math.floor(carry); carry -= advance; position = Math.max(0,Math.min(filmDuration(doc), position + advance*Math.sign(shuttle)));
      if (rangePlayback && rangeOut !== undefined && position >= rangeOut) { if(loop){position=rangeIn??0;needsResume=true;}else{position = rangeOut; playing = false; rangePlayback = false;} }
      if (position >= filmDuration(doc)||position===0&&shuttle<0){if(loop){position=shuttle<0?Math.max(0,filmDuration(doc)-1):0;needsResume=true;}else playing=false;}
      if (advance) { const scroll = el('scroll'), x = timelineX(position, zoom); if (x > scroll.scrollLeft + scroll.clientWidth - 24 || x < scroll.scrollLeft + TIMELINE_GUTTER) scroll.scrollLeft = Math.max(0, x - TIMELINE_GUTTER - 30); }
      updateTransport();
    }
    raf = requestAnimationFrame(tick);
  }
  const unsubscribeLocale=localeStore.subscribe(()=>{cancelGesture?.();preview.invalidateOcclusion();render();report(statusMessage);});signal.addEventListener('abort',unsubscribeLocale,{once:true});
  render(); raf = requestAnimationFrame(tick);
  shellActions.loadDocument=openEditorDocument;
  shellActions.undo=()=>content.history('undo');
  shellActions.redo=()=>content.history('redo');
  shellActions.renameDocument=async(source,title)=>{if(source.id!==session?.id)throw Error('文件已切换');await session.rename(title);};
  shellActions.saveDeckSize=async(source,text)=>{
    if(sequencePath.length)throw Error('子序列尺寸请在时间线的画面设置中调整');
    if(source.key!==doc.id||source.value!==sizeValue(doc.width,doc.height))throw Error('页面尺寸已变化，请按 Esc 载入最新尺寸');
    const value=JSON.parse(text),width=Number(value.width),height=Number(value.height);
    if(![width,height].every(v=>Number.isInteger(v)&&v>=100&&v<=10000))throw Error('宽高须为 100–10000 之间的整数');
    if(width!==doc.width||height!==doc.height){if(!execute([{type:'film.settings.update',patch:{width,height}}]))throw Error('未能更新画面尺寸');await session?.save();}
  };
  shellActions.saveTheme=async()=>{throw Error('影片尚不支持讲义主题');};
  shellActions.openHistory=async()=>{action('history');};
  shellActions.reportError=error=>report(String(error));
  surfaceActions.run=name=>action(name);
  const ready=replace(options.documentId);
  void ready;
  void refreshCatalogue();
  return {beforeLeave:async()=>{await ready;if(!content.finish())throw Error('请先完成当前内容编辑');preview.cancelCanvasSelection();await preview.flushAuthoring();await session?.save();if(!session||session.unsaved)throw Error('当前修改尚未保存，请保存或下载工作副本后再切换文件');}, dispose() { void session?.close().catch(e=>console.error(e));sessionSerial++;cancelGesture?.(); disposed = true; resize.disconnect(); abort.abort(); cancelAnimationFrame(raf);content.dispose();sourceView?.close();propertiesPanel?.dispose(); motalePanel?.dispose();finalScopes?.dispose();colorPanel?.dispose();storyboard.dispose();preview.dispose(); clearPanels(); } };
  } catch(error){disposed=true;abort.abort();cancelAnimationFrame(raf);for(const dispose of cleanup.reverse())dispose();void session?.close();throw error;}
}
