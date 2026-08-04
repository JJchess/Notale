#!/usr/bin/env node
/* ============================================================================
   LectureDoc v1 校验器 · CLI 壳
   用法:  node viewer/schema/validate.mjs [json文件路径]
          缺省校验 viewer/course.lecture.json
   设计给 agent 自修循环用：错误信息带 JSON 路径，读错误→改 JSON→重跑。
   校验逻辑全在 ./validate-core.mjs（浏览器也 import 它）；本文件只做文件读取与退出码，
   并把核里的全部导出原样转出，让 assemble.mjs / render-verify.mjs 的
   `import { validateDoc } from './validate.mjs'` 无需改动继续可用。
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateDoc, validateBlock, isObj } from './validate-core.mjs';

export * from './validate-core.mjs';

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
