import { maxStep, stepLabel, stepNotes, stepInterval } from '../domain/timeline.js';
import { keepPreviewAlive } from './preview-lease.js';
import { showControl, type ShowControlMode } from './show-control.js';
import { readShowCheckpoint } from './show-session.js';
import Reveal from 'reveal.js';
import type { Snapshot } from '../domain/model.js';
const params = new URLSearchParams(location.search),
  id = params.get('document')!,
  version = params.get('version');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const session = params.get('session') ?? crypto.randomUUID();
params.set('session', session);
history.replaceState(null, '', '?' + params);
const audience = params.get('audience') === '1';
let step = 0,
  max = 0,
  channel = '',
  remote = false,
  started = Date.now();
const bus = new BroadcastChannel(`notale-show-${session}`);
async function main() {
  const r = await fetch(`/api/documents/${id}${version ? `?version=${version}` : ''}`);
  if (!r.ok) throw new Error(await r.text());
  const snapshot: Snapshot = await r.json(),
    slides = snapshot.document.slides.filter((s) => !s.hidden);
  params.set('version', String(snapshot.version));
  history.replaceState(null, '', '?' + params);
  const checkpointKey = `notale-show-v1:${session}:${id}`;
  let checkpoint: ReturnType<typeof readShowCheckpoint>;
  try {
    checkpoint = readShowCheckpoint(localStorage.getItem(checkpointKey), id, snapshot.version);
  } catch {}
  let controlMode: ShowControlMode = 'starting';
  const controlling = () => !audience && controlMode === 'controlling';
  let initializing = true,
    readyAnimate = true,
    epoch = 0,
    readyKey = '';
  let backwardPage: string | undefined, endOnReady = false;
  if (checkpoint && !slides.some((s) => s.id === checkpoint?.slideId)) checkpoint = undefined;
  if (checkpoint) started = checkpoint.started;
  if (!slides.length) throw new Error('所有页面均已隐藏');
  const previews = await (
    await fetch(`/api/documents/${id}/preview?version=${snapshot.version}`)
  ).json();
  channel = previews.channel;
  const previewLease = keepPreviewAlive(id, previews);
  window.addEventListener('pagehide', () => previewLease.stop());
  const urls = new Map<string, string>(
    previews.slides.map((p: { id: string; url: string }) => [p.id, p.url]),
  );
  for (const s of slides) {
    const section = document.createElement('section');
    section.dataset.transition = s.transition;
    const iframe = document.createElement('iframe');
    iframe.dataset.src = urls.get(s.id)!;
    iframe.title = s.name;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    section.append(iframe);
    $('slides').append(section);
  }
  const reveal = new Reveal(document.querySelector('.reveal'), {
    width: snapshot.document.width,
    height: snapshot.document.height,
    margin: 0,
    controls: false,
    progress: true,
    center: false,
    keyboard: false,
    hash: false,
    embedded: true,
    loop: snapshot.document.presentation.loop,
    slideNumber: snapshot.document.presentation.showSlideNumber,
    transition: 'fade',
    viewDistance: 1,
  });
  await reveal.initialize();
  const frame = () =>
    $('slides').querySelectorAll<HTMLIFrameElement>('iframe')[reveal.getIndices().h];
  function saveCheckpoint() {
    if (initializing || !controlling()) return;
    try {
      localStorage.setItem(
        checkpointKey,
        JSON.stringify({
          documentId: id,
          version: snapshot.version,
          slideId: slides[reveal.getIndices().h].id,
          step,
          max,
          started,
          blank: document.body.classList.contains('blank'),
          speaker: document.body.classList.contains('speaker'),
          overview: reveal.isOverview(),
        }),
      );
    } catch {
      $('error').textContent = '浏览器未能记录演示进度，当前会话重开后可能无法恢复。';
    }
  }
  const broadcast = (animate = true) => {
    if (!remote) saveCheckpoint();
    if (!initializing && !remote && controlling())
      bus.postMessage({
        kind: 'state',
        documentId: id,
        version: snapshot.version,
        index: reveal.getIndices().h,
        slideId: slides[reveal.getIndices().h].id,
        step,
        max,
        started,
        animate,
        blank: document.body.classList.contains('blank'),
        overview: reveal.isOverview(),
      });
  };
  function probe() {
    frame().contentWindow?.postMessage(
      { source: 'notale-host', channel, type: 'state', data: {} },
      '*',
    );
  }
  function status() {
    const index = reveal.getIndices().h;
    $('counter').textContent = `${index + 1} / ${slides.length} · step ${step} / ${max}`;
    $('notes').textContent = stepNotes(slides[index], step);
    $('step-title').textContent = stepLabel(slides[index], step);
    $('next-step').textContent =
      step < max ? `下一步：${stepLabel(slides[index], step + 1)}` : '本页结束，下一页';
    const picker = $<HTMLSelectElement>('show-step');
    picker.replaceChildren(
      ...Array.from(
        { length: max + 1 },
        (_, index) =>
          new Option(
            `${index} · ${stepLabel(slides[reveal.getIndices().h], index)}`,
            String(index),
          ),
      ),
    );
    picker.value = String(step);
    const next = $<HTMLIFrameElement>('next-preview'),
      url = urls.get(slides[Math.min(index + 1, slides.length - 1)].id)!;
    if (next.src !== url) next.src = url;
  }
  function seek(n: number, animate = true) {
    endOnReady = false;
    step = Math.max(0, Math.min(max, n));
    frame().contentWindow?.postMessage(
      {
        source: 'notale-host',
        channel,
        type: 'seek',
        data: {
          step,
          animate,
          media: (audience || controlling()) && !document.body.classList.contains('speaker'),
        },
      },
      '*',
    );
    status();
    broadcast(animate);
    schedule();
  }
  $<HTMLSelectElement>('show-step').onchange = () => {
    if (controlling()) seek(Number($<HTMLSelectElement>('show-step').value));
  };
  function next() {
    if (!controlling()) return;
    if (step < max) seek(step + 1);
    else reveal.next();
  }
  function prev() {
    if (!controlling()) return;
    if (step > 0) seek(step - 1);
    else if (reveal.getIndices().h > 0) {
      backwardPage = slides[reveal.getIndices().h - 1].id;
      reveal.prev();
    }
  }
  let auto: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    if (auto) clearTimeout(auto);
    const interval = stepInterval(slides[reveal.getIndices().h], step);
    if (
      interval &&
      readyKey.startsWith(`${epoch}:`) &&
      controlling() &&
      !reveal.isOverview() &&
      !document.body.classList.contains('blank')
    )
      auto = setTimeout(next, interval);
  }
  function changed() {
    epoch++;
    const index = reveal.getIndices().h;
    endOnReady = backwardPage === slides[index].id;
    backwardPage = undefined;
    readyAnimate = !endOnReady;
    max = maxStep(slides[index]);
    step = endOnReady ? max : 0;
    status();
    broadcast(readyAnimate);
    schedule();
    probe();
  }
  reveal.on('slidechanged', changed);
  reveal.on('overviewshown', () => {
    schedule();
    broadcast(false);
  });
  reveal.on('overviewhidden', () => {
    schedule();
    broadcast(false);
  });
  window.addEventListener('message', (e) => {
    if (
      e.source !== frame().contentWindow ||
      e.data?.source !== 'notale-slide' ||
      e.data.channel !== channel
    )
      return;
    if (e.data.type === 'ready') {
      const key = `${epoch}:${e.data.data.runtimeId ?? 'legacy'}`;
      if (key === readyKey) return;
      readyKey = key;
      max = e.data.data.max;
      if (endOnReady) { step = max; endOnReady = false; }
      seek(step, readyAnimate);
    }
    if (e.data.type === 'media-blocked')
      $('error').textContent = '浏览器未允许自动播放，请点击媒体中的播放按钮。';
    if (e.data.type === 'navigate' && controlling()) {
      if (e.data.data.slideId) {
        const at = slides.findIndex((s) => s.id === e.data.data.slideId);
        if (at >= 0) {
          if (at === reveal.getIndices().h) seek(0);
          else reveal.slide(at);
        } else $('error').textContent = '链接目标页在本次放映中已隐藏。';
        return;
      }
      if (e.data.data.direction > 0) next();
      else if (e.data.data.direction < 0) prev();
      else reveal.toggleOverview();
    }
  });
  bus.onmessage = (e) => {
    if (e.data.documentId !== id || e.data.version !== snapshot.version) return;
    if (e.data.kind === 'takeover') {
      void control?.yieldIfRequested();
      return;
    }
    if (e.data.kind === 'hello') {
      broadcast(false);
      return;
    }
    if (
      e.data.kind !== 'state' ||
      controlling() ||
      e.data.documentId !== id ||
      e.data.version !== snapshot.version
    )
      return;
    const at = slides.findIndex((slide) => slide.id === e.data.slideId);
    if (at < 0 || !Number.isInteger(e.data.step) || e.data.step < 0 || e.data.step > 500) return;
    const moved = reveal.getIndices().h !== at || step !== e.data.step;
    remote = true;
    reveal.slide(at);
    readyAnimate = e.data.animate !== false;
    if (
      Number.isFinite(e.data.started) &&
      e.data.started > 0 &&
      e.data.started <= Date.now() + 1000
    )
      started = e.data.started;
    if (Number.isInteger(e.data.max) && e.data.max >= 0 && e.data.max <= 500) max = e.data.max;
    document.body.classList.toggle('blank', !!e.data.blank);
    // Repeated status/black-screen broadcasts must not restart an active cue.
    // A new step starts the audience animation and media just as local next does.
    if (moved) seek(e.data.step, readyAnimate);
    if (
      !audience &&
      typeof e.data.overview === 'boolean' &&
      reveal.isOverview() !== e.data.overview
    )
      reveal.toggleOverview(e.data.overview);
    status();
    remote = false;
  };
  $('next').onclick = next;
  $('prev').onclick = prev;
  $('overview').onclick = () => {
    if (controlling()) reveal.toggleOverview();
  };
  $('fullscreen').onclick = () => void document.documentElement.requestFullscreen();
  $('blank').onclick = () => {
    if (!controlling()) return;
    document.body.classList.toggle('blank');
    broadcast();
    schedule();
  };
  $('speaker').onclick = () => {
    document.body.classList.toggle('speaker');
    reveal.layout();
    seek(step, false);
  };
  $('audience').onclick = () => {
    const query = new URLSearchParams(params);
    query.delete('speaker');
    query.set('audience', '1');
    window.open('/show.html?' + query, '_blank');
  };
  $('reset-timer').onclick = () => {
    if (!controlling()) return;
    started = Date.now();
    broadcast(false);
  };
  document.addEventListener('keydown', (e) => {
    if (
      !controlling() ||
      (e.target instanceof HTMLElement &&
        ['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName))
    )
      return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      next();
    }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      prev();
    }
    if (e.key === 'Escape' || e.key === 'o') reveal.toggleOverview();
    if (e.key === 'b') $('blank').click();
    if (e.key === 's') $('speaker').click();
    if (e.key === 'Home') reveal.slide(0);
    if (e.key === 'End') reveal.slide(slides.length - 1);
  });
  if (checkpoint ? checkpoint.speaker && !audience : params.get('speaker'))
    document.body.classList.add('speaker');
  reveal.layout();
  const initial = slides.findIndex((s) => s.id === (checkpoint?.slideId ?? params.get('slide')));
  if (initial >= 0) reveal.slide(initial);
  changed();
  if (checkpoint && initial >= 0) {
    max = Math.max(max, checkpoint.max);
    step = checkpoint.step;
    readyAnimate = false;
    document.body.classList.toggle('blank', checkpoint.blank);
    if (!audience && checkpoint.overview !== reveal.isOverview()) reveal.toggleOverview();
  }
  initializing = false;
  seek(step, readyAnimate);
  probe();
  const message = (kind: string) =>
    bus.postMessage({ kind, documentId: id, version: snapshot.version });
  const control = audience
    ? undefined
    : showControl({
        key: `notale-show-controller:${session}:${id}:${snapshot.version}`,
        requestRelease: () => message('takeover'),
        error: (error) => {
          $('error').textContent = `无法取得放映控制权：${String(error)}`;
        },
        change(mode) {
          if (controlling() && mode !== 'controlling') broadcast(false);
          controlMode = mode;
          updateControls();
          if (mode === 'controlling') {
            // Read after obtaining the exclusive lock: the previous owner records
            // its final state before releasing, even if bus delivery was delayed.
            let latest: ReturnType<typeof readShowCheckpoint>;
            try {
              latest = readShowCheckpoint(
                localStorage.getItem(checkpointKey),
                id,
                snapshot.version,
              );
            } catch {}
            const at = slides.findIndex((slide) => slide.id === latest?.slideId);
            if (latest && at >= 0) {
              remote = true;
              reveal.slide(at);
              started = latest.started;
              max = Math.max(max, latest.max);
              document.body.classList.toggle('blank', latest.blank);
              reveal.toggleOverview(latest.overview);
              readyAnimate = false;
              seek(latest.step, false);
              remote = false;
            }
            seek(step, readyAnimate);
          } else if (mode === 'following') {
            seek(step, false);
            message('hello');
          }
          schedule();
        },
      });
  function updateControls() {
    const enabled = controlling();
    reveal.configure({ touch: enabled });
    for (const id of ['prev', 'next', 'overview', 'blank', 'reset-timer'])
      $<HTMLButtonElement>(id).disabled = !enabled;
    const take = $<HTMLButtonElement>('take-control');
    take.hidden = audience || enabled;
    take.disabled =
      controlMode === 'starting' || controlMode === 'waiting' || controlMode === 'unavailable';
    $('control-status').textContent = audience
      ? '观众窗口'
      : {
          starting: '正在连接…',
          controlling: '正在控制',
          following: '跟随其他窗口',
          waiting: '等待交接…',
          unavailable: '当前浏览器无法协调放映控制，请使用 HTTPS 或本机地址',
        }[controlMode];
    // Followers cannot navigate via Reveal's overview, touch gestures or source
    // slide links. Audience source controls (Canvas/media) remain interactive.
    document.querySelector<HTMLElement>('.reveal')!.inert = !audience && !enabled;
  }
  $('take-control').onclick = () => control?.takeover();
  updateControls();
  control?.start();
  if (audience) message('hello');
  window.addEventListener('pagehide', () => {
    saveCheckpoint();
    control?.close();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  setInterval(() => {
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
    $('timer').textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);
  Object.assign(window, {
    NotaleShow: {
      next,
      prev,
      seek: (n: number, animate = true) => {
        if (controlling()) seek(n, animate);
      },
      reveal,
      state: () => ({
        index: reveal.getIndices().h,
        step,
        max,
        started,
        control: audience ? 'audience' : controlMode,
        session,
        version: snapshot.version,
      }),
    },
  });
}
void main().catch((e) => ($('error').textContent = String(e)));
