/* fan-out 原语：一个"子任务" = 一次聚焦的 LLM 调用（带该 block 家族契约）+ 自校验 + 一次自修。
   这是 Hermes delegate_task 的最小对应物：并行、隔离、只回一个合法 block。 */
import { chat, parseJson, pool } from './llm.mjs';
import { validateBlock } from './pipeline.mjs';
import { AUTHORING_RULES } from './skills.mjs';

export { pool };

const SYS = `你是 LectureDoc 单个 block 生成器。只输出**一个** block 的 JSON 对象，不要代码围栏、不要解释。\n${AUTHORING_RULES}`;

/** 生成并自校验一个 block。{type, intent, sceneCtx, contract, material?} → { block, warns } | { block:null, err }。 */
export async function generateBlock({ type, intent, sceneCtx, contract, material = '' }) {
  const ctx = `${sceneCtx ? sceneCtx + '。' : ''}本 block 教学意图: ${intent}。`;
  const mat = material ? `\n\n参考素材（内容/例子/数据据此，别编造脱离素材的事实）：\n${material}` : '';
  let messages = [
    { role: 'system', content: SYS },
    { role: 'user', content: `生成一个 ${type} block。\n契约:\n${contract}\n\n${ctx}${mat}\n只输出该 block 的 JSON。` },
  ];
  const ROUNDS = 3;                                       // 初次 + 2 次自修
  for (let round = 1; round <= ROUNDS; round++) {
    let raw;
    try { raw = await chat(messages, { temperature: 0.3 }); }
    catch (e) { if (round === ROUNDS) return { block: null, err: 'LLM 调用失败: ' + String(e.message || e).slice(0, 80) }; await new Promise(r => setTimeout(r, 1500)); continue; }
    let block;
    try { block = parseJson(raw); }
    catch (e) { if (round === ROUNDS) return { block: null, err: 'JSON 解析失败' }; continue; }
    block.type = type;                                    // 钉死类型，防漂移
    const res = validateBlock(block, type);
    if (!res.errors.length) return { block, warns: res.warnings };
    if (round === ROUNDS) return { block: null, err: res.errors.join('; ') };
    messages.push({ role: 'assistant', content: JSON.stringify(block) });
    messages.push({ role: 'user', content: `校验未通过:\n${res.errors.join('\n')}\n修正后只重新输出该 block JSON。` });
  }
}
