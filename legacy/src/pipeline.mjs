/* 确定性管道封装：校验（可 import）+ 渲染验收（shell）。
   单一事实源仍是 demo/schema/；独立发布本 agent 时把这几个文件 vendored 进来即可。 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export { validateDoc, validateBlock } from '../../demo/schema/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '..', '..', 'demo', 'schema');

/** 结构渲染验收（结构断言 + 溢出启发式；真实浏览器渲染仍需人工/无头浏览器）。 */
export function renderVerify(file) {
  try { return { ok: true, out: execFileSync('node', [resolve(SCHEMA, 'render-verify.mjs'), file], { encoding: 'utf8' }) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || e.message || '') }; }
}
