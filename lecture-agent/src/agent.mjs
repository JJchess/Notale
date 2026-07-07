/* 编排核心：plan → fan-out(逐块生成+自校验+自修) → 组装 → 整档校验+自修 → 返回 doc。
   Hermes 蓝图的最小落地：确定性骨架 + 每节点 LLM 智能 + 自修环。契约全部从 skills 注册表取（加文件夹=加能力）。 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { callCount } from './llm.mjs';
import { loadSkills, AUTHORING_RULES } from './skills.mjs';
import { generateBlock, pool } from './delegate.mjs';
import { validateDoc } from './pipeline.mjs';
import { planLecture } from './plan.mjs';
import { checkCoverage } from './coverage.mjs';
import { enrichNotes } from './notes.mjs';

const CONC = 4;

async function docRepair(doc, registry, log, material = '', rounds = 2) {
  for (let round = 1; round <= rounds; round++) {
    const res = validateDoc(doc);
    if (!res.errors.length) return res;
    const blockErr = res.errors.filter(e => /\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]/.test(e));
    if (!blockErr.length) return res;                       // 剩 scene 级结构错：交报告，不硬修
    log(`[repair] 第 ${round} 轮整档校验: ${res.errors.length} 错，回炉 ${blockErr.length} 处 block 级`);
    const targets = new Map();
    for (const e of blockErr) { const m = e.match(/\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]/); const k = m[1] + ',' + m[2]; (targets.get(k) || targets.set(k, []).get(k)).push(e); }
    await pool([...targets.entries()], CONC, async ([k, errs]) => {
      const [si, bi] = k.split(',').map(Number);
      const cur = doc.scenes[si].blocks[bi]; const reg = registry.get(cur.type); if (!reg) return;
      const r = await generateBlock({ type: cur.type, intent: '修正下述校验错误：' + errs.join('；'), sceneCtx: `当前(有错): ${JSON.stringify(cur)}`, contract: reg.contract, material });
      if (r.block) { doc.scenes[si].blocks[bi] = r.block; log(`  ↻ 修好 scenes[${si}].blocks[${bi}] (${cur.type})`); }
    });
  }
  return validateDoc(doc);
}

/** 生成一节课。返回 { doc, errors, warnings, dropped, calls, outFile }。 */
export async function generateLecture({ topic, pages = 12, theme = '', audience = '', wants = '', extra = '', material = '', outDir, coverage = false, log = () => {} }) {
  const { registry, autoTypes } = loadSkills();
  const mat = material ? String(material).slice(0, 4000) : '';   // 截断防 token 爆炸（素材过长时只取前段）
  if (material && material.length > 4000) log(`[material] 素材 ${material.length} 字，截断到 4000 字用于 grounding`);

  // ① Plan（STORM 式多视角规划，见 src/plan.mjs）
  log(`[plan] 课题: ${topic} (~${pages} 页)${mat ? ' · 基于素材' : ''}`);
  let doc, perspectives;
  try { ({ doc, perspectives } = await planLecture({ topic, pages, theme, audience, wants, extra, material: mat, autoTypes, authoringRules: AUTHORING_RULES, log })); }
  catch (e) { throw new Error('骨架解析失败: ' + e.message); }
  doc.schemaVersion = '1.0';
  if (!doc.language) doc.language = 'zh-CN';
  if (theme) doc.theme = theme;
  doc.id = doc.id || 'lecture';

  const placeholders = [];
  doc.scenes.forEach((s, si) => (s.blocks || []).forEach((b, bi) => {
    b.id = b.id || `s${si}b${bi}`;
    if (!registry.has(b.type)) { log(`[plan] 规划器造了未知 type "${b.type}"，回退为 list（内容不丢）`); b.type = 'list'; }  // 防幻觉类型丢内容
    placeholders.push({ ph: b, scene: s });
  }));
  log(`[plan] ${doc.scenes.length} 页 / ${placeholders.length} block；theme=${doc.theme}`);

  if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, 'skeleton.json'), JSON.stringify(doc, null, 2)); }

  // ② Fan-out
  log(`[fan-out] 并行生成 ${placeholders.length} 个 block (并发 ${CONC})…`);
  const results = await pool(placeholders, CONC, async ({ ph, scene }) => {
    const reg = registry.get(ph.type);
    if (!reg) { log(`  ✗ ${ph.id} — 没有技能处理 type ${ph.type}`); return { id: ph.id, block: null, err: '无技能处理 type ' + ph.type }; }
    const r = await generateBlock({ type: ph.type, intent: ph.intent || '', sceneCtx: `所在页: ${scene.headline || scene.eyebrow || scene.kind}`, contract: reg.contract, material: mat });
    log(`  ${r.err ? '✗' : '✓'} ${ph.id} (${ph.type})${r.err ? ' — ' + r.err.slice(0, 70) : ''}`);
    return { id: ph.id, ...r };
  });

  // ③ Assemble
  const byId = new Map(); for (const r of results) if (r && r.id) byId.set(r.id, r);
  const dropped = [];
  for (const s of doc.scenes) {
    const kept = [];
    for (const ph of s.blocks) { const r = byId.get(ph.id); if (r && r.block) kept.push(r.block); else dropped.push(`${ph.id}(${ph.type}): ${r ? r.err : '缺失'}`); }
    if (!kept.length) kept.push({ type: 'callout', label: '待补', text: '本页 block 生成失败，需重跑' });
    s.blocks = kept;
  }

  // ④ 整档校验 + 结构自修
  const finalRes = await docRepair(doc, registry, log, mat);

  // ④.5 讲者备注增强（正文克制、细节沉 notes；一次调用把占位式 notes 补成有料讲稿）
  if (!finalRes.errors.length) { try { await enrichNotes(doc, { audience }); log('[notes] 讲者备注已增强'); } catch { /* 保留原 notes */ } }

  // ⑤ 覆盖度审查（opt-in，完成 STORM 闭环）
  let cov = null;
  if (coverage && perspectives?.length && !finalRes.errors.length) {
    try { cov = await checkCoverage(doc, perspectives); } catch (e) { log('[coverage] 审查失败: ' + String(e.message || e).slice(0, 60)); }
  }

  // ⑥ 写出
  let outFile = '';
  if (outDir) { outFile = join(outDir, 'course.lecture.json'); writeFileSync(outFile, JSON.stringify(doc, null, 2)); }
  return { doc, errors: finalRes.errors, warnings: finalRes.warnings, dropped, calls: callCount(), outFile, perspectives, coverage: cov };
}
