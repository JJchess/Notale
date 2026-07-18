#!/usr/bin/env node
/* 一致性 meta-test：把散落在 prompt/文档里的"block 类型事实"与 live registry 对齐，
   专防 iter26/iter27 那一类漂移——加了 block 类型却漏改某处文案。
   退出码 0 全过 / 1 有漂移。用法: node tools/check-consistency.mjs  (亦即 npm run check) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSkills } from '../src/skills.mjs';
import { BLOCK_TYPES } from '../../demo/schema/validate.mjs';   // 权威类型清单直接 import，不再正则刮源码（iter39 做薄）
import * as ENUMS from '../../demo/schema/enums.mjs';           // 单一真相源（iter73）：全枚举家族对齐守卫据此展开

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const R = p => readFileSync(resolve(root, p), 'utf8');
const fails = [];

// —— 权威事实：BLOCK_TYPES（validate.mjs，直接 import）与 registry（skills）——
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

// —— Check B 已移除（iter72 解耦）：文档不再硬编码"N 种正式"计数——加 block 类型不必再手改 6 处数字，
//    因此这个"守数字漂移"的检查已无对象。加类型只改：schema enum + validate BLOCK_TYPES（Check C 守其对齐）+ 渲染器 + 契约。
//    禁止回归：docs 里若再出现 "N 种正式" 硬编码计数即视为耦合复辟——下面 Check B' 反向拦截。
let bViol = 0;
for (const f of ['../demo/schema/SPEC.md', '../demo/schema/lecture-doc.schema.json', 'skills/create-freeform/contracts.json']) {
  for (const m of R(f).matchAll(/\d+\s*种正式/g)) { bViol++; fails.push(`${f}: 又出现硬编码计数 "${m[0]}"——正式类型数不该写进散文(耦合)，改为"正式类型"等不带数字的措辞（iter72 解耦）`); }
}

// —— Check C（iter34）：schema JSON 的 block 类型 enum 必须与 validate.mjs 的 BLOCK_TYPES 逐一对齐 ——
// 二者是两份独立的权威清单（校验器手写不读 schema，见零依赖设计）；此前只核对文档"N 种正式"计数，
// 不查 enum 本体——漏改 enum（加了类型却忘同步 schema）不会被发现。这是 iter26/27 那类漂移的最后缺口。
let cChecked = 0;
try {
  const schema = JSON.parse(R('../demo/schema/lecture-doc.schema.json'));
  const schemaEnums = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o.enum)) schemaEnums.push(o.enum); for (const k of Object.keys(o)) walk(o[k]); })(schema);
  const setEq = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  // 对 enums.mjs 每个家族：schema 里须**恰有一个** enum 与其集合相等。
  // 任一侧单边增删都会失配→fail（enums 加了 schema 没加：0 匹配；schema 加了 enums 没加：改动后的 enum 不再等于家族→0 匹配）。
  // quiz kind / layout preset 等不属家族的 enum 自然被忽略。
  for (const [fam, list] of Object.entries(ENUMS)) {
    if (!Array.isArray(list)) continue;
    const hits = schemaEnums.filter(e => setEq(e, list)).length;
    cChecked++;
    if (hits !== 1) fails.push(`Check C′: schema 里与 enums.${fam} 集合相等的 enum 有 ${hits} 处（应恰 1）——两侧漂移了，改了一侧忘了另一侧（enums.mjs ↔ lecture-doc.schema.json）`);
  }
} catch (e) { fails.push('Check C′ 读取/解析 schema 失败: ' + e.message); }

// —— Check D（命名规范 lint · warn 级，渐进法制不阻断）：见 NAMING.md ——
// 不进 fails（不 exit 1）；只提示，让"新命名不合规"尽早暴露。同类复现 ≥2 次再升级为 hard。
const warns = [];
const JARGON = ['marginalia', 'tombstone', 'enfilade', 'object-label', 'objectlabel', 'small-multiples', 'smallmultiples'];
// D1 数据 id 全小写朴素英文（清单由单一真相源派生，iter73——此前是又一份手抄副本）
// grandfather：searchCompare(camelCase) 早于 NAMING、已进语料 sim 数据，改名即破坏——记档豁免（NAMING §1 例外）
const D1_GRANDFATHER = new Set(['searchCompare']);
const dataIds = [...new Set(Object.values(ENUMS).filter(Array.isArray).flat())].filter(id => !D1_GRANDFATHER.has(id));
for (const id of dataIds) if (!/^[a-z][a-z0-9-]*$/.test(id)) warns.push(`数据 id "${id}" 不合规（须全小写 [a-z0-9-]，见 NAMING.md §1）`);
// D2 外来黑话不得作 id（扫 schema enum 与 plan.mjs）
const schemaTxt2 = R('../demo/schema/lecture-doc.schema.json');
for (const j of JARGON) if (new RegExp('"' + j + '"').test(schemaTxt2) || new RegExp("['\"]" + j + "['\"]").test(planSrc))
  warns.push(`外来黑话 "${j}" 疑似被用作 id——应译成本地词（见 NAMING.md §5 词表）`);
// D3 CSS token 家族语法
// serif/sans/mono/bg2/text2 = grandfathered（被 renderer JS + 内容 JSON 引用，改名即破坏，NAMING §4 记为例外）
const TOKEN_OK = /^--(bg|bg2|bg-2|ink|ink-2|text2|accent|accent-ink|line|card|panel|sel|cover-bg|page-bg-image|radius|measure|serif|sans|mono|ff-serif|ff-sans|ff-mono|fs-(caption|body|lead|h2|h1|hero)|sp-([1-6]|gutter|rest|tight))$/;
try {
  const cssTxt = R('../demo/index.html');
  const toks = new Set([...cssTxt.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(m => m[1]));
  for (const t of toks) if (!TOKEN_OK.test(t)) warns.push(`CSS token "${t}" 不合家族语法（见 NAMING.md §4）`);
} catch { /* index.html 不可读则跳过 */ }
// D4 CSS class 缩写
for (const f of ['../demo/index.html', '../demo/doc-to-deck.js']) {
  try { if (/\.(pq|sec|idx|cmp)-[a-z]/.test(R(f))) warns.push(`${f}: 含缩写 class（pq-/sec-/idx-/cmp-），应全词化（见 NAMING.md §4b）`); } catch { /* skip */ }
}

