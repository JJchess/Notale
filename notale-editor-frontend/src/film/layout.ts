import {translateUi as filmText} from '../i18n/store';
import {sidebar} from '../state/sidebar';
const shortcuts=[['Shift + F10 / 菜单键','打开当前区域的快捷菜单'],['空格','播放 / 暂停'],['← / →','逐帧'],['Shift + ← / →','跳转 10 帧'],['↑ / ↓','上 / 下剪辑点'],['Home / End','序列首 / 尾'],['J / K / L','倒放 / 停止 / 播放；重复加速'],['K + J / L','逐帧'],['Shift + L','循环'],['I / O / X','入点 / 出点 / 所选为范围'],['M / Shift + M / Alt + M','标记 / 前一标记 / 后一标记'],['V / B / N / Y / U','选择 / 波纹 / 滚动 / 滑移 / 滑动'],['Q / W / E','波纹修剪左 / 右 / 最近边'],[', / .','源素材插入 / 覆盖'],['[ / ]','选择播放头左侧 / 右侧'],['Ctrl/⌘ + C / X / V','复制 / 剪切 / 粘贴'],['Ctrl/⌘ + Shift + C / V','复制 / 选择性粘贴属性'],['Ctrl/⌘ + A / D','全选 / 复制到播放头'],['Ctrl/⌘ + Z / Shift + Z','撤销 / 重做'],['Ctrl/⌘ + S','保存'],['Delete / Backspace','删除所选'],['Esc','取消当前拖动；无拖动时清除选择'],['Shift + 单击（时间线）','连续范围选择'],['Ctrl/⌘ + 单击（时间线）','切换片段选择'],['Shift/Ctrl/⌘ + 框选','保留原选择并追加'],['Shift + 单击（画布）','切换对象选择'],['Ctrl/⌘ + 单击（画布）','片段和场景对象切换选择；原生对象保留组内选择'],['方向键 / Home / End（素材库）','选择相邻素材 / 首项 / 末项；Shift 扩展选区'],['Ctrl/⌘ + 方向键（素材库）','只移动焦点；空格切换选择'],['F6 / Shift + F6','下 / 上面板'],['Shift + F','预览全屏'],['?','快捷键清单']];
/** Resizers and view preferences for panels in the existing editor shell. */
export function filmLayout(root:HTMLElement,signal:AbortSignal){
 const timeline=root.querySelector<HTMLElement>('.film-timeline')!,viewer=root.querySelector<HTMLElement>('.film-viewer')!;
 let cancelResize:(()=>void)|undefined;const dialogs=new Set<HTMLDialogElement>(),focusTabs=new Set<HTMLElement>();
 let state={bottom:30,collapsed:false};try{const saved=JSON.parse(localStorage.getItem('notale-editor-timeline-view')??'null');if(saved&&Number.isFinite(saved.bottom)&&typeof saved.collapsed==='boolean')state=saved;}catch{}
 const persist=()=>{try{localStorage.setItem('notale-editor-timeline-view',JSON.stringify(state));}catch{}};
 const apply=()=>{state.bottom=Math.max(16,Math.min(60,state.bottom));root.style.setProperty('--film-timeline-height',state.collapsed?'40px':state.bottom+'dvh');root.dataset.timelineCollapsed=String(state.collapsed);timeline.dataset.collapsed=String(state.collapsed);const toggle=timeline.querySelector('[data-action=timeline-toggle]');toggle?.setAttribute('aria-expanded',String(!state.collapsed));toggle?.setAttribute('aria-controls','film-timeline-content');toggle?.setAttribute('aria-label',filmText(state.collapsed?'展开时间线':'收起时间线'));toggle?.setAttribute('title',filmText(state.collapsed?'展开时间线':'收起时间线'));position();};
 const divider=document.createElement('div');divider.className='film-pane-divider bottom';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label',filmText('时间线高度'));divider.setAttribute('aria-orientation','horizontal');divider.setAttribute('aria-valuemin','16');divider.setAttribute('aria-valuemax','60');root.append(divider);
 divider.onpointerdown=e=>{
  if(e.button!==0||e.defaultPrevented||cancelResize||state.collapsed||signal.aborted)return;e.preventDefault();
  const origin={...state},y=e.clientY,pointer=e.pointerId,events=new AbortController();let ended=false;
  const finish=(cancel=false)=>{if(ended)return;ended=true;cancelResize=undefined;events.abort();if(cancel)state=origin;apply();if(!cancel)persist();if(divider.hasPointerCapture(pointer))divider.releasePointerCapture(pointer);};
  cancelResize=()=>finish(true);divider.setPointerCapture(pointer);
  divider.addEventListener('pointermove',move=>{if(move.pointerId!==pointer)return;state.bottom=origin.bottom+(y-move.clientY)/innerHeight*100;apply();},{signal:events.signal});
  divider.addEventListener('pointerup',event=>{if(event.pointerId===pointer)finish();},{signal:events.signal});
  divider.addEventListener('pointercancel',event=>{if(event.pointerId===pointer)finish(true);},{signal:events.signal});
  divider.addEventListener('lostpointercapture',event=>{if(event.pointerId===pointer)finish(true);},{signal:events.signal});
  window.addEventListener('keydown',key=>{if(key.key==='Escape'&&!key.isComposing){key.preventDefault();key.stopImmediatePropagation();finish(true);}},{signal:events.signal,capture:true});
  window.addEventListener('blur',()=>finish(true),{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(true);},{signal:events.signal});
 };
 divider.onkeydown=e=>{if(e.defaultPrevented||e.isComposing||e.altKey||e.ctrlKey||e.metaKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();cancelResize?.();state.bottom+=e.key==='ArrowUp'?2:-2;apply();persist();};
 function position(){const bounds=timeline.getBoundingClientRect();divider.hidden=state.collapsed;divider.setAttribute('aria-valuenow',String(Math.round(state.bottom)));Object.assign(divider.style,{left:bounds.left+'px',top:bounds.top-3+'px',width:bounds.width+'px',height:'6px'});}
 const observer=new ResizeObserver(position);observer.observe(root);observer.observe(timeline);apply();signal.addEventListener('abort',()=>{cancelResize?.();observer.disconnect();divider.remove();for(const dialog of dialogs)dialog.remove();dialogs.clear();for(const node of focusTabs)if(node.getAttribute('tabindex')==='-1')node.removeAttribute('tabindex');focusTabs.clear();root.style.removeProperty('--film-timeline-height');delete root.dataset.timelineCollapsed;},{once:true});
 const toggleTimeline=()=>{cancelResize?.();state.collapsed=!state.collapsed;apply();persist();};
 function fullscreen(){if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void viewer.requestFullscreen().catch(()=>{});}
 function dialog(title:string){const dialog=document.createElement('dialog');dialog.className='film-document-dialog film-layout-dialog';dialog.setAttribute('aria-label',filmText(title));const h=document.createElement('h2');h.textContent=filmText(title);dialog.append(h);const close=document.createElement('button');close.textContent=filmText('关闭');close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>{dialogs.delete(dialog);dialog.remove();};dialogs.add(dialog);root.append(dialog);return {dialog,close};}
 function help(){const {dialog:d,close}=dialog(filmText('快捷键'));const list=document.createElement('dl');for(const [keys,description] of shortcuts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=filmText(keys);dd.textContent=filmText(description);list.append(dt,dd);}d.insertBefore(list,close);d.showModal();close.focus();}
 function settings(){const {dialog:d,close}=dialog(filmText('视图设置'));for(const [label,action]of [['素材',()=>sidebar.tool('insert')],['页面与场景',()=>sidebar.openPages()],['属性',()=>sidebar.inspect('format')],['收起 / 展开时间线',toggleTimeline],['影片设置',()=>root.dispatchEvent(new CustomEvent('film-command',{detail:'stage-settings'}))],['快捷键',help]] as const){const b=document.createElement('button');b.textContent=filmText(label);b.onclick=()=>{d.close();action();};d.insertBefore(b,close);}d.showModal();close.focus();}
 const focus=(direction:number)=>{
  // SidebarPanel is shared with the deck editor; use its stable panel IDs rather
  // than relying on a particular nesting or on the hidden attribute alone.
  const panes=[...root.querySelectorAll<HTMLElement>('#tool-panel,#page-panel,#property-panel'),viewer,timeline].filter(node=>{
   if(node.closest('[hidden],[inert]')||!node.getClientRects().length)return false;const style=getComputedStyle(node);
   return style.display!=='none'&&style.visibility!=='hidden'&&(!document.fullscreenElement||document.fullscreenElement.contains(node));
  });
  if(!panes.length)return false;const index=panes.findIndex(node=>node.contains(document.activeElement)),next=index<0?(direction>0?0:panes.length-1):(index+direction+panes.length)%panes.length,node=panes[next];
  if(!node.hasAttribute('tabindex')){focusTabs.add(node);node.tabIndex=-1;}node.focus({preventScroll:true});return true;
 };
 window.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.altKey||e.ctrlKey||e.metaKey||!root.isConnected)return;
  const target=e.target instanceof Element?e.target:undefined;
  if(document.querySelector('dialog[open],[popover]:popover-open')||target?.closest('dialog,[role="menu"],[popover]'))return;
  // F6 leaves a parameter field without replacing its ordinary typing keys.
  if(e.key==='F6'){if(focus(e.shiftKey?-1:1)){e.preventDefault();e.stopPropagation();}return;}
  if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  if(e.repeat)return;
  if(e.key==='?'){e.preventDefault();help();}else if(e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();fullscreen();}
 },{signal});return {help,settings,fullscreen,toggleTimeline};
}
