#!/usr/bin/env node
/* 一致性 meta-test：把散落在 prompt/文档里的"block 类型事实"与 live registry 对齐，
   专防 iter26/iter27 那一类漂移——加了 block 类型却漏改某处文案。
   退出码 0 全过 / 1 有漂移。用法: node tools/check-consistency.mjs  (亦即 npm run check) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSkills } from '../src/skills.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const R = p => readFileSync(resolve(root, p), 'utf8');
const fails = [];

// —— 权威事实：BLOCK_TYPES（validate.mjs）与 registry（skills）——
const schemaSrc = R('../demo/schema/validate.mjs');
const btMatch = schemaSrc.match(/BLOCK_TYPES\s*=\s*\[([^\]]*)\]/);
const BLOCK_TYPES = btMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
const formalCount = BLOCK_TYPES.filter(t => t !== 'freeform').length;   // 非 freeform 的正式类型数
const { registry } = loadSkills();
const registered = [...registry.keys()];

// —— Check A（iter26 类）：plan.mjs 的"都不存在"禁用清单里不得含任何已注册类型 ——
const planSrc = R('src/plan.mjs');
const forbidden = planSrc.match(/（([^（）]*?)都不存在/);   // 取"（… 都不存在"里的词
if (forbidden) {
  const listed = forbidden[1];
  const wrong = registered.filter(t => new RegExp('\\b' + t + '\\b').test(listed));
  if (wrong.length) fails.push(`plan.mjs 把已注册类型列为"不存在": ${wrong.join(', ')}（应从禁用清单移除）`);
} else fails.push('plan.mjs 未找到"都不存在"禁用清单（结构变了？请核对 Check A 正则）');

// —— Check B（iter27 类）：文档里"N 种正式"的计数须等于 formalCount ——
const docFiles = ['../demo/schema/SPEC.md', '../demo/schema/lecture-doc.schema.json', 'skills/create-freeform/contracts.json'];
let bChecked = 0;
for (const f of docFiles) {
  const txt = R(f);
  for (const m of txt.matchAll(/(\d+)\s*种正式/g)) {
    bChecked++;
    if (+m[1] !== formalCount) fails.push(`${f}: "${m[1]} 种正式" 与 registry 不符（应为 ${formalCount}）`);
  }
}

// —— Check C（iter34）：schema JSON 的 block 类型 enum 必须与 validate.mjs 的 BLOCK_TYPES 逐一对齐 ——
// 二者是两份独立的权威清单（校验器手写不读 schema，见零依赖设计）；此前只核对文档"N 种正式"计数，
// 不查 enum 本体——漏改 enum（加了类型却忘同步 schema）不会被发现。这是 iter26/27 那类漂移的最后缺口。
let cChecked = 0;
try {
  const schema = JSON.parse(R('../demo/schema/lecture-doc.schema.json'));
  const enums = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o.enum) && o.enum.includes('freeform')) enums.push(o.enum); for (const k of Object.keys(o)) walk(o[k]); })(schema);
  if (enums.length !== 1) fails.push(`schema 里含 'freeform' 的 block 类型 enum 应恰好 1 处，实际 ${enums.length} 处（结构变了？请核对 Check C）`);
  else {
    cChecked = 1;
    const schemaSet = new Set(enums[0]), btSet = new Set(BLOCK_TYPES);
    const onlySchema = [...schemaSet].filter(t => !btSet.has(t));
    const onlyBt = [...btSet].filter(t => !schemaSet.has(t));
    if (onlySchema.length) fails.push(`schema enum 有而 BLOCK_TYPES 无: ${onlySchema.join(', ')}（校验器漏加？）`);
    if (onlyBt.length) fails.push(`BLOCK_TYPES 有而 schema enum 无: ${onlyBt.join(', ')}（schema 漏同步？）`);
  }
} catch (e) { fails.push('Check C 读取/解析 schema 失败: ' + e.message); }

// —— 报告 ——
console.log(`registry: ${BLOCK_TYPES.length} 种 block（含 freeform），正式 ${formalCount} 种；注册家族类型 ${registered.length} 个`);
console.log(`Check A（plan.mjs 禁用清单 vs 注册类型）· Check B（文档"N 种正式"计数 ×${bChecked} 处）· Check C（schema enum ≡ BLOCK_TYPES ×${cChecked}）`);
if (fails.length) { console.error('✗ 一致性检查发现 ' + fails.length + ' 处漂移:'); for (const x of fails) console.error('  · ' + x); process.exit(1); }
console.log('✓ 一致性检查全过（block 类型事实与 registry 对齐）。');
