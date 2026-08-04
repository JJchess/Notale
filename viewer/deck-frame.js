/* ============================================================================
   DeckFrame — artboard 栅格上的拖拽 / 缩放 / 层级

   编辑单位是 **area**，不是 block：12×12 栅格的位置信息存在 scene.layout.areas[] 上
   （col / row / z / align / justify / bleed / clip），block 只是被 area 装着。
   scene.layout.titleRegion 是同构的第 13 个单元，所以标题区一样可拖。

   红线一（与 deck-edit.js 同源）：手势期间只改现有节点的内联 gridColumn/gridRow/zIndex，
   **不重渲**。于是 runnable 的 CodeMirror、sim 的滑块、widget 的 iframe 由构造上不可能受损——
   它们连 DOM 位置都没动，只是所在的 grid 单元换了行列线。

   红线二：resolveArtboardLayout 是**全有全无**的。任一 area 的 col/row 越界、blockId 未知或
   重复、或没覆盖 scene 的全部块，它就返回 null，整页**静默回落 flow**——不报错，版面直接崩。
   所以本模块：① 钳制到合法范围，让非法值根本产生不出来；② 写回 doc 后立刻复验一次，
   不通过就回滚。绝不"先写了再看"。

   坐标系（实测确认，别改成别的）：
     · getComputedStyle(body).gridTemplateColumns 给的是 12 条轨道的**未缩放布局像素**；
     · getBoundingClientRect 给的是被 reveal 的 transform:scale 乘过的屏幕像素。
     所以轨道尺寸直接用前者，只把**指针位移**除以 Reveal.getScale()。
   ========================================================================== */
