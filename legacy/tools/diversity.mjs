#!/usr/bin/env node
/* 多元度度量：把"讲义是否千篇一律"变成可报告的数字（charter 要求多元度作为验收指标）。
   零依赖、纯离线读 demo/generated/*.lecture.json，不跑 LLM。
   用法: node tools/diversity.mjs [dir]   默认 ../demo/generated
   报告：主题/scene.kind/版式/block 类型分布 + 每份 deck 的版式多样度与"连续同版式"最长串 + 语料单调指标。 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { validateDoc } from '../../demo/schema/validate.mjs';   // 顺带跑校验健康——一条命令看全语料多元度 + 有效性
import { LAYOUT_KINDS } from '../../demo/schema/enums.mjs';     // 单一真相源（iter73）：满分派生、不硬编码

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', process.argv[2] || '../demo/generated');   // 默认 ws2/demo/generated（相对 lecture-agent 根）
const files = readdirSync(dir).filter(f => f.endsWith('.lecture.json') && !f.startsWith('_'));

const layoutOf = s => (s.layout && s.layout.kind) || 'flow';
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const theme = new Map(), sceneKind = new Map(), layout = new Map(), block = new Map();
let contentPages = 0, nonFlowContent = 0, allFlowDecks = 0, totalPages = 0;
let vErr = 0, vWarn = 0; const errDecks = [];   // 校验健康
const perDeck = [];

for (const f of files) {
  let doc; try { doc = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
  try { const vr = validateDoc(doc); vErr += vr.errors.length; vWarn += (vr.warnings || []).length; if (vr.errors.length) errDecks.push(f.replace('.lecture.json', '') + '(' + vr.errors.length + ')'); } catch { /* 校验器不该崩；崩了也别拖垮多元度统计 */ }
  bump(theme, doc.theme || '?');
  const seq = [];                                  // 内容页版式序列（算连续同版式）
  const deckLayouts = new Set();
  for (const s of doc.scenes || []) {
    totalPages++;
    bump(sceneKind, s.kind || '?');
    for (const b of s.blocks || []) if (b && b.type) bump(block, b.type);
    if (s.kind === 'content') {
      const k = layoutOf(s);
      contentPages++; bump(layout, k); deckLayouts.add(k); seq.push(k);
      if (k !== 'flow') nonFlowContent++;
    }
  }
  let maxRun = 0, run = 0, prev = null;
  for (const k of seq) { run = k === prev ? run + 1 : 1; prev = k; if (run > maxRun) maxRun = run; }
  if (seq.length && deckLayouts.size === 1 && deckLayouts.has('flow')) allFlowDecks++;
  perDeck.push({ f: f.replace('.lecture.json', ''), theme: doc.theme, pages: (doc.scenes || []).length, layouts: [...deckLayouts], maxRun });
}

const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '—';
const dist = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ');
const line = '─'.repeat(60);

console.log(`\n多元度报告 · ${files.length} 份 deck · ${totalPages} 页 · 目录 ${process.argv[2] || '../demo/generated'}`);
console.log(line);
console.log('主题分布      ', dist(theme));
console.log('scene.kind    ', dist(sceneKind));
console.log('版式(内容页)  ', dist(layout));
console.log('block 类型    ', dist(block));
console.log(line);
console.log(`结构多元度：内容页 ${contentPages}，非 flow 版式 ${nonFlowContent}（${pct(nonFlowContent, contentPages)}）`);
console.log(`版式种类：语料共用 ${layout.size} 种（${LAYOUT_KINDS.join('/')} 满分 ${LAYOUT_KINDS.length}）`);
console.log(`全 flow 的 deck：${allFlowDecks}/${files.length}（越少越好——这些 deck 每页一个样）`);
const longRun = perDeck.filter(d => d.maxRun >= 5).sort((a, b) => b.maxRun - a.maxRun);
if (longRun.length) {
  console.log(`连续 ≥5 页同版式的 deck（节奏单调）：`);
  for (const d of longRun.slice(0, 8)) console.log(`  · ${d.f}（${d.maxRun} 连）`);
} else console.log('无 deck 连续 ≥5 页同版式。');
console.log(line);
console.log(`校验健康：${vErr} errors · ${vWarn} warnings${errDecks.length ? ' · 有 error 的 deck: ' + errDecks.join(', ') : '（0 err，全部有效）'}`);
console.log('');
