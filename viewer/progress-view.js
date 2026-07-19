// progress-view.js — 讲义生成实时进度：会生长的小方块进度条(纯 renderer)
//
// 设计：一行小方块同时承载「规划」与「生成」两重信息，自然形成进度条。
//   - 规划阶段：每规划出一页 scene → 追加一个灰块；每规划出一个 block → 追加一个灰块。
//   - 生成阶段：block 生成好 → 变绿；scene 组装好 → 变绿；验证失败 → 先红，修复后再绿。
//   - 全绿 = 完成。
//
// 复用：只消费事件、只操作 DOM，无 mock/harness 依赖。数据源可以是 mock 驱动，
//   也可以是 live.mjs 的 /events SSE —— 事件 schema 完全一致，零改动即可搬进 live.html。
//
//   createProgressView(rootEl) → { applyEvent(evt), setClock(ms), reset(), setTheme(name), getState() }
//
// 关键约束：状态必须能由「reset() + 顺序重放 events[0..k]」确定性重建，scrub 才能任意跳转。

export const STAGE_ORDER = ['plan', 'fanout', 'assemble', 'validate', 'notes', 'coverage'];
export const STAGE_LABELS = {
  plan:     '① 规划',
  fanout:   '② 逐块生成',
  assemble: '③ 组装',
  validate: '④ 校验自修',
  notes:    '⑤ 讲者备注',
  coverage: '⑥ 覆盖度',
};

// 方块状态机：pending(灰) → active(灰+微光) → done(绿) ；validate 失败 → failed(红) → done(绿)
const CELL_STATES = ['pending', 'active', 'done', 'failed'];

