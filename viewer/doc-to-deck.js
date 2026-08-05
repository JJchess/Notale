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
  /* runnable 多实例登记表：uid(block.id) -> { portal, initCM, anchor, cm }。
     一份讲义可以有 N 个 runnable；同屏(reveal 任一时刻只显示一张 slide)最多同时激活其中几个，
     activePortals 是"当前 slide 上正显示"的子集，一个共享 RAF 遍历它逐个贴传送门位置。 */
  const runnableRegistry = new Map();
  const activePortals = new Set();
  let rcPortalRAF = null;
  let rcAutoUid = 0;
  const readyCallbacks = [];
  function runReadyCallbacks() {
    const pending = readyCallbacks.splice(0, readyCallbacks.length);
    for (const fn of pending) {
      try { fn(); } catch (e) { console.error('动态 block 初始化失败:', e); }
    }
  }
  const ctx = {
    onReady: fn => readyCallbacks.push(fn),
    registerRunnable: (uid, entry) => { runnableRegistry.set(uid, entry); },
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
  /* 每个已挂载 widget 的重建函数；主题变化时全部重跑（refreshThemeColors 内调用）。
     按 widgetId 键（镜像下面的 widgetRoots）而非数组：数组版从不清理，同一个 widget 被重渲 N 次
     就攒下 N 个闭包，其中 N-1 个的 iframe 早已脱离文档，换一次主题就白重建 N-1 次 srcdoc。
     以前一个会话只重渲几次所以不明显；编辑器会反复对 widget 触发 rerenderBlock，就放大了。 */
  const widgetBuilds = new Map();
  const widgetRoots = new Map();
  window.addEventListener('message', ev => {
    const data = ev.data;
    if (!data || data.__lectureWidgetError !== true || !data.widgetId) return;
    const root = widgetRoots.get(String(data.widgetId));
    if (!root) return;
    const message = String(data.message || 'unknown widget runtime error').slice(0, 500);
    if (root.dataset.widgetError === message) return;
    root.dataset.widgetError = message;
    console.error('[widget ' + data.widgetId + '] ' + message);
  });
  const WIDGET_TOKENS = ['--bg', '--bg2', '--card', '--ink', '--text2', '--accent', '--accent2', '--line', '--serif', '--sans', '--mono', '--radius', '--sel'];
  function widgetColorScheme(value) {
    const text = String(value || '').trim();
    let rgb = null;
    const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const raw = hex[1].length === 3 ? hex[1].split('').map(ch => ch + ch).join('') : hex[1];
      rgb = [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16));
    } else {
      const match = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
      if (match) rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    if (!rgb || rgb.some(value => !Number.isFinite(value))) return 'light';
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.46
      ? 'dark' : 'light';
  }
  function buildWidgetSrcdoc(fragment, widgetId, widgetProfile) {
    const cs = getComputedStyle(document.documentElement);
    const theme = document.documentElement.dataset.theme || 'cartesian';
    const colorScheme = widgetColorScheme(cs.getPropertyValue('--bg'));
    const vars = WIDGET_TOKENS.map(t => t + ':' + (cs.getPropertyValue(t).trim() || 'inherit')).join(';');
    return '<!doctype html><html data-theme="' + colorScheme + '" data-deck-theme="' + escapeHtml(theme) + '"><head><meta charset="utf-8"><style>'
      + ':root{' + vars
      + ';--color-background-primary:var(--bg2);--color-background-secondary:var(--card);--color-background-tertiary:var(--bg)'
      + ';--color-bg:var(--bg);--color-bg-subtle:var(--bg2);--color-bg-muted:var(--card)'
      + ';--color-text:var(--ink);--color-text-primary:var(--ink);--color-text-secondary:var(--text2);--color-text-tertiary:var(--text2)'
      + ';--color-border:var(--line);--color-border-primary:var(--line);--color-border-secondary:var(--line);--color-border-tertiary:var(--line)'
      + ';--color-background-info:var(--accent);--color-text-info:var(--ink);--font-sans:var(--sans);--font-serif:var(--serif);--font-mono:var(--mono);--radius-sm:var(--radius,4px);--border-radius-lg:var(--radius,8px)}'
      + '*{box-sizing:border-box}'
      + 'html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px}'
      + 'button{font-family:var(--sans);font-size:13px;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:var(--radius,0);padding:6px 12px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s}'
      + 'button:hover{border-color:var(--ink)}button:active{transform:scale(.97)}'
      + 'input[type=range]{accent-color:var(--ink)}'
      + '.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}'
      + '</style><script>(function(){'
      + 'const widgetId=' + JSON.stringify(String(widgetId || 'unknown')) + ';'
      + 'const widgetProfile=' + JSON.stringify(String(widgetProfile || '')) + ';'
      + 'const report=function(message){parent.postMessage({__lectureWidgetError:true,widgetId:widgetId,message:String(message||"unknown")},"*")};'
      + 'addEventListener("error",function(e){report(e.message||e.error||"runtime error")});'
      + 'addEventListener("unhandledrejection",function(e){report(e.reason||"unhandled rejection")});'
      + 'const originalAssert=console.assert.bind(console);console.assert=function(condition){originalAssert.apply(console,arguments);'
      + 'if(!condition)report("console.assert failed: "+Array.prototype.slice.call(arguments,1).join(" "))};'
      + 'let canvasPaints=0;try{const proto=CanvasRenderingContext2D.prototype;'
      + '["fill","stroke","fillRect","strokeRect","fillText","strokeText","drawImage","putImageData"].forEach(function(name){'
      + 'const original=proto[name];if(typeof original!=="function")return;proto[name]=function(){canvasPaints++;return original.apply(this,arguments)}})}catch(e){}'
      + 'function visiblePrimitiveCount(svg){return Array.prototype.filter.call(svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect,image,use"),function(node){'
      + 'if(node.closest("defs,[aria-hidden=true]"))return false;const semantic=((node.getAttribute("class")||"")+" "+(node.getAttribute("id")||"")+" "+((node.parentElement&&node.parentElement.getAttribute("class"))||"")).toLowerCase();'
      + 'if(/(^|[\\s_-])(grid|background|backdrop|watermark|axis|tick|guide|decoration|ornament|placeholder|skeleton|ghost)([\\s_-]|$)/.test(semantic))return false;'
      + 'try{const box=node.getBoundingClientRect();const cs=getComputedStyle(node);return cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)>0&&Math.max(box.width,box.height)>4}catch(e){return false}}).length}'
      + 'function visibleEntityCount(svg){const root=svg.getBoundingClientRect();const rootArea=Math.max(1,root.width*root.height);'
      + 'return Array.prototype.filter.call(svg.querySelectorAll("circle,ellipse,rect,polygon,image,use"),function(node){'
      + 'if(node.closest("defs,[aria-hidden=true]"))return false;const semantic=((node.getAttribute("class")||"")+" "+(node.getAttribute("id")||"")+" "+((node.parentElement&&node.parentElement.getAttribute("class"))||"")).toLowerCase();'
      + 'if(/(^|[\\s_-])(grid|background|backdrop|watermark|axis|tick|guide|decoration|ornament|placeholder|skeleton|ghost)([\\s_-]|$)/.test(semantic))return false;'
      + 'try{const box=node.getBoundingClientRect();const cs=getComputedStyle(node);const area=Math.max(0,box.width)*Math.max(0,box.height);'
      + 'return cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)>0&&box.width>6&&box.height>6&&area<rootArea*.45}catch(e){return false}}).length}'
      + 'function visibleEntityArea(svg){const root=svg.getBoundingClientRect();const rootArea=Math.max(1,root.width*root.height);let area=0;'
      + 'Array.prototype.forEach.call(svg.querySelectorAll("circle,ellipse,rect,polygon,image,use"),function(node){if(node.closest("defs,[aria-hidden=true]"))return;'
      + 'try{const box=node.getBoundingClientRect();const cs=getComputedStyle(node);const value=Math.max(0,box.width)*Math.max(0,box.height);'
      + 'if(cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)>0&&value<rootArea*.45)area+=value}catch(e){}});return area/rootArea}'
      + 'function lowContrastEntityLabels(svg){return Array.prototype.some.call(svg.querySelectorAll("g"),function(group){const shape=group.querySelector("circle,ellipse,rect,polygon");const label=group.querySelector("text");'
      + 'if(!shape||!label||!(label.textContent||"").trim())return false;try{const a=getComputedStyle(shape).fill.replace(/\\s/g,"");const b=getComputedStyle(label).fill.replace(/\\s/g,"");'
      + 'return a&&b&&a!=="none"&&a!=="transparent"&&a===b}catch(e){return false}})}'
      + 'function labeledEntityCount(svg){return Array.prototype.filter.call(svg.querySelectorAll("g"),function(group){const shape=group.querySelector(":scope>circle,:scope>ellipse,:scope>rect,:scope>polygon");const labels=Array.prototype.filter.call(group.querySelectorAll(":scope>text"),function(text){return (text.textContent||"").trim()});'
      + 'if(!shape||!labels.length)return false;try{const box=shape.getBoundingClientRect();const cs=getComputedStyle(shape);return cs.display!=="none"&&cs.visibility!=="hidden"&&box.width>6&&box.height>6}catch(e){return false}}).length}'
      + 'function substantialLabeledEntityCount(svg){const root=svg.getBoundingClientRect(),rootArea=Math.max(1,root.width*root.height);return Array.prototype.filter.call(svg.querySelectorAll("g"),function(group){const shape=group.querySelector(":scope>circle,:scope>ellipse,:scope>rect,:scope>polygon");const label=group.querySelector(":scope>text");if(!shape||!label||!(label.textContent||"").trim())return false;try{const box=shape.getBoundingClientRect(),cs=getComputedStyle(shape);return cs.display!=="none"&&cs.visibility!=="hidden"&&box.width*box.height>=rootArea*.0015}catch(e){return false}}).length}'
      + 'function undersizedLabeledEntities(svg){const bad=[];Array.prototype.forEach.call(svg.querySelectorAll("g"),function(group){const shape=group.querySelector(":scope>circle,:scope>ellipse,:scope>rect,:scope>polygon");const labels=Array.prototype.filter.call(group.querySelectorAll(":scope>text"),function(text){return (text.textContent||"").trim()});'
      + 'if(!shape||!labels.length)return;const sizes=labels.map(function(text){return parseFloat(getComputedStyle(text).fontSize)||0});const largest=Math.max.apply(Math,sizes);if(largest<13.5)bad.push(labels.map(function(text){return (text.textContent||"").trim()}).join("/")+" ("+largest+"px)")});return bad}'
      + 'function normalizeLabeledEntityText(svg){Array.prototype.forEach.call(svg.querySelectorAll("g"),function(group){const shape=group.querySelector(":scope>circle,:scope>ellipse,:scope>rect,:scope>polygon");const labels=Array.prototype.filter.call(group.querySelectorAll(":scope>text"),function(text){return (text.textContent||"").trim()});if(!shape||!labels.length)return;'
      + 'const largest=Math.max.apply(Math,labels.map(function(text){return parseFloat(getComputedStyle(text).fontSize)||0}));if(largest<13.5)labels.forEach(function(text){text.style.fontSize="14px"})})}'
      + 'function overlappingSvgLabels(svg){const labels=Array.prototype.filter.call(svg.querySelectorAll("text"),function(text){try{const r=text.getBoundingClientRect();const cs=getComputedStyle(text);return (text.textContent||"").trim()&&cs.display!=="none"&&cs.visibility!=="hidden"&&r.width>2&&r.height>2}catch(e){return false}});'
      + 'for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].getBoundingClientRect(),b=labels[j].getBoundingClientRect();const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));'
      + 'const overlap=w*h,smaller=Math.max(1,Math.min(a.width*a.height,b.width*b.height));if(overlap/smaller>.08)return true;const sameGroup=labels[i].parentElement===labels[j].parentElement;'
      + 'const gapX=Math.max(0,Math.max(a.left,b.left)-Math.min(a.right,b.right)),gapY=Math.max(0,Math.max(a.top,b.top)-Math.min(a.bottom,b.bottom));if(sameGroup&&gapX<2&&gapY<2)return true}return false}'
      + 'function primaryStage(){const selectors="[class*=stage],[id*=stage],[class*=canvas],[id*=canvas],[class*=plot],[id*=plot]";let nodes=Array.prototype.slice.call(document.querySelectorAll(selectors));'
      + 'if(!nodes.length)nodes=Array.prototype.slice.call(document.querySelectorAll("svg,canvas"));return nodes.map(function(node){const r=node.getBoundingClientRect();return {node:node,area:Math.max(0,r.width)*Math.max(0,r.height)}})'
      + '.filter(function(x){return x.area>innerWidth*innerHeight*.18}).sort(function(a,b){return b.area-a.area})[0]}'
      + 'function auditInitialPaint(){const canvas=document.querySelector("canvas");if(canvas&&canvasPaints===0)'
      + 'report("canvas initial frame produced no paint operations");if(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)>innerHeight+3||Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+3)'
      + 'report("widget content exceeds the fixed iframe viewport and is clipped");const candidate=primaryStage();if(!candidate)return;const stage=candidate.node;'
      + 'const svgs=stage.matches("svg")?[stage]:Array.prototype.slice.call(stage.querySelectorAll("svg"));'
      + 'if(widgetProfile==="state")svgs.forEach(normalizeLabeledEntityText);'
      + 'const primitiveCount=svgs.reduce(function(sum,svg){return sum+visiblePrimitiveCount(svg)},0);'
      + 'const entityCount=svgs.reduce(function(sum,svg){return sum+visibleEntityCount(svg)},0);'
      + 'const entityArea=svgs.reduce(function(sum,svg){return sum+visibleEntityArea(svg)},0);'
      + 'const labeledEntities=svgs.reduce(function(sum,svg){return sum+labeledEntityCount(svg)},0);'
      + 'const substantialEntities=svgs.reduce(function(sum,svg){return sum+substantialLabeledEntityCount(svg)},0);'
      + 'if(svgs.length&&primitiveCount===0)'
      + 'report("initial frame has an empty primary visualization stage");'
      + 'if(widgetProfile==="state"&&svgs.length&&entityCount<3)report("state simulation initial frame has fewer than three visible state entities");'
      + 'if(widgetProfile==="state"&&svgs.length&&entityArea<.006)report("state simulation entities occupy too little of the primary stage to be legible");'
      + 'if(widgetProfile==="state"&&svgs.length&&labeledEntities>0&&labeledEntities<3)report("state simulation initial frame must show at least three distinct labeled state entities; decorative rings do not count");'
      + 'if(widgetProfile==="state"&&svgs.length&&substantialEntities<3)report("state simulation initial frame must show at least three substantial labeled entities in the primary structure; toolbar, queue, legend, and decorative markers do not count");'
      + 'const stageRect=stage.getBoundingClientRect();if(widgetProfile==="state"&&stageRect.width<innerWidth*.6)report("state simulation primary stage uses less than 60% of the available frame width; expand the interface instead of centering a narrow dashboard card");'
      + 'const undersizedLabels=[].concat.apply([],svgs.map(undersizedLabeledEntities));if(widgetProfile==="state"&&undersizedLabels.length)report("state simulation labeled entities use text smaller than 14px; enlarge these core node or state values: "+undersizedLabels.slice(0,6).join(", "));'
      + 'if(widgetProfile==="state"&&svgs.some(lowContrastEntityLabels))report("state simulation has entity labels with the same fill as their shapes");'
      + 'if(widgetProfile==="state"&&svgs.some(overlappingSvgLabels))report("state simulation has overlapping SVG text labels; separate node values, balance factors, and height annotations");'
      + 'const stageText=(stage.textContent||"").replace(/\\s+/g," ");if(/初始空树|empty[_ -]?tree|无节点|暂无数据|等待.{0,8}开始|点击.{0,12}(开始|构建)|开始逐步构建/i.test(stageText))'
      + 'report("initial frame exposes an empty data structure instead of inspectable evidence")}'
      + 'addEventListener("message",function(e){if(e.data&&e.data.__lectureWidgetAudit)auditInitialPaint()});'
      + 'addEventListener("load",function(){setTimeout(auditInitialPaint,1200)});'
      + '})();</script></head><body>' + fragment + '</body></html>';
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

  /* 本地图标：window.ICON_INNER 由 vendor/icons/icons-inline.js 挂载(id -> 内联 <path> markup)。
     stroke=currentColor，包一层 span 设 color:var(--accent) 即继承主题色，零新增主题接线。 */
  function renderIcon(id) {
    const inner = window.ICON_INNER && window.ICON_INNER[id];
    if (!inner) return null;
    const span = el('span', 'inline-icon');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    return span;
  }

  /* fragment 字段：bool(朴素淡入) 或 reveal 支持的类型名字符串(fade-up/highlight-red/grow/...)。
     '' = 不打 fragment，交调用方判断是否已有 fragment class 再决定要不要追加。 */
  function fragClass(v) {
    if (!v) return '';
    return typeof v === 'string' ? 'fragment ' + v : 'fragment';
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
  const stripDisplayDelimiters = (t) => {
    let value = String(t).trim().replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();
    if ((value.startsWith('\\[') && value.endsWith('\\]')) || (value.startsWith('\\(') && value.endsWith('\\)'))) {
      value = value.slice(2, -2).trim();
    }
    return value;
  };
  const displayTex = (tex) => katex.renderToString(stripDisplayDelimiters(tex), { throwOnError: false, output: 'html', displayMode: true });

  /* Rich prose remains intentionally small: inline markdown plus GFM-style tables.  Models often place a
     Punnett square or comparison matrix in a quiz stem; treating the pipes as prose destroys the evidence. */
  function richProse(src, className) {
    const root = el('div', className || null);
    const lines = String(src == null ? '' : src).split(/\r?\n/);
    const paragraph = [];
    const flush = () => {
      const text = paragraph.splice(0).join('\n').trim();
      if (text) root.appendChild(el('p', null, inlineMd(text).replace(/\n/g, '<br>')));
    };
    const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    for (let i = 0; i < lines.length;) {
      const header = lines[i];
      const rule = lines[i + 1] || '';
      if (header.includes('|') && /^\s*\|?\s*:?-{3,}/.test(rule) && rule.includes('|')) {
        flush();
        const table = el('table', 'tbl prose-table');
        const head = cells(header);
        table.appendChild(el('thead', null, '<tr>' + head.map(cell => '<th>' + inlineMd(cell) + '</th>').join('') + '</tr>'));
        const body = el('tbody');
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const row = cells(lines[i]);
          body.appendChild(el('tr', null, row.map(cell => '<td>' + inlineMd(cell) + '</td>').join('')));
          i++;
        }
        table.appendChild(body); root.appendChild(table);
        continue;
      }
      paragraph.push(lines[i]); i++;
    }
    flush();
    return root;
  }

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
  const VISUAL_TOKEN_PROPS = [
    '--bg', '--cover-bg', '--card', '--panel', '--bg2', '--ink', '--text2', '--accent', '--accent2', '--line',
    '--serif', '--sans', '--mono', '--display-weight', '--body-weight', '--radius',
    '--design-border-width', '--design-shadow', '--fs-caption', '--fs-body', '--fs-lead',
    '--fs-h2', '--fs-h1', '--fs-hero',
  ];
  function safeCssColor(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v && v.length <= 80 && !/[;{}]/.test(v) && !/url|var\s*\(/i.test(v)
      && (!window.CSS || !CSS.supports || CSS.supports('color', v)) ? v : null;
  }
  function safeFontStack(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v && v.length <= 180 && /^[\w\s,'"\-]+$/.test(v) ? v : null;
  }
  const VISUAL_FONT_STACKS = {
    'display-sans': "Inter,'Noto Sans SC','Microsoft YaHei',sans-serif",
    'system-sans': "Inter,'Noto Sans SC','Microsoft YaHei',sans-serif",
    'humanist-sans': "'Hanken Grotesk','Noto Sans SC','Microsoft YaHei',sans-serif",
    'rounded-sans': "Nunito,'Noto Sans SC','Microsoft YaHei',sans-serif",
    'editorial-serif': "Newsreader,'Noto Serif SC','Songti SC',SimSun,serif",
    'technical-mono': "'JetBrains Mono','Cascadia Mono','Noto Sans Mono CJK SC',monospace",
  };
  const VISUAL_TYPE_SCALES = {
    compact: { caption: 12, body: 17, lead: 18, h2: 34, h1: 44, hero: 56 },
    balanced: { caption: 13, body: 19, lead: 20, h2: 40, h1: 54, hero: 70 },
    editorial: { caption: 14, body: 20, lead: 22, h2: 44, h1: 60, hero: 80 },
    poster: { caption: 14, body: 20, lead: 22, h2: 48, h1: 66, hero: 92 },
  };
  const VISUAL_SHADOWS = {
    none: 'none',
    soft: '0 10px 28px rgba(24,32,38,.10)',
    hard: '8px 8px 0 rgba(24,32,38,.18)',
    lifted: '0 18px 42px rgba(24,32,38,.16)',
  };
  function safeCssLength(value, min, max) {
    if (Number.isFinite(+value)) return Math.min(max, Math.max(min, +value)) + 'px';
    const v = typeof value === 'string' ? value.trim() : '';
    const match = v.match(/^(\d+(?:\.\d+)?)(px|rem|em)$/);
    if (!match) return null;
    const pixels = +match[1] * (match[2] === 'px' ? 1 : 16);
    return Math.min(max, Math.max(min, pixels)) + 'px';
  }
  function safeWeight(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 100 && n <= 900 ? String(Math.round(n / 100) * 100) : null;
  }
  /** Compile the optional Design DNA into guarded runtime tokens. Invalid values simply leave the theme token intact. */
  function applyVisualSystem(visualSystem) {
    const root = document.documentElement;
    for (const prop of VISUAL_TOKEN_PROPS) root.style.removeProperty(prop);
    delete root.dataset.visualTexture;
    const v = visualSystem && typeof visualSystem === 'object' ? visualSystem : {};
    const palette = v.palette && typeof v.palette === 'object' ? v.palette : {};
    const paletteMap = { background: '--bg', surface: '--card', surfaceAlt: '--bg2', ink: '--ink', muted: '--text2', accent: '--accent', accent2: '--accent2', line: '--line' };
    for (const [key, prop] of Object.entries(paletteMap)) {
      const color = safeCssColor(palette[key]);
      if (color) root.style.setProperty(prop, color);
    }
    const background = safeCssColor(palette.background), surface = safeCssColor(palette.surface);
    if (background) root.style.setProperty('--cover-bg', background);
    if (surface) root.style.setProperty('--panel', surface);
    const typography = v.typography && typeof v.typography === 'object' ? v.typography : {};
    const fontMap = { display: '--serif', body: '--sans', mono: '--mono' };
    for (const [key, prop] of Object.entries(fontMap)) {
      const font = VISUAL_FONT_STACKS[typography[key]] || safeFontStack(typography[key]);
      if (font) root.style.setProperty(prop, font);
    }
    const dw = safeWeight(typography.displayWeight), bw = safeWeight(typography.bodyWeight);
    if (dw) root.style.setProperty('--display-weight', dw);
    if (bw) root.style.setProperty('--body-weight', bw);
    const scale = VISUAL_TYPE_SCALES[typography.scale]
      || (typography.scale && typeof typography.scale === 'object' ? typography.scale : {});
    const scaleMap = { caption: ['--fs-caption', 10, 24], body: ['--fs-body', 12, 34], lead: ['--fs-lead', 12, 38], h2: ['--fs-h2', 22, 80], h1: ['--fs-h1', 28, 100], hero: ['--fs-hero', 32, 124] };
    for (const [key, [prop, min, max]] of Object.entries(scaleMap)) {
      const size = safeCssLength(scale[key], min, max);
      if (size) root.style.setProperty(prop, size);
    }
    const shape = v.shape && typeof v.shape === 'object' ? v.shape : {};
    const radius = safeCssLength(shape.radius, 0, 48), border = safeCssLength(shape.borderWidth, 0, 8);
    if (radius) root.style.setProperty('--radius', radius);
    if (border) root.style.setProperty('--design-border-width', border);
    const shadowName = typeof shape.shadow === 'string' ? shape.shadow.trim() : '';
    const shadow = VISUAL_SHADOWS[shadowName] || '';
    if (shadow && shadow.length <= 160 && !/[;{}]|url|var\s*\(/i.test(shadow)
        && (!window.CSS || !CSS.supports || CSS.supports('box-shadow', shadow))) root.style.setProperty('--design-shadow', shadow);
    const texture = typeof v.texture === 'string' ? v.texture.trim().toLowerCase() : '';
    if (['none', 'grid', 'paper', 'grain', 'soft-gradient'].includes(texture)) {
      root.dataset.visualTexture = texture;
    }
  }
  function refreshThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, f) => (cs.getPropertyValue(n).trim() || f);
    C_INK = g('--ink', '#1A1A1A'); C_LINE = g('--line', '#B8B0A4');
    C_TEXT2 = g('--text2', '#5A5A5A'); C_ACCENT = g('--accent', '#8A8178');
    TONE = { line: C_LINE, accent: C_ACCENT, ink: C_INK };
    PLOT_STYLE = { background: 'transparent', color: C_TEXT2, fontSize: '15px', fontFamily: g('--sans', "'Inter',sans-serif") };
    /* 主题 token 变了 → 已挂载的 widget iframe 用新 token 重建 srcdoc。
       顺手清掉根节点已脱离文档的条目（块被删/整页换掉时会出现），别对着幽灵重建。 */
    for (const [id, build] of widgetBuilds) {
      const root = widgetRoots.get(id);
      if (root && !root.isConnected) { widgetBuilds.delete(id); widgetRoots.delete(id); continue; }
      build();
    }
  }
  refreshThemeColors(); /* 先给默认值兜底；设好 data-theme 后会再刷新一次 */

  /* Observable Plot 是异步 vendored 脚本；若 sim 的 render 在其加载完成前经 onReady 触发，早退会让图表**永久空白**
     （sim 图表偶发空图的竞态根因）。needPlot：未就绪则下一帧重试(Plot 一到就画)，全局上限 ~300 帧(≈5s)防 Plot 缺失时空转。 */
  let _plotFrames = 0;
  function needPlot(render) { if (window.Plot) return false; if (_plotFrames++ < 300) requestAnimationFrame(render); return true; }
  /* sim 图表是异步渲染（needPlot 重试等 Plot 到位）——若晚于 fitCustomLayout 的量高，所在 index/split/compose 面板会事后长高被裁
     （iter81 大验证实测 67px）。画完后重 fit 所在 section 一次，闭掉这个时序缺口。 */
  function refitAfterChart(elInside) { const sec = elInside && elInside.closest && elInside.closest('section'); if (sec) requestAnimationFrame(() => fitCustomLayout(sec)); }

  /* ================= Block 渲染器 ================= */
  function assetById(id) {
    return ((currentDoc && currentDoc.assets) || []).find(a => a && a.id === id) || null;
  }

  function applyAssetFocalPoint(img, asset) {
    const fp = asset && asset.focalPoint;
    if (fp && Number.isFinite(+fp.x) && Number.isFinite(+fp.y)) {
      img.style.objectPosition = Math.max(0, Math.min(1, +fp.x)) * 100 + '% ' + Math.max(0, Math.min(1, +fp.y)) * 100 + '%';
    }
  }

  const blockRenderers = {
    hero(b, ctx) {
      const inner = el('div', 'inner');
      if (b.tag) inner.appendChild(el('div', 'tag', inlineMd(b.tag)));
      const h1 = el('h1', null, b.title.map(inlineMd).join('<br>'));
      if (b.titleSize) h1.style.fontSize = b.titleSize + 'px';
      inner.appendChild(h1);
      if (b.sub) inner.appendChild(el('div', 'sub', inlineMd(b.sub)));
      if (b.accentRule) inner.appendChild(el('div', 'h-accent'));
      if (b.facts) inner.appendChild(el('div', 'facts', inlineMd(b.facts)));
      if (b.hint) inner.appendChild(el('div', 'hint', inlineMd(b.hint)));
      if (b.image) {
        const img = document.createElement('img');
        img.className = 'hero-image'; img.alt = ''; img.src = b.image;   // data: URI（离线红线，schema/validate 已拦远程 URL）
        inner.appendChild(img);
      }
      return inner;
    },
    media(b) {
      const asset = assetById(b.assetId);
      if (!asset) throw new Error('media 引用未知 asset: ' + b.assetId);
      const placement = b.placement === 'decoration' ? 'decoration' : 'illustration';
      const treatments = new Set(['frame', 'full-bleed', 'cutout', 'duotone', 'soft-mask', 'none']);
      const treatment = treatments.has(b.treatment) ? b.treatment : 'none';
      const figure = el('figure', 'media-block media-' + placement + ' media-purpose-' + (b.purpose || 'explanatory') + ' media-treatment-' + treatment);
      const img = document.createElement('img');
      img.src = asset.src;
      img.alt = placement === 'decoration' ? '' : (asset.alt || '');
      img.loading = 'eager';
      img.style.objectFit = b.fit === 'cover' ? 'cover' : 'contain';
      const pos = b.objectPosition;
      if (pos && Number.isFinite(+pos.x) && Number.isFinite(+pos.y)) {
        img.style.objectPosition = Math.max(0, Math.min(1, +pos.x)) * 100 + '% ' + Math.max(0, Math.min(1, +pos.y)) * 100 + '%';
      } else applyAssetFocalPoint(img, asset);
      const ratio = Number.isFinite(+b.aspectRatio) && +b.aspectRatio > 0
        ? String(Math.min(6, Math.max(0.2, +b.aspectRatio)))
        : (typeof b.aspectRatio === 'string' && /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(b.aspectRatio.trim()) ? b.aspectRatio.trim() : '');
      if (ratio) figure.style.aspectRatio = ratio;
      const masks = new Set(['circle', 'rounded', 'arch', 'blob', 'hexagon', 'none']);
      if (masks.has(b.mask)) figure.dataset.mask = b.mask;
      if (placement === 'decoration') figure.setAttribute('aria-hidden', 'true');
      figure.appendChild(img);
      if (b.caption) figure.appendChild(el('figcaption', 'media-caption', inlineMd(b.caption)));
      return figure;
    },
    statement(b) {
      const wrap = el('div');
      const q = el('div', 'q', inlineMd(b.statement) + (b.sub ? '<br><span class="q-sub">' + inlineMd(b.sub) + '</span>' : ''));
      wrap.appendChild(q);
      if (b.cite) wrap.appendChild(el('div', 'cite', inlineMd(b.cite)));
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
        const li = el('li', fragClass(it.fragment) || null);
        const icon = it.icon && renderIcon(it.icon);
        if (icon) { li.classList.add('has-icon'); li.appendChild(icon); }
        /* lead：条目粗体小标题（"集合结构" / "线性结构" …）。曾被静默丢弃——生成侧
           大量写 lead 而此处只读 text，整条层级信息不上屏，观感即"文字墙"。 */
        if (it.lead) li.appendChild(el('span', 'li-lead', inlineMd(it.lead)));
        li.appendChild(el('span', null, inlineMd(it.text)));
        ul.appendChild(li);
      }
      return ul;
    },
    agenda(b) {
      const wrap = el('div', 'agenda');
      b.rows.forEach((r, i) => {
        const row = el('div', 'agenda-row' + (r.fragment ? ' ' + fragClass(r.fragment) : ''));
        row.appendChild(el('span', 'num', String(i + 1)));
        row.appendChild(el('span', 'v', '<span class="k">' + inlineMd(r.label) + '</span>' + inlineMd(r.text)));
        wrap.appendChild(row);
      });
      return wrap;
    },
    callout(b) {
      const d = el('div', 'callout' + (b.fragment ? ' ' + fragClass(b.fragment) : ''));
      d.innerHTML = '<span class="k">' + inlineMd(b.label) + '</span>' + inlineMd(b.text);
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
        it.appendChild(el('div', 'tl-time', inlineMd(e.time)));
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
      if (b.caption) {
        const dense = /\\\\|\\begin\{(?:aligned|align|gather|array|cases)\}/.test(String(b.latex || ''))
          || String(b.latex || '').length > 150;
        const w = el('div', 'formula-block' + (dense ? ' is-dense-formula' : ''));
        w.appendChild(m); w.appendChild(el('div', 'cite', inlineMd(b.caption))); return w;
      }
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
      t.appendChild(el('thead', null, '<tr>' + b.head.map(h => '<th>' + inlineMd(h) + '</th>').join('') + '</tr>'));
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
    /* chart：bar(单序列)/line/area(多序列叠加)/scatter，复用 sim 的 Plot 主题联动(PLOT_STYLE/C_*)与
       needPlot/refitAfterChart 时序纪律(Plot 是异步 vendored 脚本，早绘会永久空白——sim 已踩过的坑)。 */
    chart(b, ctx) {
      const root = el('div', 'chart-block');
      const plotwrap = el('div', 'plotwrap');
      root.appendChild(plotwrap);
      if (b.caption) root.appendChild(el('div', 'cite', inlineMd(b.caption)));
      const colors = [C_ACCENT, C_INK, C_LINE];
      let lastPlotWidth = 0;
      function render() {
        if (needPlot(render)) return;
        plotwrap.innerHTML = '';
        const marks = [];
        if (b.chartType === 'bar') {
          const s = (b.series || [])[0];
          const data = (b.categories || []).map((c, i) => ({ category: c, value: s ? s.values[i] : 0 }));
          marks.push(Plot.barY(data, { x: 'category', y: 'value', fill: C_ACCENT }));
        } else if (b.chartType === 'line' || b.chartType === 'area') {
          (b.series || []).forEach((s, i) => {
            const data = (b.categories || []).map((c, j) => ({ category: c, value: s.values[j] }));
            const color = colors[i % colors.length];
            if (b.chartType === 'area') marks.push(Plot.areaY(data, { x: 'category', y: 'value', fill: color, fillOpacity: 0.22 }));
            marks.push(Plot.line(data, { x: 'category', y: 'value', stroke: color, strokeWidth: 2.2, curve: 'catmull-rom' }));
            marks.push(Plot.dot(data, { x: 'category', y: 'value', fill: color, r: 2.6 }));
          });
        } else if (b.chartType === 'scatter') {
          marks.push(Plot.dot(b.points || [], { x: 'x', y: 'y', fill: C_ACCENT, r: 4.5, stroke: C_INK, strokeWidth: 0.6 }));
        }
        // 教学标注必须是独立语义层，不能再伪造成「大部分为 0 的额外 series」。
        // point 用于当前状态/关键点；line/arrow 用于切线、阈值、更新方向。
        const toneColor = a => ({ accent: C_ACCENT, ink: C_INK, line: C_LINE }[a.tone || 'accent'] || C_ACCENT);
        const annotations = b.annotations || [];
        const points = annotations.filter(a => a.kind === 'point');
        const segments = annotations.filter(a => a.kind === 'line');
        const arrows = annotations.filter(a => a.kind === 'arrow');
        if (segments.length) marks.push(Plot.link(segments, {
          x1: 'x', y1: 'y', x2: 'x2', y2: 'y2', stroke: toneColor, strokeWidth: 2.2,
        }));
        if (arrows.length) marks.push(Plot.arrow(arrows, {
          x1: 'x', y1: 'y', x2: 'x2', y2: 'y2', stroke: toneColor, strokeWidth: 2.2,
        }));
        if (points.length) marks.push(Plot.dot(points, {
          x: 'x', y: 'y', fill: toneColor, stroke: C_INK, strokeWidth: 1, r: 6,
        }));
        const labels = annotations.filter(a => a.label).map(a => ({
          ...a,
          labelX: a.kind === 'point' ? a.x : a.x2,
          labelY: a.kind === 'point' ? a.y : a.y2,
        }));
        if (labels.length) marks.push(Plot.text(labels, {
          x: 'labelX', y: 'labelY', text: 'label', dx: 8, dy: -9,
          textAnchor: 'start', fill: C_INK, fontSize: 14,
        }));
        const plotWidth = Math.max(420, Math.min(1600, Math.round(plotwrap.clientWidth || 700)));
        const plotHeight = Math.max(300, Math.min(680, Math.round(plotwrap.clientHeight || 380)));
        plotwrap.appendChild(Plot.plot({
          width: plotWidth, height: plotHeight, marginLeft: 68, marginBottom: 58, marginTop: 44, marginRight: 72,
          style: PLOT_STYLE,
          /* categories 常是"2021"这种数字形字符串——不显式声明 band/point 序数刻度，Plot 会当成误传数字
             警告并画出角标感叹号；scatter 走真数值 x，留给 Plot 自动推断线性刻度。
             domain 必须显式给 b.categories 原始顺序——不给的话 Plot 对序数刻度会按值做字典序排序，
             "10,50,100,500,1000,5000,10000" 这种数字形字符串会被拍成 "10,100,1000,10000,50,500,5000"，
             author 给定的顺序（哪怕是刻意乱序）必须原样保留。 */
          x: b.chartType === 'scatter'
            ? { label: b.xLabel }
            : { label: b.xLabel, type: 'band', domain: b.categories || [] },
          y: { label: b.yLabel, grid: true, nice: true },
          marks,
        }));
        lastPlotWidth = plotWidth;
        refitAfterChart(plotwrap);
      }
      // Reveal 初始化时非当前页是 display:none，clientWidth=0；旧逻辑永远保留 700px fallback，
      // 该页后来变为可见也不重画，导致全宽 quiz 图只占约半栏。观察真实宽度，激活后补画一次。
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          const width = Math.round(plotwrap.clientWidth || 0);
          const desired = Math.max(420, Math.min(1600, width));
          if (width > 0 && Math.abs(desired - lastPlotWidth) > 12) requestAnimationFrame(render);
        });
        ro.observe(plotwrap);
      }
      plotwrap.__lectureChartRender = render;
      ctx.onReady(render);
      return root;
    },
    code(b) {
      const card = el('div', 'codecard');
      card.appendChild(el('div', 'bar', '<span class="d"></span><span class="lbl">' + inlineMd(b.filename || '') + '</span>'));
      const pre = el('pre'); const code = el('code', 'language-' + (b.language || 'text'));
      code.textContent = b.source; pre.appendChild(code); card.appendChild(pre);
      if (b.caption) { const w = el('div'); w.appendChild(card); w.appendChild(el('div', 'cite', inlineMd(b.caption))); return w; }
      return card;
    },
    compare(b, ctx) {
      const cols = el('div', 'cols');
      for (const side of [b.left, b.right]) {
        const cell = el('div');
        if (side.caption) cell.appendChild(el('div', 'compare-caption', inlineMd(side.caption)));
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
    stats(b) {
      const row = el('div', 'stats-row');
      row.style.gridTemplateColumns = 'repeat(' + b.items.length + ',1fr)';
      for (const it of b.items) {
        const card = el('div', 'stat-card');
        card.appendChild(el('div', 'stat-value', inlineMd(it.value)));
        if (it.delta) card.appendChild(el('div', 'stat-delta', inlineMd(it.delta)));
        card.appendChild(el('div', 'stat-label', inlineMd(it.label)));
        row.appendChild(card);
      }
      return row;
    },
    /* diagram：7 种 diagramType 共用一个块类型（仿 sim.engine/chart.chartType 判别分派），
       几何形状(cycle/circular-grid/connected-circles)由 diagramRadial 统一算圆周坐标。 */
    diagram(b) {
      const fn = diagramRenderers[b.diagramType] || diagramRenderers['arrow-seq'];
      return fn(b.nodes || []);
    },
    /* graph：带 edges 的树/DAG/分支流程，真 SVG 分层图（见上方 graphBlock）。
       要画"有父子/分支关系"的结构就用它，别再用 diagram 硬凑。 */
    graph(b) { return graphBlock(b); },
    quiz(b) {
      const wrap = el('div');
      if (b.kind === 'objective') {
        wrap.dataset.answer = b.answer;
        const stem = b.stem || b.context;   // stem 是 create-quiz 契约/生成侧的题干字段名；context 为兼容基线的旧别名
        if (stem) wrap.appendChild(richProse(stem, 'quiz-context'));
        for (const c of b.choices) {
          const ch = el('div', 'choice', '<span class="k">' + inlineMd(String(c.key).toUpperCase()) + '</span><span>' + inlineMd(c.text) + '</span>');
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
    /* video：一等视频块（播本地 vendored 视频，非 freeform 逃生舱）。红线：只接受本地相对/data: 源，拒远程 URL(无网络)；
       无有效源→显式占位不静默、不 mock。渲染器只碰这一处核心，重捕获工具(阶段2)与之解耦。 */
    video(b) {
      const isLocal = s => typeof s === 'string' && s.length > 0 && !/^\s*(https?:)?\/\//i.test(s);   // 拒 http(s):// 与 //host（协议相对）；放行本地相对路径与 data:
      const w = el('div', 'video-block');
      const v = document.createElement('video');
      v.controls = true; v.preload = 'metadata'; v.setAttribute('playsinline', '');
      if (b.loop) v.loop = true;
      if (isLocal(b.poster)) v.poster = b.poster;
      if (isLocal(b.src)) {
        v.src = b.src;
        if (isLocal(b.captions)) { const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.srclang = b.language || 'zh'; tr.src = b.captions; tr.default = true; v.appendChild(tr); }
      }
      w.appendChild(v);
      if (!isLocal(b.src) && !isLocal(b.poster)) { v.style.display = 'none'; w.appendChild(el('div', 'video-note', '视频待生成')); }   // 无源无海报：占位
      if (b.caption) w.appendChild(el('div', 'video-cap', inlineMd(b.caption)));
      return w;
    },
    freeform(b) {
      /* 长尾兜底：结构化块表达不了的图形/版式走这里。
         rationale 供 schema 演进与离线审计使用，不属于课程正文，绝不展示给学生。
         html 已在校验阶段查过危险标签，这里净化是运行时防御性第二道关。 */
      const wrap = el('div', 'freeform');
      const body = el('div', 'freeform-body');
      body.innerHTML = sanitizeFreeformHtml(b.html);
      wrap.appendChild(body);
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
    if (b.fragment && !root.classList.contains('fragment')) fragClass(b.fragment).split(' ').forEach(c => root.classList.add(c));
    /* 块级 DOM 锚点：让"改一个块"能只换这一个节点（rerenderBlock），不牵动同页的
       runnable 传送门 / widget iframe。scene 侧的锚点是 section[data-scene-id]，两者成对。 */
    if (b && b.id != null) root.dataset.blockId = String(b.id);
    return root;
  }

  /* ================= diagram 几何渲染 ================= */
  function diagNodeBox(n) {
    const box = el('div', 'diagram-node');
    box.appendChild(el('div', 'dn-title', inlineMd(n.title || '')));
    if (n.sub) box.appendChild(el('div', 'dn-sub', inlineMd(n.sub)));
    return box;
  }

  /* ============================ graph：带边的一等图块（树 / DAG / 分支流程） ============================
     与 diagram/flow 的根本区别：它有 edges。那两者只能表达一条线性链或一圈环——一棵带父子关系的
     真实树在它们的契约里根本不可表达，于是模型只能把树硬塞成"叠盘子"，箭头指向空白。

     布局是 Sugiyama-lite：① 最长路径分层 ② 重心法排序减少交叉 ③ 按测得的文字宽度定位。
     关键约束：**不能依赖 DOM 测量**——reveal 的非当前页是 display:none，getBoundingClientRect
     一律返回 0，等到 slidechanged 再算就会闪一下。改用 canvas measureText：它不走布局，
     隐藏页里也能拿到真实文字宽度（同 lessons FE-7 的做法）。 */

  let _measureCtx = null;
  function measureText(text, font) {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    _measureCtx.font = font;
    return _measureCtx.measureText(String(text == null ? '' : text)).width;
  }

  const G_PAD_X = 18, G_PAD_Y = 12, G_MIN_W = 96, G_MAX_W = 230;
  const G_GAP_X = 34, G_GAP_Y = 64;

  /** 纯文本长度（去掉 **粗体** / `code` / $math$ 记号），用于量宽——量到记号会把盒子撑歪。 */
  function graphPlainText(s) {
    return String(s == null ? '' : s)
      .replace(/\$[^$]*\$/g, m => m.slice(1, -1))
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1');
  }

  /** 节点盒尺寸：按标题/副标题的实测宽度，超过 G_MAX_W 就折行并相应加高。 */
  function graphNodeSize(node, fonts) {
    const tW = measureText(graphPlainText(node.title), fonts.title);
    const sW = node.sub ? measureText(graphPlainText(node.sub), fonts.sub) : 0;
    /* 菱形（判定节点）的可用内宽只有外接矩形的一半左右，同样的字要给更大的盒子才装得下 */
    const diamond = node.shape === 'diamond';
    const slack = diamond ? 1.7 : 1;
    const w = Math.max(G_MIN_W, Math.min(G_MAX_W * slack, Math.max(tW, sW) * slack + G_PAD_X * 2));
    const inner = Math.max(24, w / slack - G_PAD_X * 2);
    const tLines = Math.max(1, Math.ceil(tW / inner));
    const sLines = node.sub ? Math.max(1, Math.ceil(sW / inner)) : 0;
    const h = G_PAD_Y * 2 + tLines * 23 + (sLines ? sLines * 18 + 4 : 0);
    return { w, h: Math.max(diamond ? 76 : 52, diamond ? h * 1.7 : h) };
  }

  /** 最长路径分层。**dashed 边不参与分层**——它们按契约就是回边，算进去会让含环的
   *  flowchart 一个 indeg=0 的节点都找不到，Kahn 直接空转，所有节点留在第 0 层挤成一行。 */
  function graphLayers(nodes, edges) {
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const out = new Map(nodes.map(n => [n.id, []]));
    const indeg = new Map(nodes.map(n => [n.id, 0]));
    for (const e of edges) {
      if (!idx.has(e.from) || !idx.has(e.to) || e.from === e.to) continue;
      if (e.style === 'dashed') continue;
      out.get(e.from).push(e.to);
      indeg.set(e.to, indeg.get(e.to) + 1);
    }
    // Kahn 拓扑序；有环时把剩余节点按原序追加（回边不该阻塞布局）
    const layer = new Map(nodes.map(n => [n.id, 0]));
    const deg = new Map(indeg);
    const q = nodes.filter(n => deg.get(n.id) === 0).map(n => n.id);
    const order = [];
    while (q.length) {
      const cur = q.shift(); order.push(cur);
      for (const nxt of out.get(cur)) {
        layer.set(nxt, Math.max(layer.get(nxt), layer.get(cur) + 1));
        deg.set(nxt, deg.get(nxt) - 1);
        if (deg.get(nxt) === 0) q.push(nxt);
      }
    }
    for (const n of nodes) if (!order.includes(n.id)) order.push(n.id);   // 环上的节点保底
    return layer;
  }

  /** 重心法排序：按父节点的平均位置重排每层，减少连线交叉（两趟足够，图不大）。 */
  function graphOrder(nodes, edges, layer) {
    const byLayer = new Map();
    for (const n of nodes) {
      const L = layer.get(n.id) || 0;
      if (!byLayer.has(L)) byLayer.set(L, []);
      byLayer.get(L).push(n.id);
    }
    const parents = new Map(nodes.map(n => [n.id, []]));
    for (const e of edges) {
      if (e.style === 'dashed') continue;                    // 与分层口径一致：回边不参与排序
      if (parents.has(e.to) && parents.has(e.from)) parents.get(e.to).push(e.from);
    }
    const maxL = Math.max(...byLayer.keys());
    for (let pass = 0; pass < 2; pass++) {
      for (let L = 1; L <= maxL; L++) {
        const above = byLayer.get(L - 1) || [];
        const pos = new Map(above.map((id, i) => [id, i]));
        const row = byLayer.get(L) || [];
        const bary = new Map(row.map(id => {
          const ps = parents.get(id).filter(p => pos.has(p)).map(p => pos.get(p));
          return [id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER];
        }));
        row.sort((a, b) => bary.get(a) - bary.get(b));
      }
    }
    return byLayer;
  }

  /** 正交折线：父底 → 中间水平段 → 子顶（树/DAG 读起来最清楚；横向时轴对调）。
   *  回边（目标在源之前的层，典型是 flowchart 的循环）不能走中间——那样会横穿整张图、
   *  和主流程线叠在一起。改成从侧面绕出去再拐回来，一眼就能看出"这是回流"。 */
  function graphEdgePath(a, b, horizontal, gutter) {
    if (horizontal) {
      const back = b.x < a.x;
      const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
      if (back) {
        const yy = gutter;                                   // 绕到整图上沿之外
        return `M${a.x + a.w / 2},${a.y} V${yy} H${b.x + b.w / 2} V${b.y}`;
      }
      const x1 = a.x + a.w, x2 = b.x, mx = (x1 + x2) / 2;
      return `M${x1},${y1} H${mx} V${y2} H${x2}`;
    }
    const back = b.y < a.y;
    if (back) {
      const xx = gutter;                                     // 绕到整图右侧之外
      const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
      return `M${a.x + a.w},${y1} H${xx} V${y2} H${b.x + b.w}`;
    }
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }

  function graphBlock(b) {
    const nodes = (b.nodes || []).filter(n => n && n.id);
    const edges = (b.edges || []).filter(e => e && e.from && e.to);
    const wrap = el('div', 'graphwrap');
    if (nodes.length < 2) return wrap;                       // 缺字段兜底不抛（红线）
    const horizontal = b.orientation === 'horizontal';

    /* 字体取自主题 token（.graph 的 computedStyle），保证测量与实际渲染同一套字面 */
    const probe = el('div', 'graph');
    wrap.appendChild(probe);
    const cs = getComputedStyle(probe);
    const family = cs.fontFamily || 'sans-serif';
    const fonts = { title: `600 18px ${family}`, sub: `400 14px ${family}` };

    const size = new Map(nodes.map(n => [n.id, graphNodeSize(n, fonts)]));
    const layer = graphLayers(nodes, edges);
    const byLayer = graphOrder(nodes, edges, layer);
    const layerKeys = [...byLayer.keys()].sort((x, y) => x - y);

    /* 定位：沿"层轴"按层累进，沿"排轴"每层居中铺开 */
    const place = new Map();
    let cross = 0;                                            // 层轴累计（vertical=y, horizontal=x）
    const rowSpan = [];
    for (const L of layerKeys) {
      const row = byLayer.get(L);
      const along = row.reduce((s, id) => s + (horizontal ? size.get(id).h : size.get(id).w), 0)
        + G_GAP_X * (row.length - 1);
      rowSpan.push(along);
    }
    const maxSpan = Math.max(...rowSpan, 1);
    layerKeys.forEach((L, li) => {
      const row = byLayer.get(L);
      let along = (maxSpan - rowSpan[li]) / 2;                // 本层整体居中
      let thick = 0;
      for (const id of row) {
        const { w, h } = size.get(id);
        if (horizontal) { place.set(id, { x: cross, y: along, w, h }); along += h + G_GAP_X; thick = Math.max(thick, w); }
        else { place.set(id, { x: along, y: cross, w, h }); along += w + G_GAP_X; thick = Math.max(thick, h); }
      }
      cross += thick + G_GAP_Y;
    });
    let totalW = horizontal ? cross - G_GAP_Y : maxSpan;
    let totalH = horizontal ? maxSpan : cross - G_GAP_Y;
    /* 有回边就在绕行侧预留一条走线沟，并把整图挪开——否则折线画到 viewBox 之外被裁掉 */
    const hasBack = edges.some(e => {
      const a = place.get(e.from), c = place.get(e.to);
      return a && c && (horizontal ? c.x < a.x : c.y < a.y);
    });
    const GUTTER = 22;
    let gutter = 0;
    if (hasBack) {
      if (horizontal) {
        for (const p of place.values()) p.y += GUTTER;
        totalH += GUTTER; gutter = GUTTER / 2;
      } else {
        totalW += GUTTER; gutter = totalW - GUTTER / 2;
      }
    }

    /* SVG 只画边（节点用 HTML div，能继承主题排版与 inlineMd 富文本）。
       viewBox + width/height:100% 让整张图随容器等比缩放，不需要 JS 二次 fit。 */
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, totalW)} ${Math.max(1, totalH)}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('graph-svg');
    const defs = document.createElementNS(svgNS, 'defs');
    for (const [mid, color] of [['graph-arrow', 'var(--accent)'], ['graph-arrow-dim', 'var(--text2)']]) {
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', mid); marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5');
      marker.setAttribute('orient', 'auto-start-reverse');
      const tip = document.createElementNS(svgNS, 'path');
      tip.setAttribute('d', 'M0,0 L10,5 L0,10 Z'); tip.setAttribute('fill', color);
      marker.appendChild(tip); defs.appendChild(marker);
    }
    svg.appendChild(defs);

    for (const e of edges) {
      const a = place.get(e.from), c = place.get(e.to);
      if (!a || !c) continue;                                 // 断边：校验器已报错，渲染侧静默跳过不崩
      const dashed = e.style === 'dashed';
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', graphEdgePath(a, c, horizontal, gutter));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', dashed ? 'var(--text2)' : 'var(--accent)');
      p.setAttribute('stroke-width', '1.5');
      if (dashed) p.setAttribute('stroke-dasharray', '5 4');
      p.setAttribute('marker-end', `url(#${dashed ? 'graph-arrow-dim' : 'graph-arrow'})`);
      svg.appendChild(p);
      if (e.label) {
        /* 标签压在折线的中段：先垫一块底色矩形再写字，否则线会从字中间穿过去 */
        const mx = horizontal ? (a.x + a.w + c.x) / 2 : (a.x + a.w / 2 + c.x + c.w / 2) / 2;
        const my = horizontal ? (a.y + a.h / 2 + c.y + c.h / 2) / 2 : (a.y + a.h + c.y) / 2;
        const tw = measureText(e.label, `500 11px ${family}`) + 8;
        const bg = document.createElementNS(svgNS, 'rect');
        bg.setAttribute('x', mx - tw / 2); bg.setAttribute('y', my - 8);
        bg.setAttribute('width', tw); bg.setAttribute('height', 16);
        bg.setAttribute('fill', 'var(--bg)');
        svg.appendChild(bg);
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', mx); t.setAttribute('y', my + 4);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'graph-elabel');
        t.textContent = e.label;
        svg.appendChild(t);
      }
    }

    const stage = el('div', 'graph-stage');
    /* 固定成"算出来的自然尺寸"，再用 max-width:100% 允许缩不允许放。
       若只写 width:100%+aspect-ratio，小图会被拉满整幅：盒子涨大而字号不变，
       看起来就是几个空旷的大框——节点尺寸本就是按实测文字算的，按原尺寸画才对得上。
       真放不下时交给 balanceScene 的 zoom 与 ④.7 的溢出回炉，不在这里自作主张。 */
    stage.style.width = Math.max(1, totalW) + 'px';
    stage.style.aspectRatio = `${Math.max(1, totalW)} / ${Math.max(1, totalH)}`;
    stage.appendChild(svg);
    for (const n of nodes) {
      const p = place.get(n.id);
      if (!p) continue;
      const box = el('div', 'graph-node' + (n.state ? ' is-' + n.state : '') + (n.shape ? ' shape-' + n.shape : ''));
      box.style.left = (p.x / totalW * 100) + '%';
      box.style.top = (p.y / totalH * 100) + '%';
      box.style.width = (p.w / totalW * 100) + '%';
      box.style.height = (p.h / totalH * 100) + '%';
      box.appendChild(el('div', 'gn-title', inlineMd(n.title)));
      if (n.sub) box.appendChild(el('div', 'gn-sub', inlineMd(n.sub)));
      stage.appendChild(box);
    }
    probe.remove();
    wrap.appendChild(stage);
    if (b.caption) wrap.appendChild(el('div', 'cite', inlineMd(b.caption)));
    return wrap;
  }

  /* cycle/circular-grid/connected-circles 共用：N 个节点按圆周均匀分布(viewBox 0-100 坐标)，
     SVG 覆盖层画连线（ring=首尾相接+箭头，mesh=两两全连，none=纯环绕不连线）。 */
  function diagramRadial(nodes, connect) {
    const n = nodes.length;
    const wrap = el('div', 'diagram-radial');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('diagram-radial-svg');
    const cx = 50, cy = 50, r = 34;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + i * (2 * Math.PI / Math.max(1, n));
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    if (connect === 'ring') {
      const defs = document.createElementNS(svgNS, 'defs');
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', 'dia-arrow'); marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5'); marker.setAttribute('orient', 'auto-start-reverse');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M0,0 L10,5 L0,10 Z'); path.setAttribute('fill', 'var(--accent)');
      marker.appendChild(path); defs.appendChild(marker); svg.appendChild(defs);
      for (let i = 0; i < n; i++) {
        const a = pts[i], bpt = pts[(i + 1) % n];
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', bpt.x); line.setAttribute('y2', bpt.y);
        line.setAttribute('stroke', 'var(--accent)'); line.setAttribute('stroke-width', '1');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('marker-end', 'url(#dia-arrow)');
        svg.appendChild(line);
      }
    } else if (connect === 'mesh') {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', pts[i].x); line.setAttribute('y1', pts[i].y);
          line.setAttribute('x2', pts[j].x); line.setAttribute('y2', pts[j].y);
          line.setAttribute('stroke', 'var(--line)'); line.setAttribute('stroke-width', '0.6');
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          svg.appendChild(line);
        }
      }
    }
    wrap.appendChild(svg);
    nodes.forEach((node, i) => {
      const box = diagNodeBox(node);
      box.classList.add('diagram-radial-node');
      box.style.left = pts[i].x + '%';
      box.style.top = pts[i].y + '%';
      wrap.appendChild(box);
    });
    return wrap;
  }

  const diagramRenderers = {
    'arrow-seq'(nodes) {
      const wrap = el('div', 'diagram-arrowseq');
      nodes.forEach((n, i) => {
        if (i > 0) wrap.appendChild(el('span', 'da-arrow', '›'));
        wrap.appendChild(diagNodeBox(n));
      });
      return wrap;
    },
    staircase(nodes) {
      const wrap = el('div', 'diagram-staircase');
      nodes.forEach((n, i) => {
        const step = diagNodeBox(n);
        step.classList.add('ds-step');
        step.style.marginTop = (i === 0 ? 0 : 14) + 'px';
        step.style.marginLeft = (i * 56) + 'px';
        wrap.appendChild(step);
      });
      return wrap;
    },
    snake(nodes) {
      const PER_ROW = 4;
      const wrap = el('div', 'diagram-snake');
      for (let i = 0; i < nodes.length; i += PER_ROW) {
        const rowIdx = i / PER_ROW;
        const rev = rowIdx % 2 === 1;
        const row = el('div', 'ds-row' + (rev ? ' rev' : ''));
        nodes.slice(i, i + PER_ROW).forEach((n, j) => {
          if (j > 0) row.appendChild(el('span', 'da-arrow', rev ? '‹' : '›'));
          row.appendChild(diagNodeBox(n));
        });
        wrap.appendChild(row);
      }
      return wrap;
    },
    pyramid(nodes) {
      const wrap = el('div', 'diagram-pyramid');
      const n = nodes.length;
      nodes.forEach((node, i) => {
        const row = el('div', 'dp-row');
        const widthPct = n > 1 ? 40 + i * (60 / (n - 1)) : 100;
        row.style.width = Math.min(100, widthPct) + '%';
        row.appendChild(diagNodeBox(node));
        wrap.appendChild(row);
      });
      return wrap;
    },
    cycle(nodes) { return diagramRadial(nodes, 'ring'); },
    'circular-grid'(nodes) { return diagramRadial(nodes, 'none'); },
    'connected-circles'(nodes) { return diagramRadial(nodes, 'mesh'); },
  };

  /* ================= sim 引擎注册表 ================= */
  function paramPanelControls(b, onInput, blockCls) {
    const values = {}; const ctls = [];
    for (const p of b.params) {
      values[p.name] = p.default;
      const ctl = el('div', 'ctl');
      const lab = el('label', null, escapeHtml(p.label) + ' <span class="v"></span>');
      const input = el('input'); input.type = 'range'; input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.default;
      input.dataset.simParam = p.name;   /* 运行时状态锚点：重渲前后靠它采集/回填滑块位置（见 captureRuntimeState） */
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
        if (needPlot(render)) return;
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
        refitAfterChart(row);
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
        if (needPlot(render)) return;
        const reg = regimes.find(r => r.test(values)) || regimes[regimes.length - 1] || { tone: 'ink', desc: '', label: '' };
        const color = TONE[reg.tone || 'ink'] || C_INK;
        const dash = reg.dash && reg.dash !== 'solid' ? reg.dash : null;
        let desc = reg.desc;
        if (noiseNote && noiseNote.test(values)) desc += noiseNote.text;
        badge.innerHTML = '<span class="rt">' + escapeHtml(reg.label) + '</span>' + escapeHtml(desc);
        const data = run();
        const cs = data.map(d => d.c);
        /* 兜底：递推产出非有限值(如把 2 阶振子塞进 1 维 dynamics1d，consts 里的"速度"是字符串→NaN)时，
           别留一张神秘空图——显式标注数据无效(不静默失败红线)。根治在生成侧(见 create-sim 契约)。 */
        if (cs.filter(Number.isFinite).length < 2) {
          plotwrap.innerHTML = '';
          plotwrap.appendChild(el('div', 'sim-note', '此仿真数据不可用（模型非一维一阶递推）'));
          return;
        }
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
        refitAfterChart(plotwrap);
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
        if (needPlot(render)) return;
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
        refitAfterChart(plotwrap);
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
      const widgetId = String(b.id || ('widget-' + widgetRoots.size));
      widgetRoots.set(widgetId, root);
      frame.setAttribute('sandbox', 'allow-scripts');   // 无 allow-same-origin → null origin，真隔离
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('title', b.caption || '互动组件');
      root.appendChild(frame);
      if (b.caption) root.appendChild(el('div', 'widcap', inlineMd(b.caption)));
      const build = () => {
        root.removeAttribute('data-widget-error');
        frame.srcdoc = buildWidgetSrcdoc(b.html, widgetId, b.spec && b.spec.profile);
      };
      widgetBuilds.set(widgetId, build);   // 主题切换时重建；按 id 覆盖，重渲同一块不会攒下陈旧闭包
      ctx.onReady(build);
      return root;
    }
  };

  /* ================= runnable：可编辑可运行代码单元 =================
     一份讲义可以有多个（各自独立编辑器/portal/状态；同屏一张 slide 最多同时激活一个）。
     Pyodide 解释器全局共享一份(WASM 加载贵)，每块用独立命名空间 dict 隔离全局变量，
     避免块间互相污染 preamble/result（见 knowledge-base/001 FE-48 传送门 + 多实例泛化）。 */
  let sharedPyodide = null, sharedPyLoading = null;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('加载失败: ' + src)); document.head.appendChild(s); }); }
  async function ensureSharedPyodide() {
    if (sharedPyodide) return sharedPyodide;
    if (!sharedPyLoading) sharedPyLoading = (async () => {
      if (!window.loadPyodide) await loadScript('vendor/pyodide/pyodide.js');
      sharedPyodide = await loadPyodide({ indexURL: 'vendor/pyodide/' });
      return sharedPyodide;
    })();
    return sharedPyLoading;
  }
  function renderRunnable(b, ctx) {
    /* uid：优先用 block.id（orchestrator/作者保证唯一）；缺失时兜底自增，避免撞 key。
       同一 uid 再次渲染(live 单页重渲)——清掉旧 portal，按新状态重建，不做跨渲染的状态搬运。 */
    const uid = b.id || ('rc-auto-' + (rcAutoUid++));
    const prevEntry = runnableRegistry.get(uid);
    if (prevEntry) { prevEntry.portal.remove(); activePortals.delete(uid); runnableRegistry.delete(uid); }
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
    const anchor = el('div', 'rc-editor-anchor'); anchor.dataset.rcAnchor = uid;
    edCol.appendChild(tabs); edCol.appendChild(anchor);
    const outCol = el('div', 'out-col');
    const plotBox = el('div', 'rc-plot');
    plotBox.appendChild(el('div', 'rc-hint', escapeHtml(b.hint || '▶ Run')));
    const consoleBox = el('div', 'rc-console');
    consoleBox.innerHTML = '<span class="k">' + escapeHtml(b.consoleHint || '') + '</span>';
    outCol.appendChild(plotBox); outCol.appendChild(consoleBox);
    root.appendChild(edCol); root.appendChild(outCol);

    /* 每块独立的传送门（FE-48：CodeMirror 不能住在 transform:scale 子树里），挂 body 下脱离缩放子树。 */
    const portal = el('div', 'rc-editor-portal');
    document.body.appendChild(portal);

    /* 状态 */
    let rcLang = b.languages[0];
    langBtns[rcLang].classList.add('on');
    const starter = { python: b.starter.python || '', js: b.starter.js || '' };
    const buf = { python: starter.python, js: starter.js };
    let cm = null, pyNsLoading = null;

    /* 本块的 Python 命名空间：懒建，首次运行时把 pyPreamble 灌进去，与其它 runnable 块隔离。 */
    async function ensurePyNs() {
      if (!pyNsLoading) pyNsLoading = (async () => {
        const py = await ensureSharedPyodide();
        const ns = py.globals.get('dict')();
        if (pyPreamble) py.runPython(pyPreamble, { globals: ns });
        return ns;
      })();
      return pyNsLoading;
    }
    function initCM() {
      if (cm || !window.CodeMirror) return;
      cm = CodeMirror(portal, { value: buf[rcLang], mode: rcLang === 'python' ? 'python' : 'javascript', theme: 'eclipse', lineNumbers: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity });
      entry.cm = cm; /* ResizeObserver 钩子用（遍历 activePortals 逐个刷新，见 renderDoc 附近） */
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
      if (b.env.output === 'console') {
        plotBox.appendChild(el('div', 'rc-hint', escapeHtml(b.env.resultLabel || '运行结果')));
        const pre = document.createElement('pre');
        pre.className = 'rc-console';
        if (pts == null || (Array.isArray(pts) && !pts.length)) pre.textContent = 'result 为空；可通过 print 输出过程，或把最终结构赋给 result。';
        else if (typeof pts === 'string') pre.textContent = pts;
        else { try { pre.textContent = JSON.stringify(pts, null, 2); } catch (_) { pre.textContent = String(pts); } }
        plotBox.appendChild(pre);
        return;
      }
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
      const py = await ensureSharedPyodide(); const ns = await ensurePyNs(); const logs = [];
      py.setStdout({ batched: s => logs.push(s) }); py.setStderr({ batched: s => logs.push(s) });
      ns.set('result', py.toPy([]));
      await py.runPythonAsync(code, { globals: ns });
      const r = ns.get('result');
      const result = (r && r.toJs) ? r.toJs({ dict_converter: Object.fromEntries }) : [];
      if (r && r.destroy) r.destroy();
      return { result, logs };
    }
    runBtn.onclick = async () => {
      const code = cm.getValue(); buf[rcLang] = code;
      runBtn.disabled = true; const label = runBtn.textContent;
      try {
        if (rcLang === 'python' && !sharedPyodide) consoleBox.innerHTML = '<span class="k">正在初始化 Python 运行时…</span>';
        runBtn.textContent = '运行中…';
        const out = rcLang === 'python' ? await runPy(code) : await runJS(code);
        consoleBox.textContent = out.logs.join('\n') || '(无 print 输出)';
        renderResult(out.result);
      } catch (e) { consoleBox.innerHTML = '<span class="err">✗ ' + rcEscape((e && e.message) || e) + '</span>'; }
      finally { runBtn.disabled = false; runBtn.textContent = label; }
    };

    /* getState/setState：把"用户写到一半的代码"从渲染期状态里救出来。
       重渲必然销毁 portal 里的 CodeMirror（本函数开头就 remove 了旧 portal），所以想在换主题/
       换版式这类必须整页重渲的操作里不丢代码，只能靠外部先 capture 再 restore。
       setState 允许在 initCM 之前调用——它写的是 buf，initCM 建 CodeMirror 时正好读 buf。
       不保存运行输出（图/console）：主题变了配色也该重算，让用户重新点 Run 是正确行为。 */
    const entry = {
      portal, initCM, anchor, cm: null,
      getState() {
        if (cm) buf[rcLang] = cm.getValue();
        return { lang: rcLang, buf: { ...buf } };
      },
      setState(s) {
        if (!s || typeof s !== 'object') return;
        if (s.buf && typeof s.buf === 'object') for (const k of ['python', 'js']) if (typeof s.buf[k] === 'string') buf[k] = s.buf[k];
        if (typeof s.lang === 'string' && langBtns[s.lang]) {
          rcLang = s.lang;
          Object.entries(langBtns).forEach(([k, btn]) => btn.classList.toggle('on', k === rcLang));
        }
        if (cm) { cm.setOption('mode', rcLang === 'python' ? 'python' : 'javascript'); cm.setValue(buf[rcLang]); cm.refresh(); }
      },
    };
    ctx.registerRunnable(uid, entry);
    return root;
  }

  /* ============ 场景版式模板（加一个函数 = 加一种版式；对照 blockRenderers）============
     签名 (scene, ctx, body, L)：把 blocks 排进 body。红线：绝不丢内容——任何未被版式引用到的
     block 一律回落进默认竖排/主栏；缺字段/失效引用/不足以成版式则整片回落 flow。版式是开放集，
     这里是起步的几种，规划器可按内容自选、拿不准回落 flow（见 plan.mjs skeletonSpec）。 */
  function blocksById(scene) { const m = {}; for (const b of scene.blocks) if (b && b.id != null) m[b.id] = b; return m; }
  /* index/split/compose 已经用空间层级组织叙事；内部条目再套 fragment 会让首帧只剩目录或空栏。
     自定义版式中取消嵌套 fragment，保留 index 自己的隐形步进哨兵。 */
  function renderLayoutBlock(block, ctx) {
    const node = renderBlock(block, ctx);
    node.classList.remove('fragment');
    node.querySelectorAll('.fragment').forEach(e => e.classList.remove('fragment'));
    return node;
  }

  /* compose 版式的栅格辅助：把 [start,end] 线号对转成 CSS grid-column/row 值（越界钳制，缺 end 则单格/自动流）。 */
  function gridLine(v, max) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : null; }
  function colSpanCss(pair, cols) {
    if (!Array.isArray(pair)) return null;
    const s = gridLine(pair[0], cols + 1); if (s == null) return null;
    const e = gridLine(pair[1], cols + 1);
    return e != null && e > s ? s + ' / ' + e : '' + s;
  }
  function rowSpanCss(pair) {
    if (!Array.isArray(pair)) return null;
    const s = gridLine(pair[0], 999); if (s == null) return null;
    const e = gridLine(pair[1], 999);
    return e != null && e > s ? s + ' / ' + e : null;   // 不给 end 就交给 grid 自动流
  }
  function strictGridSpan(pair) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const start = Number(pair[0]), end = Number(pair[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 13 || end <= start) return null;
    return start + ' / ' + end;
  }
  /** Resolve an artboard atomically: one bad/missing/duplicate reference rejects the whole layout. */
  function resolveArtboardLayout(scene, L) {
    if (!L || L.kind !== 'artboard' || !Array.isArray(L.areas) || !L.areas.length || !L.titleRegion) return null;
    const titleCol = strictGridSpan(L.titleRegion.col), titleRow = strictGridSpan(L.titleRegion.row);
    if (!titleCol || !titleRow) return null;
    const map = blocksById(scene), used = new Set(), areas = [];
    const aligns = new Set(['start', 'center', 'end', 'stretch']);
    const justifies = new Set(['start', 'center', 'end', 'stretch']);
    const roles = new Set(['main', 'aside', 'feature', 'caption', 'quote', 'stage', 'evidence', 'supporting', 'decoration']);
    for (const area of L.areas) {
      if (!area || !Array.isArray(area.blockIds) || !area.blockIds.length) return null;
      const col = strictGridSpan(area.col), row = strictGridSpan(area.row);
      if (!col || !row) return null;
      const blks = [];
      for (const id of area.blockIds) {
        const key = String(id);
        if (!map[key] || used.has(key)) return null;
        used.add(key); blks.push(map[key]);
      }
      const role = roles.has(area.styleRole) ? area.styleRole : 'main';
      const interactive = blks.some(block => block && ['sim', 'runnable'].includes(block.type));
      const requestedZ = Number.isInteger(+area.z) ? Math.min(8, Math.max(0, +area.z)) : 1;
      areas.push({
        blks, col, row,
        z: interactive ? 10 : (role === 'decoration' ? 0 : requestedZ),
        align: aligns.has(area.align) ? area.align : 'stretch',
        justify: justifies.has(area.justify) ? area.justify : 'stretch',
        bleed: area.bleed === true,
        clip: area.clip === true,
        role, interactive,
      });
    }
    const blockIds = (scene.blocks || []).map(b => b && b.id != null ? String(b.id) : null).filter(Boolean);
    if (blockIds.length !== used.size || blockIds.some(id => !used.has(id))) return null;
    return {
      title: { col: titleCol, row: titleRow, z: Number.isInteger(+L.titleRegion.z) ? Math.min(9, Math.max(5, +L.titleRegion.z)) : 5,
        align: aligns.has(L.titleRegion.align) ? L.titleRegion.align : 'start',
        justify: justifies.has(L.titleRegion.justify) ? L.titleRegion.justify : 'start',
        maxWidth: Number.isFinite(+L.titleRegion.maxWidth)
          ? Math.min(100, Math.max(20, +L.titleRegion.maxWidth)) : 100 },
      areas,
    };
  }
  /* compose preset = 罐装 areas 图（据 scene.blocks 确定性展开）。加一个 preset = 加一种编辑版式。 */
  const composePresets = {
    // sidenote 旁注（← marginalia · DESIGN_RESEARCH T23）：主栏(前面的块) + 右窄侧栏(末块作低对比语境)。需 ≥2 块。
    sidenote(scene) {
      const bs = scene.blocks || [];
      if (bs.length < 2) return [];
      return [
        { blockIds: bs.slice(0, -1).map(b => b.id), col: [1, 9], role: 'main' },
        { blockIds: [bs[bs.length - 1].id], col: [9, 13], role: 'aside' },
      ];
    },
  };

  const sceneLayouts = {
    flow(scene, ctx, body, L) {
      body.style.display = 'flex'; body.style.flexDirection = 'column';
      body.style.gap = (L.gap != null ? L.gap : 18) + 'px';
      if (L.centered) { body.style.justifyContent = 'center'; body.dataset.centered = '1'; }
      for (const blk of scene.blocks) body.appendChild(renderBlock(blk, ctx));
    },

    artboard(scene, ctx, body, L, resolved) {
      const layout = resolved || resolveArtboardLayout(scene, L);
      if (!layout) return false;
      body.dataset.layout = 'artboard';
      body.classList.add('layout-artboard');
      const gap = Number.isFinite(+L.gap) ? Math.min(60, Math.max(0, +L.gap)) : 12;
      body.style.gap = gap + 'px';
      body.style.setProperty('--artboard-gap', gap + 'px');
      for (const area of layout.areas) {
        const cell = el('div', 'artboard-area role-' + area.role + (area.bleed ? ' is-bleed' : '') + (area.clip ? ' is-clipped' : '') + (area.interactive ? ' has-interaction' : ''));
        cell.style.gridColumn = area.col; cell.style.gridRow = area.row; cell.style.zIndex = String(area.z);
        cell.style.alignItems = area.align; cell.style.justifyItems = area.justify;
        for (const block of area.blks) cell.appendChild(renderLayoutBlock(block, ctx));
        body.appendChild(cell);
      }
      return true;
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
        /* 跳到该子节。编辑态下不导航——否则点目录项想改它的文字就会翻走。 */
        item.onclick = () => {
          if (document.body.classList.contains('deck-editing')) return;
          const ix = Reveal.getIndices(); Reveal.slide(ix.h, ix.v, i - 1);
        };
        rail.appendChild(item);
        const panel = el('div', 'step-panel' + (i === 0 ? ' show' : ''));
        for (const b of p.blks) panel.appendChild(renderLayoutBlock(b, ctx));
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
      for (const b of anchor) aCol.appendChild(renderLayoutBlock(b, ctx));
      const mCol = el('div', 'split-col split-main');
      for (const b of rest) mCol.appendChild(renderLayoutBlock(b, ctx));
      body.appendChild(aCol); body.appendChild(mCol);
    },

    /* compose：freeform 与固定版式之间的中间层——12 列区域图，块声明列/行线号 + role(驱动 token 化样式)。
       preset 展开成 areas（同一机制）。红线：未引用 block 追加全宽不丢；无有效区域 → 回落 flow；视觉只走 token。 */
    compose(scene, ctx, body, L) {
      const map = blocksById(scene);
      const cols = Math.min(12, Math.max(2, parseInt(L.cols, 10) || 12));
      let areas = Array.isArray(L.areas) ? L.areas : [];
      if (!areas.length && L.preset && typeof composePresets[L.preset] === 'function') areas = composePresets[L.preset](scene);
      const used = new Set(); const resolved = [];
      for (const a of (Array.isArray(areas) ? areas : [])) {
        const blks = (a && Array.isArray(a.blockIds) ? a.blockIds : []).map(id => map[id]).filter(Boolean);
        if (!blks.length) continue;
        blks.forEach(b => used.add(b.id));
        resolved.push({ blks, col: a.col, row: a.row, role: (a.role || '').trim() });
      }
      if (!resolved.length) return sceneLayouts.flow(scene, ctx, body, L);   // 无有效区域 → 回落 flow
      body.dataset.layout = 'compose';
      body.classList.add('layout-compose');
      body.style.display = 'grid';
      body.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
      body.style.gap = (L.gap != null ? L.gap : 24) + 'px';
      body.style.alignContent = 'center';
      const ROLES = { main: 1, aside: 1, feature: 1, caption: 1, quote: 1 };
      for (const a of resolved) {
        const cell = el('div', 'compose-area' + (ROLES[a.role] ? ' role-' + a.role : ''));
        const c = colSpanCss(a.col, cols), rw = rowSpanCss(a.row);
        if (c) cell.style.gridColumn = c;
        if (rw) cell.style.gridRow = rw;
        for (const b of a.blks) cell.appendChild(renderLayoutBlock(b, ctx));
        body.appendChild(cell);
      }
      const leftover = scene.blocks.filter(b => !used.has(b.id));            // 未引用不丢：整行全宽追加
      if (leftover.length) {
        const cell = el('div', 'compose-area'); cell.style.gridColumn = '1 / -1';
        for (const b of leftover) cell.appendChild(renderLayoutBlock(b, ctx));
        body.appendChild(cell);
      }
    },

    /* full：单 block 居中占满，给需要大画面的 chart/sim/table 呼吸空间（非多块，多块回落 flow）。 */
    full(scene, ctx, body, L) {
      const blocks = scene.blocks || [];
      if (blocks.length !== 1) return sceneLayouts.flow(scene, ctx, body, L);
      body.dataset.layout = 'full';
      body.classList.add('layout-full');
      body.style.display = 'flex'; body.style.flexDirection = 'column';
      body.style.justifyContent = 'center'; body.style.alignItems = 'center';
      body.appendChild(renderBlock(blocks[0], ctx));
    },
  };

  /* ================= Scene → <section> ================= */
  /** 章节序号：按 scene 在 doc 里的位置**推导**，不是渲染时自增。
   *  自增版（ctx.sectionNo++）有两个坑：① renderDoc 不重置它，live dashboard 一个会话渲三次
   *  （骨架/更新/终稿）会让序号累加成 07-12、13-18；② rerenderScene 单页重渲时会再 +1 造成漂移。
   *  推导天然对两者幂等。找不到（脱离 doc 单独渲染）时回落 1，不抛。 */
  function sectionOrdinal(scene) {
    const scenes = (currentDoc && currentDoc.scenes) || [];
    const idx = scenes.indexOf(scene);
    const i = idx >= 0 ? idx
      : (scene && scene.id ? scenes.findIndex(s => s && s.id === scene.id) : -1);
    if (i < 0) return 1;
    let n = 0;
    for (let k = 0; k <= i; k++) if (scenes[k] && scenes[k].kind === 'section') n++;
    return n || 1;
  }

  /* 编辑锚点：标记"这个节点显示的是 scene 的哪个字段"。
     只标来源唯一的字段——节点里是 inlineMd 渲染后的 HTML，编辑时要换成源文本再编辑，
     所以必须能反查回 doc 上那一个字段（scene 由外层 section[data-scene-id] 定位）。 */
  function editField(node, field) { node.dataset.editField = field; return node; }

  function renderMotifLayer(scene) {
    const motifs = currentDoc && currentDoc.visualSystem && Array.isArray(currentDoc.visualSystem.motifs)
      ? currentDoc.visualSystem.motifs : [];
    if (!motifs.length) return null;
    const motifClasses = {
      orb: 'ring', wave: 'wave', rule: 'line', grid: 'grid', corner: 'corner', blob: 'blob',
    };
    const colorRoles = { accent: '--accent', accent2: '--accent2', line: '--line', surfaceAlt: '--bg2' };
    const scenes = (currentDoc && currentDoc.scenes) || [];
    const sceneIndex = Math.max(0, scenes.indexOf(scene));
    const emphatic = ['hero', 'section', 'statement'].includes(scene && scene.kind)
      || ['full-bleed-hero', 'poster', 'collage'].includes(scene && scene.compositionFamily);
    // Motifs establish rhythm; stamping the same decoration on every page turns it into UI noise.
    if (!emphatic && sceneIndex % 4 !== 0) return null;
    const layer = el('div', 'motif-layer');
    layer.setAttribute('aria-hidden', 'true');
    const selected = [motifs[sceneIndex % motifs.length]];
    selected.forEach((raw, index) => {
      const spec = typeof raw === 'string' ? { type: raw } : (raw && typeof raw === 'object' ? raw : {});
      const motifClass = motifClasses[spec.type];
      if (!motifClass) return;
      const slot = (sceneIndex + index) % 4 + 1;
      const mark = el('span', 'motif motif-' + motifClass + ' motif-slot-' + slot);
      const colorToken = colorRoles[spec.colorRole];
      if (colorToken) mark.style.color = 'var(' + colorToken + ')';
      if (Number.isFinite(+spec.opacity)) mark.style.opacity = String(Math.min(0.45, Math.max(0.04, +spec.opacity)));
      if (Number.isFinite(+spec.scale)) mark.style.setProperty('--motif-scale', String(Math.min(2, Math.max(0.5, +spec.scale))));
      layer.appendChild(mark);
    });
    return layer.childElementCount ? layer : null;
  }

  function renderScene(scene, ctx) {
    const sec = document.createElement('section');
    if (scene.kind === 'hero') sec.className = 'cover';
    if (scene.kind === 'statement') sec.className = 'bigidea';
    if (scene.kind === 'quiz') sec.className = 'quiz';
    if (scene.kind === 'section') sec.className = 'divider';
    if (scene.transition) sec.setAttribute('data-transition', scene.transition);
    if (scene.autoAnimate) sec.setAttribute('data-auto-animate', '');   // 需相邻两页都置位+复用相同 block id 才会真正 morph
    if (scene.compositionFamily) {
      sec.dataset.composition = scene.compositionFamily;
      sec.classList.add('composition-' + scene.compositionFamily);
    }
    if (scene.background) {
      const asset = assetById(scene.background.assetId);
      if (asset) {
        sec.classList.add('has-scene-background');
        const layer = el('div', 'scene-background');
        const img = document.createElement('img');
        img.src = asset.src; img.alt = ''; img.setAttribute('aria-hidden', 'true');
        img.style.objectFit = scene.background.fit === 'contain' ? 'contain' : 'cover';
        applyAssetFocalPoint(img, asset);
        layer.appendChild(img);
        const overlay = el('div', 'scene-background-overlay overlay-' + (scene.background.overlay || 'scrim'));
        overlay.style.setProperty('--overlay-strength', String(scene.background.overlayStrength == null ? 0.45 : scene.background.overlayStrength));
        layer.appendChild(overlay);
        sec.appendChild(layer);
      }
    }
    const motifLayer = renderMotifLayer(scene);
    if (motifLayer) sec.appendChild(motifLayer);
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
      /* 章节分隔页：章节序号 + 章节名 + 一句主旨(statement block)——给讲义打节拍、破"每页一个样"的单调。
         内容据 scene.headline + 其 statement block；缺字段兜底不抛（红线）。 */
      pad.appendChild(el('div', 'section-num', String(sectionOrdinal(scene)).padStart(2, '0')));
      if (scene.eyebrow) pad.appendChild(editField(el('div', 'eyebrow', inlineMd(scene.eyebrow)), 'eyebrow'));
      if (scene.headline) pad.appendChild(editField(el('h2', 'section-title', inlineMd(scene.headline)), 'headline'));
      const dek = (scene.blocks || []).find(b => b && b.type === 'statement');
      const dekText = dek ? dek.statement : scene.lead;
      /* 分隔页的 dek 可能来自 statement block，不是 scene.lead——来源不唯一就不标编辑锚点，
         免得改了却写回不到正确字段。要改这类文字请回到那个 statement block。 */
      if (dekText) pad.appendChild(dek ? el('div', 'section-dek', inlineMd(dekText)) : editField(el('div', 'section-dek', inlineMd(dekText)), 'lead'));
    } else {
      const L = scene.layout || {};
      const artboard = resolveArtboardLayout(scene, L);
      const appendTitleContent = parent => {
        if (scene.eyebrow) parent.appendChild(editField(el('div', 'eyebrow', inlineMd(scene.eyebrow)), 'eyebrow'));
        if (scene.headline) {
          const h = el('h2', 'headline', inlineMd(scene.headline));
          if (scene.headlineSize) h.style.fontSize = scene.headlineSize + 'px';
          parent.appendChild(editField(h, 'headline'));
        }
        if (scene.lead) parent.appendChild(editField(el('div', 'lead', inlineMd(scene.lead)), 'lead'));
      };
      if (artboard) {
        pad.classList.add('pad-artboard');
        const body = el('div', 'body');
        const title = el('header', 'artboard-title');
        title.style.gridColumn = artboard.title.col; title.style.gridRow = artboard.title.row;
        title.style.zIndex = String(artboard.title.z); title.style.alignSelf = artboard.title.align; title.style.justifySelf = artboard.title.justify;
        title.style.maxWidth = artboard.title.maxWidth + '%';
        appendTitleContent(title);
        if (!scene.eyebrow && !scene.headline && !scene.lead) {
          /* The compiler reserves rows 1–3 for a native title. Some evidence-first pages
             intentionally put their heading inside a structured block. Collapse those empty
             rows so the actual evidence uses the full artboard instead of floating at the
             bottom of a large blank field. */
          body.classList.add('artboard-without-title');
          title.setAttribute('aria-hidden', 'true');
        }
        body.appendChild(title);
        sceneLayouts.artboard(scene, ctx, body, L, artboard);
        pad.appendChild(body);
      } else {
        appendTitleContent(pad);
        const body = el('div', 'body');
        const single = scene.blocks.length === 1 && ['sim', 'runnable'].includes(scene.blocks[0].type);
        if (single) {
        const rendered = renderBlock(scene.blocks[0], ctx);
        /* sim/runnable 渲染器返回的根节点自带 lab/runlab 网格类 → 直接作为 body */
        rendered.classList.add('body');
        pad.appendChild(rendered);
        } else {
          /* Invalid artboards fall back to the established flow layout as one atomic unit. */
          const kind = L.kind === 'artboard' ? 'flow' : (typeof sceneLayouts[L.kind] === 'function' ? L.kind : 'flow');
          sceneLayouts[kind](scene, ctx, body, L);
          pad.appendChild(body);
        }
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
    if (body.dataset.layout) {
      /* index/split/compose/full 等自定义版式不走下面"逐子元素求和"的测高(那套假设纵向单栏堆叠，
         compose 是二维 grid，子项可能同行并排，求和会重复计入)。但仍需要溢出保护——尤其 compose：
         chart/table 类块高度不随列宽收缩，size 换行到第二行时总高度可能超出可视区却没有任何裁切/警告，
         内容会安静地被推到视口以下（reveal 不滚动，等于学生看不到）。用 scrollHeight/clientHeight
         整体判断，兼容任意内部结构，zoom 等比缩到刚好放下，跟下面 flow 分支同一条"不丢内容"红线。 */
      body.style.zoom = '';
      const availCustom = body.clientHeight;
      const totalCustom = body.scrollHeight;
      if (availCustom && totalCustom > availCustom + 4) {
        body.style.zoom = Math.max(0.72, availCustom / totalCustom);
      }
      return;
    }
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
      /* 内容超高会被裁掉，学生看不到底部（红线）。注意裁切来自舞台根部的 html,body{overflow:hidden}
         （.pad 自身并没有 overflow 规则，别照着旧注释去 .pad 上找）。用 zoom 等比缩到刚好放下——
         zoom 影响布局(Chromium/Edge/新版 FF)，scrollHeight 随之收缩、真正不裁切（transform 只视觉缩放，救不了 scrollHeight）。
         下限 0.72：红线"不丢内容"高于"可读性下限"偏好——内容略超(如 compare+长 timeline 同页)时宁可缩到 0.72 也不裁掉尾部；
         触底(0.72)仍溢出才说明内容确实过多，交给 render-check 断言 F 告警、生成侧收敛。
         lab/runlab/widlab(sim/代码/CodeMirror 子树)已在上面提前 return，不受 zoom 影响（避 FE-48）。 */
      body.style.zoom = Math.max(0.72, avail / contentH);
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
      // Keep a small safety margin: KaTeX's nested spans round subpixels
      // differently from the outer scroll box, which otherwise leaves a
      // repeatable 8–12px clipped tail after an apparently exact fit.
      if (avail && natural > avail + 1) k.style.zoom = Math.max(0.52, (avail / natural) * 0.96);
    }
  }
  /* 代码卡宽度自适应：codecard 是 overflow:hidden，pre 不换行——窄栏(split/compose)里长代码行会被静默裁掉(丢内容红线)，
     assertion 也测不到(卡内部裁切、外层不溢出)。这里等比缩到放下，保代码行完整可见(不换行伤可读)。下限 0.6 防过小。 */
  function fitCode(section) {
    if (!section) return;
    for (const code of section.querySelectorAll('.codecard code')) {
      code.style.zoom = '';
      const avail = code.clientWidth, natural = code.scrollWidth;
      if (avail && natural > avail + 1) code.style.zoom = Math.max(0.78, avail / natural);
    }
  }
  /* 自定义版式(index/split)的高度自适应：balanceScene 只管默认竖排，这里管 index 的 active panel 与 split 的分栏列。
     宽度由 fitFormulas(section) 统一处理；这里只处理“太高被裁”——同 balanceScene 用 zoom 缩到放下（红线：不裁切）。 */
  function fitScroll(box, availH, availW) {
    if (!box) return;
    box.style.zoom = '';
    if (!availH) return;
    if (availW == null) availW = box.clientWidth;
    /* 两趟收敛（iter81）：zoom 后内容会回流（如代码换行）再长高，单趟必留残余裁切；
       且 scrollWidth/Height 在 zoom 元素上是内坐标，须换算比较。同时管住宽度轴（宽图表/代码进窄面板）。 */
    for (let pass = 0; pass < 3; pass++) {
      const z = parseFloat(box.style.zoom) || 1;
      const needH = box.scrollHeight * z, needW = box.scrollWidth * z;   // 内坐标 → 外坐标
      if (needH <= availH + 4 && (!availW || needW <= availW + 4)) return;
      const target = Math.min(availH / (box.scrollHeight || 1), availW ? availW / (box.scrollWidth || 1) : 1);
      box.style.zoom = Math.max(0.6, Math.min(1, target));
    }
  }
  function fitCustomLayout(section) {
    if (!section) return;
    const idx = section.querySelector('.layout-index');
    if (idx) {
      const stage = idx.querySelector('.step-stage');
      /* 每个 index panel 都是可到达的页面状态。只 fit 当前 .show 会让隐藏的宽图/长表
         逃过布局，render-check 随后正确地把它判成裁切；用户切到该步时也会先看到一次坏帧。
         visibility:hidden 仍参与尺寸计算，因此可在首帧一次性把全部 panel 适配好。 */
      if (stage) stage.querySelectorAll('.step-panel').forEach(panel => {
        fitScroll(panel, stage.clientHeight, stage.clientWidth);
      });
    }
    const sp = section.querySelector('.layout-split');
    if (sp) { const h = sp.clientHeight; sp.querySelectorAll('.split-col').forEach(c => fitScroll(c, h)); }
    const cp = section.querySelector('.layout-compose');
    if (cp) { const h = cp.clientHeight; cp.querySelectorAll('.compose-area').forEach(c => fitScroll(c, h)); }   // 每区域太高就缩，红线不裁切
    const art = section.querySelector('.layout-artboard');
    if (art) {
      art.querySelectorAll('.artboard-area:not(.role-stage):not(.has-interaction)').forEach(c => fitScroll(c, c.clientHeight, c.clientWidth));
      const title = art.querySelector('.artboard-title'); if (title) fitScroll(title, title.clientHeight, title.clientWidth);
    }
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
  function layoutScene(section) { fitFormulas(section); fitCode(section); balanceScene(section); fitCustomLayout(section); fitStatement(section); }
  function renderVisibleCharts(section) {
    if (!section) return;
    section.querySelectorAll('.chart-block .plotwrap').forEach(p => {
      if (typeof p.__lectureChartRender === 'function') p.__lectureChartRender();
    });
  }

  /* ================= 装配 & 启动 ================= */
  /* 骨架块识别：agent 规划阶段产出的占位 block 仅有 {id,type,intent}，没有真实内容字段。
     previewMode 下把这些渲染成占位卡（让 live dashboard 能在生成期间看到结构），正式渲染跳过此判断。 */
  const CONTENT_KEYS = ['title','sub','items','statement','prompt','label','text','source','formula','rows','head','left','right','sides','engine','html','filename','fallbackPoster','answers','choices','steps','cells','events','data','question','nodes','edges','cite','hint','tag','facts','objective','assetId'];
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

  /** 就地补齐缺失的 block.id（幂等、确定性）。
   *  schema 说 id 由"规划器分配、全局唯一"，但它是可选字段，实际语料里常常整份都没有。
   *  没有 id 的后果不只是编辑器无处下锚（data-block-id / rerenderBlock）——autoAnimate 的
   *  morph、layout.steps/anchor、compose.areas 全都靠 id 引用块，缺了就只能整页整块地动。
   *  这里按"场景 id + 块下标"派生，同一份 doc 反复渲染得到同一组 id，多次保存不会churn。 */
  function ensureBlockIds(doc) {
    if (!doc || !Array.isArray(doc.scenes)) return;
    const seen = new Set();
    for (const scene of doc.scenes) for (const b of (scene && scene.blocks) || []) if (b && b.id != null) seen.add(String(b.id));
    for (const [si, scene] of doc.scenes.entries()) {
      if (!scene || !Array.isArray(scene.blocks)) continue;
      walkSceneBlocks(scene, (b, at) => {
        if (b.id == null) {
          let id = at.prefix + '-b' + at.index, n = 2;
          while (seen.has(id)) id = at.prefix + '-b' + at.index + '-' + n++;
          seen.add(id); b.id = id;
        }
      }, scene.id || ('s' + si));
    }
  }

  /** 遍历一个 scene 的全部 block：顶层 + compare/grid 容器内的嵌套块，深度优先、顺序确定。
   *  visit(block, {prefix, index, top}) 返回非 undefined 即提前结束并把该值透出（findBlock 用）。
   *  visit 可以就地改 block.id——子块的 prefix 用改完之后的 id 算，ensureBlockIds 依赖这一点。
   *
   *  为什么 ensureBlockIds 与 findBlock 必须共用这一个遍历器：容器里的块拿的是派生 id
   *  （b17-left / b17-i0），这些 id **不在** scene.blocks 里。两处各写一份递归、一旦漂移，
   *  rerenderBlock 就会在嵌套块上静默 no-op——不报错、只是什么都没发生，极难查。 */
  function walkSceneBlocks(scene, visit, basePrefix) {
    const walk = (blocks, prefix, top) => {
      for (const [i, b] of (blocks || []).entries()) {
        if (!b || typeof b !== 'object') continue;
        const hit = visit(b, { prefix, index: i, top });
        if (hit !== undefined) return hit;
        if (b.type === 'compare') {
          for (const side of ['left', 'right']) {
            if (!b[side] || !b[side].block) continue;
            const r = walk([b[side].block], String(b.id) + '-' + side, false);
            if (r !== undefined) return r;
          }
        }
        if (b.type === 'grid') {
          const r = walk((b.items || []).map(it => it && it.block).filter(Boolean), String(b.id) + '-i', false);
          if (r !== undefined) return r;
        }
      }
      return undefined;
    };
    return walk(scene && scene.blocks, basePrefix != null ? basePrefix : ((scene && scene.id) || 's'), true);
  }

  /** 在一个 scene 里按 blockId 找块（含嵌套容器内的）。找不到返回 null，不抛。 */
  function findBlockInScene(scene, blockId) {
    if (!scene || blockId == null) return null;
    const want = String(blockId);
    const hit = walkSceneBlocks(scene, b => (String(b.id) === want ? b : undefined));
    return hit === undefined ? null : hit;
  }

  /** 公共面：按 (sceneId, blockId) 从当前 doc 里取块。编辑器解析 DOM 锚点时用。 */
  function findBlock(sceneId, blockId) {
    const scene = ((currentDoc && currentDoc.scenes) || []).find(s => s && String(s.id) === String(sceneId));
    return findBlockInScene(scene, blockId);
  }

  /** 全量（重）渲染一整份 doc。首次调用会 Reveal.initialize + 绑 chrome；后续调用仅替换 slides + Reveal.sync()。
   *  opts.previewMode=true 时骨架占位块渲染成占位卡（不激活 sim/Pyodide），供 live dashboard 生成期间用。 */
  function renderDoc(doc, opts = {}) {
    ensureBlockIds(doc);
    currentDoc = doc;
    ctx.previewMode = !!opts.previewMode;
    document.title = doc.title || '讲义';

    /* 整份 doc 重渲(live 预览换一份新 doc)：清掉上一份遗留的 runnable 传送门，
       它们挂在 body 下不随 #slides 的重建而消失，不清会越攒越多。 */
    if (rcPortalRAF) { cancelAnimationFrame(rcPortalRAF); rcPortalRAF = null; }
    for (const entry of runnableRegistry.values()) entry.portal.remove();
    runnableRegistry.clear();
    activePortals.clear();
    /* widget 的两张表同理：整份重渲后旧 iframe 全部作废，不清就会在换主题时对幽灵重建 srcdoc。 */
    widgetBuilds.clear();
    widgetRoots.clear();

    /* 主题：?theme=xxx 仅用于预览/对比（不改内容）；默认用 doc.theme 或 cartesian。
       重渲时尊重 URL override 可让 live 预览也支持 ?theme= 切换对比。 */
    const themeOverride = new URLSearchParams(location.search).get('theme');
    document.documentElement.dataset.theme = themeOverride || doc.theme || 'cartesian';
    applyVisualSystem(doc.visualSystem);
    refreshThemeColors();

    /* AI 助教数据按当前 doc 重新初始化（重渲后词表跟着更新） */
    KB = ((doc.tutor || {}).kb || []).map(k => [new RegExp(k.pattern, k.flags || ''), inlineMd(k.answer)]);
    SUGG = (doc.tutor || {}).suggestions || [];

    const slidesEl = $('#slides');
    if (!slidesEl) return;
    /* 每次全量渲染产生一组新的 chart/sim/widget 初始化回调。旧节点会被销毁，
       因而必须先丢弃尚未执行的旧回调，避免 live 重渲后操作脱离 DOM 的节点。 */
    readyCallbacks.length = 0;
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
        viewDistance: 5, hashOneBasedIndex: true, autoAnimate: true, plugins: [RevealHighlight] });
      Reveal.on('ready', e => { runReadyCallbacks(); activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => { renderVisibleCharts(e.currentSlide); layoutScene(e.currentSlide); syncIndex(e.currentSlide); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutScene(Reveal.getCurrentSlide()); syncIndex(); }); });
      Reveal.on('slidechanged', e => { activateRunCell(e.currentSlide); updateCtx(); refreshNotes(); requestAnimationFrame(() => { renderVisibleCharts(e.currentSlide); layoutScene(e.currentSlide); syncIndex(e.currentSlide); }); });
      Reveal.on('fragmentshown', () => requestAnimationFrame(() => syncIndex()));
      Reveal.on('fragmenthidden', () => requestAnimationFrame(() => syncIndex()));
      new ResizeObserver(() => { requestAnimationFrame(() => { for (const uid of activePortals) { const e = runnableRegistry.get(uid); if (e && e.cm) e.cm.refresh(); } }); }).observe($('.reveal'));
      revealInited = true;
    } else {
      Reveal.sync();
      Reveal.slide(0);
      /* Reveal 的 ready 事件只触发一次；后续 renderDoc 产生的新动态块必须在这里显式初始化。 */
      requestAnimationFrame(() => { runReadyCallbacks(); const cur = Reveal.getCurrentSlide(); if (cur) { layoutScene(cur); syncIndex(cur); } activateRunCell(cur); });
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
    /* 替换当前页时 Reveal.sync() 不会把"当前页"指针挪到新节点上——新 section 拿不到 .present，
       于是 activateRunCell 认不出它、runnable 的传送门一直不显示（要等用户翻一次页才恢复）。
       所以重渲前先记下 indices，替换后显式 slide() 回去。 */
    const wasCurrent = old.classList.contains('present');
    const idx = wasCurrent && window.Reveal && Reveal.getIndices ? Reveal.getIndices() : null;
    old.replaceWith(fresh);
    if (window.Reveal && Reveal.sync) Reveal.sync();
    if (idx && Reveal.slide) Reveal.slide(idx.h, idx.v);
    /* activateRunCell 必须同步调用（不能塞进 rAF）：它只是刷新 portal 的 anchor 引用并建 CodeMirror，
       不需要测量；而页面不合成帧时（后台标签页/不可见的预览面板）rAF 整体停摆，塞进去就等于永不执行——
       表现是重渲后代码框空着，要等用户翻一次页才回来（slidechanged 里它就是同步调的）。见 lessons FE-106。
       真正需要"先有一帧再量"的只有 layoutScene/syncIndex，它们留在 rAF 里。 */
    if (revealInited && Reveal.isReady()) runReadyCallbacks();
    activateRunCell(fresh);
    requestAnimationFrame(() => { layoutScene(fresh); syncIndex(fresh); });
  }

  /* ================= 编辑支撑：三级重渲 + 运行时状态搬运 =================
     编辑一份已渲染的讲义时，"改完刷新一下"是会静默毁能力的：整页重渲会 remove runnable 的
     portal（CodeMirror 连同用户写的代码一起没）、重建 widget 的 srcdoc（回到默认参数），
     而 fit* 系列写在节点上的内联字号也会被重算成另一套。所以编辑要分三级用力：
       ① 改文字   → 完全不重渲，只写回 doc + relayoutScene（最常用，零风险）
       ② 改一个块 → rerenderBlock，只换那一个 [data-block-id] 节点，兄弟节点纹丝不动
       ③ 换主题/版式 → 不得不整页重渲：captureRuntimeState → 重渲 → restoreRuntimeState
     ③ 做完之后连"换主题不丢用户代码"都成立，比原来的 live 预览更强。 */

  /** 只换一个 block 的 DOM 节点。返回是否命中（未命中时调用方可回落 rerenderScene）。 */
  function rerenderBlock(sceneId, blockId, block) {
    const slidesEl = $('#slides');
    if (!slidesEl) return false;
    const sec = slidesEl.querySelector('section[data-scene-id="' + CSS.escape(String(sceneId)) + '"]');
    if (!sec) return false;
    const old = sec.querySelector('[data-block-id="' + CSS.escape(String(blockId)) + '"]');
    if (!old) return false;
    /* 自定义版式（index/split/compose）里的块由 renderLayoutBlock 渲染——它会剥掉块级 fragment，
       因为那些版式已经用空间层级组织了叙事。重渲单块必须沿用同一条路径，否则这一个块会突然带上
       fragment 而首帧消失。full/flow 走普通 renderBlock。 */
    const body = old.closest('[data-layout]');
    const layoutKind = body ? body.dataset.layout : '';
    const fresh = ['index', 'split', 'compose', 'artboard'].includes(layoutKind)
      ? renderLayoutBlock(block, ctx)
      : renderBlock(block, ctx);
    old.replaceWith(fresh);
    /* 同 rerenderScene：初始化与 anchor 刷新同步做，只有需要测量的排版留给 rAF（FE-106）。 */
    if (revealInited && Reveal.isReady()) runReadyCallbacks();   /* 新块的 chart/widget 初始化回调 */
    activateRunCell(sec);                                        /* 刷新本页 portal 的 anchor 引用 */
    requestAnimationFrame(() => { layoutScene(sec); syncIndex(sec); });
    return true;
  }

  /** 改完文字后重跑本页的自适应排版（不重渲，DOM 已是目标状态）。 */
  function relayoutScene(section) {
    const sec = section || (revealInited && Reveal.getCurrentSlide());
    if (!sec) return;
    requestAnimationFrame(() => { layoutScene(sec); syncIndex(sec); renderVisibleCharts(sec); });
  }

  /** 采集容器内"渲染期才存在"的状态。
   *  @returns {{states: Object, lost: string[]}} lost = 已知无法保全的块 id（sim.widget 的控件长在
   *  sandbox="allow-scripts" 的 null-origin iframe 里，外部无从读取——调用方应据此提示用户）。 */
  function captureRuntimeState(root) {
    const states = {}, lost = [];
    if (!root) return { states, lost };
    const slot = id => (states[id] || (states[id] = {}));
    for (const node of root.querySelectorAll('[data-block-id]')) {
      const id = node.dataset.blockId;
      const sliders = Array.from(node.querySelectorAll('input[data-sim-param]'));
      if (sliders.length) {
        const params = {};
        for (const s of sliders) params[s.dataset.simParam] = s.value;
        slot(id).simParams = params;
      }
      if (node.querySelector('iframe.widframe')) lost.push(id);
    }
    for (const [uid, entry] of runnableRegistry) {
      if (!root.querySelector('[data-rc-anchor="' + CSS.escape(uid) + '"]')) continue;
      if (typeof entry.getState === 'function') slot(uid).runnable = entry.getState();
    }
    return { states, lost };
  }

  /** 把 captureRuntimeState 的快照回填进重渲后的新 DOM。必须在重渲完成后调用。 */
  function restoreRuntimeState(root, snapshot) {
    if (!root || !snapshot || !snapshot.states) return;
    for (const [id, st] of Object.entries(snapshot.states)) {
      if (st.simParams) {
        const node = root.querySelector('[data-block-id="' + CSS.escape(id) + '"]');
        /* 走 dispatchEvent('input') 而不是直接改内部 values：复用既有监听器，
           顺带把数值标签和图表重绘都带上，不必知道各引擎内部长什么样。 */
        if (node) for (const [name, v] of Object.entries(st.simParams)) {
          const input = node.querySelector('input[data-sim-param="' + CSS.escape(name) + '"]');
          if (input) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
        }
      }
      if (st.runnable) {
        const entry = runnableRegistry.get(id);
        if (entry && typeof entry.setState === 'function') entry.setState(st.runnable);
      }
    }
  }

  /* ---- quiz 判分（事件委托） ----
     编辑态守卫：判分会置 dataset.done='1'，本次渲染内**不可逆**。没有这道守卫，
     进编辑态后点一下选项想改它的文案，就把这道题永久判了（还会把正确答案亮出来）。 */
  document.addEventListener('click', e => {
    if (document.body.classList.contains('deck-editing')) return;
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

  /* ---- 传送门（FE-48 多实例版）：每个 runnable 一个 portal，挂 body 下；一个共享 RAF
     遍历"当前 slide 上显示"的 activePortals 集合，逐个同步屏幕矩形。 ---- */
  function syncAllPortals() {
    for (const uid of activePortals) {
      const entry = runnableRegistry.get(uid);
      if (!entry || !entry.anchor) continue;
      const r = entry.anchor.getBoundingClientRect();
      entry.portal.style.left = r.left + 'px'; entry.portal.style.top = r.top + 'px';
      entry.portal.style.width = r.width + 'px'; entry.portal.style.height = r.height + 'px';
    }
  }
  function activateRunCell(slide) {
    const anchors = slide ? Array.from(slide.querySelectorAll('[data-rc-anchor]')) : [];
    const liveUids = new Set(anchors.map(a => a.dataset.rcAnchor));

    for (const uid of activePortals) {
      if (liveUids.has(uid)) continue;
      const entry = runnableRegistry.get(uid);
      if (entry) entry.portal.style.display = 'none';
      activePortals.delete(uid);
    }

    for (const anchor of anchors) {
      const uid = anchor.dataset.rcAnchor;
      const entry = runnableRegistry.get(uid);
      if (!entry) continue;
      entry.anchor = anchor;   /* 场景重渲后 anchor 节点会变，刷新引用 */
      entry.initCM();
      entry.portal.style.display = 'block';
      if (entry.cm) entry.cm.refresh();
      activePortals.add(uid);
    }

    if (activePortals.size && !rcPortalRAF) {
      const loop = () => { syncAllPortals(); rcPortalRAF = requestAnimationFrame(loop); }; loop();
    } else if (!activePortals.size && rcPortalRAF) {
      cancelAnimationFrame(rcPortalRAF); rcPortalRAF = null;
    }
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
    /* isContentEditable 守卫：不加的话在可编辑标题里打一个 "a" 就会弹出 AI 助教面板。
       （reveal 自身的翻页快捷键已有同样的守卫，这条是我们自己加的快捷键，得自己补。） */
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'a' || e.key === 'A') $('#btnTutor').click();
    });
  }

  /* ---- 自动启动（index.html 兼容路径：?doc= 或默认 course.lecture.json） ----
     默认渲染手写基线 course.lecture.json；?doc=generated/xxx.lecture.json 可预览别的（如 agent 生成的），
     不必覆盖基线。路径相对 demo/（服务器根），只能取 demo/ 下的文件。
     ?live=1 时跳过：live.html Dashboard 由控制器自己驱动 renderDoc（订阅 SSE 后增量渲染），
     不做初始 fetch——避免短暂闪现基线 deck 与正在生成的 doc 冲突。 */
  if (!window.__LECTURE_DECK_MANUAL_BOOT__ && !new URLSearchParams(location.search).has('live')) {
    const docUrl = new URLSearchParams(location.search).get('doc') || 'course.lecture.json';
    /* 诚实失败（iter75）：此前 fetch/JSON 解析失败 → 未捕获 rejection → 整页静默白屏（手写 doc 转义错、路径错都会踩）。
       现在渲一块显式错误面板：哪个文件、什么错、怎么定位——不静默、不假装正常（不 mock 红线的运行时面）。 */
    try {
      const res = await fetch(docUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}（路径相对 demo/ 根，如 generated/xxx.lecture.json）`);
      renderDoc(await res.json());
    } catch (e) {
      console.error('讲义加载失败:', docUrl, e);
      const box = el('div', 'doc-error');
      box.innerHTML = '<div class="doc-error-title">讲义加载失败</div>'
        + '<div class="doc-error-file">' + escapeHtml(docUrl) + '</div>'
        + '<div class="doc-error-msg">' + escapeHtml(String(e && e.message || e)) + '</div>'
        + '<div class="doc-error-hint">若是 JSON 语法错：node demo/schema/validate.mjs &lt;文件&gt; 可定位；常见于手写 doc 的反斜杠转义。</div>';
      document.body.appendChild(box);
    }
  }

  /* ---- live.html 公共 API：renderDoc/rerenderScene 让 Dashboard 增量更新预览 ---- */
  window.LectureDeck = {
    renderDoc, rerenderScene, refreshTheme: refreshThemeColors,
    /* 编辑支撑（deck-edit.js 消费）：三级重渲 + 运行时状态搬运 + 取当前 doc */
    rerenderBlock, relayoutScene, captureRuntimeState, restoreRuntimeState,
    /* 字段级重绘原语：改完一个字段只需重跑对应的渲染函数，不必重渲整块。
       inlineMd → 受限行内 markdown；displayTex → KaTeX 块级公式；
       sanitizeFreeformHtml → freeform 白名单净化（注意它有损，只能 doc→DOM 单向用）。 */
    renderInline: inlineMd,
    renderDisplayTex: displayTex,
    sanitizeFreeform: sanitizeFreeformHtml,
    findBlock,                /* (sceneId, blockId) → block，含 compare/grid 嵌套块 */
    /* artboard 版面的判据。给 deck-frame.js 在写回 doc 后**复验**用：
       resolveArtboardLayout 是全有全无的（任一 area 越界/重复/漏块 → 返回 null → 整页静默回落 flow），
       所以编辑器必须能问渲染器"这样改还成立吗"，而不是自己重写一份判据——重写必然漂移，
       漂移的后果正是"编辑器认为合法、渲染器却把整页降级"这种最难查的错。 */
    resolveArtboard: resolveArtboardLayout,
    getDoc: () => currentDoc,
  };
})();
