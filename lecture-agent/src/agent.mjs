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
import { condenseMaterial } from './material.mjs';

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
export async function generateLecture({ topic, pages = 12, theme = '', audience = '', wants = '', extra = '', material = '', outDir, coverage = false, planOnly = false, log = () => {} }) {
  const { registry, autoTypes } = loadSkills();
  const _t0 = Date.now(); const _dt = t => ((Date.now() - t) / 1000);   // 秒
  const timing = {};
  // 长素材：保事实浓缩（替代旧的硬截断——超出 4000 字的后半段不再被静默丢弃）；失败自动回退截断
  let _t = Date.now();
  const mat = material ? await condenseMaterial(material, { topic, targetChars: 4000, log }) : '';
  if (material) timing.material = _dt(_t);

  // ① Plan（STORM 式多视角规划，见 src/plan.mjs）
  log(`[plan] 课题: ${topic} (~${pages} 页)${mat ? ' · 基于素材' : ''}`);
  let doc, perspectives, planTiming;
  _t = Date.now();
  try { ({ doc, perspectives, timing: planTiming } = await planLecture({ topic, pages, theme, audience, wants, extra, material: mat, autoTypes, authoringRules: AUTHORING_RULES, log })); }
  catch (e) { throw new Error('骨架解析失败: ' + e.message); }
  timing.plan = _dt(_t); timing.planPerspective = (planTiming?.perspectiveMs || 0) / 1000; timing.planSkeleton = (planTiming?.skeletonMs || 0) / 1000;
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

  // 规划专检：只出骨架不 fan-out（低成本审规划质量，~2 次调用 vs 全量 ~14）
  if (planOnly) {
    timing.total = _dt(_t0);
    log(`[timing] 规划 ${timing.plan.toFixed(1)}s（视角 ${timing.planPerspective.toFixed(1)}s + 骨架 ${timing.planSkeleton.toFixed(1)}s） · 合计 ${timing.total.toFixed(1)}s · LLM ×${callCount()}`);
    return { doc, errors: [], warnings: [], dropped: [], calls: callCount(), outFile: '', perspectives, planOnly: true, timing };
  }

  // ② Fan-out
  log(`[fan-out] 并行生成 ${placeholders.length} 个 block (并发 ${CONC})…`);
  _t = Date.now();
  const results = await pool(placeholders, CONC, async ({ ph, scene }) => {
    const reg = registry.get(ph.type);
    if (!reg) { log(`  ✗ ${ph.id} — 没有技能处理 type ${ph.type}`); return { id: ph.id, block: null, err: '无技能处理 type ' + ph.type }; }
    const r = await generateBlock({ type: ph.type, intent: ph.intent || '', sceneCtx: `所在页: ${scene.headline || scene.eyebrow || scene.kind}`, contract: reg.contract, material: mat });
    log(`  ${r.err ? '✗' : '✓'} ${ph.id} (${ph.type})${r.err ? ' — ' + r.err.slice(0, 70) : ''}`);
    return { id: ph.id, ...r };
  });
  timing.fanout = _dt(_t);

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
  _t = Date.now();
  const finalRes = await docRepair(doc, registry, log, mat);
  timing.repair = _dt(_t);

  // ④.5 讲者备注增强（正文克制、细节沉 notes；一次调用把占位式 notes 补成有料讲稿）
  _t = Date.now();
  if (!finalRes.errors.length) { try { await enrichNotes(doc, { audience }); log('[notes] 讲者备注已增强'); } catch { /* 保留原 notes */ } }
  timing.notes = _dt(_t);

  // ⑤ 覆盖度审查（opt-in，完成 STORM 闭环）
  let cov = null;
  _t = Date.now();
  if (coverage && perspectives?.length && !finalRes.errors.length) {
    try { cov = await checkCoverage(doc, perspectives); } catch (e) { log('[coverage] 审查失败: ' + String(e.message || e).slice(0, 60)); }
    timing.coverage = _dt(_t);
  }

  // ⑥ 写出
  let outFile = '';
  if (outDir) { outFile = join(outDir, 'course.lecture.json'); writeFileSync(outFile, JSON.stringify(doc, null, 2)); }

  // 时间报告（自动记录：以后任何一轮跑生成都白得一份分阶段耗时，无需再单独计时实验）
  timing.total = _dt(_t0);
  const rep = [
    `规划 ${timing.plan.toFixed(1)}s（视角 ${timing.planPerspective.toFixed(1)}s + 骨架 ${timing.planSkeleton.toFixed(1)}s）`,
    `fan-out ${timing.fanout.toFixed(1)}s（${placeholders.length} 块/并发 ${CONC}）`,
    `回炉 ${timing.repair.toFixed(1)}s`,
    `备注 ${timing.notes.toFixed(1)}s`,
    timing.coverage != null ? `覆盖 ${timing.coverage.toFixed(1)}s` : null,
    timing.material != null ? `素材 ${timing.material.toFixed(1)}s` : null,
  ].filter(Boolean).join(' · ');
  log(`[timing] ${rep} · 合计 ${timing.total.toFixed(1)}s · LLM ×${callCount()}`);

  return { doc, errors: finalRes.errors, warnings: finalRes.warnings, dropped, calls: callCount(), outFile, perspectives, coverage: cov, timing };
}
