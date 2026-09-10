import { htmlLayerCommands } from '../domain/html-layers.js';
import { createLayoutValues } from './layout-values.js';
import { createStepInspector } from './step-inspector.js';
import { createComponentInspector } from './component-inspector.js';
import type { SourceScene } from '../domain/source-scenes.js';
import { sceneValuesSchema, type SceneScalar } from '../domain/scene-schema.js';
import { sceneCheckpointSchema, type SceneCheckpoint } from '../domain/scene-checkpoints.js';
import {
  nativeChartOptionSchema,
  nativeChartAppearancePatchSchema,
  type NativeChartInteraction,
} from '../domain/native-charts.js';
import type { NativeChartInspection } from './native-charts.js';
import { connectorSchema } from '../domain/connectors.js';
import { keepPreviewAlive } from './preview-lease.js';
let previewLease: ReturnType<typeof keepPreviewAlive> | undefined;
window.addEventListener('pagehide', () => previewLease?.stop());
import {
  PendingJournal,
  pendingRecordKey,
  isJournalKey,
  validHistory,
  type Pending,
  type PendingEntry,
  type HistoryPlan,
} from './pending-journal.js';
import { editShortcut, type EditAction } from './shortcuts.js';
import { selectIds } from '../domain/selection.js';
import { isSvgLayer } from '../domain/svg-layers.js';
import { mediaSettingsSchema } from '../domain/media.js';
import type { Snapshot, Slide, Command, AnimationSpec } from '../domain/model.js';
import { template } from './templates.js';
type ObjectInfo = {
  id: string;
  tag: string;
  namespace: string;
  parent?: string;
  text: string;
  html: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  locked: boolean;
  kind: string;
};
type Rect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nativeChart?: boolean;
  value?: string;
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => $<HTMLInputElement>(id).value;
const num = (id: string) => Number(value(id));
const set = (id: string, v: unknown) => {
  $<HTMLInputElement>(id).value = String(v ?? '');
};
const esc = (s: unknown) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const uuid = () => crypto.randomUUID();
let snapshot: Snapshot,
  slideId = '',
  objects: ObjectInfo[] = [],
  selected = new Set<string>(),
  rects: Rect[] = [],
  channel = '',
  interacting = false,
  step = 0,
  max = 0;
let undo: number[] = [],
  redo: number[] = [],
  busy = false;
const idleWaiters = new Set<() => void>();
async function whenIdle() {
  if (busy) await new Promise<void>((resolve) => idleWaiters.add(resolve));
}
function releaseBusy() {
  busy = false;
  for (const done of idleWaiters) done();
  idleWaiters.clear();
}
let pending: Pending | undefined;
type Capture = {
  rectangles: (Rect & {
    baseWidth?: number;
    baseHeight?: number;
    matrix?: number[];
    geometry?: unknown;
  })[];
  computedStyles: Record<string, Record<string, string>>;
  componentStates?: Record<string, string>;
  canvasSceneStates?: Record<
    string,
    Record<string, import('../domain/scene-schema.js').SceneScalar>
  >;
  nativeChartTargets?: string[];
  nativeChartStates?: Record<string, import('../domain/native-charts.js').NativeChartState>;
};
let canvasReady = false;
let nativeMax = 0;
const readyWaiters = new Set<() => void>();
function whenReady(): Promise<void> {
  if (canvasReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timeout);
      readyWaiters.delete(done);
      resolve();
    };
    const timeout = setTimeout(() => {
      readyWaiters.delete(done);
      reject(new Error('页面仍未加载完成'));
    }, 30000);
    readyWaiters.add(done);
  });
}
const captures = new Map<string, (result: Capture) => void>();
let clipboard:
  | { documentId: string; source: Slide; targets: string[]; mode: 'copy' | 'cut'; capture: Capture }
  | undefined;
async function captureSelection(ids = [...selected]): Promise<Capture> {
  await whenReady();
  if (!ids.length) return Promise.reject(new Error('请先选择对象'));
  const requestId = uuid();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      captures.delete(requestId);
      reject(new Error('画布未响应，请等待页面加载后重试'));
    }, 5000);
    captures.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    send('capture', { requestId, ids });
  });
}
let clipboardCapture: Promise<void> | undefined;
function copySelection(mode: 'copy' | 'cut') {
  const task = (async () => {
    const ids = [...selected],
      source = structuredClone(slide()),
      documentId = snapshot.document.id;
    const capture = await captureSelection(ids);
    clipboard = { documentId, source, targets: ids, mode, capture };
    $('paste-objects').textContent = mode === 'cut' ? '粘贴剪切对象' : '粘贴对象';
  })();
  clipboardCapture = task;
  return task.finally(() => {
    if (clipboardCapture === task) clipboardCapture = undefined;
  });
}
async function pasteSelection() {
  await clipboardCapture;
  if (!clipboard) throw new Error('剪贴板中没有对象');
  if (clipboard.documentId !== snapshot.document.id)
    throw new Error('跨讲义请使用工程导入；当前剪贴板属于另一份讲义');
  const beforeIds = new Set(objects.map((o) => o.id));
  await commands([
    {
      type: 'elements.transfer',
      slideId,
      sourceSlideId: clipboard.source.id,
      sourceSnapshot: clipboard.source,
      targets: clipboard.targets,
      mode: clipboard.mode,
      ...clipboard.capture,
    },
  ]);
  const definitionHelper = (object: ObjectInfo) => {
    let node: ObjectInfo | undefined = object;
    while (node) {
      if ('data-notale-clipboard-defs' in node.attributes) return true;
      node = objects.find((o) => o.id === node!.parent);
    }
    return false;
  };
  changeSelection(
    objects.filter((o) => !beforeIds.has(o.id) && !definitionHelper(o)).map((o) => o.id),
  );
  renderObjects();
  renderSelection();
  if (clipboard.mode === 'cut') clipboard = undefined;
}
const journal = new PendingJournal(localStorage, sessionStorage);
let migratedLegacy: PendingEntry | undefined;
const frame = $<HTMLIFrameElement>('canvas');
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!r.ok) {
    const e = await r.json();
    throw new Error(`${e.error ?? r.status}: ${e.message ?? JSON.stringify(e.issues)}`);
  }
  return r.json();
}
function error(e: unknown) {
  $('toast').textContent = e instanceof Error ? e.message : String(e);
  $('toast').hidden = false;
  setTimeout(() => ($('toast').hidden = true), 10000);
  $('save-status').textContent = '未保存 · 请处理错误后重试';
}
function on(id: string, fn: () => unknown) {
  $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(error));
}
function slide(): Slide {
  return snapshot.document.slides.find((s) => s.id === slideId)!;
}
function send(type: string, data: unknown) {
  frame.contentWindow?.postMessage({ source: 'notale-host', channel, type, data }, '*');
}
function current() {
  const id = [...selected][0];
  if (!id) throw new Error('请先选择一个对象');
  return objects.find((o) => o.id === id)!;
}
function changeSelection(ids: string[], operation: 'replace' | 'add' | 'toggle' = 'replace') {
  selected = new Set(
    selectIds(
      [...selected],
      ids,
      objects.filter((o) => o.attributes.id !== 'stage'),
      slide().groups,
      operation,
    ),
  );
}
function refreshPendingControls() {
  $('retry-save').hidden = !pending;
  $('reload-head').hidden = !pending;
  $<HTMLButtonElement>('retry-save').disabled = busy;
  $<HTMLButtonElement>('reload-head').disabled = busy;
}
function mark() {
  refreshPendingControls();
  $('save-status').textContent = pending
    ? '有待确认修改 · 可重试保存'
    : `已保存 · v${snapshot.version}`;
  $<HTMLButtonElement>('undo').disabled = !undo.length || busy || !!pending;
  $<HTMLButtonElement>('redo').disabled = !redo.length || busy || !!pending;
  $<HTMLSelectElement>('documents').disabled = busy;
  refreshRecoveries();
}
const historyKey = (id: string) => `notale-editor-history-v1:${id}`;
async function transmit(task: Pending) {
  await initialized;
  if (busy) throw new Error('正在保存上一项修改，请稍后重试');
  busy = true;
  $<HTMLSelectElement>('documents').disabled = true;
  pending = task;
  refreshPendingControls();
  $('save-status').textContent = task.kind === 'restore' ? '正在恢复…' : '正在保存…';
  try {
    // Persist the exact request AND its resulting local history before sending.
    // Replaying an acknowledged request reapplies this plan instead of pushing twice.
    journal.put(task, snapshot.document.title);
    refreshRecoveries();
    const acknowledged: Snapshot = await api(
      `/api/documents/${task.documentId}/${task.kind === 'restore' ? 'restore' : 'commits'}`,
      task.request,
    );
    // A duplicate replay can acknowledge an old revision after another tab has
    // advanced the head. Show the current head and invalidate stale local undo.
    const head: Snapshot = await api(`/api/documents/${task.documentId}`);
    const result = head.version > acknowledged.version ? head : acknowledged;
    const advanced = result.version > acknowledged.version;
    const plan = advanced
      ? { undo: [], redo: [] }
      : validHistory(task.after)
        ? task.after
        : { undo: [task.request.baseVersion], redo: [] };
    sessionStorage.setItem(
      historyKey(task.documentId),
      JSON.stringify({ version: result.version, ...plan }),
    );
    const withoutGuides = (document: Snapshot['document']) =>
      JSON.stringify({ ...document, slides: document.slides.map(({ guides, ...slide }) => slide) });
    const guideOnly =
      canvasReady &&
      snapshot.document.id === result.document.id &&
      (!task.slideId || task.slideId === slideId) &&
      JSON.stringify(snapshot.document.slides.map((slide) => slide.guides)) !==
        JSON.stringify(result.document.slides.map((slide) => slide.guides)) &&
      withoutGuides(snapshot.document) === withoutGuides(result.document);
    snapshot = result;
    undo = [...plan.undo];
    redo = [...plan.redo];
    if (task.slideId && result.document.slides.some((s) => s.id === task.slideId))
      slideId = task.slideId;
    selected = new Set(task.selection ?? []);
    journal.clear(task);
    pending = undefined;
    history.replaceState(null, '', `?document=${task.documentId}`);
    selectDocument(snapshot.document);
    if (guideOnly) {
      send('guides-update', { guides: slide().guides });
      renderGuides();
      renderSelection();
      mark();
    } else await render();
    if (advanced) {
      $('toast').textContent = '这批修改已确认，已载入其他窗口的较新版本';
      $('toast').hidden = false;
      setTimeout(() => ($('toast').hidden = true), 10000);
    }
  } finally {
    releaseBusy();
    mark();
  }
}
async function commands(cmds: unknown[], remember = true, focusSlide?: string) {
  await initialized;
  if (pending) throw new Error('有一批修改尚未确认，请先重试保存或重新载入');
  await transmit({
    kind: 'commit',
    documentId: snapshot.document.id,
    request: { baseVersion: snapshot.version, mutationId: uuid(), commands: cmds },
    after: {
      undo: remember ? [...undo, snapshot.version] : [...undo],
      redo: remember ? [] : [...redo],
    },
    slideId: focusSlide ?? slideId,
    selection: focusSlide ? [] : [...selected],
  });
}
function selectDocument(document: Snapshot['document']) {
  const select = $<HTMLSelectElement>('documents');
  let option = [...select.options].find((o) => o.value === document.id);
  if (!option) {
    option = new Option(document.title, document.id);
    select.add(option);
  }
  option.textContent = document.title;
  select.value = document.id;
}
async function load(id: string) {
  await clipboardCapture?.catch(() => undefined);
  if (busy) throw new Error('正在保存或载入，请稍后切换讲义');
  busy = true;
  $<HTMLSelectElement>('documents').disabled = true;
  refreshPendingControls();
  $('save-status').textContent = '正在载入…';
  try {
    let entry = journal.own(id);
    if (!entry && migratedLegacy?.task.documentId === id) {
      entry = journal.adopt(pendingRecordKey(migratedLegacy.task));
      migratedLegacy = undefined;
    }
    const result: Snapshot = await api(`/api/documents/${id}`);
    pending = entry?.task;
    snapshot = result;
    selectDocument(snapshot.document);
    slideId = snapshot.document.slides[0].id;
    selected.clear();
    undo = [];
    redo = [];
    try {
      const stored = JSON.parse(sessionStorage.getItem(historyKey(id)) ?? 'null');
      if (stored?.version === snapshot.version && validHistory(stored)) {
        undo = stored.undo;
        redo = stored.redo;
      }
    } catch {}
    history.replaceState(null, '', `?document=${id}`);
    await render();
  } finally {
    releaseBusy();
    if (snapshot) mark();
  }
}

