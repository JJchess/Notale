#!/usr/bin/env node
/* ============================================================================
   sync.mjs — 把权威契约/管道从 demo/schema/ 同步进 lecture-doc-schema 技能
   单一事实源 = demo/schema/。技能里的 references/ 与 scripts/ 是「生成物」，
   改契约请改 demo/schema/ 再 `node lecture-agent/sync.mjs`。这样技能文件夹自包含、可移植，
   又不产生第二处需要手动维护的真相。
   用法:  node lecture-agent/sync.mjs
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const src = join(repo, 'demo', 'schema');
const skill = join(here, 'skills', 'lecture-doc-schema');
const refs = join(skill, 'references');
const scripts = join(skill, 'scripts');
mkdirSync(refs, { recursive: true });
mkdirSync(scripts, { recursive: true });

const BANNER = '/* ⚠ 生成物：由 demo/schema/ 同步而来（node lecture-agent/sync.mjs）。别在这里改，改 demo/schema/。 */\n';

const asRef = ['lecture-doc.schema.json', 'SPEC.md'];
const asScript = ['validate.mjs', 'assemble.mjs', 'render-verify.mjs', 'enums.mjs'];   // enums=单一真相源，validate/render-verify 相对 import 它（iter73）

/* .mjs 用相对 import './validate.mjs'，复制到同目录 scripts/ 后相对关系不变，直接可跑。
   banner 必须插在 shebang 之后（否则 shebang 不在第 1 行会被当成非法 JS）。 */
const injectBanner = (body) => {
  if (body.startsWith('#!')) { const nl = body.indexOf('\n'); return body.slice(0, nl + 1) + BANNER + body.slice(nl + 1); }
  return BANNER + body;
};

// 单一事实源 = demo/schema/。下面一次性算出所有镜像目标的「应有内容」，供写入(默认)或校验(--check)复用。
const targets = [
  ...asRef.map(f => ({ rel: 'references/' + f, abs: join(refs, f), expected: readFileSync(join(src, f), 'utf8') })),
  ...asScript.map(f => ({ rel: 'scripts/' + f, abs: join(scripts, f), expected: injectBanner(readFileSync(join(src, f), 'utf8')) })),
];

const norm = s => s.replace(/\r\n/g, '\n');   // 抹平 git autocrlf 差异，只比实质内容

if (process.argv.includes('--check')) {
  const drift = [];
  for (const t of targets) {
    let cur;
    try { cur = readFileSync(t.abs, 'utf8'); } catch { drift.push(t.rel + '（镜像缺失）'); continue; }
    if (norm(cur) !== norm(t.expected)) drift.push(t.rel + '（与 demo/schema 源不一致）');
  }
  if (drift.length) {
    console.error('✗ 技能镜像已过期，请运行 `node lecture-agent/sync.mjs` 重新同步：');
    drift.forEach(d => console.error('  · ' + d));
    process.exit(1);
  }
  console.log('✓ 技能镜像与 demo/schema 源一致（' + targets.length + ' 个文件）');
} else {
  for (const t of targets) { writeFileSync(t.abs, t.expected); console.log('  ' + t.rel); }
  console.log('✓ 同步 ' + targets.length + ' 个文件 → ' + skill);
}
