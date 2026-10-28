import {filmMenuItems,type FilmMenuEntry} from './context-menu';
import type {FilmDocument,FilmCommand,FilmSource} from '@notale/editor/film';
import {ClickSelection,additiveSelection} from './selection-modifiers';
import {scrubThumbnail} from './video-thumbnails';
import {translateUi as t,localeStore} from '../i18n/store';
import {mediaThumbnail} from './media-import';
import {mediaPreviewState,previewMode,setPreviewMode,queueMediaProxy,cancelMediaProxy,type PreviewMode} from './media-preview';
interface Options {
 document:()=>FilmDocument;execute:(commands:FilmCommand[])=>unknown|Promise<unknown>;
 append:(ids:string[])=>unknown;preview:(id:string)=>void;select:(id:string)=>void;
 relink?:(id:string,mode:'relink'|'replace')=>void;selectionChanged?:(ids:string[])=>void;query?:()=>string;kind?:()=>string;report:(message:string)=>void;
}
interface MediaRow {
 source:FilmSource;item:HTMLDivElement;entry:HTMLButtonElement;check:HTMLInputElement;
 thumbnail:HTMLSpanElement;missing:HTMLSpanElement;healthUri:string;badge:HTMLSpanElement;retry:HTMLButtonElement;retrying:boolean;
}
/** Selection is view-only. Every authoring mutation is one Film command batch. */
export function mountMediaLibrary(host:HTMLElement,options:Options){
 const selected=new Set<string>(),rows=new Map<string,MediaRow>(),clicks=new ClickSelection();
 let filter='*',disposed=false,scope=options.document().id,lastGroups='',lastFilter='',focusedId:string|undefined;
 const tools=document.createElement('div'),list=document.createElement('div'),status=document.createElement('p');
 tools.className='film-media-tools';list.className='film-media-grid';list.setAttribute('role','listbox');list.setAttribute('aria-label',t('工程素材'));list.setAttribute('aria-multiselectable','true');status.className='film-media-status';status.setAttribute('role','status');host.replaceChildren(tools,list,status);host.classList.add('film-media-library');
 const paths:Record<string,string>={
  '全选':'M4 4h16v16H4z M8 12l3 3 6-6','加入时间线':'M3 5h18v5H3z M3 14h9v5H3z M18 13v8 M14 17h8',
  '重命名':'M4 16l-1 5 5-1L20 8l-4-4z M13 7l4 4','移动分组':'M3 7V4h6l2 3h10v14H3z M8 14h9 M14 11l3 3-3 3',
  '移除未使用':'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M9 10v7 M15 10v7','取消代理':'M5 5l14 14 M19 5L5 19',
  '重新定位素材':'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2','替换素材':'M3 7h15l-4-4 M21 17H6l4 4 M18 7l-4 4 M6 17l4-4',
  '重试':'M4 9a8 8 0 1 1 0 6 M4 3v6h6',
 };
 const button=(label:string,run:()=>void)=>{
  const element=document.createElement('button');element.type='button';element.dataset.message=label;
  const shape=paths[label];if(shape){element.dataset.icon='true';element.title=t(label);element.setAttribute('aria-label',t(label));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');path.setAttribute('d',shape);svg.append(path);element.append(svg);}else element.textContent=t(label);
  element.onclick=run;return element;
 };
 const group=document.createElement('select');group.setAttribute('aria-label',t('素材分组'));group.onchange=()=>{filter=group.value;update();};
 const all=button('全选',selectVisible),append=button('加入时间线',()=>run('append')),rename=button('重命名',()=>run('rename')),move=button('移动分组',()=>run('bin')),remove=button('移除未使用',()=>run('remove'));
 const proxy=document.createElement('select');proxy.setAttribute('aria-label',t('预览质量'));proxy.append(new Option(t('自动代理'),'auto'),new Option(t('原始素材'),'original'),new Option(t('生成代理'),'proxy'));
 proxy.onchange=()=>{const mode=proxy.value as PreviewMode;for(const source of chosen().filter(s=>s.kind==='video')){setPreviewMode(source.uri,mode);if(mode!=='original')void queueMediaProxy(source,mode==='proxy');}update();};
 const cancel=button('取消代理',()=>{for(const source of chosen())void cancelMediaProxy(source.uri).catch(e=>options.report(String(e)));}),batch=document.createElement('div');batch.className='film-media-batch';const relink=button('重新定位素材',()=>{run('relink');}),replace=button('替换素材',()=>{run('replace');});batch.append(append,rename,move,remove,relink,replace,proxy,cancel);tools.append(group,all,batch);
 const entries:FilmMenuEntry[]=[{id:'preview',label:'预览素材'},{id:'append',label:'加入时间线'},{id:'rename',label:'重命名素材…',separator:true},{id:'bin',label:'移动分组…'},{id:'relink',label:'重新定位素材…',separator:true},{id:'replace',label:'替换素材…'},{id:'remove',label:'移除未使用素材',icon:'delete',separator:true}];
 function unused(){const doc=options.document(),used=new Set(doc.tracks.flatMap(track=>track.kind==='media'?track.clips.map(c=>c.sourceId):track.wordSourceId?[track.wordSourceId]:[]));return chosen().filter(source=>!used.has(source.id));}
 function reason(id:string){
  const items=chosen();if(disposed||!items.length)return '请选择素材';
  if(['preview','rename','relink','replace'].includes(id)&&items.length!==1)return '请选择一个素材';
  if(['relink','replace'].includes(id)&&(!options.relink||['sequence','overlay','lecture'].includes(items[0].kind)))return '此素材类型不支持替换文件';
  if(id==='remove'&&!unused().length)return '所选素材正在时间线中使用';
 }
 function run(id:string){
  const why=reason(id);if(why){options.report(t(why));return;}const items=chosen();
  if(id==='preview')return options.preview(items[0].id);
  if(id==='append')return options.append(items.map(item=>item.id));
  if(id==='rename'||id==='bin')return edit(id);
  if(id==='relink'||id==='replace')return options.relink?.(items[0].id,id);
  if(id==='remove')return execute(unused().map(source=>({type:'film.source.remove',sourceId:source.id})));
 }
 function visible(){const query=(options.query?.()??'').toLocaleLowerCase(),kind=options.kind?.()??'';return options.document().sources.filter(s=>s.kind!=='overlay'&&s.title.toLocaleLowerCase().includes(query)&&(!kind||kind==='all'||s.kind===kind)&&(filter==='*'||(s.bin??'')===filter)).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title));}
 function chosen(){return options.document().sources.filter(s=>selected.has(s.id));}
 function changed(){options.selectionChanged?.([...selected]);if(selected.size===1)options.select([...selected][0]);update();clicks.accept([...selected]);}
 function tabStops(){
  list.tabIndex=list.children.length?-1:0;
  for(const [id,row]of rows)row.entry.tabIndex=id===focusedId&&row.item.parentElement===list?0:-1;
 }
 function focusItem(id?:string){
  const entry=id?rows.get(id)?.entry:undefined;
  if(entry&&list.contains(entry)){focusedId=id;tabStops();}else id=undefined;
  const target=id?entry!:list;target.focus({preventScroll:true});
  // Reveal only inside the nearest local scroller; never move the outer page.
  for(let parent=target.parentElement;parent&&parent!==document.body&&parent!==document.documentElement;parent=parent.parentElement){
   const style=getComputedStyle(parent),vertical=/(auto|scroll)/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight,horizontal=/(auto|scroll)/.test(style.overflowX)&&parent.scrollWidth>parent.clientWidth;
   if(!vertical&&!horizontal)continue;
   const r=target.getBoundingClientRect(),p=parent.getBoundingClientRect(),top=p.top+parent.clientTop,left=p.left+parent.clientLeft;
   if(vertical)parent.scrollTop+=r.top<top?r.top-top:r.bottom>top+parent.clientHeight?r.bottom-top-parent.clientHeight:0;
   if(horizontal)parent.scrollLeft+=r.left<left?r.left-left:r.right>left+parent.clientWidth?r.right-left-parent.clientWidth:0;
   break;
  }
 }
 function keyboardDestination(order:string[],current:string|undefined,key:string){
  if(key==='Home')return order[0];if(key==='End')return order.at(-1);
  const index=current?order.indexOf(current):-1;if(index<0)return order[0];
  if(key==='ArrowLeft'||key==='ArrowRight')return order[Math.max(0,Math.min(order.length-1,index+(key==='ArrowLeft'?-1:1)))];
  const rect=rows.get(current!)!.entry.getBoundingClientRect(),direction=key==='ArrowUp'?-1:1;
  const candidates=order.filter(id=>id!==current).map(id=>({id,rect:rows.get(id)!.entry.getBoundingClientRect()})).filter(item=>(item.rect.top-rect.top)*direction>1);
  if(!candidates.length)return current;
  const distance=Math.min(...candidates.map(item=>(item.rect.top-rect.top)*direction));
  return candidates.filter(item=>(item.rect.top-rect.top)*direction<=distance+1).sort((a,b)=>Math.abs(a.rect.left+a.rect.width/2-rect.left-rect.width/2)-Math.abs(b.rect.left+b.rect.width/2-rect.left-rect.width/2))[0].id;
 }
 function selectVisible(){selected.clear();for(const source of visible())selected.add(source.id);clicks.reset();changed();}
 async function execute(commands:FilmCommand[]){try{const result=await options.execute(commands);if(result===false)return false;if(!disposed)update();return true;}catch(error){options.report(error instanceof Error?error.message:String(error));return false;}}
 function edit(kind:'rename'|'bin'){
  const items=chosen(),documentId=options.document().id;if(!items.length||kind==='rename'&&items.length!==1)return;
  const dialog=document.createElement('dialog');dialog.className='film-document-dialog film-media-edit';dialog.setAttribute('aria-label',t(kind==='rename'?'重命名素材':'移动素材分组'));const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),save=button('保存',()=>{}),cancel=button('取消',()=>dialog.close());form.method='dialog';input.value=kind==='rename'?items[0].title:items.every(s=>s.bin===items[0].bin)?items[0].bin??'':'';input.maxLength=256;input.required=kind==='rename';label.textContent=t(kind==='rename'?'素材名称':'分组');label.append(input);save.type='submit';form.append(label,save,cancel);dialog.append(form);
  form.onsubmit=event=>{event.preventDefault();if(disposed||options.document().id!==documentId){dialog.close();return;}const value=input.value.trim();if(kind==='rename'&&!value)return;void execute(items.map(s=>({type:'film.source.update',sourceId:s.id,patch:kind==='rename'?{title:value}:{bin:value}}))).then(ok=>{if(ok)dialog.close();});};dialog.onclose=()=>dialog.remove();host.append(dialog);dialog.showModal();input.focus();input.select();
 }
 function createRow(source:FilmSource):MediaRow{
  const item=document.createElement('div'),entry=document.createElement('button'),check=document.createElement('input'),badge=document.createElement('span');
  const retry=button('重试',()=>{
   if(row.retrying)return;row.retrying=true;update();setPreviewMode(row.source.uri,'proxy');
   void queueMediaProxy(row.source,true).finally(()=>{row.retrying=false;if(disposed)return;const finished=mediaPreviewState.get(row.source.uri);if(finished?.state==='complete'&&document.activeElement===retry)entry.focus({preventScroll:true});update();});
  });
  const thumbnail=document.createElement('span'),missing=document.createElement('span');thumbnail.className='film-media-thumbnail';missing.className='film-media-missing';missing.hidden=true;const row:MediaRow={source,item,entry,check,thumbnail,missing,healthUri:'',badge,retry,retrying:false};item.className='film-media-item';item.dataset.sourceId=source.id;
  entry.type='button';entry.className='film-pool-item';entry.dataset.sourceId=source.id;entry.setAttribute('role','option');thumbnail.append(mediaThumbnail(source));entry.append(thumbnail);scrubThumbnail(thumbnail,source);entry.draggable=true;
  entry.onclick=event=>{const ids=clicks.click(visible().map(s=>s.id),[...selected],source.id,event);selected.clear();ids.forEach(id=>selected.add(id));changed();};
  entry.ondblclick=()=>options.preview(source.id);
  entry.ondragstart=event=>{if(!selected.has(source.id)){selected.clear();selected.add(source.id);clicks.reset();update();}event.dataTransfer!.setData('application/x-notale-film-source',source.id);event.dataTransfer!.setData('application/x-notale-film-sources',JSON.stringify([...selected]));event.dataTransfer!.effectAllowed='copy';};entry.ondragend=()=>changed();
  check.type='checkbox';check.className='film-media-select';check.onchange=()=>{const ids=clicks.click(visible().map(s=>s.id),[...selected],source.id,{ctrlKey:true,metaKey:false,shiftKey:false});selected.clear();ids.forEach(id=>selected.add(id));changed();};
  badge.className='film-media-proxy-state';retry.className='film-media-proxy-retry';item.append(entry,check,badge,retry,missing);return row;
 }
 function update(){
  if(disposed)return;
  const active=document.activeElement,hadFocus=!!active&&list.contains(active),previousIndex=Math.max(0,[...list.children].findIndex(item=>(item as HTMLElement).dataset.sourceId===focusedId));
  const doc=options.document(),scopeChanged=scope!==doc.id;let selectionPruned=false;
  if(scope!==doc.id){scope=doc.id;selected.clear();clicks.reset();filter='*';rows.clear();list.replaceChildren();lastFilter='';selectionPruned=true;}
  const groups=[...new Set(doc.sources.map(s=>s.bin).filter((s):s is string=>!!s))].sort();if(filter!=='*'&&filter!==''&&!groups.includes(filter))filter='*';
  const filterKey=JSON.stringify([filter,options.query?.()??'',options.kind?.()??'']);
  if(lastFilter&&filterKey!==lastFilter){selectionPruned=selected.size>0;selected.clear();clicks.reset();}lastFilter=filterKey;
  for(const id of selected)if(!doc.sources.some(s=>s.id===id)){selected.delete(id);selectionPruned=true;}
  list.setAttribute('aria-label',t('工程素材'));for(const button of tools.querySelectorAll<HTMLElement>('[data-message]')){const label=t(button.dataset.message!);if(button.dataset.icon){button.title=label;button.setAttribute('aria-label',label);}else button.textContent=label;}
  group.setAttribute('aria-label',t('素材分组'));proxy.setAttribute('aria-label',t('预览质量'));[...proxy.options].forEach((option,i)=>option.text=t(['自动代理','原始素材','生成代理'][i]));
  const groupsKey=JSON.stringify([groups,localeStore.getSnapshot()]);if(groupsKey!==lastGroups){lastGroups=groupsKey;group.replaceChildren(new Option(t('全部分组'),'*'),new Option(t('未分组'),''),...groups.map(name=>new Option(name,name)));}group.value=filter;
  const sources=visible(),visibleIds=new Set(sources.map(s=>s.id));
  for(const [id,row]of rows){if(!visibleIds.has(id))row.item.remove();if(!doc.sources.some(s=>s.id===id))rows.delete(id);}
  for(const [index,source]of sources.entries()){
   let row=rows.get(source.id);if(!row){row=createRow(source);rows.set(source.id,row);}if(row.source.uri!==source.uri||row.source.kind!==source.kind){const thumbnail=document.createElement('span');thumbnail.className='film-media-thumbnail';thumbnail.append(mediaThumbnail(source));scrubThumbnail(thumbnail,source);row.thumbnail.replaceWith(thumbnail);row.thumbnail=thumbnail;}row.source=source;
   if(row.healthUri!==source.uri&&!['sequence','overlay','lecture'].includes(source.kind)){row.healthUri=source.uri;row.missing.hidden=true;const uri=source.uri,current=row;void fetch('/film-media/status?uri='+encodeURIComponent(uri)).then(async response=>{if(response.ok)return false;const body=await response.json();return body.code==='RESOURCE_MISSING';}).then(missing=>{if(disposed||current.source.uri!==uri)return;current.missing.hidden=!missing;current.missing.textContent=missing?t('素材文件缺失'):'';current.missing.title=t('选择素材后重新定位文件');}).catch(()=>{});}
   // Stable nodes preserve native double-click, drag and the precise checkbox focus.
   if(list.children[index]!==row.item)list.insertBefore(row.item,list.children[index]??null);
   row.entry.title=source.title;row.entry.setAttribute('aria-label',source.title);row.entry.setAttribute('aria-selected',String(selected.has(source.id)));row.entry.setAttribute('aria-pressed',String(selected.has(source.id)));row.check.checked=selected.has(source.id);row.check.setAttribute('aria-label',t('选择素材')+' '+source.title);
   const state=mediaPreviewState.get(source.uri),retryable=state?.state==='failed'||state?.state==='cancelled';
   row.badge.hidden=!state||state.state==='original';const label=state?.state==='complete'?t('代理'):state?.state==='running'||state?.state==='queued'?`${t('代理')} ${Math.round((state.progress??0)*100)}%`:state?.state==='cancelled'?t('已取消'):t('代理失败');row.badge.textContent=label;row.badge.title=state?.error??label;
   row.retry.hidden=!retryable&&!row.retrying;row.retry.disabled=row.retrying;row.retry.setAttribute('aria-busy',String(row.retrying));const retryLabel=`${t('重试')} · ${t('生成代理')} · ${source.title}`,reason=state?.error?t(state.error):retryable?label:'';row.retry.title=reason?`${retryLabel}\n${reason}`:retryLabel;row.retry.setAttribute('aria-label',reason?`${retryLabel} · ${reason}`:retryLabel);row.item.dataset.proxyRetry=String(!row.retry.hidden);
  }
  const items=chosen(),videos=items.filter(s=>s.kind==='video');batch.hidden=!items.length;relink.hidden=replace.hidden=!options.relink||items.length!==1||['sequence','overlay','lecture'].includes(items[0]?.kind??'');rename.hidden=items.length!==1;append.disabled=move.disabled=remove.disabled=!items.length;rename.disabled=items.length!==1;all.disabled=!sources.length;proxy.hidden=!videos.length;proxy.value=videos.length?previewMode(videos[0].uri):'auto';cancel.hidden=!videos.some(s=>['running','queued'].includes(mediaPreviewState.get(s.uri)?.state??''));status.textContent=items.length?`${items.length} ${t('项已选择')}`:options.query?.()&&!sources.length?t('没有匹配的素材'):'';
  if(scopeChanged||!focusedId||!visibleIds.has(focusedId))focusedId=sources[scopeChanged?0:Math.min(previousIndex,sources.length-1)]?.id;
  for(const [id,control] of [['append',append],['rename',rename],['bin',move],['remove',remove],['relink',relink],['replace',replace]] as const){const why=reason(id);control.disabled=!!why;control.title=t(control.dataset.message??'')+(why?' · '+t(why):'');}
  tabStops();
  if(hadFocus&&document.activeElement!==active){if(active instanceof HTMLElement&&list.contains(active)&&!active.hidden)active.focus({preventScroll:true});else focusItem(focusedId);}
  if(selectionPruned)options.selectionChanged?.([...selected]);
 }
 const keydown=(event:KeyboardEvent)=>{
  const target=event.target instanceof Element?event.target:undefined;
  if(event.defaultPrevented||event.isComposing||event.altKey||target?.closest('input:not([type="checkbox"]),textarea,select,[contenteditable]:not([contenteditable="false"]),dialog'))return;
  const modifier=event.ctrlKey||event.metaKey;
  if(modifier&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();selectVisible();return;}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();selected.clear();clicks.reset();changed();return;}
  const item=target?.closest<HTMLElement>('.film-pool-item,.film-media-select');
  if(target!==list&&(!item||!list.contains(item)))return;
  const navigating=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key);
  if(!navigating&&event.key!==' '||event.key===' '&&item?.matches('input[type="checkbox"]'))return;
  event.preventDefault();event.stopPropagation();
  const order=visible().map(source=>source.id),current=item?.closest<HTMLElement>('.film-media-item')?.dataset.sourceId??focusedId;
  const next=navigating?keyboardDestination(order,current,event.key):current;if(!next)return;
  if(event.key===' '&&event.repeat)return;
  if(!modifier||event.shiftKey||!navigating){
   const modifiers=event.key===' '?{ctrlKey:true,metaKey:false,shiftKey:event.shiftKey}:event;
   const ids=clicks.click(order,[...selected],next,modifiers,current);selected.clear();ids.forEach(id=>selected.add(id));changed();
  }
  focusItem(next);
 };
 const focusin=(event:FocusEvent)=>{const target=event.target instanceof Element?event.target:undefined,item=target?.closest<HTMLElement>('.film-media-item');if(item&&list.contains(item)){focusedId=item.dataset.sourceId;tabStops();}};
 const blank=(event:MouseEvent)=>{if((event.target!==list&&event.target!==host)||additiveSelection(event))return;selected.clear();clicks.reset();changed();focusItem();};
 host.addEventListener('focusin',focusin);host.addEventListener('click',blank);host.addEventListener('keydown',keydown);const unsubscribe=mediaPreviewState.subscribe(update),unlocale=localeStore.subscribe(update);update();
 return {update,menu:()=>filmMenuItems(entries,reason,run),focus:()=>focusItem(focusedId),select(ids:string[]){if(scope!==options.document().id)update();if(ids.length!==selected.size||ids.some(id=>!selected.has(id)))clicks.reset();selected.clear();for(const id of ids)selected.add(id);update();},selected:()=>[...selected],dispose(){disposed=true;unsubscribe();unlocale();host.removeEventListener('focusin',focusin);host.removeEventListener('click',blank);host.removeEventListener('keydown',keydown);rows.clear();host.replaceChildren();}};
}