class SupersededPage extends Error {}
function pageError(e: unknown) {
  if (!(e instanceof SupersededPage)) error(e);
}
async function showPage(id: string) {
  await initialized;
  await clipboardCapture?.catch(() => undefined);
  await whenIdle();
  if (!snapshot.document.slides.some((s) => s.id === id)) throw new Error('页面不存在');
  slideId = id;
  selected.clear();
  await render();
  if (slideId !== id) throw new SupersededPage('页面切换已被后续请求替代');
  await whenReady();
  if (slideId !== id) throw new SupersededPage('页面切换已被后续请求替代');
}

let renderGeneration = 0;
async function render() {
  const generation = ++renderGeneration;
  canvasReady = false;
  channel = '';
  frame.inert = true;
  if (!snapshot.document.slides.some((s) => s.id === slideId))
    slideId = snapshot.document.slides[0].id;
  const s = slide();
  $('slide-count').textContent = String(snapshot.document.slides.length);
  $('page-name').textContent = s.name;
  $('slides').innerHTML = snapshot.document.slides
    .map(
      (s, i) =>
        `<button class="slide-card ${s.id === slideId ? 'active' : ''}" data-slide="${s.id}"><span class="number">${String(i + 1).padStart(2, '0')}${s.hidden ? ' · 已隐藏' : ''}</span><span class="name">${esc(s.name)}</span><span class="meta">${esc(s.section || '未分章节')} · ${s.animations.length} 动画</span></button>`,
    )
    .join('');
  for (const el of document.querySelectorAll<HTMLElement>('[data-slide]'))
    el.onclick = () => {
      document.body.classList.remove('overview-mode');
      void showPage(el.dataset.slide!).catch(pageError);
    };
  const nextObjects = await api(
    `/api/documents/${snapshot.document.id}/slides/${slideId}/objects?version=${snapshot.version}`,
  );
  if (generation !== renderGeneration) return;
  objects = nextObjects;
  selected = new Set([...selected].filter((id) => objects.some((o) => o.id === id)));
  renderObjects();
  set('notes', s.notes);
  set('deck-title', snapshot.document.title);
  set('deck-width', snapshot.document.width);
  set('deck-height', snapshot.document.height);
  set('theme-json', JSON.stringify(snapshot.document.theme, null, 2));
  renderGuides();
  set('slide-name', s.name);
  set('section', s.section);
  set('transition', s.transition);
  set('advance', s.advanceAfter);
  $<HTMLInputElement>('hidden-slide').checked = s.hidden;
  const revisions = await api(`/api/documents/${snapshot.document.id}/history`);
  if (generation !== renderGeneration) return;
  $('history').innerHTML = revisions
    .map(
      (r: { version: number; created_at: string }) =>
        `<option value="${r.version}">v${r.version} · ${new Date(r.created_at).toLocaleTimeString()}</option>`,
    )
    .join('');
  const previews = await api(
    `/api/documents/${snapshot.document.id}/preview?version=${snapshot.version}`,
  );
  if (generation !== renderGeneration) return;
  previewLease?.stop();
  previewLease = keepPreviewAlive(snapshot.document.id, previews);
  channel = previews.channel;
  frame.src = previews.slides.find((p: { id: string }) => p.id === slideId).url;
  $('empty').hidden = true;
  renderAnimations();
  teachingStepsUI.render();
  renderSelection();
  mark();
  set('step-map', JSON.stringify(s.stepMap ?? []));
  $('shared-layout').innerHTML =
    '<option value="">无共享布局</option>' +
    snapshot.document.layouts
      .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
      .join('');
  set('shared-layout', s.layoutSourceId ?? s.layoutId ?? '');
  fillLayout();
  layoutValuesUI.render();
}
function renderObjects() {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const query = value('object-search').trim().toLocaleLowerCase();
  $('objects').innerHTML = objects
    .filter(
      (o) =>
        !query ||
        `${o.attributes['data-notale-name'] ?? ''} ${o.tag} ${o.text} ${o.attributes.id ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .filter(
      (o) =>
        o.attributes.id !== 'stage' && !['aside', 'defs', 'linearGradient', 'stop'].includes(o.tag),
    )
    .map((o) => {
      let depth = 0,
        parent = o.parent;
      while (parent && depth < 5) {
        depth++;
        parent = byId.get(parent)?.parent;
      }
      return `<button class="object-row ${selected.has(o.id) ? 'selected' : ''}" data-object="${o.id}" style="padding-left:${8 + depth * 8}px" title="${esc(o.attributes.id || o.id)}"><small>${esc(o.tag)}</small>${esc((o.attributes['data-notale-name'] || o.text.trim() || o.attributes.alt || o.attributes.id || o.kind).slice(0, 28))}${o.locked ? ' 🔒' : ''}</button>`;
    })
    .join('');
  for (const el of document.querySelectorAll<HTMLElement>('[data-object]'))
    el.onclick = (e) => {
      changeSelection(
        [el.dataset.object!],
        e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace',
      );
      renderObjects();
      renderSelection();
    };
  $('trigger-target').innerHTML = objects
    .map(
      (o) =>
        `<option value="${o.id}">${esc(o.tag + ' ' + (o.text.trim() || o.attributes.id || '').slice(0, 30))}</option>`,
    )
    .join('');
}
let selectionFieldsKey = '',
  bindingRendered = '';
function renderSelection() {
  authoredComponents.render();
  renderComponentNavigation();
  if (canvasReady) send('select', { ids: [...selected] });
  const hasSelection = selected.size > 0;
  $<HTMLButtonElement>('layer-forward').disabled = !hasSelection;
  $<HTMLButtonElement>('layer-backward').disabled = !hasSelection;
  renderConnector();
  renderNativeChart();
  renderScene();
  for (const id of ['apply-format', 'apply-text', 'apply-advanced'])
    $<HTMLButtonElement>(id).disabled = [...selected].some((id) =>
      (slide().connectors ?? []).some((c) => c.id === id),
    );
  $('media-panel').hidden = !selected.size || !['img', 'video', 'audio'].includes(current().tag);
  if (!selected.size) {
    $('selection-name').textContent = '未选择对象';
    selectionFieldsKey = '';
    return;
  }
  const o = current(),
    t = slide().transforms[o.id] ?? { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };
  $('selection-name').textContent = `${o.tag} · ${selected.size} 个对象`;
  const binding = slide().bindings.find((b) => b.target === o.id),
    bindingValue = String(
      binding?.value ?? rects.find((r) => r.id === o.id)?.value ?? o.attributes.value ?? '',
    ),
    fieldsKey = JSON.stringify([snapshot.document.id, slideId, [...selected], o, t, binding]);
  // A runtime-ready or repeated selection notification must not overwrite an
  // unfinished form when its authored source has not changed.
  if (fieldsKey === selectionFieldsKey) {
    if ($<HTMLInputElement>('binding-value').value === bindingRendered)
      set('binding-value', bindingValue);
    bindingRendered = bindingValue;
    return;
  }
  selectionFieldsKey = fieldsKey;
  bindingRendered = bindingValue;
  set('object-name', o.attributes['data-notale-name'] ?? '');
  set('object-text', o.text);
  set('font-size', parseFloat(o.style['font-size']) || 32);
  set('tx', t.x);
  set('ty', t.y);
  set('rotation', t.rotate);
  set('scale', t.scaleX);
  set('object-width', t.width ?? '');
  set('object-height', t.height ?? '');
  set('style-json', JSON.stringify(o.style, null, 2));
  set('attrs-json', '{}');
  if (!$('media-panel').hidden) fillMedia(o);
  const chart = JSON.parse(o.attributes['data-notale-chart'] ?? '{}');
  set('chart-kind', chart.kind ?? 'bar');
  set('chart-title', chart.title ?? '');
  set(
    'chart-colors',
    (chart.colors ?? ['#466ddb', '#28a69b', '#e69444', '#a46bd1', '#dc667a']).join(', '),
  );
  for (const [key, fallback] of Object.entries({
    fontSize: 16,
    textColor: '#273247',
    background: '#ffffff',
    gridColor: '#dce3ed',
    labelAngle: 0,
    labelEvery: 0,
    valueDecimals: 0,
    lineWidth: 3,
    pointRadius: 4,
  }))
    set(`chart-${key}`, chart[key] ?? fallback);
  for (const key of ['showValues', 'showLegend', 'showGrid'])
    $<HTMLInputElement>(`chart-${key}`).checked = chart[key] ?? true;
  set('binding-value', bindingValue);
  set(
    'chart-data',
    o.attributes['data-notale-chart'] ?? '{"labels":["A","B","C"],"values":[48,72,91]}',
  );
}
let editingAnimation: string | undefined;
function renderAnimations() {
  const s = slide();
  $('animations').innerHTML = s.animations
    .map(
      (a, i) =>
        `<div class="animation-row"><strong>${i + 1}. ${esc(a.effect)} · step ${a.step}</strong>${a.duration} ms · ${esc(a.trigger)}<br><button data-edit-animation="${a.id}">编辑</button> <button data-copy-animation="${a.id}">复制</button> <button data-remove-animation="${a.id}">删除</button> <button data-up-animation="${a.id}">上移</button> <button data-down-animation="${a.id}">下移</button></div>`,
    )
    .join('');
  $('timeline').innerHTML = s.animations
    .map((a) => `<div class="cue">${a.step} · ${esc(a.effect)} · ${a.duration}ms</div>`)
    .join('');
  if (!s.animations.some((a) => a.id === editingAnimation)) editingAnimation = undefined;
  $('save-animation').toggleAttribute('disabled', !editingAnimation);
  $('animation-editing').textContent = editingAnimation
    ? `编辑第 ${s.animations.findIndex((a) => a.id === editingAnimation) + 1} 条动画`
    : '新建动画';
  for (const el of document.querySelectorAll<HTMLElement>('[data-edit-animation]'))
    el.onclick = () => {
      const a = s.animations.find((a) => a.id === el.dataset.editAnimation)!;
      editingAnimation = a.id;
      selected = new Set([a.target]);
      renderObjects();
      renderSelection();
      fillAnimation(a);
      renderAnimations();
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-copy-animation]'))
    el.onclick = () => {
      const a = s.animations.find((a) => a.id === el.dataset.copyAnimation)!,
        id = uuid(),
        ids = s.animations.map((a) => a.id);
      ids.splice(ids.indexOf(a.id) + 1, 0, id);
      void commands([
        { type: 'animation.set', slideId, animation: { ...a, id } },
        { type: 'animation.reorder', slideId, ids },
      ]).catch(error);
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-down-animation]'))
    el.onclick = () => {
      const ids = s.animations.map((a) => a.id),
        at = ids.indexOf(el.dataset.downAnimation!);
      if (at < ids.length - 1) {
        [ids[at], ids[at + 1]] = [ids[at + 1], ids[at]];
        void commands([{ type: 'animation.reorder', slideId, ids }]).catch(error);
      }
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-remove-animation]'))
    el.onclick = () =>
      void commands([{ type: 'animation.remove', slideId, id: el.dataset.removeAnimation }]).catch(
        error,
      );
  for (const el of document.querySelectorAll<HTMLElement>('[data-up-animation]'))
    el.onclick = () => {
      const ids = s.animations.map((a) => a.id),
        index = ids.indexOf(el.dataset.upAnimation!);
      if (index > 0) {
        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
        void commands([{ type: 'animation.reorder', slideId, ids }]).catch(error);
      }
    };
}
function setStep(next: number, animate = true, componentStep?: number) {
  step = Math.max(0, Math.min(max, next));
  set('step', step);
  $('step-label').textContent = `${step} / ${max}`;
  send('seek', { step, animate, ...(componentStep !== undefined ? { componentStep } : {}) });
}
function mode(play: boolean) {
  interacting = play;
  document.body.classList.toggle('interacting', play);
  $('interact').textContent = play ? '返回编辑' : '体验互动';
  $('interact').setAttribute('aria-pressed', String(play));
  send('resize-mode', { reflow: $<HTMLInputElement>('text-reflow').checked });
  send('mode', { mode: play ? 'play' : 'edit' });
  setStep(play ? 0 : max, false, 0);
}
window.addEventListener('message', (e) => {
  if (
    e.source !== frame.contentWindow ||
    e.data?.source !== 'notale-slide' ||
    e.data.channel !== channel
  )
    return;
  const { type, data } = e.data;
  if (type === 'scene-inspect') {
    sceneRequests.get(data.requestId)?.(data);
    sceneRequests.delete(data.requestId);
  }
  if (type === 'native-chart-error') error(new Error(`原生图表：${data.error}`));
  if (type === 'native-chart-inspect') {
    nativeChartRequests.get(data.requestId)?.(data);
    nativeChartRequests.delete(data.requestId);
  }
  if (type === 'edit-action' && data.slideId === slideId && !interacting)
    enqueueEdit(data.action, true);
  if (type === 'ready' && data.slideId === slideId) {
    frame.inert = false;
    canvasReady = true;
    nativeMax = data.nativeMax ?? slide().nativeStepCount;
    teachingStepsUI.render();
    for (const done of readyWaiters) done();
    rects = data.objects;
    sourceScenes = data.scenes ?? [];
    max = data.max;
    $<HTMLInputElement>('step').max = String(max);
    mode(interacting);
    sendSnapping();
    renderSelection();
  }
  if (type === 'select') {
    changeSelection(Array.isArray(data.ids) ? data.ids : data.id ? [data.id] : []);
    rects = data.objects;
    renderObjects();
    renderSelection();
  }
  if (type === 'text')
    void commands([
      { type: 'element.patch', slideId, target: data.id, patch: { text: data.text } },
    ]).catch(error);
  if (type === 'connector-edit' && data.slideId === slideId && !interacting)
    void commands([
      { type: 'connector.set', slideId, connector: connectorSchema.parse(data.connector) },
    ]).catch(error);
  if (type === 'guide-edit') {
    const pageId = slideId,
      documentId = snapshot.document.id,
      id = data.id ?? uuid();
    guideEdits = guideEdits
      .then(async () => {
        await whenEditsIdle();
        await whenIdle();
        if (snapshot.document.id !== documentId || slideId !== pageId) return;
        const previous = slide().guides.find((g) => g.id === id);
        if (data.id && !previous && !data.create) return;
        const guides = slide().guides.filter((g) => g.id !== id);
        if (!data.remove)
          guides.push({
            id,
            axis: data.axis,
            position: data.delta !== undefined ? previous!.position + data.delta : data.position,
          });
        await commands([{ type: 'slide.update', slideId: pageId, patch: { guides } }]);
        await whenReady();
        if (slideId === pageId && !data.remove) send('guide-focus', { id });
      })
      .catch(error);
  }
  if (type === 'box-resize')
    void commands([
      { type: 'element.patch', slideId, target: data.id, patch: { style: data.style } },
      {
        type: 'element.transform',
        slideId,
        target: data.id,
        transform: { width: data.width, height: data.height, matrix: data.matrix },
      },
    ]).catch(error);
  if (type === 'transform')
    void commands([
      {
        type: 'elements.arrange',
        slideId,
        action: data.action ?? 'translate',
        angle: data.angle,
        factorX: data.factorX,
        factorY: data.factorY,
        anchor: data.anchor,
        rectangles: data.rectangles,
        dx: data.dx,
        dy: data.dy,
      },
    ]).catch(error);
  if (type === 'step') {
    step = data.step;
    max = data.max;
    $<HTMLInputElement>('step').max = String(max);
    set('step', step);
    $('step-label').textContent = `${step} / ${max}`;
  }
  if (type === 'edit-error') error(new Error(data.message));
  if (type === 'media-blocked')
    $('media-notice').textContent = '浏览器未允许自动播放，请使用媒体播放按钮。';
  if (type === 'measure') rects = data;
  if (type === 'capture') {
    const callback = captures.get(data.requestId);
    if (callback) {
      captures.delete(data.requestId);
      callback({
        rectangles: data.rectangles,
        computedStyles: data.computedStyles,
        ...(data.nativeChartTargets ? { nativeChartTargets: data.nativeChartTargets } : {}),
        ...(data.nativeChartStates ? { nativeChartStates: data.nativeChartStates } : {}),
        ...(data.componentStates ? { componentStates: data.componentStates } : {}),
        ...(data.canvasSceneStates ? { canvasSceneStates: data.canvasSceneStates } : {}),
      });
    }
  }
  if (
    type === 'navigate' &&
    data.slideId &&
    snapshot.document.slides.some((s) => s.id === data.slideId)
  ) {
    void showPage(data.slideId).catch(pageError);
  }
  if (type === 'navigate' && data.direction) setStep(step + data.direction);
});
let guideEdits: Promise<void> = Promise.resolve();
const snapKey = 'notale-editor-snapping';
function sendSnapping() {
  send('snapping', {
    enabled: $<HTMLInputElement>('snap-enabled').checked,
    visible: $<HTMLInputElement>('guides-visible').checked,
    rulers: $<HTMLInputElement>('rulers-visible').checked,
    grid: num('snap-grid'),
  });
}
for (const id of ['snap-enabled', 'guides-visible', 'snap-grid', 'rulers-visible'])
  $(id).addEventListener('change', () => {
    sendSnapping();
    try {
      localStorage.setItem(
        snapKey,
        JSON.stringify({
          enabled: $<HTMLInputElement>('snap-enabled').checked,
          visible: $<HTMLInputElement>('guides-visible').checked,
          rulers: $<HTMLInputElement>('rulers-visible').checked,
          grid: num('snap-grid'),
        }),
      );
    } catch {}
  });
try {
  const saved = JSON.parse(localStorage.getItem(snapKey) ?? 'null');
  if (saved) {
    $<HTMLInputElement>('snap-enabled').checked = saved.enabled !== false;
    $<HTMLInputElement>('guides-visible').checked = saved.visible !== false;
    $<HTMLInputElement>('rulers-visible').checked = saved.rulers === true;
    set('snap-grid', Math.max(0, Math.min(10000, Number(saved.grid) || 0)));
  }
} catch {}
function renderGuides() {
  $('guide-list').innerHTML = (slide().guides ?? [])
    .map(
      (g) => `<div class="guide-row" data-guide="${g.id}">
    <label>${g.axis === 'x' ? '垂直 X' : '水平 Y'}<input type="number" step="any" data-guide-position="${g.id}" value="${g.position}" aria-label="${g.axis.toUpperCase()} 参考线坐标" /></label>
    <button data-save-guide="${g.id}">更新</button><button data-remove-guide="${g.id}">删除</button></div>`,
    )
    .join('');
  for (const el of document.querySelectorAll<HTMLElement>('[data-save-guide]'))
    el.onclick = () => {
      const id = el.dataset.saveGuide!,
        input = document.querySelector<HTMLInputElement>(`[data-guide-position="${id}"]`)!;
      void commands([
        {
          type: 'slide.update',
          slideId,
          patch: {
            guides: slide().guides.map((g) =>
              g.id === id ? { ...g, position: Number(input.value) } : g,
            ),
          },
        },
      ]).catch(error);
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-remove-guide]'))
    el.onclick = () =>
      void commands([
        {
          type: 'slide.update',
          slideId,
          patch: { guides: slide().guides.filter((g) => g.id !== el.dataset.removeGuide) },
        },
      ]).catch(error);
}
on('add-guide', () =>
  commands([
    {
      type: 'slide.update',
      slideId,
      patch: {
        guides: [
          ...(slide().guides ?? []),
          { id: uuid(), axis: value('guide-axis'), position: num('guide-position') },
        ],
      },
    },
  ]),
);

for (const tab of document.querySelectorAll<HTMLElement>('[data-tab]'))
  tab.onclick = () => {
    for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]'))
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    for (const t of document.querySelectorAll('[data-tab]'))
      t.classList.toggle('active', t === tab);
  };
on('apply-text', () =>
  commands([
    { type: 'element.patch', slideId, target: current().id, patch: { text: value('object-text') } },
  ]),
);
on('apply-format', () =>
  commands(
    [...selected].flatMap((target) => [
      {
        type: 'element.patch',
        slideId,
        target,
        patch: { style: { 'font-size': `${num('font-size')}px`, color: value('color') } },
      },
      {
        type: 'element.transform',
        slideId,
        target,
        transform: {
          x: num('tx'),
          y: num('ty'),
          rotate: num('rotation'),
          scaleX: num('scale'),
          scaleY: num('scale'),
          ...(value('object-width') ? { width: num('object-width') } : {}),
          ...(value('object-height') ? { height: num('object-height') } : {}),
        },
      },
    ]),
  ),
);
on('apply-advanced', () =>
  commands([
    {
      type: 'element.patch',
      slideId,
      target: current().id,
      patch: {
        style: JSON.parse(value('style-json')),
        attributes: JSON.parse(value('attrs-json')),
      },
    },
  ]),
);
on('bold', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { 'font-weight': '700' } },
    })),
  ),
);
on('italic', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { 'font-style': 'italic' } },
    })),
  ),
);
on('lock', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.lock',
      slideId,
      target,
      locked: !objects.find((o) => o.id === target)!.locked,
    })),
  ),
);
function svgLayer(id: string) {
  const object = objects.find((o) => o.id === id);
  return (
    object &&
    isSvgLayer(
      object,
      objects.find((o) => o.id === object.parent),
    )
  );
}
async function changeLayer(action: 'front' | 'back' | 'forward' | 'backward') {
  await whenIdle();
  const targets = [...selected],
    pageId = slideId,
    documentId = snapshot.document.id,
    version = snapshot.version;
  if (!targets.length) return;
  const svg = targets.filter((id) => svgLayer(id)),
    html = targets.filter((id) => !svgLayer(id));
  if (
    html.some((id) => {
      const object = objects.find((o) => o.id === id)!;
      return (
        object.namespace === 'http://www.w3.org/2000/svg' &&
        (object.tag !== 'svg' ||
          objects.find((o) => o.id === object.parent)?.namespace === object.namespace)
      );
    })
  )
    throw new Error('请选择完整 SVG 图形或图形组合，文字片段和条件分支不能作为独立图层排序');
  const parentIds = new Set(html.map((id) => objects.find((object) => object.id === id)?.parent));
  const related = objects
    .filter((object) => parentIds.has(object.parent) || parentIds.has(object.id))
    .map((object) => object.id);
  const capture = html.length ? await captureSelection(related) : undefined;
  if (slideId !== pageId || snapshot.document.id !== documentId || snapshot.version !== version)
    throw new Error('页面在调整层级前已变化，请重试');
  const edits: Command[] = svg.length
    ? [{ type: 'elements.order', slideId: pageId, targets: svg, action }]
    : [];
  if (html.length)
    edits.push(...htmlLayerCommands(pageId, html, objects, capture!.computedStyles, action));
  if (!edits.length) return;
  return commands(edits);
}
on('front', () => changeLayer('front'));
on('back', () => changeLayer('back'));
$('objects').insertAdjacentHTML(
  'beforebegin',
  '<label>查找对象<input id="object-search" placeholder="名称、文字或类型"></label>',
);
$<HTMLInputElement>('object-search').oninput = renderObjects;
$('object-text').insertAdjacentHTML(
  'beforebegin',
  '<label>对象名称<input id="object-name"></label><button id="save-object-name">保存名称</button><div class="inline"><button id="hide-objects">隐藏所选对象</button><button id="show-objects">显示所选对象</button></div>',
);
on('save-object-name', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { attributes: { 'data-notale-name': value('object-name') } },
    })),
  ),
);
on('hide-objects', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { visibility: 'hidden' } },
    })),
  ),
);
on('show-objects', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { visibility: 'visible' } },
    })),
  ),
);
on('layer-forward', () => changeLayer('forward'));
on('layer-backward', () => changeLayer('backward'));
on('delete-object', () =>
  commands([...selected].map((target) => ({ type: 'element.delete', slideId, target }))),
);
on('duplicate-object', async () => {
  const containsSelection = (id: string) => {
    let object = objects.find((o) => o.id === id);
    while (object) {
      if (selected.has(object.id)) return true;
      object = objects.find((o) => o.id === object!.parent);
    }
    return false;
  };
  const graph = (slide().connectors ?? []).some((c) => containsSelection(c.id));
  if (
    graph ||
    sourceScenes.some((scene) => !!scene.root && containsSelection(scene.root)) ||
    (slide().components ?? []).some((component) => containsSelection(component.root)) ||
    rects.some((rect) => rect.nativeChart && containsSelection(rect.id))
  ) {
    await copySelection('copy');
    return pasteSelection();
  }
  return commands([...selected].map((target) => ({ type: 'element.duplicate', slideId, target })));
});
on('group', () =>
  commands([{ type: 'group.set', slideId, id: uuid(), name: '组合', members: [...selected] }]),
);
on('ungroup', () =>
  commands(
    slide()
      .groups.filter((g) => g.members.some((id) => selected.has(id)))
      .map((g) => ({ type: 'group.remove', slideId, id: g.id })),
  ),
);
on('align-left', () => arrange('left'));
on('distribute', () => arrange('distribute-x'));

let sourceScenes: SourceScene[] = [];
let sceneSelection = '';
let sceneValues: Record<string, SceneScalar> | undefined;
let sceneCheckpoint: SceneCheckpoint | undefined;
type SceneInspection = {
  values?: Record<string, SceneScalar>;
  checkpoint?: SceneCheckpoint;
  error?: string;
};
const sceneRequests = new Map<string, (result: SceneInspection) => void>();
function chosenScene() {
  return sourceScenes.find((scene) => scene.id === value('scene-choice'));
}
function renderScene() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const candidates = canvasReady
    ? sourceScenes.filter((scene) => scene.targets.includes(target))
    : [];
  $('scene-panel').hidden = !candidates.length;
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}/${target}/${canvasReady}`;
  if (key === sceneSelection) return;
  sceneSelection = key;
  sceneValues = undefined;
  sceneCheckpoint = undefined;
  $('scene-choice').innerHTML = candidates
    .map((scene) => `<option value="${scene.id}">${esc(scene.name)}</option>`)
    .join('');
  fillScene();
}
function fillScene() {
  const scene = chosenScene();
  $<HTMLButtonElement>('select-scene-root').hidden = !scene?.root;
  sceneValues = undefined;
  sceneCheckpoint = undefined;
  $<HTMLButtonElement>('save-scene').disabled = true;
  $('scene-status').textContent = '读取当前互动状态后，可以保存本次采样和修改启动参数。';
  if (scene?.checkpoint)
    $('scene-status').textContent =
      '在画布中体验互动并调整树的数量或重新抽样，然后读取并保存完整场景状态。';
  $('save-scene').textContent = scene?.checkpoint ? '保存完整场景状态' : '保存场景参数';
  $('scene-parameters').innerHTML = (scene?.checkpoint ? [] : (scene?.parameters ?? []))
    .filter((p) => !p.readonly)
    .map((parameter) => {
      const saved =
        slide().scenes?.find((s) => s.id === scene!.id)?.values[parameter.key] ?? parameter.value;
      if (parameter.choices)
        return `<label>${esc(parameter.label)}<select data-scene-key="${esc(parameter.key)}">${parameter.choices.map((choice) => `<option value="${esc(choice.value)}" ${choice.value === saved ? 'selected' : ''}>${esc(choice.label)}</option>`).join('')}</select></label>`;
      const type =
        typeof parameter.value === 'number'
          ? 'number'
          : typeof parameter.value === 'boolean'
            ? 'checkbox'
            : 'text';
      return `<label>${esc(parameter.label === 'seed' ? '随机种子' : parameter.label)}<input data-scene-key="${esc(parameter.key)}" type="${type}" ${type === 'checkbox' ? (saved ? 'checked' : '') : `value="${esc(saved)}"`} ${type === 'number' ? `step="${parameter.control?.step ?? 'any'}" min="${parameter.control?.min ?? -1e9}" max="${parameter.control?.max ?? 1e9}"` : ''}/></label>`;
    })
    .join('');
}
$<HTMLSelectElement>('scene-choice').onchange = fillScene;
on('select-scene-root', () => {
  const root = chosenScene()?.root;
  if (root) {
    changeSelection([root]);
    renderSelection();
  }
});
on('read-scene', async () => {
  await whenReady();
  const scene = chosenScene(),
    key = sceneSelection;
  if (!scene) throw new Error('请先选择互动场景');
  const requestId = uuid();
  const result = await new Promise<SceneInspection>((resolve, reject) => {
    const timer = setTimeout(() => {
      sceneRequests.delete(requestId);
      reject(new Error('场景未响应'));
    }, 5000);
    sceneRequests.set(requestId, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    send('scene-inspect', { requestId, sceneId: scene.id });
  });
  if (key !== sceneSelection || chosenScene()?.id !== scene.id) return;
  if (result.error || !result.values) throw new Error(result.error ?? '无法读取场景');
  sceneValues = sceneValuesSchema.parse(result.values);
  if (scene.checkpoint) sceneCheckpoint = sceneCheckpointSchema.parse(result.checkpoint);
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[data-scene-key]',
  )) {
    const v = sceneValues[input.dataset.sceneKey!];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
  }
  $('scene-status').textContent = '已读取当前互动状态；保存后重新打开将使用这些参数。';
  if (sceneCheckpoint)
    $('scene-status').textContent =
      `已读取第 ${sceneCheckpoint.state.runCount} 次抽样、${sceneCheckpoint.state.m} 棵树及预测历史，保存后可继续互动。`;
  $<HTMLButtonElement>('save-scene').disabled = false;
});
on('save-scene', () => {
  const scene = chosenScene();
  if (!scene || !sceneValues) throw new Error('请先读取当前互动状态');
  if (scene.checkpoint) {
    if (!sceneCheckpoint) throw new Error('请先读取完整场景状态');
    return commands([
      { type: 'scene.checkpoint', slideId, sceneId: scene.id, checkpoint: sceneCheckpoint },
    ]);
  }
  const values: Record<string, SceneScalar> = {};
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[data-scene-key]',
  )) {
    const key = input.dataset.sceneKey!,
      parameter = scene.parameters.find((p) => p.key === key)!;
    if (
      (input instanceof HTMLSelectElement && input.selectedIndex < 0) ||
      (typeof parameter.value === 'number' && input.value.trim() === '')
    )
      throw new Error(`请为 ${parameter.label} 选择或输入有效值`);
    values[key] =
      typeof parameter.value === 'number'
        ? Number(input.value)
        : typeof parameter.value === 'boolean'
          ? input instanceof HTMLInputElement
            ? input.checked
            : input.value === 'true'
          : input.value;
  }
  return commands([
    { type: 'scene.set', slideId, sceneId: scene.id, values: sceneValuesSchema.parse(values) },
  ]);
});
on('reset-scene', () => {
  const scene = chosenScene();
  if (!scene) throw new Error('请先选择互动场景');
  return commands([{ type: 'scene.remove', slideId, sceneId: scene.id }]);
});

