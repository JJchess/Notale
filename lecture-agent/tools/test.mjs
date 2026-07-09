#!/usr/bin/env node
/* 离线自检套件（无需 LLM / 浏览器）：把此前逐轮手跑的确定性检查合并成一条命令。
   用法: node tools/test.mjs  （亦即 npm test）。退出码 0 全过 / 1 有失败。
   涵盖：① 全部 .mjs 语法(node --check) ② 契约一致性(check-consistency) ③ 基线 doc 合法(validate)
        ④ 基线渲染结构断言(render-verify) ⑤ 每个技能样例块过 validateBlock（加文件夹=加能力的契约自洽）
        ⑥ 技能镜像与 demo/schema 源同步（sync --check，防改契约漏跑 sync）。
   不含：端到端 LLM 生成、真实浏览器渲染（各需外部资源，另行验）。 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { BLOCK_TYPES as BT } from '../../demo/schema/validate.mjs';   // 直接 import 权威类型清单（iter39 做薄，不再正则刮源码）

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const demoSchema = resolve(root, '..', 'demo', 'schema');
let failed = 0;
const run = (label, fn) => {
  try { fn(); console.log('  ✓ ' + label); }
  catch (e) { failed++; console.error('  ✗ ' + label + '\n      ' + String(e.message || e).split('\n').slice(0, 4).join('\n      ')); }
};
const node = (args, cwd = root) => execFileSync('node', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

console.log('① 语法检查（node --check 全部 .mjs）');
const mjs = [];
for (const d of ['src', 'bin', 'tools']) for (const f of readdirSync(join(root, d))) if (f.endsWith('.mjs')) mjs.push(join(d, f));
mjs.push('sync.mjs');
run(`${mjs.length} 个 .mjs 语法`, () => { for (const f of mjs) node(['--check', f]); });

console.log('② 契约一致性（block 类型事实 vs registry）');
run('check-consistency', () => node(['tools/check-consistency.mjs']));

console.log('③ 基线 course.lecture.json 合法');
run('validate baseline', () => node([join(demoSchema, 'validate.mjs'), resolve(demoSchema, '..', 'course.lecture.json')]));

console.log('④ 基线渲染结构断言');
run('render-verify baseline', () => node([join(demoSchema, 'render-verify.mjs'), resolve(demoSchema, '..', 'course.lecture.json')]));

console.log('⑤ 技能契约自洽（contracts.json 合法 JSON 且只声明真实 block 类型）');
const skillsDir = join(root, 'skills');
run('技能契约', () => {
  let n = 0;
  for (const name of readdirSync(skillsDir)) {
    const cf = join(skillsDir, name, 'contracts.json');
    if (!existsSync(cf)) continue;
    const contracts = JSON.parse(readFileSync(cf, 'utf8'));   // 必须合法 JSON
    for (const type of Object.keys(contracts)) {
      if (!BT.includes(type)) throw new Error(`${name}/contracts.json 声明了未知 block 类型: ${type}`);
      n++;
    }
  }
  if (!n) throw new Error('未发现任何技能契约');
});

console.log('⑥ 技能镜像与 demo/schema 源同步（sync --check）');
run('sync 镜像新鲜度', () => node(['sync.mjs', '--check']));

console.log(failed ? `\n✗ 自检失败：${failed} 项` : '\n✓ 全部离线自检通过');
process.exit(failed ? 1 : 0);
