import {type Command,commitSchema} from '@notale/editor/browser';
import {applyFilmCommands,clipAppearance,type FilmDocument,type FilmClip,type FilmCommand,type FilmProperty,type FilmEasing,filmNumericLimits,validFilmStyleName,validFilmProperty} from '@notale/editor/film';
import {editorActions, type EditorSession} from '../state/editor-session';
import {scopeActions} from '../state/action-scope';
import {inspectSelection,emptyInspector} from '../state/inspector';
import {layerRows} from '../state/layers';
import type {LayerState} from '../state/layers';
import {relativeLayerCommands,type LayerPlacement} from '../state/layer-reorder';
import {captureLayerPlan,layerPlanCommands} from '../state/layer-commands';
import {bindAppearance} from '../state/appearance-editor';
import {bindTypography} from '../state/typography-editor';
import {bindArrangement,arrangementSettings,type LayerAction} from '../state/arrangement';
import {bindCodeEditor} from '../state/code-editor';
import {bindRichEditor} from '../state/rich-editor';
import {bindAnimationGallery,animationEffectGroups} from '../state/animation-gallery';
import {bindAnimationControls} from '../state/animation-controls';
import {bindAnimationList} from '../state/animation-list';
import {bindAnimationForm} from '../state/animation-form';
import {AnimationDraft} from '../state/animation-draft';
import {geometryCommand,alignmentCommands,selectionBounds,type ObjectRect} from '../object-geometry';
import {cleanOverlayHtml} from './overlay-page';
import {filmAuthorCommands,overlayHtml,overlayObjects,objectStyleCommand,type FilmAuthorObject} from './authoring-commands';
import {filmPresetEffects,presetProperty,objectPreset,clipPreset,clipStyleCommand} from './authoring-animation';
import {bindFilmAuthoringState,type FilmAuthoringOrigin} from './authoring-state';
import {propertyLabels,objectProperties,clipProperties,propertyMetadata,validEasing} from './authoring-properties';
import {reorderOverlaySvg,overlayOrderObjects} from './overlay-structure';
import {bindProjectFonts} from './project-fonts';

