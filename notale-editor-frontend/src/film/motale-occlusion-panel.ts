import {translateUi as t} from '../i18n/store';
import type {OcclusionResult,OcclusionWarning} from './motale-occlusion';
import './motale-occlusion-panel.css';

/** Advisory only: the host owns selection, saving and error messages. */
export function motaleOcclusionPanel(select:(warning:OcclusionWarning)=>void){
 const node=document.createElement('div');node.className='film-occlusion';node.hidden=true;
 const button=document.createElement('button');button.type='button';button.dataset.role='occlusion';button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/></svg>';
 const popup=document.createElement('div');popup.className='film-ui film-occlusion-popup';popup.id='film-occlusion-'+crypto.randomUUID();popup.setAttribute('popover','auto');popup.setAttribute('role','dialog');popup.setAttribute('aria-label',t('交互区域遮挡'));button.setAttribute('aria-controls',popup.id);
 const heading=document.createElement('strong');heading.textContent=t('可能遮挡交互区域');const list=document.createElement('div');list.className='film-occlusion-list';const note=document.createElement('p');popup.append(heading,list,note);node.append(button,popup);
 const events=new AbortController();let result:OcclusionResult={warnings:[],unknown:[]},signature='';
 const key=(w:OcclusionWarning)=>JSON.stringify([w.clipId,w.targetClipId,w.actId,w.regionKey]);
 const close=()=>{if(popup.matches(':popover-open'))popup.hidePopover();};
 const place=()=>{if(!popup.matches(':popover-open'))return;const rect=button.getBoundingClientRect();popup.style.width=Math.min(340,window.innerWidth-24)+'px';popup.style.left=Math.max(12,Math.min(window.innerWidth-popup.offsetWidth-12,rect.right-popup.offsetWidth))+'px';popup.style.top=Math.max(12,rect.top-popup.offsetHeight-8)+'px';};
 button.onclick=()=>{popup.togglePopover();place();if(popup.matches(':popover-open'))list.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});};
 popup.addEventListener('toggle',()=>{button.setAttribute('aria-expanded',String(popup.matches(':popover-open')));place();},{signal:events.signal});
 popup.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();button.focus();}},{signal:events.signal});
 button.addEventListener('keydown',event=>{if(popup.matches(':popover-open')){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}}},{signal:events.signal});
 window.addEventListener('resize',place,{signal:events.signal});window.addEventListener('scroll',place,{signal:events.signal,capture:true,passive:true});
 return {node,update(next:OcclusionResult){
  result=next;node.dataset.state=next.unknown.length?'incomplete':next.warnings.length?'warning':'clear';
  const nextSignature=JSON.stringify([next,t('可能遮挡交互区域')]);if(nextSignature===signature)return;signature=nextSignature;
  const focused=popup.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.occlusionKey:undefined;
  node.hidden=!next.warnings.length;if(node.hidden)close();
  button.title=t('可能遮挡交互区域')+' · '+next.warnings.length;button.setAttribute('aria-label',button.title);heading.textContent=t('可能遮挡交互区域');popup.setAttribute('aria-label',t('交互区域遮挡'));
  list.replaceChildren(...next.warnings.map(w=>{const row=document.createElement('button');row.type='button';row.dataset.occlusionKey=key(w);row.dataset.occlusionCover=w.clipId;row.dataset.occlusionTarget=w.targetClipId;
   const name=document.createElement('span');name.textContent=w.coverTitle;const target=document.createElement('small');target.textContent=w.targetTitle+' · '+w.regionLabel;row.append(name,target);row.title=name.textContent+' → '+target.textContent;
   row.onclick=()=>{const current=result.warnings.find(item=>key(item)===key(w));if(current){close();select(current);}};return row;}));
  note.hidden=!next.unknown.length;note.textContent=next.unknown.length?t('部分画面暂不能完整检查遮挡'):'';
  if(focused){const match=[...list.querySelectorAll<HTMLButtonElement>('button')].find(row=>row.dataset.occlusionKey===focused);(match??button).focus({preventScroll:true});}place();
 },dispose(){close();events.abort();node.remove();}};
}
