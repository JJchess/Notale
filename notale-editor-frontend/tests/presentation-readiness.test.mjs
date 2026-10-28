import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual controller with deterministic browser boundaries. Real
// iframe documents and layout are covered by notale-presentation-recovery.spec.ts.
const controllerCode = ts.transpileModule(readFileSync(new URL('../src/presentation/controller.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function clock() {
  let now = 0, serial = 0;
  const tasks = new Map();
  const add = (fn, delay = 0, interval = 0) => {
    const id = ++serial;
    tasks.set(id, { fn, at: now + delay, interval });
    return id;
  };
  return {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, delay) => add(fn, delay), clearTimeout: id => tasks.delete(id),
    setInterval: (fn, delay) => add(fn, delay, delay), clearInterval: id => tasks.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, task] = next;
        now = task.at;
        if (task.interval) task.at += task.interval;
        else tasks.delete(id);
        task.fn();
      }
      now = end;
    },
    pending: () => tasks.size,
  };
}

class Frame {
  dataset = {};
  attributes = new Map();
  listeners = new Map();
  messages = [];
  contentWindow = { postMessage: message => this.messages.push(message) };
  get src() { return this.attributes.get('src') ?? ''; }
  set src(value) { this.attributes.set('src', value); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  replaceWith(frame) { this.replacedBy = frame; }
  remove() { this.removed = true; }
}

function fixture({ role = 'controlling', fetch = async () => { throw Error('Unexpected fetch'); } } = {}) {
  const timers = clock(), busMessages = [], navigations = [], stored = new Map();
  const exports = {};
  const requires = {
    '../i18n/store': { localeStore: { subscribe: () => () => {}, getSnapshot: () => 'zh-CN' } },
    '../keyboard': { isComposingKey: () => false },
    './latest-state': { latestPresentationState: state => state },
    'reveal.js': class {}, './upcoming': { upcoming: () => undefined },
    '@notale/editor/browser': {
      maxStep: slide => Math.max(0, (slide.steps?.length ?? 1) - 1), stepInterval: () => 0,
      validPresentationState: () => true, mergePresentationRuntime: (before, patch) => ({ ...before, ...patch }),
    },
    '../canvas/resource-lease': { trackPreviewLease: () => ({ stop() {} }) },
  };
  const location = {
    search: '?document=document&version=3&session=session' + (role === 'audience' ? '&audience=1' : ''),
    assign: url => navigations.push(url), replace: url => navigations.push(url),
  };
  vm.runInNewContext(controllerCode, {
    exports, require: name => { assert.ok(name in requires, `Unexpected import: ${name}`); return requires[name]; },
    crypto: webcrypto, URL, URLSearchParams, AbortController, location, fetch,
    history: { replaceState() {} },
    document: { createElement: () => new Frame() },
    window: { close: () => navigations.push('close') },
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    BroadcastChannel: class { postMessage(message) { busMessages.push(message); } close() {} },
    ...timers,
  });
  const controller = new exports.PresentationController();
  const slides = ['first', 'middle', 'last'].map(id => ({ id, name: id, steps: [{}, {}, {}] }));
  const state = {
    protocol: 2, documentId: 'document', version: 3, session: 'session', term: 2, sequence: 0,
    slideId: 'middle', step: 2, max: 2, ended: false, blank: false,
    timer: { elapsed: 0, runningSince: 0 }, autoPaused: false, viewport: { scale: 1, x: 0, y: 0 },
    annotations: { middle: '<path />' }, runtime: { middle: { step: 2, controls: { answer: 'kept' } } },
  };
  controller.view = { ...controller.getSnapshot(), initializing: false, control: role, slides, state, snapshot: { document: { presentation: {} } } };
  controller.channel = 'channel';
  controller.engineReady = true;
  let index = 1;
  controller.engine = { getIndices: () => ({ h: index }), slide: value => { index = value; }, destroy() {} };
  for (const slide of slides) {
    controller.urls.set(slide.id, `https://content.test/${slide.id}`);
    const frame = controller.createFrame(slide);
    controller.frames.set(slide.id, frame);
    controller.resident.set(slide.id, frame);
    controller.startFrame(frame);
  }
  const ready = (frame = controller.frame(), { runtimeId = 'runtime', max = 2, origin = 'https://content.test', channel = 'channel' } = {}) => controller.message({
    source: frame.contentWindow, origin, data: { source: 'notale-slide', channel, type: 'ready', data: { slideId: frame.dataset.slideId, runtimeId, max } },
  });
  return { controller, ready, timers, stored, navigations, busMessages, dispose: () => controller.destroy() };
}

test('cached activation and a repeated ready message restore the current readiness even when Reveal did not move', () => {
  const f = fixture();
  try {
    f.ready();
    f.controller.view.ready = false;
    f.controller.synchronizePosition(false);
    assert.equal(f.controller.getSnapshot().ready, true);
    f.controller.view.ready = false;
    f.ready();
    assert.equal(f.controller.getSnapshot().ready, true);
    assert.equal(f.controller.getSnapshot().state.step, 2);
  } finally { f.dispose(); }
});

test('an unready page times out at 20 seconds, probes stay bounded, and a late valid handshake recovers', () => {
  const f = fixture();
  try {
    const frame = f.controller.frame();
    f.controller.activateFrame();
    f.ready(frame, { origin: 'https://wrong.test' });
    f.ready(frame, { channel: 'stale-channel' });
    assert.equal(f.controller.getSnapshot().ready, false);
    f.timers.advance(19_999);
    assert.equal(f.controller.getSnapshot().loadError, '');
    f.timers.advance(1);
    assert.match(f.controller.getSnapshot().loadError, /加载超时/);
    assert.equal(f.controller.getSnapshot().ready, false);
    const probes = frame.messages.filter(message => message.type === 'state').length;
    f.timers.advance(60_000);
    assert.equal(frame.messages.filter(message => message.type === 'state').length, probes);
    assert.ok(probes <= 20);
    f.ready();
    assert.equal(f.controller.getSnapshot().ready, true);
    assert.equal(f.controller.getSnapshot().loadError, '');
    assert.equal(f.controller.getSnapshot().state.runtime.middle.controls.answer, 'kept');
    assert.equal(f.controller.getSnapshot().state.annotations.middle, '<path />');
  } finally { f.dispose(); }
});

test('retry replaces only the failed frame, ignores repeated clicks and rejects the removed window', () => {
  const f = fixture();
  try {
    const first = f.controller.frames.get('first'), old = f.controller.frame(), last = f.controller.frames.get('last');
    f.controller.activateFrame();
    f.timers.advance(20_000);
    f.controller.retry();
    const replacement = f.controller.frame();
    assert.notEqual(replacement, old);
    assert.equal(f.controller.frames.get('first'), first);
    assert.equal(f.controller.frames.get('last'), last);
    f.controller.retry();
    assert.equal(f.controller.frame(), replacement);
    f.ready(old);
    assert.equal(f.controller.getSnapshot().ready, false);
    f.ready(replacement, { max: Infinity });
    assert.equal(f.controller.getSnapshot().ready, true);
    assert.equal(f.controller.getSnapshot().state.max, 2);
    assert.equal(f.controller.getSnapshot().state.step, 2);
    assert.equal(f.controller.getSnapshot().state.runtime.middle.controls.answer, 'kept');
    assert.equal(f.controller.getSnapshot().state.annotations.middle, '<path />');
  } finally { f.dispose(); }
});

test('queued navigation rechecks the active page and retry invalidates an earlier deferred navigation', async () => {
  const f = fixture();
  try {
    f.controller.flush = () => Promise.resolve();
    f.controller.view.state = { ...f.controller.view.state, slideId: 'first', step: 1 };
    f.ready(f.controller.frame());
    f.controller.next();
    f.controller.next();
    f.controller.next();
    await f.controller.transition;
    assert.equal(f.controller.getSnapshot().state.slideId, 'last');
    assert.equal(f.controller.getSnapshot().state.step, 0);
    f.controller.prev();
    await f.controller.transition;
    assert.equal(f.controller.getSnapshot().state.slideId, 'middle');
    f.controller.activateFrame();
    f.timers.advance(20_000);
    let release;
    f.controller.flush = () => new Promise(resolve => { release = resolve; });
    f.controller.next();
    await Promise.resolve();
    assert.equal(typeof release, 'function');
    f.controller.retry();
    release();
    await f.controller.transition;
    assert.equal(f.controller.getSnapshot().state.slideId, 'middle');
  } finally { f.dispose(); }
});

test('following and audience retries stay local and never change the controller term or publish state', () => {
  for (const role of ['following', 'audience']) {
    const f = fixture({ role });
    try {
      f.controller.activateFrame();
      f.timers.advance(20_000);
      f.controller.retry();
      f.ready();
      assert.equal(f.controller.getSnapshot().control, role);
      assert.equal(f.controller.getSnapshot().state.term, 2);
      assert.equal(f.controller.getSnapshot().ready, true);
      assert.equal(f.busMessages.some(message => ['takeover', 'state'].includes(message.kind)), false);
      assert.equal(f.stored.size, 0);
    } finally { f.dispose(); }
  }
});

test('the eight-frame cache reuses retained pages and gives evicted pages a new message identity', () => {
  const f = fixture();
  try {
    const slides = [...f.controller.getSnapshot().slides, ...Array.from({ length: 7 }, (_, i) => ({ id: `extra-${i}`, name: `Extra ${i}`, steps: [{}] }))];
    f.controller.view = { ...f.controller.getSnapshot(), slides };
    for (const page of slides.slice(3)) {
      f.controller.urls.set(page.id, `https://content.test/${page.id}`);
      f.controller.frames.set(page.id, f.controller.createFrame(page));
    }
    const oldFirst = f.controller.frames.get('first');
    f.controller.move('first', 0);
    f.ready(oldFirst);
    for (const page of slides) {
      f.controller.move(page.id, 0);
      assert.ok(f.controller.resident.size <= 8);
    }
    const retained = f.controller.frame();
    f.controller.move(slides.at(-2).id, 0);
    f.controller.move(slides.at(-1).id, 0);
    assert.equal(f.controller.frame(), retained);
    assert.notEqual(f.controller.frames.get('first'), oldFirst);
    f.controller.move('first', 0);
    f.ready(oldFirst);
    assert.equal(f.controller.getSnapshot().ready, false);
    f.ready();
    assert.equal(f.controller.getSnapshot().ready, true);
  } finally { f.dispose(); }
});

test('initial JSON parsing shares the 30 second deadline and exit is safe before a snapshot exists', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  try {
    f.controller.initialDeadline = 30_000;
    let settled = false;
    const result = f.controller.json('/document').then(() => { settled = true; }, error => { settled = true; return error.message; });
    await Promise.resolve();
    f.timers.advance(29_999);
    await Promise.resolve();
    assert.equal(settled, false);
    f.timers.advance(1);
    assert.equal(await result, '放映初始化超时，请重试');
    assert.equal(f.controller.request.signal.aborted, true);
    f.controller.view = { ...f.controller.getSnapshot(), state: undefined, control: 'starting' };
    f.controller.end();
    assert.equal(f.navigations.at(-1), '/?document=document');
    assert.equal(f.controller.destroyed, true);
    assert.equal(f.timers.pending(), 0);
  } finally { f.dispose(); }
});
