/* 共享 LLM 客户端（硅基流动 / OpenAI 兼容），零依赖。smoke-generate 与 run-lecture 共用。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(resolve(here, '..', '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
  }
} catch { /* .env 缺失时靠 process.env 兜底 */ }

export const KEY = env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY;
export const BASE = env.SILICONFLOW_BASE_URL || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
export const MODEL = process.env.SF_MODEL || 'deepseek-ai/DeepSeek-V3';

let nCalls = 0;
export const callCount = () => nCalls;

/** OpenAI 兼容 chat。messages=[{role,content}]。jsonMode=true 时请求 JSON 对象输出。带一次重试。 */
export async function chat(messages, { jsonMode = true, temperature = 0.3, model = MODEL } = {}) {
  if (!KEY) throw new Error('缺 API key（仓库根 .env 的 SILICONFLOW_API_KEY）');
  const body = { model, messages, temperature };
  if (jsonMode) body.response_format = { type: 'json_object' };
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      nCalls++;
      const r = await fetch(BASE + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
      const d = await r.json();
      return d.choices[0].message.content;
    } catch (e) { lastErr = e; if (attempt < 2) await new Promise(res => setTimeout(res, 1200)); }
  }
  throw lastErr;
}

/** 从模型输出里抽第一个 JSON（容错去代码围栏）。 */
export function parseJson(txt) {
  let t = String(txt).trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j < 0) throw new Error('输出里没有 JSON 对象');
  return JSON.parse(t.slice(i, j + 1));
}

/** 简易并发池：对 items 跑 worker，最多 n 个并行。 */
export async function pool(items, n, worker) {
  const out = new Array(items.length);
  let idx = 0;
  async function run() { while (idx < items.length) { const i = idx++; out[i] = await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}