const STYLE_ID = 'pv-injected-style';
const CSS = `
.pv{
  --pv-pend: color-mix(in srgb, var(--ink,#1a1a1a) 9%, transparent);
  --pv-pend-bd: var(--line, #b8b0a4);
  --pv-done: #3E9B5F;
  --pv-fail: #CA4B2E;
  --pv-glow: var(--accent, #8a8178);
  font-family: var(--sans, system-ui, sans-serif);
  color: var(--ink, #1a1a1a);
  display:flex; flex-direction:column; gap:22px;
  padding:26px 30px 40px; box-sizing:border-box;
}
:root[data-theme="lab"] .pv{ --pv-done:#34D399; --pv-fail:#F87171; }
:root[data-theme="cobalt-grid"] .pv{ --pv-done:#2E9E58; --pv-fail:#C8452C; }

/* ---------- 顶部总览 ---------- */
.pv-top{ display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
.pv-top .pv-title{ font-family:var(--serif, Georgia, serif); font-size:20px; font-weight:400; margin:0; }
.pv-top .pv-phase{ font-family:var(--mono, monospace); font-size:12px; color:var(--accent,#8a8178);
  border:1px solid var(--line,#b8b0a4); border-radius:5px; padding:2px 8px; }
.pv-top .pv-stats{ margin-left:auto; display:flex; gap:18px; font-family:var(--mono, monospace);
  font-size:12.5px; color:var(--text2,#5a5a5a); white-space:nowrap; }
.pv-top .pv-stats b{ color:var(--ink,#1a1a1a); font-weight:600; }

/* 总进度细条 */
.pv-bar{ height:4px; border-radius:2px; background:var(--pv-pend); overflow:hidden; }
.pv-bar > i{ display:block; height:100%; width:0; background:var(--pv-done);
  transition:width .45s cubic-bezier(.4,0,.2,1); }

/* ---------- 阶段 stepper（纤细，次要）---------- */
.pv-stepper{ display:flex; align-items:center; gap:0; flex-wrap:wrap; }
.pv-step{ display:flex; align-items:center; gap:7px; font-family:var(--sans); font-size:12px;
  color:var(--text2,#5a5a5a); }
.pv-step .dot{ width:8px; height:8px; border-radius:50%; background:var(--pv-pend-bd); flex:none;
  transition:background .3s, transform .3s; }
.pv-step.active{ color:var(--ink,#1a1a1a); }
.pv-step.active .dot{ background:var(--pv-glow); animation:pvPulse 1.1s ease-in-out infinite; }
.pv-step.done .dot{ background:var(--pv-done); }
.pv-step.err  .dot{ background:var(--pv-fail); }
.pv-step .du{ font-family:var(--mono); font-size:10.5px; color:var(--accent,#8a8178); opacity:.85; }
.pv-step .arm{ width:26px; height:1px; background:var(--line,#b8b0a4); margin:0 10px; opacity:.6; }
@keyframes pvPulse{ 0%,100%{ transform:scale(1); opacity:1 } 50%{ transform:scale(1.55); opacity:.45 } }

/* ---------- 主角：会生长的小方块条 ---------- */
.pv-wait{ color:var(--accent,#8a8178); font-size:13.5px; padding:8px 2px; }
.pv-wait.hide{ display:none; }
.pv-strip{ display:flex; flex-wrap:wrap; gap:8px 14px; align-items:flex-start; }
.pv-group{ display:flex; gap:5px; align-items:flex-start;
  opacity:0; transform:translateY(6px); animation:pvIn .3s ease forwards; }
@keyframes pvIn{ to{ opacity:1; transform:none } }

/* 所有方块统一：同尺寸正方形（20×20），flex:none 保证不被拉伸/压缩 */
.pv-cell{ position:relative; width:20px; height:20px; border-radius:5px; box-sizing:border-box; flex:none;
  border:1px solid var(--pv-pend-bd); background:var(--pv-pend);
  display:flex; align-items:center; justify-content:center;
  opacity:0; transform:scale(.6); animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards;
  transition:background .4s ease, border-color .4s ease, box-shadow .3s ease; }
@keyframes pvPop{ to{ opacity:1; transform:none } }
/* scene 起始块：同尺寸，用外描边标记（outline 不占布局、不受状态背景色影响；页码在 title 里）*/
.pv-cell.scene{ outline:1.5px solid color-mix(in srgb, var(--accent) 42%, transparent); outline-offset:1.5px; }

.pv-cell.active{ box-shadow:0 0 0 0 var(--pv-glow); animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards, pvGlow 1.25s ease-in-out infinite; }
@keyframes pvGlow{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb, var(--pv-glow) 55%, transparent) }
  50%{ box-shadow:0 0 0 4px color-mix(in srgb, var(--pv-glow) 0%, transparent) } }

.pv-cell.done{ background:var(--pv-done); border-color:color-mix(in srgb, var(--pv-done) 78%, black); box-shadow:none; }
.pv-cell.failed{ background:var(--pv-fail); border-color:color-mix(in srgb, var(--pv-fail) 78%, black);
  animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards, pvShake .4s ease; }
@keyframes pvShake{ 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-2px) } 75%{ transform:translateX(2px) } }

.pv-cell .mk{ font-size:11px; font-weight:700; line-height:1; color:#fff; }

/* ---------- 图例 ---------- */
.pv-legend{ display:flex; gap:18px; flex-wrap:wrap; font-size:12px; color:var(--text2,#5a5a5a); }
.pv-legend .lg{ display:flex; align-items:center; gap:7px; }
.pv-legend .sw{ width:15px; height:15px; border-radius:3px; border:1px solid var(--pv-pend-bd);
  background:var(--pv-pend); display:inline-flex; align-items:center; justify-content:center;
  font-size:9px; color:#fff; font-weight:700; }
.pv-legend .sw.done{ background:var(--pv-done); border-color:transparent; }
.pv-legend .sw.failed{ background:var(--pv-fail); border-color:transparent; }
.pv-legend .sw.active{ box-shadow:0 0 0 2px color-mix(in srgb, var(--pv-glow) 40%, transparent); }

/* ---------- 失败列表 ---------- */
.pv-errors{ font-size:12.5px; color:var(--pv-fail); display:flex; flex-direction:column; gap:4px; }
.pv-errors:empty{ display:none; }
.pv-errors .er{ font-family:var(--mono); }

@media (prefers-reduced-motion: reduce){
  .pv-group,.pv-cell{ animation:none !important; opacity:1; transform:none; }
  .pv-cell.active{ box-shadow:0 0 0 2px color-mix(in srgb, var(--pv-glow) 45%, transparent); }
  .pv-step.active .dot{ animation:none; }
}
`;

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

