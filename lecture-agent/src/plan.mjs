/* 内容规划（移植自 Stanford STORM 的 pre-writing 思想：多视角提问 → 大纲）。
   STORM 的洞见：直接让 LLM 出大纲，覆盖面窄；先发现"多个视角(perspective)"、每个视角提出"必须讲到的点+常见疑问"，
   再据此综合大纲，覆盖更广更深、组织更好。我们把它落成"教学视角"两阶段规划，产出与旧 planner 相同的 skeleton 格式。
   来源: github.com/stanford-oval/storm（Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking）。 */
import { chat, parseJson } from './llm.mjs';

const PERSPECTIVE_SCHEMA = `{ "perspectives": [ { "name":"视角名(如 重直觉的入门讲法 / 重推导的理论派 / 重工程实践 / 爱追问的学生)", "focus":"这个视角最在意什么(一句)", "mustCover":["这个视角认为必须讲到的要点", "..."], "questions":["学生在这个视角下常见的疑问/误区", "..."] } ] }`;

/** STORM 阶段一：发现互补的教学视角 + 每视角的"必讲点"与"常见疑问"（= 覆盖清单）。 */
async function discoverCoverage({ topic, audience, extra }) {
  const sys = `你是课程设计专家。用"多视角提问"扩大一节讲义的覆盖面：对给定课题，列出 3-4 个**互补**的教学视角，每个视角给出它认为**必须讲到的要点**与学生在该视角下的**常见疑问/误区**。视角要真的不同（入门直觉 / 理论推导 / 工程实践 / 历史动机 / 易错点…按课题取最相关的几种），别重复。只输出 JSON：\n${PERSPECTIVE_SCHEMA}`;
  const user = `课题: ${topic}${audience ? `\n受众: ${audience}` : ''}${extra ? `\n额外要求: ${extra}` : ''}\n输出 perspectives JSON。`;
  try {
    const data = parseJson(await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.7 }));
    const ps = Array.isArray(data.perspectives) ? data.perspectives : [];
    return ps.slice(0, 4);
  } catch { return []; }
}

function skeletonSpec(pages, autoTypes, themeHint, wants, authoringRules) {
  return `骨架结构:
{ "id":"kebab-id","title":"...","subtitle":"...(可选)","language":"zh-CN","audience":"...","theme":"cartesian|cobalt-grid|lab",
  "tutor":{"suggestions":["建议问题"],"kb":[{"pattern":"关键词|同义词","answer":"本地应答(inline-md)"}]},
  "scenes":[
    {"id":"cover","kind":"hero","notes":"讲者备注","blocks":[{"id":"b_cover","type":"hero","intent":"封面：标题+一句副题"}]},
    {"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","notes":"讲者备注","blocks":[{"id":"b1","type":"list","intent":"这一块要讲清什么(一句)"}]},
    {"id":"...","kind":"quiz","headline":"随堂检验","notes":"...","blocks":[{"id":"bq","type":"quiz","intent":"考察点"}]},
    {"id":"recap","kind":"statement","notes":"...","blocks":[{"id":"b_recap","type":"statement","intent":"全课一句话收束"}]},
    {"id":"close","kind":"hero","notes":"...","blocks":[{"id":"b_close","type":"hero","intent":"收尾页"}]}
  ]}
规则:
- 约 ${pages} 页(scenes)；第一页 kind:hero(封面, 恰含一个 hero block)，最后可用 statement 回顾 + hero 收尾。
- scene.kind: hero(封面/收尾, 一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block)。
- 每个 block 是占位 {id(全局唯一), type, intent}。可用 type: ${autoTypes.join(', ')}。
- 一页通常 1-2 个 block；叙事连贯、由浅入深。
- **交互按题材选，别硬塞**：只有**可量化/可模拟**的题材（物理、数学、算法、带动态的经济/生物等）才用 sim（浏览器内真算，放在最能体现的知识点）；**人文/艺术/历史/语言/思辨类绝不硬塞 sim**——把概念套进假公式（如"格律严格度→情感"编个方程）是最糟的 AI 味，宁可不放 sim，改用 compare/flow/table/list 表达对比与结构。无论题材都建议放至少 1 个 quiz（客观或研讨）。${wants ? '用户明确点名的交互: ' + wants + '（题材允许时优先满足；题材不适合 sim 就忽略该项）。' : ''}
- 主题按课程气质选(${themeHint ? '用户指定: ' + themeHint : 'cartesian 克制人文 / cobalt-grid 研究公报 / lab 暗仪表台(仿真多时)'})。
${authoringRules}`;
}

/** STORM 阶段二：把多视角覆盖清单综合成一份连贯、递进的 skeleton（大纲生成）。 */
export async function planLecture({ topic, pages = 12, theme = '', audience = '', wants = '', extra = '', autoTypes, authoringRules, log = () => {} }) {
  // 阶段一：多视角覆盖
  const perspectives = await discoverCoverage({ topic, audience, extra });
  if (perspectives.length) {
    log(`[plan] 多视角覆盖: ${perspectives.map(p => p.name).join(' / ')}`);
  } else {
    log('[plan] 视角发现为空，回退单阶段规划');
  }
  const coverage = perspectives.length
    ? '下面是多个教学视角提炼的**覆盖清单**（务必在骨架里系统覆盖这些要点、并预先化解这些疑问；但要组织成一条连贯递进的线，不是罗列）：\n'
      + perspectives.map(p => `【${p.name}·${p.focus}】\n  必讲: ${(p.mustCover || []).join('；')}\n  疑问/误区: ${(p.questions || []).join('；')}`).join('\n')
    : '';

  // 阶段二：综合骨架（外层再重试 2 次——骨架是单点，网络/限流抖动不该整轮崩）
  const sys = `你是讲义(LectureDoc)总编排器。只输出一个 JSON 对象(骨架)，不要代码围栏、不要解释。\n${skeletonSpec(pages, autoTypes, theme, wants, authoringRules)}`;
  const user = `课题: ${topic}${audience ? '\n受众: ' + audience : ''}${theme ? '\n主题: ' + theme : ''}${wants ? '\n要的交互: ' + wants : ''}${extra ? '\n额外要求: ' + extra : ''}\n\n${coverage}\n\n产出骨架 JSON。`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4 });
      return { doc: parseJson(raw), perspectives };
    } catch (e) { lastErr = e; if (attempt < 3) { log(`[plan] 骨架生成第 ${attempt} 次失败(${String(e.message || e).slice(0, 50)})，退避重试…`); await new Promise(r => setTimeout(r, 3000 * attempt)); } }
  }
  throw new Error('骨架生成失败（网络/限流/解析）: ' + String(lastErr?.message || lastErr).slice(0, 100));
}