export interface FilmAuthorCapture {computedStyles:Record<string,Record<string,string>>;rectangles:ObjectRect[];}
export interface FilmAuthoringOptions {
 document:()=>FilmDocument;clip:()=>FilmClip|undefined;selected:()=>string[];position:()=>number;
 scope?:()=>string;locked?:()=>boolean;selectionChanged:(ids:string[])=>void;
 executeFilm:(commands:FilmCommand[])=>boolean;capture:(ids:string[],properties?:string[])=>Promise<FilmAuthorCapture>;
 readStyle?:(id:string,property:string)=>Promise<string>;
 previewDraft:(document?:FilmDocument)=>void;runtimeSelect:(ids:string[])=>void;
 report:(error:unknown)=>void;shell:EditorSession;signal:AbortSignal;
 seek?:(frame:number)=>void;pause?:()=>void;
}
const CLIP='film-clip';
function rotationOf(css:Record<string,string>={}){const matrix=new DOMMatrix(css.transform&&css.transform!=='none'?css.transform:undefined);return Math.atan2(matrix.b,matrix.a)*180/Math.PI+(parseFloat(css.rotate)||0);}
/** Adapts existing sidebar stores to film commands; it owns no author document. */
export function mountFilmAuthoring(options:FilmAuthoringOptions){
 const abort=new AbortController(),signal=abort.signal,actions=scopeActions(editorActions,signal);
 if(options.signal.aborted)abort.abort();else options.signal.addEventListener('abort',()=>abort.abort(),{once:true});
 const cleanup:(()=>void)[]=[];let disposed=false,last='',captureGeneration=0,refreshRevision=0,property='opacity',objects:FilmAuthorObject[]=[],cached:FilmAuthorCapture={computedStyles:{},rectangles:[]};
 let gesture:{key:string;scope:string;base:FilmDocument;commands:Command[]}|undefined;
 let propertyDraft:{base:FilmDocument;origin:FilmAuthoringOrigin}|undefined;
 let clipboard:{html:string;objects:NonNullable<FilmClip['objects']>;roots:string[]}|undefined;
 const captures=new Map<string,Promise<FilmAuthorCapture>>();
 const propertyReads=new Map<string,string>();let reading:string|undefined,readError='';
 const report=(error:unknown)=>{if(!disposed)options.report(error);};
 const clip=()=>options.clip(),isObject=()=>!!clip()&&overlayHtml(options.document(),clip()!)!==undefined&&options.selected().length>0;
 const ids=()=>isObject()?options.selected():clip()?[CLIP]:[];
 const scope=()=>JSON.stringify([options.document().id,options.scope?.(),clip()?.id,options.selected(),options.position()]);
 const key=()=>JSON.stringify([scope(),clip(),options.locked?.(),refreshRevision]);
 const active=()=>{if(disposed||signal.aborted)throw Error('编辑会话已关闭');};
 const assertScope=(value:string)=>{active();if(scope()!==value)throw Error('选区或播放头已变化，请重新操作');};
 const visible=()=>{const current=clip();return !!current&&options.position()>=current.at&&options.position()<current.at+current.duration;};
 const unavailable=()=>!visible()?'播放头不在所选片段内，请先定位到该片段':options.locked?.()?'轨道已锁定':'选区包含锁定对象';
 const locked=()=>!visible()||!!options.locked?.()||isObject()&&objects.some(object=>options.selected().includes(object.id)&&object.locked);
 const source=()=>{const current=clip();return current&&options.document().sources.find(source=>source.id===current.sourceId);};
 function clipValues(){const current=clip()!,document=options.document(),asset=source();return {x:document.width/2,y:document.height/2,width:asset?.width??document.width,height:asset?.height??document.height,...clipAppearance(current,options.position()-current.at)};}
 function viewObjects(){
  if(isObject())return locked()?objects.map(object=>options.selected().includes(object.id)?{...object,locked:true}:object):objects;
  const current=clip();if(!current)return [];
  const values=clipValues(),kind=source()?.kind,tag=kind==='image'?'img':kind==='video'?'video':kind==='audio'?'audio':'div';
  return [{id:CLIP,tag,text:current.title,html:'',kind:tag,locked:locked(),attributes:{'data-notale-name':current.title},style:{opacity:String(values.opacity),width:`${values.width}px`,height:`${values.height}px`,'border-radius':`${values.radius}px`}}];
 }
 const bindingObjects=()=>viewObjects();
 async function capture(selected:string[]){
  const expected=scope(),expectedKey=key();
  if(!isObject()){
   const values=clipValues(),width=Number(values.width),height=Number(values.height);
   return {computedStyles:{[CLIP]:{opacity:String(values.opacity),'border-radius':`${values.radius}px`,width:`${width}px`,height:`${height}px`}},rectangles:[{id:CLIP,x:Number(values.x)-width/2,y:Number(values.y)-height/2,width,height}]};
  }
  if(!visible())return {computedStyles:Object.fromEntries(objects.filter(object=>selected.includes(object.id)).map(object=>[object.id,object.style])),rectangles:[]};
  const cacheKey=JSON.stringify([expectedKey,selected]);let pending=captures.get(cacheKey);
  if(!pending){pending=options.capture(selected);captures.set(cacheKey,pending);if(captures.size>8)captures.delete(captures.keys().next().value!);pending.catch(()=>captures.delete(cacheKey));}
  const result=await pending;assertScope(expected);if(key()!==expectedKey)throw Error('对象已更新，请重新操作');return result;
 }
 function translate(commands:Command[],document=options.document()):FilmCommand[]{
  const current=clip();if(!current)throw Error('请选择对象');if(locked())throw Error(unavailable());
  if(isObject())return filmAuthorCommands(document,document.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(item=>item.id===current.id)!,options.position(),commands,!!options.locked?.());
  const result:FilmCommand[]=[];
  for(const command of commands){
   if(command.type!=='element.patch')throw Error('当前片段不支持此对象操作');
   if(command.target!==CLIP||command.patch.text!==undefined||command.patch.richText!==undefined||command.patch.attributes)throw Error('对象选区已变化，修改未应用');
   for(const [name,value]of Object.entries(command.patch.style??{})){
    const property=({opacity:'opacity','border-radius':'radius',width:'width',height:'height'} as Record<string,FilmProperty>)[name];if(!property)throw Error('此片段没有该外观属性');
    const parsed=parseFloat(value);if(!Number.isFinite(parsed))throw Error('请输入有效数值');result.push(clipStyleCommand(current,options.position(),property,parsed));
   }
  }return result;
 }
 async function execute(commands:Command[]){active();options.pause?.();const edits=translate(commands);if(edits.length&&!options.executeFilm(edits))throw Error('修改未应用');update(true);}
 const transactions={
  preview(gestureKey:string,commands:Command[]){active();options.pause?.();const current=scope();if(gesture&&gesture.key!==gestureKey)throw Error('请先完成当前属性编辑');gesture??={key:gestureKey,scope:current,base:options.document(),commands};assertScope(gesture.scope);gesture.commands=commands;options.previewDraft(applyFilmCommands(gesture.base,translate(commands,gesture.base)));},
  async commit(gestureKey:string,commands?:Command[]){
   active();const pending=gesture;if(pending&&pending.key!==gestureKey)throw Error('属性编辑已变化');gesture=undefined;
   try{if(pending){assertScope(pending.scope);if(options.document()!==pending.base)throw Error('对象已更新，请重新编辑');await execute(commands??pending.commands);}else if(commands)await execute(commands);}
   finally{options.previewDraft();}
  },
  async cancel(gestureKey:string){if(gesture?.key!==gestureKey)return;gesture=undefined;options.previewDraft();update(true);},error:report,
 };
 const appearance=bindAppearance({...transactions,objects:bindingObjects,selected:ids,key,slideId:()=>clip()?.id??'',documentId:()=>options.document().id,capture,commands:execute,supportedFields:()=>isObject()?undefined:['opacity','radius']});cleanup.push(()=>appearance.disposeCapture());
 const typography=bindTypography({...transactions,key,documentId:()=>options.document().id,enabled:()=>isObject()&&inspectSelection(objects,ids()).typography,ready:()=>!!clip(),ids,objects:bindingObjects,slideId:()=>clip()?.id??'',capture,commands:execute});cleanup.push(()=>typography.disposeCapture());
 const fonts=bindProjectFonts({scope,getFonts:()=>options.document().fonts??[],apply:async(font,commands)=>{active();const edits=translate(commands);if(!options.executeFilm([{type:'film.font.add',font},...edits]))throw Error('字体未应用');update(true);}});cleanup.push(()=>fonts.dispose());
 const code=bindCodeEditor({documentId:()=>options.document().id,objects:()=>isObject()?objects:[],selection:()=>isObject()?ids():[],slideId:()=>clip()?.id??'',commands:execute});cleanup.push(()=>code.dispose());
 const rich=bindRichEditor({selected:()=>isObject()&&ids().length===1?objects.find(object=>object.id===ids()[0]):undefined,key,slideId:()=>clip()?.id??'',commands:execute,capture});cleanup.push(()=>rich.dispose());
 const arrangement=bindArrangement({scope,arrange:async action=>{
  const expected=scope(),settings=arrangementSettings(action),result=await capture(ids());assertScope(expected);
  if(!isObject()){const current=clip()!,values=clipValues(),document=options.document(),edits:FilmCommand[]=[];const set=(name:FilmProperty,value:number)=>edits.push(clipStyleCommand(current,options.position(),name,value));
   if(action==='rotate')set('rotation',Number(values.rotation)+settings.angle);
   else if(action==='scale'){set('scaleX',Number(values.scaleX)*settings.factor);set('scaleY',Number(values.scaleY)*settings.factor);}
   else if(['left','center','right'].includes(action))set('x',action==='left'?Number(values.width)/2:action==='right'?document.width-Number(values.width)/2:document.width/2);
   else if(['top','middle','bottom'].includes(action))set('y',action==='top'?Number(values.height)/2:action==='bottom'?document.height-Number(values.height)/2:document.height/2);
   if(edits.length&&!options.executeFilm(edits))throw Error('排列未应用');update(true);return;
  }
  const raw=['rotate','scale'].includes(action)?[{type:'elements.arrange',slideId:clip()!.id,action,rectangles:result.rectangles,...settings}]:alignmentCommands(clip()!.id,result.rectangles,[],action,settings.reference,options.document().width,options.document().height);
  await execute(commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:raw}).commands);
 },layer:async action=>layer(action)});cleanup.push(()=>arrangement.dispose());
 const gallery=bindAnimationGallery();cleanup.push(()=>gallery.dispose());
 const animationControls=bindAnimationControls({newDraft:()=>{},preview:()=>{},stop:()=>options.pause?.(),present:()=>{},error:report});cleanup.push(()=>animationControls.dispose());
 const animationList=bindAnimationList();cleanup.push(()=>animationList.dispose());
 const animationForm=bindAnimationForm(new AnimationDraft(),()=>{},()=>{});cleanup.push(()=>animationForm.dispose());
 const readKey=(name:string)=>JSON.stringify([key(),ids()[0],name]);
 function propertyValue(name:string){if(!isObject())return clipValues()[name as keyof ReturnType<typeof clipValues>]??'';const target=ids()[0],item=objects.find(object=>object.id===target);return item?.style[name]??propertyReads.get(readKey(name))??cached.computedStyles[target]?.[name]??'';}
 function readProperty(){
  if(!isObject()||ids().length!==1||!visible()||!options.readStyle)return;
  const name=property,target=ids()[0],expected=readKey(name),origin=scope();if(propertyReads.has(expected)||reading===expected)return;reading=expected;readError='';
  void options.readStyle(target,name).then(value=>{if(disposed||scope()!==origin||readKey(name)!==expected)return;propertyReads.set(expected,value.trim());if(propertyReads.size>100)propertyReads.delete(propertyReads.keys().next().value!);},error=>{if(!disposed&&scope()===origin&&property===name&&readKey(name)===expected)readError=String(error instanceof Error?error.message:error);}).finally(()=>{if(reading===expected){reading=undefined;if(!disposed)syncTiming();}});
 }
 function propertyKeys(name:string){const current=clip();if(!current)return [];return isObject()?current.objects?.[ids()[0]]?.keyframes?.[name]??[]:current.appearance?.keyframes?.[name as FilmProperty]??[];}
 function assertTiming(origin?:FilmAuthoringOrigin){active();const current=clip();if(!current||ids().length!==1||locked())throw Error(unavailable());if(origin&&(origin.scope!==scope()||origin.property!==property||origin.frame!==options.position()-current.at||origin.revision!==undefined&&origin.revision!==key()))throw Error('属性或播放头已变化，修改未应用');}
 function propertyEdits(value:string|number,origin?:FilmAuthoringOrigin){assertTiming(origin);const current=clip()!;
  let edits:FilmCommand[];
  if(isObject()){if(!validFilmStyleName(property)||!String(value).trim()||!CSS.supports(property,String(value)))throw Error('请输入有效的 CSS 属性值');edits=ids().map(id=>objectStyleCommand(current,options.position(),id,property,String(value)));}
  else{const parsed=Object.hasOwn(filmNumericLimits,property)?Number(value):String(value);if(!validFilmProperty(property,parsed))throw Error('属性值超出有效范围');edits=[clipStyleCommand(current,options.position(),property as FilmProperty,parsed)];}
  return edits;
 }
 function cancelPropertyPreview(){if(propertyDraft){propertyDraft=undefined;options.previewDraft();}}
 function previewProperty(value:string|number,origin:FilmAuthoringOrigin){
  assertTiming(origin);if(gesture)throw Error('请先完成当前属性编辑');options.pause?.();
  propertyDraft??={base:options.document(),origin};
  if(propertyDraft.base!==options.document())throw Error('对象已更新，请重新编辑');
  options.previewDraft(applyFilmCommands(propertyDraft.base,propertyEdits(value,origin)));
 }
 async function changeProperty(value:string|number,origin?:FilmAuthoringOrigin){
  try{assertTiming(origin);options.pause?.();if(propertyDraft&&propertyDraft.base!==options.document())throw Error('对象已更新，请重新编辑');const edits=propertyEdits(value,origin);cancelPropertyPreview();if(!options.executeFilm(edits))throw Error('修改未应用');update(true);}
  finally{cancelPropertyPreview();}
 }
 function authoredFrame(){return options.position()-clip()!.at+(clip()!.animationOffset??0);}
 async function removeKey(origin?:FilmAuthoringOrigin){assertTiming(origin);const frame=authoredFrame(),current=clip()!,edits:FilmCommand[]=[];
  for(const target of isObject()?ids():[CLIP]){const keys=isObject()?current.objects?.[target]?.keyframes?.[property]:current.appearance?.keyframes?.[property as FilmProperty];if(keys?.some(key=>key.frame===frame))edits.push(isObject()?{type:'film.object.key.delete',clipId:current.id,target,property,frame}:{type:'film.keyframe.delete',clipId:current.id,property:property as FilmProperty,frame});}
  if(edits.length&&!options.executeFilm(edits))throw Error('关键帧未删除');update(true);
 }
 async function toggleKey(origin?:FilmAuthoringOrigin){assertTiming(origin);if(propertyKeys(property).some(key=>key.frame===authoredFrame()))return removeKey(origin);
  const current=clip()!,frame=authoredFrame(),name=property,expected=scope(),edits:FilmCommand[]=[];
  const captured=isObject()?await capture(ids()):undefined;
  for(const target of isObject()?ids():[CLIP]){
   let value=isObject()?objects.find(object=>object.id===target)?.style[property]??captured?.computedStyles[target]?.[property]:propertyValue(property);
   if(isObject()&&(value===undefined||value==='')&&options.readStyle)value=await options.readStyle(target,property);
   assertScope(expected);if(property!==name||clip()!==current)throw Error('属性已更新，请重新添加关键帧');if(value===undefined||value==='')throw Error('无法读取当前属性值，请先输入属性值');
   const keys=isObject()?current.objects?.[target]?.keyframes?.[property]:current.appearance?.keyframes?.[property as FilmProperty];
   const frames=!keys?.length&&frame>(current.animationOffset??0)?[current.animationOffset??0,frame]:[frame];
   for(const at of frames)edits.push(isObject()?{type:'film.object.key.put',clipId:current.id,target,property,keyframe:{frame:at,value:String(value),easing:'linear'}}:{type:'film.keyframe.put',clipId:current.id,property:property as FilmProperty,keyframe:{frame:at,value,easing:'linear'}});
  }if(!options.executeFilm(edits))throw Error('关键帧未添加');update(true);
 }
 async function changeEasing(value:FilmEasing,origin?:FilmAuthoringOrigin){assertTiming(origin);if(!validEasing(value))throw Error('请输入有效贝塞尔参数，X1/X2 必须在 0 到 1 之间');const current=clip()!,key=propertyKeys(property).find(key=>key.frame===authoredFrame());if(!key)throw Error('请先定位到已有关键帧');const command:FilmCommand=isObject()?{type:'film.object.key.put',clipId:current.id,target:ids()[0],property,keyframe:{...key,value:String(key.value),easing:value}}:{type:'film.keyframe.put',clipId:current.id,property:property as FilmProperty,keyframe:{...key,easing:value}};if(!options.executeFilm([command]))throw Error('缓动未应用');update(true);}
 async function resetBase(origin?:FilmAuthoringOrigin){assertTiming(origin);const current=clip()!,command:FilmCommand=isObject()?{type:'film.object.property',clipId:current.id,target:ids()[0],property}:{type:'film.property.set',clipId:current.id,property:property as FilmProperty};if(!options.executeFilm([command]))throw Error('基础值未重置');update(true);}
 const timing=bindFilmAuthoringState({selectProperty:name=>{if(isObject()?!validFilmStyleName(name):!clipProperties.includes(name))throw Error('无效动画属性');cancelPropertyPreview();property=name;readError='';syncTiming();readProperty();},preview:previewProperty,cancelPreview:cancelPropertyPreview,commit:changeProperty,toggleKey,removeKey,easing:changeEasing,resetBase,seek:frame=>{if(clip())options.seek?.(clip()!.at+frame);}});cleanup.push(()=>timing.dispose());
 function syncTiming(){const current=clip();if(!current){timing.update({scope:scope(),properties:[],property,frame:0,disabled:true});return;}
  const names=[...new Set([...(isObject()?objectProperties:clipProperties),...Object.keys(isObject()?current.objects?.[ids()[0]]?.values??{}:current.appearance?.values??{}),...Object.keys(isObject()?current.objects?.[ids()[0]]?.keyframes??{}:current.appearance?.keyframes??{}),...(isObject()&&validFilmStyleName(property)?[property]:[])])];if(!names.includes(property))property=names[0];
  const frame=authoredFrame(),currentKey=propertyKeys(property).find(key=>key.frame===frame);timing.update({scope:scope(),revision:key(),property,frame:options.position()-current.at,disabled:locked()||ids().length!==1,error:!visible()?unavailable():readError||undefined,customProperties:isObject(),reading:reading===readKey(property),currentEasing:currentKey?.easing??'linear',easingEditable:!!currentKey&&!locked()&&ids().length===1,properties:names.map(name=>({name,label:propertyLabels[name]??name,value:propertyValue(name),animated:!!propertyKeys(name).length,keyed:propertyKeys(name).some(key=>key.frame===frame),...propertyMetadata(name,isObject())})),keys:propertyKeys(property).map(key=>({frame:key.frame-(current.animationOffset??0),value:key.value}))});
 }
 async function applyPreset(effect:string){const expected=scope();options.pause?.();if(!clip()||locked())throw Error('请选择可编辑对象');const captureResult=await capture(ids());assertScope(expected);const commands=isObject()?objectPreset(options.document(),clip()!,options.position(),ids(),captureResult.computedStyles,effect):clipPreset(options.document(),clip()!,options.position(),clipValues(),effect);if(!options.executeFilm(commands))throw Error('动画未应用');property=isObject()?presetProperty(effect):({translate:'x',rotate:'rotation',scale:'scaleX'} as Record<string,string>)[presetProperty(effect)]??presetProperty(effect);update(true);}
 function syncGallery(){const current=clip(),reasons:Record<string,string>={};for(const group of animationEffectGroups)for(const effect of group.effects)if(!filmPresetEffects.includes(effect as typeof filmPresetEffects[number]))reasons[effect]='此效果暂不能转换为当前对象关键帧';
  if(current&&isObject())for(const effect of filmPresetEffects)if(ids().some(id=>current.objects?.[id]?.keyframes?.[presetProperty(effect)]?.length))reasons[effect]='该属性已有关键帧，请在时间线编辑';
  if(current&&!isObject())for(const effect of filmPresetEffects){const name=presetProperty(effect),properties=name==='translate'?['x','y']:name==='scale'?['scaleX','scaleY']:[name==='rotate'?'rotation':name];if(properties.some(name=>current.appearance?.keyframes?.[name as FilmProperty]?.length))reasons[effect]='该属性已有关键帧，请在时间线编辑';}
  const expected=scope();gallery.update({enabled:!!current&&!locked(),clearable:false,presetOnly:true,supportedEffects:filmPresetEffects,reasons,apply:effect=>{assertScope(expected);return applyPreset(effect);}});
  animationControls.update({target:'',status:'',enabled:false,previewable:false,multiple:false});
 }
 function geometry(result:FilmAuthorCapture){const current=clip();if(!current)return;const chosen=ids(),box=selectionBounds(result.rectangles.filter(rect=>chosen.includes(rect.id)));if(!box){options.shell.update({geometryFields:undefined});return;}
  const rotation=isObject()?rotationOf(result.computedStyles[chosen[0]]):Number(clipValues().rotation);
  options.shell.update({geometryFields:{key:JSON.stringify([options.document().id,current.id,chosen]),documentId:options.document().id,slideId:current.id,ids:chosen,editable:!locked(),values:{tx:box.x,ty:box.y,'object-width':box.width,'object-height':box.height,rotation,scale:1}}});
 }
 function select(selected:string[]){active();const current=clip(),allowed=current?overlayObjects(options.document(),current,options.position(),!!options.locked?.()):[];const next=[...new Set(selected.filter(id=>id!==CLIP&&allowed.some(object=>object.id===id)))];options.selectionChanged(next);options.runtimeSelect(next);update(true);}
 function update(force=false){if(disposed||signal.aborted)return;if(force){refreshRevision++;captures.clear();}const signature=key();if(!force&&last===signature)return;last=signature;cached={computedStyles:{},rectangles:[]};readError='';
  if(gesture&&gesture.scope!==scope()){gesture=undefined;options.previewDraft();}
  if(propertyDraft&&(propertyDraft.origin.scope!==scope()||propertyDraft.origin.revision!==key()||locked()))cancelPropertyPreview();
  const current=clip();objects=current?overlayObjects(options.document(),current,options.position(),!!options.locked?.()):[];
  const chosen=ids(),view=viewObjects(),inspector=current?{...inspectSelection(view,chosen),canLock:isObject()}:emptyInspector,first=view.find(item=>item.id===chosen[0]);
  const base={documentId:options.document().id,slideId:current?.id??''};
  const layerOrigin=scope(),layerDocument=options.document(),layerObjects=objects;
  const layers:LayerState|undefined=current?{documentId:base.documentId,pageId:base.slideId,scope:signature,rows:layerRows(objects,Object.fromEntries(objects.map(object=>[object.id,object.style]))),reorder:async(targets,target,placement)=>{assertScope(layerOrigin);if(options.document()!==layerDocument)throw Error('图层已更新，请重新拖动');await reorder(targets,target,placement);}}:undefined;
  options.shell.update({activePageId:current?.id??'',selectedIds:chosen,selectionScope:scope(),layers,inspector,
   textField:isObject()&&inspector.text&&first&&chosen.length===1?{...base,key:JSON.stringify([base.documentId,base.slideId,first.id]),target:first.id,value:first.text,editable:!locked()}:undefined,
   nameField:first?{...base,key:JSON.stringify([base.documentId,base.slideId,chosen]),targets:chosen,before:Object.fromEntries(view.filter(item=>chosen.includes(item.id)).map(item=>[item.id,item.attributes['data-notale-name']??''])),value:first.attributes['data-notale-name']??'',editable:!locked()}:undefined,bindingField:undefined,canvas:current?'ready':'loading',geometryFields:undefined});
  appearance.render();typography.render();fonts.update();code.render();rich.render();arrangement.update({scope:scope(),units:chosen.length,disabled:!current||locked()});syncGallery();syncTiming();
  const generation=++captureGeneration,expected=scope();if(current)void capture(chosen).then(result=>{if(disposed||generation!==captureGeneration||scope()!==expected)return;cached=result;geometry(result);syncTiming();}).catch(error=>{if(!disposed&&generation===captureGeneration&&scope()===expected&&!String(error).includes('所选对象不在当前画面'))report(error);});
  if(layers&&layerObjects.length&&visible())void options.capture(layerObjects.map(object=>object.id)).then(result=>{if(disposed||generation!==captureGeneration||scope()!==expected)return;options.shell.update({layers:{...layers,rows:layerRows(layerObjects,result.computedStyles)}});}).catch(()=>{});
  readProperty();
 }
 async function reorder(targets:string[],target:string,placement:LayerPlacement){
  active();const current=clip(),document=options.document(),expected=scope();if(!current||options.locked?.()||!visible())throw Error(unavailable());const html=overlayHtml(document,current);if(html===undefined)throw Error('请选择原生对象图层');options.pause?.();
  const orderObjects=overlayOrderObjects(current,html),anchor=orderObjects.find(object=>object.id===target),captureIds=orderObjects.filter(object=>object.parent===anchor?.parent||object.id===anchor?.parent).map(object=>object.id),captured=await options.capture(captureIds);
  assertScope(expected);if(options.document()!==document)throw Error('图层已更新，请重新拖动');
  const commands=relativeLayerCommands(current.id,orderObjects,captured.computedStyles,targets,target,placement);if(!commands.length)return;
  const edits=commands[0].type==='elements.order'?[reorderOverlaySvg(current,html,commands)]:filmAuthorCommands(document,current,options.position(),commands,!!options.locked?.());
  if(!options.executeFilm(edits))throw Error('图层顺序未应用');select(targets);
 }
 async function layer(action:LayerAction){
  if(!isObject())throw Error('请在时间线调整片段轨道');if(locked())throw Error('选区包含锁定对象');const current=clip()!,origin=options.document(),expected=scope(),html=overlayHtml(origin,current)!;
  const plan=captureLayerPlan(current.id,ids(),overlayOrderObjects(current,html),action),captured=plan.captureIds.length?await options.capture(plan.captureIds):undefined;
  assertScope(expected);if(options.document()!==origin)throw Error('图层已更新，请重新操作');const commands=layerPlanCommands(plan,captured?.computedStyles),svg=commands.filter(command=>command.type==='elements.order'),styles=commands.filter(command=>command.type!=='elements.order'),edits:FilmCommand[]=[];let document=origin,target=current;
  if(svg.length){edits.push(reorderOverlaySvg(current,html,svg));document=applyFilmCommands(document,edits);target=document.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(clip=>clip.id===current.id)!;}
  edits.push(...filmAuthorCommands(document,target,options.position(),styles,!!options.locked?.()));if(edits.length&&!options.executeFilm(edits))throw Error('排列未应用');update(true);
 }
 function actionReason(name:string):string|undefined{
  if(['escape','select-all'].includes(name))return;
  if(!clip()||overlayHtml(options.document(),clip()!)===undefined)return '请选择片段内对象';
  if(name==='paste')return locked()?unavailable():!clipboard?'请先复制对象':undefined;
  if(!isObject()||!options.selected().length)return '请选择片段内对象';
  if(options.selected().some(id=>!objects.some(object=>object.id===id)))return '对象已变化，请重新选择';
  if(name!=='copy'&&locked())return unavailable();
 }
 async function handleAction(name:string){active();const why=actionReason(name);if(why)throw Error(why);if(name==='escape'){if(gesture)await transactions.cancel(gesture.key);else select([]);return;}
  if(name==='select-all'){select(objects.filter(item=>!item.parent&&!item.locked).map(item=>item.id));return;}
  if(['front','back','forward','backward'].includes(name))return layer(name as LayerAction);
  if(!clip()||(!isObject()&&!(name==='paste'&&overlayHtml(options.document(),clip()!)!==undefined)))throw Error('请选择片段内对象');
  if(name==='copy'||name==='cut'){
   const current=clip()!,dom=new DOMParser().parseFromString(cleanOverlayHtml(overlayHtml(options.document(),current)!),'text/html'),wanted=new Set(ids());
   const roots=ids().filter(id=>{let node=dom.querySelector(`[data-notale-id="${CSS.escape(id)}"]`)?.parentElement;while(node){if(wanted.has(node.getAttribute('data-notale-id')??''))return false;node=node.parentElement;}return true;});
   const html=roots.map(id=>dom.querySelector(`[data-notale-id="${CSS.escape(id)}"]`)!.outerHTML).join(''),fragment=new DOMParser().parseFromString(html,'text/html'),all=new Set([...fragment.querySelectorAll('[data-notale-id]')].map(node=>node.getAttribute('data-notale-id')));
   clipboard={html,roots,objects:Object.fromEntries(Object.entries(current.objects??{}).filter(([id])=>all.has(id)))};
   if(name==='copy')return;name='delete';
  }
  if(name==='paste'){
   if(!clipboard)return;if(locked())throw Error(unavailable());const current=clip()!,dom=new DOMParser().parseFromString(clipboard.html,'text/html'),remap=new Map<string,string>();for(const node of dom.querySelectorAll<HTMLElement>('[data-notale-id]')){const old=node.dataset.notaleId!,id='copy-'+crypto.randomUUID();node.dataset.notaleId=id;remap.set(old,id);}
   const html=cleanOverlayHtml(overlayHtml(options.document(),current)!+dom.body.innerHTML),states={...current.objects};for(const [id,state]of Object.entries(clipboard.objects))states[remap.get(id)!]=structuredClone(state);
   if(!options.executeFilm([{type:'film.overlay.set',clipId:current.id,html,objects:states}]))throw Error('粘贴未应用');select(clipboard.roots.map(id=>remap.get(id)!));return;
  }
  if(!['delete','duplicate'].includes(name))throw Error('当前对象不支持此操作');
  const before=new Set(objects.map(item=>item.id)),current=clip()!;
  const wanted=new Set(ids()),byId=new Map(objects.map(item=>[item.id,item]));const roots=ids().filter(id=>{let parent=byId.get(id)?.parent;const seen=new Set<string>();while(parent&&!seen.has(parent)){if(wanted.has(parent))return false;seen.add(parent);parent=byId.get(parent)?.parent;}return true;});
  await execute(roots.map(target=>({type:name==='delete'?'element.delete':'element.duplicate',slideId:current.id,target})));
  select(name==='delete'?[]:objects.filter(item=>!before.has(item.id)&&(!item.parent||before.has(item.parent))).map(item=>item.id));
 }
 actions.selectLayer=(from,id,toggle)=>{if(from.documentId!==options.document().id||from.pageId!==clip()?.id)return;const chosen=options.selected();select(toggle?chosen.includes(id)?chosen.filter(target=>target!==id):[...chosen,id]:[id]);};
 actions.selectionTool=handleAction;
 actions.replaceText=async(field,value)=>{if(field.documentId!==options.document().id||field.slideId!==clip()?.id||!ids().includes(field.target))throw Error('对象已变化');const object=objects.find(item=>item.id===field.target);if(object?.text!==field.value)throw Error('文字已变化，请重新编辑');await execute([{type:'element.patch',slideId:field.slideId,target:field.target,patch:{text:value}}]);};
 actions.saveObjectName=async(field,value)=>{if(field.documentId!==options.document().id||field.slideId!==clip()?.id||JSON.stringify(field.targets)!==JSON.stringify(ids()))throw Error('对象已变化');const currentObjects=viewObjects();if(field.targets.some(id=>(currentObjects.find(item=>item.id===id)?.attributes['data-notale-name']??'')!==field.before[id]))throw Error('对象名称已变化，请重新编辑');if(!isObject()){const current=clip()!;if(locked())throw Error(unavailable());const document=structuredClone(options.document()),item=document.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(item=>item.id===current.id)!;item.title=value;if(!options.executeFilm([{type:'film.document.restore',document,expected:options.document()}]))throw Error('名称未保存');update(true);return;}await execute(field.targets.map(target=>({type:'element.patch',slideId:field.slideId,target,patch:{attributes:{'data-notale-name':value}}})));};
 actions.toggleObjectLock=async()=>{if(!isObject()||options.locked?.()||!visible())throw Error('请选择可编辑对象');const current=clip()!,chosen=options.selected(),byId=new Map(objects.map(object=>[object.id,object]));for(const target of chosen){let parent=byId.get(target)?.parent;const seen=new Set<string>();while(parent&&!seen.has(parent)){if(current.objects?.[parent]?.locked)throw Error('容器已锁定，请先解锁容器');seen.add(parent);parent=byId.get(parent)?.parent;}}const locked=chosen.some(id=>!!current.objects?.[id]?.locked);if(!options.executeFilm(chosen.map(target=>({type:'film.object.lock',clipId:current.id,target,locked:!locked}))))throw Error('锁定状态未应用');update(true);};
 actions.hideObjects=()=>{const style:Record<string,string>=isObject()?{visibility:'hidden'}:{opacity:'0'};return execute(ids().map(target=>({type:'element.patch',slideId:clip()!.id,target,patch:{style}})));};
 actions.showObjects=()=>{const style:Record<string,string>=isObject()?{visibility:'visible'}:{opacity:'1'};return execute(ids().map(target=>({type:'element.patch',slideId:clip()!.id,target,patch:{style}})));};
 actions.setTextReflow=enabled=>options.shell.update({textReflow:enabled});
 actions.editGeometry=async edit=>{const current=clip();if(!current||edit.source.documentId!==options.document().id||edit.source.slideId!==current.id||JSON.stringify(edit.source.ids)!==JSON.stringify(ids()))throw Error('选区已变化');if(locked())throw Error('选区包含锁定对象');const expected=scope(),result=await capture(ids());assertScope(expected);
  if(!isObject()){const values=clipValues(),field=edit.field,value=edit.value,edits:FilmCommand[]=[];const set=(name:FilmProperty,value:number)=>edits.push(clipStyleCommand(current,options.position(),name,value));
   if(field==='tx')set('x',value+Number(values.width)/2);else if(field==='ty')set('y',value+Number(values.height)/2);else if(field==='rotation')set('rotation',value);else if(field==='scale'){set('scaleX',Number(values.scaleX)*value);set('scaleY',Number(values.scaleY)*value);}else{const width=field==='object-width',before=Number(values[width?'width':'height']);set(width?'width':'height',value);if(edit.proportional)set(width?'height':'width',Number(values[width?'height':'width'])*value/before);}if(!options.executeFilm(edits))throw Error('几何修改未应用');update(true);return;
  }
  const rotation=rotationOf(result.computedStyles[ids()[0]]);await execute(commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:[geometryCommand(current.id,result.rectangles,edit.field,edit.value,edit.proportional,rotation)]}).commands);
 };
 function dispose(){if(disposed)return;disposed=true;gesture=undefined;propertyDraft=undefined;captureGeneration++;options.previewDraft();abort.abort();for(const release of cleanup.reverse())release();}
 signal.addEventListener('abort',dispose,{once:true});update();
 return {update,select,execute,authorCommands:execute,handleAction,action:handleAction,reason:actionReason,dispose};
}
