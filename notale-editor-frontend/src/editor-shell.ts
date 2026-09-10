/** Editor-only view state. Viewport changes never become author commands. */
export function createEditorShell(onZoom: (scale: number) => void = () => {}) {
  const element = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const viewport = element('canvas-viewport');
  const stage = element('canvas-stage');
  const canvas = document.querySelector<HTMLElement>('.canvas-wrap')!;
  const zoomSelect = element<HTMLSelectElement>('canvas-zoom');
  const panSurface = element('canvas-pan-surface');
  const panels = ['pages', 'inspector', 'notes'] as const;
  type Panel = (typeof panels)[number];
  const panelIds = { pages: 'page-panel', inspector: 'property-panel', notes: 'notes-panel' };
  let shown: Record<Panel, boolean> = {
    pages: false,
    inspector: false,
    notes: false,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('notale-editor-view-v1') ?? 'null');
    for (const name of panels) if (typeof saved?.[name] === 'boolean') shown[name] = saved[name];
  } catch { /* Storage is optional in an embedded host. */ }
  if (shown.inspector) shown.pages = false;
  let activeTool = '';
  let hasSelection = false, lastFormat = false;
  let styleScope='global';const styleScroll={global:0,object:0};
  function renderStyleScope(){const scope=hasSelection?'object':'global';const panel=element('property-panel');if(scope!==styleScope){styleScroll[styleScope as 'global'|'object']=panel.scrollTop;styleScope=scope;if(document.querySelector('[data-tab="format"].active'))panel.scrollTop=styleScroll[scope];}const global=element('global-style'),object=element('object-style');if(global)global.hidden=hasSelection;if(object)object.hidden=!hasSelection;}
  let beforeFocus: typeof shown | undefined;
  let dimensions = { width: 1600, height: 900 };
  let zoom: number | 'fit' = 'fit';
  let actualZoom = 1;
  let hand = false;
  let drag: { pointer: number; x: number; y: number; left: number; top: number } | undefined;

  function refreshPanels() {
    renderStyleScope();
    for (const name of panels) {
      const visible = shown[name];
      element(panelIds[name]).hidden = !visible;
      element('toggle-' + name).setAttribute('aria-expanded', String(visible));
      document.body.classList.toggle('hide-' + name, !visible);
    }
    const inspectorTab = document.querySelector<HTMLElement>('[data-tab].active')?.dataset.tab;
    const inspectorTool = inspectorTab === 'format' ? 'style' : inspectorTab;
    for (const button of document.querySelectorAll<HTMLElement>('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === activeTool || (button.dataset.tool === 'pages' && shown.pages) || (!element('property-panel').hidden && button.dataset.tool === inspectorTool)));
    element('focus-canvas').setAttribute('aria-pressed', String(!!beforeFocus));
    try { localStorage.setItem('notale-editor-view-v1', JSON.stringify(beforeFocus ?? shown)); } catch {}
  }
  for (const name of panels) element('toggle-' + name).addEventListener('click', () => {
    beforeFocus = undefined;
    shown[name] = !shown[name];
    if (name === 'pages' && shown.pages) { closeTools(); shown.inspector = false; }
    if (name === 'inspector' && shown.inspector) { closeTools(); shown.pages = false; }
    refreshPanels();
  });
  element('close-inspector').addEventListener('click', () => { shown.inspector = false; beforeFocus = undefined; refreshPanels(); });
  element('focus-canvas').addEventListener('click', () => {
    if (beforeFocus) {
      shown = beforeFocus;
      beforeFocus = undefined;
    } else {
      beforeFocus = { ...shown };
      shown = { pages: false, inspector: false, notes: false };
    }
    refreshPanels();
  });
  refreshPanels();

  function layout(preserveCenter = true) {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    const oldW = canvas.offsetWidth, oldH = canvas.offsetHeight;
    const centerX = (viewport.scrollLeft + w / 2 - canvas.offsetLeft) / (oldW || 1);
    const centerY = (viewport.scrollTop + h / 2 - canvas.offsetTop) / (oldH || 1);
    actualZoom = zoom === 'fit'
      ? Math.max(0.01, Math.min((w - 48) / dimensions.width, (h - 48) / dimensions.height))
      : zoom;
    const width = dimensions.width * actualZoom, height = dimensions.height * actualZoom;
    stage.style.width = Math.max(w, width + 48) + 'px';
    stage.style.height = Math.max(h, height + 48) + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const frame = element<HTMLIFrameElement>('canvas');
    frame.style.width = dimensions.width + 'px';
    frame.style.height = dimensions.height + 'px';
    frame.style.transformOrigin = '0 0';
    frame.style.transform = `scale(${actualZoom})`;
    onZoom(actualZoom);
    zoomSelect.options[0].textContent = `适合窗口 · ${Math.round(Math.min((w - 48) / dimensions.width, (h - 48) / dimensions.height) * 100)}%`;
    // Keep arbitrary +/- increments representable by a single transient option.
    zoomSelect.querySelector('[data-current]')?.remove();
    if (zoom !== 'fit' && !Array.from(zoomSelect.options).some(o => o.value === String(zoom))) {
      const option = new Option(`${Math.round(zoom * 100)}%`, String(zoom));
      option.dataset.current = '';
      zoomSelect.add(option);
    }
    zoomSelect.value = String(zoom);
    if (zoom === 'fit' || !preserveCenter) viewport.scrollTo(0, 0);
    else viewport.scrollTo(
      canvas.offsetLeft + centerX * width - w / 2,
      canvas.offsetTop + centerY * height - h / 2,
    );
    element<HTMLButtonElement>('zoom-out').disabled = actualZoom <= 0.1;
    element<HTMLButtonElement>('zoom-in').disabled = actualZoom >= 16;
  }
  function changeZoom(value: number | 'fit') {
    zoom = value === 'fit' ? value : Math.max(0.1, Math.min(16, value));
    layout();
  }
  zoomSelect.addEventListener('change', () => changeZoom(zoomSelect.value === 'fit' ? 'fit' : Number(zoomSelect.value)));
  element('zoom-in').addEventListener('click', () => changeZoom(Math.round((actualZoom + 0.1) * 100) / 100));
  element('zoom-out').addEventListener('click', () => changeZoom(Math.round((actualZoom - 0.1) * 100) / 100));
  new ResizeObserver(() => layout()).observe(viewport);
  let zoomFrame = 0, wheelDelta = 0, wheelAnchor: {x:number;y:number;clientX:number;clientY:number} | undefined;
  function wheelZoom(clientX:number,clientY:number,delta:number) {
    const rect=viewport.getBoundingClientRect();
    wheelAnchor={x:(viewport.scrollLeft+clientX-rect.left-canvas.offsetLeft)/actualZoom,y:(viewport.scrollTop+clientY-rect.top-canvas.offsetTop)/actualZoom,clientX:clientX-rect.left,clientY:clientY-rect.top};
    wheelDelta+=delta;
    if(!zoomFrame)zoomFrame=requestAnimationFrame(()=>{
      zoomFrame=0;const anchor=wheelAnchor!;const next=actualZoom*Math.exp(-wheelDelta*.002);wheelDelta=0;changeZoom(next);
      viewport.scrollTo(canvas.offsetLeft+anchor.x*actualZoom-anchor.clientX,canvas.offsetTop+anchor.y*actualZoom-anchor.clientY);
    });
  }
  viewport.addEventListener('wheel', event => {
    if(!event.ctrlKey && !event.metaKey)return;
    event.preventDefault();wheelZoom(event.clientX,event.clientY,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1));
  },{passive:false});

  function endPan() {
    const pointer = drag?.pointer;
    drag = undefined;
    viewport.classList.remove('panning');
    if (pointer !== undefined && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
  }
  function setHand(value: boolean) {
    endPan();
    hand = value;
    panSurface.hidden = !hand;
    element('pan-canvas').setAttribute('aria-pressed', String(hand));
    viewport.classList.toggle('hand-mode', hand);
  }
  element('pan-canvas').addEventListener('click', () => setHand(!hand));
  for (const id of ['pan-canvas', 'focus-canvas']) element(id).addEventListener('click', () => { document.querySelector<HTMLDetailsElement>('.view-menu')!.open = false; });
  document.addEventListener('pointerdown', event => { const menu = document.querySelector<HTMLDetailsElement>('.view-menu')!; if (!menu.contains(event.target as Node)) menu.open = false; });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (!hand && event.target !== viewport && event.target !== stage)) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('panning');
    viewport.focus({ preventScroll: true });
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    viewport.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, endPan);
  window.addEventListener('blur',()=>setHand(false));
  window.addEventListener('keydown',event=>{if(event.isComposing||event.code!=='Space'||(event.target as Element)?.closest('input,textarea,select,button,a,summary,[contenteditable],dialog'))return;event.preventDefault();setHand(true);},true);
  window.addEventListener('keyup',event=>{if(event.code==='Space')setHand(false);},true);
  viewport.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setHand(false); event.stopPropagation(); }
  });
  element('interact').addEventListener('click', () => setHand(false));


  function closeTools() {
    activeTool = '';
    element('tool-panel').hidden = true;
    document.body.classList.remove('tools-open');
  }
  function inspect(tab: string, target?: string) {
    closeTools();
    shown.pages = false;
    shown.inspector = true;
    beforeFocus = undefined;
    refreshPanels();
    document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
    refreshPanels();
    if (target) {
      const field = document.getElementById(target);
      if (field && !field.hidden) {
        for (let parent = field.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        field.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      else element('tool-message').textContent = '请先在画布上选择相应的互动对象。';
    }
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.addEventListener('click', event => {
    const tool = button.dataset.tool!;
    if (tool === 'pages') { element('toggle-pages').click(); return; }
    if (['style', 'animation', 'objects'].includes(tool)) {
      if (event.isTrusted && button.getAttribute('aria-pressed') === 'true') { shown.inspector = false; refreshPanels(); return; }
      inspect(tool === 'style' ? 'format' : tool); return;
    }
    if (activeTool === tool) closeTools();
    else {
      activeTool = tool;
      shown.inspector = false;
      beforeFocus = undefined;
      shown.pages = false;
      element('tool-panel').hidden = false;
      element('tool-panel-title').textContent = button.textContent;
      element('tool-message').textContent = '';
      for (const section of document.querySelectorAll<HTMLElement>('[data-library]')) section.hidden = section.dataset.editorUnavailable === 'true' || !(tool === 'insert' && ['text','resources','insert','interactive'].includes(section.dataset.library ?? ''));
      document.body.classList.add('tools-open');
    }
    refreshPanels();
  });
  element('close-tool-panel').addEventListener('click', () => { closeTools(); refreshPanels(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-inspect]')) button.addEventListener('click', () => inspect('format', button.dataset.inspect));
  element('library-preview').addEventListener('click', () => {
    if (element('interact').getAttribute('aria-pressed') !== 'true') element('interact').click();
  });
  element('focus-canvas').addEventListener('click', () => { closeTools(); refreshPanels(); });

  const search = element<HTMLInputElement>('slide-search');
  let overviewPage=0;
  const pagination=document.createElement('div');pagination.id='overview-pagination';pagination.hidden=true;
  pagination.innerHTML='<button id="overview-prev">← 上一组</button><span id="overview-range" role="status"></span><button id="overview-next">下一组 →</button><button id="overview-close">返回编辑</button>';
  element('slides').before(pagination);
  function filterPages() {
    const query = search.value.trim().toLocaleLowerCase();
    const overview=document.body.classList.contains('overview-mode');
    const cards=Array.from(document.querySelectorAll<HTMLElement>('.slide-card'));
    const matching=cards.filter(card=>!query||card.textContent?.toLocaleLowerCase().includes(query));
    overviewPage=Math.min(overviewPage,Math.max(0,Math.ceil(matching.length/8)-1));
    const displayed=new Set(overview?matching.slice(overviewPage*8,overviewPage*8+8):matching);
    for(const card of cards)card.hidden=!displayed.has(card);
    element('slide-search-empty').hidden=matching.length>0;
    pagination.hidden=!overview;
    element('overview-range').textContent=matching.length?`${overviewPage*8+1}–${Math.min(matching.length,overviewPage*8+8)} / ${matching.length}`:'0 / 0';
    element<HTMLButtonElement>('overview-prev').disabled=overviewPage===0;
    element<HTMLButtonElement>('overview-next').disabled=(overviewPage+1)*8>=matching.length;
  }
  search.addEventListener('input',()=>{overviewPage=0;filterPages();});
  element('overview-prev').addEventListener('click',()=>{overviewPage--;filterPages();});
  element('overview-next').addEventListener('click',()=>{overviewPage++;filterPages();});
  element('overview-close').addEventListener('click',()=>document.body.classList.remove('overview-mode'));
  let lastOverview=false;
  new MutationObserver(()=>{
    const overview=document.body.classList.contains('overview-mode');
    if(overview!==lastOverview) {lastOverview=overview;overviewPage=0;filterPages();}
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  element('overview').addEventListener('click', () => {
    // The overview uses the same rail and must also work while that rail is collapsed.
    closeTools();
    shown.inspector = false;
    refreshPanels();
    if (!shown.pages) { shown.pages = true; beforeFocus = undefined; refreshPanels(); }
  });
  return {
    inspect,
    wheel(x:number,y:number,delta:number) {
      if(![x,y,delta].every(Number.isFinite))return;
      const rect=element('canvas').getBoundingClientRect();wheelZoom(rect.left+x*actualZoom,rect.top+y*actualZoom,delta);
    },
    hand:setHand,
    pan(x:number,y:number){if([x,y].every(Number.isFinite))viewport.scrollBy(x,y);},
    zoom: () => actualZoom,
    selectionChanged(selected: boolean) {
      const format = !!document.querySelector('[data-tab="format"].active');
      if (hasSelection === selected && lastFormat === format) return;
      hasSelection = selected; lastFormat = format; refreshPanels();
    },
    render(width: number, height: number, index: number, count: number) {
      const changed = width !== dimensions.width || height !== dimensions.height;
      dimensions = { width, height };
      element('page-position').textContent = index < 0 ? '母版编辑' : `${index + 1} / ${count}`;
      element<HTMLButtonElement>('dock-previous-page').disabled = index <= 0;
      element<HTMLButtonElement>('dock-next-page').disabled = index < 0 || index >= count - 1;
      element<HTMLButtonElement>('dock-delete-page').disabled = index < 0 || count <= 1;
      filterPages();
      layout(!changed);
    },
  };
}
