/* 长素材浓缩（LLM pass）：此前 agent.mjs 对 --material 只做 `.slice(0, 4000)` 硬截断——
   长文档超出部分被静默丢弃，后半段事实完全不进 grounding。本模块改为"保事实的浓缩"：
   用 LLM 把长素材压成 ≤targetChars 的摘要，保留定义/公式/数字/关键例子/术语，丢冗余。
   超长素材先分块各自浓缩再合并（map-reduce），避免单次 token 爆炸。
   任何失败都回退到原来的硬截断——保证不比现状差。 */
import { chat } from './llm.mjs';

const CHUNK = 12000;   // 单块上限字符数（分块浓缩阈值）

function truncate(s, n) { return s.length > n ? s.slice(0, n) : s; }

async function condenseOne(text, topic, targetChars) {
  const sys = `你是资深教研，负责把课程素材浓缩成"保事实的摘要"用于备课接地（grounding）。要求：
- 保留所有具体事实：定义、公式、数字、关键例子、专有名词、步骤、因果关系。
- 删除冗余、寒暄、重复表述、与课题无关的枝节。
- 不要评论、不要加"本文介绍了…"这类元话语，直接给浓缩后的知识内容。
- 中文输出，控制在约 ${targetChars} 字以内。只输出摘要正文，不要 JSON、不要标题。`;
  const user = `课题：${topic || '(未指定)'}\n\n素材原文：\n${text}\n\n请浓缩为约 ${targetChars} 字的保事实摘要。`;
  const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { jsonMode: false, temperature: 0.2 });
  return String(out || '').trim();
}

/* material → 浓缩后的字符串（长度大致 ≤ targetChars）。短素材原样返回。 */
export async function condenseMaterial(material, { topic = '', targetChars = 4000, log = () => {} } = {}) {
  const src = String(material || '');
  if (src.length <= targetChars) return src;
  try {
    if (src.length <= CHUNK) {
      log(`[material] 浓缩 ${src.length} 字 → ≤${targetChars} 字（保事实摘要）`);
      const digest = await condenseOne(src, topic, targetChars);
      return digest ? truncate(digest, targetChars + 400) : truncate(src, targetChars);
    }
    // 超长：分块浓缩再合并
    const parts = [];
    for (let i = 0; i < src.length; i += CHUNK) parts.push(src.slice(i, i + CHUNK));
    const per = Math.max(600, Math.floor(targetChars / parts.length));
    log(`[material] 素材 ${src.length} 字 → 分 ${parts.length} 块各浓缩 ~${per} 字再合并`);
    const digests = [];
    for (let i = 0; i < parts.length; i++) {
      try { digests.push(await condenseOne(parts[i], topic, per)); }
      catch (e) { log(`[material] 第 ${i + 1} 块浓缩失败，回退截断: ${String(e.message || e).slice(0, 50)}`); digests.push(truncate(parts[i], per)); }
    }
    const merged = digests.filter(Boolean).join('\n\n');
    // 合并后仍可能偏长：再压一遍到目标
    if (merged.length > targetChars * 1.3) {
      log(`[material] 合并后 ${merged.length} 字，二次浓缩到 ~${targetChars} 字`);
      try { const d2 = await condenseOne(merged, topic, targetChars); return d2 ? truncate(d2, targetChars + 400) : truncate(merged, targetChars); }
      catch { return truncate(merged, targetChars); }
    }
    return merged || truncate(src, targetChars);
  } catch (e) {
    log(`[material] 浓缩失败，回退硬截断: ${String(e.message || e).slice(0, 60)}`);
    return truncate(src, targetChars);
  }
}
