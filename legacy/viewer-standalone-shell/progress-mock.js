// progress-mock.js — 仅开发用：从真实样例 doc 派生一段带时间戳的生成事件流，并在时钟上回放。
//
//   buildMockRun(doc, opts) → { events:[{t, type, ...}], duration }
//   new Player(view, events, { speed, onTick })
//
// 事件 schema 与 legacy agent.mjs / plan.mjs / live.mjs 完全一致；接回真实管线时丢弃本文件即可。
// 关键：整段 run 完全由 (doc, opts) 决定 → 可确定性重建 → Player 能任意 seek/scrub。

// 确定性 PRNG（mulberry32），避免 Math.random（回放需可复现）
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FANOUT_CONC = 4; // 与 orchestrator.py _CONC 对齐

// 样例 doc 的 block 没有 id 字段 → 合成稳定 id（只要 plan-block/block/docUpdated 三处一致即可）
function normalizeScenes(doc) {
  return (doc.scenes || []).map(s => ({
    id: s.id, kind: s.kind, headline: s.headline, eyebrow: s.eyebrow,
    blocks: (s.blocks || []).map((b, j) => ({ id: b.id || `${s.id}#b${j}`, type: b.type, intent: b.intent })),
  }));
}

// opts: { seed=7, failIndices=Set<number>, planOnly=false }
export function buildMockRun(doc, opts = {}) {
  const seed = opts.seed ?? 7;
  const failIndices = opts.failIndices instanceof Set ? opts.failIndices : new Set(opts.failIndices || []);
  const planOnly = !!opts.planOnly;
  const rnd = rng(seed);
  const ev = [];
  // 注意：type 放最后，避免 extra 里的字段覆盖事件类型
  const push = (t, type, extra) => ev.push({ ...extra, t: Math.round(t), type });

  const scenes = normalizeScenes(doc);
  // 扁平化出全局 block 序（fanout 生成顺序）
  const blocks = [];
  scenes.forEach(s => s.blocks.forEach(b => blocks.push({ sceneId: s.id, id: b.id, type: b.type })));

  let t = 0;

  // ---------- ① 规划：scene / block 逐个流式产出（方块从左往右长出来）----------
  push(t, 'stage', { stage: 'plan', status: 'start' });
  t += 400;
  scenes.forEach(s => {
    push(t, 'plan-scene', { scene: { id: s.id, kind: s.kind, headline: s.headline, eyebrow: s.eyebrow } });
    t += 130 + rnd() * 90;
    (s.blocks || []).forEach(b => {
      push(t, 'plan-block', { sceneId: s.id, block: { id: b.id, type: b.type, intent: b.intent } });
      t += 80 + rnd() * 70;
    });
  });
  const planDur = t;
  push(t, 'stage', { stage: 'plan', status: 'done', durationS: +(planDur / 1000).toFixed(1) });
  t += 60;
  // 骨架（权威 doc）
  push(t, 'skeleton', { doc: { scenes: scenes.map(s => ({ id: s.id, kind: s.kind, headline: s.headline, eyebrow: s.eyebrow, blocks: (s.blocks || []).map(b => ({ id: b.id, type: b.type })) })) } });
  t += 120;

  if (planOnly) {
    push(t, 'done', { totalS: +(t / 1000).toFixed(1), calls: scenes.length, errors: 0, dropped: 0, planOnly: true });
    return { events: ev, duration: t };
  }

  // ---------- ② 逐块生成（fanout，4 路并发）----------
  const fanoutStart = t;
  push(fanoutStart, 'stage', { stage: 'fanout', status: 'start', total: blocks.length });
  const lanes = new Array(FANOUT_CONC).fill(fanoutStart);
  let fanoutEnd = fanoutStart;
  blocks.forEach((b, i) => {
    const lane = lanes.indexOf(Math.min(...lanes));
    const start = lanes[lane];
    const gen = 480 + rnd() * 780;
    push(start, 'block', { blockId: b.id, sceneId: b.sceneId, status: 'active' });
    let endT;
    if (failIndices.has(i)) {
      // 失败 → 变红 → 重修 → 变绿
      const failAt = start + gen;
      push(failAt, 'block', { blockId: b.id, sceneId: b.sceneId, status: 'err', err: '结构校验未通过（缺字段）' });
      const repair = 500 + rnd() * 700;
      endT = failAt + repair;
      push(endT, 'docUpdated', { blockId: b.id, sceneId: b.sceneId, status: 'done' });
    } else {
      endT = start + gen;
      push(endT, 'docUpdated', { blockId: b.id, sceneId: b.sceneId, status: 'done' });
    }
    lanes[lane] = endT;
    fanoutEnd = Math.max(fanoutEnd, endT);
  });
  push(fanoutEnd, 'stage', { stage: 'fanout', status: 'done', durationS: +((fanoutEnd - fanoutStart) / 1000).toFixed(1) });
  t = fanoutEnd + 80;

  // ---------- ③ 组装：每页 scene 方块依次变绿 ----------
  push(t, 'stage', { stage: 'assemble', status: 'start' });
  t += 60;
  scenes.forEach(s => {
    push(t, 'docUpdated', { sceneId: s.id, status: 'done' });
    t += 70 + rnd() * 50;
  });
  push(t, 'stage', { stage: 'assemble', status: 'done', dropped: 0 });
  t += 80;

  // ---------- ④ 整档校验自修 ----------
  push(t, 'stage', { stage: 'validate', status: 'start' });
  t += 700 + rnd() * 500;
  push(t, 'docUpdated', { doc: { scenes: scenes.map(s => ({ id: s.id, kind: s.kind, headline: s.headline, blocks: (s.blocks || []).map(b => ({ id: b.id, type: b.type })) })) }, reason: 'validate' });
  push(t, 'stage', { stage: 'validate', status: 'done', errors: 0, warnings: 1 });
  t += 80;

  // ---------- ⑤ 讲者备注 ----------
  push(t, 'stage', { stage: 'notes', status: 'start' });
  t += 500 + rnd() * 400;
  push(t, 'stage', { stage: 'notes', status: 'done' });
  t += 80;

  // ---------- ⑥ 覆盖度审查 ----------
  push(t, 'stage', { stage: 'coverage', status: 'start' });
  t += 420 + rnd() * 380;
  push(t, 'stage', { stage: 'coverage', status: 'done', ratio: 0.92 });
  t += 60;

  push(t, 'done', {
    totalS: +(t / 1000).toFixed(1),
    calls: blocks.length + scenes.length + 3,
    errors: 0,
    dropped: 0,
    coverage: 0.92,
  });

  ev.sort((a, b) => a.t - b.t); // 并发路数下时间戳可能乱序，稳定化
  return { events: ev, duration: t };
}

