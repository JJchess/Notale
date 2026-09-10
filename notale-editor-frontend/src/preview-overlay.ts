import type { Snapshot } from '@notale/editor/browser';
import { keepPreviewAlive } from './preview-lease.js';

export function createPreviewOverlay(context: {
  prepare: () => Promise<{ snapshot: Snapshot; slideId: string }>;
  present: () => void;
  error: (error: unknown) => void;
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'preview-overlay'; dialog.setAttribute('aria-label', '讲义预览');
  dialog.innerHTML = `<header class="preview-header"><span>预览</span><strong id="preview-title"></strong><button id="preview-present">放映 ↗</button><button id="preview-close" aria-label="返回编辑">返回编辑 ×</button></header>
    <div class="preview-area"><iframe id="preview-canvas" title="讲义互动预览" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><div id="preview-loading" role="status">正在加载预览…</div><button id="preview-retry" hidden>重新加载</button></div>
    <nav class="preview-navigation" aria-label="预览导航"><button id="preview-previous" aria-label="上一步或上一页">◀</button><output id="preview-position"></output><button id="preview-next" aria-label="下一步或下一页">▶</button></nav>
    <button id="preview-edit-toggle" class="mode-switch is-preview" aria-label="返回编辑" title="返回编辑"><span class="mode-pencil">✎</span><span class="mode-eye">◉</span></button>`;
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#'+id)!;
  const frame = el<HTMLIFrameElement>('preview-canvas');
  let source: Awaited<ReturnType<typeof context.prepare>> | undefined;
  let channel = '', origin = '', index = 0, step = 0, max = 0, ready = false;
  let pages: { id: string; url: string }[] = [];
  let generation = 0, initialStep = 0, ending = false, opening = false;
  let lease: ReturnType<typeof keepPreviewAlive> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let focus: HTMLElement | null = null;
  function send(type: string, data: unknown) {
    frame.contentWindow?.postMessage({source:'notale-host',channel,type,data}, origin);
  }
  function status() {
    el('preview-position').textContent = `${index + 1} / ${pages.length}${max > 0 ? ` · ${step} / ${max}` : ''}`;
    el<HTMLButtonElement>('preview-previous').disabled = !ready || (index === 0 && step === 0);
    el<HTMLButtonElement>('preview-next').disabled = !ready || (index === pages.length - 1 && step === max);
  }
  function layout() {
    if (!source) return;
    const area = el('preview-loading').parentElement!;
    const {width,height} = source.snapshot.document;
    const scale = Math.min((area.clientWidth - 32) / width, (area.clientHeight - 32) / height);
    frame.style.width = width+'px'; frame.style.height = height+'px';
    frame.style.transform = `translate(-50%, -50%) scale(${Math.max(.01,scale)})`;
  }
  function failed(message: string) {
    ready = false; clearTimeout(timeout);
    el('preview-loading').hidden = false; el('preview-loading').textContent = message;
    el('preview-retry').hidden = false; status();
  }
  function load(atEnd = false) {
    if (!pages[index]) return;
    ready = false; ending = atEnd; step = 0; max = 0;
    el('preview-loading').hidden = false; el('preview-loading').textContent = '正在加载预览…';
    el('preview-retry').hidden = true;
    frame.style.visibility = 'hidden'; origin = new URL(pages[index].url).origin;
    frame.src = pages[index].url; clearTimeout(timeout);
    timeout = setTimeout(()=>failed('预览加载失败，请重试。'), 10000); status();
  }
  async function fetchPreview() {
    const current = ++generation;
    request?.abort(); request = new AbortController();
    const fetchTimeout = setTimeout(()=>request?.abort(),10000);
    try {
      const response = await fetch(`/api/documents/${source!.snapshot.document.id}/preview?version=${source!.snapshot.version}`, {signal:request.signal});
      if (!response.ok) throw Error('无法获取预览');
      const data = await response.json();
      if (current !== generation || !dialog.open) return;
      lease?.stop(); lease = keepPreviewAlive(source!.snapshot.document.id, data);
      const visible = new Set(source!.snapshot.document.slides.filter(s=>(!s.layoutSourceId && !s.hidden) || s.id===source!.slideId).map(s=>s.id));
      const previousId = pages[index]?.id ?? source!.slideId;
      pages = data.slides.filter((s:{id:string})=>visible.has(s.id)); channel = data.channel;
      index = Math.max(0,pages.findIndex(s=>s.id===previousId)); load();
    } catch (error) {
      if (current === generation && dialog.open) failed('无法加载预览，请检查连接后重试。');
    } finally { clearTimeout(fetchTimeout); }
  }
  async function open(atStep = 0) {
    if (dialog.open || opening) return;
    opening = true; focus = document.activeElement as HTMLElement;
    const toggle = document.getElementById('interact')!;
    toggle.setAttribute('aria-busy','true');
    try {
      source = await context.prepare(); initialStep = atStep; pages = []; index = 0;
      el('preview-title').textContent = source.snapshot.document.title;
      dialog.showModal(); document.body.classList.add('preview-open');
      toggle.setAttribute('aria-pressed','true');
      el('preview-loading').hidden = false; el('preview-loading').textContent = '正在加载预览…';
      el('preview-retry').hidden = true; frame.style.visibility = 'hidden';
      layout(); el('preview-close').focus(); await fetchPreview();
    } catch (error) { context.error(error); }
    finally { opening = false; toggle.removeAttribute('aria-busy'); }
  }
  function close() {
    ++generation; request?.abort(); clearTimeout(timeout); lease?.stop(); lease = undefined;
    dialog.close(); frame.src = 'about:blank'; ready = false;
    document.body.classList.remove('preview-open');
    document.getElementById('interact')!.setAttribute('aria-pressed','false');
    focus?.focus({preventScroll:true});
  }
  function navigate(direction: number) {
    if (!ready) return;
    if (direction < 0 && step === 0 && index > 0) { index--; load(true); }
    else if (direction > 0 && step === max && index < pages.length - 1) { index++; load(); }
    else { step = Math.max(0,Math.min(max,step+direction)); send('seek',{step,animate:true}); status(); }
  }
  window.addEventListener('message',event=>{
    if (!dialog.open || event.source !== frame.contentWindow || event.origin !== origin || event.data?.source !== 'notale-slide' || event.data.channel !== channel) return;
    const {type,data} = event.data;
    if (type === 'ready' && data?.slideId === pages[index]?.id && !ready) {
      max = Math.max(0,Math.min(500,Number(data.max)||0)); step = ending ? max : Math.min(max,initialStep); initialStep = 0;
      const page=source?.snapshot.document.slides.find(s=>s.id===pages[index]?.id);if(page)send('charts-update',{charts:page.nativeCharts});
      ready = true; clearTimeout(timeout); send('mode',{mode:'play'}); send('seek',{step,animate:!ending}); ending = false;
      frame.style.visibility = 'visible'; el('preview-loading').hidden = true; el('preview-retry').hidden = true; status();
    }
    if (type === 'navigate') {
      if (data.slideId) { const next = pages.findIndex(page=>page.id===data.slideId); if (next >= 0) { index=next; load(); } }
      else if (data.direction === 0) close();
      else if (data.direction === -1 || data.direction === 1) navigate(data.direction);
    }
  });
  window.addEventListener('keydown',event=>{
    if (!dialog.open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(event.key)) { event.preventDefault(); navigate(['ArrowRight','PageDown'].includes(event.key)?1:-1); }
    // Keep editor keyboard commands from receiving modal events.
    event.stopImmediatePropagation();
  },true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  el('preview-close').onclick = close; el('preview-edit-toggle').onclick = close;
  el('preview-retry').onclick = ()=>void fetchPreview();
  el('preview-previous').onclick = ()=>navigate(-1); el('preview-next').onclick = ()=>navigate(1);
  el('preview-present').onclick = context.present;
  new ResizeObserver(layout).observe(frame.parentElement!);
  return { open, close, isOpen:()=>dialog.open };
}
