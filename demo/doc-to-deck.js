/* ============================================================================
   DocToDeck — LectureDoc v1 → reveal.js 渲染运行时
   协议见 schema/lecture-doc.schema.json 与 schema/SPEC.md。
   本文件是"运行时"：agent/作者只产出 course.lecture.json，不接触这里。
   ========================================================================== */
(async function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  /* ---------------- 基础工具 ---------------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function randn(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- freeform 逃生舱：白名单 HTML 净化 ----------------
     不是"可信任意 HTML"通道。校验器(validate.mjs)已做过一遍静态危险标签检查，
     这里是运行时的第二道关（防御性冗余，也覆盖校验器之外直接构造 DOM 的路径）。
     策略：解析进 <template>，递归遍历，剥离不在白名单里的标签/属性；
     标签被剥离时保留其子内容（不吞用户可见文本），彻底移除 script/style 等危险标签整体。 */
  const FREEFORM_TAG_ALLOW = new Set(['div', 'span', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'br', 'hr', 'small', 'sub', 'sup', 'blockquote']);
  const FREEFORM_TAG_STRIP_ENTIRELY = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button']);
  const FREEFORM_ATTR_ALLOW = new Set(['class', 'colspan', 'rowspan']);
  function sanitizeFreeformHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    (function walk(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (FREEFORM_TAG_STRIP_ENTIRELY.has(tag)) { child.remove(); continue; }
          for (const attr of [...child.attributes]) {
            if (!FREEFORM_ATTR_ALLOW.has(attr.name.toLowerCase()) || /^on/i.test(attr.name) || /javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
          }
          walk(child);
          if (!FREEFORM_TAG_ALLOW.has(tag)) { while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child); child.remove(); }
        } else if (child.nodeType !== Node.TEXT_NODE) { child.remove(); }
      }
    })(tpl.content);
    return tpl.innerHTML;
  }

  /* ---------------- 受限行内 markdown（SPEC §2） ----------------
     **b** / *em* / `code` / $latex$ ；先抽走 code 与 math 占位，转义 HTML，再回填。 */
  function inlineMd(src) {
    if (src == null) return '';
    const stash = [];
    let s = String(src)
      .replace(/\$([^$]+)\$/g, (_, tex) => { stash.push(katex.renderToString(tex, { throwOnError: false, output: 'html' })); return ' ' + (stash.length - 1) + ' '; })
      .replace(/`([^`]+)`/g, (_, code) => { stash.push('<span class="mi">' + escapeHtml(code) + '</span>'); return ' ' + (stash.length - 1) + ' '; });
    s = escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s.replace(/ (\d+) /g, (_, i) => stash[+i]);
  }
  const displayTex = (tex) => katex.renderToString(tex, { throwOnError: false, output: 'html', displayMode: true });

  /* ---------------- 受限表达式编译（SPEC §4） ----------------
     仅允许白名单标识符与数学字符；不是任意 JS。 */
  const MATH_FNS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, min: Math.min, max: Math.max, floor: Math.floor, round: Math.round, PI: Math.PI, E: Math.E };
  function compileExpr(expr, varNames) {
    if (!/^[\w\s+\-*/%(),.<>=!?:&|]*$/.test(expr)) throw new Error('表达式含非法字符: ' + expr);
    const ids = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const allowed = new Set([...varNames, ...Object.keys(MATH_FNS)]);
    for (const id of ids) if (!allowed.has(id)) throw new Error('表达式标识符不在白名单: ' + id);
    const fnKeys = Object.keys(MATH_FNS);
    const fn = new Function(...varNames, ...fnKeys, '"use strict"; return (' + expr + ');');
    return scope => fn(...varNames.map(v => scope[v]), ...fnKeys.map(k => MATH_FNS[k]));
  }
  /* 表达式 → Python 源码（runnable 的 objective1d 环境用） */
  function exprToPython(expr) {
    return expr
      .replace(/\b(sin|cos|tan|exp|log|sqrt|floor)\b/g, 'math.$1')
      .replace(/\bPI\b/g, 'math.pi').replace(/\bE\b/g, 'math.e')
      .replace(/\bpow\(/g, 'math.pow(');
  }

  /* ---------------- Cartesian 图表常量（与设计系统一致） ---------------- */
  const C_INK = '#1A1A1A', C_LINE = '#B8B0A4', C_TEXT2 = '#5A5A5A', C_ACCENT = '#8A8178';
  const TONE = { line: C_LINE, accent: C_ACCENT, ink: C_INK };
  const PLOT_STYLE = { background: 'transparent', color: C_TEXT2, fontSize: '11px', fontFamily: "'Inter',sans-serif" };

  /* ================= Block 渲染器 ================= */
  const blockRenderers = {
    hero(b, ctx) {
      const inner = el('div', 'inner');
      if (b.tag) inner.appendChild(el('div', 'tag', escapeHtml(b.tag)));
      const h1 = el('h1', null, b.title.map(escapeHtml).join('<br>'));
      if (b.titleSize) h1.style.fontSize = b.titleSize + 'px';
      inner.appendChild(h1);
      if (b.sub) inner.appendChild(el('div', 'sub', inlineMd(b.sub)));
      if (b.accentRule) inner.appendChild(el('div', 'h-accent'));
      if (b.facts) inner.appendChild(el('div', 'facts', escapeHtml(b.facts)));
      if (b.hint) inner.appendChild(el('div', 'hint', escapeHtml(b.hint)));
      return inner;
    },
    statement(b) {
      const wrap = el('div');
      const q = el('div', 'q', inlineMd(b.statement) + (b.sub ? '<br><span class="q-sub">' + inlineMd(b.sub) + '</span>' : ''));
      wrap.appendChild(q);
      if (b.cite) wrap.appendChild(el('div', 'cite', escapeHtml(b.cite)));
      return wrap;
    },
    list(b) {
      const ul = el('ul', 'pts');
      for (const it of b.items) {
        const li = el('li', it.fragment ? 'fragment' : null, inlineMd(it.text));
        ul.appendChild(li);
      }
      return ul;
    },
    agenda(b) {
      const wrap = el('div', 'agenda');
      b.rows.forEach((r, i) => {
        const row = el('div', 'agenda-row' + (r.fragment ? ' fragment' : ''));
        row.appendChild(el('span', 'num', String(i + 1)));
        row.appendChild(el('span', 'v', '<span class="k">' + escapeHtml(r.label) + '</span>' + inlineMd(r.text)));
        wrap.appendChild(row);
      });
      return wrap;
    },
    callout(b) {
      const d = el('div', 'callout' + (b.fragment ? ' fragment' : ''));
      d.innerHTML = '<span class="k">' + escapeHtml(b.label) + '</span>' + inlineMd(b.text);
      if (b.latex) {
        const m = el('div', 'mblock', displayTex(b.latex));
        if (b.latexSize) m.style.fontSize = b.latexSize + 'px';
        m.style.marginTop = '10px';
        d.appendChild(m);
      }
      return d;
    },
    formula(b) {
      const m = el('div', 'mblock', displayTex(b.latex));
      if (b.size) m.style.fontSize = b.size + 'px';
      if (b.caption) { const w = el('div'); w.appendChild(m); w.appendChild(el('div', 'cite', inlineMd(b.caption))); return w; }
      return m;
    },
    flow(b) {
      const f = el('div', 'flow');
      b.nodes.forEach((n, i) => {
        if (i > 0) f.appendChild(el('span', 'arrow', '→'));
        const node = el('div', 'node' + (n.state === 'on' ? ' on' : n.state === 'q' ? ' q' : ''));
        node.innerHTML = inlineMd(n.title) + (n.sub ? '<span class="t">' + escapeHtml(n.sub) + '</span>' : '');
        f.appendChild(node);
      });
      if (b.loopNote) f.appendChild(el('span', 'loop-note', escapeHtml(b.loopNote)));
      return f;
    },
    table(b) {
      const t = el('table', 'tbl');
      t.appendChild(el('thead', null, '<tr>' + b.head.map(h => '<th>' + escapeHtml(h) + '</th>').join('') + '</tr>'));
      const tb = el('tbody');
      for (const row of b.rows) {
        tb.appendChild(el('tr', null, row.map(c => {
          const o = typeof c === 'string' ? { text: c } : c;
          return '<td' + (o.hi ? ' class="hi"' : '') + '>' + inlineMd(o.text) + '</td>';
        }).join('')));
      }
      t.appendChild(tb);
      return t;
    },
    code(b) {
      const card = el('div', 'codecard');
      card.appendChild(el('div', 'bar', '<span class="d"></span><span class="lbl">' + escapeHtml(b.filename || '') + '</span>'));
      const pre = el('pre'); const code = el('code', 'language-' + (b.language || 'text'));
      code.textContent = b.source; pre.appendChild(code); card.appendChild(pre);
      return card;
    },
    compare(b, ctx) {
      const cols = el('div', 'cols');
      for (const side of [b.left, b.right]) {
        const cell = el('div');
        if (side.caption) cell.appendChild(el('div', 'cmp-cap', escapeHtml(side.caption)));
        cell.appendChild(renderBlock(side.block, ctx));
        cols.appendChild(cell);
      }
      return cols;
    },
    quiz(b) {
      const wrap = el('div');
      if (b.kind === 'objective') {
        wrap.dataset.answer = b.answer;
        if (b.context) wrap.appendChild(el('p', 'quiz-context', inlineMd(b.context)));
        for (const c of b.choices) {
          const ch = el('div', 'choice', '<span class="k">' + c.key.toUpperCase() + '</span><span>' + inlineMd(c.text) + '</span>');
          ch.dataset.c = c.key;
          wrap.appendChild(ch);
        }
        wrap.appendChild(el('div', 'explain', inlineMd(b.explain)));
      } else { /* subjective */
        wrap.appendChild(el('div', 'q', inlineMd(b.prompt)));
        if (b.angles && b.angles.length) {
          const ag = el('div', 'agenda'); ag.style.marginTop = '22px';
          b.angles.forEach((a, i) => {
            const row = el('div', 'agenda-row');
            row.appendChild(el('span', 'num', String(i + 1)));
            row.appendChild(el('span', 'v', inlineMd(a)));
            ag.appendChild(row);
          });
          wrap.appendChild(ag);
        }
        if (b.instruction) wrap.appendChild(blockRenderers.callout({ label: '作答要求', text: b.instruction }));
      }
      return wrap;
    },
    sim(b, ctx) { return simEngines[b.engine](b, ctx); },
    runnable(b, ctx) { return renderRunnable(b, ctx); },
    embed(b) { /* 保留位：占位框 */
      const box = el('div', 'rc-plot');
      box.style.height = '380px';
      box.appendChild(el('div', 'rc-hint', escapeHtml(b.fallbackPoster || '嵌入内容（' + b.product + '）· 接入后端后可用')));
      return box;
    },
    freeform(b) {
      /* 逃生舱：永远显眼渲染，绝不悄悄融入正常排版（见 SPEC §3.3）。
         html 已在校验阶段查过危险标签，这里净化是运行时防御性第二道关。 */
      const wrap = el('div', 'freeform');
      wrap.appendChild(el('div', 'freeform-flag', '⚠ 未分类内容（freeform）'));
      const body = el('div', 'freeform-body');
      body.innerHTML = sanitizeFreeformHtml(b.html);
      wrap.appendChild(body);
      wrap.appendChild(el('div', 'freeform-rationale', escapeHtml(b.rationale)));
      return wrap;
    }
  };
  function renderBlock(b, ctx) {
    if (b.status === 'pending') { const sk = el('div', 'rc-plot'); sk.style.height = '160px'; sk.appendChild(el('div', 'rc-hint', '生成中…')); return sk; }
    const root = blockRenderers[b.type](b, ctx);
    if (b.fragment && !root.classList.contains('fragment')) root.classList.add('fragment');
    return root;
  }

  /* ================= sim 引擎注册表 ================= */
  function paramPanelControls(b, onInput, blockCls) {
    const values = {}; const ctls = [];
    for (const p of b.params) {
      values[p.name] = p.default;
      const ctl = el('div', 'ctl');
      const lab = el('label', null, escapeHtml(p.label) + ' <span class="v"></span>');
      const input = el('input'); input.type = 'range'; input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.default;
      const vspan = lab.querySelector('.v');
      const fmt = v => (+v).toFixed(p.decimals ?? 2);
      vspan.textContent = fmt(p.default);
      input.addEventListener('input', () => { values[p.name] = +input.value; vspan.textContent = fmt(input.value); onInput(); });
      ctl.appendChild(lab); ctl.appendChild(input); ctls.push(ctl);
    }
    return { values, ctls };
  }

  const simEngines = {
    /* —— searchCompare：一维黑箱优化三策略对比（网格/随机/贝叶斯 GP+LCB） —— */
    searchCompare(b, ctx) {
      const M = b.model;
      const f = compileExpr(M.objective, ['x']);
      const truef = x => f({ x });
      const [x0, x1] = M.domain;
      const dense = d3.range(0, 201).map(i => { const x = x0 + (x1 - x0) * i / 200; return { x, y: truef(x) }; });
      const clampx = x => Math.max(x0, Math.min(x1, x));
      let seed = 20260705;

      function gridPts(n) { const p = []; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)); p.push({ x, y: truef(x) }); } return p; }
      function randomPts(n, s) { const rng = mulberry32(s); const p = []; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * rng(); p.push({ x, y: truef(x) }); } return p; }
      function invert(A) { const n = A.length; const Mx = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => i === j ? 1 : 0)));
        for (let c = 0; c < n; c++) { let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[pv][c])) pv = r; [Mx[c], Mx[pv]] = [Mx[pv], Mx[c]];
          const d = Mx[c][c] || 1e-9; for (let j = 0; j < 2 * n; j++) Mx[c][j] /= d;
          for (let r = 0; r < n; r++) { if (r === c) continue; const fac = Mx[r][c]; for (let j = 0; j < 2 * n; j++) Mx[r][j] -= fac * Mx[c][j]; } }
        return Mx.map(r => r.slice(n)); }
      const mv = (Mx, v) => Mx.map(r => r.reduce((s, x, i) => s + x * v[i], 0));
      const dot = (a, b2) => a.reduce((s, x, i) => s + x * b2[i], 0);
      function bayesPts(n, s) {
        const rng = mulberry32(s ^ 0x9e37), ell = 0.55, sf2 = 1, noise = 1e-4, kappa = 2;
        const k = (a, b2) => sf2 * Math.exp(-((a - b2) ** 2) / (2 * ell * ell));
        const X = [], Y = [], init = Math.min(3, n);
        for (let i = 0; i < init; i++) { const x = clampx(x0 + (x1 - x0) * ((i + 0.5) / init + (rng() - 0.5) * 0.12)); X.push(x); Y.push(truef(x)); }
        const cand = d3.range(0, 151).map(i => x0 + (x1 - x0) * i / 150);
        while (X.length < n) {
          const m = X.length, K = [];
          for (let i = 0; i < m; i++) { K.push([]); for (let j = 0; j < m; j++) K[i].push(k(X[i], X[j]) + (i === j ? noise : 0)); }
          const Ki = invert(K), al = mv(Ki, Y); let best = Infinity, bx = cand[0];
          for (const x of cand) { const ks = X.map(xi => k(x, xi)); const mu = dot(ks, al); const v = Math.max(1e-9, sf2 - dot(ks, mv(Ki, ks)));
            const lcb = mu - kappa * Math.sqrt(v); if (lcb < best) { best = lcb; bx = x; } }
          X.push(bx); Y.push(truef(bx));
        }
        return X.map((x, i) => ({ x, y: Y[i] }));
      }
      const STRATS = { grid: { color: C_LINE, pts: n => gridPts(n) }, random: { color: C_ACCENT, pts: n => randomPts(n, seed) }, bayes: { color: C_INK, pts: n => bayesPts(n, seed) } };
      function miniChart(pts, color) {
        const best = pts.reduce((a, b2) => b2.y < a.y ? b2 : a, pts[0]);
        return Plot.plot({ width: 352, height: 296, marginLeft: 42, marginBottom: 34, marginTop: 8, marginRight: 14, style: PLOT_STYLE,
          x: { domain: M.domain, label: 'λ →', ticks: 5 }, y: { domain: M.yDomain, label: '↓ f(λ)', grid: true, ticks: 5 },
          marks: [
            Plot.line(dense, { x: 'x', y: 'y', stroke: C_LINE, strokeWidth: 1.4 }),
            Plot.dot(pts, { x: 'x', y: 'y', fill: color, r: 4, fillOpacity: .9 }),
            Plot.dot([best], { x: 'x', y: 'y', r: 8, stroke: C_INK, strokeWidth: 2, fill: 'var(--bg)' })
          ] });
      }
      const root = el('div');
      const bar = el('div', 'labbar');
      const { values, ctls } = paramPanelControls(b, render);
      ctls.forEach(c => { c.style.display = 'flex'; c.style.alignItems = 'center'; c.style.gap = '12px'; bar.appendChild(c); });
      if (b.reseedLabel) { const btn = el('button', 'btn', escapeHtml(b.reseedLabel)); btn.onclick = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; render(); }; bar.appendChild(btn); }
      if (b.legend) bar.appendChild(el('div', 'legend', escapeHtml(b.legend)));
      const row = el('div', 'charts');
      root.appendChild(bar); root.appendChild(row);
      function render() {
        if (!window.Plot) return;
        row.innerHTML = '';
        const n = Math.round(values[M.budgetParam]);
        const results = M.strategies.map(sname => { const pts = STRATS[sname].pts(n); return { sname, pts, best: Math.min(...pts.map(p => p.y)) }; });
        const winner = results.reduce((a, r) => r.best < a.best ? r : a, results[0]);
        for (const r of results) {
          const box = el('div', 'mini' + (r === winner ? ' win' : ''));
          box.appendChild(el('div', 'mtitle', '<span>' + escapeHtml((b.labels || {})[r.sname] || r.sname) + '</span><b>' + r.best.toFixed(2) + '</b>'));
          box.appendChild(miniChart(r.pts, STRATS[r.sname].color));
          row.appendChild(box);
        }
      }
      ctx.onReady(render);
      return root;
    },

    /* —— dynamics1d：一维迭代动力学（滑块 → 轨迹） —— */
    dynamics1d(b, ctx) {
      const M = b.model;
      const paramNames = b.params.map(p => p.name);
      const constNames = Object.keys(M.consts || {});
      const update = compileExpr(M.update, [M.stateVar, ...paramNames, ...constNames, 'xi']);
      const regimes = (b.regimes || []).map(r => ({ ...r, test: compileExpr(r.when, paramNames) }));
      const noiseNote = b.noiseNote ? { ...b.noiseNote, test: compileExpr(b.noiseNote.when, paramNames) } : null;
      let seed = 770043;

      const root = el('div');
      root.classList.add('lab');
      const panel = el('div', 'panel');
      const { values, ctls } = paramPanelControls(b, render);
      ctls.forEach(c => panel.appendChild(c));
      const badge = el('div', 'badge'); panel.appendChild(badge);
      if (b.sidecar && b.sidecar.code) panel.appendChild(blockRenderers.code(b.sidecar.code));
      if (b.reseedLabel) { const btn = el('button', 'btn', escapeHtml(b.reseedLabel)); btn.onclick = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; render(); }; panel.appendChild(btn); }
      const plotwrap = el('div', 'plotwrap');
      root.appendChild(panel); root.appendChild(plotwrap);

      function run() {
        const rng = mulberry32(seed);
        let c = M.init; const out = [{ t: 0, c }];
        for (let t = 1; t <= M.steps; t++) {
          const scope = { [M.stateVar]: c, ...values, ...(M.consts || {}), xi: randn(rng) };
          c = update(scope);
          c = Math.max(-1e3, Math.min(1e3, c));
          out.push({ t, c });
        }
        return out;
      }
      function render() {
        if (!window.Plot) return;
        const reg = regimes.find(r => r.test(values)) || regimes[regimes.length - 1];
        const color = TONE[reg.tone || 'ink'] || C_INK;
        const dash = reg.dash && reg.dash !== 'solid' ? reg.dash : null;
        let desc = reg.desc;
        if (noiseNote && noiseNote.test(values)) desc += noiseNote.text;
        badge.innerHTML = '<span class="rt">' + escapeHtml(reg.label) + '</span>' + escapeHtml(desc);
        const data = run();
        const cs = data.map(d => d.c);
        const tl = (b.chart && b.chart.targetLine) || null;
        const lo = Math.max(-3, Math.min(...cs) - 0.2), hi = Math.min(4, Math.max((tl ? tl.value + 0.2 : 1.2), Math.max(...cs) + 0.2));
        plotwrap.innerHTML = '';
        const marks = [];
        if (tl) {
          marks.push(Plot.ruleY([tl.value], { stroke: C_LINE, strokeDasharray: '5 5' }));
          marks.push(Plot.text([{ t: M.steps, c: tl.value }], { x: 't', y: 'c', text: [tl.label], textAnchor: 'end', dy: -8, fill: C_TEXT2, fontSize: 12 }));
        }
        marks.push(Plot.line(data, { x: 't', y: 'c', stroke: color, strokeWidth: 2.4, strokeDasharray: dash, curve: 'catmull-rom' }));
        marks.push(Plot.dot(data, { x: 't', y: 'c', fill: color, r: 2.4 }));
        plotwrap.appendChild(Plot.plot({ width: 744, height: 418, marginLeft: 52, marginBottom: 44, marginTop: 14, marginRight: 20, style: PLOT_STYLE,
          x: { domain: [0, M.steps], label: (b.chart || {}).xLabel, ticks: 8 },
          y: { domain: [lo, hi], label: (b.chart || {}).yLabel, grid: true },
          marks }));
      }
      ctx.onReady(render);
      return root;
    },

    /* —— custom：沙箱代码逃生舱（SPEC §3.2） —— */
    custom(b, ctx) {
      const root = el('div');
      root.classList.add('lab');
      const panel = el('div', 'panel');
      const { values, ctls } = paramPanelControls(b, render);
      ctls.forEach(c => panel.appendChild(c));
      const note = el('div', 'badge'); panel.appendChild(note);
      let seed = 424242;
      if (b.reseedLabel) { const btn = el('button', 'btn', escapeHtml(b.reseedLabel)); btn.onclick = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; render(); }; panel.appendChild(btn); }
      const plotwrap = el('div', 'plotwrap');
      root.appendChild(panel); root.appendChild(plotwrap);
      const AF = Object.getPrototypeOf(async function () {}).constructor;
      const compute = new AF('params', 'rng', '"use strict";\nreturn (' + b.computeJs + ')(params, rng);');
      async function render() {
        if (!window.Plot) return;
        try {
          const out = await compute({ ...values }, mulberry32(seed));
          note.innerHTML = out.note ? escapeHtml(out.note) : '';
          plotwrap.innerHTML = '';
          const marks = (out.series || []).flatMap(s => [
            Plot.line(s.points, { x: 'x', y: 'y', stroke: TONE[s.tone || 'ink'], strokeWidth: 2.2, strokeDasharray: s.dash && s.dash !== 'solid' ? s.dash : null }),
          ]);
          const ch = b.chart || {};
          plotwrap.appendChild(Plot.plot({ width: 744, height: 418, marginLeft: 52, marginBottom: 44, marginTop: 14, marginRight: 20, style: PLOT_STYLE,
            x: { label: ch.xLabel, domain: ch.xDomain }, y: { label: ch.yLabel, domain: ch.yDomain, grid: true }, marks }));
        } catch (e) { note.innerHTML = '<span class="rt">计算出错</span>' + escapeHtml(e.message || String(e)); }
      }
      ctx.onReady(render);
      return root;
    }
  };

  /* ================= runnable：可编辑可运行代码单元 =================
     约束：每个 deck 至多一个（编辑器传送门为单例，见 knowledge-base/001）。 */
  let runnableWired = false;
  function renderRunnable(b, ctx) {
    if (runnableWired) { const w = el('div', 'rc-hint', '（本版运行时每个讲义仅支持一个可运行单元）'); return w; }
    runnableWired = true;
    /* 环境构建 */
    let jsCtxFactory, pyPreamble, resultChartCfg;
    if (b.env.kind === 'objective1d') {
      const f = compileExpr(b.env.objective, ['x']);
      const truef = x => f({ x });
      const [x0, x1] = b.env.domain;
      const N = b.env.candidates || 200;
      const cand = d3.range(0, N).map(i => x0 + (x1 - x0) * i / (N - 1));
      const predict = (observed, x) => { let nn = observed[0], dmin = Infinity; for (const p of observed) { const d = Math.abs(p.x - x); if (d < dmin) { dmin = d; nn = p; } } return [nn.y, dmin]; };
      jsCtxFactory = () => ({ truef, DOM: b.env.domain, candidates: cand, predict });
      pyPreamble = [
        'import math',
        'DOM = (' + x0 + ', ' + x1 + ')',
        'def truef(x):',
        '    return ' + exprToPython(b.env.objective),
        'candidates = [DOM[0] + (DOM[1]-DOM[0])*i/' + (N - 1) + ' for i in range(' + N + ')]',
        'def predict(observed, x):',
        '    nearest = min(observed, key=lambda p: abs(p["x"]-x))',
        '    d = min(abs(p["x"]-x) for p in observed)',
        '    return (nearest["y"], d)'
      ].join('\n');
      resultChartCfg = { truef, domain: b.env.domain, yDomain: b.env.yDomain };
    } else { /* custom env */
      const AF = Object.getPrototypeOf(async function () {}).constructor;
      const mk = new Function('"use strict"; return (' + b.env.jsPreamble + ');');
      jsCtxFactory = () => mk();
      pyPreamble = b.env.pythonPreamble || '';
      resultChartCfg = null;
    }

    /* DOM */
    const root = el('div');
    root.classList.add('runlab');
    const edCol = el('div', 'editor-col');
    const tabs = el('div', 'rc-tabs');
    const langBtns = {};
    const LANG_LABEL = { python: 'Python', js: 'JavaScript' };
    for (const lang of b.languages) {
      const btn = el('button', null, LANG_LABEL[lang]); btn.dataset.lang = lang;
      tabs.appendChild(btn); langBtns[lang] = btn;
    }
    const resetBtn = el('button', 'rc-reset', '↺ 复位'); resetBtn.title = '恢复初始代码';
    const runBtn = el('button', 'rc-run', '▶ Run');
    tabs.appendChild(resetBtn); tabs.appendChild(runBtn);
    const anchor = el('div', 'rc-editor-anchor'); anchor.id = 'rcEditor';
    edCol.appendChild(tabs); edCol.appendChild(anchor);
    const outCol = el('div', 'out-col');
    const plotBox = el('div', 'rc-plot'); plotBox.id = 'rcPlot';
    plotBox.appendChild(el('div', 'rc-hint', escapeHtml(b.hint || '▶ Run')));
    const consoleBox = el('div', 'rc-console'); consoleBox.id = 'rcConsole';
    consoleBox.innerHTML = '<span class="k">' + escapeHtml(b.consoleHint || '') + '</span>';
    outCol.appendChild(plotBox); outCol.appendChild(consoleBox);
    root.appendChild(edCol); root.appendChild(outCol);

    /* 状态 */
    let rcLang = b.languages[0];
    langBtns[rcLang].classList.add('on');
    const starter = { python: b.starter.python || '', js: b.starter.js || '' };
    const buf = { python: starter.python, js: starter.js };
    let cm = null, pyodide = null, pyLoading = null;

    function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('加载失败: ' + src)); document.head.appendChild(s); }); }
    async function ensurePy() {
      if (pyodide) return pyodide;
      if (!pyLoading) pyLoading = (async () => {
        if (!window.loadPyodide) await loadScript('vendor/pyodide/pyodide.js');
        const py = await loadPyodide({ indexURL: 'vendor/pyodide/' });
        if (pyPreamble) py.runPython(pyPreamble);
        pyodide = py; return py;
      })();
      return pyLoading;
    }
    function initCM() {
      if (cm || !window.CodeMirror) return;
      cm = CodeMirror($('#rcEditorPortal'), { value: buf[rcLang], mode: rcLang === 'python' ? 'python' : 'javascript', theme: 'eclipse', lineNumbers: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity });
      window.__rcCM = cm; /* ResizeObserver 钩子用 */
    }
    function setLang(l) {
      if (l === rcLang) return;
      buf[rcLang] = cm.getValue(); rcLang = l;
      cm.setOption('mode', l === 'python' ? 'python' : 'javascript'); cm.setValue(buf[l]);
      Object.entries(langBtns).forEach(([k, btn]) => btn.classList.toggle('on', k === l));
      cm.refresh();
    }
    Object.entries(langBtns).forEach(([k, btn]) => btn.onclick = () => setLang(k));
    resetBtn.onclick = () => { buf[rcLang] = starter[rcLang]; cm.setValue(starter[rcLang]); };

    function renderResult(pts) {
      plotBox.innerHTML = '';
      if (!Array.isArray(pts) || !pts.length) { plotBox.appendChild(el('div', 'rc-hint', 'result 为空——记得把选中的点赋给 result')); return; }
      const wo = pts.map((p, i) => ({ x: +p.x, y: +p.y, i })); const best = wo.reduce((a, b2) => b2.y < a.y ? b2 : a);
      const marks = [];
      if (resultChartCfg) {
        const [x0, x1] = resultChartCfg.domain;
        const dense = d3.range(0, 201).map(i => { const x = x0 + (x1 - x0) * i / 200; return { x, y: resultChartCfg.truef(x) }; });
        marks.push(Plot.line(dense, { x: 'x', y: 'y', stroke: C_LINE, strokeWidth: 1.4 }));
      }
      marks.push(Plot.dot(wo, { x: 'x', y: 'y', fill: 'i', r: 5.5, stroke: C_INK, strokeWidth: 0.6 }));
      marks.push(Plot.dot([best], { x: 'x', y: 'y', r: 10, stroke: C_INK, strokeWidth: 2, fill: 'none', strokeDasharray: '3,2' }));
      marks.push(Plot.text(wo, { x: 'x', y: 'y', text: d => d.i + 1, dy: -11, fontSize: 9, fill: C_TEXT2 }));
      plotBox.appendChild(Plot.plot({ width: 500, height: 288, marginLeft: 44, marginBottom: 38, marginTop: 12, marginRight: 16, style: PLOT_STYLE,
        x: { domain: resultChartCfg ? resultChartCfg.domain : undefined, label: 'λ →', ticks: 6 },
        y: { domain: resultChartCfg ? resultChartCfg.yDomain : undefined, label: '↓ f(λ)', grid: true, ticks: 6 },
        color: { type: 'linear', range: ['#D8D2C6', C_INK], domain: [0, wo.length] },
        marks }));
    }
    const rcEscape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    async function runJS(code) {
      const logs = [];
      const base = jsCtxFactory();
      const ctx2 = { ...base, console: { log: (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ')) } };
      const AF = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AF(...Object.keys(ctx2), '"use strict";\nlet result;\n' + code + '\n;return result;');
      const result = await fn(...Object.values(ctx2));
      return { result, logs };
    }
    async function runPy(code) {
      const py = await ensurePy(); const logs = [];
      py.setStdout({ batched: s => logs.push(s) }); py.setStderr({ batched: s => logs.push(s) });
      py.globals.set('result', py.toPy([]));
      await py.runPythonAsync(code);
      const r = py.globals.get('result');
      const result = (r && r.toJs) ? r.toJs({ dict_converter: Object.fromEntries }) : [];
      if (r && r.destroy) r.destroy();
      return { result, logs };
    }
    runBtn.onclick = async () => {
      const code = cm.getValue(); buf[rcLang] = code;
      runBtn.disabled = true; const label = runBtn.textContent;
      try {
        if (rcLang === 'python' && !pyodide) consoleBox.innerHTML = '<span class="k">正在初始化 Python 运行时…</span>';
        runBtn.textContent = '运行中…';
        const out = rcLang === 'python' ? await runPy(code) : await runJS(code);
        consoleBox.textContent = out.logs.join('\n') || '(无 print 输出)';
        renderResult(out.result);
      } catch (e) { consoleBox.innerHTML = '<span class="err">✗ ' + rcEscape((e && e.message) || e) + '</span>'; }
      finally { runBtn.disabled = false; runBtn.textContent = label; }
    };

    /* 传送门激活（FE-48：CodeMirror 不能住在 transform:scale 子树里） */
    ctx.registerRunnableActivator({ initCM });
    return root;
  }

  /* ================= Scene → <section> ================= */
  function renderScene(scene, ctx) {
    const sec = document.createElement('section');
    if (scene.kind === 'hero') sec.className = 'cover';
    if (scene.kind === 'statement') sec.className = 'bigidea';
    if (scene.kind === 'quiz') sec.className = 'quiz';
    /* 装饰环 */
    for (const r of (scene.decor && scene.decor.rings) || []) {
      const g = el('div', 'geo-ring');
      g.style.width = g.style.height = r.size + 'px';
      for (const side of ['top', 'right', 'bottom', 'left']) if (r[side] != null) g.style[side] = r[side] + 'px';
      sec.appendChild(g);
    }
    const pad = el('div', 'pad');
    if (scene.kind === 'hero') {
      pad.appendChild(renderBlock(scene.blocks[0], ctx));
    } else {
      if (scene.eyebrow) pad.appendChild(el('div', 'eyebrow', escapeHtml(scene.eyebrow)));
      if (scene.headline) {
        const h = el('h2', 'headline', inlineMd(scene.headline));
        if (scene.headlineSize) h.style.fontSize = scene.headlineSize + 'px';
        pad.appendChild(h);
      }
      if (scene.lead) pad.appendChild(el('div', 'lead', inlineMd(scene.lead)));
      const body = el('div', 'body');
      const single = scene.blocks.length === 1 && ['sim', 'runnable'].includes(scene.blocks[0].type);
      if (single) {
        const rendered = renderBlock(scene.blocks[0], ctx);
        /* sim/runnable 渲染器返回的根节点自带 lab/runlab 网格类 → 直接作为 body */
        rendered.classList.add('body');
        pad.appendChild(rendered);
      } else {
        body.style.display = 'flex'; body.style.flexDirection = 'column';
        const L = scene.layout || {};
        body.style.gap = (L.gap != null ? L.gap : 18) + 'px';
        if (L.centered) body.style.justifyContent = 'center';
        for (const blk of scene.blocks) body.appendChild(renderBlock(blk, ctx));
        pad.appendChild(body);
      }
    }
    sec.appendChild(pad);
    const notes = document.createElement('aside');
    notes.className = 'notes'; notes.innerHTML = inlineMd(scene.notes);
    sec.appendChild(notes);
    return sec;
  }

  /* ================= 装配 & 启动 ================= */
  const doc = await fetch('course.lecture.json').then(r => r.json());
  document.title = doc.title;

  const readyCallbacks = [];
  let runnableActivator = null;
  const ctx = {
    onReady: fn => readyCallbacks.push(fn),
    registerRunnableActivator: a => { runnableActivator = a; }
  };

  const slidesEl = $('#slides');
  for (const scene of doc.scenes) slidesEl.appendChild(renderScene(scene, ctx));

  /* ---- quiz 判分（事件委托） ---- */
  document.addEventListener('click', e => {
    const ch = e.target.closest('.choice'); if (!ch) return;
    const box = ch.closest('[data-answer]'); if (!box || box.dataset.done) return; box.dataset.done = '1';
    const ok = ch.dataset.c === box.dataset.answer;
    ch.classList.add(ok ? 'correct' : 'wrong');
    if (!ok) { const c = box.querySelector('.choice[data-c="' + box.dataset.answer + '"]'); if (c) c.classList.add('correct'); }
    const ex = box.querySelector('.explain'); if (ex) ex.classList.add('show');
  });

  /* ---- 备注浮层 ---- */
  function notesHtml() { const s = Reveal.getCurrentSlide(); const a = s && s.querySelector('aside.notes');
    return '<div class="lbl">演讲者备注</div>' + (a ? a.innerHTML : '（本页无备注）'); }
  function toggleNotes() { const ov = $('#notesOv');
    if (ov.classList.contains('show')) { ov.classList.remove('show'); $('#btnNotes').classList.remove('on'); }
    else { ov.innerHTML = notesHtml(); ov.classList.add('show'); $('#btnNotes').classList.add('on'); } }
  function refreshNotes() { if ($('#notesOv').classList.contains('show')) $('#notesOv').innerHTML = notesHtml(); }

  /* ---- AI 助教（数据驱动：doc.tutor） ---- */
  const KB = ((doc.tutor || {}).kb || []).map(k => [new RegExp(k.pattern, k.flags || ''), inlineMd(k.answer)]);
  const SUGG = (doc.tutor || {}).suggestions || [];
  function curInfo() { const s = Reveal.getCurrentSlide();
    const t = s && (s.querySelector('.headline')?.textContent || s.querySelector('h2,h1')?.textContent || s.querySelector('.eyebrow')?.textContent) || '本页';
    return t.trim(); }
  function openTutor() { $('#tutorPanel').classList.add('open'); $('#btnTutor').classList.add('on'); updateCtx();
    if (!$('#tutorSugg').dataset.init) { $('#tutorSugg').dataset.init = '1';
      SUGG.forEach(q => { const b = el('button', null, q); b.onclick = () => ask(q); $('#tutorSugg').appendChild(b); }); } }
  function closeTutor() { $('#tutorPanel').classList.remove('open'); $('#btnTutor').classList.remove('on'); }
  function updateCtx() { $('#tutorCtx').innerHTML = '当前上下文：<b>' + curInfo() + '</b>'; }
  function ask(q) { const b = $('#tutorBody'); b.appendChild(el('div', 'msg u', escapeHtml(q)));
    let ans = '结合本页「' + curInfo() + '」：'; const hit = KB.find(([re]) => re.test(q));
    ans += hit ? hit[1] : '好问题。真实产品里我会把<b>当前这页的要点与你的进度</b>作为上下文发给后端对话模型，给出针对性讲解。（demo 本地离线应答）';
    b.appendChild(el('div', 'msg a', '<div class="who">✦ AI 助教 · 已注入本页上下文</div>' + ans)); b.scrollTop = b.scrollHeight; }

  /* ---- 传送门（FE-48）：编辑器挂 body 下，rAF 同步屏幕矩形 ---- */
  let rcPortalRAF = null;
  function syncPortalRect() {
    const anchor = $('#rcEditor'), portal = $('#rcEditorPortal');
    if (!anchor || !portal) return;
    const r = anchor.getBoundingClientRect();
    portal.style.left = r.left + 'px'; portal.style.top = r.top + 'px';
    portal.style.width = r.width + 'px'; portal.style.height = r.height + 'px';
  }
  function activateRunCell(slide) {
    const portal = $('#rcEditorPortal');
    const on = !!(slide && slide.querySelector('#rcEditor'));
    if (!on) { if (portal) portal.style.display = 'none'; if (rcPortalRAF) { cancelAnimationFrame(rcPortalRAF); rcPortalRAF = null; } return; }
    if (runnableActivator) runnableActivator.initCM();
    portal.style.display = 'block';
    if (window.__rcCM) window.__rcCM.refresh();
    if (!rcPortalRAF) { const loop = () => { syncPortalRect(); rcPortalRAF = requestAnimationFrame(loop); }; loop(); }
  }

  /* ---- chrome 事件 ---- */
  $('#btnTutor').onclick = () => $('#tutorPanel').classList.contains('open') ? closeTutor() : openTutor();
  $('#tutorClose').onclick = closeTutor;
  $('#tutorSend').onclick = () => { const v = $('#tutorInput').value.trim(); if (v) { ask(v); $('#tutorInput').value = ''; } };
  $('#tutorInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#tutorSend').click(); });
  $('#btnNotes').onclick = toggleNotes;
  $('#btnOverview').onclick = () => Reveal.toggleOverview();
  $('#btnPrev').onclick = () => Reveal.prev();
  $('#btnNext').onclick = () => Reveal.next();
  document.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'a' || e.key === 'A') $('#btnTutor').click(); });

  /* ---- reveal 启动 ---- */
  Reveal.initialize({ hash: true, slideNumber: 'c/t', controls: false, progress: true, center: false,
    transition: 'slide', backgroundTransition: 'fade', width: 1280, height: 720, margin: 0,
    viewDistance: 5, hashOneBasedIndex: true, plugins: [RevealHighlight] });
  Reveal.on('ready', e => { readyCallbacks.forEach(fn => fn()); activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); });
  Reveal.on('slidechanged', e => { activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); });
  /* reveal 缩放变化时 CodeMirror 度量会过期（FE-48），ResizeObserver 兜底 refresh */
  new ResizeObserver(() => { if (window.__rcCM) requestAnimationFrame(() => window.__rcCM.refresh()); }).observe($('.reveal'));
})();
