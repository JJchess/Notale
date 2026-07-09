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
    let s = String(src)
      .replace(/\$([^$]+)\$/g, (_, tex) => { stash.push(katex.renderToString(tex, { throwOnError: false, output: 'html' })); return ' ' + (stash.length - 1) + ' '; })
      .replace(/`([^`]+)`/g, (_, code) => { stash.push('<span class="mi">' + escapeHtml(code) + '</span>'); return ' ' + (stash.length - 1) + ' '; });
    s = escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s.replace(/ (\d+) /g, (_, i) => stash[+i]);
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
      if (b.caption) root.appendChild(el('div', 'widcap', escapeHtml(b.caption)));
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
        if (L.centered) { body.style.justifyContent = 'center'; body.dataset.centered = '1'; }
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

  /* 稀疏页自动平衡：内容少的普通内容页默认顶对齐，会在底部留一大片空白（“向一个边对齐”）。
     每次某页变为当前页时实测其内容高度 vs 可用高度，明显偏空就纵向居中，不再贴顶。
     用 offsetHeight（布局像素，不受 reveal 的 CSS 缩放影响），与 clientHeight 同尺度可比。 */
  function balanceScene(section) {
    if (!section) return;
    if (section.classList.contains('cover') || section.classList.contains('bigidea')) return;
    const body = section.querySelector('.pad > .body');
    if (!body) return;
    /* sim/runnable/widget 的 body 按设计填满，作者显式 centered 也别覆盖 */
    if (['lab', 'runlab', 'widlab'].some(c => body.classList.contains(c))) return;
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

  /* ================= 装配 & 启动 ================= */
  /* 默认渲染手写基线 course.lecture.json；?doc=generated/xxx.lecture.json 可预览别的（如 agent 生成的），
     不必覆盖基线。路径相对 demo/（服务器根），只能取 demo/ 下的文件。 */
  const docUrl = new URLSearchParams(location.search).get('doc') || 'course.lecture.json';
  const doc = await fetch(docUrl).then(r => r.json());
  document.title = doc.title;

  /* 选定主题：内容决定 doc.theme，之后整套讲义强制一致（不支持 per-page 覆盖）。
     加新主题只需在 index.html 里加一个 :root[data-theme="x"] token 块。
     ?theme=xxx 仅用于预览/对比不同主题（不改内容），不影响正式产物。 */
  const themeOverride = new URLSearchParams(location.search).get('theme');
  document.documentElement.dataset.theme = themeOverride || doc.theme || 'cartesian';
  refreshThemeColors();

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
  function updateCtx() { $('#tutorCtx').innerHTML = '当前上下文：<b>' + escapeHtml(curInfo()) + '</b>'; }
  function ask(q) { const b = $('#tutorBody'); b.appendChild(el('div', 'msg u', escapeHtml(q)));
    let ans = '结合本页「' + escapeHtml(curInfo()) + '」：'; const hit = KB.find(([re]) => re.test(q));
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
  Reveal.on('ready', e => { readyCallbacks.forEach(fn => fn()); activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => balanceScene(e.currentSlide));
    /* 字体加载完会改变块高度 → 字体就绪后按当前页重测一次，避免用未换字体的旧高度居中 */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => balanceScene(Reveal.getCurrentSlide())); });
  Reveal.on('slidechanged', e => { activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => balanceScene(e.currentSlide)); });
  /* reveal 缩放变化时 CodeMirror 度量会过期（FE-48），ResizeObserver 兜底 refresh */
  new ResizeObserver(() => { if (window.__rcCM) requestAnimationFrame(() => window.__rcCM.refresh()); }).observe($('.reveal'));
})();
