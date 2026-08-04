#!/usr/bin/env node
/* ============================================================================
   sync.mjs — 把权威契约/管道从 viewer/schema/ 同步进 lecture-doc-schema 技能
   单一事实源 = viewer/schema/。技能里的 references/ 与 scripts/ 是「生成物」，
   改契约请改 viewer/schema/ 再 `node lecture-agent/sync.mjs`。这样技能文件夹自包含、可移植，
   又不产生第二处需要手动维护的真相。
   用法:  node lecture-agent/sync.mjs          写入镜像
          node lecture-agent/sync.mjs --check  只校验是否漂移（CI/收尾用，漂移则 exit 1）
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));      // <repo>/lecture-agent
const repo = resolve(here, '..');
const src = join(repo, 'viewer', 'schema');
const skill = join(here, 'skills', 'lecture-doc-schema');
const refs = join(skill, 'references');
const scripts = join(skill, 'scripts');
mkdirSync(refs, { recursive: true });
mkdirSync(scripts, { recursive: true });

const BANNER = '/* ⚠ 生成物：镜像自 viewer/schema/（单一事实源）。别在这里改，改 viewer/schema/ 后重新同步。 */\n';

const asRef = ['lecture-doc.schema.json', 'SPEC.md'];
// enums=单一真相源，validate/render-verify 相对 import 它（iter73）；
// validate-core=校验器的纯逻辑核（浏览器编辑器也 import 它），validate.mjs 只是它的 CLI 壳 —— 两个都要镜像，
// 否则技能里的 validate.mjs 会 import 到一个不存在的兄弟文件。
const asScript = ['validate.mjs', 'validate-core.mjs', 'assemble.mjs', 'render-verify.mjs', 'enums.mjs'];

/* .mjs 用相对 import './validate.mjs'，复制到同目录 scripts/ 后相对关系不变，直接可跑。
   banner 必须插在 shebang 之后（否则 shebang 不在第 1 行会被当成非法 JS）。 */
const injectBanner = (body) => {
  if (body.startsWith('#!')) { const nl = body.indexOf('\n'); return body.slice(0, nl + 1) + BANNER + body.slice(nl + 1); }
  return BANNER + body;
};

// 单一事实源 = viewer/schema/。下面一次性算出所有镜像目标的「应有内容」，供写入(默认)或校验(--check)复用。
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
    if (norm(cur) !== norm(t.expected)) drift.push(t.rel + '（与 viewer/schema 源不一致）');
  }
  if (drift.length) {
    console.error('✗ 技能镜像已过期，请运行 `node lecture-agent/sync.mjs` 重新同步：');
    drift.forEach(d => console.error('  · ' + d));
    process.exit(1);
  }
  console.log('✓ 技能镜像与 viewer/schema 源一致（' + targets.length + ' 个文件）');
} else {
  for (const t of targets) { writeFileSync(t.abs, t.expected); console.log('  ' + t.rel); }
  console.log('✓ 同步 ' + targets.length + ' 个文件 → ' + skill);
}
