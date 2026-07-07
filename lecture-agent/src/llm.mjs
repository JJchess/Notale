/* LLM 客户端（OpenAI 兼容，如硅基流动 SiliconFlow），零依赖。
   读仓库根 .env（SILICONFLOW_API_KEY / _BASE_URL），或环境变量兜底。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const cand of [resolve(here, '..', '..', '.env'), resolve(here, '..', '.env')]) {
  try {
    for (const line of readFileSync(cand, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  } catch { /* 没有就跳过，靠 process.env */ }
}

export const KEY = env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY;
export const BASE = env.SILICONFLOW_BASE_URL || process.env.SILICONFLOW_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1';
export const MODEL = process.env.LA_MODEL || process.env.SF_MODEL || 'deepseek-ai/DeepSeek-V3';

let nCalls = 0;
export const callCount = () => nCalls;

/** OpenAI 兼容 chat。messages=[{role,content}]。jsonMode=true 请求 JSON 对象输出。带一次重试。 */
export async function chat(messages, { jsonMode = true, temperature = 0.3, model = MODEL } = {}) {
  if (!KEY) throw new Error('缺 API key：仓库根 .env 里设 SILICONFLOW_API_KEY，或导出 OPENAI_API_KEY');
  const body = { model, messages, temperature };
  if (jsonMode) body.response_format = { type: 'json_object' };
  let lastErr;
  const ATTEMPTS = 4;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      nCalls++;
      const r = await fetch(BASE + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const d = await r.json();
      const c = d.choices?.[0]?.message?.content;
      if (!c) throw new Error('空响应: ' + JSON.stringify(d).slice(0, 200));
      return c;
    } catch (e) {
      lastErr = e;
      if (attempt < ATTEMPTS) {
        /* 限流/过载/网络 → 更长退避（指数）；其他错误短退避 */
        const rl = /429|rate|too many|529|503|502|overload|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(String(e.message || e));
        await new Promise(res => setTimeout(res, (rl ? 4000 : 1000) * attempt));
      }
    }
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
