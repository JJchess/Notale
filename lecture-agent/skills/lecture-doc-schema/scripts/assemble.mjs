#!/usr/bin/env node
/* ⚠ 生成物：镜像自 viewer/schema/（单一事实源）。别在这里改，改 viewer/schema/ 后重新同步。 */
/* ============================================================================
   LectureDoc 组装器（Phase 3 生成管道）
   把「骨架 doc（blocks 为 pending 占位）」+「逐 block 片段文件」拼成整份 doc，再过 validateDoc。

   用法:
     node assemble.mjs <skeleton.json> <fragments-dir> [out.json]

   约定（与 generate-lecture 编排器契约一致）:
     - skeleton.json 是一份 LectureDoc，其中待填 block 写成占位: { "id":"b3", "type":"sim", "status":"pending" }
       （已经写好的简单 block 可直接内联在骨架里，status 省略或 "ready"，assemble 原样保留）
     - fragments-dir 下每个待填 block 有一个 <blockId>.json，内容 = 该 block 的完整对象
     - 每个 block 必须有唯一 id（占位与片段靠 id 对应）；组装后 id/status 会剥离（渲染器不需要）
   退出码: 0 组装且校验通过 / 1 校验失败 / 2 组装错误（缺片段等）
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateDoc } from './validate.mjs';

const [, , skeletonArg, fragDirArg, outArg] = process.argv;
if (!skeletonArg || !fragDirArg) {
  console.error('用法: node assemble.mjs <skeleton.json> <fragments-dir> [out.json]');
  process.exit(2);
}
const skeletonPath = resolve(skeletonArg);
const fragDir = resolve(fragDirArg);

let doc;
try { doc = JSON.parse(readFileSync(skeletonPath, 'utf8')); }
catch (e) { console.error('✗ 骨架 JSON 解析失败: ' + e.message); process.exit(2); }

const problems = [];
let filled = 0, inlined = 0;

function resolveBlock(b, path) {
  if (!b || typeof b !== 'object') { problems.push(path + ' — block 不是对象'); return b; }
  const pending = b.status === 'pending';
  if (pending) {
    if (!b.id) { problems.push(path + ' — pending block 缺 id，无法对应片段'); return b; }
    const fp = join(fragDir, b.id + '.json');
    if (!existsSync(fp)) { problems.push(path + ' — 找不到片段文件 ' + b.id + '.json'); return b; }
    let frag;
    try { frag = JSON.parse(readFileSync(fp, 'utf8')); }
    catch (e) { problems.push(path + ' — 片段 ' + b.id + '.json 解析失败: ' + e.message); return b; }
    filled++;
    b = frag;
  } else {
    inlined++;
  }
  /* 递归：compare 的 left/right.block、grid 的 items[].block 也可能是占位 */
  if (b && b.type === 'compare') {
    for (const side of ['left', 'right']) if (b[side] && b[side].block) b[side].block = resolveBlock(b[side].block, path + '.' + side + '.block');
  }
  if (b && b.type === 'grid' && Array.isArray(b.items)) {
    b.items.forEach((it, i) => { if (it && it.block) it.block = resolveBlock(it.block, path + `.items[${i}].block`); });
  }
  /* 剥离管道内部字段（渲染器不需要 id；status 归位为 ready 或删除） */
  if (b && typeof b === 'object') { delete b.id; if (b.status === 'pending') delete b.status; }
  return b;
}

if (Array.isArray(doc.scenes)) {
  doc.scenes.forEach((s, si) => {
    if (Array.isArray(s.blocks)) s.blocks = s.blocks.map((b, bi) => resolveBlock(b, `$.scenes[${si}].blocks[${bi}]`));
  });
}

if (problems.length) {
  console.error('✗ 组装失败（' + problems.length + '）:');
  for (const p of problems) console.error('  · ' + p);
  process.exit(2);
}

const res = validateDoc(doc);
if (res.freeformUses.length) {
  console.warn('⚠ ' + res.freeformUses.length + ' 处 freeform（rationale 汇总，见 SPEC §7 自演化信号）:');
  for (const u of res.freeformUses) console.warn('  · ' + u.path + ' — "' + u.rationale + '"');
}
if (res.warnings.length) {
  console.warn('⚠ ' + res.warnings.length + ' 条提醒（非致命）:');
  for (const w of res.warnings) console.warn('  · ' + w);
}

const nBlocks = doc.scenes.reduce((n, sc) => n + (sc.blocks ? sc.blocks.length : 0), 0);
if (res.errors.length) {
  console.error('✗ 组装完成但校验失败（' + res.errors.length + '）——把这些错误路由回对应 block 子代理自修:');
  for (const e of res.errors) console.error('  · ' + e);
  if (outArg) { writeFileSync(resolve(outArg), JSON.stringify(doc, null, 2)); console.error('（仍写出未通过的 doc 供排查: ' + resolve(outArg) + '）'); }
  process.exit(1);
}

console.log('✓ 组装并校验通过 — ' + doc.scenes.length + ' 页 / ' + nBlocks + ' block（填充 ' + filled + ' / 内联 ' + inlined + '）');
if (outArg) { writeFileSync(resolve(outArg), JSON.stringify(doc, null, 2)); console.log('  写出: ' + resolve(outArg)); }
else console.log(JSON.stringify(doc, null, 2));
process.exit(0);