const nativeChartRequests = new Map<string, (result: NativeChartInspection) => void>();
$('native-chart-panel').insertAdjacentHTML(
  'beforeend',
  `<div id="native-chart-interaction" hidden>
    <label>学习率<select id="native-chart-value"><option value="1.0">1.0 过冲</option><option value="0.1">0.1 推荐</option><option value="0.02">0.02 保守</option></select></label>
    <button id="save-native-chart-state">保存互动选择</button>
    <label>按钮状态<select id="native-chart-appearance-state"><option value="active">选中</option><option value="inactive">未选中</option></select></label>
    <label>背景色<input id="native-chart-backgroundColor" /></label>
    <label>文字颜色<input id="native-chart-color-state" /></label>
    <label>边框颜色<input id="native-chart-borderColor" /></label>
    <label>字重<input id="native-chart-fontWeight" /></label>
    <button id="save-native-chart-appearance">保存状态样式</button>
  </div>`,
);
$('native-chart-panel').insertAdjacentHTML(
  'afterend',
  '<fieldset id="component-members" hidden><legend>互动组件</legend><label>编辑对象<select id="component-member"></select></label><button id="select-component-member">选择对象</button></fieldset>',
);
function currentComponent(): NativeChartInteraction | undefined {
  return (
    slide().nativeCharts?.[[...selected][0] ?? '']?.interaction ?? nativeChartInspection?.component
  );
}
function componentAdoption(): Command[] {
  const target = current().id;
  if (slide().nativeCharts?.[target]?.interaction) return [];
  const component =
    nativeChartInspection?.target === target ? nativeChartInspection.component : undefined;
  if (!component) throw new Error('请先读取当前组件');
  const { value, active, inactive } = component;
  return [{ type: 'native-chart.component', slideId, target, state: { value, active, inactive } }];
}
on('save-native-chart-state', () =>
  commands([
    ...componentAdoption(),
    {
      type: 'native-chart.state',
      slideId,
      target: current().id,
      value: value('native-chart-value'),
    },
  ]),
);
const appearanceInputs = {
  backgroundColor: 'native-chart-backgroundColor',
  color: 'native-chart-color-state',
  borderColor: 'native-chart-borderColor',
  fontWeight: 'native-chart-fontWeight',
} as const;
function fillComponentAppearance() {
  const state = value('native-chart-appearance-state') as 'active' | 'inactive';
  const appearance = currentComponent()?.[state];
  if (appearance)
    for (const [key, input] of Object.entries(appearanceInputs))
      set(input, appearance[key as keyof typeof appearance]);
}
$<HTMLSelectElement>('native-chart-appearance-state').onchange = fillComponentAppearance;
on('save-native-chart-appearance', () => {
  const state = value('native-chart-appearance-state') as 'active' | 'inactive';
  const before = currentComponent()?.[state];
  if (!before) throw new Error('请先读取当前组件');
  const patch: Record<string, string> = {};
  for (const [key, input] of Object.entries(appearanceInputs)) {
    const next = value(input).trim(),
      property = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    if (!CSS.supports(property, next))
      throw new Error(`无效的${$(input).closest('label')?.firstChild?.textContent ?? '样式'}`);
    if (next !== before[key as keyof typeof before]) patch[key] = next;
  }
  if (!Object.keys(patch).length) return;
  return commands([
    ...componentAdoption(),
    {
      type: 'native-chart.appearance',
      slideId,
      target: current().id,
      state,
      patch: nativeChartAppearancePatchSchema.parse(patch),
    },
  ]);
});
function renderComponentNavigation() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const entries = Object.entries(slide().nativeCharts ?? {}).filter(
    ([, chart]) => chart.interaction,
  );
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}`;
  if (key !== componentDiscoveryKey) {
    componentDiscoveryKey = key;
    componentDiscoveries.clear();
  }
  if (nativeChartSelection.startsWith(`${key}/`) && nativeChartInspection?.component)
    componentDiscoveries.set(nativeChartInspection.target, nativeChartInspection.component);
  for (const [id, component] of componentDiscoveries)
    if (!entries.some(([target]) => target === id))
      entries.push([id, { adapter: 'echarts', option: {}, interaction: component }]);
  const entry = entries.find(([, chart]) => {
    let id: string | undefined = target;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === chart.interaction!.root) return true;
      seen.add(id);
      id = objects.find((object) => object.id === id)?.parent;
    }
    return false;
  });
  $('component-members').hidden = !entry;
  if (!entry) return;
  const [id, chart] = entry,
    component = chart.interaction!;
  $('component-member').innerHTML = [
    [component.root, '整个组件'],
    [id, '图表'],
    ...Object.entries(component.controls).map(([value, id]) => [id, `按钮 ${value}`]),
    ...Object.entries(component.metrics).map(([key, id]) => [
      id,
      (
        {
          optM: '最佳轮数',
          minErr: '最低验证误差',
          overfit: '后期反弹',
          verdict: '结论',
        } as Record<string, string>
      )[key],
    ]),
  ]
    .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`)
    .join('');
  set(
    'component-member',
    [
      component.root,
      id,
      ...Object.values(component.controls),
      ...Object.values(component.metrics),
    ].includes(target)
      ? target
      : component.root,
  );
}
on('select-component-member', () => {
  changeSelection([value('component-member')]);
  renderObjects();
  renderSelection();
});
const componentDiscoveries = new Map<string, NativeChartInteraction>();
let componentDiscoveryKey = '';
let nativeChartInspection: NativeChartInspection | undefined;
let nativeChartSelection = '';
function renderNativeChart() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}/${target}`;
  const available =
    !!target &&
    (rects.some((r) => r.id === target && r.nativeChart) || !!slide().nativeCharts?.[target]);
  $('native-chart-panel').hidden = !available;
  $('native-chart-interaction').hidden = !(
    slide().nativeCharts?.[target]?.interaction ||
    (key === nativeChartSelection && nativeChartInspection?.component)
  );
  if (key === nativeChartSelection) return;
  nativeChartSelection = key;
  nativeChartInspection = undefined;
  set('native-chart-value', slide().nativeCharts?.[target]?.interaction?.value ?? '0.1');
  fillComponentAppearance();
  $('native-chart-series').innerHTML = '';
  set('native-chart-option', JSON.stringify(slide().nativeCharts?.[target]?.option ?? {}, null, 2));
  $('native-chart-status').textContent = '读取图表后可编辑序列数据与样式。';
  $<HTMLButtonElement>('save-native-chart-series').disabled = true;
}
async function inspectNativeChart() {
  await whenReady();
  const target = current().id,
    key = nativeChartSelection,
    requestId = uuid();
  const result = await new Promise<NativeChartInspection>((resolve, reject) => {
    const timer = setTimeout(() => {
      nativeChartRequests.delete(requestId);
      reject(new Error('图表未响应'));
    }, 5000);
    nativeChartRequests.set(requestId, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    send('native-chart-inspect', { requestId, target });
  });
  if (key !== nativeChartSelection) return;
  if (!result.available || result.error) throw new Error(result.error ?? '图表实例不可用');
  nativeChartInspection = result;
  if (result.value) set('native-chart-value', result.value);
  $('native-chart-interaction').hidden =
    !result.component && !slide().nativeCharts?.[target]?.interaction;
  fillComponentAppearance();
  renderComponentNavigation();
  $('native-chart-series').innerHTML = result.series
    .map((s, i) => `<option value="${i}">${esc(s.name || `序列 ${i + 1}`)}</option>`)
    .join('');
  $('native-chart-status').textContent =
    `${result.series.length} 个序列；未固定的数据继续响应原页面互动。`;
  $<HTMLButtonElement>('save-native-chart-series').disabled = !result.series.length;
  fillNativeSeries();
}
function fillNativeSeries() {
  const index = num('native-chart-series'),
    series = nativeChartInspection?.series[index];
  if (!series) return;
  set('native-chart-name', series.name);
  set('native-chart-color', series.color);
  set('native-chart-width', series.width);
  set('native-chart-data', JSON.stringify(series.data, null, 2));
  $<HTMLInputElement>('native-chart-symbols').checked = series.showSymbol;
  $<HTMLInputElement>('native-chart-save-data').checked =
    slide().nativeCharts?.[current().id]?.option.series?.[index]?.data !== undefined;
}
on('inspect-native-chart', inspectNativeChart);
$<HTMLSelectElement>('native-chart-series').onchange = fillNativeSeries;
on('save-native-chart-series', () => {
  const target = current().id;
  if (!nativeChartInspection || nativeChartInspection.target !== target)
    throw new Error('请先读取当前图表');
  const index = num('native-chart-series');
  const option = structuredClone(slide().nativeCharts?.[target]?.option ?? {});
  option.series ??= [];
  while (option.series.length <= index) option.series.push({});
  const patch = option.series[index];
  patch.name = value('native-chart-name');
  patch.lineStyle = {
    ...patch.lineStyle,
    color: value('native-chart-color'),
    width: num('native-chart-width'),
  };
  patch.itemStyle = { ...patch.itemStyle, color: value('native-chart-color') };
  patch.showSymbol = $<HTMLInputElement>('native-chart-symbols').checked;
  if ($<HTMLInputElement>('native-chart-save-data').checked)
    patch.data = JSON.parse(value('native-chart-data'));
  else delete patch.data;
  return commands([
    { type: 'native-chart.set', slideId, target, option: nativeChartOptionSchema.parse(option) },
  ]);
});
on('save-native-chart-option', () =>
  commands([
    {
      type: 'native-chart.set',
      slideId,
      target: current().id,
      option: nativeChartOptionSchema.parse(JSON.parse(value('native-chart-option'))),
    },
  ]),
);
on('reset-native-chart', () =>
  commands([{ type: 'native-chart.remove', slideId, target: current().id }]),
);

on('save-binding', () => {
  const o = current();
  return commands([
    {
      type: 'binding.set',
      slideId,
      binding: {
        id: slide().bindings.find((b) => b.target === o.id)?.id ?? uuid(),
        target: o.id,
        label: o.attributes.id ?? o.tag,
        value:
          o.attributes.type === 'checkbox'
            ? value('binding-value') === 'true'
            : value('binding-value'),
        event: o.tag === 'select' ? 'change' : 'input',
      },
    },
  ]);
});
function fillAnimation(a: AnimationSpec) {
  set('effect', a.effect);
  set('animation-step', a.step);
  set('duration', a.duration);
  set('delay', a.delay);
  set('trigger', a.trigger);
  set('trigger-target', a.triggerTarget ?? '');
  set('dx', a.dx);
  set('dy', a.dy);
  set('easing', a.easing);
  set(
    'keyframes',
    JSON.stringify(
      a.keyframes ?? [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 1 },
      ],
      null,
      2,
    ),
  );
}
function readAnimation(id: string) {
  return {
    id,
    target: current().id,
    effect: value('effect'),
    step: num('animation-step'),
    duration: num('duration'),
    delay: num('delay'),
    trigger: value('trigger'),
    ...(value('trigger') === 'object' ? { triggerTarget: value('trigger-target') } : {}),
    dx: num('dx'),
    dy: num('dy'),
    easing: value('easing'),
    ...(value('effect') === 'custom' ? { keyframes: JSON.parse(value('keyframes')) } : {}),
  };
}
$('effect').insertAdjacentHTML('beforeend', '<option value="custom">自定义关键帧</option>');
$('add-animation').insertAdjacentHTML(
  'beforebegin',
  '<p id="animation-editing">新建动画</p><label>垂直位移<input id="dy" type="number" value="0"></label><label>缓动<select id="easing"><option value="ease-out">减速</option><option value="linear">线性</option><option value="ease">平滑</option><option value="ease-in">加速</option><option value="ease-in-out">加速后减速</option></select></label><label>自定义关键帧 JSON<textarea id="keyframes" rows="4">[{"opacity":0,"offset":0},{"opacity":1,"offset":1}]</textarea></label>',
);
$('add-animation').insertAdjacentHTML(
  'afterend',
  '<button id="save-animation" disabled>更新所选动画</button><button id="new-animation">结束编辑</button>',
);
on('add-animation', () =>
  commands([{ type: 'animation.set', slideId, animation: readAnimation(uuid()) }]),
);
on('save-animation', () => {
  if (!editingAnimation) throw new Error('请先选择要编辑的动画');
  return commands([{ type: 'animation.set', slideId, animation: readAnimation(editingAnimation) }]);
});
on('new-animation', () => {
  editingAnimation = undefined;
  renderAnimations();
});
on('preview-animation', () => mode(true));
on('interact', () => mode(!interacting));
on('step-prev', () => setStep(step - 1));
on('step-next', () => setStep(step + 1));
$<HTMLInputElement>('step').oninput = () => setStep(num('step'), false);
on('save-notes', () =>
  commands([{ type: 'slide.update', slideId, patch: { notes: value('notes') } }]),
);
on('save-deck', () =>
  commands([
    {
      type: 'deck.update',
      title: value('deck-title'),
      width: num('deck-width'),
      height: num('deck-height'),
      theme: JSON.parse(value('theme-json')),
    },
  ]),
);
on('save-slide', () =>
  commands([
    {
      type: 'slide.update',
      slideId,
      patch: {
        name: value('slide-name'),
        section: value('section'),
        transition: value('transition'),
        advanceAfter: num('advance'),
        hidden: $<HTMLInputElement>('hidden-slide').checked,
      },
    },
  ]),
);
on('copy-slide', () => {
  const id = uuid();
  return commands([{ type: 'slide.duplicate', slideId, newId: id }], true, id);
});
on('delete-slide', () => {
  const at = snapshot.document.slides.findIndex((s) => s.id === slideId),
    next = snapshot.document.slides[at + 1] ?? snapshot.document.slides[at - 1];
  return commands([{ type: 'slide.delete', slideId }], true, next?.id);
});
on('up-slide', () =>
  commands([
    {
      type: 'slide.move',
      slideId,
      index: Math.max(0, snapshot.document.slides.findIndex((s) => s.id === slideId) - 1),
    },
  ]),
);
on('down-slide', () =>
  commands([
    {
      type: 'slide.move',
      slideId,
      index: Math.min(
        snapshot.document.slides.length - 1,
        snapshot.document.slides.findIndex((s) => s.id === slideId) + 1,
      ),
    },
  ]),
);
on('add-slide', () => {
  const id = uuid();
  return commands(
    [
      {
        type: 'slide.insert',
        after: slideId,
        slide: {
          id,
          name: '新页面',
          sourcePath: `${id}.html`,
          html: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f7f9fc;font-family:system-ui}#stage{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center}</style></head><body><main id="stage">${template('text', '新页面')}</main></body></html>`,
        },
      },
    ],
    true,
    id,
  );
});
let uploadAction:
  | { kind: string; target?: string; poster?: boolean; documentId: string; slideId: string }
  | undefined;
