/* ============================================================================
   DocToDeck — LectureDoc v1 → reveal.js 渲染运行时
   协议见 schema/lecture-doc.schema.json 与 schema/SPEC.md。
   本文件是"运行时"：agent/作者只产出 course.lecture.json，不接触这里。
   ========================================================================== */
(async function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  /* ---- 运行时状态（live.html 可重渲时复用） ----
     KB/SUGG 改为 let：renderDoc 重渲时按新 doc 重新初始化（旧版 const 一次定死，重渲后 AI 助教还用旧词表）。
     chromeBound/revealInited 是幂等守护：重渲只刷 slides + Reveal.sync()，不重复绑按钮 / 不重复 initialize。 */
  let currentDoc = null;
  let KB = [], SUGG = [];
  let chromeBound = false, revealInited = false;
  let runnableActivator = null;
  let rcPortalRAF = null;
  const readyCallbacks = [];
  const ctx = {
    onReady: fn => readyCallbacks.push(fn),
    registerRunnableActivator: a => { runnableActivator = a; },
    previewMode: false,
  };

  /* ---------------- 基础工具 ---------------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function randn(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- widget 逃生舱：自包含 HTML 片段 → sandbox iframe（借鉴 GenUI，见 SPEC §3.2） ----------------
     iframe 用 srcdoc + sandbox="allow-scripts"（**不含** allow-same-origin）→ 文档是 null origin：
     脚本能跑，但取不到 vendor/、发不出网络请求、碰不到父页面——比 sim.custom 的"omission 沙箱"更强的真隔离。
     当前主题 token 序列化注入 iframe 的 :root，片段内 canvas 用 getComputedStyle 读 --token → 主题一致。
     代价：null-origin iframe 加载不到我们 vendored woff2，字体降级到 Georgia/系统栈（sim 以 canvas 绘制为主，可接受）。 */
  const widgetBuilds = [];   // 每个已挂载 widget 的重建函数；主题变化时全部重跑（refreshThemeColors 内调用）
  const WIDGET_TOKENS = ['--bg', '--bg2', '--card', '--ink', '--text2', '--accent', '--line', '--serif', '--sans', '--mono', '--radius', '--sel'];
  function buildWidgetSrcdoc(fragment) {
    const cs = getComputedStyle(document.documentElement);
    const theme = document.documentElement.dataset.theme || 'cartesian';
    const vars = WIDGET_TOKENS.map(t => t + ':' + (cs.getPropertyValue(t).trim() || 'inherit')).join(';');
    return '<!doctype html><html data-theme="' + escapeHtml(theme) + '"><head><meta charset="utf-8"><style>'
      + ':root{' + vars + '}'
      + '*{box-sizing:border-box}'
      + 'html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px}'
      + 'button{font-family:var(--sans);font-size:13px;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:var(--radius,0);padding:6px 12px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s}'
      + 'button:hover{border-color:var(--ink)}button:active{transform:scale(.97)}'
      + 'input[type=range]{accent-color:var(--ink)}'
      + '.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}'
      + '</style></head><body>' + fragment + '</body></html>';
  }

  /* ---------------- freeform 逃生舱：白名单 HTML 净化（布局+媒体+token 绑定样式） ----------------
     不是"可信任意 HTML"通道。核心原则（SPEC §3.3 / §8）：**自由在布局，不在裸视觉**——
     放行结构/媒体/SVG 与布局类 style，但 color/font/背景/描边等"品牌"属性只接受 var(--token)/
     currentColor 等，裸色值/裸字体一律剥离，从而 freeform 也强制在主题内、不产生 slop。
     校验器(validate.mjs)已做静态预检；这里是运行时权威净化。 */
  const FF_TAG_ALLOW = new Set(['div', 'span', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'em', 'b', 'i', 'u', 'br', 'hr', 'small', 'sub', 'sup', 'blockquote', 'figure', 'figcaption', 'code', 'pre', 'a', 'img', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text']);
  const FF_TAG_STRIP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'source']);
  const FF_ATTR_PLAIN = new Set(['class', 'colspan', 'rowspan', 'alt', 'width', 'height', 'viewbox', 'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'text-anchor', 'font-size', 'opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden', 'role']);
  const FF_LAYOUT_PROPS = new Set(['display', 'grid', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-template', 'grid-column', 'grid-row', 'grid-area', 'grid-auto-flow', 'grid-auto-rows', 'grid-auto-columns', 'gap', 'row-gap', 'column-gap', 'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-content', 'align-self', 'justify-content', 'justify-items', 'justify-self', 'place-items', 'place-content', 'place-self', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'top', 'left', 'right', 'bottom', 'inset', 'transform', 'transform-origin', 'text-align', 'aspect-ratio', 'object-fit', 'order', 'overflow', 'overflow-x', 'overflow-y', 'box-sizing', 'border-radius', 'border-width', 'border-style', 'list-style', 'list-style-type', 'line-height', 'letter-spacing', 'font-size', 'font-weight', 'font-style', 'z-index', 'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'float', 'clear', 'columns', 'column-count', 'text-transform']);
  const FF_TOKEN_PROPS = new Set(['color', 'background', 'background-color', 'background-image', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'outline', 'outline-color', 'fill', 'stroke', 'box-shadow', 'text-shadow', 'text-decoration-color', 'font-family']);
  const FF_PAINT_OK = /var\(\s*--/;                                    // 引用了主题 token
  const FF_KEYWORD_OK = /^(currentcolor|transparent|none|inherit|initial|unset)$/i;
  function ffSafeSrc(v) { return /^(vendor\/|assets\/|\.\/|data:image\/)/i.test(v.trim()); }
  function ffSafeHref(v) { return !/^\s*(javascript|data|vbscript):/i.test(v); }
  function ffSafePaint(v) { return FF_PAINT_OK.test(v) || FF_KEYWORD_OK.test(v.trim()); }
  function ffFilterStyle(styleStr) {
    const out = [];
    for (const decl of String(styleStr).split(';')) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (!prop || !val) continue;
      if (/url\(/i.test(val) || /expression\(/i.test(val)) continue;      // 禁 url()（外链/追踪）与老式 expression()
      if (prop === 'position') { if (/^(relative|absolute|static|sticky)$/i.test(val)) out.push(prop + ':' + val); continue; }  // 禁 fixed
      if (FF_LAYOUT_PROPS.has(prop)) { out.push(prop + ':' + val); continue; }
      if (FF_TOKEN_PROPS.has(prop)) { if (ffSafePaint(val)) out.push(prop + ':' + val); continue; } // 颜色/字体只接受 token
      /* 未知属性 → 丢弃 */
    }
    return out.join('; ');
  }
  function sanitizeFreeformHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    (function walk(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (FF_TAG_STRIP.has(tag)) { child.remove(); continue; }
          let drop = false;
          for (const attr of [...child.attributes]) {
            const name = attr.name.toLowerCase(), val = attr.value;
            if (/^on/i.test(name)) { child.removeAttribute(attr.name); continue; }
            if (name === 'style') { const f = ffFilterStyle(val); if (f) child.setAttribute('style', f); else child.removeAttribute(attr.name); continue; }
            if (name === 'src') { if (tag === 'img' && !ffSafeSrc(val)) { drop = true; } continue; }
            if (name === 'href') { if (!ffSafeHref(val)) child.removeAttribute(attr.name); continue; }
            if (name === 'fill' || name === 'stroke') { if (!ffSafePaint(val)) child.removeAttribute(attr.name); continue; }
            if (FF_ATTR_PLAIN.has(name)) continue;
            child.removeAttribute(attr.name);
          }
          if (drop) { child.remove(); continue; }               // img 的 src 非法 → 整个删掉
          walk(child);
          if (!FF_TAG_ALLOW.has(tag)) { while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child); child.remove(); }
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
    /* 占位符用私有区哨兵 <idx>，绝不与正文冲突。
       （旧版用 " <idx> " 空格包数字，会和正文里带空格的数字如 "重 27 吨" 撞车——27 被当成占位下标，
        stash[27] 不存在→渲染出 "undefined"，或误插入别处的公式/代码。CJK 排版要求数字两侧留空格，命中面很广。） */
    const stash_ph = () => '' + (stash.length - 1) + '';
    let s = String(src)
      .replace(/\$([^$]+)\$/g, (_, tex) => { stash.push(katex.renderToString(tex, { throwOnError: false, output: 'html' })); return stash_ph(); })
      .replace(/`([^`]+)`/g, (_, code) => { stash.push('<span class="mi">' + escapeHtml(code) + '</span>'); return stash_ph(); });
    s = escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s.replace(/(\d+)/g, (_, i) => stash[+i]);
  }
  /* latex 字段应是纯 LaTeX 源码；防御性剥掉误加的 $…$ / $$…$$ 包裹（否则 KaTeX 把 $ 当非法字符、整串标红回退）。 */
  const stripDollar = (t) => String(t).trim().replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();
  const displayTex = (tex) => katex.renderToString(stripDollar(tex), { throwOnError: false, output: 'html', displayMode: true });

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

  /* ---------------- 图表配色：从当前主题 token 读，随 data-theme 切换 ----------------
     C_* / TONE / PLOT_STYLE 是 let，refreshThemeColors() 在设好 data-theme 后赋值；
     所有 Plot/CodeMirror 渲染在此之后发生，读到的是当前主题的值。 */
  let C_INK, C_LINE, C_TEXT2, C_ACCENT, TONE, PLOT_STYLE;
  function refreshThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, f) => (cs.getPropertyValue(n).trim() || f);
    C_INK = g('--ink', '#1A1A1A'); C_LINE = g('--line', '#B8B0A4');
    C_TEXT2 = g('--text2', '#5A5A5A'); C_ACCENT = g('--accent', '#8A8178');
    TONE = { line: C_LINE, accent: C_ACCENT, ink: C_INK };
    PLOT_STYLE = { background: 'transparent', color: C_TEXT2, fontSize: '11px', fontFamily: g('--sans', "'Inter',sans-serif") };
    widgetBuilds.forEach(f => f());   // 主题 token 变了 → 已挂载的 widget iframe 用新 token 重建 srcdoc
  }
  refreshThemeColors(); /* 先给默认值兜底；设好 data-theme 后会再刷新一次 */

  /* ================= Block 渲染器 ================= */
  const blockRenderers = {
    hero(b, ctx) {
      const inner = el('div', 'inner');
      if (b.tag) inner.appendChild(el('div', 'tag', escapeHtml(b.tag)));
      const h1 = el('h1', null, b.title.map(inlineMd).join('<br>'));
      if (b.titleSize) h1.style.fontSize = b.titleSize + 'px';
      inner.appendChild(h1);
      if (b.sub) inner.appendChild(el('div', 'sub', inlineMd(b.sub)));
      if (b.accentRule) inner.appendChild(el('div', 'h-accent'));
      if (b.facts) inner.appendChild(el('div', 'facts', inlineMd(b.facts)));
      if (b.hint) inner.appendChild(el('div', 'hint', inlineMd(b.hint)));
      return inner;
    },
    statement(b) {
      const wrap = el('div');
      const q = el('div', 'q', inlineMd(b.statement) + (b.sub ? '<br><span class="q-sub">' + inlineMd(b.sub) + '</span>' : ''));
      wrap.appendChild(q);
      if (b.cite) wrap.appendChild(el('div', 'cite', escapeHtml(b.cite)));
      return wrap;
    },
    /* pullquote：编辑级抽句——左竖条 + 斜体衬线大字旁置，给正文流一个呼吸点（DESIGN_RESEARCH T12）。缺字段兜底不抛。 */
    pullquote(b) {
      const w = el('div', 'pullquote');
      w.appendChild(el('div', 'pullquote-text', inlineMd(b.text || '')));
      if (b.cite) w.appendChild(el('div', 'pullquote-cite', inlineMd(b.cite)));
      return w;
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
    timeline(b) {
      const wrap = el('div', 'timeline');
      for (const e of b.events || []) {
        const it = el('div', 'tl-item');
        it.appendChild(el('div', 'tl-time', escapeHtml(e.time)));
        const bd = el('div', 'tl-body');
        bd.appendChild(el('div', 'tl-title', inlineMd(e.title)));
        if (e.desc) bd.appendChild(el('div', 'tl-desc', inlineMd(e.desc)));
        it.appendChild(bd);
        wrap.appendChild(it);
      }
      return wrap;
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
        node.innerHTML = inlineMd(n.title) + (n.sub ? '<span class="t">' + inlineMd(n.sub) + '</span>' : '');
        f.appendChild(node);
      });
      if (b.loopNote) f.appendChild(el('span', 'loop-note', inlineMd(b.loopNote)));
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
      if (b.caption) { const w = el('div'); w.appendChild(card); w.appendChild(el('div', 'cite', inlineMd(b.caption))); return w; }
      return card;
    },
    compare(b, ctx) {
      const cols = el('div', 'cols');
      for (const side of [b.left, b.right]) {
        const cell = el('div');
        if (side.caption) cell.appendChild(el('div', 'compare-caption', escapeHtml(side.caption)));
        cell.appendChild(renderBlock(side.block, ctx));
        cols.appendChild(cell);
      }
      return cols;
    },
    grid(b, ctx) {
      const g = el('div', 'grid-block');
      g.style.gridTemplateColumns = 'repeat(' + b.columns + ',1fr)';
      g.style.gap = (b.gap != null ? b.gap : 24) + 'px';
      for (const it of b.items) {
        const cell = el('div');
        if (it.span) cell.style.gridColumn = 'span ' + Math.min(it.span, b.columns);
        cell.appendChild(renderBlock(it.block, ctx));
        g.appendChild(cell);
      }
      return g;
    },
    quiz(b) {
      const wrap = el('div');
      if (b.kind === 'objective') {
        wrap.dataset.answer = b.answer;
        const stem = b.stem || b.context;   // stem 是 create-quiz 契约/生成侧的题干字段名；context 为兼容基线的旧别名
        if (stem) wrap.appendChild(el('p', 'quiz-context', inlineMd(stem)));
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
    /* previewMode 下骨架占位块（无内容字段）→ 渲染成占位卡，不激活任何 sim/Pyodide/widget */
    if (ctx && ctx.previewMode && !hasContent(b)) return placeholderBlock(b);
    if (b.status === 'pending') { const sk = el('div', 'rc-plot'); sk.style.height = '160px'; sk.appendChild(el('div', 'rc-hint', '生成中…')); return sk; }
    let root;
    try {
      const renderer = blockRenderers[b.type];
      if (typeof renderer !== 'function') throw new Error('未知 block 类型: ' + b.type);
      root = renderer(b, ctx);
    } catch (e) {
      /* 红线：任一 block 渲染失败（坏表达式/未知类型/缺字段…）都不许拖垮整份讲义——
         就地降级成可见错误占位，其余块与页照常渲染。校验器在生成侧拦(治本)，这里是纵深兜底。 */
      root = el('div', 'block-error');
      root.appendChild(el('div', 'block-error-t', '⚠ 此块渲染失败'));
      root.appendChild(el('div', 'block-error-m', escapeHtml((b && b.type || '?') + '：' + ((e && e.message) || String(e)))));
    }
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
        const reg = regimes.find(r => r.test(values)) || regimes[regimes.length - 1] || { tone: 'ink', desc: '', label: '' };
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
    },

    /* —— widget：自包含 HTML 片段跑在 sandbox iframe 里（逃生舱，SPEC §3.2） ——
       给 sim.custom（纯计算/只出折线）补上做不到的：实时动画、canvas 粒子/波/摆、几何作图、任意交互。
       控件按 GenUI 惯例长在片段内部，故不使用外层 paramPanelControls。 */
    widget(b, ctx) {
      const root = el('div', 'widlab');
      const frame = el('iframe', 'widframe');
      frame.setAttribute('sandbox', 'allow-scripts');   // 无 allow-same-origin → null origin，真隔离
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('title', b.caption || '互动组件');
      root.appendChild(frame);
      if (b.caption) root.appendChild(el('div', 'widcap', inlineMd(b.caption)));
      const build = () => { frame.srcdoc = buildWidgetSrcdoc(b.html); };
      widgetBuilds.push(build);   // 主题切换时重建
      ctx.onReady(build);
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

  /* ============ 场景版式模板（加一个函数 = 加一种版式；对照 blockRenderers）============
     签名 (scene, ctx, body, L)：把 blocks 排进 body。红线：绝不丢内容——任何未被版式引用到的
     block 一律回落进默认竖排/主栏；缺字段/失效引用/不足以成版式则整片回落 flow。版式是开放集，
     这里是起步的几种，规划器可按内容自选、拿不准回落 flow（见 plan.mjs skeletonSpec）。 */
  function blocksById(scene) { const m = {}; for (const b of scene.blocks) if (b && b.id != null) m[b.id] = b; return m; }

  const sceneLayouts = {
    flow(scene, ctx, body, L) {
      body.style.display = 'flex'; body.style.flexDirection = 'column';
      body.style.gap = (L.gap != null ? L.gap : 18) + 'px';
      if (L.centered) { body.style.justifyContent = 'center'; body.dataset.centered = '1'; }
      for (const blk of scene.blocks) body.appendChild(renderBlock(blk, ctx));
    },

    /* index：片内分节。左目录 + 右 stage（每子节一绝对定位 panel，仅 active 显示）。
       隐形 fragment 哨兵（n-1 个）复用 reveal 既有导航步进；syncIndex() 据当前 fragment index 切 active。 */
    index(scene, ctx, body, L) {
      const map = blocksById(scene);
      const used = new Set();
      const panels = [];
      for (const st of (Array.isArray(L.steps) ? L.steps : [])) {
        const blks = (st && Array.isArray(st.blockIds) ? st.blockIds : []).map(id => map[id]).filter(Boolean);
        if (!blks.length) continue;
        blks.forEach(b => used.add(b.id));
        panels.push({ label: (st && st.label || '').trim() || ('第 ' + (panels.length + 1) + ' 节'), blks });
      }
      if (panels.length < 2) return sceneLayouts.flow(scene, ctx, body, L);   // 不足两节 → 回落
      const leftover = scene.blocks.filter(b => !used.has(b.id));             // 未引用的不丢：并入末节
      if (leftover.length) panels[panels.length - 1].blks.push(...leftover);

      body.dataset.layout = 'index';
      body.classList.add('layout-index');
      const rail = el('div', 'scene-index');
      const stage = el('div', 'step-stage');
      const frags = el('div', 'step-frags');
      panels.forEach((p, i) => {
        const item = el('div', 'index-item' + (i === 0 ? ' on' : ''));
        item.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="t">' + inlineMd(p.label) + '</span>';
        item.onclick = () => { const ix = Reveal.getIndices(); Reveal.slide(ix.h, ix.v, i - 1); };   // 跳到该子节
        rail.appendChild(item);
        const panel = el('div', 'step-panel' + (i === 0 ? ' show' : ''));
        for (const b of p.blks) panel.appendChild(renderBlock(b, ctx));
        stage.appendChild(panel);
        if (i > 0) frags.appendChild(el('span', 'fragment step-frag'));       // 哨兵：f∈[-1,n-2] → active 0..n-1
      });
      body.appendChild(rail); body.appendChild(stage); body.appendChild(frags);
    },

    /* split：锚定分栏。左锚常驻（anchor 引用的 block），右主栏其余（递进沿用各 block 的 fragment）。 */
    split(scene, ctx, body, L) {
      const map = blocksById(scene);
      const anchorIds = new Set(Array.isArray(L.anchor) ? L.anchor : []);
      const anchor = (Array.isArray(L.anchor) ? L.anchor : []).map(id => map[id]).filter(Boolean);
      const rest = scene.blocks.filter(b => !anchorIds.has(b.id));
      if (!anchor.length || !rest.length) return sceneLayouts.flow(scene, ctx, body, L);   // 缺锚/右栏空 → 回落
      const r = Math.min(0.6, Math.max(0.25, +L.ratio || 0.4));
      body.dataset.layout = 'split';
      body.classList.add('layout-split');
      body.style.display = 'grid';
      body.style.gridTemplateColumns = r.toFixed(3) + 'fr ' + (1 - r).toFixed(3) + 'fr';
      body.style.gap = (L.gap != null ? L.gap : 40) + 'px';
      const aCol = el('div', 'split-col split-anchor');
      for (const b of anchor) aCol.appendChild(renderBlock(b, ctx));
      const mCol = el('div', 'split-col split-main');
      for (const b of rest) mCol.appendChild(renderBlock(b, ctx));
      body.appendChild(aCol); body.appendChild(mCol);
    },
  };

  /* ================= Scene → <section> ================= */
  function renderScene(scene, ctx) {
    const sec = document.createElement('section');
    if (scene.kind === 'hero') sec.className = 'cover';
    if (scene.kind === 'statement') sec.className = 'bigidea';
    if (scene.kind === 'quiz') sec.className = 'quiz';
    if (scene.kind === 'section') sec.className = 'divider';
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
    } else if (scene.kind === 'section') {
      /* 章节分隔页：大号自增序号 + 章节名 + 一句主旨(statement block)——给讲义打节拍、破"每页一个样"的单调。
         内容据 scene.headline + 其 statement block；缺字段兜底不抛（红线）。 */
      ctx.sectionNo = (ctx.sectionNo || 0) + 1;
      pad.appendChild(el('div', 'section-num', String(ctx.sectionNo).padStart(2, '0')));
      if (scene.eyebrow) pad.appendChild(el('div', 'eyebrow', escapeHtml(scene.eyebrow)));
      if (scene.headline) pad.appendChild(el('h2', 'section-title', inlineMd(scene.headline)));
      const dek = (scene.blocks || []).find(b => b && b.type === 'statement');
      const dekText = dek ? dek.statement : scene.lead;
      if (dekText) pad.appendChild(el('div', 'section-dek', inlineMd(dekText)));
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
        const L = scene.layout || {};
        const kind = typeof sceneLayouts[L.kind] === 'function' ? L.kind : 'flow';   // 未知 kind → flow，不崩
        sceneLayouts[kind](scene, ctx, body, L);
        pad.appendChild(body);
      }
    }
    sec.appendChild(pad);
    const notes = document.createElement('aside');
    notes.className = 'notes'; notes.innerHTML = inlineMd(scene.notes);
    sec.appendChild(notes);
    return sec;
  }

  /* 稀疏页自动平衡：内容少的普通内容页默认顶对齐，会在底部留一大片空白（“向一个边对齐”）。
     每次某页变为当前页时实测其内容高度 vs 可用高度，明显偏空就纵向居中，不再贴顶。
     用 offsetHeight（布局像素，不受 reveal 的 CSS 缩放影响），与 clientHeight 同尺度可比。 */
  function balanceScene(section) {
    if (!section) return;
    if (section.classList.contains('cover') || section.classList.contains('bigidea') || section.classList.contains('divider')) return;
    const body = section.querySelector('.pad > .body');
    if (!body) return;
    /* sim/runnable/widget 的 body 按设计填满，作者显式 centered 也别覆盖 */
    if (['lab', 'runlab', 'widlab'].some(c => body.classList.contains(c))) return;
    if (body.dataset.layout) return;                /* index/split 等自定义版式自管高度(fitCustomLayout)，不走默认竖排测量 */
    if (body.dataset.centered) return;              /* 作者显式 layout.centered，尊重其意图，不覆盖 */
    body.style.justifyContent = '';                 /* 先复位再实测，避免测到上次居中/缩放态 */
    body.style.zoom = '';
    const avail = body.clientHeight;
    const kids = Array.from(body.children);
    if (!avail || !kids.length) return;             /* 不可见或空 body 不处理 */
    const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
    const contentH = kids.reduce((h, k) => h + k.offsetHeight, 0) + gap * (kids.length - 1);
    if (contentH < avail * 0.72) {
      body.style.justifyContent = 'center';         /* 偏稀疏页：垂直居中，避免贴顶留大片空白 */
    } else if (contentH > avail + 4) {
      /* 内容超高会被 .pad 的 overflow:hidden 裁掉，学生看不到底部（红线）。用 zoom 等比缩到刚好放下——
         zoom 影响布局(Chromium/Edge/新版 FF)，scrollHeight 随之收缩、真正不裁切（transform 只视觉缩放，救不了 scrollHeight）。
         下限 0.8 防过度缩小伤可读；触底仍溢出说明内容确实过多，交给 render-check 断言 F 告警、生成侧收敛。
         lab/runlab/widlab(sim/代码/CodeMirror 子树)已在上面提前 return，不受 zoom 影响（避 FE-48）。 */
      body.style.zoom = Math.max(0.8, avail / contentH);
    }
  }

  /* 宽公式自适应（横向的 balanceScene）：display 公式天然比容器宽时——尤其 compare/grid 的窄列里放矩阵——
     .mblock 的 overflow-x:auto 只能让它横向滚动，但幻灯片不可滚，等于右侧公式看不见。这里等比缩到刚好放下：
     zoom 影响布局，缩完不再触发滚动条（transform 只视觉缩放、救不了滚动条）。下限 0.55 防缩到不可读；
     触底仍超宽（极长公式，属内容问题）由 overflow-x:auto 兜底。先复位再实测，避免测到上次缩放态。 */
  function fitFormulas(section) {
    if (!section) return;
    for (const disp of section.querySelectorAll('.mblock .katex-display')) {
      const k = disp.querySelector('.katex');
      if (!k) continue;
      k.style.zoom = '';
      const avail = disp.clientWidth, natural = k.scrollWidth;
      if (avail && natural > avail + 1) k.style.zoom = Math.max(0.55, avail / natural);
    }
  }
  /* 自定义版式(index/split)的高度自适应：balanceScene 只管默认竖排，这里管 index 的 active panel 与 split 的分栏列。
     宽度由 fitFormulas(section) 统一处理；这里只处理“太高被裁”——同 balanceScene 用 zoom 缩到放下（红线：不裁切）。 */
  function fitScroll(box, availH) {
    if (!box) return;
    box.style.zoom = '';
    if (!availH) return;
    const need = box.scrollHeight;
    if (need > availH + 4) box.style.zoom = Math.max(0.7, availH / need);
  }
  function fitCustomLayout(section) {
    if (!section) return;
    const idx = section.querySelector('.layout-index');
    if (idx) { const stage = idx.querySelector('.step-stage'); const active = stage && stage.querySelector('.step-panel.show'); if (stage && active) fitScroll(active, stage.clientHeight); }
    const sp = section.querySelector('.layout-split');
    if (sp) { const h = sp.clientHeight; sp.querySelectorAll('.split-col').forEach(c => fitScroll(c, h)); }
  }
  /* index：据 reveal 当前 fragment index 切 active 子节 + 高亮目录（fragment 事件/翻页时调用）。 */
  function syncIndex(section) {
    const sec = section || (window.Reveal && Reveal.getCurrentSlide());
    const idx = sec && sec.querySelector('.layout-index'); if (!idx) return;
    const panels = idx.querySelectorAll('.step-panel'); const items = idx.querySelectorAll('.index-item');
    const f = (window.Reveal && Reveal.getIndices) ? Reveal.getIndices().f : -1;
    const active = Math.max(0, Math.min(panels.length - 1, (typeof f === 'number' ? f : -1) + 1));
    panels.forEach((p, i) => p.classList.toggle('show', i === active));
    items.forEach((it, i) => { it.classList.toggle('on', i === active); it.classList.toggle('done', i < active); });
    fitCustomLayout(sec);
  }
  /* 金句页(bigidea)始终纵向居中(CSS)，但大号 pull-quote 遇长句可能超高被裁——balanceScene 跳过 bigidea，
     故这里专门给它兜底：body 内容超出可用高就 zoom 缩到放下(红线：不裁切)。 */
  function fitStatement(section) {
    if (!section || !section.classList.contains('bigidea')) return;
    const body = section.querySelector('.pad > .body');
    if (body) fitScroll(body, body.clientHeight);
  }
  /* 一页的版式自适应统一入口：先把宽公式缩到放下（影响高度），再按新高度做稀疏/超高的纵向平衡，最后处理自定义版式。 */
  function layoutScene(section) { fitFormulas(section); balanceScene(section); fitCustomLayout(section); fitStatement(section); }

  /* ================= 装配 & 启动 ================= */
  /* 骨架块识别：agent 规划阶段产出的占位 block 仅有 {id,type,intent}，没有真实内容字段。
     previewMode 下把这些渲染成占位卡（让 live dashboard 能在生成期间看到结构），正式渲染跳过此判断。 */
  const CONTENT_KEYS = ['title','sub','items','statement','prompt','label','text','source','formula','rows','head','left','right','sides','engine','html','filename','fallbackPoster','answers','choices','steps','cells','events','data','question','nodes','adjList','stages','cite','hint','tag','facts','objective'];
  function hasContent(b) {
    if (!b || typeof b !== 'object') return false;
    for (const k of CONTENT_KEYS) if (b[k] != null && b[k] !== '') return true;
    return false;
  }
  function placeholderBlock(b) {
    const dp = el('div', 'block-placeholder');
    dp.innerHTML = '<div class="bp-type">' + escapeHtml(b.type || 'block') + '</div>'
      + (b.intent ? '<div class="bp-intent">' + escapeHtml(b.intent) + '</div>' : '');
    return dp;
  }

  /** 全量（重）渲染一整份 doc。首次调用会 Reveal.initialize + 绑 chrome；后续调用仅替换 slides + Reveal.sync()。
   *  opts.previewMode=true 时骨架占位块渲染成占位卡（不激活 sim/Pyodide），供 live dashboard 生成期间用。 */
  function renderDoc(doc, opts = {}) {
    currentDoc = doc;
    ctx.previewMode = !!opts.previewMode;
    document.title = doc.title || '讲义';

    /* 主题：?theme=xxx 仅用于预览/对比（不改内容）；默认用 doc.theme 或 cartesian。
       重渲时尊重 URL override 可让 live 预览也支持 ?theme= 切换对比。 */
    const themeOverride = new URLSearchParams(location.search).get('theme');
    document.documentElement.dataset.theme = themeOverride || doc.theme || 'cartesian';
    refreshThemeColors();

    /* AI 助教数据按当前 doc 重新初始化（重渲后词表跟着更新） */
    KB = ((doc.tutor || {}).kb || []).map(k => [new RegExp(k.pattern, k.flags || ''), inlineMd(k.answer)]);
    SUGG = (doc.tutor || {}).suggestions || [];

    const slidesEl = $('#slides');
    if (!slidesEl) return;
    slidesEl.innerHTML = '';
    for (const scene of doc.scenes) {
      const sec = renderScene(scene, ctx);
      if (scene.id) sec.dataset.sceneId = scene.id;
      slidesEl.appendChild(sec);
    }

    if (!revealInited) {
      bindChrome();
      Reveal.initialize({ hash: true, slideNumber: 'c/t', controls: false, progress: true, center: false,
        transition: 'slide', backgroundTransition: 'fade', width: 1280, height: 720, margin: 0,
        viewDistance: 5, hashOneBasedIndex: true, plugins: [RevealHighlight] });
      Reveal.on('ready', e => { readyCallbacks.forEach(fn => fn()); activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => { layoutScene(e.currentSlide); syncIndex(e.currentSlide); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutScene(Reveal.getCurrentSlide()); syncIndex(); }); });
      Reveal.on('slidechanged', e => { activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => { layoutScene(e.currentSlide); syncIndex(e.currentSlide); }); });
      Reveal.on('fragmentshown', () => requestAnimationFrame(() => syncIndex()));
      Reveal.on('fragmenthidden', () => requestAnimationFrame(() => syncIndex()));
      new ResizeObserver(() => { if (window.__rcCM) requestAnimationFrame(() => window.__rcCM.refresh()); }).observe($('.reveal'));
      revealInited = true;
    } else {
      Reveal.sync();
      Reveal.slide(0);
      requestAnimationFrame(() => { const cur = Reveal.getCurrentSlide(); if (cur) { layoutScene(cur); syncIndex(cur); } activateRunCell(cur); });
    }
  }

  /** 增量替换一页 section（live dashboard：单个 block 生成完只重渲该页，不刷整份 deck）。 */
  function rerenderScene(sceneId, scene) {
    if (!currentDoc) return;
    const slidesEl = $('#slides');
    if (!slidesEl) return;
    const old = slidesEl.querySelector('section[data-scene-id="' + CSS.escape(sceneId) + '"]');
    if (!old) return;
    const fresh = renderScene(scene, ctx);
    fresh.dataset.sceneId = sceneId;
    old.replaceWith(fresh);
    if (window.Reveal && Reveal.sync) Reveal.sync();
    requestAnimationFrame(() => { layoutScene(fresh); syncIndex(fresh); activateRunCell(fresh); });
  }

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

  /* ---- AI 助教（数据驱动：doc.tutor，在 renderDoc 里按当前 doc 刷新 KB/SUGG） ---- */
  function curInfo() { const s = Reveal.getCurrentSlide();
    const t = s && (s.querySelector('.headline')?.textContent || s.querySelector('h2,h1')?.textContent || s.querySelector('.eyebrow')?.textContent) || '本页';
    return t.trim(); }
  function openTutor() { $('#tutorPanel').classList.add('open'); $('#btnTutor').classList.add('on'); updateCtx();
    if (!$('#tutorSugg').dataset.init) { $('#tutorSugg').dataset.init = '1';
      SUGG.forEach(q => { const b = el('button', null, q); b.onclick = () => ask(q); $('#tutorSugg').appendChild(b); }); } }
  function closeTutor() { $('#tutorPanel').classList.remove('open'); $('#btnTutor').classList.remove('on'); }
  function updateCtx() { $('#tutorCtx').innerHTML = '当前上下文：<b>' + escapeHtml(curInfo()) + '</b>'; }
  function ask(q) { const b = $('#tutorBody'); b.appendChild(el('div', 'msg u', escapeHtml(q)));
    let ans = '结合本页「' + escapeHtml(curInfo()) + '」：'; const hit = KB.find(([re]) => re.test(q));
    ans += hit ? hit[1] : '好问题。真实产品里我会把<b>当前这页的要点与你的进度</b>作为上下文发给后端对话模型，给出针对性讲解。（demo 本地离线应答）';
    b.appendChild(el('div', 'msg a', '<div class="who">✦ AI 助教 · 已注入本页上下文</div>' + ans)); b.scrollTop = b.scrollHeight; }

  /* ---- 传送门（FE-48）：编辑器挂 body 下，rAF 同步屏幕矩形 ---- */
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

  /** 绑 chrome 事件（按钮/快捷键/quiz 已在上面绑 document）。.onclick 赋值幂等但只绑一次更干净。 */
  function bindChrome() {
    if (chromeBound) return; chromeBound = true;
    $('#btnTutor').onclick = () => $('#tutorPanel').classList.contains('open') ? closeTutor() : openTutor();
    $('#tutorClose').onclick = closeTutor;
    $('#tutorSend').onclick = () => { const v = $('#tutorInput').value.trim(); if (v) { ask(v); $('#tutorInput').value = ''; } };
    $('#tutorInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#tutorSend').click(); });
    $('#btnNotes').onclick = toggleNotes;
    $('#btnOverview').onclick = () => Reveal.toggleOverview();
    $('#btnPrev').onclick = () => Reveal.prev();
    $('#btnNext').onclick = () => Reveal.next();
    document.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'a' || e.key === 'A') $('#btnTutor').click(); });
  }

  /* ---- 自动启动（index.html 兼容路径：?doc= 或默认 course.lecture.json） ----
     默认渲染手写基线 course.lecture.json；?doc=generated/xxx.lecture.json 可预览别的（如 agent 生成的），
     不必覆盖基线。路径相对 demo/（服务器根），只能取 demo/ 下的文件。
     ?live=1 时跳过：live.html Dashboard 由控制器自己驱动 renderDoc（订阅 SSE 后增量渲染），
     不做初始 fetch——避免短暂闪现基线 deck 与正在生成的 doc 冲突。 */
  if (!new URLSearchParams(location.search).has('live')) {
    const docUrl = new URLSearchParams(location.search).get('doc') || 'course.lecture.json';
    const initialDoc = await fetch(docUrl).then(r => r.json());
    renderDoc(initialDoc);
  }

  /* ---- live.html 公共 API：renderDoc/rerenderScene 让 Dashboard 增量更新预览 ---- */
  window.LectureDeck = { renderDoc, rerenderScene, refreshTheme: refreshThemeColors };
})();
