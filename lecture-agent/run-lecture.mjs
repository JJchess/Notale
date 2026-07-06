#!/usr/bin/env node
/* ============================================================================
   run-lecture.mjs —— 独立 mini 编排器（路径 B）：不依赖 Hermes，用硅基流动把一个课题
   端到端生成为一份合法 LectureDoc。复刻 generate-lecture 技能的流程：
     plan(骨架) → 逐 block 并行生成(自校验+自修) → 组装 → 整档校验+自修 → 验收 → 写出
   证明「契约足以驱动全流程」。真正的编排/loop/自演化仍以 Hermes 为归宿；这是可立刻见效的验证。

   用法:
     node lecture-agent/run-lecture.mjs "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab] [--id kebab] [--audience "..."]
   ============================================================================ */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { validateBlock, validateDoc } from '../demo/schema/validate.mjs';
import { chat, parseJson, pool, callCount, MODEL } from './lib/llm.mjs';
import { CONTRACTS, AUTO_BLOCK_TYPES, AUTHORING_RULES } from './lib/contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const topic = args.find(a => !a.startsWith('--'));
if (!topic) { console.error('用法: node lecture-agent/run-lecture.mjs "<课题>" [--pages N] [--theme x] [--id kebab] [--audience "..."]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const pages = +opt('pages', 12);
const themeHint = opt('theme', '');
const audience = opt('audience', '');
let id = opt('id', '');

const CONC = 4;                 // 并发度
const log = (...a) => console.log(...a);

/* ---------- ① Plan：产出骨架（scene 框架 + block 占位 {id,type,intent}） ---------- */
const PLAN_SYS = `你是讲义(LectureDoc)总编排器。只输出一个 JSON 对象(骨架)，不要代码围栏、不要解释。
骨架结构:
{ "id":"kebab-id","title":"...","subtitle":"...(可选)","language":"zh-CN","audience":"...","theme":"cartesian|cobalt-grid|lab",
  "tutor":{"suggestions":["建议问题"],"kb":[{"pattern":"关键词|同义词","answer":"本地应答(inline-md)"}]},
  "scenes":[
    {"id":"cover","kind":"hero","notes":"讲者备注(可详细)","blocks":[{"id":"b_cover","type":"hero","intent":"封面：课程标题+一句副题"}]},
    {"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","notes":"讲者备注","blocks":[{"id":"b1","type":"list","intent":"这一块要讲清什么(一句)"}]},
    {"id":"...","kind":"quiz","headline":"随堂检验","notes":"...","blocks":[{"id":"bq","type":"quiz","intent":"考察点"}]},
    {"id":"recap","kind":"statement","notes":"...","blocks":[{"id":"b_recap","type":"statement","intent":"全课一句话收束"}]},
    {"id":"close","kind":"hero","notes":"...","blocks":[{"id":"b_close","type":"hero","intent":"收尾页"}]}
  ]}
规则:
- 约 ${pages} 页(scenes)；第一页 kind:hero(封面, 恰含一个 hero block)，最后可用 statement 回顾 + hero 收尾。
- scene.kind: hero(封面/收尾, 一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block)。
- 每个 block 是占位 {id(全局唯一), type, intent}。可用 type: ${AUTO_BLOCK_TYPES.join(', ')}。
- 一页通常 1-2 个 block；叙事连贯、由浅入深；把 sim(仿真)放在最能体现的知识点；至少放 1 个 sim 和 1 个 quiz。
- 主题按课程气质选(${themeHint ? '用户指定: ' + themeHint : 'cartesian 克制人文 / cobalt-grid 研究公报 / lab 暗仪表台(仿真多时)'})。
${AUTHORING_RULES}`;

log(`[plan] 课题: ${topic}  (~${pages} 页, model=${MODEL})`);
const planRaw = await chat([{ role: 'system', content: PLAN_SYS },
  { role: 'user', content: `课题: ${topic}${audience ? '\n受众: ' + audience : ''}${themeHint ? '\n主题: ' + themeHint : ''}\n产出骨架 JSON。` }], { temperature: 0.4 });
let doc;
try { doc = parseJson(planRaw); } catch (e) { console.error('骨架解析失败: ' + e.message + '\n' + planRaw.slice(0, 500)); process.exit(1); }
doc.schemaVersion = '1.0';                 // 权威置位，别指望规划器每次都写
if (!doc.language) doc.language = 'zh-CN';
if (themeHint) doc.theme = themeHint;
id = id || doc.id || 'lecture';
doc.id = id;

/* 收集所有 block 占位 */
const placeholders = [];
doc.scenes.forEach((s, si) => (s.blocks || []).forEach((b, bi) => {
  b.id = b.id || `s${si}b${bi}`;
  placeholders.push({ ph: b, scene: s, si, bi });
}));
log(`[plan] ${doc.scenes.length} 页 / ${placeholders.length} block；theme=${doc.theme}`);

const outDir = join(here, 'out', id);
mkdirSync(join(outDir, 'frags'), { recursive: true });
writeFileSync(join(outDir, 'skeleton.json'), JSON.stringify(doc, null, 2));

/* ---------- ② Fan-out：逐 block 生成(自校验 + 一次自修) ---------- */
const BLOCK_SYS = `你是 LectureDoc 单个 block 生成器。只输出**一个** block 的 JSON 对象，不要代码围栏、不要解释。
${AUTHORING_RULES}`;

async function genBlock({ ph, scene }) {
  const contract = CONTRACTS[ph.type];
  if (!contract) return { ...ph, block: null, err: '未知 type ' + ph.type };
  const ctx = `所在页: ${scene.headline || scene.eyebrow || scene.kind}。本 block 教学意图: ${ph.intent}。`;
  let messages = [{ role: 'system', content: BLOCK_SYS },
    { role: 'user', content: `生成一个 ${ph.type} block。\n契约:\n${contract}\n\n${ctx}\n只输出该 block 的 JSON。` }];
  for (let round = 1; round <= 2; round++) {
    let block;
    try { block = parseJson(await chat(messages, { temperature: 0.3 })); }
    catch (e) { if (round === 2) return { ...ph, block: null, err: 'JSON 解析失败' }; continue; }
    block.type = ph.type;                                   // 钉死类型，防漂移
    const res = validateBlock(block, ph.type);
    if (!res.errors.length) return { ...ph, block, warns: res.warnings };
    if (round === 2) return { ...ph, block: null, err: res.errors.join('; ') };
    messages.push({ role: 'assistant', content: JSON.stringify(block) });
    messages.push({ role: 'user', content: `校验未通过:\n${res.errors.join('\n')}\n修正后只重新输出该 block JSON。` });
  }
}

log(`[fan-out] 并行生成 ${placeholders.length} 个 block (并发 ${CONC})…`);
const results = await pool(placeholders, CONC, async (item) => {
  const r = await genBlock(item);
  log(`  ${r.err ? '✗' : '✓'} ${item.ph.id} (${item.ph.type})${r.err ? ' — ' + r.err.slice(0, 80) : ''}`);
  writeFileSync(join(outDir, 'frags', item.ph.id + '.json'), JSON.stringify(r.block ?? { _failed: r.err }, null, 2));
  return r;
});

/* ---------- ③ Assemble：占位 → 生成块（失败块诚实丢弃/降级并报告） ---------- */
const byId = new Map();
for (const r of results) { if (r && r.id) byId.set(r.id, r); }   // genBlock 展开了 ...ph，故 r.id 即 block id
const dropped = [];
for (const s of doc.scenes) {
  const kept = [];
  for (const ph of s.blocks) {
    const r = byId.get(ph.id);
    if (r && r.block) kept.push(r.block);
    else dropped.push(ph.id + '(' + ph.type + '): ' + (r ? r.err : '缺失'));
  }
  /* 若整页被清空，放一个透明占位 callout（不编造内容，只标"待补"） */
  if (!kept.length) kept.push({ type: 'callout', label: '待补', text: '本页 block 生成失败，需重跑（' + (s.blocks[0] ? s.blocks[0].intent : '') + '）' });
  s.blocks = kept;
}

/* ---------- ④ 整档校验 + 结构自修（≤2 轮，按路径把 block 级错误回炉） ---------- */
async function docRepair(rounds = 2) {
  for (let round = 1; round <= rounds; round++) {
    const res = validateDoc(doc);
    if (!res.errors.length) return res;
    log(`[repair] 第 ${round} 轮整档校验: ${res.errors.length} 错`);
    const blockErr = res.errors.filter(e => /\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]/.test(e));
    if (!blockErr.length) return res;                       // 剩结构性错(scene 级)：交报告，不硬修
    /* 把每个出错 block 连同错误回炉重生成一次 */
    const targets = new Map();
    for (const e of blockErr) { const m = e.match(/\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]/); const k = m[1] + ',' + m[2]; (targets.get(k) || targets.set(k, []).get(k)).push(e); }
    await pool([...targets.entries()], CONC, async ([k, errs]) => {
      const [si, bi] = k.split(',').map(Number);
      const cur = doc.scenes[si].blocks[bi]; const type = cur.type;
      const contract = CONTRACTS[type]; if (!contract) return;
      const msgs = [{ role: 'system', content: BLOCK_SYS },
        { role: 'user', content: `重写这个 ${type} block 以修正校验错误。\n契约:\n${contract}\n当前(有错):\n${JSON.stringify(cur)}\n错误:\n${errs.join('\n')}\n只输出修正后的 block JSON。` }];
      try { const nb = parseJson(await chat(msgs, { temperature: 0.2 })); nb.type = type;
        if (!validateBlock(nb, type).errors.length) { doc.scenes[si].blocks[bi] = nb; log(`  ↻ 修好 scenes[${si}].blocks[${bi}] (${type})`); }
      } catch { /* 保留原样，下一轮或报告 */ }
    });
  }
  return validateDoc(doc);
}
const finalRes = await docRepair();

