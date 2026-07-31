#!/usr/bin/env node
/* ============================================================================
   LectureDoc v1 校验器（零依赖）
   用法:  node demo/schema/validate.mjs [json文件路径]
          缺省校验 demo/course.lecture.json
   设计给 agent 自修循环用：错误信息带 JSON 路径，读错误→改 JSON→重跑。
   与 lecture-doc.schema.json 语义保持一致（结构 + 受限表达式静态检查）。
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/* 可复用收集器：checkBlock/checkScene/validate 都往 R 里 push；
   validateDoc()/validateBlock() 每次调用先清空 R，故本模块可被 assemble.mjs / validate-block.mjs import。 */
const R = { errors: [], warnings: [] };
const err = (path, msg) => R.errors.push(path + ' — ' + msg);
const warn = (path, msg) => R.warnings.push(path + ' — ' + msg); /* 非致命，收集用于 schema 演化决策（SPEC §3.3） */

/* ---------- 小工具 ---------- */
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
function req(obj, key, pred, path, what) {
  if (!(key in obj)) { err(path, '缺少必填字段 ' + key); return false; }
  if (!pred(obj[key])) { err(path + '.' + key, '类型不对，应为 ' + what); return false; }
  return true;
}
function opt(obj, key, pred, path, what) {
  if (key in obj && !pred(obj[key])) { err(path + '.' + key, '类型不对，应为 ' + what); return false; }
  return true;
}

/* ---------- 受限表达式静态检查（SPEC §4） ---------- */
const MATH_IDS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow', 'min', 'max', 'floor', 'round', 'PI', 'E'];
function checkExpr(expr, varNames, path) {
  if (!isStr(expr)) { err(path, '表达式应为字符串'); return; }
  if (!/^[\w\s+\-*/%(),.<>=!?:&|]*$/.test(expr)) { err(path, '表达式含非法字符: ' + expr); return; }
  const ids = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const allowed = new Set([...varNames, ...MATH_IDS]);
  for (const id of ids) if (!allowed.has(id)) err(path, '表达式标识符不在白名单: "' + id + '"（允许: ' + [...varNames].join(', ') + ' + 数学函数）');
}

/* ---------- inline-md 检查：禁原始 HTML + 禁裸 LaTeX ----------
   裸 LaTeX = 没有 $…$ 包起来的 LaTeX 记号。渲染器的 inlineMd 只对 $…$ 内的内容调 KaTeX，
   分隔符外的一律按散文 escape 输出，于是 `\texttt{"ababc"}`、`ρ_{密度}`、`\pi[4]=2`
   会原样印在幻灯片上。这类缺陷此前完全无人拦截：旧检查只数 $ 的奇偶，零个 $ 即偶数即通过。 */