function chooseMedia(kind: string, target?: string, poster = false) {
  uploadAction = { kind, target, poster, documentId: snapshot.document.id, slideId };
  $<HTMLInputElement>('media-file').accept = kind === 'image' ? 'image/*' : `${kind}/*`;
  $('media-file').click();
}
on('insert', () => {
  const kind = value('insert-kind');
  if (kind === 'connector') return createConnector();
  if (['image', 'video', 'audio'].includes(kind)) {
    chooseMedia(kind);
    return;
  }
  return commands([{ type: 'element.insert', slideId, html: template(kind) }]);
});
$<HTMLInputElement>('media-file').onchange = () =>
  void (async () => {
    const input = $<HTMLInputElement>('media-file'),
      file = input.files?.[0],
      action = uploadAction;
    input.value = '';
    uploadAction = undefined;
    if (!file || !action) return;
    if (action.documentId !== snapshot.document.id || action.slideId !== slideId)
      throw new Error('页面已切换，请重新选择媒体');
    if (file.type && !file.type.startsWith(action.kind + '/'))
      throw new Error('文件类型与所选媒体类型不符');
    const data = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < data.length; i += 8192)
      binary += String.fromCharCode(...data.subarray(i, i + 8192));
    const asset = await api('/api/assets', {
        data: btoa(binary),
        mime: file.type || 'application/octet-stream',
      }),
      path = `media/${uuid()}.${
        file.name
          .split('.')
          .at(-1)
          ?.replace(/[^a-z0-9]/gi, '') || 'bin'
      }`,
      src = '../'.repeat(slide().sourcePath.split('/').length - 1) + path;
    await commands([
      { type: 'asset.put', path, asset },
      action.target
        ? {
            type: 'media.update',
            slideId,
            target: action.target,
            patch: action.poster ? { poster: src } : { src },
          }
        : { type: 'element.insert', slideId, html: template(action.kind, src) },
    ]);
  })().catch(error);
