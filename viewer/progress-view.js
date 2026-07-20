// progress-view.js — 讲义生成实时进度：会生长的小方块进度条 + 并立驾驶舱(纯 renderer)
//
// 主角：一行小方块同时承载「规划」与「生成」两重信息，自然形成进度条。
//   - 规划阶段：每规划出一页 → 追加一个灰块；每规划出一个内容块 → 追加一个灰块。
//   - 生成阶段：内容块生成好 → 变绿；整页组装好 → 变绿；需要打磨 → 先琥珀「精修中」，完成后再绿。
//   - 全绿 = 完成。
//
// 并立(不动主角，只在旁补充它给不了的视角)：
//   - B 活动叙事流：用「人话」叙述进展(第 N 页 · 真实标题)。
//   - C 精简指标：已完成页数 / elapsed / ETA + 进度节奏 sparkline。
//
// 【硬约束 · 只对外(public)】绝不暴露任何技术细节：不出现流水线阶段真名、内容块类型、
//   校验/自修/覆盖度机制、token、并发度、schema 报错。阶段一律中性化；失败态一律说成「精修」。
//
// 复用：只消费事件、只操作 DOM，无 mock/harness 依赖。数据源可以是 mock 驱动，
//   也可以是 live.mjs 的 /events SSE —— 事件 schema 完全一致，零改动即可搬进 live.html。
//
//   createProgressView(rootEl) → { applyEvent(evt), setClock(ms), reset(), setTheme(name), getState() }
//
// 关键约束：状态必须能由「reset() + 顺序重放 events[0..k]」确定性重建，scrub 才能任意跳转。
// 叙事流与 sparkline 也严格在事件重放中派生，不依赖真实墙钟，故 scrub 后可精确重建。

// 内部阶段(事件里用)——仅本文件内部映射用，绝不直接显示给用户
export const STAGE_ORDER = ['plan', 'fanout', 'assemble', 'validate', 'notes', 'coverage'];

// 中性对外阶段：把 6 个内部阶段折叠成 3 段不暴露架构的说法
const PUBLIC_STAGES = ['ideate', 'create', 'polish'];
const PUBLIC_LABELS = { ideate: '构思', create: '创作', polish: '润色' };
const STAGE_TO_PUBLIC = {
  plan: 'ideate',
  fanout: 'create',
  assemble: 'create',
  validate: 'polish',
  notes: 'polish',
  coverage: 'polish',
};
// 兼容旧调用方(live.html 曾引用)——给出中性标签，绝不含内部机制名
export const STAGE_LABELS = { plan: '构思', fanout: '创作', assemble: '创作', validate: '润色', notes: '润色', coverage: '润色' };