(function () {
  'use strict';

  const MIN_LINE = 1, MAX_LINE = 13;      // strictGridSpan：整数、1..13、end > start
  const Z_MIN = 0, Z_MAX = 8;             // area z 的钳制范围（title 另有 5..9，见 clampZ）
  const TITLE_Z_MIN = 5, TITLE_Z_MAX = 9;

  const deck = () => window.LectureDeck;

  let on = false;          // 编辑态（跟随 deck-edit.js 的 deck:editmode 事件）
  let sel = null;          // { node, kind:'area'|'title', sec, scene, index }
  let overlay = null;
  let drag = null;         // 手势状态

  /* ---------- 几何 ---------- */

  function scaleOf() {
    const R = window.Reveal;
    if (R && typeof R.getScale === 'function') { const k = R.getScale(); if (k > 0) return k; }
    const vp = document.querySelector('.reveal-viewport') || document.body;
    const k = parseFloat(getComputedStyle(vp).getPropertyValue('--slide-scale'));
    return k > 0 ? k : 1;
  }

  /** 从 computed style 读真实轨道尺寸（未缩放布局像素）。返回每格的"步长"= 轨道 + 间隙。 */
  function gridGeom(body) {
    const cs = getComputedStyle(body);
    const cols = cs.gridTemplateColumns.split(/\s+/).map(parseFloat).filter(Number.isFinite);
    const rows = cs.gridTemplateRows.split(/\s+/).map(parseFloat).filter(Number.isFinite);
    if (cols.length < 2 || rows.length < 2) return null;
    const colGap = parseFloat(cs.columnGap) || 0, rowGap = parseFloat(cs.rowGap) || 0;
    return {
      colStep: cols[0] + colGap,
      rowStep: rows[0] + rowGap,
      nCols: cols.length,
      nRows: rows.length,
    };
  }

  /** "4 / 10" → [4,10]。渲染器与 strictGridSpan 都只产出这种双线号形式。 */
  function parseSpan(v) {
    const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(v || ''));
    if (!m) return null;
    const a = +m[1], b = +m[2];
    return (Number.isInteger(a) && Number.isInteger(b) && b > a) ? [a, b] : null;
  }
  const fmtSpan = ([a, b]) => a + ' / ' + b;

  /** 整段平移：保持跨度，把 [a,b] 挪 d 格，撞到边界就停住（不压缩跨度）。 */
  function shiftSpan([a, b], d) {
    const span = b - a;
    let na = a + d;
    if (na < MIN_LINE) na = MIN_LINE;
    if (na + span > MAX_LINE) na = MAX_LINE - span;
    return [na, na + span];
  }

  /** 改单边：edge=-1 动起始线，+1 动结束线。跨度至少 1 格。 */
  function resizeSpan([a, b], d, edge) {
    if (edge < 0) { let na = Math.min(Math.max(MIN_LINE, a + d), b - 1); return [na, b]; }
    let nb = Math.max(Math.min(MAX_LINE, b + d), a + 1); return [a, nb];
  }

  const clampZ = (z, kind) => kind === 'title'
    ? Math.min(TITLE_Z_MAX, Math.max(TITLE_Z_MIN, z))
    : Math.min(Z_MAX, Math.max(Z_MIN, z));

  /* ---------- doc 反查 ---------- */

  /** 由被点节点解析出它对应 doc 里的哪一段 layout。
      area 的下标按它在 .body 里的 DOM 顺序取——渲染器就是按 layout.areas 的顺序 append 的
      （sceneLayouts.artboard 里 for…of layout.areas），所以 DOM 序 === 数组序。 */
  function resolveTarget(node) {
    const sec = node.closest('section[data-scene-id]');
    const d = deck() && deck().getDoc();
    if (!sec || !d) return null;
    const scene = (d.scenes || []).find(s => s && String(s.id) === sec.dataset.sceneId);
    if (!scene || !scene.layout || scene.layout.kind !== 'artboard') return null;

    if (node.classList.contains('artboard-title')) return { node, kind: 'title', sec, scene, index: -1 };
    const body = node.closest('.body.layout-artboard');
    if (!body) return null;
    const areas = Array.from(body.querySelectorAll(':scope > .artboard-area'));
    const index = areas.indexOf(node);
    if (index < 0 || !Array.isArray(scene.layout.areas) || !scene.layout.areas[index]) return null;
    return { node, kind: 'area', sec, scene, index };
  }

  const specOf = (t) => t.kind === 'title' ? t.scene.layout.titleRegion : t.scene.layout.areas[t.index];

  /* ---------- 写回 + 复验 + 回滚 ---------- */

  /** 把 {col,row,z} 写进 doc，复验整页 layout 仍能解析；不通过则整段回滚并提示。
      复验用渲染器自己的 resolveArtboardLayout（经 LectureDeck 暴露），不在这里重写一份判据——
      重写就一定会漂移，而漂移的后果是"编辑器觉得合法、渲染器静默回落 flow"。 */
  function commitSpec(t, next) {
    const spec = specOf(t);
    if (!spec) return false;
    const snapshot = { col: spec.col, row: spec.row, z: spec.z };
    if (next.col) spec.col = next.col;
    if (next.row) spec.row = next.row;
    if (next.z != null) spec.z = next.z;

    const check = deck().resolveArtboard;
    if (typeof check === 'function' && !check(t.scene, t.scene.layout)) {
      Object.assign(spec, snapshot);
      paintFromDoc(t);
      warn('这一步会让本页版面整体失效（artboard 是全有全无的），已撤销。');
      return false;
    }
    if (window.DeckEdit && DeckEdit.bumpDirty) DeckEdit.bumpDirty();
    return true;
  }

  /** 按 doc 里的值重画节点的内联样式（回滚用）。 */
  function paintFromDoc(t) {
    const spec = specOf(t); if (!spec) return;
    const col = Array.isArray(spec.col) ? spec.col : parseSpan(t.node.style.gridColumn);
    const row = Array.isArray(spec.row) ? spec.row : parseSpan(t.node.style.gridRow);
    if (col) t.node.style.gridColumn = fmtSpan(col);
    if (row) t.node.style.gridRow = fmtSpan(row);
  }

  function warn(msg) {
    document.dispatchEvent(new CustomEvent('deck:frame-warning', { detail: { msg } }));
    const b = document.querySelector('.deck-edit-badge');
    if (b) { const old = b.textContent; b.textContent = '⚠ ' + msg; setTimeout(() => { b.textContent = old; }, 2600); }
  }

  /* ---------- 选中 + overlay ---------- */

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'deck-frame-overlay';
    overlay.innerHTML =
      '<div class="dfo-rail" data-dfo="move" title="拖动整块"></div>' +
      '<div class="dfo-badge"></div>' +
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
        .map(d => '<div class="dfo-h dfo-' + d + '" data-dfo="' + d + '"></div>').join('');
    return overlay;
  }

  function select(t) {
    if (sel && sel.node === t.node) { refreshBadge(); return; }
    deselect();
    sel = t;
    t.node.classList.add('deck-frame-sel');
    t.node.appendChild(ensureOverlay());
    refreshBadge();
  }

  function deselect() {
    if (!sel) return;
    sel.node.classList.remove('deck-frame-sel');
    if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
    sel = null;
  }

  function refreshBadge() {
    if (!sel || !overlay) return;
    const spec = specOf(sel);
    const col = parseSpan(sel.node.style.gridColumn) || (spec && spec.col) || [];
    const row = parseSpan(sel.node.style.gridRow) || (spec && spec.row) || [];
    const b = overlay.querySelector('.dfo-badge');
    const zLocked = sel.kind === 'area' && sel.node.classList.contains('has-interaction');
    b.textContent = (sel.kind === 'title' ? '标题区' : '区块 ' + (sel.index + 1))
      + '  列 ' + col.join('–') + '  行 ' + row.join('–')
      + '  z' + (sel.node.style.zIndex || '?') + (zLocked ? '（含交互，z 被渲染器锁定为 10）' : '');
  }

  /* ---------- 手势 ---------- */

  /** 从这些地方按下不启动拖拽：正在编辑的文字锚点、以及一切可交互控件。
      文字编辑与栅格拖拽必须能共存——点标题是要改字，不是要挪位置。 */
  const NO_DRAG = 'input,button,select,textarea,a,iframe,.CodeMirror,.choice,.index-item,[data-edit-field]';

  document.addEventListener('pointerdown', (e) => {
    if (!on) return;
    const handle = e.target.closest && e.target.closest('[data-dfo]');
    const node = e.target.closest && e.target.closest('.artboard-area, .artboard-title');
    if (!handle && !node) { deselect(); return; }

    const t = handle ? sel : resolveTarget(node);
    if (!t) return;
    select(t);

    /* 手柄/横杠上按下 → 一定拖；块体上按下 → 只有不在可交互元素上才拖 */
    const mode = handle ? handle.dataset.dfo : (e.target.closest(NO_DRAG) ? null : 'move');
    if (!mode) return;

    const body = t.node.closest('.body.layout-artboard');
    const geom = body && gridGeom(body);
    const col = parseSpan(t.node.style.gridColumn), row = parseSpan(t.node.style.gridRow);
    if (!geom || !col || !row) return;

    e.preventDefault();
    drag = { t, mode, geom, col0: col, row0: row, x0: e.clientX, y0: e.clientY, k: scaleOf(), moved: false };
    /* setPointerCapture 而不是挂 document：指针掠过 widget iframe 时拖拽不能中断 */
    try { (handle || t.node).setPointerCapture(e.pointerId); } catch { /* 老浏览器：忽略 */ }
    document.body.classList.add('deck-frame-dragging');
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { geom, k } = drag;
    const dCol = Math.round((e.clientX - drag.x0) / k / geom.colStep);
    const dRow = Math.round((e.clientY - drag.y0) / k / geom.rowStep);
    if (!dCol && !dRow && !drag.moved) return;
    drag.moved = true;

    let col = drag.col0, row = drag.row0;
    const m = drag.mode;
    if (m === 'move') { col = shiftSpan(col, dCol); row = shiftSpan(row, dRow); }
    else {
      if (m.includes('w')) col = resizeSpan(col, dCol, -1);
      if (m.includes('e')) col = resizeSpan(col, dCol, +1);
      if (m.includes('n')) row = resizeSpan(row, dRow, -1);
      if (m.includes('s')) row = resizeSpan(row, dRow, +1);
    }
    /* 手势期间只写内联样式——不重渲、不碰 doc */
    drag.t.node.style.gridColumn = fmtSpan(col);
    drag.t.node.style.gridRow = fmtSpan(row);
    drag.next = { col, row };
    refreshBadge();
  });

  function endDrag() {
    if (!drag) return;
    const { t, next, moved } = drag;
    drag = null;
    document.body.classList.remove('deck-frame-dragging');
    if (!moved || !next) return;
    if (commitSpec(t, next)) deck().relayoutScene(t.sec);   /* 手势结束才重跑一次自适应排版 */
    refreshBadge();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* ---------- 键盘 ----------
     捕获阶段 + stopPropagation：reveal 在 document 上绑了自己的方向键翻页。
     只在"有选中且不在文字编辑中"时接管，其余一律放行。 */
  document.addEventListener('keydown', (e) => {
    /* 用 drag.moved 而不是 drag：按下但还没移动不算在拖，此时键盘微调应该照样可用。
       （按 drag 判会让"按一下选中、然后想用方向键推"这种最自然的操作序列失效——
       只要那次 pointerup 因为任何原因没送到，键盘就永久失灵。） */
    if (!on || !sel || (drag && drag.moved)) return;
    if (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    const step = e.shiftKey ? 3 : 1;
    const col = parseSpan(sel.node.style.gridColumn), row = parseSpan(sel.node.style.gridRow);
    if (!col || !row) return;
    let next = null;

    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrow) {
      const [dx, dy] = arrow;
      next = e.ctrlKey || e.metaKey
        ? { col: dx ? resizeSpan(col, dx * step, +1) : col, row: dy ? resizeSpan(row, dy * step, +1) : row }
        : { col: shiftSpan(col, dx * step), row: shiftSpan(row, dy * step) };
    } else if (e.key === '[' || e.key === ']') {
      const spec = specOf(sel);
      const cur = Number.isInteger(+((spec || {}).z)) ? +spec.z : parseInt(sel.node.style.zIndex, 10) || 1;
      next = { z: clampZ(cur + (e.key === ']' ? 1 : -1), sel.kind) };
      if (sel.kind === 'area' && sel.node.classList.contains('has-interaction')) {
        warn('这个区块含 sim/runnable，渲染器会把它的 z 强制为 10——改 z 不会有视觉效果。');
      }
    } else if (e.key === 'Escape') { deselect(); e.preventDefault(); e.stopPropagation(); return; }
    else return;

    e.preventDefault(); e.stopPropagation();
    if (next.col) sel.node.style.gridColumn = fmtSpan(next.col);
    if (next.row) sel.node.style.gridRow = fmtSpan(next.row);
    if (commitSpec(sel, next)) {
      if (next.z != null) sel.node.style.zIndex = String(next.z);
      deck().relayoutScene(sel.sec);
    }
    refreshBadge();
  }, true);

  /* ---------- 跟随编辑态 ---------- */
  document.addEventListener('deck:editmode', (e) => {
    on = !!(e.detail && e.detail.on);
    if (!on) { endDrag(); deselect(); }
    document.body.classList.toggle('deck-framing', on);
  });

  /* 换页/重渲后选中的节点可能已经不在文档里，清掉免得握着幽灵 */
  if (window.Reveal && Reveal.on) Reveal.on('slidechanged', () => { if (sel && !sel.node.isConnected) deselect(); });

  window.DeckFrame = {
    isOn: () => on,
    selected: () => sel && { kind: sel.kind, index: sel.index, sceneId: sel.scene.id },
    deselect,
  };
})();
