'use client';
import {useI18n} from '../i18n/react';

import {Fragment,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {aiEditsState,diffChips,DIFF_PREVIEW,ATTACHMENT_LIMIT,FILE_LIMIT,FILE_PATTERN,type AiTurn,type AiMention,type DiffRow,type DiffChip,type ChangeKind} from '../state/ai-edits';
import {ModelPicker,MentionMenu} from './composer-menus';
import {ASSISTANT_NAME} from '@notale/editor/i18n';
import {ToolChips} from './tool-chips';
import {isComposingKey} from '../keyboard';
import {objectMenuIcons} from '../object-menu-icons';
const EXAMPLES=['把这一页的配色统一一下','标题小一点，正文往下挪，别挤在一起','加一个点开才显示答案的提示框'];
/** The review list: one line per touched object, the way a change panel lists files -- kind,
 * name, page, and a badge for how much. No diff here; the canvas is the diff. Clicking a line
 * points at the object on the canvas. */
const KIND_ICONS:Record<ChangeKind,string>={
 insert:'M12 5v14M5 12h14',
 delete:'M4 6h16M9 3h6M7 6l1 15h8l1-15',
 patch:'M4 20h4L18 10l-4-4L4 16zM13 7l4 4',
 content:'M4 6h16M4 12h16M4 18h10',
 component:'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8',
};
function Changes({rows,onLocate}:{rows:DiffRow[];onLocate?:(slideId:string,id:string)=>void}){
 const t=useI18n();
 const [open,setOpen]=useState(false);
 const chips=diffChips(rows);
 if(!chips.length)return null;
 const shown=open?chips:chips.slice(0,DIFF_PREVIEW);
 const badge=(chip:DiffChip)=>chip.kind==='insert'?t('新增'):chip.kind==='delete'?t('删除'):chip.kind==='component'?t('交互'):chip.kind==='content'?t('换内容'):t('{0} 处',{'0':chip.count});
 return <div className="ai-changes">
  {shown.map((chip,index)=>{
   // Only objects that exist on a page can be pointed at; an insert's id is minted on apply.
   const locatable=!!onLocate&&!!chip.slideId&&chip.kind!=='insert'&&chip.kind!=='component';
   const Row=locatable?'button':'div';
   return <Fragment key={(chip.turn??'')+chip.target+chip.label}>
    {chip.turn&&chip.turn!==shown[index-1]?.turn && <div className="ai-changes-turn" title={chip.turn}>{chip.turn}</div>}
    <Row {...(locatable?{type:'button' as const,onClick:()=>onLocate!(chip.slideId!,chip.target),title:t('在画布上选中')}:{})} className={'ai-change is-'+chip.kind+(locatable?' is-locatable':'')}>
     <svg className="ai-change-kind" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={KIND_ICONS[chip.kind]}/></svg>
     <span className="ai-change-label">{chip.generic?t(chip.label):chip.label}</span>
     {chip.page && <span className="ai-change-page">{t(chip.page)}</span>}
     <span className={'ai-change-badge'+(chip.kind==='delete'?' is-delete':'')}>{badge(chip)}</span>
    </Row>
   </Fragment>;
  })}
  {chips.length>DIFF_PREVIEW && <button type="button" className="ai-disclose" aria-expanded={open} onClick={()=>setOpen(!open)}>{open ? t("收起") : t("还有 {0} 个对象", {"0": chips.length-DIFF_PREVIEW})}</button>}
 </div>;
}
/** What the author said, with a way to take the words back out. Copying falls back to selecting
 * the bubble when the clipboard is unavailable, so the author can still ⌘C it themselves. */
function useCopy(text:string,node:{current:HTMLElement|null}){
 const [copied,setCopied]=useState(false);
 const copy=async()=>{
  try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),600);}
  catch{
   const range=document.createRange(),selection=document.getSelection();
   if(node.current&&selection){range.selectNodeContents(node.current);selection.removeAllRanges();selection.addRange(range);}
  }
 };
 return [copied,copy] as const;
}
const RETRY_ICON='M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6';
function Bubble({text}:{text:string}){
 const t=useI18n();
 const node=useRef<HTMLParagraphElement>(null);
 const [copied,copy]=useCopy(text,node);
 return <div className="ai-bubble-row">
  <p ref={node} className="ai-bubble">{text}</p>
  <button type="button" className="ai-bubble-copy" aria-label={t("复制")} title={t("复制")} onClick={()=>void copy()}>
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={copied?'M4 12.5l5 5L20 6.5':objectMenuIcons.copy}/></svg>
  </button>
 </div>;
}
/** The selection, quoted into the composer the way a reference is. Nothing selected means the
 * whole page, which needs no announcement -- so the chip simply isn't there. */
