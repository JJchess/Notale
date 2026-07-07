/* 覆盖度审查（完成 STORM 闭环）：规划阶段多视角提炼出"必讲要点"(mustCover)，这里核对它们
   是否真的落进了成品讲义——把"计划覆盖"与"实际内容"对上，产出可度量的规划保真度指标。
   一次 LLM 调用，opt-in（generate --coverage）。来源思想同 src/plan.mjs（STORM）。 */
import { chat, parseJson } from './llm.mjs';
import { summarize } from './evaluate.mjs';

/** 给定 doc + 规划期 perspectives，返回 { total, covered, missing:[{point,why}], ratio } 或 null（无 mustCover）。 */
export async function checkCoverage(doc, perspectives) {
  const must = [...new Set((perspectives || []).flatMap(p => p.mustCover || []))].filter(Boolean);
  if (!must.length) return null;
  const sys = `你是讲义覆盖度审查。给定一节讲义的大纲 + 规划阶段列出的"必讲要点"清单，逐点判断该要点是否在讲义里被**充分覆盖**（不只是提一句）。只输出 JSON：
{ "covered": ["已充分覆盖的要点(原文)"], "missing": [{"point":"缺失或只浅尝的要点","why":"缺在哪/为何不够"}] }`;
  const user = `必讲要点（共 ${must.length}）：\n${must.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n讲义大纲：\n${summarize(doc)}`;
  const r = parseJson(await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.2 }));
  const covered = (r.covered || []).length;
  const missing = Array.isArray(r.missing) ? r.missing : [];
  return { total: must.length, covered, missing, ratio: must.length ? +(covered / must.length).toFixed(2) : 1 };
}

export function printCoverage(cov) {
  if (!cov) { console.log('[coverage] 无多视角 mustCover 可核对（规划回退了单阶段）'); return; }
  console.log(`[coverage] 规划保真度 ${Math.round(cov.ratio * 100)}%（${cov.covered}/${cov.total} 必讲点已充分覆盖）`);
  for (const m of cov.missing) console.log(`  ✗ 缺: ${m.point} — ${m.why}`);
}
