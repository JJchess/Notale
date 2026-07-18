#!/usr/bin/env node
/* lecture-agent CLI —— 自演化讲义生成 agent（Node、零依赖、离线、OpenAI 兼容）。
   子命令: generate | batch | loop | evolve | skills
   ============================================================================ */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { generateLecture } from '../src/agent.mjs';
import { MODEL } from '../src/llm.mjs';
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
/* log 同时缓冲成文本，供 per-run 日志落盘（终端输出关掉就没了，日志文件留档供逐步优化） */
const runLogLines = [];
const log = (...a) => { runLogLines.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); console.log(...a); };

/* 写 per-run 详细日志：结构化 JSON（按用途聚合 LLM 调用/耗时/重试/token + 时序/校验/丢弃/eval/覆盖/渲染提醒）
   + 原始文本日志，落 out/<id>/runs/<时间戳>.{json,log}（保留历史不覆盖）+ latest.json 便于取最近一轮。
   三大用途：效果(errors/dropped/renderWarnings/eval/coverage) · 流程(byPurpose/dropped) · 耗时(timing + llm.detail 每调用 ms/重试)。 */
function writeRunLog({ r, ev = null, topic = '', renderWarnings = [] }) {
  try {
    const id = (r.doc && r.doc.id) || 'lecture';
    const dir = join(OUT, id, 'runs'); mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cl = r.callLog || [];
    const byPurpose = {};
    let retries = 0;
    for (const c of cl) {
      const k = c.purpose || 'chat';
      const b = byPurpose[k] || (byPurpose[k] = { n: 0, ms: 0, attempts: 0, fails: 0, promptTokens: 0, completionTokens: 0 });
      b.n++; b.ms += c.ms || 0; b.attempts += c.attempts || 1; if (!c.ok) b.fails++;
      b.promptTokens += c.promptTokens || 0; b.completionTokens += c.completionTokens || 0;
      if ((c.attempts || 1) > 1) retries += (c.attempts || 1) - 1;
    }
    const sum = (f) => cl.reduce((n, c) => n + (f(c) || 0), 0);
    const record = {
      ts: new Date().toISOString(), topic, id, planOnly: !!r.planOnly, model: MODEL,
      pages: r.doc && r.doc.scenes ? r.doc.scenes.length : undefined, theme: r.doc && r.doc.theme,
      blocks: r.doc && r.doc.scenes ? r.doc.scenes.reduce((n, s) => n + ((s.blocks && s.blocks.length) || 0), 0) : undefined,
      ok: !(r.errors && r.errors.length),
      errors: r.errors || [], warnings: (r.warnings || []).length, dropped: r.dropped || [],
      timing: r.timing || {},
      llm: {
        attempts: r.calls, logicalCalls: cl.length, retries,
        totalCallMs: sum(c => c.ms), completionTokens: sum(c => c.completionTokens), promptTokens: sum(c => c.promptTokens),
        byPurpose, detail: cl,
      },
      renderWarnings,
      eval: ev || null, coverage: r.coverage || null,
    };
    writeFileSync(join(dir, stamp + '.json'), JSON.stringify(record, null, 2));
    writeFileSync(join(dir, stamp + '.log'), runLogLines.join('\n') + '\n');
    writeFileSync(join(dir, 'latest.json'), JSON.stringify(record, null, 2));
    log(`[log] 运行日志 → out/${id}/runs/${stamp}.json（+ .log 原始输出 · latest.json 最近一轮）`);
    const slow = [...cl].filter(c => c.ok).sort((a, b) => b.ms - a.ms)[0];
    if (slow) log(`[log] 最慢调用 ${slow.purpose} ${(slow.ms / 1000).toFixed(1)}s（${slow.attempts} 试）· 总重试 ${retries} 次 · 生成 token ${record.llm.completionTokens || '?'}`);
    const u = scanUsage();                                   // 累计（含本轮，刚写的文件也扫进来）
    const cum = u.reduce((n, r) => n + r.tokens, 0);
    log(`[log] 累计 token（${u.length} 轮）合计 ${cum.toLocaleString()}（本轮 ${((record.llm.promptTokens || 0) + (record.llm.completionTokens || 0)).toLocaleString()}）· 明细见 \`lecture-agent tokens\``);
  } catch (e) { log('[log] 写运行日志失败（不影响产物）: ' + String(e.message || e).slice(0, 80)); }
}

/* 扫所有历史 run 日志汇总 token（累计花费——只按 token，不折算钱）。
   每轮的 runs/<时间戳>.json 就是账本；跳过 latest.json（它是最近一轮的副本，扫了会重复计）。 */