async function restore(
  version: number,
  after: HistoryPlan = { undo: [...undo, snapshot.version], redo: [] },
) {
  if (pending) throw new Error('请先处理待确认修改');
  await transmit({
    kind: 'restore',
    documentId: snapshot.document.id,
    request: { version, baseVersion: snapshot.version, mutationId: uuid() },
    after,
    slideId,
    selection: [...selected],
  });
}
async function undoEdit() {
  if (!undo.length) return;
  await restore(undo.at(-1)!, { undo: undo.slice(0, -1), redo: [...redo, snapshot.version] });
}
async function redoEdit() {
  if (!redo.length) return;
  await restore(redo.at(-1)!, { undo: [...undo, snapshot.version], redo: redo.slice(0, -1) });
}
on('undo', undoEdit);
on('redo', redoEdit);
on('restore', () => restore(num('history')));
on('export', () => {
  location.href = `/api/documents/${snapshot.document.id}/export?version=${snapshot.version}`;
});
$<HTMLInputElement>('import').onchange = () =>
  void (async () => {
    const file = $<HTMLInputElement>('import').files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await api('/api/import', { data });
    await init(result.document.id);
  })().catch(error);
on('overview', () => document.body.classList.toggle('overview-mode'));
function show(speaker = false) {
  window.open(
    `/show.html?document=${snapshot.document.id}&version=${snapshot.version}&slide=${slideId}${speaker ? '&speaker=1' : ''}`,
    '_blank',
  );
}
on('present', () => show());
on('speaker', () => show(true));
type QueuedEdit = {
  action: EditAction;
  documentId: string;
  slideId: string;
  ids: string[];
  focusCanvas: boolean;
};
const editQueue: QueuedEdit[] = [];
let editTimer: ReturnType<typeof setTimeout> | undefined,
  editingKeys = false;
