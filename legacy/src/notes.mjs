/* 讲者备注增强（一次 LLM 调用）：规划器出的 notes 往往是"总结要点"式一句话占位；
   本 SPEC 主张"正文克制、细节沉 notes"，故用一遍专门调用把每页 notes 补成有料的讲者稿
   （展开/推导/直觉 + 常见误区 + 数据诚实说明 + 承上启下）。失败则保留原 notes。 */
import { chat, parseJson } from './llm.mjs';
import { summarize } from './evaluate.mjs';

export async function enrichNotes(doc, { audience = '' } = {}) {
  const scenes = doc.scenes || [];
  if (!scenes.length) return doc;
  const sys = `你是资深讲者。给定一节讲义的大纲，为**每一页**写详实的"讲者备注"（讲稿），2-4 句：展开该页关键点的解释/推导/直觉，点出学生常见误区，必要时给数据的诚实说明，并做承上启下的衔接。备注是给老师看的、可以详细；但不要照抄页面正文，要补正文没细说的深度。${audience ? '受众：' + audience + '，措辞与深度匹配。' : ''}
只输出 JSON：{ "notes": ["第1页备注", "第2页备注", …] }，数组长度必须等于页数、顺序对齐。`;
  const list = scenes.map((s, i) => `p${i + 1} [${s.kind}] ${s.headline || s.eyebrow || '(封面/收尾)'} — 块: ${(s.blocks || []).map(b => b.type).join(',')}`).join('\n');
  const user = `讲义标题：${doc.title}\n页数：${scenes.length}\n\n各页：\n${list}\n\n为这 ${scenes.length} 页各写一条讲者备注。`;
  try {
    const r = parseJson(await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4, purpose: 'notes' }));
    const notes = Array.isArray(r.notes) ? r.notes : null;
    if (notes && notes.length === scenes.length) {
      scenes.forEach((s, i) => { if (typeof notes[i] === 'string' && notes[i].trim().length > (s.notes || '').length) s.notes = notes[i].trim(); });
    }
  } catch { /* 保留原 notes */ }
  return doc;
}
