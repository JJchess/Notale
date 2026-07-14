#!/usr/bin/env node
/* ⚠ 生成物：由 demo/schema/ 同步而来（node lecture-agent/sync.mjs）。别在这里改，改 demo/schema/。 */
/* ============================================================================
   LectureDoc 渲染验收（Phase 3 生成管道 · 第 6 步 Verify）
   用法:  node render-verify.mjs [file]   （缺省 ../course.lecture.json）

   诚实边界：真正的「0 溢出 / 0 控制台错 / 交互冒烟」需要无头浏览器（Puppeteer/Playwright）
   加载 demo/index.html 逐页量 scrollHeight。本环境离线、无该依赖，故本脚本做**结构断言 + 溢出启发式**，
   并明确标注哪些项未被真正渲染验证。装了无头浏览器后可把 renderCheckHeadless() 接上（见文件末 TODO）。
   退出码: 0 结构断言全过 / 1 结构断言失败
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateDoc } from './validate.mjs';
import * as E from './enums.mjs';   // 单一真相源（iter73 解耦）

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', 'course.lecture.json');

let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ JSON 解析失败: ' + e.message); process.exit(1); }

/* 1) 先过合法性——渲染验收的前提是合法 doc */
const v = validateDoc(doc);
if (v.errors.length) {
  console.error('✗ 未通过 validateDoc（' + v.errors.length + '），渲染验收中止。先修校验错误。');
  for (const e of v.errors) console.error('  · ' + e);
  process.exit(1);
}

/* 2) 结构断言：渲染器 doc-to-deck.js 依赖的不变量（清单取自单一真相源 enums.mjs，iter73 解耦——
   此前是手抄副本，iter57 加 section 时曾静默漏同步） */
const KIND = new Set(E.SCENE_KINDS);
const SIM_ENGINES = new Set(E.SIM_ENGINES);
const fail = [];
const note = [];

doc.scenes.forEach((s, i) => {
  const p = `scene[${i}]${s.id ? '#' + s.id : ''}`;
  if (!KIND.has(s.kind)) fail.push(p + ' — 未知 kind: ' + s.kind);
  walkBlocks(s.blocks || [], p);
});

function walkBlocks(blocks, p) {
  blocks.forEach((b, i) => {
    const bp = `${p}.block[${i}](${b && b.type})`;
    if (b && b.type === 'sim' && !SIM_ENGINES.has(b.engine)) fail.push(bp + ' — 未知 sim engine: ' + b.engine);
    if (b && b.type === 'sim' && b.engine === 'widget' && !(b.html && b.html.length)) fail.push(bp + ' — widget 缺 html');
    if (b && b.type === 'compare') { for (const side of ['left', 'right']) if (b[side] && b[side].block) walkBlocks([b[side].block], bp + '.' + side); }
    if (b && b.type === 'grid' && Array.isArray(b.items)) walkBlocks(b.items.map(it => it.block), bp);
  });
}

/* 3) 溢出启发式（非权威——720 高度的真实占用只有浏览器知道；这里按内容密度粗筛可疑页） */
function densityScore(scene) {
  let n = 0;
  for (const b of scene.blocks || []) {
    if (!b) continue;
    if (b.type === 'list') n += (b.items || []).length;
    else if (b.type === 'agenda') n += (b.rows || []).length;
    else if (b.type === 'table') n += (b.rows || []).length + 1;
    else if (b.type === 'flow') n += Math.ceil((b.nodes || []).length / 2);
    else if (b.type === 'quiz') n += 2 + (b.choices || b.angles || []).length; /* 题干+选项/角度，比 flat +3 更贴实 */
    else n += 3; /* 一个中等块约占若干行 */
  }
  return n;
}
/* 偏空启发式（goal③ 的对称面）：内容太少的页会显空、易“只贴一边”。
   跳过本就该疏朗的 hero/statement，以及被 sim/runnable 这类“满幅交互块”主导的页（低密度分但按设计填满）。 */
const fillByDesign = s => (s.blocks || []).some(b => b && (b.type === 'sim' || b.type === 'runnable'));
for (const s of doc.scenes) {
  const sc = densityScore(s);
  if (sc > 16) note.push(`scene#${s.id || '?'} 密度分 ${sc} 偏高，浏览器里可能溢出（需无头验收确认；按 §5 拆页或精简，别缩字号）`);
  if (sc < 3 && !['hero', 'statement'].includes(s.kind) && !fillByDesign(s))
    note.push(`scene#${s.id || '?'} 密度分 ${sc} 偏低，页面可能偏空（内容少易“只贴一边”；考虑合并邻页/补要点/换更充实的块。渲染器 balanceScene 会纵向居中兜底，但内容本身仍宜充实）`);
}

/* 4) 报告 */
const nBlocks = doc.scenes.reduce((n, sc) => n + (sc.blocks ? sc.blocks.length : 0), 0);
const nWidgets = doc.scenes.reduce((n, sc) => n + (sc.blocks || []).filter(b => b && b.type === 'sim' && b.engine === 'widget').length, 0);
console.log(`结构断言：${doc.scenes.length} 页 / ${nBlocks} block（widget ${nWidgets}）`);
if (note.length) { console.warn('⚠ 溢出启发式提示（非权威）:'); for (const x of note) console.warn('  · ' + x); }

if (fail.length) {
  console.error('✗ 结构断言失败（' + fail.length + '）:');
  for (const x of fail) console.error('  · ' + x);
  process.exit(1);
}
console.log('✓ 结构断言全过。');
console.log('⚠ 未真正渲染验证（需无头浏览器）：每页 scrollHeight≤720 的真实溢出、控制台 0 报错、sim/runnable/quiz 交互冒烟、CodeMirror 光标对齐、离线加载。');
console.log('  → 装了 Puppeteer/Playwright 后接 renderCheckHeadless()（本文件 TODO），或人工在 demo/serve.py 里翻一遍。');
process.exit(0);

/* TODO(headless): 若环境可用无头浏览器，加载 http://localhost:8778/index.html（serve.py），
   逐页 Reveal.slide(i) 后量 slide.querySelector('.pad').scrollHeight，>720 即溢出；
   监听 page 'console'/'pageerror' 收集 0 错误；对 sim/runnable/quiz 触发点击断言 DOM 变化。 */