const editWaiters = new Set<() => void>();
function whenEditsIdle(): Promise<void> {
  return editingKeys || editQueue.length
    ? new Promise((resolve) => editWaiters.add(resolve))
    : Promise.resolve();
}
function enqueueEdit(action: EditAction, focusCanvas = false) {
  if (
    !snapshot ||
    interacting ||
    !action ||
    ![
      'nudge',
      'copy',
      'cut',
      'paste',
      'duplicate',
      'delete',
      'undo',
      'redo',
      'clear',
      'select-all',
      'save',
    ].includes(action.type)
  )
    return;
  if (
    action.type === 'nudge' &&
    (!Number.isFinite(action.dx) ||
      !Number.isFinite(action.dy) ||
      Math.abs(action.dx) > 10 ||
      Math.abs(action.dy) > 10)
  )
    return;
  const item = {
    action,
    documentId: snapshot.document.id,
    slideId,
    ids: [...selected],
    focusCanvas,
  };
  const last = editQueue.at(-1);
  if (
    last?.action.type === 'nudge' &&
    action.type === 'nudge' &&
    last.documentId === item.documentId &&
    last.slideId === slideId &&
    JSON.stringify(last.ids) === JSON.stringify(item.ids)
  ) {
    last.action.dx += action.dx;
    last.action.dy += action.dy;
  } else editQueue.push(item);
  clearTimeout(editTimer);
  editTimer = setTimeout(() => void drainEdits(), action.type === 'nudge' ? 100 : 0);
}
async function drainEdits() {
  if (editingKeys) return;
  editingKeys = true;
  try {
    while (editQueue.length) {
      await whenIdle();
      await whenReady();
      const item = editQueue.shift()!;
      if (item.documentId !== snapshot.document.id || item.slideId !== slideId)
        throw new Error('页面已切换，未执行剩余快捷键操作');
      if (pending) throw new Error('有待确认修改，请先重试保存');
      const action = item.action;
      if (['nudge', 'copy', 'cut', 'delete', 'duplicate'].includes(action.type)) {
        changeSelection(item.ids);
        renderObjects();
        renderSelection();
        if (!selected.size) continue;
      }
      if (['nudge', 'delete', 'cut'].includes(action.type)) {
        const byId = new Map(objects.map((o) => [o.id, o]));
        const ancestor = (parent: string, child: string) => {
          const seen = new Set<string>();
          let next = byId.get(child)?.parent;
          while (next && !seen.has(next)) {
            if (next === parent) return true;
            seen.add(next);
            next = byId.get(next)?.parent;
          }
          return false;
        };
        if (
          objects.some(
            (o) =>
              o.locked &&
              [...selected].some((id) => id === o.id || ancestor(o.id, id) || ancestor(id, o.id)),
          )
        )
          throw new Error('选区含锁定对象，请先解锁');
      }
      if (action.type === 'nudge') {
        if (!action.dx && !action.dy) continue;
        const captured = await captureSelection();
        if (!captured.rectangles.length) {
          connectorGeometryNotice();
          continue;
        }
        if (captured.rectangles.some((r) => !r.geometry))
          throw new Error('该对象的坐标变换暂不支持键盘微调');
        await commands([
          {
            type: 'elements.arrange',
            slideId,
            action: 'translate',
            rectangles: captured.rectangles,
            dx: action.dx,
            dy: action.dy,
          },
        ]);
      } else if (action.type === 'copy' || action.type === 'cut') await copySelection(action.type);
      else if (action.type === 'paste') await pasteSelection();
      else if (action.type === 'duplicate') {
        await copySelection('copy');
        await pasteSelection();
      } else if (action.type === 'delete')
        await commands(
          [...selected].map((target) => ({ type: 'element.delete', slideId, target })),
        );
      else if (action.type === 'undo') await undoEdit();
      else if (action.type === 'redo') await redoEdit();
      else if (action.type === 'save') mark();
      else {
        changeSelection(
          action.type === 'clear'
            ? []
            : objects
                .filter(
                  (o) =>
                    o.attributes.id !== 'stage' &&
                    !['defs', 'linearGradient', 'stop', 'aside'].includes(o.tag),
                )
                .map((o) => o.id),
        );
        renderObjects();
        renderSelection();
        if (action.type === 'clear') document.body.classList.remove('overview-mode');
      }
      for (const queued of editQueue)
        if (
          queued.documentId === item.documentId &&
          queued.slideId === item.slideId &&
          JSON.stringify(queued.ids) === JSON.stringify(item.ids)
        )
          queued.ids = [...selected];
      if (item.focusCanvas) {
        await whenReady();
        frame.focus();
        send('focus', {});
      }
    }
  } catch (e) {
    editQueue.length = 0;
    error(e);
    if (!pending) mark();
  } finally {
    editingKeys = false;
    for (const done of editWaiters) done();
    editWaiters.clear();
  }
}
document.addEventListener('keydown', (e) => {
  if (
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
  )
    return;
  const action = editShortcut(e);
  if (action && !interacting) {
    e.preventDefault();
    enqueueEdit(action);
  }
});

async function init(id?: string) {
  const docs = await api('/api/documents');
  $('documents').innerHTML = docs
    .map((d: { id: string; title: string }) => `<option value="${d.id}">${esc(d.title)}</option>`)
    .join('');
  const chosen = id ?? new URLSearchParams(location.search).get('document') ?? docs[0]?.id;
  if (!chosen) {
    $('empty').textContent = '尚无讲义。请使用导入脚本导入 HTML slides，或导入已有工程包。';
    $('save-status').textContent = '等待导入';
    return;
  }
  set('documents', chosen);
  await load(chosen);
}
$<HTMLSelectElement>('documents').onchange = () =>
  void load(value('documents')).catch((e) => {
    set('documents', snapshot.document.id);
    error(e);
  });