function scanUsage() {
  const rows = [];
  let ids = [];
  try { ids = readdirSync(OUT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return rows; }
  for (const id of ids) {
    let files = [];
    try { files = readdirSync(join(OUT, id, 'runs')).filter(f => f.endsWith('.json') && f !== 'latest.json'); } catch { continue; }
    for (const f of files) {
      try {
        const rec = JSON.parse(readFileSync(join(OUT, id, 'runs', f), 'utf8'));
        const pt = rec.llm?.promptTokens || 0, ct = rec.llm?.completionTokens || 0;
        rows.push({ ts: rec.ts || '', id, topic: rec.topic || '', model: rec.model || '', planOnly: !!rec.planOnly,
          calls: rec.llm?.logicalCalls || 0, attempts: rec.llm?.attempts || 0, retries: rec.llm?.retries || 0,
          promptTokens: pt, completionTokens: ct, tokens: pt + ct });
      } catch { /* 损坏文件跳过 */ }
    }
  }
  rows.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  return rows;
}

/* --- arg 解析 --- */
const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter(a => !a.startsWith('--'));
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (i >= 0 ? true : d); };
const has = (k) => argv.includes('--' + k);

/* 把生成结果落盘 + 复制到 demo/generated 供 ?doc= 预览 + 打印小结 */
function persist(r, ev, topic = '') {
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
  const renderWarnings = vlines.filter(l => /·\s*scene#/.test(l) && /(偏空|偏高)/.test(l)).map(l => l.replace(/^\s*·\s*/, ''));
  for (const l of renderWarnings) log('  ⚠ ' + l);
  log(`\n产物: ${file}`);
  log(`预览: python demo/serve.py 后打开  http://127.0.0.1:8778/index.html?doc=generated/${id}.lecture.json`);
  log(`验证: (在 lecture-agent/) npm run render-check -- --doc generated/${id}.lecture.json   # 真浏览器查溢出/公式裁切/文本损坏，离线结构断言看不出的问题`);
  writeRunLog({ r, ev, topic, renderWarnings });
  return file;
}

async function cmdGenerate() {
  const topic = positional[0];
  if (!topic) { console.error('用法: lecture-agent generate "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab] [--audience "..."] [--wants sim,quiz] [--id kebab] [--no-clarify] [--live]'); process.exit(2); }
  const matFile = flag('material', '');
  let material = '';
  if (matFile && matFile !== true) { if (existsSync(matFile)) material = readFileSync(matFile, 'utf8'); else { console.error('找不到素材文件: ' + matFile); process.exit(2); } }
  let opts = { topic, pages: +flag('pages', 12) || 12, theme: flag('theme', '') === true ? '' : flag('theme', ''), audience: flag('audience', '') === true ? '' : flag('audience', ''), wants: flag('wants', '') === true ? '' : flag('wants', ''), extra: '', coverage: has('coverage'), material };
  if (!has('no-clarify') && process.stdin.isTTY) {
    const c = await clarify(topic);
    opts = { ...opts, pages: c.pages || opts.pages, theme: c.theme || opts.theme, audience: c.audience || opts.audience, wants: c.wants || opts.wants, extra: c.extra || '' };
  }

  /* --live：起本地 dashboard 服务器，浏览器实时呈现生成阶段 + 页面增量预览。
     onEvent 把每阶段/block 进度广播到所有 SSE 连接 + 更新 /doc 快照；done 后服务器保持，供继续预览成果。 */
  let liveApi = null;
  if (has('live')) {
    const { startLiveServer, openBrowser } = await import('../src/live.mjs');
    const port = +(process.env.LA_LIVE_PORT || 8799);
    liveApi = await startLiveServer({ port, topic: opts.topic, pages: opts.pages });
    log(`[live] Dashboard 已启动 → ${liveApi.url}live.html`);
    openBrowser(liveApi.url + 'live.html');
    opts.onEvent = (evt) => {
      try {
        liveApi.broadcast(evt);
        /* 在 docUpdated/done/skeleton 事件里同步 /doc 快照——dashboard 拉 /doc 做增量渲染的数据源 */
        if (evt.type === 'skeleton' || evt.type === 'done') liveApi.setDoc(evt.doc);
        else if (evt.type === 'docUpdated' && evt.doc) liveApi.setDoc(evt.doc);
        if (evt.type === 'done') liveApi.markDone({ totalS: evt.totalS, calls: evt.calls });
      } catch (e) { /* SSE 故障不该打断生成 */ log('[live] broadcast error: ' + e.message); }
    };
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
    writeRunLog({ r: pr, topic });
    if (liveApi) { log('[live] plan-only 已完成；Dashboard 保持预览，按 Ctrl-C 退出。'); await new Promise(() => {}); }
    return;
  }
  let r = await generateLecture({ ...opts, log });
  let ev = null;
  if (has('revise')) {
    if (opts.coverage && r.coverage && r.coverage.ratio < 0.85 && r.coverage.missing.length && !r.errors.length) {
      // 覆盖驱动 revise：把规划想讲但没落地的必讲点注入，重规划一版，取覆盖度更高者
      const miss = r.coverage.missing.map(m => m.point).join('；');
      log(`\n[revise] 规划保真度 ${Math.round(r.coverage.ratio * 100)}% 偏低，注入 ${r.coverage.missing.length} 个遗漏必讲点重生成…`);
      const r2 = await generateLecture({ ...opts, extra: (opts.extra ? opts.extra + '；' : '') + '补上其中最核心的遗漏点(挑最重要的几个深入讲透,页数有限不必全覆盖)：', log });
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
  persist(r, ev, topic);
  if (ev && !has('revise')) { log(''); printEval(ev); }
  if (r.coverage) { log(''); printCoverage(r.coverage); }
  log(`[done] LLM 调用 ${r.calls} 次。`);
  if (liveApi) {
    log(`\n[live] Dashboard 保持中：${liveApi.url}live.html （继续预览成果，按 Ctrl-C 退出）`);
    await new Promise(() => {});   /* 保持进程不退出，让用户在浏览器继续看 */
  }
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

/* token 累计报表：总量 + 按模型 + 逐轮（累计花费，只按 token）。--by purpose 时再按用途细分。 */
function cmdTokens() {
  const rows = scanUsage();
  if (!rows.length) { log('（还没有带 token 记录的运行日志——跑一次 generate 后再看。老日志若无 token 字段也不计入。）'); return; }
  const fmt = n => n.toLocaleString();
  const tp = rows.reduce((n, r) => n + r.promptTokens, 0);
  const tc = rows.reduce((n, r) => n + r.completionTokens, 0);
  const line = '─'.repeat(72);
  log(`\nToken 累计报表 · ${rows.length} 轮 · 目录 lecture-agent/out/`);
  log(line);
  log(`合计: ${fmt(tp + tc)} tokens  =  输入 ${fmt(tp)} + 输出 ${fmt(tc)}`);
  const attempts = rows.reduce((n, r) => n + r.attempts, 0), retries = rows.reduce((n, r) => n + r.retries, 0);
  log(`调用: ${rows.reduce((n, r) => n + r.calls, 0)} 次逻辑调用 · ${attempts} 次 HTTP 尝试 · ${retries} 次重试`);
  // 按模型
  const byModel = {};
  for (const r of rows) { const m = byModel[r.model] || (byModel[r.model] = { runs: 0, tok: 0 }); m.runs++; m.tok += r.tokens; }
  log(line); log('按模型:');
  for (const [m, v] of Object.entries(byModel).sort((a, b) => b[1].tok - a[1].tok))
    log(`  ${fmt(v.tok).padStart(12)}  ${String(v.runs).padStart(3)} 轮  ${m}`);
  // 逐轮（最近 15）
  log(line); log(`逐轮（最近 ${Math.min(15, rows.length)}）:`);
  for (const r of rows.slice(-15)) {
    const day = (r.ts || '').slice(0, 16).replace('T', ' ');
    log(`  ${day}  ${fmt(r.tokens).padStart(10)}  ${(r.planOnly ? '[plan]' : '      ')} ${r.id}`);
  }
  log(line);
  log('注：只统计 token（未折算金额——单价随账户档位/模型而变，需要时再配单价表）。');
}

const HELP = `lecture-agent —— 自演化讲义生成 agent (Node/零依赖/离线)
  generate "<课题>" [--pages N] [--theme X] [--audience ..] [--wants sim,quiz] [--material file] [--id kebab] [--no-clarify] [--eval] [--revise] [--coverage] [--plan-only] [--live]
                                   --material 用源素材做 grounding(内容据素材,防编造)；--eval 打质量分；--revise 分低重生成取优；--coverage 核对必讲点落地；--plan-only 只出规划大纲不生成内容(~2 次调用,审规划质量)；
                                   --live 启实时 Dashboard（127.0.0.1:8799/live.html）：浏览器同步看生成阶段进度 + 页面增量预览（默认端口；LA_LIVE_PORT 改）
  eval <course.lecture.json>    给一份讲义打质量分 (content/coherence/pedagogy, 移植自 PPTEval)
  batch [topics.jsonl]          批量跑一轮 (缺省 examples/topics.jsonl)
  loop  [topics.jsonl] [--every 1h]   常驻循环
  evolve [dir...]               聚合 freeform/主题/引擎信号 → 提案 (缺省 out/)
  tokens                        累计 token 报表（总量/按模型/逐轮；只算 token 不折算钱）
  skills                        列出已加载技能与 block 路由`;

(async () => {
  try {
    if (cmd === 'generate') await cmdGenerate();
    else if (cmd === 'eval') await cmdEval();
    else if (cmd === 'batch') await cmdBatchOrLoop(true);
    else if (cmd === 'loop') await cmdBatchOrLoop(false);
    else if (cmd === 'evolve') cmdEvolve();
    else if (cmd === 'tokens') cmdTokens();
    else if (cmd === 'skills') cmdSkills();
    else { console.log(HELP); process.exit(cmd ? 1 : 0); }
  } catch (e) { console.error('✗ ' + (e.stack || e.message)); process.exit(1); }
})();
