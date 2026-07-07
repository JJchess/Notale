#!/usr/bin/env node
/* ============================================================================
   evolve-schema/aggregate.mjs — 自演化信号聚合（Phase 3）
   扫描一批已生成的 LectureDoc，汇总 freeform 的 rationale + theme/sim-engine 使用分布，
   把「反复出现的同类诉求」提炼成「该长什么」的**提案信号**（不改任何 schema——提案交人类 review）。

   用法:  node aggregate.mjs <dir-or-file...>   （目录会递归找 *.json / *.lecture.json）
   输出:  控制台报告 + 机器可读 JSON（stdout 末尾一行 JSON，供 cron/batch 消费）
   ========================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const args = process.argv.slice(2);
if (!args.length) { console.error('用法: node aggregate.mjs <dir-or-file...>'); process.exit(2); }

/* 收集候选 JSON 文件 */
const files = [];
function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
  else if (extname(p) === '.json') files.push(p);
}
for (const a of args) { try { walk(resolve(a)); } catch (e) { console.error('跳过 ' + a + ': ' + e.message); } }

/* 从一份 doc 里收集 freeform rationale + theme + sim engines（含嵌套 compare/grid） */
const freeforms = [];   // {rationale, docId}
const themes = {};       // theme -> count
const engines = {};      // sim engine -> count
let docCount = 0;

function visit(b, docId) {
  if (!b || typeof b !== 'object') return;
  if (b.type === 'freeform' && typeof b.rationale === 'string') freeforms.push({ rationale: b.rationale, docId });
  if (b.type === 'sim' && b.engine) engines[b.engine] = (engines[b.engine] || 0) + 1;
  if (b.type === 'compare') { for (const s of ['left', 'right']) if (b[s] && b[s].block) visit(b[s].block, docId); }
  if (b.type === 'grid' && Array.isArray(b.items)) for (const it of b.items) if (it && it.block) visit(it.block, docId);
}
const evals = [];   // PPTEval 式质量分（若 batch/generate --eval 存了 eval.json）
for (const f of files) {
  let obj; try { obj = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (obj && obj.overall !== undefined && obj.content && obj.coherence) { evals.push(obj); continue; }  // eval.json
  if (!obj || !Array.isArray(obj.scenes)) continue;   // 不是 LectureDoc，跳过（可能是 block 片段/骨架）
  const doc = obj;
  docCount++;
  const id = doc.id || f;
  if (doc.theme) themes[doc.theme] = (themes[doc.theme] || 0) + 1;
  for (const s of doc.scenes) for (const b of (s.blocks || [])) visit(b, id);
}

/* 关键词频率：从 rationale 里抽 2-4 字中文词 / 英文词，统计在多少「不同 doc」里出现（跨 doc 才算信号） */
const STOP = new Set(['需要', '现有', '类型', '无法', '表达', '不适用', '这种', '因为', '一个', '可以', '没有', '它们', '并排', '布局', '排版', '自定义', 'the', 'and', 'for', 'with', 'this', 'that']);
const kwDocs = {};   // keyword -> Set(docId)
/* 中文无词界：用**重叠 n-gram**（2/3 字滑窗）抽候选，避免固定窗切碎词（"时间轴"被切成"…时间"+"轴…"）；
   会有部分词噪声，但"跨 ≥2 份 doc"过滤 + 按 doc 数排序能把真信号顶上来（最终人类 review）。 */
for (const { rationale, docId } of freeforms) {
  const toks = new Set();
  for (const run of rationale.match(/[一-鿿]+/g) || []) {
    for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= run.length; i++) {
      const g = run.slice(i, i + n);
      if (!STOP.has(g)) toks.add(g);
    }
  }
  for (const m of rationale.toLowerCase().match(/[a-z]{3,}/g) || []) if (!STOP.has(m)) toks.add(m);
  for (const t of toks) (kwDocs[t] ||= new Set()).add(docId);
}
const RECUR = 2;   // 出现在 ≥2 个不同 doc 里 → 视为「反复出现」信号
const signals = Object.entries(kwDocs)
  .map(([kw, set]) => ({ keyword: kw, docs: set.size }))
  .filter(s => s.docs >= RECUR)
  .sort((a, b) => b.docs - a.docs);

/* 报告 */
console.log(`扫描 ${files.length} 文件 / 识别 ${docCount} 份 LectureDoc`);
console.log(`theme 分布: ${JSON.stringify(themes)}`);
console.log(`sim engine 分布: ${JSON.stringify(engines)}`);
console.log(`freeform 用例: ${freeforms.length} 处，跨 ${new Set(freeforms.map(f => f.docId)).size} 份 doc`);
if (signals.length) {
  console.log('\n⚑ 反复出现的 freeform 诉求（候选：可能该收编为新正式 block 类型 / 新主题 / 新 sim 引擎）：');
  for (const s of signals) console.log(`  · "${s.keyword}" — 出现在 ${s.docs} 份 doc`);
  console.log('\n下一步（人类 review）：为最高频信号起草 { schema 片段 + 渲染器分支 + create-* 技能 + 反例测试 }，走 schemaVersion 加法升级。agent 不静默改 schema。');
} else {
  console.log('\n（暂无跨 doc 反复出现的 freeform 诉求——schema 现有词汇够用，无需生长。）');
}

/* 质量分聚合（移植自 PPTEval，来自 batch/generate --eval 存的 eval.json）：给自演化一个质量轴 */
let qual = null;
if (evals.length) {
  const dims = ['content', 'coherence', 'pedagogy'];
  const avg = {}; for (const d of dims) avg[d] = +(evals.reduce((s, e) => s + (e[d]?.score || 0), 0) / evals.length).toFixed(2);
  avg.overall = +(evals.reduce((s, e) => s + (e.overall || 0), 0) / evals.length).toFixed(2);
  const weakest = dims.slice().sort((a, b) => avg[a] - avg[b])[0];
  qual = { n: evals.length, avg, weakest, topFixes: evals.map(e => e.topFix).filter(Boolean).slice(0, 8) };
  console.log(`\n📊 质量分（${evals.length} 份评估过的讲义，移植自 PPTEval）：overall ${avg.overall}/5 · content ${avg.content} · coherence ${avg.coherence} · pedagogy ${avg.pedagogy}`);
  console.log(`  最弱维度: ${weakest}（${avg[weakest]}/5）→ 这是 agent 该系统改进的方向`);
  if (qual.topFixes.length) { console.log('  各篇 topFix（改进线索）:'); for (const t of qual.topFixes) console.log('    · ' + t); }
}

/* 机器可读一行（cron/batch 消费） */
console.log('\n@@EVOLVE_JSON@@ ' + JSON.stringify({ docCount, themes, engines, freeformCount: freeforms.length, signals, quality: qual }));
