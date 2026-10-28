import {clipSourceTime,parseFilmDocument,type FilmDocument,type FilmCommand,type FilmSource,type FilmClip,type FilmSelectorOverride} from '@notale/editor/film';
import {translateUi as t} from '../i18n/store';
import {pickMediaFiles,uploadMediaFiles,inspectMediaFile,mediaJson,mediaKindOf} from './media-import';
import {planSourceRelink,sourceReferences} from './source-relink-plan';
import {assertMotaleIdentity,MotaleBridgeSession,type MotaleBridgeObject,type MotaleRawBridge} from './motale-bridge';
import {isMotaleKeys,validateMotaleValue,motalePropertyLabels,type MotaleProperty,type MotaleValue} from './motale-keyframes';
import {loadOpenFilm} from './openfilm-page';
import {queueMediaProxy} from './media-preview';
import {assertRelinkTargets,overrideTargets} from './source-relink-targets';
import {fileSha256} from './file-fingerprint';
import limits from './package-limits.json';
import './source-relink.css';
export interface SourceRelinkOptions {
 document:()=>FilmDocument;sourceId:string;execute:(commands:FilmCommand[])=>boolean|void|Promise<boolean|void>;
 report:(message:string)=>void;mode?:'relink'|'replace';signal?:AbortSignal;deferProxy?:boolean;
}
type Choice={id:string;label:string};
type Conflict={label:string;choices:Choice[];value:string;set:(id:string)=>void;preview?:()=>Promise<void>};
const pathOf=(file:File)=>file.webkitRelativePath||file.name;
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const pause=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason??new DOMException('Aborted','AbortError'));},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},30);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
async function until(check:()=>boolean,signal:AbortSignal,message:string){const deadline=performance.now()+20000;while(!check()){signal.throwIfAborted();if(performance.now()>deadline)throw Error(message);await pause(signal);}}
function frame(){const node=document.createElement('iframe');node.title=t('替换素材预览');node.tabIndex=-1;node.setAttribute('sandbox','allow-scripts allow-same-origin');node.style.cssText='position:fixed;left:-20000px;top:0;width:1280px;height:720px;pointer-events:none;overscroll-behavior:none';document.body.append(node);return node;}
function authoredLabel(id:string,props:Record<string,unknown>){const content=props.text??props.tex;return typeof content==='string'?`${id} · ${content.slice(0,70)}`:id;}
function accepts(object:MotaleBridgeObject,props:Record<string,unknown>,duration:number){try{for(const [property,value]of Object.entries(props)){const spec=object.props[property];if(!spec)return false;if(isMotaleKeys(value)){if(!spec.keyable)return false;for(const [time,v,ease]of value.keys){if(time<0||time>duration||spec.type!=='number'&&ease&&ease!=='step')return false;validateMotaleValue(property as MotaleProperty,v,spec);}}else validateMotaleValue(property as MotaleProperty,value as MotaleValue,spec);}return true;}catch{return false;}}
/** A new iframe owns candidate validation. It never calls author.set/preview on
 * the mounted editor, and it never writes the candidate author into the source. */
