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
const asScript = ['validate.mjs', 'assemble.mjs', 'render-verify.mjs'];

let n = 0;
for (const f of asRef) {
  writeFileSync(join(refs, f), readFileSync(join(src, f)));
  console.log('  refs/' + f); n++;
}
for (const f of asScript) {
  let body = readFileSync(join(src, f), 'utf8');
  /* .mjs 用相对 import './validate.mjs'，复制到同目录 scripts/ 后相对关系不变，直接可跑。
     banner 必须插在 shebang 之后（否则 shebang 不在第 1 行会被当成非法 JS）。 */
  if (body.startsWith('#!')) {
    const nl = body.indexOf('\n');
    body = body.slice(0, nl + 1) + BANNER + body.slice(nl + 1);
  } else {
    body = BANNER + body;
  }
  writeFileSync(join(scripts, f), body);
  console.log('  scripts/' + f); n++;
}
console.log('✓ 同步 ' + n + ' 个文件 → ' + skill);