function fmtDur(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export function createProgressView(rootEl) {
  injectStyle(document);
  rootEl.classList.add('pv');
  rootEl.innerHTML = '';

  // --- DOM 骨架 ---
  const top = el('div', 'pv-top');
  const title = el('h2', 'pv-title', '讲义生成');
  const phase = el('span', 'pv-phase', '待启动');
  const stats = el('div', 'pv-stats');
  const stElapsed = el('span'); stElapsed.innerHTML = 'elapsed <b>—</b>';
  const stCount = el('span'); stCount.innerHTML = '<b>0</b>/0 块';
  const stEta = el('span'); stEta.innerHTML = 'ETA <b>—</b>';
  stats.append(stElapsed, stCount, stEta);
  top.append(title, phase, stats);

  const bar = el('div', 'pv-bar'); const barFill = el('i'); bar.appendChild(barFill);

  const stepper = el('div', 'pv-stepper');
  const stepEls = {};
  STAGE_ORDER.forEach((k, i) => {
    if (i) stepper.appendChild(el('span', 'arm'));
    const step = el('div', 'pv-step');
    const dot = el('span', 'dot');
    const nm = el('span', null, STAGE_LABELS[k]);
    const du = el('span', 'du');
    step.append(dot, nm, du);
    stepper.appendChild(step);
    stepEls[k] = { step, du };
  });

  const wait = el('div', 'pv-wait', '等待规划阶段产出骨架…每规划出一页 scene / 一个 block，右侧就长出一个灰色方块。');
  const strip = el('div', 'pv-strip');

  const legend = el('div', 'pv-legend');
  legend.innerHTML = `
    <span class="lg"><span class="sw"></span>待生成 / 生成中</span>
    <span class="lg"><span class="sw active"></span>正在生成</span>
    <span class="lg"><span class="sw done">✓</span>完成</span>
    <span class="lg"><span class="sw failed">✗</span>失败 · 重修中</span>`;

  const errors = el('div', 'pv-errors');

  rootEl.append(top, bar, stepper, wait, strip, legend, errors);

  // --- 状态 ---
  let scenes, sIndex, bIndex, stages, totalHint, done, doneAt, startedAtVirtual, clockMs;

  function resetState() {
    scenes = [];
    sIndex = new Map();   // sceneId → scene 对象
    bIndex = new Map();   // blockId → { scene, block }
    stages = {};          // stage → { status, durationS }
    totalHint = 0;
    done = false;
    doneAt = null;
    startedAtVirtual = null;
    clockMs = 0;
  }

  function reset() {
    resetState();
    strip.innerHTML = '';
    wait.classList.remove('hide');
    phase.textContent = '待启动';
    errors.innerHTML = '';
    STAGE_ORDER.forEach(k => {
      stepEls[k].step.className = 'pv-step';
      stepEls[k].du.textContent = '';
    });
    renderStats();
    barFill.style.width = '0%';
  }

  // --- 结构 mutators ---
  function ensureScene(s) {
    let sc = sIndex.get(s.id);
    if (!sc) {
      sc = { id: s.id, kind: s.kind || 'content', headline: '', eyebrow: '', blocks: [], _group: null, _cell: null, status: 'pending' };
      scenes.push(sc);
      sIndex.set(s.id, sc);
    }
    if (s.headline) sc.headline = s.headline;
    if (s.eyebrow) sc.eyebrow = s.eyebrow;
    if (s.kind) sc.kind = s.kind;
    return sc;
  }

  function ensureBlock(sceneId, b) {
    const sc = sIndex.get(sceneId) || ensureScene({ id: sceneId });
    let entry = bIndex.get(b.id);
    if (!entry) {
      const block = { id: b.id, type: b.type || 'block', intent: b.intent || '', status: 'pending', _cell: null };
      sc.blocks.push(block);
      entry = { scene: sc, block };
      bIndex.set(b.id, entry);
    } else if (b.type) {
      entry.block.type = b.type;
    }
    return entry;
  }

  function setBlockStatus(blockId, status, err) {
    const entry = bIndex.get(blockId);
    if (!entry) return;
    entry.block.status = status;
    if (err) entry.block.err = err;
    maybeSceneAutoState(entry.scene);
  }

  // scene 方块只在「其所有 block 都 done」后才允许被 assemble/validate 事件置绿；
  // 生成期先保持灰，符合「组装好一页 scene 才变绿」。这里不自动置绿，只做失败传染。
  function maybeSceneAutoState(sc) {
    const anyFail = sc.blocks.some(b => b.status === 'failed');
    if (anyFail && sc.status !== 'done') sc.status = 'failed';
    else if (sc.status === 'failed' && !anyFail) sc.status = 'pending';
  }

  function setSceneDone(sceneId) {
    const sc = sIndex.get(sceneId);
    if (sc) sc.status = 'done';
  }

  // 从权威 doc 重建结构，按 id 保留已知状态（skeleton / whole-doc docUpdated）
  function rebuildFromDoc(doc, { greenScenes = false } = {}) {
    (doc.scenes || []).forEach(s => {
      const sc = ensureScene({ id: s.id, kind: s.kind, headline: s.headline, eyebrow: s.eyebrow });
      (s.blocks || []).forEach(b => ensureBlock(s.id, { id: b.id, type: b.type, intent: b.intent }));
      if (greenScenes) sc.status = 'done';
    });
  }

  // --- 渲染 ---
  function cellNode(kind, obj) {
    const c = el('div', `pv-cell ${kind}`);
    obj._cell = c;
    return c;
  }

  function paintCell(c, status) {
    if (!c) return;
    c.classList.remove('pending', 'active', 'done', 'failed');
    c.classList.add(status);
    let mk = c.querySelector('.mk');
    const wantMk = status === 'done' ? '✓' : status === 'failed' ? '✗' : '';
    if (wantMk) {
      if (!mk) { mk = el('span', 'mk'); c.appendChild(mk); }
      mk.textContent = wantMk;
    } else if (mk) {
      mk.remove();
    }
  }

  function renderStrip() {
    if (scenes.length) wait.classList.add('hide');
    scenes.forEach((sc, si) => {
      if (!sc._group) {
        sc._group = el('div', 'pv-group');
        sc._group.appendChild(cellNode('scene', sc));
        strip.appendChild(sc._group);
      }
      // 标题/页码 tooltip
      sc._cell.title = `p${si + 1} · ${sc.kind}${sc.headline ? ' · ' + sc.headline : ''}`;
      paintCell(sc._cell, sc.status);
      sc.blocks.forEach(b => {
        if (!b._cell) {
          const c = cellNode('block', b);
          c.title = `${b.type}${b.intent ? ' · ' + b.intent : ''}`;
          sc._group.appendChild(c);
        }
        b._cell.title = `${b.type}${b.err ? ' · ✗ ' + b.err : b.intent ? ' · ' + b.intent : ''}`;
        paintCell(b._cell, b.status);
      });
    });
  }

  function counts() {
    let total = 0, doneN = 0;
    scenes.forEach(sc => {
      total++; if (sc.status === 'done') doneN++;
      sc.blocks.forEach(b => { total++; if (b.status === 'done') doneN++; });
    });
    return { total: Math.max(total, totalHint), doneN };
  }

  function renderStats() {
    const { total, doneN } = counts();
    const pct = total ? Math.round((doneN / total) * 100) : 0;
    stCount.innerHTML = `<b>${doneN}</b>/${total} 块`;
    // 诚实：只有收到 done 事件才允许显示 100%
    const shown = done ? 100 : Math.min(pct, 99);
    barFill.style.width = shown + '%';

    const elapsed = done && doneAt != null ? doneAt : clockMs;
    stElapsed.innerHTML = `elapsed <b>${fmtDur(elapsed)}</b>`;

    let eta = '—';
    if (done) eta = '完成';
    else if (doneN > 0 && elapsed > 1500 && total > doneN) {
      const perBlock = elapsed / doneN;
      eta = '~' + fmtDur(perBlock * (total - doneN));
    }
    stEta.innerHTML = `ETA <b>${eta}</b>`;
  }

  function renderStages() {
    let activeLabel = null;
    STAGE_ORDER.forEach(k => {
      const st = stages[k];
      const { step, du } = stepEls[k];
      step.className = 'pv-step';
      if (st) {
        if (st.status === 'start') { step.classList.add('active'); activeLabel = STAGE_LABELS[k]; }
        else if (st.status === 'done') step.classList.add('done');
        else if (st.status === 'err') step.classList.add('err');
        du.textContent = st.durationS != null ? st.durationS + 's' : '';
      }
    });
    if (done) phase.textContent = '完成';
    else if (activeLabel) phase.textContent = activeLabel;
  }

  function renderErrors() {
    const fails = [];
    bIndex.forEach(({ scene, block }) => {
      if (block.status === 'failed') fails.push(`✗ ${scene.id}/${block.type}: ${block.err || '校验未通过，重修中…'}`);
    });
    errors.innerHTML = '';
    fails.slice(0, 6).forEach(t => errors.appendChild(el('div', 'er', t)));
  }

  function renderAll() {
    renderStrip();
    renderStages();
    renderStats();
    renderErrors();
  }

  // --- 事件分发（沿用 legacy agent.mjs / plan.mjs 的 schema）---
  function applyEvent(evt) {
    if (!evt || !evt.type) return;
    if (startedAtVirtual == null && evt.t != null) startedAtVirtual = evt.t;
    if (evt.t != null) clockMs = Math.max(clockMs, evt.t - (startedAtVirtual || 0));

    switch (evt.type) {
      case 'stage':
        stages[evt.stage] = { status: evt.status, durationS: evt.durationS };
        if (evt.stage === 'fanout' && evt.status === 'start' && evt.total) totalHint = evt.total;
        break;
      case 'plan-scene':
        if (evt.scene) ensureScene(evt.scene);
        break;
      case 'plan-block':
        if (evt.block) ensureBlock(evt.sceneId, evt.block);
        break;
      case 'skeleton':
        if (evt.doc) rebuildFromDoc(evt.doc);
        break;
      case 'block':
        if (evt.status === 'active') setBlockStatus(evt.blockId, 'active');
        else if (evt.status === 'err') setBlockStatus(evt.blockId, 'failed', evt.err);
        break;
      case 'docUpdated':
        if (evt.doc) {
          // 整档更新：validate 阶段 scene 置绿 / notes 阶段保持
          rebuildFromDoc(evt.doc, { greenScenes: evt.reason === 'validate' });
        } else if (evt.blockId && evt.status === 'done') {
          setBlockStatus(evt.blockId, 'done');
        } else if (evt.sceneId && evt.status === 'done') {
          setSceneDone(evt.sceneId);   // 组装/校验好一页 scene → scene 方块变绿
        }
        break;
      case 'done':
        done = true;
        doneAt = evt.t != null ? (evt.t - (startedAtVirtual || 0)) : clockMs;
        // 收尾：把 stepper 里仍在跑的阶段收成 done
        STAGE_ORDER.forEach(k => { if (stages[k] && stages[k].status === 'start') stages[k].status = 'done'; });
        break;
    }
    renderAll();
  }

  // Player 每帧调用，推进虚拟时钟（scrub / 播放中 elapsed & ETA 用）
  function setClock(ms) {
    clockMs = ms;
    renderStats();
  }

  function setTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
  }

  function getState() {
    return { scenes, done, ...counts() };
  }

  resetState();
  renderStats();
  return { applyEvent, setClock, reset, setTheme, getState, STAGE_ORDER, STAGE_LABELS };
}
