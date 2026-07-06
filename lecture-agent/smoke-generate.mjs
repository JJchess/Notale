#!/usr/bin/env node
/* ============================================================================
   smoke-generate.mjs —— 端到端冒烟：用真实 LLM（硅基流动）按契约生成一个 block，过 validateBlock，
   不合格则把带路径的错误喂回去自修一次。证明「LLM + 我们的契约 + 校验器 + 自修环」真能闭合，
   无需先装 Hermes。这是**冒烟测试**，不是 Hermes 的替代（真正的编排/并行/loop 仍走 Hermes）。

   用法:  node lecture-agent/smoke-generate.mjs [type] ["intent"]
          type ∈ list | callout | formula | quiz | sim   （默认 list）
   读取 .env 的 SILICONFLOW_API_KEY / SILICONFLOW_BASE_URL。
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateBlock } from '../demo/schema/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
/* 极简 .env 读取（无依赖） */
const env = {};
for (const line of readFileSync(resolve(here, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const KEY = env.SILICONFLOW_API_KEY;
const BASE = env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const MODEL = process.env.SF_MODEL || 'deepseek-ai/DeepSeek-V3';
if (!KEY) { console.error('缺 SILICONFLOW_API_KEY（.env）'); process.exit(2); }

const type = process.argv[2] || 'list';
const intent = process.argv[3] || '解释贝叶斯优化为何比网格搜索省评估预算';

/* 每种 type 的紧凑契约（取自 SPEC/create-* 技能；只给该类型，省 token） */
const CONTRACTS = {
  list: `{ "type":"list", "items":[ {"lead":"衬线强调词(可选)","text":"要点(inline-md: **b**/*em*/\`code\`/$latex$，禁原始 HTML)"} ... 1-12 项 ] }`,
  callout: `{ "type":"callout", "label":"短标签", "text":"一句小结(inline-md)" }`,
  formula: `{ "type":"formula", "latex":"合法 LaTeX，如 \\\\lambda^* = \\\\arg\\\\max_\\\\lambda a(\\\\lambda)", "caption":"可选" }`,
  quiz: `{ "type":"quiz", "kind":"objective", "stem":"题干", "choices":[{"key":"a","text":"..."},{"key":"b","text":"..."},{"key":"c","text":"..."}], "answer":"b", "explain":"解释为什么对+为什么最像的干扰项不对" }`,
  sim: `{ "type":"sim", "engine":"dynamics1d", "params":[{"name":"alpha","label":"α =","min":0,"max":2,"step":0.05,"default":0.9}], "model":{ "stateVar":"c","init":0.05,"steps":40,"update":"受限表达式:仅 params名/consts键/stateVar/xi/数学函数(sin cos exp sqrt...)。如 c + alpha*(T-c)","consts":{"T":1} }, "chart":{"xLabel":"t","yLabel":"c(t)"} }`,
};
const contract = CONTRACTS[type];
if (!contract) { console.error('未知 type: ' + type + '（支持 ' + Object.keys(CONTRACTS).join('/') + '）'); process.exit(2); }

const SYS = '你是 LectureDoc 讲义 block 生成器。只输出**一个** JSON 对象，不要 markdown 代码围栏、不要任何解释文字。中文排版：中文句用全角标点，汉字与拉丁/数字间留空格。正文克制，不写"让我们""值得注意的是"这类 AI 味套话。颜色/字体绝不写死，一律不出现具体色值。';

async function chat(messages) {
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  return d.choices[0].message.content;
}
function parseBlock(txt) {
  let t = txt.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  return JSON.parse(t.slice(i, j + 1));
}

console.log(`[smoke] model=${MODEL}  type=${type}\n[smoke] intent: ${intent}\n`);
const user = `为一节讲义生成一个 ${type} block。教学意图：${intent}。\n严格遵守契约：\n${contract}\n只输出该 JSON 对象。`;
let messages = [{ role: 'system', content: SYS }, { role: 'user', content: user }];

let block, res, round = 0;
for (round = 1; round <= 2; round++) {
  const raw = await chat(messages);
  try { block = parseBlock(raw); }
  catch (e) { console.error('第' + round + '轮 JSON 解析失败: ' + e.message + '\n原文:\n' + raw); process.exit(1); }
  res = validateBlock(block, type);
  console.log(`--- 第 ${round} 轮生成 ---`);
  console.log(JSON.stringify(block, null, 2));
  if (!res.errors.length) { console.log(`\n✓ 第 ${round} 轮即通过 validateBlock（warnings: ${res.warnings.length}）`); break; }
  console.log(`\n✗ 第 ${round} 轮有 ${res.errors.length} 个校验错误:`);
  for (const e of res.errors) console.log('  · ' + e);
  if (round === 2) { console.log('\n(2 轮后仍未通过——真实流程里会继续自修/换块)'); process.exit(1); }
  /* 自修：把带路径的错误喂回去 */
  console.log('\n→ 把错误喂回 LLM 自修…\n');
  messages.push({ role: 'assistant', content: JSON.stringify(block) });
  messages.push({ role: 'user', content: `校验未通过（路径即字段位置）:\n${res.errors.join('\n')}\n请修正后**只**重新输出该 JSON 对象。` });
}
if (res.warnings.length) { console.log('提醒:'); for (const w of res.warnings) console.log('  · ' + w); }
console.log('\n[smoke] 端到端闭合：LLM 生成 → validateBlock → (自修) → 合法 block。');