// 返回当前虚拟时间点上「下一个待生成的 block」的全局序号（用于开发控制台注入失败）
export function nextPendingBlockIndex(doc, positionMs, run) {
  const blocks = [];
  normalizeScenes(doc).forEach(s => s.blocks.forEach(b => blocks.push(b.id)));
  // 找出在 positionMs 之后才 done 的第一个 block
  const doneAt = new Map();
  for (const e of run.events) {
    if (e.type === 'docUpdated' && e.blockId && e.status === 'done' && !doneAt.has(e.blockId)) doneAt.set(e.blockId, e.t);
  }
  for (let i = 0; i < blocks.length; i++) {
    const dt = doneAt.get(blocks[i]);
    if (dt == null || dt > positionMs) return i;
  }
  return -1;
}

export class Player {
  constructor(view, events, { speed = 1, onTick = null } = {}) {
    this.view = view;
    this.events = events;
    this.duration = events.length ? events[events.length - 1].t : 0;
    this.speed = speed;
    this.onTick = onTick;
    this.pos = 0;
    this.cursor = 0;       // 下一个待派发事件下标
    this.playing = false;
    this._raf = null;
    this._last = 0;
    this._loop = this._loop.bind(this);
  }

  load(events) {
    this.events = events;
    this.duration = events.length ? events[events.length - 1].t : 0;
    this.seek(Math.min(this.pos, this.duration));
  }

  _dispatchUpTo(pos) {
    while (this.cursor < this.events.length && this.events[this.cursor].t <= pos) {
      this.view.applyEvent(this.events[this.cursor]);
      this.cursor++;
    }
  }

  _rebuildTo(pos) {
    this.view.reset();
    this.cursor = 0;
    this._dispatchUpTo(pos);
    this.pos = pos;
    this.view.setClock(pos);
  }

  seek(pos) {
    pos = Math.max(0, Math.min(pos, this.duration));
    if (pos < this.pos) {
      this._rebuildTo(pos);          // 后退：从头重放（确定性重建）
    } else {
      this._dispatchUpTo(pos);       // 前进：只补派发新事件
      this.pos = pos;
      this.view.setClock(pos);
    }
    this._emitTick();
  }

  _loop(ts) {
    if (!this.playing) return;
    if (!this._last) this._last = ts;
    const dt = (ts - this._last) * this.speed;
    this._last = ts;
    let np = this.pos + dt;
    if (np >= this.duration) { np = this.duration; }
    this._dispatchUpTo(np);
    this.pos = np;
    this.view.setClock(np);
    this._emitTick();
    if (np >= this.duration) { this.pause(); return; }
    this._raf = requestAnimationFrame(this._loop);
  }

  play() {
    if (this.playing) return;
    if (this.pos >= this.duration) this._rebuildTo(0);
    this.playing = true;
    this._last = 0;
    this._raf = requestAnimationFrame(this._loop);
    this._emitTick();
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._emitTick();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  restart() { this.pause(); this._rebuildTo(0); this.play(); }

  setSpeed(x) { this.speed = x; }

  instant() { this.pause(); this.seek(this.duration); }

  _emitTick() {
    if (this.onTick) this.onTick({ pos: this.pos, duration: this.duration, playing: this.playing });
  }
}