function Reference({label,onClear}:{label:string;onClear?:()=>void}){
 const t=useI18n();

 return <div id="ai-target" className="ai-reference">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7"/></svg>
  <span className="ai-reference-label">{label}</span>
  <button type="button" className="ai-reference-clear" aria-label={t("取消引用，改动整页")} title={t("取消引用，改动整页")} onClick={onClear}>{"✕"}</button>
 </div>;
}
/** The reply as it streams: each piece that arrives fades in out of a blur, then a caret. Pieces
 * already shown keep their spans, so only the new words animate. */
function StreamingReply({text}:{text:string}){
 const pieces=useRef<string[]>([]);
 const joined=pieces.current.join('');
 if(!text.startsWith(joined))pieces.current=text?[text]:[];
 else if(text.length>joined.length)pieces.current=[...pieces.current,text.slice(joined.length)];
 return <p className="ai-reply-text is-streaming" aria-live="polite">
  {pieces.current.map((piece,index)=><span key={index} className="ai-piece">{piece}</span>)}
  <span className="ai-caret" aria-hidden="true"/>
 </p>;
}
/** A finished turn is one row until you ask for more: status, what was said, how it ended. */
function Turn({turn,busy,onRetry}:{turn:AiTurn;busy:boolean;onRetry:()=>void}){
 const t=useI18n();
 const reply=useRef<HTMLParagraphElement>(null);
 const [copied,copy]=useCopy(turn.text??'',reply);

 const [open,setOpen]=useState(false);
 const note=turn.detail?' · '+t(turn.detail):'';
 const outcome=turn.status==='failed'?t('失败')+note
  :turn.status==='interrupted'?t('已停止，停止前的改动已写进讲义')+note
  :turn.status==='incomplete'?t('没有做完')+note
  :turn.version!==undefined?t('已写进讲义'):t('只回答，没有改动');
 return <div className={'ai-turn is-'+turn.status}>
  {turn.intent==='edit-selection' && <p className="ai-turn-target">{t("引用 {0}", {"0": turn.targetLabel})}</p>}
  <Bubble text={turn.instruction}/>
  <div className="ai-reply">
   {!!turn.text && <p ref={reply} className="ai-reply-text">{turn.text}</p>}
   <div className="ai-turn-actions">
    {!!turn.text && <button type="button" className="ai-icon-button" aria-label={t('复制回复')} title={t('复制回复')} onClick={()=>void copy()}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={copied?'M4 12.5l5 5L20 6.5':objectMenuIcons.copy}/></svg>
    </button>}
    <button type="button" className="ai-icon-button ai-retry" disabled={busy} aria-label={t('重试')} title={t('重试')} onClick={onRetry}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={RETRY_ICON}/></svg>
    </button>
   </div>
   <button type="button" className="ai-turn-row" aria-expanded={open} onClick={()=>setOpen(!open)}>
    <span className="ai-turn-dot" aria-hidden="true"/>
    <span className="ai-turn-outcome">{outcome}</span>
   </button>
   {open && <div className="ai-turn-detail">
    <ToolChips steps={turn.steps} rows={[]}/>
   </div>}
  </div>
 </div>;
}
/** The @ being typed at the caret, if any: `@` at the start or after a space, then non-spaces. */
function mentionAt(text:string,caret:number){
 const match=/(^|\s)@([^\s@]*)$/.exec(text.slice(0,caret));
 return match?{start:match.index+match[1]!.length,query:match[2]!.toLowerCase()}:null;
}
/** The prompt bar: attach, the words, the model, send. One line while it fits; once the words wrap
 * they take the whole width and the controls drop to a row of their own. */