/* ---------- ⑤ 写出 + 验收 ---------- */
const outFile = join(outDir, 'course.lecture.json');
writeFileSync(outFile, JSON.stringify(doc, null, 2));
/* 顺手放一份到 demo/generated/ 供浏览器预览：index.html?doc=generated/<id>.lecture.json（不覆盖手写基线） */
let previewUrl = '';
try {
  const gdir = resolve(here, '../demo/generated'); mkdirSync(gdir, { recursive: true });
  writeFileSync(join(gdir, id + '.lecture.json'), JSON.stringify(doc, null, 2));
  previewUrl = `http://127.0.0.1:8778/index.html?doc=generated/${id}.lecture.json`;
} catch { /* 忽略：out/ 里的那份仍在 */ }
log('');
if (dropped.length) { log('⚠ 丢弃/降级的 block:'); for (const d of dropped) log('  · ' + d); }
if (finalRes.errors.length) {
  log(`✗ 整档仍有 ${finalRes.errors.length} 个校验错误（多为 scene 结构级，需人工看）:`);
  for (const e of finalRes.errors) log('  · ' + e);
} else {
  log(`✓ 整档校验通过 — ${doc.scenes.length} 页 / ${doc.scenes.reduce((n, s) => n + s.blocks.length, 0)} block`);
}
if (finalRes.warnings.length) log(`（${finalRes.warnings.length} 条非致命提醒）`);
log('[verify] render-verify:');
try { log(execFileSync('node', [resolve(here, '../demo/schema/render-verify.mjs'), outFile], { encoding: 'utf8' })); } catch (e) { log(e.stdout || e.message); }
log(`\n[done] LLM 调用 ${callCount()} 次。产物: ${outFile}`);
if (previewUrl) log(`预览: python demo/serve.py 后打开  ${previewUrl}`);
process.exit(finalRes.errors.length ? 1 : 0);