$('save-status').insertAdjacentHTML(
  'afterend',
  '<button id="retry-save" hidden>重试保存</button><button id="reload-head" hidden>放弃待确认批次并重载</button>',
);
$('save-status').insertAdjacentHTML(
  'afterend',
  '<details id="recovery-panel" hidden><summary>待恢复修改</summary><div id="recovery-list"></div></details>',
);
function refreshRecoveries() {
  const panel = $('recovery-panel');
  if (!panel) return;
  try {
    const { entries, invalid } = journal.list();
    panel.hidden = entries.length + invalid.length === 0;
    panel.querySelector('summary')!.textContent =
      `待恢复修改（${entries.length + invalid.length}）`;
    const list = $('recovery-list');
    list.replaceChildren();
    for (const { key, entry } of entries) {
      const row = document.createElement('div');
      row.className = 'recovery-row';
      row.dataset.recovery = key;
      const label = document.createElement('p');
      label.textContent = `${entry.title} · ${entry.task.kind === 'restore' ? '恢复版本' : '编辑修改'} · v${entry.task.request.baseVersion} · ${new Date(entry.createdAt).toLocaleString()}`;
      row.append(label);
      const use = document.createElement('button');
      const own = pending && pendingRecordKey(pending) === key;
      use.textContent = own ? '当前待确认修改' : '继续恢复';
      use.disabled = !!own || busy || !!pending;
      use.dataset.recover = key;
      use.onclick = () =>
        void Promise.resolve()
          .then(async () => {
            if (busy || pending) throw new Error('请先处理当前待确认修改');
            const selected = journal.adopt(key);
            await load(selected.task.documentId);
          })
          .catch(error);
      const download = document.createElement('button');
      download.textContent = '导出修改';
      download.dataset.exportRecovery = key;
      download.onclick = () => downloadRecovery(JSON.stringify(entry, null, 2));
      row.append(use, download);
      list.append(row);
    }
    for (const item of invalid) {
      const row = document.createElement('div');
      row.className = 'recovery-row';
      const label = document.createElement('p');
      label.textContent = '恢复记录无法读取，原始数据仍保留在本机';
      const download = document.createElement('button');
      download.textContent = '导出原始记录';
      download.onclick = () => downloadRecovery(item.raw);
      row.append(label, download);
      list.append(row);
    }
  } catch (e) {
    error(e);
  }
}
$('restore').insertAdjacentHTML(
  'afterend',
  '<label class="button">导入待恢复修改<input id="import-recovery" type="file" accept=".json,application/json" hidden></label>',
);
$<HTMLInputElement>('import-recovery').onchange = () =>
  void Promise.resolve()
    .then(async () => {
      const input = $<HTMLInputElement>('import-recovery'),
        file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) throw new Error('恢复文件超过当前 50 MB 读取上限');
      journal.importFile(await file.text());
      refreshRecoveries();
      ($('recovery-panel') as HTMLDetailsElement).open = true;
    })
    .catch(error);
function downloadRecovery(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'notale-recovery.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document
  .querySelector('[data-panel="format"]')!
  .insertAdjacentHTML(
    'beforeend',
    `<fieldset id="media-panel" hidden><legend>媒体</legend><div class="inline"><button id="replace-media">替换文件</button><button id="replace-poster">替换视频封面</button></div><label>图片说明<input id="media-alt"></label><label>取景<select id="media-fit"><option value="contain">完整适应</option><option value="cover">裁切填充</option><option value="fill">拉伸</option><option value="none">原始尺寸</option><option value="scale-down">仅缩小</option></select></label><div class="field-grid"><label>水平焦点 %<input id="media-x" type="number" min="0" max="100" value="50"></label><label>垂直焦点 %<input id="media-y" type="number" min="0" max="100" value="50"></label>${['top', 'right', 'bottom', 'left'].map((key, i) => `<label>裁去${['上', '右', '下', '左'][i]}边 %<input id="crop-${key}" type="number" min="0" max="99" value="0"></label>`).join('')}</div><div id="media-playback"><div class="field-grid"><label>开始秒<input id="media-start" type="number" min="0" step=".1"></label><label>结束秒（空=片尾）<input id="media-end" type="number" min="0" step=".1"></label><label>音量<input id="media-volume" type="number" min="0" max="1" step=".1"></label><label>速度<input id="media-rate" type="number" min=".25" max="4" step=".25"></label><label>开始步骤（空=手动）<input id="media-step" type="number" min="0"></label></div><label><input id="media-muted" type="checkbox">静音</label><label><input id="media-loop" type="checkbox">循环选定区间</label><label><input id="media-controls" type="checkbox">显示播放控件</label></div><button id="save-media">保存媒体设置</button><p id="media-notice" role="status"></p></fieldset>`,
  );
function fillMedia(o: ObjectInfo) {
  const m = mediaSettingsSchema.parse(
    o.attributes['data-notale-media']
      ? JSON.parse(o.attributes['data-notale-media'])
      : {
          fit: o.style['object-fit'] ?? 'contain',
          controls: o.tag === 'img' || o.attributes.controls !== undefined,
          muted: o.attributes.muted !== undefined,
          loop: o.attributes.loop !== undefined,
        },
  );
  set('media-alt', o.attributes.alt ?? '');
  set('media-fit', m.fit);
  set('media-x', m.positionX);
  set('media-y', m.positionY);
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) set('crop-' + edge, m.crop[edge]);
  set('media-start', m.startAt);
  set('media-end', m.endAt);
  set('media-volume', m.volume);
  set('media-rate', m.rate);
  set('media-step', m.startStep);
  for (const key of ['muted', 'loop', 'controls'] as const)
    $<HTMLInputElement>('media-' + key).checked = m[key];
  $('media-playback').hidden = o.tag === 'img';
  $('replace-poster').hidden = o.tag !== 'video';
}
on('replace-media', () => {
  const o = current();
  chooseMedia(o.tag === 'img' ? 'image' : o.tag, o.id);
});
on('replace-poster', () => chooseMedia('image', current().id, true));
on('save-media', () =>
  commands([
    {
      type: 'media.update',
      slideId,
      target: current().id,
      patch: {
        alt: value('media-alt'),
        settings: {
          fit: value('media-fit'),
          positionX: num('media-x'),
          positionY: num('media-y'),
          crop: Object.fromEntries(
            ['top', 'right', 'bottom', 'left'].map((key) => [key, num('crop-' + key)]),
          ),
          startAt: num('media-start'),
          endAt: value('media-end') ? num('media-end') : null,
          volume: num('media-volume'),
          rate: num('media-rate'),
          startStep: value('media-step') ? num('media-step') : null,
          muted: $<HTMLInputElement>('media-muted').checked,
          loop: $<HTMLInputElement>('media-loop').checked,
          controls: $<HTMLInputElement>('media-controls').checked,
        },
      },
    },
  ]),
);
$('animations').insertAdjacentHTML(
  'beforebegin',
  '<label>原生 steps 映射<input id="step-map" value="[]" placeholder="例如 [0,0,1,2]，[] 沿用原顺序"></label><button id="save-step-map">保存步骤编排</button>',
);
$('apply-advanced').insertAdjacentHTML(
  'afterend',
  '<label>富文本 HTML<textarea id="rich-text" rows="3"></textarea></label><button id="apply-rich-text">应用富文本</button><label>图表数据<textarea id="chart-data" rows="4"></textarea></label><button id="apply-chart">更新图表数据</button>',
);
$('duplicate-object').insertAdjacentHTML(
  'afterend',
  '<button id="copy-objects">复制</button><button id="cut-objects">剪切</button><button id="paste-objects">粘贴对象</button>',
);
on('copy-objects', () => copySelection('copy'));
on('cut-objects', () => copySelection('cut'));
on('paste-objects', pasteSelection);
$('apply-format').insertAdjacentHTML(
  'afterend',
  '<label>对齐基准<select id="arrange-reference"><option value="selection">选区</option><option value="slide">页面</option></select></label><div id="arrange-tools" class="inline"></div><div class="field-grid"><label>组旋转角度<input id="group-angle" type="number" value="15"></label><label>组缩放倍数<input id="group-factor" type="number" value="1.1"></label></div><button id="rotate-group">整体旋转</button><button id="scale-group">整体缩放</button>',
);
async function arrange(action: string) {
  const capture = await captureSelection();
  if (!capture.rectangles.length) {
    connectorGeometryNotice();
    return;
  }
  return commands([
    {
      type: 'elements.arrange',
      slideId,
      action,
      rectangles: capture.rectangles,
      reference: value('arrange-reference'),
      angle: num('group-angle'),
      factor: num('group-factor'),
    },
  ]);
}
for (const [action, label] of Object.entries({
  left: '左对齐',
  center: '水平居中',
  right: '右对齐',
  top: '顶部对齐',
  middle: '垂直居中',
  bottom: '底部对齐',
  'distribute-x': '水平分布',
  'distribute-y': '垂直分布',
})) {
  $('arrange-tools').insertAdjacentHTML(
    'beforeend',
    `<button id="arrange-${action}">${label}</button>`,
  );
  on(`arrange-${action}`, () => arrange(action));
}
on('rotate-group', () => arrange('rotate'));
on('scale-group', () => arrange('scale'));
document
  .querySelector('[data-panel="document"]')!
  .insertAdjacentHTML(
    'beforeend',
    '<hr><label>共享布局<select id="shared-layout"></select></label><div class="inline"><button id="apply-layout">应用本页</button><button id="apply-layout-all">应用全部页</button><button id="detach-layout">脱离母版</button></div><label>布局名称<input id="layout-name" value="页脚布局"></label><label>布局对象 HTML<textarea id="layout-html" rows="4"></textarea></label><label>布局 CSS<textarea id="layout-css" rows="3"></textarea></label><div class="inline"><button id="new-layout">新建页脚母版</button><button id="save-layout">更新母版</button><button id="edit-layout-canvas">画布编辑母版</button><button id="publish-layout-canvas">发布画布修改</button></div>',
  );
function fillLayout() {
  const layout = snapshot.document.layouts.find((l) => l.id === value('shared-layout'));
  set('layout-name', layout?.name ?? '页脚布局');
  set(
    'layout-html',
    layout?.html ??
      '<footer style="position:absolute;left:60px;right:60px;bottom:28px;font-size:20px;color:#466ddb;display:flex;justify-content:space-between"><span data-notale-field="title"></span><span data-notale-field="slide-number"></span></footer>',
  );
  set('layout-css', layout?.css ?? '');
}
$<HTMLSelectElement>('shared-layout').onchange = fillLayout;
on('new-layout', () =>
  commands([
    {
      type: 'layout.set',
      layout: {
        id: uuid(),
        name: value('layout-name'),
        html: value('layout-html'),
        css: value('layout-css'),
      },
    },
  ]),
);
on('save-layout', () => {
  const layout = snapshot.document.layouts.find((l) => l.id === value('shared-layout'));
  if (!layout) throw new Error('请先选择一个共享布局');
  return commands([
    {
      type: 'layout.set',
      layout: {
        ...layout,
        name: value('layout-name'),
        html: value('layout-html'),
        css: value('layout-css'),
      },
    },
  ]);
});
on('apply-layout', () =>
  commands([
    { type: 'slide.update', slideId, patch: { layoutId: value('shared-layout') || null } },
  ]),
);
on('apply-layout-all', () =>
  commands(
    snapshot.document.slides
      .filter((s) => !s.layoutSourceId)
      .map((s) => ({
        type: 'slide.update',
        slideId: s.id,
        patch: { layoutId: value('shared-layout') || null },
      })),
  ),
);
on('detach-layout', () => commands([{ type: 'layout.detach', slideId }]));
on('edit-layout-canvas', async () => {
  const id = value('shared-layout');
  if (!id) throw new Error('请先选择一个共享布局');
  const existing = snapshot.document.slides.find((page) => page.layoutSourceId === id),
    newId = existing?.id ?? uuid();
  if (!existing) await commands([{ type: 'layout.checkout', id, newId }]);
  await showPage(newId);
});
on('publish-layout-canvas', () => commands([{ type: 'layout.publish', slideId }]));

