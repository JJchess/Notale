/* 自演化信号聚合的薄封装：复用 skills/evolve-schema/scripts/aggregate.mjs（单一实现）。
   扫一批生成的 LectureDoc → 反复出现的 freeform 诉求/主题/引擎 → 提案（人类 review，agent 不改 schema）。 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const AGG = resolve(here, '..', 'skills', 'evolve-schema', 'scripts', 'aggregate.mjs');

export function evolve(dirs) {
  try { return execFileSync('node', [AGG, ...dirs], { encoding: 'utf8' }); }
  catch (e) { return (e.stdout || '') + (e.stderr || e.message || ''); }
}