export async function relinkSource(root:HTMLElement,options:SourceRelinkOptions):Promise<boolean>{
 const captured=structuredClone(options.document()),old=captured.sources.find(source=>source.id===options.sourceId);if(!old||['overlay','sequence','lecture'].includes(old.kind))return false;
 const abort=new AbortController(),signal=abort.signal,externalAbort=()=>abort.abort();options.signal?.addEventListener('abort',externalAbort,{once:true});if(options.signal?.aborted)abort.abort();
 let previewObserver:ResizeObserver|undefined;let batch:Awaited<ReturnType<typeof uploadMediaFiles>>|undefined,candidateFrame:HTMLIFrameElement|undefined,session:MotaleBridgeSession|undefined,transport:Awaited<ReturnType<typeof loadOpenFilm>>['transport']|undefined,dialog:HTMLDialogElement|undefined;
 try{
  const bundled=old.kind==='motale'||old.kind==='openfilm',files=await pickMediaFiles({folder:bundled||options.mode!=='replace',multiple:bundled||options.mode!=='replace',accept:old.kind+'/*',signal});if(!files.length)return false;
  files.sort((a,b)=>pathOf(a)<pathOf(b)?-1:pathOf(a)>pathOf(b)?1:0);
  dialog=document.createElement('dialog');dialog.className='film-source-relink';dialog.setAttribute('aria-label',t(options.mode==='replace'?'替换素材':'重新定位素材'));
  const title=document.createElement('h2'),status=document.createElement('p'),actions=document.createElement('div'),cancel=document.createElement('button');title.textContent=old.title;status.className='film-source-relink-status';status.setAttribute('role','status');status.textContent=t('正在校验素材…');actions.className='film-source-relink-actions';cancel.textContent=t('取消');cancel.onclick=()=>abort.abort();actions.append(cancel);dialog.append(title,status,actions);root.append(dialog);dialog.showModal();cancel.focus();dialog.oncancel=event=>{event.preventDefault();abort.abort();};
  let originalFingerprint=bundled&&old.fingerprint?.kind!=='bundle'?undefined:old.fingerprint;
  if(!originalFingerprint){try{originalFingerprint=await mediaJson('/film-media/fingerprint?uri='+encodeURIComponent(old.uri)+'&kind='+(bundled?'bundle':'file'),{signal});}catch(error){if(signal.aborted)throw error;}}
  let selected:File;const folderMatches:{source:FilmSource;file:File}[]=[];
  if(bundled){if(files.length>limits.entities||files.reduce((n,f)=>n+f.size,0)>limits.expandedBytes)throw Error('素材目录超过 512 MiB 或 8192 个文件及目录');const basename=decodeURIComponent(new URL(old.uri,location.href).pathname.split('/').at(-1)!),html=files.filter(file=>/\.html?$/i.test(file.name)),named=html.filter(file=>file.name===basename),index=html.filter(file=>/^index\.html?$/i.test(file.name));const choices=named.length?named:index.length?index:html;if(choices.length!==1)throw Error('请选择只含一个入口网页的素材目录，保留入口旁的依赖文件');selected=choices[0];}
  else{
   const candidates=files.filter(file=>mediaKindOf(file.name)===old.kind);
   if(options.mode==='replace'){if(candidates.length!==1)throw Error('请选择一个相同类型的素材');selected=candidates[0];}
   else{
    if(!originalFingerprint)throw Error('原文件已缺失且没有内容校验记录，请使用替换素材明确选择新文件');
    const missing=[old];for(const source of captured.sources){if(source.id===old.id||source.uri===old.uri||!source.fingerprint||!['video','audio','image'].includes(source.kind))continue;try{await mediaJson('/film-media/status?uri='+encodeURIComponent(source.uri),{signal});}catch(error){if(signal.aborted)throw error;if((error as {code?:string}).code==='RESOURCE_MISSING')missing.push(source);}}
    const sizes=new Set(missing.map(source=>(source.id===old.id?originalFingerprint:source.fingerprint)!.bytes)),hashes=new Map<string,File[]>();
    for(const file of files.filter(file=>sizes.has(file.size)&&!!mediaKindOf(file.name))){signal.throwIfAborted();status.textContent=t('正在校验素材…')+' '+file.name;const sha=await fileSha256(file,signal);const entries=hashes.get(sha)??[];entries.push(file);hashes.set(sha,entries);}
    for(const source of missing){const fingerprint=source.id===old.id?originalFingerprint:source.fingerprint!,matches=(hashes.get(fingerprint.sha256)??[]).filter(file=>mediaKindOf(file.name)===source.kind||source.kind==='audio'&&mediaKindOf(file.name)==='video');if(matches.length===1)folderMatches.push({source,file:matches[0]});}
    const match=folderMatches.find(value=>value.source.id===old.id);if(!match)throw Error('目录中未找到唯一且内容一致的原文件；如需更换内容，请使用替换素材');selected=match.file;
   }
  }
  batch=await uploadMediaFiles(bundled?files:[...new Set(folderMatches.length?folderMatches.map(value=>value.file):[selected])],{signal,progress:(name)=>status.textContent=t('正在导入素材…')+' '+name});const entry=batch.entries.find(value=>value.file===selected)!;
  let candidate:FilmSource;
  if(old.kind==='motale'){
   candidateFrame=frame();candidateFrame.src=entry.uri+'#tool';await until(()=>!!(candidateFrame!.contentWindow as Window&{motaleBridge?:MotaleRawBridge})?.motaleBridge,signal,'素材没有提供 Motale 桥接接口');const bridge=(candidateFrame.contentWindow as Window&{motaleBridge:MotaleRawBridge}).motaleBridge;session=new MotaleBridgeSession(bridge,()=>!signal.aborted,()=>{},message=>{throw Error(message);});const hello=session.hello;
   candidate={id:old.id,title:selected.name,kind:old.kind,uri:entry.uri,width:hello.stage.width,height:hello.stage.height,duration:Math.max(...hello.acts.map(act=>act.end)),markers:hello.acts.map(act=>({id:act.id,time:act.start,end:act.end,title:act.title??act.id})),fingerprint:entry.fingerprint};
  }else candidate=await inspectMediaFile(entry,old.kind,signal);
  if(candidate.kind==='video'&&sourceReferences(captured,old.uri).some(value=>value.source.kind==='audio')){const probe=await mediaJson('/film-media/metadata?uri='+encodeURIComponent(candidate.uri),{signal});if(!probe.streams?.some((stream:{codec_type:string})=>stream.codec_type==='audio'))throw Error('新素材没有音频流，无法保留已分离的音轨');}
  if(bundled)candidate.fingerprint={...await mediaJson('/film-media/fingerprint?kind=bundle&uri='+encodeURIComponent(entry.uri),{signal}),relativePath:pathOf(selected)};
  const same=!!originalFingerprint&&originalFingerprint.sha256===candidate.fingerprint?.sha256&&(originalFingerprint.kind??'file')===(candidate.fingerprint.kind??'file');
  if(options.mode!=='replace'&&!same)throw Error('该目录与原素材内容不同或无法校验，请使用替换素材明确选择新内容');
  let next=planSourceRelink(captured,old.id,candidate,same);const replaced=[candidate];for(const match of folderMatches){if(match.source.id===old.id||!next.sources.some(source=>source.id===match.source.id&&source.uri===match.source.uri))continue;const extra=await inspectMediaFile(batch.entries.find(value=>value.file===match.file)!,match.source.kind,signal);next=planSourceRelink(next,match.source.id,extra,true);replaced.push(extra);}
  const conflicts:Conflict[]=[],affected=sourceReferences(next,candidate.uri),preview=document.createElement('div');preview.className='film-source-relink-preview';
  const showCanvas=(canvas:HTMLCanvasElement)=>{signal.throwIfAborted();preview.replaceChildren(canvas);};
  const checks:(()=>Promise<void>)[]=[];
  if(session){
   const bridge=session.bridge,hello=session.hello;
   for(const {clip,document:owner,source} of affected){if(!clip.motale)continue;const author=structuredClone(clip.motale);clip.motale=author;
    if(Object.values(author.acts).some(act=>act.structure?.copies?.length||act.structure?.removed?.length)){
     // Structural IDs cannot be remapped to an unrelated film/revision or dropped.
     assertMotaleIdentity(author,hello);
     checks.push(async()=>{const errors=bridge.author.check(author);if(errors.length)throw Error(`${clip.title}：${errors.map(error=>error.path+' '+error.message).join('；')}`);});continue;
    }
    if(author.schema!==hello.authorSchema&&!(author.schema==='motale-author/1'&&hello.authorSchema==='motale-author/2'))throw Error('作者数据协议版本不同，无法复用；请选择相同版本素材');author.film=hello.film;
    for(const [actId,patch]of Object.entries(author.acts)){
     const act=hello.acts.find(value=>value.id===actId),label=`${clip.title} · ${actId}`;
     if(!act){delete author.acts[actId];conflicts.push({label:label+' · '+t('新素材中没有此场景'),choices:[],value:'',set:()=>{delete author.acts[actId];}});continue;}
     const prior=sourceReferences(captured,old.uri).find(value=>value.document.id===owner.id&&value.clip.id===clip.id)?.source??old,marker=prior.markers?.find(value=>value.id===actId);if(!same&&(!marker||marker.end===undefined||Math.abs(marker.time-act.start)>1e-7||Math.abs(marker.end-act.end)>1e-7))throw Error(label+'：场景源时间基准不同或无法核实，不能迁移作者调整');
     patch.revision=act.revision??undefined;const duration=act.end-act.start,sourceTime=clipSourceTime(clip,0,owner.frameRate),time=Math.max(0,Math.min(duration-1e-6,sourceTime-act.start));
     const render=async()=>{const rendered=await bridge.renderAct(actId,time,{author,width:640,parameters:'film',signal});showCanvas(rendered.canvas);};
     const objects=new Map<string,MotaleBridgeObject>(),samples=new Map<string,MotaleBridgeObject[]>(),times=new Set([0,time,Math.max(0,duration-1e-6)]);for(const props of Object.values(patch.objects??{}))for(const value of Object.values(props))if(isMotaleKeys(value))for(const key of value.keys)if(key[0]<duration)times.add(key[0]);
     for(const at of times){try{for(const object of bridge.objects(actId,at,{all:true,parts:true,author:false,parameters:'film'})){objects.set(object.id,object);const seen=samples.get(object.id)??[];seen.push(object);samples.set(object.id,seen);}}catch(error){throw Error(label+'：'+errorText(error));}}
     const compatible=(id:string,props:Record<string,unknown>)=>{if(!samples.get(id)?.every(object=>accepts(object,props,duration)))return false;try{return !bridge.author.check({schema:author.schema,film:hello.film,acts:{[actId]:{revision:patch.revision,objects:{[id]:props}}}}).length;}catch{return false;}};
     const original=structuredClone(patch.objects??{}),claimed=new Set(Object.keys(original).filter(id=>compatible(id,original[id] as Record<string,unknown>))),resolved=new Map<string,string>();
     for(const [id,props]of Object.entries(original)){
      if(claimed.has(id))continue;delete patch.objects![id];
      const choices=[...objects.values()].filter(object=>!claimed.has(object.id)&&compatible(object.id,props as Record<string,unknown>)).map(object=>({id:object.id,label:object.name??object.text??object.id}));
      conflicts.push({label:`${label} · ${authoredLabel(id,props as Record<string,unknown>)} · ${Object.keys(props).map(key=>t(motalePropertyLabels[key as MotaleProperty]??key)).join('、')}`,choices,value:'',preview:render,set:(target)=>{resolved.set(id,target);patch.objects={};for(const key of claimed)patch.objects[key]=structuredClone(original[key]);const used=new Set(claimed);for(const [from,to]of resolved){if(to==='drop')continue;if(used.has(to))throw Error('每个新对象只能接收一组旧对象调整');used.add(to);patch.objects[to]=structuredClone(original[from]);}}});
     }
     for(const [key,value]of Object.entries(patch.windows??{})){const win=bridge.windows(actId).find(window=>window.key===key);if(!win||bridge.author.check({schema:author.schema,film:hello.film,acts:{[actId]:{revision:patch.revision,windows:{[key]:value}}}}).length){delete patch.windows![key];conflicts.push({label:label+' · '+key+' · '+t('交互窗口不兼容'),choices:[],value:'',preview:render,set:()=>{delete patch.windows![key];}});}}
    }
    checks.push(async()=>{const errors=bridge.author.check(author);if(errors.length)throw Error(`${clip.title}：${errors.map(error=>error.path+' '+error.message).join('；')}`);});
   }
   for(const {clip,document:owner}of affected)checks.push(async()=>{const sourceTime=clipSourceTime(clip,0,owner.frameRate),act=hello.acts.find(value=>sourceTime>=value.start&&sourceTime<value.end)??hello.acts.find(value=>value.state==='ok');if(!act)throw Error('新素材没有可渲染的场景');const rendered=await bridge.renderAct(act.id,Math.max(0,Math.min(act.end-act.start-1e-6,sourceTime-act.start)),{author:clip.motale??null,width:320,parameters:'film',signal});rendered.canvas.width=0;rendered.canvas.height=0;});
  }else if(old.kind==='openfilm'){
   candidateFrame=frame();let failure='';const loaded=await loadOpenFilm(candidateFrame,candidate.uri,signal,message=>{failure=message;});transport=loaded.transport;
   const prepare=async(clip:FilmClip,owner:FilmDocument)=>{await until(()=>{if(failure)throw Error(failure);return transport!.prepare(clipSourceTime(clip,0,owner.frameRate),clip.openfilm?.original.overrides);},signal,'网页预览超时');};
   const page=candidateFrame.contentDocument!;
   const selector=(element:Element)=>{if(element.id&&page.querySelectorAll('#'+CSS.escape(element.id)).length===1)return '#'+CSS.escape(element.id);const chain:string[]=[];let node:Element|null=element;while(node&&node!==page.body){const parent:Element|null=node.parentElement;if(!parent)break;chain.unshift(node.localName+':nth-of-type('+([...parent.children].filter(child=>child.localName===node!.localName).indexOf(node)+1)+')');node=parent;}return 'body > '+chain.join(' > ');};
   for(const {clip,document:owner}of affected){await prepare(clip,owner);const original=structuredClone(clip.openfilm?.original.overrides??[]),resolved=new Map<number,string>();
    const matches=(override:FilmSelectorOverride):Element[]=>{try{return overrideTargets([...page.querySelectorAll(override.at)],override.n);}catch{return [];}};
    const retained=original.filter((override):override is FilmSelectorOverride=>{if(!('at'in override))return false;const targets=matches(override);return !!targets.length&&(override.text===undefined||targets.every(el=>[...el.children].every(child=>child.tagName==='BR')));}),retainedElements=new Set(retained.flatMap(matches));
    const validate=(mapping:ReadonlyMap<number,string>,targets:Set<Element>)=>assertRelinkTargets(targets,[...mapping].filter(([,target])=>target!=='drop').map(([index,target])=>({label:clip.title+' · '+(original[index] as FilmSelectorOverride).at,targets:matches({at:target})})));
    for(const [index,override]of original.entries()){if(!('at'in override)||retained.includes(override))continue;if(override.lock)throw Error('锁定的网页对象已缺失，请先解锁再替换素材');
     const choices=[...page.querySelectorAll('body *')].filter(el=>!retainedElements.has(el)&&!['SCRIPT','STYLE','LINK','META'].includes(el.tagName)&&el.getBoundingClientRect().width>0&&(override.text===undefined||[...el.children].every(child=>child.tagName==='BR'))).slice(0,500).map(el=>({id:selector(el),label:(el.getAttribute('aria-label')??el.textContent?.trim().slice(0,70)??el.localName)+' · '+selector(el)}));
     conflicts.push({label:clip.title+' · '+override.at+(override.n?' #'+override.n:'')+(override.text?' · '+override.text.slice(0,70):''),choices,value:'',preview:async()=>{await prepare(clip,owner);},set:target=>{const prospective=new Map(resolved);prospective.set(index,target);validate(prospective,retainedElements);resolved.set(index,target);clip.openfilm!.original.overrides=original.flatMap((value,i)=>{const target=resolved.get(i);return target==='drop'?[]:target?[{...value,at:target,n:undefined} as FilmSelectorOverride]:[value];});}});
    }
    checks.push(async()=>{await prepare(clip,owner);validate(resolved,new Set(retained.flatMap(matches)));});
   }
   if(conflicts.length){const width=loaded.width??1280,height=loaded.height??720;candidateFrame.style.cssText=`width:${width}px;height:${height}px;border:0;pointer-events:none;transform-origin:0 0`;preview.append(candidateFrame);previewObserver=new ResizeObserver(()=>{const scale=preview.clientWidth/width;candidateFrame!.style.transform=`scale(${scale})`;preview.style.height=(height*scale)+'px';});previewObserver.observe(preview);}
  }
  signal.throwIfAborted();
  if(conflicts.length){
   const body=document.createElement('div'),list=document.createElement('div'),apply=document.createElement('button');body.className='film-source-relink-grid';list.className='film-source-relink-conflicts';apply.textContent=t('应用替换');apply.disabled=true;body.append(preview,list);dialog.insertBefore(body,status);actions.prepend(apply);status.textContent=t('为缺失或不兼容的对象选择新对象，或明确不复用该调整。');
   for(const conflict of conflicts){const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');caption.textContent=conflict.label;select.setAttribute('aria-label',conflict.label);select.append(new Option(t('选择对应对象'),''),...conflict.choices.map(choice=>new Option(choice.label,choice.id)),new Option(t('不复用这项调整'),'drop'));select.onchange=()=>{conflict.value=select.value;status.textContent='';apply.disabled=conflicts.some(value=>!value.value);if(!select.value)return;try{conflict.set(select.value);void conflict.preview?.().catch(error=>{status.textContent=errorText(error);});}catch(error){status.textContent=errorText(error);apply.disabled=true;}};label.append(caption,select);list.append(label);}
   await new Promise<void>((resolve,reject)=>{const cancelled=()=>reject(new DOMException('Aborted','AbortError'));signal.addEventListener('abort',cancelled,{once:true});apply.onclick=()=>{apply.disabled=true;void (async()=>{try{for(const conflict of conflicts)conflict.set(conflict.value);for(const check of checks)await check();signal.removeEventListener('abort',cancelled);resolve();}catch(error){status.textContent=errorText(error);apply.disabled=false;}})();};if(signal.aborted)cancelled();});
  }else for(const check of checks)await check();
  signal.throwIfAborted();if(JSON.stringify(options.document())!==JSON.stringify(captured))throw Error('工程已更新，未覆盖新的修改，请重新选择素材');next=parseFilmDocument(next);
  await batch.complete();cancel.disabled=true;status.textContent=t('正在保存…');const accepted=await options.execute([{type:'film.document.restore',document:next,expected:captured}]);if(accepted===false)return false;
  if(!options.deferProxy)for(const source of replaced)if(source.kind==='video')void queueMediaProxy(source);return true;
 }catch(error){if(!signal.aborted)options.report(errorText(error));return false;}
 finally{options.signal?.removeEventListener('abort',externalAbort);previewObserver?.disconnect();transport?.dispose();session?.dispose();candidateFrame?.remove();dialog?.remove();await batch?.discard();}
}