// —— Check E（warn 级）：不能-import 载体（CSS/经典浏览器脚本/教学散文）与 enums 的存在性对齐 ——
// 渲染器对未知值有回落兜底（不崩不丢），故 warn 提醒即可；复现 ≥2 次再升 fail（渐进法制）。
let eChecked = 0;
try {
  const css = R('../demo/index.html'), deck = R('../demo/doc-to-deck.js');
  for (const t of ENUMS.THEMES) { eChecked++; if (!css.includes(`data-theme="${t}"`) ) warns.push(`Check E: 主题 "${t}" 在 index.html 无 [data-theme] token 块（加了枚举忘落 CSS？）`); }
  for (const k of ENUMS.LAYOUT_KINDS) { eChecked++; if (!new RegExp(`\\b${k}\\(scene`).test(deck)) warns.push(`Check E: 版式 "${k}" 在 doc-to-deck.js 无 sceneLayouts 方法（渲染会回落 flow）`); }
  for (const b of ENUMS.BLOCK_TYPES) { eChecked++; if (!new RegExp(`\\b${b}\\s*\\(b`).test(deck)) warns.push(`Check E: block "${b}" 在 doc-to-deck.js 疑似无渲染分支（regex 尽力，误报请调 Check E）`); }
  for (const t of ENUMS.THEMES) { eChecked++; if (!planSrc.includes(t)) warns.push(`Check E: 主题 "${t}" 未出现在 plan.mjs 教学散文（加了主题忘教规划器——iter61 之坑）`); }
} catch (e) { warns.push('Check E 读取失败: ' + e.message); }

// —— 报告 ——
console.log(`registry: ${BLOCK_TYPES.length} 种 block（含 freeform），正式 ${formalCount} 种；注册家族类型 ${registered.length} 个`);
console.log(`Check A（plan.mjs 禁用清单 vs 注册类型）· Check B'（禁硬编码计数，命中 ${bViol}）· Check C′（schema ≡ enums 全家族 ×${cChecked}）· Check D（命名 lint）· Check E（CSS/渲染器/散文存在性 ×${eChecked}·warn）`);
if (warns.length) { console.warn(`⚠ 命名 lint：${warns.length} 处待规整（warn，不阻断；见 NAMING.md）`); for (const w of warns) console.warn('  · ' + w); }
if (fails.length) { console.error('✗ 一致性检查发现 ' + fails.length + ' 处漂移:'); for (const x of fails) console.error('  · ' + x); process.exit(1); }
console.log('✓ 一致性检查全过（block 类型事实与 registry 对齐）。');
