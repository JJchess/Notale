/* loop 能力（Hermes cron 的最小对应物，不依赖任何调度框架）：
   从题材队列(jsonl)逐个生成；once=跑一轮，否则每 everyMs 一轮。每篇产物交 onDoc 落盘。 */
import { readFileSync } from 'node:fs';
import { generateLecture } from './agent.mjs';

export function readTopics(file) {
  return readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    try { const o = JSON.parse(l); return o.prompt || o.topic || l; } catch { return l; }
  });
}

export async function runLoop({ file, everyMs = 0, once = true, log = console.log, onDoc }) {
  const topics = readTopics(file);
  log(`[loop] ${topics.length} 个课题；${once ? '跑一轮' : '每 ' + Math.round(everyMs / 1000) + 's 一轮'}`);
  do {
    for (const t of topics) {
      log(`\n[loop] ▶ ${t}`);
      try {
        const r = await generateLecture({ topic: t, log });
        if (onDoc) await onDoc(r, t);
        log(`[loop] ${r.errors.length ? '⚠ 有校验错' : '✓ 合法'} ${r.doc.id} · ${r.doc.scenes.length} 页 · ${r.calls} calls`);
      } catch (e) { log(`[loop] ✗ ${e.message}`); }
    }
    if (!once) await new Promise(r => setTimeout(r, everyMs));
  } while (!once);
}

export function parseInterval(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d+)\s*(s|m|h)?$/i);
  if (!m) return 0;
  const n = +m[1], u = (m[2] || 's').toLowerCase();
  return n * (u === 'h' ? 3600 : u === 'm' ? 60 : 1) * 1000;
}
