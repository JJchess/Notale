#!/usr/bin/env node
/* lecture-agent CLI —— 自演化讲义生成 agent（Node、零依赖、离线、OpenAI 兼容）。
   子命令: generate | batch | loop | evolve | skills
   ============================================================================ */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { generateLecture } from '../src/agent.mjs';
import { loadSkills } from '../src/skills.mjs';
import { clarify } from '../src/clarify.mjs';
import { runLoop, parseInterval } from '../src/loop.mjs';
import { evolve } from '../src/evolve.mjs';
import { renderVerify } from '../src/pipeline.mjs';
import { evaluateLecture, printEval } from '../src/evaluate.mjs';
import { printCoverage } from '../src/coverage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OUT = join(ROOT, 'out');
const DEMO_GEN = resolve(ROOT, '..', 'demo', 'generated');
const log = (...a) => console.log(...a);

/* --- arg 解析 --- */
const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter(a => !a.startsWith('--'));
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (i >= 0 ? true : d); };
const has = (k) => argv.includes('--' + k);

/* 把生成结果落盘 + 复制到 demo/generated 供 ?doc= 预览 + 打印小结 */
function persist(r, ev) {
  const id = r.doc.id || 'lecture';
  const dir = join(OUT, id); mkdirSync(dir, { recursive: true });
  const file = join(dir, 'course.lecture.json');
  writeFileSync(file, JSON.stringify(r.doc, null, 2));
  if (ev) writeFileSync(join(dir, 'eval.json'), JSON.stringify(ev, null, 2));  // 供 evolve 聚合质量轴
  if (r.coverage) writeFileSync(join(dir, 'coverage.json'), JSON.stringify(r.coverage, null, 2));  // 规划保真度指标
  mkdirSync(DEMO_GEN, { recursive: true });
  const preview = join(DEMO_GEN, id + '.lecture.json');
  writeFileSync(preview, JSON.stringify(r.doc, null, 2));
  log('');
  if (r.dropped?.length) { log('⚠ 丢弃/降级 block:'); for (const d of r.dropped) log('  · ' + d); }
  if (r.errors.length) { log(`✗ 整档仍有 ${r.errors.length} 个校验错误（多为 scene 结构级）:`); for (const e of r.errors) log('  · ' + e); }
  else log(`✓ 整档校验通过 — ${r.doc.scenes.length} 页 / ${r.doc.scenes.reduce((n, s) => n + s.blocks.length, 0)} block`);
  if (r.warnings?.length) log(`（${r.warnings.length} 条非致命提醒）`);
  const rv = renderVerify(file);
  const vlines = rv.out.trim().split('\n');
  const head = vlines[0] || '';
  const passed = vlines.some(l => /结构断言全过/.test(l));
  log('[verify] ' + head + (passed ? ' / ✓ 结构断言全过' : ''));
  // surfacing iter22 的偏空/偏高页提醒——此前只打前 2 行被截掉，作者看不到该改哪页
  for (const l of vlines.filter(l => /·\s*scene#/.test(l) && /(偏空|偏高)/.test(l)))
    log('  ⚠ ' + l.replace(/^\s*·\s*/, ''));
  log(`\n产物: ${file}`);
  log(`预览: python demo/serve.py 后打开  http://127.0.0.1:8778/index.html?doc=generated/${id}.lecture.json`);
  return file;
}

async function cmdGenerate() {
  const topic = positional[0];
  if (!topic) { console.error('用法: lecture-agent generate "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab] [--audience "..."] [--wants sim,quiz] [--id kebab] [--no-clarify]'); process.exit(2); }
  const matFile = flag('material', '');
  let material = '';
  if (matFile && matFile !== true) { if (existsSync(matFile)) material = readFileSync(matFile, 'utf8'); else { console.error('找不到素材文件: ' + matFile); process.exit(2); } }
  let opts = { topic, pages: +flag('pages', 12) || 12, theme: flag('theme', '') === true ? '' : flag('theme', ''), audience: flag('audience', '') === true ? '' : flag('audience', ''), wants: flag('wants', '') === true ? '' : flag('wants', ''), extra: '', coverage: has('coverage'), material };
  if (!has('no-clarify') && process.stdin.isTTY) {
    const c = await clarify(topic);
    opts = { ...opts, pages: c.pages || opts.pages, theme: c.theme || opts.theme, audience: c.audience || opts.audience, wants: c.wants || opts.wants, extra: c.extra || '' };
  }
  if (has('plan-only')) {   // 只审规划：出骨架大纲不 fan-out（低成本查规划质量）
    const pr = await generateLecture({ ...opts, planOnly: true, log });
    log(`\n=== 规划大纲：${pr.doc.title || topic} · ${pr.doc.scenes.length} 页 · theme=${pr.doc.theme} ===`);
    pr.doc.scenes.forEach((s, i) => {
      const types = (s.blocks || []).map(b => b.type + (b.intent ? `(${b.intent})` : '')).join(', ');
      log(`  p${i + 1} [${s.kind}] ${s.headline || s.eyebrow || '(封面/收尾)'}${types ? ' — ' + types : ''}`);
    });
    if (pr.perspectives?.length) log(`\n多视角(${pr.perspectives.length}): ` + pr.perspectives.map(p => p.name || p).join(' · '));
    log(`\n[done] 规划专检 · LLM 调用 ${pr.calls} 次（未生成内容；去掉 --plan-only 走全量）。`);
    return;
  }
  let r = await generateLecture({ ...opts, log });
  let ev = null;
  if (has('revise')) {
    if (opts.coverage && r.coverage && r.coverage.ratio < 0.85 && r.coverage.missing.length && !r.errors.length) {
      // 覆盖驱动 revise：把规划想讲但没落地的必讲点注入，重规划一版，取覆盖度更高者
      const miss = r.coverage.missing.map(m => m.point).join('；');
      log(`\n[revise] 规划保真度 ${Math.round(r.coverage.ratio * 100)}% 偏低，注入 ${r.coverage.missing.length} 个遗漏必讲点重生成…`);
      const r2 = await generateLecture({ ...opts, extra: (opts.extra ? opts.extra + '；' : '') + '补上其中最核心的遗漏点(挑最重要的几个深入讲透,页数有限不必全覆盖)：' + miss, log });
      if ((r2.coverage?.ratio || 0) > r.coverage.ratio && !r2.errors.length) { r = r2; log(`[revise] → 采用第二版（保真度 ${Math.round((r2.coverage.ratio) * 100)}%）`); } else log('[revise] → 保留第一版');
    } else {
      ev = await evaluateLecture(r.doc); log(''); printEval(ev);
      if (ev.overall < 4 && ev.topFix) {
        log('\n[revise] overall<4，按 topFix 重生成一版对比…');
        const r2 = await generateLecture({ ...opts, extra: (opts.extra ? opts.extra + '；' : '') + '特别改进: ' + ev.topFix, log });
        const ev2 = await evaluateLecture(r2.doc); log('[revise] 第二版:'); printEval(ev2);
        if ((ev2.overall || 0) > (ev.overall || 0) && !r2.errors.length) { r = r2; ev = ev2; log('[revise] → 采用第二版'); } else log('[revise] → 保留第一版');
      }
    }
  } else if (has('eval')) { ev = await evaluateLecture(r.doc); }
  // --id 覆盖产物 id（此前被静默忽略）：规范成 kebab-slug，驱动 out/ 目录、预览文件名与 doc.id
  const idFlag = flag('id', '');
  if (idFlag && idFlag !== true) {
    const slug = String(idFlag).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) r.doc.id = slug;
  }
  persist(r, ev);
  if (ev && !has('revise')) { log(''); printEval(ev); }
  if (r.coverage) { log(''); printCoverage(r.coverage); }
  log(`[done] LLM 调用 ${r.calls} 次。`);
}

async function cmdEval() {
  const f = positional[0];
  if (!f || !existsSync(f)) { console.error('用法: lecture-agent eval <course.lecture.json>'); process.exit(2); }
  const doc = JSON.parse(readFileSync(f, 'utf8'));
  printEval(await evaluateLecture(doc));
}

async function cmdBatchOrLoop(once) {
  const file = positional[0] || join(ROOT, 'examples', 'topics.jsonl');
  if (!existsSync(file)) { console.error('找不到题材文件: ' + file); process.exit(2); }
  const everyMs = parseInterval(flag('every', '30m'));
  const doEval = has('eval');
  await runLoop({ file, once, everyMs, log, onDoc: async (r) => { const ev = doEval ? await evaluateLecture(r.doc) : null; persist(r, ev); if (ev) printEval(ev); } });
}

function cmdEvolve() {
  const dirs = positional.length ? positional : [OUT];
  process.stdout.write(evolve(dirs));
}

function cmdSkills() {
  const { skills, registry, autoTypes } = loadSkills();
  log('已加载技能:');
  for (const s of skills) log(`  · ${s.name}${s.types.length ? ' [' + s.types.join(', ') + ']' : '  (元/文档技能)'}`);
  log('\nblock 类型路由:'); for (const [t, r] of registry) log(`  ${t.padEnd(10)} → ${r.skill}`);
  log('\n自动可规划类型: ' + autoTypes.join(', '));
}

const HELP = `lecture-agent —— 自演化讲义生成 agent (Node/零依赖/离线)
  generate "<课题>" [--pages N] [--theme X] [--audience ..] [--wants sim,quiz] [--material file] [--id kebab] [--no-clarify] [--eval] [--revise] [--coverage] [--plan-only]
                                  --material 用源素材做 grounding(内容据素材,防编造)；--eval 打质量分；--revise 分低重生成取优；--coverage 核对必讲点落地；--plan-only 只出规划大纲不生成内容(~2 次调用,审规划质量)
  eval <course.lecture.json>    给一份讲义打质量分 (content/coherence/pedagogy, 移植自 PPTEval)
  batch [topics.jsonl]          批量跑一轮 (缺省 examples/topics.jsonl)
  loop  [topics.jsonl] [--every 1h]   常驻循环
  evolve [dir...]               聚合 freeform/主题/引擎信号 → 提案 (缺省 out/)
  skills                        列出已加载技能与 block 路由`;

(async () => {
  try {
    if (cmd === 'generate') await cmdGenerate();
    else if (cmd === 'eval') await cmdEval();
    else if (cmd === 'batch') await cmdBatchOrLoop(true);
    else if (cmd === 'loop') await cmdBatchOrLoop(false);
    else if (cmd === 'evolve') cmdEvolve();
    else if (cmd === 'skills') cmdSkills();
    else { console.log(HELP); process.exit(cmd ? 1 : 0); }
  } catch (e) { console.error('✗ ' + (e.stack || e.message)); process.exit(1); }
})();