$('chart-data').insertAdjacentHTML(
  'beforebegin',
  '<label>图表类型<select id="chart-kind"><option value="bar">柱状图</option><option value="line">折线图</option><option value="area">面积图</option><option value="pie">饼图</option><option value="doughnut">环形图</option></select></label>',
);
$('apply-chart').insertAdjacentHTML(
  'beforebegin',
  `
  <div id="chart-style-controls">
    <label>图表标题<input id="chart-title"></label>
    <label>系列配色（逗号分隔）<input id="chart-colors"></label>
    <div class="field-grid">
      <label>字号<input id="chart-fontSize" type="number" min="10" max="24" value="16"></label>
      <label>数值小数位<input id="chart-valueDecimals" type="number" min="0" max="6" value="0"></label>
      <label>文字颜色<input id="chart-textColor" value="#273247"></label>
      <label>背景颜色<input id="chart-background" value="#ffffff"></label>
      <label>网格颜色<input id="chart-gridColor" value="#dce3ed"></label>
      <label>分类标签方向<select id="chart-labelAngle"><option value="0">水平换行</option><option value="-45">倾斜 45°</option><option value="-90">垂直</option></select></label>
      <label>标签间隔（0 为自动）<input id="chart-labelEvery" type="number" min="0" max="100" value="0"></label>
      <label>线宽<input id="chart-lineWidth" type="number" min="0.5" max="12" step="0.5" value="3"></label>
      <label>数据点半径<input id="chart-pointRadius" type="number" min="0" max="12" value="4"></label>
    </div>
    <label><input id="chart-showValues" type="checkbox" checked>显示可容纳的数值标签</label>
    <label><input id="chart-showLegend" type="checkbox" checked>显示图例</label>
    <label><input id="chart-showGrid" type="checkbox" checked>显示坐标网格</label>
    <button id="apply-chart-style">应用图表样式</button>
  </div>`,
);
on('apply-chart-style', () => {
  const o = current();
  if (!o.attributes['data-notale-chart']) throw new Error('请选择插入的图表 SVG 对象');
  const data = {
    ...JSON.parse(value('chart-data')),
    kind: value('chart-kind'),
    title: value('chart-title'),
    colors: value('chart-colors')
      .split(',')
      .map((c) => c.trim()),
  };
  for (const key of [
    'fontSize',
    'valueDecimals',
    'labelEvery',
    'labelAngle',
    'lineWidth',
    'pointRadius',
  ])
    data[key] = num(`chart-${key}`);
  for (const key of ['textColor', 'background', 'gridColor']) data[key] = value(`chart-${key}`);
  for (const key of ['showValues', 'showLegend', 'showGrid'])
    data[key] = $<HTMLInputElement>(`chart-${key}`).checked;
  return commands([{ type: 'chart.update', slideId, target: o.id, data }]);
});
$('apply-chart').insertAdjacentHTML(
  'afterend',
  '<hr><div class="field-grid"><label>行（从 1 开始）<input id="table-row" type="number" min="1" value="2"></label><label>列（从 1 开始）<input id="table-column" type="number" min="1" value="1"></label><label>合并行数<input id="table-rows" type="number" min="1" value="1"></label><label>合并列数<input id="table-columns" type="number" min="1" value="2"></label></div><div class="inline" id="table-tools"></div>',
);
function selectedTable() {
  let o = current();
  while (o.tag !== 'table' && o.parent) {
    const parent = objects.find((p) => p.id === o.parent);
    if (!parent) break;
    o = parent;
  }
  if (o.tag !== 'table') throw new Error('请选择表格或单元格');
  return o;
}
for (const [action, label] of Object.entries({
  'insert-row': '插入行',
  'delete-row': '删除行',
  'insert-column': '插入列',
  'delete-column': '删除列',
  merge: '合并单元格',
  unmerge: '取消合并',
})) {
  $('table-tools').insertAdjacentHTML(
    'beforeend',
    `<button id="table-${action}">${label}</button>`,
  );
  on(`table-${action}`, () =>
    commands([
      {
        type: 'table.edit',
        slideId,
        target: selectedTable().id,
        action,
        row: num('table-row') - 1,
        column: num('table-column') - 1,
        rowSpan: num('table-rows'),
        colSpan: num('table-columns'),
      },
    ]),
  );
}
on('save-step-map', () =>
  commands([{ type: 'slide.update', slideId, patch: { stepMap: JSON.parse(value('step-map')) } }]),
);
on('apply-rich-text', () =>
  commands([
    {
      type: 'element.patch',
      slideId,
      target: current().id,
      patch: { richText: value('rich-text') },
    },
  ]),
);
on('apply-chart', () => {
  const o = current();
  if (!o.attributes['data-notale-chart']) throw new Error('请选择插入的图表 SVG 对象');
  const data = { ...JSON.parse(value('chart-data')), kind: value('chart-kind') };
  return commands([{ type: 'chart.update', slideId, target: o.id, data }]);
});
on('retry-save', async () => {
  if (pending) await transmit(pending);
});
on('reload-head', async () => {
  if (busy) throw new Error('正在保存，请等待当前请求结束');
  if (pending) journal.clear(pending);
  pending = undefined;
  await load(snapshot.document.id);
});
try {
  migratedLegacy = journal.migrateLegacy();
} catch (e) {
  error(e);
}

window.addEventListener('storage', (event) => {
  if (isJournalKey(event.key)) refreshRecoveries();
});
window.addEventListener('beforeunload', (e) => {
  if (pending || busy || editingKeys || editQueue.length) {
    e.preventDefault();
    e.returnValue = '';
  }
});
$<HTMLInputElement>('text-reflow').onchange = () =>
  send('resize-mode', { reflow: $<HTMLInputElement>('text-reflow').checked });
const authoredComponents = createComponentInspector({
  slide,
  document: () => snapshot.document,
  capture: captureSelection,
  objects: () => objects,
  selected: () => [...selected],
  choose: (id) => {
    changeSelection([id]);
    renderObjects();
    renderSelection();
  },
  openPage: showPage,
  commands,
  preview: (id, state) => send('component-select', { id, state, animate: true }),
  error,
});
const teachingStepsUI = createStepInspector({
  slide,
  step: () => step,
  nativeMax: () => nativeMax,
  ready: () => canvasReady,
  preview: (index, play) => {
    if (play) mode(true);
    setStep(index, true, index);
  },
  commands,
  error,
});
const layoutValuesUI = createLayoutValues({
  slide,
  document: () => snapshot.document,
  selected: () => [...selected],
  commands,
  uploadImage: async (file) => {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const asset = await api('/api/assets', { data: btoa(binary), mime: file.type });
    return {
      asset,
      path: `media/${uuid()}.${
        file.name
          .split('.')
          .at(-1)
          ?.replace(/[^a-z0-9]/gi, '') || 'img'
      }`,
    };
  },
  error,
});
const initialized = init();
void initialized.catch(error);
// A small stable surface for host integration and browser acceptance tests.
Object.assign(window, {
  NotaleWorkbench: {
    commands,
    getSnapshot: () => snapshot,
    getPending: () => (pending ? structuredClone(pending) : undefined),
    select: (id: string) => {
      changeSelection([id]);
      renderObjects();
      renderSelection();
    },
    getObjects: () => objects,
    getSelection: () => [...selected],
    whenEditsIdle,
    selectMany: (ids: string[]) => {
      changeSelection(ids);
      renderObjects();
      renderSelection();
    },
    copySelection,
    pasteSelection,
    captureSelection,
    whenReady,
    showSlide: showPage,
  },
});

async function createConnector() {
  const ids = [...selected].filter((id) => !(slide().connectors ?? []).some((c) => c.id === id));
  if (ids.length > 2) throw new Error('请选择最多两个需要连接的对象');
  const id = uuid();
  await commands([
    {
      type: 'connector.set',
      slideId,
      connector: connectorSchema.parse({
        id,
        start: ids[0]
          ? { target: ids[0] }
          : { point: { x: snapshot.document.width * 0.35, y: snapshot.document.height * 0.5 } },
        end: ids[1]
          ? { target: ids[1] }
          : { point: { x: snapshot.document.width * 0.65, y: snapshot.document.height * 0.5 } },
      }),
    },
  ]);
  changeSelection([id]);
  renderSelection();
}
function renderConnector() {
  const c =
    selected.size === 1 ? (slide().connectors ?? []).find((c) => selected.has(c.id)) : undefined;
  $('connector-panel').hidden = !c;
  if (!c) return;
  const options = objects
    .filter(
      (o) => o.attributes.id !== 'stage' && !(slide().connectors ?? []).some((c) => c.id === o.id),
    )
    .map(
      (o) =>
        `<option value="${o.id}">${esc(o.tag + ' ' + (o.text.trim() || o.attributes.id || '').slice(0, 28))}</option>`,
    )
    .join('');
  for (const side of ['start', 'end'] as const) {
    $('connector-' + side).innerHTML = '<option value="">自由端点</option>' + options;
    set('connector-' + side, c[side].target ?? '');
    set('connector-' + side + '-x', c[side].point?.x ?? snapshot.document.width / 2);
    set('connector-' + side + '-y', c[side].point?.y ?? snapshot.document.height / 2);
    connectorEndpointFields(side);
    set('connector-' + side + '-anchor', c[side].anchor);
    $<HTMLInputElement>('connector-' + side + '-arrow').checked =
      side === 'start' ? c.startArrow : c.endArrow;
  }
  set('connector-kind', c.kind);
  set('connector-color', c.color);
  set('connector-width', c.width);
  set('connector-dash', c.dash);
}
function connectorEndpointFields(side: 'start' | 'end') {
  const free = !value('connector-' + side);
  $('connector-' + side + '-point').hidden = !free;
  $<HTMLSelectElement>('connector-' + side + '-anchor').disabled = free;
}
for (const side of ['start', 'end'] as const)
  $('connector-' + side).addEventListener('change', () => connectorEndpointFields(side));
function connectorEndpointValue(side: 'start' | 'end') {
  const target = value('connector-' + side);
  return target
    ? { target, anchor: value('connector-' + side + '-anchor') }
    : { point: { x: num('connector-' + side + '-x'), y: num('connector-' + side + '-y') } };
}
on('save-connector', () => {
  const c = (slide().connectors ?? []).find((c) => selected.has(c.id));
  if (!c) throw new Error('请选择连接线');
  return commands([
    {
      type: 'connector.set',
      slideId,
      connector: {
        ...c,
        start: connectorEndpointValue('start'),
        end: connectorEndpointValue('end'),
        kind: value('connector-kind'),
        color: value('connector-color'),
        width: num('connector-width'),
        dash: value('connector-dash'),
        startArrow: $<HTMLInputElement>('connector-start-arrow').checked,
        endArrow: $<HTMLInputElement>('connector-end-arrow').checked,
      },
    },
  ]);
});

function connectorGeometryNotice() {
  $('toast').textContent = '连接线会跟随端点，请移动或调整端点对象';
  $('toast').hidden = false;
  setTimeout(() => ($('toast').hidden = true), 5000);
}
