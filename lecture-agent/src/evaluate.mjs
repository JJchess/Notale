/* 讲义质量评估（移植自 PPTAgent 的 PPTEval：Content / Design / Coherence 三维 1-5 打分）。
   改造为讲义三维：content(内容) / coherence(连贯) / pedagogy(教学呈现，把 PPTEval 的 Design 换成更贴讲义的教学法维度)。
   产出结构化分数 + 理由 + 改进建议，可当质量闸 / revise 反馈信号。
   来源: github.com/icip-cas/PPTAgent (PPTEval, EMNLP 2025)。 */
import { chat, parseJson } from './llm.mjs';

function blurb(b) {
  if (!b) return '';
  switch (b.type) {
    case 'hero': return (b.title || []).join(' / ');
    case 'statement': return b.statement || '';
    case 'list': return (b.items || []).slice(0, 3).map(i => i.lead || i.text).join('；');
    case 'agenda': return (b.rows || []).slice(0, 3).map(r => r.label).join('；');
    case 'callout': return `${b.label}: ${b.text}`;
    case 'formula': return b.latex || '';
    case 'flow': return (b.nodes || []).map(n => n.title).join('→');
    case 'table': return (b.head || []).join(' | ');
    case 'code': return (b.filename || b.language || 'code');
    case 'compare': return `${b.left?.caption} vs ${b.right?.caption}`;
    case 'quiz': return b.stem || b.prompt || '';
    case 'sim': return `engine=${b.engine}` + (b.model?.update ? ` update=${b.model.update}` : '') + (b.model?.objective ? ` obj=${b.model.objective}` : '');
    case 'runnable': return `runnable ${(b.languages || []).join('/')}`;
    default: return b.type;
  }
}

/** 把 doc 压成给评审看的紧凑大纲（省 token，保留结构与关键内容）。 */
export function summarize(doc) {
  const out = [`标题: ${doc.title} ｜ 主题: ${doc.theme} ｜ 受众: ${doc.audience || '未标'} ｜ ${doc.scenes.length} 页`];
  doc.scenes.forEach((s, i) => {
    out.push(`${i + 1}. [${s.kind}] ${s.headline || s.eyebrow || '(hero)'}${s.lead ? ' — ' + s.lead : ''}`);
    for (const b of s.blocks || []) out.push(`   · ${b.type}${b.engine ? ':' + b.engine : ''} — ${blurb(b).slice(0, 90)}`);
  });
  return out.join('\n');
}

const SYS = `你是讲义质量评审（三维评分，移植自 PPTAgent 的 PPTEval 并改造为讲义场景）。对给定讲义大纲，每维打 1-5 分（1 差 5 优）并给简短理由 + 一条最具体的改进建议。三维:
- content（内容）: 每页信息量适中、表述清晰准确、例子/公式/交互支撑到位；不空泛、不堆砌、无 AI 味套话。
- coherence（连贯）: 叙事由浅入深、有必要的背景铺垫、前后衔接顺、有一条清晰主线。
- pedagogy（教学呈现）: 交互(sim/quiz)放在最能体现的知识点、难度与受众匹配、克制不塞满、主题与题材气质相符。
只输出 JSON：
{ "content":{"score":N,"why":"...","fix":"..."}, "coherence":{"score":N,"why":"...","fix":"..."}, "pedagogy":{"score":N,"why":"...","fix":"..."}, "overall":N, "topFix":"整份讲义最该改的一条(具体、可执行)" }`;

/** 评估一份 LectureDoc，返回三维分数对象。 */
export async function evaluateLecture(doc) {
  return parseJson(await chat([{ role: 'system', content: SYS }, { role: 'user', content: summarize(doc) }], { temperature: 0.2 }));
}

/** 打印评估结果（CLI 用）。 */
export function printEval(ev) {
  const line = (k, d) => `  ${k.padEnd(10)} ${'★'.repeat(d.score || 0)}${'·'.repeat(Math.max(0, 5 - (d.score || 0)))} ${d.score}/5 — ${d.why}`;
  console.log(`[eval] overall ${ev.overall}/5`);
  for (const k of ['content', 'coherence', 'pedagogy']) if (ev[k]) console.log(line(k, ev[k]));
  if (ev.topFix) console.log(`  ⚑ 最该改: ${ev.topFix}`);
}
