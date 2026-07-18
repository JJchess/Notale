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

/* 每次逻辑调用一条记录（含用途/耗时/重试/token）——供 per-run 日志做效果/流程/耗时归因分析。
   nCalls 数的是 HTTP 尝试次数（含重试）；callLog 一条 = 一次 chat()/chatStream() 逻辑调用，attempts 记它内部试了几次。 */
const callLog = [];
export const getCallLog = () => callLog.slice();
export const resetCallLog = () => { callLog.length = 0; };
const promptCharsOf = msgs => msgs.reduce((n, m) => n + ((m && m.content ? String(m.content).length : 0)), 0);

/** OpenAI 兼容 chat。messages=[{role,content}]。jsonMode=true 请求 JSON 对象输出。带重试。
 *  purpose：本次调用的用途标签（plan:skeleton / block:sim / notes …），进 callLog 供归因。 */
export async function chat(messages, { jsonMode = true, temperature = 0.3, model = MODEL, purpose = 'chat' } = {}) {
  if (!KEY) throw new Error('缺 API key：仓库根 .env 里设 SILICONFLOW_API_KEY，或导出 OPENAI_API_KEY');
  const body = { model, messages, temperature };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const promptChars = promptCharsOf(messages);
  const t0 = Date.now();
  let lastErr, attempts = 0;
  const ATTEMPTS = 4;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    attempts = attempt;
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
      callLog.push({ seq: callLog.length + 1, purpose, model, stream: false, ms: Date.now() - t0, attempts, ok: true, promptChars, respChars: c.length, promptTokens: d.usage?.prompt_tokens, completionTokens: d.usage?.completion_tokens });
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
  callLog.push({ seq: callLog.length + 1, purpose, model, stream: false, ms: Date.now() - t0, attempts, ok: false, promptChars, err: String(lastErr?.message || lastErr).slice(0, 160) });
  throw lastErr;
}

/** OpenAI 兼容流式 chat。逐 token 调 onDelta(chunk)，返回累积全文。
 *  用于 planner 真流式（token 到达即增量抽取 scene/block 驱动 UI 浮现）。
 *  与 chat() 同源（key/BASE/退避/计数），只多解析 SSE。失败照样重试；不支持流式时调用方回退 chat()。 */
export async function chatStream(messages, { jsonMode = true, temperature = 0.3, model = MODEL, purpose = 'chat' } = {}, onDelta = () => {}) {
  if (process.env.LA_NO_STREAM) throw new Error('LA_NO_STREAM：强制走原子回退（provider 流式不稳时用）');
  if (!KEY) throw new Error('缺 API key：仓库根 .env 里设 SILICONFLOW_API_KEY，或导出 OPENAI_API_KEY');
  const body = { model, messages, temperature, stream: true, stream_options: { include_usage: true } };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const promptChars = promptCharsOf(messages);
  const t0 = Date.now();
  let lastErr, attempts = 0;
  const ATTEMPTS = 4;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      nCalls++;
      const r = await fetch(BASE + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      if (!r.body || typeof r.body.getReader !== 'function') throw new Error('无流式响应体（环境不支持 ReadableStream）');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '', usage = null;
      /* SSE：按空行分事件，每行 data: {json}；末尾 data: [DONE] 结束。跨 chunk 的半行留在 buf。
         include_usage 时，末尾会来一个 choices 为空、带 usage 的块——收下用于 token 计量。 */
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let piece;
          try { piece = JSON.parse(data); } catch { continue; }   // 忽略半包/心跳行
          if (piece.usage) usage = piece.usage;
          const delta = piece.choices?.[0]?.delta?.content;
          if (delta) { full += delta; try { onDelta(delta, full); } catch { /* UI 回调故障不该中断流 */ } }
        }
      }
      if (!full) throw new Error('流式空响应');
      callLog.push({ seq: callLog.length + 1, purpose, model, stream: true, ms: Date.now() - t0, attempts, ok: true, promptChars, respChars: full.length, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens });
      return full;
    } catch (e) {
      lastErr = e;
      if (attempt < ATTEMPTS) {
        const rl = /429|rate|too many|529|503|502|overload|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(String(e.message || e));
        await new Promise(res => setTimeout(res, (rl ? 4000 : 1000) * attempt));
      }
    }
  }
  callLog.push({ seq: callLog.length + 1, purpose, model, stream: true, ms: Date.now() - t0, attempts, ok: false, promptChars, err: String(lastErr?.message || lastErr).slice(0, 160) });
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