const STYLE_ID = 'pv-injected-style';
const CSS = `
.pv{
  --pv-pend: color-mix(in srgb, var(--ink,#1a1a1a) 9%, transparent);
  --pv-pend-bd: var(--line, #b8b0a4);
  --pv-done: #3E9B5F;
  --pv-rework: #C98A2E;
  --pv-glow: var(--accent, #8a8178);
  font-family: var(--sans, system-ui, sans-serif);
  color: var(--ink, #1a1a1a);
  display:flex; flex-direction:column; gap:20px;
  padding:26px 30px 40px; box-sizing:border-box;
}
:root[data-theme="lab"] .pv{ --pv-done:#34D399; --pv-rework:#F5B84B; }
:root[data-theme="cobalt-grid"] .pv{ --pv-done:#2E9E58; --pv-rework:#C98A2E; }

/* ---------- 顶部：标题 + 中性阶段徽标 ---------- */
.pv-top{ display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
.pv-top .pv-title{ font-family:var(--serif, Georgia, serif); font-size:20px; font-weight:400; margin:0; }
.pv-top .pv-phase{ font-family:var(--mono, monospace); font-size:12px; color:var(--accent,#8a8178);
  border:1px solid var(--line,#b8b0a4); border-radius:5px; padding:2px 8px; }

/* 总进度细条 */
.pv-bar{ height:4px; border-radius:2px; background:var(--pv-pend); overflow:hidden; }
.pv-bar > i{ display:block; height:100%; width:0; background:var(--pv-done);
  transition:width .45s cubic-bezier(.4,0,.2,1); }

/* ---------- 中性阶段 stepper(构思·创作·润色，不暴露架构)---------- */
.pv-stepper{ display:flex; align-items:center; gap:0; flex-wrap:wrap; }
.pv-step{ display:flex; align-items:center; gap:7px; font-family:var(--sans); font-size:12px;
  color:var(--text2,#5a5a5a); }
.pv-step .dot{ width:8px; height:8px; border-radius:50%; background:var(--pv-pend-bd); flex:none;
  transition:background .3s, transform .3s; }
.pv-step.active{ color:var(--ink,#1a1a1a); }
.pv-step.active .dot{ background:var(--pv-glow); animation:pvPulse 1.1s ease-in-out infinite; }
.pv-step.done .dot{ background:var(--pv-done); }
.pv-step .arm{ width:30px; height:1px; background:var(--line,#b8b0a4); margin:0 12px; opacity:.6; }
@keyframes pvPulse{ 0%,100%{ transform:scale(1); opacity:1 } 50%{ transform:scale(1.55); opacity:.45 } }

/* ---------- 方块条下方：并立驾驶舱(无边框，上下排) ---------- */
.pv-below{ display:flex; flex-direction:column; gap:16px; margin-top:2px; }

/* 主角：会生长的小方块条 */
.pv-wait{ color:var(--accent,#8a8178); font-size:13.5px; padding:8px 2px; }
.pv-wait.hide{ display:none; }
.pv-strip{ display:flex; flex-wrap:wrap; gap:8px 14px; align-items:flex-start; }
.pv-group{ display:flex; gap:5px; align-items:flex-start;
  opacity:0; transform:translateY(6px); animation:pvIn .3s ease forwards; }
@keyframes pvIn{ to{ opacity:1; transform:none } }

/* 所有方块统一：同尺寸正方形(20×20)，flex:none 保证不被拉伸/压缩 */
.pv-cell{ position:relative; width:20px; height:20px; border-radius:5px; box-sizing:border-box; flex:none;
  border:1px solid var(--pv-pend-bd); background:var(--pv-pend);
  display:flex; align-items:center; justify-content:center;
  opacity:0; transform:scale(.6); animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards;
  transition:background .4s ease, border-color .4s ease, box-shadow .3s ease; }
@keyframes pvPop{ to{ opacity:1; transform:none } }
/* 每页起始块：同尺寸，用外描边标记(outline 不占布局、不受状态背景色影响；页码在 title 里)*/
.pv-cell.scene{ outline:1.5px solid color-mix(in srgb, var(--accent) 42%, transparent); outline-offset:1.5px; }

.pv-cell.active{ box-shadow:0 0 0 0 var(--pv-glow); animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards, pvGlow 1.25s ease-in-out infinite; }
@keyframes pvGlow{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb, var(--pv-glow) 55%, transparent) }
  50%{ box-shadow:0 0 0 4px color-mix(in srgb, var(--pv-glow) 0%, transparent) } }

.pv-cell.done{ background:var(--pv-done); border-color:color-mix(in srgb, var(--pv-done) 78%, black); box-shadow:none; }
/* 精修中：琥珀，柔和呼吸(不刺眼、不用红、不暗示"报错")——保留"非绿过渡态→绿"的节奏 */
.pv-cell.rework{ background:var(--pv-rework); border-color:color-mix(in srgb, var(--pv-rework) 72%, black);
  animation:pvPop .28s cubic-bezier(.34,1.56,.64,1) forwards, pvBreathe 1.3s ease-in-out infinite; }
@keyframes pvBreathe{ 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb, var(--pv-rework) 50%, transparent) }
  50%{ box-shadow:0 0 0 3px color-mix(in srgb, var(--pv-rework) 0%, transparent) } }

.pv-cell .mk{ font-size:11px; font-weight:700; line-height:1; color:#fff; }

/* 图例(全中性用语) */
.pv-legend{ display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--text2,#5a5a5a); }
.pv-legend .lg{ display:flex; align-items:center; gap:7px; }
.pv-legend .sw{ width:15px; height:15px; border-radius:3px; border:1px solid var(--pv-pend-bd);
  background:var(--pv-pend); display:inline-flex; align-items:center; justify-content:center;
  font-size:9px; color:#fff; font-weight:700; flex:none; }
.pv-legend .sw.done{ background:var(--pv-done); border-color:transparent; }
.pv-legend .sw.rework{ background:var(--pv-rework); border-color:transparent; }
.pv-legend .sw.active{ box-shadow:0 0 0 2px color-mix(in srgb, var(--pv-glow) 40%, transparent); }

/* ---------- 并立 C：精简指标(无边框，横排一条) ---------- */
.pv-metrics{ display:flex; align-items:center; gap:26px; flex-wrap:wrap; }
.pv-metrics .big{ display:flex; align-items:baseline; gap:8px; }
.pv-metrics .big .num{ font-family:var(--serif, Georgia, serif); font-size:30px; line-height:1; color:var(--ink,#1a1a1a); }
.pv-metrics .big .unit{ font-size:13px; color:var(--text2,#5a5a5a); }
.pv-metrics .rows{ display:flex; flex-direction:row; gap:22px; }
.pv-metrics .row{ display:flex; gap:8px; align-items:baseline; font-family:var(--mono, monospace);
  font-size:12px; color:var(--text2,#5a5a5a); }
.pv-metrics .row b{ color:var(--ink,#1a1a1a); font-weight:600; }
.pv-spark{ width:160px; height:32px; display:block; overflow:visible; flex:none; align-self:center; }
.pv-spark .ar{ fill:color-mix(in srgb, var(--pv-done) 13%, transparent); stroke:none; }
.pv-spark .ln{ fill:none; stroke:var(--pv-done); stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round; }
.pv-spark .hd{ fill:var(--pv-done); }

/* ---------- 并立 B：活动叙事流(无边框，说人话) ---------- */
.pv-feed{ display:flex; flex-direction:column; }
.pv-feed .cap{ font-family:var(--mono, monospace); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--accent,#8a8178); padding:0 2px 7px; }
.pv-feed .list{ max-height:200px; overflow-y:auto; padding:0; display:flex; flex-direction:column; scroll-behavior:smooth;
  scrollbar-width:thin; scrollbar-color:color-mix(in srgb, var(--ink,#1a1a1a) 16%, transparent) transparent; }
.pv-feed .list::-webkit-scrollbar{ width:4px; }
.pv-feed .list::-webkit-scrollbar-track{ background:transparent; }
.pv-feed .list::-webkit-scrollbar-thumb{ background:color-mix(in srgb, var(--ink,#1a1a1a) 15%, transparent); border-radius:4px; }
.pv-feed .list::-webkit-scrollbar-thumb:hover{ background:color-mix(in srgb, var(--ink,#1a1a1a) 30%, transparent); }
.pv-feed .li{ font-size:12.5px; line-height:1.45; padding:4px 2px; color:var(--text2,#5a5a5a);
  display:flex; gap:9px; align-items:baseline; opacity:0; animation:pvIn .3s ease forwards; }
.pv-feed .li .ic{ flex:none; width:14px; text-align:center; color:var(--accent,#8a8178); }
.pv-feed .li .tx{ min-width:0; }
.pv-feed .li.done{ color:var(--ink,#1a1a1a); }
.pv-feed .li.done .ic{ color:var(--pv-done); }
.pv-feed .li.rework .ic{ color:var(--pv-rework); }
.pv-feed .li.phase{ color:var(--ink,#1a1a1a); font-family:var(--mono, monospace); font-size:11.5px; letter-spacing:.02em; }
.pv-feed .li.finish{ color:var(--ink,#1a1a1a); font-weight:600; }
.pv-feed .li.finish .ic{ color:var(--pv-done); }
.pv-feed .empty{ padding:4px 2px; font-size:12.5px; color:var(--accent,#8a8178); }

@media (prefers-reduced-motion: reduce){
  .pv-group,.pv-cell,.pv-feed .li{ animation:none !important; opacity:1; transform:none; }
  .pv-cell.active{ box-shadow:0 0 0 2px color-mix(in srgb, var(--pv-glow) 45%, transparent); }
  .pv-cell.rework{ box-shadow:0 0 0 2px color-mix(in srgb, var(--pv-rework) 45%, transparent); }
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

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
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
  top.append(title, phase);

  const bar = el('div', 'pv-bar'); const barFill = el('i'); bar.appendChild(barFill);

  const stepper = el('div', 'pv-stepper');
  const stepEls = {};
  PUBLIC_STAGES.forEach((k, i) => {
    if (i) stepper.appendChild(el('span', 'arm'));
    const step = el('div', 'pv-step');
    const dot = el('span', 'dot');
    const nm = el('span', null, PUBLIC_LABELS[k]);
    step.append(dot, nm);
    stepper.appendChild(step);
    stepEls[k] = { step };
  });

  // 主角：会生长的小方块条
  const wait = el('div', 'pv-wait', '正在准备…马上开始构思整体结构，下面会逐页长出方块。');
  const strip = el('div', 'pv-strip');
  const legend = el('div', 'pv-legend');
  legend.innerHTML = `
    <span class="lg"><span class="sw"></span>待创作</span>
    <span class="lg"><span class="sw active"></span>创作中</span>
    <span class="lg"><span class="sw rework"></span>精修中</span>
    <span class="lg"><span class="sw done">✓</span>完成</span>`;

  // 并立 C：指标(横排一条，无边框)
  const side = el('div', 'pv-side');
  const metrics = el('div', 'pv-metrics');
  const mBig = el('div', 'big');
  const mNum = el('span', 'num', '0');
  const mUnit = el('span', 'unit', '/ 0 页完成');
  mBig.append(mNum, mUnit);
  const mRows = el('div', 'rows');
  const rElapsed = el('div', 'row'); rElapsed.innerHTML = '<span>已用时</span><b>—</b>';
  const rEta = el('div', 'row'); rEta.innerHTML = '<span>预计剩余</span><b>—</b>';
  mRows.append(rElapsed, rEta);
  const spark = svgEl('svg', { class: 'pv-spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none' });
  const sparkAr = svgEl('path', { class: 'ar' });
  const sparkLn = svgEl('path', { class: 'ln' });
  const sparkHd = svgEl('circle', { class: 'hd', r: '2.2', cx: '0', cy: '40' });
  spark.append(sparkAr, sparkLn, sparkHd);
  metrics.append(mBig, mRows, spark);

  // 并立 B：活动叙事流(无边框)
  const feed = el('div', 'pv-feed');
  const feedCap = el('div', 'cap', '进展');
  const feedList = el('div', 'list');
  feed.append(feedCap, feedList);

  // 方块条下方并立(上下排布)
  const below = el('div', 'pv-below');
  below.append(metrics, feed);

  rootEl.append(top, bar, stepper, wait, strip, legend, below);

  // --- 状态 ---
  let scenes, sIndex, bIndex, stages, totalHint, done, doneAt, startedAtVirtual, clockMs;
  let feedAnnounced, samples, lastDoneN;

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
    feedAnnounced = new Set();  // 叙事去重键(可重放重建)
    samples = [];               // sparkline 采样 {t, frac}(事件派生，可重放)
    lastDoneN = 0;
  }

  function reset() {
    resetState();
    strip.innerHTML = '';
    wait.classList.remove('hide');
    phase.textContent = '待启动';
    feedList.innerHTML = '';
    PUBLIC_STAGES.forEach(k => { stepEls[k].step.className = 'pv-step'; });
    renderStats();
    drawSpark();
    barFill.style.width = '0%';
  }

  // --- 叙事流(说人话，绝不含技术细节) ---
  function pushFeed(key, kind, text) {
    if (feedAnnounced.has(key)) return;
    feedAnnounced.add(key);
    const ic = kind === 'done' ? '✓' : kind === 'rework' ? '✎' : kind === 'phase' ? '◆'
      : kind === 'finish' ? '★' : '·';
    const li = el('div', 'li ' + kind);
    li.append(el('span', 'ic', ic), el('span', 'tx', text));
    feedList.appendChild(li);
    // 只保留最近 ~60 条(重放时也一致，因为 announced 去重)
    while (feedList.children.length > 60) feedList.removeChild(feedList.firstChild);
    feedList.scrollTop = feedList.scrollHeight;
  }

  const pageNo = sc => scenes.indexOf(sc) + 1;

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
      const block = { id: b.id, status: 'pending', _cell: null };
      sc.blocks.push(block);
      entry = { scene: sc, block };
      bIndex.set(b.id, entry);
    }
    return entry;
  }

  function setBlockStatus(blockId, status) {
    const entry = bIndex.get(blockId);
    if (!entry) return;
    entry.block.status = status;
    const sc = entry.scene;
    if (status === 'active') pushFeed('creating:' + sc.id, 'plan', `正在创作第 ${pageNo(sc)} 页…`);
    if (status === 'rework') pushFeed('rework:' + sc.id, 'rework', `第 ${pageNo(sc)} 页精修中…`);
    maybeSceneAutoState(sc);
    // 一页所有内容块都完成 → 这页即完成(页数在创作期就随绿块自然增长，不必等到收尾)
    if (status === 'done' && sc.status !== 'done' && sc.blocks.length && sc.blocks.every(b => b.status === 'done')) {
      setSceneDone(sc.id);
    }
  }

  // 一页内有块在精修 → 该页方块也显琥珀；精修结束回落灰(等组装再统一变绿)
  function maybeSceneAutoState(sc) {
    const anyRework = sc.blocks.some(b => b.status === 'rework');
    if (anyRework && sc.status !== 'done') sc.status = 'rework';
    else if (sc.status === 'rework' && !anyRework) sc.status = 'pending';
  }

  function setSceneDone(sceneId) {
    const sc = sIndex.get(sceneId);
    if (!sc) return;
    sc.status = 'done';
    pushFeed('done:' + sc.id, 'done', `第 ${pageNo(sc)} 页完成${sc.headline ? ' · ' + sc.headline : ''}`);
  }

  // 从权威 doc 重建结构，按 id 保留已知状态(skeleton / 整档更新)
  function rebuildFromDoc(doc, { greenScenes = false } = {}) {
    (doc.scenes || []).forEach(s => {
      const sc = ensureScene({ id: s.id, kind: s.kind, headline: s.headline, eyebrow: s.eyebrow });
      (s.blocks || []).forEach(b => ensureBlock(s.id, { id: b.id }));
      if (greenScenes) setSceneDone(s.id);
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
    c.classList.remove('pending', 'active', 'done', 'rework');
    c.classList.add(status);
    let mk = c.querySelector('.mk');
    const wantMk = status === 'done' ? '✓' : '';
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
      // tooltip 只留页码 + 真实标题(标题是"产品内容"，非技术细节)
      sc._cell.title = `第 ${si + 1} 页${sc.headline ? ' · ' + sc.headline : ''}`;
      paintCell(sc._cell, sc.status);
      sc.blocks.forEach(b => {
        if (!b._cell) {
          const c = cellNode('block', b);
          c.title = `第 ${si + 1} 页`;
          sc._group.appendChild(c);
        }
        paintCell(b._cell, b.status);
      });
    });
  }

  // 细方块计数(总进度条/ETA 用，粒度细、更平滑)
  function counts() {
    let total = 0, doneN = 0;
    scenes.forEach(sc => {
      total++; if (sc.status === 'done') doneN++;
      sc.blocks.forEach(b => { total++; if (b.status === 'done') doneN++; });
    });
    return { total: Math.max(total, totalHint), doneN };
  }

  // 页级计数(对外展示单位 = 页)
  function pageCounts() {
    let pDone = 0;
    scenes.forEach(sc => { if (sc.status === 'done') pDone++; });
    return { pTotal: scenes.length, pDone };
  }

  function drawSpark() {
    const W = 100, H = 40;
    if (samples.length < 2) {
      sparkAr.setAttribute('d', '');
      sparkLn.setAttribute('d', '');
      sparkHd.setAttribute('cx', '0'); sparkHd.setAttribute('cy', String(H));
      return;
    }
    // x 从「第一个完成点」归一到最后一个 → 曲线铺满整宽(规划期没有完成，不留左侧大片空白)
    const tMin = samples[0].t;
    const tMax = samples[samples.length - 1].t;
    const span = Math.max(1, tMax - tMin);
    const x = t => ((t - tMin) / span) * W;
    const y = f => H - Math.max(0, Math.min(1, f)) * (H - 3) - 1.5;
    let d = '';
    samples.forEach((s, i) => { d += (i ? 'L' : 'M') + x(s.t).toFixed(1) + ' ' + y(s.frac).toFixed(1) + ' '; });
    sparkLn.setAttribute('d', d.trim());
    const last = samples[samples.length - 1];
    sparkAr.setAttribute('d', `M0 ${H} ` + d.replace(/^M/, 'L') + `L${x(last.t).toFixed(1)} ${H} Z`);
    sparkHd.setAttribute('cx', x(last.t).toFixed(1));
    sparkHd.setAttribute('cy', y(last.frac).toFixed(1));
  }

  function renderStats() {
    const { total, doneN } = counts();
    const { pTotal, pDone } = pageCounts();
    const pct = total ? Math.round((doneN / total) * 100) : 0;
    // 诚实：只有收到 done 事件才允许显示 100%
    const shown = done ? 100 : Math.min(pct, 99);
    barFill.style.width = shown + '%';

    mNum.textContent = String(pDone);
    mUnit.textContent = `/ ${pTotal} 页完成`;

    const elapsed = done && doneAt != null ? doneAt : clockMs;
    rElapsed.querySelector('b').textContent = fmtDur(elapsed);

    let eta = '—';
    if (done) eta = '完成';
    else if (doneN > 0 && elapsed > 1500 && total > doneN) {
      const perCell = elapsed / doneN;
      eta = '~' + fmtDur(perCell * (total - doneN));
    }
    rEta.querySelector('b').textContent = eta;

    // sparkline 采样：细方块完成数每增长一次记一点(事件派生 → 可重放重建)
    if (doneN > lastDoneN && total > 0) {
      samples.push({ t: elapsed, frac: doneN / total });
      lastDoneN = doneN;
    }
    if (done && (samples.length === 0 || samples[samples.length - 1].frac < 1)) {
      samples.push({ t: elapsed, frac: 1 });
    }
    drawSpark();
  }

  // 中性阶段 stepper：把内部阶段折叠为 构思→创作→润色
  function currentPublicPhase() {
    let cur = null;
    STAGE_ORDER.forEach(k => { if (stages[k]) cur = STAGE_TO_PUBLIC[k]; });
    return cur;
  }

  function renderStages() {
    const cur = currentPublicPhase();
    const curIdx = cur ? PUBLIC_STAGES.indexOf(cur) : -1;
    PUBLIC_STAGES.forEach((k, i) => {
      const step = stepEls[k].step;
      step.className = 'pv-step';
      if (done || (curIdx >= 0 && i < curIdx)) step.classList.add('done');
      else if (i === curIdx) step.classList.add('active');
    });
    if (done) phase.textContent = '完成';
    else if (cur) phase.textContent = PUBLIC_LABELS[cur];
  }

  function renderAll() {
    renderStrip();
    renderStages();
    renderStats();
  }

  // --- 事件分发(沿用 legacy 的事件 schema，但对外一律翻译成中性用语)---
  function applyEvent(evt) {
    if (!evt || !evt.type) return;
    if (startedAtVirtual == null && evt.t != null) startedAtVirtual = evt.t;
    if (evt.t != null) clockMs = Math.max(clockMs, evt.t - (startedAtVirtual || 0));

    switch (evt.type) {
      case 'stage': {
        stages[evt.stage] = { status: evt.status, durationS: evt.durationS };
        if (evt.stage === 'fanout' && evt.status === 'start' && evt.total) totalHint = evt.total;
        // 阶段起点 → 叙事一句中性话
        if (evt.status === 'start') {
          const pub = STAGE_TO_PUBLIC[evt.stage];
          if (pub === 'ideate') pushFeed('phase:ideate', 'phase', '开始构思整体结构');
          else if (pub === 'create' && evt.stage === 'fanout') pushFeed('phase:create', 'phase', '开始逐页创作内容');
          else if (pub === 'polish' && evt.stage === 'validate') pushFeed('phase:polish', 'phase', '统一润色收尾');
        }
        break;
      }
      case 'plan-scene':
        if (evt.scene) {
          const sc = ensureScene(evt.scene);
          pushFeed('plan:' + sc.id, 'plan', `构思出第 ${pageNo(sc)} 页${sc.headline ? ' · ' + sc.headline : ''}`);
        }
        break;
      case 'plan-block':
        if (evt.block) ensureBlock(evt.sceneId, evt.block);
        break;
      case 'skeleton':
        if (evt.doc) rebuildFromDoc(evt.doc);
        break;
      case 'block':
        if (evt.status === 'active') setBlockStatus(evt.blockId, 'active');
        else if (evt.status === 'err') setBlockStatus(evt.blockId, 'rework'); // 对外：精修中(不暴露"校验失败")
        break;
      case 'docUpdated':
        if (evt.doc) {
          rebuildFromDoc(evt.doc, { greenScenes: evt.reason === 'validate' });
        } else if (evt.blockId && evt.status === 'done') {
          setBlockStatus(evt.blockId, 'done');
        } else if (evt.sceneId && evt.status === 'done') {
          setSceneDone(evt.sceneId);   // 组装/润色好一页 → 该页方块变绿
        }
        break;
      case 'done': {
        done = true;
        doneAt = evt.t != null ? (evt.t - (startedAtVirtual || 0)) : clockMs;
        const { pTotal } = pageCounts();
        pushFeed('finish', 'finish', `全部完成 · 共 ${pTotal} 页`);
        break;
      }
    }
    renderAll();
    // 叙事流空态占位
    if (!feedList.children.length && !feedList.querySelector('.empty')) {
      feedList.appendChild(el('div', 'empty', '尚未开始…'));
    } else {
      const em = feedList.querySelector('.empty');
      if (em && feedList.children.length > 1) em.remove();
    }
  }

  // Player 每帧调用，推进虚拟时钟(scrub / 播放中 elapsed & ETA 用)
  function setClock(ms) {
    clockMs = ms;
    renderStats();
  }

  function setTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
  }

  function getState() {
    return { scenes, done, ...counts(), ...pageCounts() };
  }

  resetState();
  feedList.appendChild(el('div', 'empty', '尚未开始…'));
  renderStats();
  drawSpark();
  return { applyEvent, setClock, reset, setTheme, getState, STAGE_ORDER, STAGE_LABELS };
}