function Composer(){
 const t=useI18n();
 const model=useSyncExternalStore(aiEditsState.subscribe,aiEditsState.getSnapshot,aiEditsState.getServerSnapshot);
 const running=model.status==='running';
 const box=useRef<HTMLDivElement>(null),grid=useRef<HTMLDivElement>(null),field=useRef<HTMLTextAreaElement>(null),measure=useRef<HTMLSpanElement>(null),files=useRef<HTMLInputElement>(null);
 const [wide,setWide]=useState(false),[caret,setCaret]=useState(0),[active,setActive]=useState(0),[dismissed,setDismissed]=useState(-1),[sweep,setSweep]=useState(0),[dragging,setDragging]=useState(false),[width,setWidth]=useState(0);
 const placeholder=t("让 {0} 改这一页…",{"0":ASSISTANT_NAME});
 const mention=mentionAt(model.instruction,caret);
 const items:AiMention[]=mention&&dismissed!==mention.start?(model.mentions?.()??[]).filter(item=>!mention.query||item.label.toLowerCase().includes(mention.query)||item.insert.toLowerCase().includes(mention.query)).slice(0,30):[];
 const menuOpen=!!mention&&dismissed!==mention.start;
 useEffect(()=>{setActive(0);},[mention?.query,menuOpen]);
 useLayoutEffect(()=>{
  const node=field.current,row=grid.current,text=measure.current;if(!node||!row||!text||!row.clientWidth)return;
  // Room for the words on the one-line layout: the grid minus attach, model and send, and the gaps.
  const controls=[...row.children].filter(child=>child!==node).reduce((sum,child)=>sum+(child as HTMLElement).offsetWidth,0);
  // An empty bar measures its placeholder: a hint squeezed into three lines reads worse than a row of its own.
  const next=model.instruction.includes('\n')||text.offsetWidth+8>row.clientWidth-controls-12;
  if(next!==wide)setWide(next);
  node.style.height='auto';if(node.scrollHeight)node.style.height=Math.min(node.scrollHeight,150)+'px';
 },[model.instruction,wide,width,placeholder]);
 // The drawer starts hidden (zero width) and can be resized: measure again whenever the bar's width changes.
 useEffect(()=>{
  const row=grid.current;if(!row||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry?.contentRect.width??0)));
  observer.observe(row);return()=>observer.disconnect();
 },[]);
 const pick=(item:AiMention)=>{
  if(!mention)return;
  const before=model.instruction.slice(0,mention.start),after=model.instruction.slice(caret);
  const next=before+item.insert+' '+after,at=(before+item.insert+' ').length;
  model.change?.({instruction:next});setCaret(at);
  requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(at,at);});
 };
 // Pictures need a model that sees them; documents and video always go (read turns them into what the model can take).
 const canAttach=!running&&((model.vision&&model.attachments.length<ATTACHMENT_LIMIT)||model.files.length<FILE_LIMIT);
 const uploading=model.files.some(file=>file.state==='uploading');
 const take=(list:FileList|null|undefined)=>{const picked=[...(list??[])].filter(file=>file.type.startsWith('image/')||FILE_PATTERN.test(file.name));if(picked.length&&canAttach)void model.attach?.(picked);return picked.length>0;};
 return <div ref={box} className={'ai-composer'+(wide?' is-wide':'')+(dragging?' is-dropping':'')}
  onDragOver={event=>{if(canAttach&&[...event.dataTransfer.items].some(item=>item.kind==='file')){event.preventDefault();setDragging(true);}}}
  onDragLeave={()=>setDragging(false)}
  onDrop={event=>{setDragging(false);if(take(event.dataTransfer.files))event.preventDefault();}}>
  {sweep>0 && <span key={sweep} className="ai-sweep" aria-hidden="true"/>}
  {model.intent==='edit-selection' && <Reference label={model.targetLabel} onClear={()=>model.clearSelection?.()}/>}
  {!!model.attachments.length && <div className="ai-attachments">{model.attachments.map(item=><span key={item.id} className="ai-attachment" title={item.name}>
   <img src={item.url} alt={item.name}/>
   <button type="button" className="ai-attachment-remove" aria-label={t('移除 {0}',{'0':item.name})} title={t('移除')} onClick={()=>model.detach?.(item.id)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
   </button>
  </span>)}</div>}
  {!!model.files.length && <div className="ai-attachments is-files">{model.files.map(item=><span key={item.id} className={'ai-file is-'+item.state} title={item.error?t(item.error):item.name}>
   <span className="ai-file-kind" aria-hidden="true">{/\.([a-z0-9]+)$/i.exec(item.name)?.[1]?.toUpperCase()??'FILE'}</span>
   <span className="ai-file-name">{item.name}</span>
   {item.state!=='ready' && <span className="ai-file-state">{item.state==='uploading'?t('上传中…'):t('上传失败')}</span>}
   <button type="button" className="ai-attachment-remove" aria-label={t('移除 {0}',{'0':item.name})} title={t('移除')} onClick={()=>model.detach?.(item.id)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
   </button>
  </span>)}</div>}
  <span ref={measure} className="ai-measure" aria-hidden="true">{model.instruction||placeholder}</span>
  <div ref={grid} className="ai-composer-grid">
   <button type="button" id="ai-attach" className="ai-icon-button" disabled={!canAttach}
    aria-label={t('添加附件')} title={model.vision?t('添加附件：图片、PDF、文档或视频'):t('添加附件：PDF、文档或视频（当前模型看不了图片）')} onClick={()=>files.current?.click()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
   </button>
   <textarea id="ai-instruction" ref={field} rows={1} placeholder={placeholder}
    value={model.instruction} disabled={running||!model.available} aria-autocomplete="list" aria-expanded={menuOpen}
    onChange={event=>{model.change?.({instruction:event.target.value});setCaret(event.target.selectionStart);}}
    onSelect={event=>setCaret(event.currentTarget.selectionStart)}
    onPaste={event=>{if(take(event.clipboardData.files))event.preventDefault();}}
    onKeyDown={event=>{
     // The IME guard has to come first: Enter confirms a Chinese candidate, it does not send.
     if(isComposingKey(event.nativeEvent))return;
     if(menuOpen&&items.length){
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(value=>(value+(event.key==='ArrowDown'?1:items.length-1))%items.length);return;}
      if((event.key==='Enter'&&!event.shiftKey)||event.key==='Tab'){event.preventDefault();pick(items[active]!);return;}
     }
     if(menuOpen&&event.key==='Escape'){event.preventDefault();setDismissed(mention!.start);return;}
     if(event.key!=='Enter'||event.shiftKey)return;   // Shift+Enter is the newline, on every platform
     event.preventDefault();if(!uploading)void model.submit?.();
    }}/>
   <ModelPicker providers={model.providers} {...(model.choice?{choice:model.choice}:{})} {...(model.defaultModel?{fallback:model.defaultModel}:{})} disabled={running}
    onPick={ref=>{const changed=ref.provider!==(model.choice??model.defaultModel)?.provider||ref.id!==(model.choice??model.defaultModel)?.id;model.pickModel?.(ref);if(changed)setSweep(value=>value+1);field.current?.focus();}}/>
   {running ? <button id="ai-stop" className="ai-send is-stop" aria-label={t("停止")} title={t("停止")} onClick={()=>model.stop?.()}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg></button> : <button id="ai-submit" className="ai-send" aria-label={t("发送")} title={t("发送（回车）")} disabled={!model.instruction.trim()||!model.available||uploading} onClick={()=>void model.submit?.()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>}
  </div>
  <input ref={files} type="file" accept={(model.vision?'image/png,image/jpeg,image/webp,':'')+'.pdf,.docx,.pptx,.mp4,.mov,.webm'} multiple hidden onChange={event=>{take(event.target.files);event.target.value='';}}/>
  {menuOpen && <MentionMenu anchor={box} items={items} active={active} onPick={pick} onHover={setActive}/>}
 </div>;
}
/** The 互动 drawer: a conversation about this page's interactions. Scrollable transcript on top,
 * pinned composer below. The two ready-made presets that used to live here were removed. */
export function InteractiveDrawer(){
 const t=useI18n();

 const model=useSyncExternalStore(aiEditsState.subscribe,aiEditsState.getSnapshot,aiEditsState.getServerSnapshot);
 const running=model.status==='running',review=model.review;
 // The live block is the turn in flight (or the one that just failed).
 const live=running||!!model.error;
 const pages=new Set((review?.rows??[]).flatMap(row=>row.slideId?[row.slideId]:[]));
 const touched=diffChips(review?.rows??[]).length;
 const empty=!model.turns.length&&!live;
 const log=useRef<HTMLDivElement>(null),stick=useRef(true);
 // Follow new content, but stop following once the author scrolls up to read.
 useEffect(()=>{const node=log.current;if(node&&stick.current)node.scrollTop=node.scrollHeight;});
 return <div id="interactive-panel" className="interactive-panel">
  <div ref={log} className="ai-log" data-selectable-text onScroll={event=>{const node=event.currentTarget;stick.current=node.scrollHeight-node.scrollTop-node.clientHeight<24;}}>
   {empty ? <div className="ai-welcome">
       <h3>{t("想怎么改这一页？")}</h3>
       <div className="ai-examples">{EXAMPLES.map(text=><button key={text} type="button" onClick={()=>model.change?.({instruction:t(text)})}>{t(text)}</button>)}</div>
      </div> : <>
       {model.turns.map(turn=><Turn key={turn.id} turn={turn} busy={running} onRetry={()=>void model.retry?.(turn.id)}/>)}
       {live && <div className="ai-turn">
        {model.intent==='edit-selection' && <p className="ai-turn-target">{t("引用 {0}", {"0": model.targetLabel})}</p>}
        {!!model.sent && <Bubble text={model.sent}/>}
        <div className="ai-reply">
         {!!model.reply && <StreamingReply text={model.reply}/>}
         <ToolChips steps={model.steps} rows={[]} live/>
         {model.error && <p id="ai-error" role="alert">{t(model.error)}</p>}
        </div>
       </div>}
      </>}
  </div>
  <div className="ai-composer-area">
   {/* Pinned outside the transcript: everything since the baseline -- the AI's edits and the
       author's own -- until it is accepted or thrown away. */}
   {!!review && <div id="ai-candidate" className="ai-candidate" data-selectable-text>
        <div className="ai-candidate-head">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>
         <strong>{t("未审阅的改动")}</strong>
         <span className="ai-candidate-count">{[t('{0} 个对象',{'0':touched}),...(pages.size>1?[t('涉及 {0} 页',{'0':pages.size})]:[])].join(' · ')}</span>
        </div>
        <Changes rows={review.rows} onLocate={(slideId,id)=>model.locate?.(slideId,id)}/>
        <div className="ai-candidate-actions">
         <button id="ai-apply" className="primary" disabled={running} onClick={()=>void model.accept?.()}>{t("接受")}</button>
         <button id="ai-discard" className="quiet" disabled={running} title={t("回到上次接受时的样子，这期间所有人的改动都会撤掉")} onClick={()=>void model.discard?.()}>{t("全部放弃")}</button>
        </div>
       </div>}
   {!!model.turns.length && <div className="ai-composer-bar">
    <button id="ai-new-conversation" type="button" onClick={()=>model.newConversation?.()}>{t("新对话")}</button>
   </div>}
   <Composer/>
   {!model.available && <p id="ai-unavailable" className="hint" role="status">{t(model.reason) || t("模型服务不可用")}</p>}
  </div>
 </div>;
}