const BARE_TEX_MACROS = /\\(pi|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|Delta|Sigma|Omega|sum|prod|int|lim|max|min|log|ln|exp|sin|cos|tan|sqrt|frac|infty|partial|nabla|cdot|times|div|pm|leq?|geq?|neq|approx|equiv|sim|in|notin|subset|supset|cup|cap|emptyset|forall|exists|land|lor|neg|to|rightarrow|leftarrow|Rightarrow|Leftarrow|mapsto|langle|rangle|lfloor|rfloor|lceil|rceil|quad|qquad|text|texttt|textbf|textit|mathrm|mathbb|mathcal|mathbf|operatorname)\b/;
function checkInline(s, path) {
  if (!isStr(s)) return;
  if ((s.match(/\$/g) || []).length % 2 !== 0) { err(path, '行内公式 $ 未配对'); return; }
  /* 所有检查只看 $…$ 与 `code` 之外的部分——里面本来就该是 LaTeX / 原样代码，
     inlineMd 会先把它们摘出来单独处理。讲 XML/HTML 的课件写 `<catalog>` 完全合法。 */
  const outside = s.replace(/\$[^$]*\$/g, ' ').replace(/`[^`]*`/g, ' ');
  if (/<[a-zA-Z/][^>]*>/.test(outside)) err(path, 'inlineMd 禁止原始 HTML 标签（用 **b** / *em* / `code` / $latex$）');
  if (/\\[([\])]/.test(outside))
    err(path, '行内公式请用 $…$ 分隔符，不要用 \\( \\) / \\[ \\]（渲染器只识别 $…$）');
  else if (/\\[a-zA-Z]+\s*\{/.test(outside) || BARE_TEX_MACROS.test(outside))
    err(path, '出现未被 $…$ 包裹的裸 LaTeX 命令 —— 会原样印在页面上，请补齐 $…$ 或改写成纯文本');
  else if (/[_^]\{[^}]*\}/.test(outside))
    err(path, '出现未被 $…$ 包裹的上/下标 _{…} / ^{…} —— 会原样印在页面上，请补齐 $…$ 或改用纯文本');
}

/* ---------- freeform.html 静态检查（净化的第一道关，运行时 sanitizeFreeformHtml 是权威第二道关） ----------
   与运行时净化的核心规则对齐：禁危险标签/内联事件；媒体只能本地；style 里颜色/字体只接受 var(--token)。 */
const DANGEROUS_HTML = /<script\b|<style\b|<iframe\b|<object\b|<embed\b|\son\w+\s*=|javascript:/i;
const FF_COLORISH = ['color', 'background', 'background-color', 'border', 'border-color', 'outline', 'fill', 'stroke', 'font-family', 'box-shadow', 'text-shadow'];
function checkFreeformHtml(html, path) {
  if (DANGEROUS_HTML.test(html)) err(path, 'html 含危险标签/属性（script/style/iframe/object/embed/内联事件/javascript: 协议均不允许）');
  if (/<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html)) err(path, 'img src 必须是本地路径（vendor/ 或 assets/ 或 data:image/），禁远程 URL');
  const styleRe = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi; let m;
  while ((m = styleRe.exec(html))) {
    const decls = m[1] || m[2] || '';
    for (const d of decls.split(';')) {
      const i = d.indexOf(':'); if (i < 0) continue;
      const p = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
      if (!p || !v) continue;
      if (/url\(/i.test(v)) { err(path, 'style 里禁用 url()（外链/追踪风险）: ' + p); continue; }
      if (FF_COLORISH.includes(p) && !/var\(\s*--/.test(v) && !/^(currentcolor|transparent|none|inherit|initial|unset)$/i.test(v))
        err(path, 'style 的 ' + p + ' 用了裸色值/裸字体（"' + v + '"）——颜色/字体只接受 var(--token) 或 currentColor 等，须走主题');
    }
  }
}

/* ---------- 反 AI-slop 美学 lint（移植自 GenUI validators._aesthetic_quality_errors，见 SPEC §3.2/§5） ----------
   作用于 freeform.html 与 sim.widget.html：全部产出 warning（非致命），提醒别退回 AI slop。 */
const CSS_RULE_RE = /([^{}]*)\{([^{}]*)\}/g;
const BG_HEX_RE = /background(?:-color)?\s*:[^;}]*?#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
const THEME_INK_RE = /(?:^|[;{\s])color\s*:\s*(var\(\s*--|currentcolor|inherit)/i;
function hexIsDark(h) {
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.3;   // 感知亮度 < 0.3 视为暗
}
function darkFillThemeInkFootgun(code) {
  CSS_RULE_RE.lastIndex = 0; let m;
  while ((m = CSS_RULE_RE.exec(code))) {
    const sel = m[1], body = m[2];
    if (/data-theme|prefers-color-scheme/.test(sel)) continue;   // 已按主题作用域的暗底是对的
    const bg = BG_HEX_RE.exec(body);
    if (bg && hexIsDark(bg[1]) && THEME_INK_RE.test(body)) return true;
  }
  return false;
}
function aestheticLint(html, path, { requireMotion } = {}) {
  const low = html.toLowerCase();
  if (requireMotion && !/(transition|animation|@keyframes|requestanimationframe|setinterval)/.test(low))
    warn(path, '交互组件缺少动效（transition/animation/requestAnimationFrame）——控件应有 hover/active 过渡、状态变化应可见地动起来');
  if (/<h1[\s>]/.test(low)) warn(path, '含 <h1> 自我介绍标题——页面已有标题，组件内不必再自报家门');
  if (/(提示\s*[:：]|小贴士\s*[:：]|tips?\s*:)/i.test(html)) warn(path, '含"提示:/Tip:"说明胶囊——用设计（光标/hover 预览）表达可用性，别贴说明贴纸');
  if (/prefers-color-scheme/.test(low)) warn(path, '用了 @media (prefers-color-scheme)——它跟随系统而非本讲义主题；应走 [data-theme] / 读 --token');
  if (low.includes('#4fc3f7')) warn(path, '用了样例桩色 #4fc3f7——请从主题 token 取色，别抄示例调色板');
  if (darkFillThemeInkFootgun(low)) warn(path, '暗底固定 hex + var(--)/currentColor 文字——浅色主题下文字会翻暗、暗底上消失；底色与文字须一起随主题动');
}
/* ---------- sim.widget.html 静态契约（对齐 GenUI is_widget_code_valid + 运行时 sandbox iframe） ----------
   与 freeform 不同：widget 允许 <script>/<canvas>（因跑在 null-origin sandbox iframe 里，隔离而非净化）。 */
function checkWidgetHtml(html, path) {
  if (!isStr(html) || html.length < 40) { err(path, '片段过短或缺失（应是自包含 HTML 片段）'); return; }
  const low = html.toLowerCase();
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/.test(low)) err(path, 'widget.html 必须是**片段**，不要写 <!doctype>/<html>/<head>/<body>（运行时会包进 iframe 文档）');
  if (!/(<div|<svg|<canvas|<style)/.test(low)) err(path, 'widget.html 至少应含 <div>/<svg>/<canvas>/<style> 之一');
  /* 内嵌 <script> 的 JS 语法必须能解析（只查语法不查运行——浏览器全局在此不求值），防坏 canvas 代码出厂 */
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
  for (const js of scripts) {
    try { new Function(js); }
    catch (e) { if (e instanceof SyntaxError) err(path, 'widget 的 <script> 有 JS 语法错误: ' + String(e.message).slice(0, 100)); }
  }
  aestheticLint(html, path, { requireMotion: true });
}

/* ---------- block 校验 ---------- */
import { SCENE_KINDS, LAYOUT_KINDS, BLOCK_TYPES, SIM_ENGINES, DIAGRAM_TYPES, GRAPH_TYPES } from './enums.mjs';   // 单一真相源（iter73 解耦）

/* graph 块的图论完整性检查。结构/类型由 JSON Schema 管，这里补它表达不了的关系约束：
   边指向不存在的节点、孤立节点、tree 的单父约束、环。这些不拦住的话渲染出来就是断线/乱穿。 */
/** 去掉 dashed 边后是否无环。flowchart 允许回边，但回边必须显式标虚线。 */
function acyclicWithoutDashed(edges, ids) {
  const deg = new Map([...ids].map(k => [k, 0]));
  const adj = new Map([...ids].map(k => [k, []]));
  for (const e of edges) {
    if (!isObj(e) || e.style === 'dashed') continue;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    adj.get(e.from).push(e.to);
    deg.set(e.to, deg.get(e.to) + 1);
  }
  const q = [...deg].filter(([, d]) => d === 0).map(([k]) => k);
  let seen = 0;
  while (q.length) {
    const cur = q.shift(); seen++;
    for (const nxt of adj.get(cur)) { deg.set(nxt, deg.get(nxt) - 1); if (deg.get(nxt) === 0) q.push(nxt); }
  }
  return seen === ids.size;
}

function checkGraph(b, path) {
  if (!GRAPH_TYPES.includes(b.graphType)) { err(path + '.graphType', GRAPH_TYPES.join('|')); return; }
  if (!req(b, 'nodes', v => Array.isArray(v) && v.length >= 2 && v.length <= 14, path, '2–14 节点数组')) return;
  if (!req(b, 'edges', v => Array.isArray(v) && v.length >= 1 && v.length <= 24, path, '1–24 边数组')) return;

  const ids = new Set();
  b.nodes.forEach((n, i) => {
    if (!isObj(n) || !isStr(n.id) || !isStr(n.title)) { err(path + `.nodes[${i}]`, '每项需 {id, title}'); return; }
    if (ids.has(n.id)) err(path + `.nodes[${i}].id`, '节点 id 重复: ' + n.id);
    ids.add(n.id);
    checkInline(n.title, path + `.nodes[${i}].title`);
    if (n.sub) checkInline(n.sub, path + `.nodes[${i}].sub`);
  });
  if (ids.size < 2) return;

  const indeg = new Map([...ids].map(k => [k, 0]));
  const adj = new Map([...ids].map(k => [k, []]));
  const touched = new Set();
  b.edges.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) { err(path + `.edges[${i}]`, '每项需 {from, to}'); return; }
    if (!ids.has(e.from)) err(path + `.edges[${i}].from`, `指向不存在的节点 "${e.from}"（会渲染成断线）`);
    if (!ids.has(e.to)) err(path + `.edges[${i}].to`, `指向不存在的节点 "${e.to}"（会渲染成断线）`);
    if (e.from === e.to) err(path + `.edges[${i}]`, '自环边（from===to）无法渲染');
    // 端点合法就先记 touched，免得一条断边把两头都连带报成「孤立节点」，噪音盖住真问题
    if (ids.has(e.from)) touched.add(e.from);
    if (ids.has(e.to)) touched.add(e.to);
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  });

  const orphans = [...ids].filter(k => !touched.has(k));
  if (orphans.length) err(path + '.nodes', '有节点不连任何边（会孤零零飘着）: ' + orphans.join(', '));

  if (b.graphType === 'tree') {
    const multi = [...indeg].filter(([, d]) => d > 1).map(([k]) => k);
    if (multi.length) err(path + '.edges', 'tree 每个节点至多一个父，以下有多个: ' + multi.join(', ') + '（多父请用 graphType:"dag"）');
    const roots = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
    if (roots.length !== 1) err(path + '.edges', `tree 应恰好一个根（入度 0），实得 ${roots.length} 个: ${roots.join(', ') || '无'}`);
  }

  // 环检测（Kahn）：tree/dag 都不允许环；flowchart 允许回边但必须显式 dashed
  const deg = new Map(indeg);
  const queue = [...deg].filter(([, d]) => d === 0).map(([k]) => k);
  let seen = 0;
  while (queue.length) {
    const cur = queue.shift(); seen++;
    for (const nxt of adj.get(cur) || []) { deg.set(nxt, deg.get(nxt) - 1); if (deg.get(nxt) === 0) queue.push(nxt); }
  }
  if (seen < ids.size) {
    if (b.graphType !== 'flowchart') {
      err(path + '.edges', `存在环（${ids.size - seen} 个节点在环上），tree/dag 不允许；确实要回边请用 graphType:"flowchart" 且把回边标 style:"dashed"`);
    } else if (!acyclicWithoutDashed(b.edges, ids)) {
      /* 判据：把 dashed 边拿掉后必须无环——即"闭合每个环的那条边都已标虚线"。
         别用"目标能绕回源头"当回边判据：环上**每**条边都满足它，会把主流程边一起冤枉。 */
      err(path + '.edges', 'flowchart 存在未标虚线的回边：请把闭合循环的那条边标 style:"dashed"，否则读者分不清主流程与回流');
    }
  }

  if (b.caption != null) { opt(b, 'caption', isStr, path, 'string'); checkInline(b.caption, path + '.caption'); }
}
export { BLOCK_TYPES };   // re-export 兼容既有 import（check-consistency / tools/test.mjs）
function checkBlock(b, path, state) {
  if (!isObj(b)) { err(path, 'block 应为对象'); return; }
  if (!BLOCK_TYPES.includes(b.type)) { err(path + '.type', '未知 block 类型: ' + b.type); return; }
  opt(b, 'status', v => ['ready', 'pending', 'error'].includes(v), path, 'ready|pending|error');
  opt(b, 'fragment', v => typeof v === 'boolean' || typeof v === 'string', path, 'boolean 或 reveal fragment 类型名(如 fade-up/highlight-red)');
  const T = b.type;
  if (T === 'hero') {
    if (req(b, 'title', v => Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every(isStr), path, '1–3 行字符串数组'))
      b.title.forEach((t, i) => checkInline(t, path + `.title[${i}]`));
    for (const k of ['tag', 'sub', 'facts', 'hint']) opt(b, k, isStr, path, 'string');
    if (b.sub) checkInline(b.sub, path + '.sub');
    if (b.tag) checkInline(b.tag, path + '.tag');
    if (b.image != null) {
      opt(b, 'image', isStr, path, 'string');
      if (isStr(b.image) && /^\s*(https?:)?\/\//i.test(b.image)) err(path + '.image', '只能是本地相对路径或 data:，禁远程 URL（守离线红线）');
    }
  } else if (T === 'statement') {
    req(b, 'statement', isStr, path, 'string'); checkInline(b.statement, path + '.statement');
  } else if (T === 'pullquote') {
    req(b, 'text', isStr, path, 'string'); checkInline(b.text, path + '.text');
    if (b.cite != null) { opt(b, 'cite', isStr, path, 'string'); checkInline(b.cite, path + '.cite'); }
  } else if (T === 'video') {
    if (!isStr(b.src) && !isStr(b.poster)) err(path, 'video 至少需 src 或 poster');
    const remote = v => isStr(v) && /^\s*(https?:)?\/\//i.test(v);   // http(s):// 或协议相对 //host
    for (const k of ['src', 'poster', 'captions']) {
      if (b[k] != null) { opt(b, k, isStr, path, 'string'); if (remote(b[k])) err(path + '.' + k, '只能是本地相对路径或 data:，禁远程 URL(守离线红线)'); }
    }
    if (b.caption != null) { opt(b, 'caption', isStr, path, 'string'); checkInline(b.caption, path + '.caption'); }
    if (b.loop != null) opt(b, 'loop', v => typeof v === 'boolean', path, 'boolean');
  } else if (T === 'list') {
    if (req(b, 'items', v => Array.isArray(v) && v.length >= 1 && v.length <= 12, path, '1–12 项数组')) {
      if (b.items.length > 8) warn(path + '.items', '条目数 ' + b.items.length + ' 偏多，注意别在一页里堆太满（硬顶 12，建议 ≤8）');
      b.items.forEach((it, i) => {
        if (!isObj(it) || !isStr(it.text)) err(path + `.items[${i}]`, '每项需 {text}');
        else {
          checkInline(it.text, path + `.items[${i}].text`);
          if (it.lead != null) { if (!isStr(it.lead)) err(path + `.items[${i}].lead`, '应为 string'); else checkInline(it.lead, path + `.items[${i}].lead`); }
          if (it.icon != null && !isStr(it.icon)) err(path + `.items[${i}].icon`, '应为 string(本地图标 id)');
        }
      });
    }
  } else if (T === 'agenda') {
    if (req(b, 'rows', v => Array.isArray(v) && v.length >= 1 && v.length <= 12, path, '1–12 行数组')) {
      if (b.rows.length > 8) warn(path + '.rows', '行数 ' + b.rows.length + ' 偏多，注意别在一页里堆太满（硬顶 12，建议 ≤8）');
      b.rows.forEach((r, i) => { if (!isObj(r) || !isStr(r.label) || !isStr(r.text)) err(path + `.rows[${i}]`, '每行需 {label, text}'); else { checkInline(r.text, path + `.rows[${i}].text`); checkInline(r.label, path + `.rows[${i}].label`); } });
    }
  } else if (T === 'callout') {
    req(b, 'label', isStr, path, 'string'); req(b, 'text', isStr, path, 'string');
    checkInline(b.text, path + '.text');
    if (b.label) checkInline(b.label, path + '.label');
  } else if (T === 'timeline') {
    if (req(b, 'events', v => Array.isArray(v) && v.length >= 2 && v.length <= 8, path, '2–8 事件数组')) {
      b.events.forEach((e, i) => {
        if (!isObj(e) || !isStr(e.time) || !isStr(e.title)) err(path + `.events[${i}]`, '每项需 {time, title, desc?}');
        else { checkInline(e.title, path + `.events[${i}].title`); checkInline(e.time, path + `.events[${i}].time`); if (e.desc) { if (!isStr(e.desc)) err(path + `.events[${i}].desc`, 'desc 应为 string'); else checkInline(e.desc, path + `.events[${i}].desc`); } }
      });
    }
  } else if (T === 'formula') {
    if (req(b, 'latex', isStr, path, 'string') && /\$/.test(b.latex))
      err(path + '.latex', 'latex 是纯 LaTeX 源码，不要用 $ 或 $$ 包裹（渲染器自动按公式渲染；$ 会被 KaTeX 当非法字符标红）');
    /* caption 是散文字段，走 inlineMd —— 里面的数学必须自带 $…$，否则原样印出 */
    if (b.caption != null) { opt(b, 'caption', isStr, path, 'string'); checkInline(b.caption, path + '.caption'); }
  } else if (T === 'flow') {
    if (req(b, 'nodes', v => Array.isArray(v) && v.length >= 2 && v.length <= 7, path, '2–7 节点数组')) {
      if (b.nodes.length > 6) warn(path + '.nodes', '节点数 ' + b.nodes.length + ' 偏多，横向流程易挤（硬顶 7）');
      b.nodes.forEach((n, i) => { if (!isObj(n) || !isStr(n.title)) err(path + `.nodes[${i}]`, '节点需 {title}'); else { checkInline(n.title, path + `.nodes[${i}].title`); if (n.sub) checkInline(n.sub, path + `.nodes[${i}].sub`); } if (n.state && !['on', 'q'].includes(n.state)) err(path + `.nodes[${i}].state`, '应为 on|q'); });
    }
  } else if (T === 'table') {
    if (req(b, 'head', v => Array.isArray(v) && v.length >= 2 && v.every(isStr), path, '表头字符串数组'))
      b.head.forEach((h, i) => checkInline(h, path + `.head[${i}]`));
    if (req(b, 'rows', v => Array.isArray(v) && v.length >= 1, path, '行数组'))
      b.rows.forEach((row, i) => {
        if (!Array.isArray(row)) { err(path + `.rows[${i}]`, '行应为数组'); return; }
        row.forEach((c, j) => { const t = isObj(c) ? c.text : c; if (isStr(t)) checkInline(t, path + `.rows[${i}][${j}]`); });
      });
  } else if (T === 'chart') {
    if (!['bar', 'line', 'area', 'scatter'].includes(b.chartType)) { err(path + '.chartType', '应为 bar|line|area|scatter'); return; }
    if (b.chartType === 'scatter') {
      if (req(b, 'points', v => Array.isArray(v) && v.length >= 2, path, '≥2 点数组'))
        b.points.forEach((p, i) => { if (!isObj(p) || !isNum(p.x) || !isNum(p.y)) err(path + `.points[${i}]`, '每项需 {x,y,label?}'); });
    } else if (req(b, 'categories', v => Array.isArray(v) && v.every(isStr), path, '字符串数组')
      && req(b, 'series', v => Array.isArray(v) && v.length >= 1, path, '至少 1 条 series')) {
      b.series.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.name) || !Array.isArray(s.values) || !s.values.every(isNum)) err(path + `.series[${i}]`, '每条需 {name, values:number[]}');
        else if (s.values.length !== b.categories.length) err(path + `.series[${i}].values`, 'values 长度需与 categories 一致');
      });
    }
    if (b.caption != null) { opt(b, 'caption', isStr, path, 'string'); checkInline(b.caption, path + '.caption'); }
  } else if (T === 'stats') {
    if (req(b, 'items', v => Array.isArray(v) && v.length >= 2 && v.length <= 6, path, '2–6 项数组'))
      b.items.forEach((it, i) => {
        if (!isObj(it) || !isStr(it.value) || !isStr(it.label)) err(path + `.items[${i}]`, '每项需 {value, label, delta?}');
        else if (it.delta != null && !isStr(it.delta)) err(path + `.items[${i}].delta`, '应为 string');
      });
  } else if (T === 'diagram') {
    if (!DIAGRAM_TYPES.includes(b.diagramType)) { err(path + '.diagramType', DIAGRAM_TYPES.join('|')); return; }
    if (req(b, 'nodes', v => Array.isArray(v) && v.length >= 2 && v.length <= 8, path, '2–8 节点数组'))
      b.nodes.forEach((n, i) => {
        if (!isObj(n) || !isStr(n.title)) err(path + `.nodes[${i}]`, '每项需 {title, sub?}');
        else if (n.sub != null && !isStr(n.sub)) err(path + `.nodes[${i}].sub`, '应为 string');
        else { checkInline(n.title, path + `.nodes[${i}].title`); if (n.sub) checkInline(n.sub, path + `.nodes[${i}].sub`); }
      });
  } else if (T === 'graph') {
    checkGraph(b, path);
  } else if (T === 'code') {
    req(b, 'language', v => ['python', 'javascript', 'text'].includes(v), path, 'python|javascript|text');
    req(b, 'source', isStr, path, 'string');
    /* source 是原样代码（textContent，不过 inlineMd）；filename/caption 是散文，过 inlineMd */
    if (b.filename != null) { opt(b, 'filename', isStr, path, 'string'); checkInline(b.filename, path + '.filename'); }
    if (b.caption != null) { opt(b, 'caption', isStr, path, 'string'); checkInline(b.caption, path + '.caption'); }
  } else if (T === 'compare') {
    for (const side of ['left', 'right']) {
      if (!isObj(b[side]) || !isObj(b[side].block)) { err(path + '.' + side, '需 {caption?, block}'); continue; }
      if (b[side].caption != null) { if (!isStr(b[side].caption)) err(path + '.' + side + '.caption', '应为 string'); else checkInline(b[side].caption, path + '.' + side + '.caption'); }
      checkBlock(b[side].block, path + '.' + side + '.block', state);
    }
  } else if (T === 'quiz') {
    if (!['objective', 'subjective'].includes(b.kind)) { err(path + '.kind', '应为 objective|subjective'); return; }
    if (b.kind === 'objective') {
      if (req(b, 'choices', v => Array.isArray(v) && v.length >= 2 && v.length <= 6, path, '2–6 选项数组')) {
        const keys = new Set();
        b.choices.forEach((c, i) => {
          if (!isObj(c) || !/^[a-z]$/.test(c.key || '') || !isStr(c.text)) err(path + `.choices[${i}]`, '每项需 {key:"a"-"z", text}');
          else { if (keys.has(c.key)) err(path + `.choices[${i}].key`, '选项 key 重复: ' + c.key); keys.add(c.key); checkInline(c.text, path + `.choices[${i}].text`); }
        });
        if (req(b, 'answer', v => /^[a-z]$/.test(v), path, '单字母') && !keys.has(b.answer)) err(path + '.answer', 'answer "' + b.answer + '" 不在选项 key 里');
      }
      if (req(b, 'explain', isStr, path, 'string')) checkInline(b.explain, path + '.explain');
    } else {
      req(b, 'prompt', isStr, path, 'string');
    }
  } else if (T === 'sim') {
    if (!SIM_ENGINES.includes(b.engine)) { err(path + '.engine', '未知引擎: ' + b.engine); return; }
    let paramNames = [];
    /* widget 引擎控件长在片段内部，params 可选；其余引擎必填 */
    const hasParams = Array.isArray(b.params);
    if (b.engine !== 'widget' && !hasParams) err(path, '缺少必填字段 params');
    if (hasParams) {
      if (b.params.length < 1 || b.params.length > 4) err(path + '.params', '应为 1–4 参数数组');
      b.params.forEach((p, i) => {
        if (!isObj(p) || !isStr(p.name) || !isStr(p.label) || ![p.min, p.max, p.step, p.default].every(isNum))
          err(path + `.params[${i}]`, '参数需 {name,label,min,max,step,default}');
        else {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.name)) err(path + `.params[${i}].name`, '非法参数名');
          if (p.default < p.min || p.default > p.max) err(path + `.params[${i}]`, 'default 不在 [min,max] 内');
          paramNames.push(p.name);
        }
      });
    }
    if (b.engine === 'widget') {
      if (req(b, 'html', isStr, path, 'string（自包含 HTML 片段）')) checkWidgetHtml(b.html, path + '.html');
    } else if (b.engine === 'dynamics1d') {
      if (req(b, 'model', isObj, path, 'object')) {
        const M = b.model, mp = path + '.model';
        req(M, 'stateVar', isStr, mp, 'string'); req(M, 'init', isNum, mp, 'number');
        req(M, 'steps', v => Number.isInteger(v) && v > 0 && v <= 500, mp, '1–500 整数');
        const constNames = Object.keys(M.consts || {});
        // consts 必须是数字常量：填表达式(如把"速度 v"塞成字符串)会被渲染器当字符串拼接→NaN→图表空白。
        // 这正是二阶/振子系统(简谐/阻尼/单摆,需位置+速度两个状态)误塞进一维 dynamics1d 的典型症状——应改用 custom 引擎自维护多状态。
        for (const [ck, cv] of Object.entries(M.consts || {}))
          if (!isNum(cv)) err(mp + '.consts.' + ck, 'consts 值必须是数字常量，不能是表达式/字符串(会被当字符串算出 NaN、图表空白)；二阶/振子系统(需多个状态变量)改用 custom 引擎');
        if (isStr(M.update)) checkExpr(M.update, [M.stateVar, ...paramNames, ...constNames, 'xi'], mp + '.update');
        else err(mp + '.update', '缺少 update 表达式');
      }
      if (!Array.isArray(b.regimes) || !b.regimes.length) err(path + '.regimes', 'dynamics1d 至少需 1 个 regime（渲染时按 regime 定色/描述当前状态，缺失会导致渲染崩溃）');
      (b.regimes || []).forEach((r, i) => {
        if (!isObj(r) || !isStr(r.when) || !isStr(r.label) || !isStr(r.desc)) err(path + `.regimes[${i}]`, '需 {when,label,desc}');
        else { checkExpr(r.when, paramNames, path + `.regimes[${i}].when`);
          if (r.tone && !['line', 'accent', 'ink'].includes(r.tone)) err(path + `.regimes[${i}].tone`, '应为 line|accent|ink'); }
      });
      if (b.noiseNote) { checkExpr(b.noiseNote.when, paramNames, path + '.noiseNote.when'); if (!isStr(b.noiseNote.text)) err(path + '.noiseNote.text', '应为 string'); }
    } else if (b.engine === 'searchCompare') {
      if (req(b, 'model', isObj, path, 'object')) {
        const M = b.model, mp = path + '.model';
        if (isStr(M.objective)) checkExpr(M.objective, ['x'], mp + '.objective'); else err(mp + '.objective', '缺少 objective 表达式');
        req(M, 'domain', v => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] < v[1], mp, '[min,max] 数组');
        req(M, 'strategies', v => Array.isArray(v) && v.every(s => ['grid', 'random', 'bayes'].includes(s)), mp, 'grid|random|bayes 数组');
        if (isStr(M.budgetParam) && !paramNames.includes(M.budgetParam)) err(mp + '.budgetParam', '"' + M.budgetParam + '" 不在 params 里');
      }
    } else { /* custom */
      req(b, 'computeJs', isStr, path, 'string（沙箱 JS 纯函数源码）');
      req(b, 'chart', isObj, path, 'object');
    }
  } else if (T === 'runnable') {
    req(b, 'languages', v => Array.isArray(v) && v.length >= 1 && v.every(l => ['python', 'js'].includes(l)), path, 'python|js 数组');
    if (req(b, 'starter', isObj, path, 'object'))
      for (const l of b.languages || []) if (!isStr(b.starter[l])) err(path + '.starter.' + l, '缺少该语言的初始代码');
    if (req(b, 'env', isObj, path, 'object')) {
      const E = b.env, ep = path + '.env';
      if (E.kind === 'objective1d') {
        if (isStr(E.objective)) checkExpr(E.objective, ['x'], ep + '.objective'); else err(ep + '.objective', '缺少 objective 表达式');
        req(E, 'domain', v => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] < v[1], ep, '[min,max] 数组');
      } else if (E.kind === 'custom') {
        if (!isStr(E.pythonPreamble) && !isStr(E.jsPreamble)) err(ep, 'custom 环境需 pythonPreamble 或 jsPreamble 至少一个');
      } else err(ep + '.kind', '应为 objective1d|custom');
    }
  } else if (T === 'grid') {
    req(b, 'columns', v => Number.isInteger(v) && v >= 2 && v <= 4, path, '2–4 整数');
    if (req(b, 'items', v => Array.isArray(v) && v.length >= 2 && v.length <= 8, path, '2–8 项数组'))
      b.items.forEach((it, i) => {
        if (!isObj(it) || !isObj(it.block)) err(path + `.items[${i}]`, '每项需 {block, span?}');
        else checkBlock(it.block, path + `.items[${i}].block`, state);
        if (it.span != null && !(Number.isInteger(it.span) && it.span >= 1 && it.span <= 4)) err(path + `.items[${i}].span`, 'span 应为 1–4 整数');
      });
  } else if (T === 'embed') {
    req(b, 'product', v => ['codelab', 'video', 'sim'].includes(v), path, 'codelab|video|sim');
  } else if (T === 'freeform') {
    if (req(b, 'html', v => isStr(v) && v.length > 0, path, '非空字符串')) { checkFreeformHtml(b.html, path + '.html'); aestheticLint(b.html, path + '.html', { requireMotion: false }); }
    if (req(b, 'rationale', v => isStr(v) && v.length >= 10, path, '至少 10 字，需具体说明现有类型为何不适用')) {
      state.freeformUses.push({ path, rationale: b.rationale });
    }
  }
}

/* ---------- scene 校验 ---------- */
function checkScene(s, path, state, seenIds) {
  if (!isObj(s)) { err(path, 'scene 应为对象'); return; }
  if (req(s, 'id', v => isStr(v) && /^[a-z0-9][a-z0-9-]*$/.test(v), path, 'kebab-case id')) {
    if (seenIds.has(s.id)) err(path + '.id', 'scene id 重复: ' + s.id); seenIds.add(s.id);
  }
  req(s, 'kind', v => SCENE_KINDS.includes(v), path, SCENE_KINDS.join('|'));
  req(s, 'notes', v => isStr(v) && v.length > 0, path, '非空字符串（演讲者备注必填）');
  for (const k of ['eyebrow', 'headline', 'lead', 'transition']) opt(s, k, isStr, path, 'string');
  opt(s, 'autoAnimate', v => typeof v === 'boolean', path, 'boolean');
  if (s.headline) checkInline(s.headline, path + '.headline');
  if (s.lead) checkInline(s.lead, path + '.lead');
  if (!req(s, 'blocks', v => Array.isArray(v) && v.length >= 1, path, '非空数组')) return;
  if (s.kind === 'hero' && (s.blocks.length !== 1 || s.blocks[0].type !== 'hero')) err(path + '.blocks', 'hero 页应恰好含一个 hero block');
  if (s.kind === 'statement' && !s.blocks.some(b => b.type === 'statement')) err(path + '.blocks', 'statement 页应含 statement block');
  if (s.kind === 'quiz' && !s.blocks.some(b => b.type === 'quiz')) err(path + '.blocks', 'quiz 页应含 quiz block');
  if (s.kind === 'section' && !s.blocks.some(b => b.type === 'statement')) err(path + '.blocks', 'section 分隔页应含一个 statement block（章节一句话主旨）');
  checkLayout(s, path);
  s.blocks.forEach((b, i) => checkBlock(b, path + `.blocks[${i}]`, state));
}

/* 版式软校验（成长规则）：kind 若给验 enum；index/split 的 block id 引用若失效只 warn，不阻断——
   渲染器对空/失效引用一律回落默认竖排且绝不丢内容，是真正的安全网（红线在渲染侧兜底）。 */
function checkLayout(s, path) {
  const L = s.layout; if (!isObj(L)) return;
  const p = path + '.layout';
  if ('kind' in L && !LAYOUT_KINDS.includes(L.kind)) warn(p + '.kind', '未知版式 kind: ' + L.kind + '（渲染器将回落 flow）');
  const ids = new Set((s.blocks || []).map(b => b && b.id).filter(x => x != null));
  const chk = (id, where) => { if (!ids.has(id)) warn(where, '引用了不存在的 block id: ' + id + '（渲染器将回落）'); };
  if (Array.isArray(L.steps)) L.steps.forEach((st, i) => { if (isObj(st) && Array.isArray(st.blockIds)) st.blockIds.forEach(id => chk(id, p + `.steps[${i}].blockIds`)); });
  if (Array.isArray(L.anchor)) L.anchor.forEach(id => chk(id, p + '.anchor'));
  if (Array.isArray(L.areas)) L.areas.forEach((a, i) => { if (isObj(a) && Array.isArray(a.blockIds)) a.blockIds.forEach(id => chk(id, p + `.areas[${i}].blockIds`)); });
}

/* ---------- deck 校验 ---------- */
function validate(doc, state) {
  if (!isObj(doc)) { err('$', '顶层应为对象'); return; }
  if (doc.schemaVersion !== '1.0') err('$.schemaVersion', '应为 "1.0"');
  req(doc, 'id', v => isStr(v) && /^[a-z0-9][a-z0-9-]*$/.test(v), '$', 'kebab-case id');
  req(doc, 'title', v => isStr(v) && v.length > 0, '$', '非空字符串');
  req(doc, 'language', isStr, '$', 'string');
  if (doc.tutor) {
    (doc.tutor.kb || []).forEach((k, i) => {
      if (!isObj(k) || !isStr(k.pattern) || !isStr(k.answer)) { err(`$.tutor.kb[${i}]`, '需 {pattern, answer}'); return; }
      try { new RegExp(k.pattern, k.flags || ''); } catch (e) { err(`$.tutor.kb[${i}].pattern`, '非法正则: ' + e.message); }
      checkInline(k.answer, `$.tutor.kb[${i}].answer`);
    });
  }
  const seenIds = new Set();
  if (req(doc, 'scenes', v => Array.isArray(v) && v.length >= 1, '$', '非空数组'))
    doc.scenes.forEach((s, i) => checkScene(s, `$.scenes[${i}]`, state, seenIds));
}

/* ---------- 可复用导出（供 assemble.mjs / validate-block.mjs import） ---------- */
function freshState() { return { freeformUses: [] }; }
/** 校验整份 LectureDoc；返回 {errors, warnings, freeformUses}，不打印、不 exit。 */
export function validateDoc(doc) {
  R.errors = []; R.warnings = [];
  const state = freshState();
  validate(doc, state);
  return { errors: R.errors.slice(), warnings: R.warnings.slice(), freeformUses: state.freeformUses };
}
/** 校验单个 block（agent 逐块自检用）；path 默认 '$block'。可选 expectType 断言类型。 */
export function validateBlock(block, expectType, path = '$block') {
  R.errors = []; R.warnings = [];
  const state = freshState();
  if (expectType && isObj(block) && block.type !== expectType)
    err(path + '.type', `期望 ${expectType}，实际 ${block && block.type}`);
  checkBlock(block, path, state);
  return { errors: R.errors.slice(), warnings: R.warnings.slice(), freeformUses: state.freeformUses };
}

/* ---------- CLI（仅直接运行时；被 import 时不执行） ----------
   用法:  node validate.mjs [file]                 校验整份 doc（缺省 ../course.lecture.json）
          node validate.mjs --block <blockfile>    校验单个 block（JSON 为一个 block 对象；可 {type,...} 或 {expectType, block}）
*/
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const blockMode = args[0] === '--block';
  const target = blockMode ? args[1] : args[0];
  const file = target ? resolve(target) : resolve(here, '..', 'course.lecture.json');
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error('✗ JSON 解析失败: ' + e.message); process.exit(2); }

  const printExtras = (res) => {
    if (res.freeformUses.length) {
      console.warn('⚠ 使用了 ' + res.freeformUses.length + ' 处 freeform block（未分类内容）——建议关注是否应收编为正式 block 类型：');
      for (const u of res.freeformUses) console.warn('  · ' + u.path + ' — rationale: "' + u.rationale + '"');
    }
    if (res.warnings.length) {
      console.warn('⚠ ' + res.warnings.length + ' 条提醒（非致命，含容量上限 / 反 AI-slop lint）:');
      for (const w of res.warnings) console.warn('  · ' + w);
    }
  };

  if (blockMode) {
    /* 支持两种输入：直接一个 block 对象，或 {expectType, block} 包装 */
    const block = isObj(data) && data.block && data.expectType !== undefined ? data.block : data;
    const expect = isObj(data) && data.expectType !== undefined ? data.expectType : undefined;
    const res = validateBlock(block, expect);
    printExtras(res);
    if (res.errors.length) {
      console.error('✗ ' + file + ' — 单块校验发现 ' + res.errors.length + ' 个问题:');
      for (const e of res.errors) console.error('  · ' + e);
      process.exit(1);
    }
    console.log('✓ ' + file + ' — 合法 block（type=' + (block && block.type) + '）');
    process.exit(0);
  }

  const res = validateDoc(data);
  printExtras(res);
  if (res.errors.length) {
    console.error('✗ ' + file);
    console.error('  发现 ' + res.errors.length + ' 个问题:');
    for (const e of res.errors) console.error('  · ' + e);
    process.exit(1);
  }
  const nBlocks = (data.scenes || []).reduce((s, sc) => s + (sc.blocks ? sc.blocks.length : 0), 0);
  console.log('✓ ' + file);
  console.log('  合法 LectureDoc v1 — ' + data.scenes.length + ' 页 / ' + nBlocks + ' 个 block');
  process.exit(0);
}
