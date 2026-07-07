/* 交互澄清（input → clarify → output 的中间段）。零依赖，用内置 readline/promises。
   非交互/batch 场景不调用它（CLI 用 --no-clarify 跳过）。 */
import { createInterface } from 'node:readline/promises';

export async function clarify(topic) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => { const a = (await rl.question(`  ${q}${d ? ` [${d}]` : ''}: `)).trim(); return a || d; };
  console.log(`\n为「${topic}」生成讲义前，先澄清几点（直接回车用默认）：`);
  const audience = await ask('受众 / 深度', '本科生');
  const pages = parseInt(await ask('大约几页', '12'), 10) || 12;
  const wants = await ask('要哪些交互？(sim / quiz / runnable，逗号分隔)', 'sim,quiz');
  const theme = await ask('主题气质？(cartesian / cobalt-grid / lab，留空自动选)', '');
  const extra = await ask('还有别的要求吗？(留空跳过)', '');
  rl.close();
  return { audience, pages, wants, theme, extra };
}
