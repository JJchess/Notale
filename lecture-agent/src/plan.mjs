/* 内容规划（移植自 Stanford STORM 的 pre-writing 思想：多视角提问 → 大纲）。
   STORM 的洞见：直接让 LLM 出大纲，覆盖面窄；先发现"多个视角(perspective)"、每个视角提出"必须讲到的点+常见疑问"，
   再据此综合大纲，覆盖更广更深、组织更好。我们把它落成"教学视角"两阶段规划，产出与旧 planner 相同的 skeleton 格式。
   来源: github.com/stanford-oval/storm（Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking）。 */
import { chat, parseJson } from './llm.mjs';

const PERSPECTIVE_SCHEMA = `{ "perspectives": [ { "name":"视角名(如 重直觉的入门讲法 / 重推导的理论派 / 重工程实践 / 爱追问的学生)", "focus":"这个视角最在意什么(一句)", "mustCover":["这个视角认为必须讲到的要点", "..."], "questions":["学生在这个视角下常见的疑问/误区", "..."] } ] }`;

/** STORM 阶段一：发现互补的教学视角 + 每视角的"必讲点"与"常见疑问"（= 覆盖清单）。 */
async function discoverCoverage({ topic, audience, extra, material }) {
  const sys = `你是课程设计专家。用"多视角提问"扩大一节讲义的覆盖面：对给定课题，列出 3-4 个**互补**的教学视角，每个视角给出它认为**必须讲到的要点**与学生在该视角下的**常见疑问/误区**。视角要真的不同（入门直觉 / 理论推导 / 工程实践 / 历史动机 / 易错点…按课题取最相关的几种），别重复。${material ? '**必讲点要从下面的参考素材里提炼，别脱离素材另起炉灶。**' : ''}只输出 JSON：\n${PERSPECTIVE_SCHEMA}`;
  const user = `课题: ${topic}${audience ? `\n受众: ${audience}` : ''}${extra ? `\n额外要求: ${extra}` : ''}${material ? `\n\n参考素材：\n${material}` : ''}\n输出 perspectives JSON。`;
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
    {"id":"...","kind":"section","eyebrow":"第一部分(可选)","headline":"章节名","notes":"...","blocks":[{"id":"b_sec1","type":"statement","intent":"本章一句话主旨(章节分隔页,只此一句)"}]},
    {"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","notes":"讲者备注","blocks":[{"id":"b1","type":"list","intent":"这一块要讲清什么(一句)"}]},
    {"id":"...","kind":"content","headline":"某机制的分步拆解","notes":"...","layout":{"kind":"index","steps":[{"label":"第一步","blockIds":["s1"]},{"label":"第二步","blockIds":["s2"]},{"label":"小结","blockIds":["s3"]}]},"blocks":[{"id":"s1","type":"flow","intent":"第一步做什么"},{"id":"s2","type":"flow","intent":"第二步做什么"},{"id":"s3","type":"list","intent":"三步小结"}]},
    {"id":"...","kind":"quiz","headline":"随堂检验","notes":"...","blocks":[{"id":"bq","type":"quiz","intent":"考察点"}]},
    {"id":"recap","kind":"statement","notes":"...","blocks":[{"id":"b_recap","type":"statement","intent":"全课一句话收束"}]},
    {"id":"close","kind":"hero","notes":"...","blocks":[{"id":"b_close","type":"hero","intent":"收尾页"}]}
  ]}
规则:
- **页数严格控制在 ${pages} 页左右（±1），不要显著超出**——别为凑"封面+内容+测验+回顾+收尾"的模板而堆页。第一页 kind:hero(封面, 恰含一个 hero block)。页数充裕(≥7)时才加 statement 回顾页 + hero 收尾；**页数少(≤4)时省掉回顾/收尾页，封面后直接进核心内容**（3 页 ≈ 封面 + 1~2 页内容）。
- scene.kind: hero(封面/收尾, 一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block) | **section(章节分隔页：大号序号+章节名+一句主旨,含一个 statement block)**。
- **章节节拍**：页数充裕(≥8)且内容明显分 2-3 大主题时，在每个大主题**开始前**插一个 \`kind:"section"\` 分隔页（headline=章节名、一个 statement block=本章一句话主旨），给讲义打节拍、避免"每页一个样"的平铺单调。别滥用——3-5 页的短讲义或单一主题不插；分隔页只做标题不塞内容。
- 每个 block 是占位 {id(全局唯一), type, intent}。**type 只能从这个清单里选，禁止新造类型名**（map/chart/diagram 都不存在，用 flow/table/list 表达）。**timeline 只用于有明确时间点的编年/历史序列**（年代、发展史、里程碑）——这种别用 flow 凑；**无时间点的步骤/流程/推导/构建过程一律用 flow**（timeline 不是"分步"的意思）。可用 type: ${autoTypes.join(', ')}。
- 一页通常 1-2 个 block；叙事连贯、由浅入深。（用 index/split 版式的页可承载更多 block，见下）
- **pullquote（编辑级抽句）**：内容页里有一句特别精炼、值得让读者停顿的关键论断/金句时，可加一个 \`pullquote\`（放大旁置的呼吸点），配合其它 block 用；每页至多 1 个、别当概要堆、别整页只有它。适合观点鲜明的人文/思辨/结论页。
- **版式(scene.layout，按内容形态主动选用)**：默认竖排(flow)，但**全篇清一色竖排是最单调的 AI 味**——一份 ≥6 页的讲义里，只要内容契合就应有 **1~2 页**用上非竖排版式，别整份都堆竖排。两种可用版式，**只作用于所在这一页**：① 一页是【一串可分步的子节】(定义→步骤→反例→小结、或一个机制的 3-5 个阶段、握手/挥手这类分步协议、算法的几个阶段)→ \`layout:{kind:"index", steps:[{label:"定义", blockIds:["b1"]}, {label:"步骤", blockIds:["b2","b3"]}, ...]}\`，左目录+右侧逐节上画切入；② 一页有个需【全程对照的锚】(一条核心公式/一张示意/一段题面/一段代码)、其余内容围绕它展开 → \`layout:{kind:"split", anchor:["b1"], ratio:0.4}\`，左锚常驻+右侧要点递进。blockIds/anchor 引用**本页 blocks 里的 id**；用了 index/split 的页要多放几个 block（3-5 个，正好分配到各子节/两栏，别只放 1 个）。**这只是起步的两种、并非穷举**；版式必须服务内容，内容不契合就用竖排，但别因保守而整份都不用。
- **交互按题材选，别硬塞**：只有**可量化/可模拟**的题材（物理、数学、算法、带动态的经济/生物等）才用 sim（浏览器内真算，放在最能体现的知识点）；**人文/艺术/历史/语言/思辨类绝不硬塞 sim**——把概念套进假公式（如"格律严格度→情感"编个方程）是最糟的 AI 味，宁可不放 sim，改用 compare/flow/table/list 表达对比与结构。无论题材都建议放至少 1 个 quiz（客观或研讨）。${wants ? '用户明确点名的交互: ' + wants + '（题材允许时优先满足；题材不适合 sim 就忽略该项）。' : ''}
- 主题按课程气质选(${themeHint ? '用户指定: ' + themeHint : 'cartesian 克制人文 / cobalt-grid 研究公报 / lab 暗仪表台(仿真多时) / slate 冷灰编辑工程(理论/人文/工程皆宜)'})。
- **少而深 > 面面俱到**：覆盖清单只是候选，往往超出 ${pages} 页能承载；**挑与主线最相关的核心点讲透**，次要点并入 notes 或舍弃——一节好课是聚焦的，覆盖不全很正常，别为凑全把页面塞满。
- **notes 是"有料的讲者稿"，不是一句话元描述**：正文克制、细节沉到 notes——写关键点的展开解释/推导/直觉、学生常见误区、数据的诚实说明、承上启下的衔接。每页 notes 至少 2-3 句、几十字以上；**禁**"总结核心要点""鼓励动手实践"这种没信息量的占位。
- **AI 助教要充实**：tutor.suggestions 给 3-4 个本课最值得问的问题（贴具体知识点、含常见误区）；tutor.kb 覆盖本课**主要术语与易混概念 4-6 条**（别只给 1-2 条），每条 pattern 用 \`关键词|同义词\` 正则、answer 一句准确的 inline-md。
${authoringRules}`;
}

/** 章节分隔页·确定性插入：实测规划器几乎从不主动产出可选结构页(section，同 index/split ——已第 2 次复现"LLM 忽略可选编排")。
 *  focused 单一目的调用(远比大骨架提示里塞一条可靠)：仅长讲义(内容页≥5、总页≥8)才判定 2-3 个大部分边界，
 *  在各部分首个内容页前插一个 section 分隔页(headline=部分名 + 一个 statement 占位块=本部分主旨,随 fan-out 生成)。
 *  红线守护：无清晰分界/调用失败→不插(graceful)；只加分隔页不删改既有内容页；插入的 statement 走占位→fan-out,不 mock。 */
export async function insertSections(doc, log = () => {}) {
  const scenes = doc.scenes || [];
  const contentIdx = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'content');
  if (contentIdx.length < 5) return 0;                           // 内容页太少不打节拍（分隔页只在多页大部分时有意义）
  if (scenes.some(s => s.kind === 'section')) return 0;          // 规划器已给则尊重，不重复
  const list = contentIdx.map(({ s }, k) => `${k + 1}. ${typeof s.headline === 'string' && s.headline ? s.headline : (s.eyebrow || '(无题)')}`).join('\n');
  const sys = `你是讲义编排师。下面是一节课按顺序的内容页标题。判断它们是否自然分成 2-3 个连贯的大部分(part)。`
    + `**只有确实存在清晰主题分界时才分；牵强、或本就单一主题就返回空**。每个 part 给：start(起始页序号,对应下面编号)、title(部分标题,4-12字)、thesis(一句话主旨,≤30字)。`
    + `第一部分通常从第 1 页起。只输出 JSON：{ "parts": [ { "start": 1, "title": "…", "thesis": "…" } ] }；无清晰分界则 {"parts":[]}。`;
  const user = `内容页标题（共 ${contentIdx.length} 页）：\n${list}\n\n输出 parts JSON。`;
  let parts;
  try { parts = (parseJson(await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.3 })).parts) || []; }
  catch { return 0; }
  if (!Array.isArray(parts) || parts.length < 2) return 0;                   // <2 部分不值得插分隔
  if (parts.length > Math.ceil(contentIdx.length / 2)) return 0;             // 分隔页数 > 内容页半数 = 每部分不足 2 页 → 过度打点，不插（避免"分隔+单页"的碎片单调）
  const seen = new Set();
  const targets = parts.map(p => {
    const k = (+p.start || 0) - 1;
    if (k < 0 || k >= contentIdx.length) return null;
    const title = String(p.title || '').trim(), thesis = String(p.thesis || '').trim();
    if (!title || !thesis) return null;
    return { sceneIndex: contentIdx[k].i, title, thesis };
  }).filter(t => t && !seen.has(t.sceneIndex) && seen.add(t.sceneIndex))
    .sort((a, b) => b.sceneIndex - a.sceneIndex);                // 降序插入，避免索引错位
  let n = 0;
  for (const t of targets) {
    scenes.splice(t.sceneIndex, 0, {
      id: `section-${t.sceneIndex}`, kind: 'section', headline: t.title,
      notes: `章节分隔：${t.title}。${t.thesis}`,
      blocks: [{ id: `sec${t.sceneIndex}s`, type: 'statement', intent: `本部分「${t.title}」一句话主旨：${t.thesis}` }],
    });
    n++; log(`[section] 页 ${t.sceneIndex + 1} 前插入分隔页「${t.title}」`);
  }
  return n;
}

/** 确定性版式分配：实测规划器常年只产竖排(index/split 使用率 0)，光靠提示词纠正不动。
 *  这里把"天然多段"的内容页(≥3 block、且没显式指定版式)兜底改成 index 左目录+右侧逐节，
 *  确保 iter54 的版式机制真的被用上、打破整份 flow 的单调。红线守护：只加不删、只碰 content 页、
 *  每份至多 2 页且不相邻(避免连续两页同版式=新的单调)，取 block 最多者(收益最大)。渲染器对失效引用有回落，安全。 */
export function assignLayouts(doc, log = () => {}) {
  const label = (intent = '', i) => {
    const first = String(intent).split(/[：:（(，,。、\n]/)[0].trim();
    const s = first.slice(0, 14);
    return s ? (first.length > 14 ? s + '…' : s) : `第 ${i + 1} 节`;
  };
  const cands = (doc.scenes || [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === 'content' && !s.layout && Array.isArray(s.blocks) && s.blocks.length >= 3)
    .sort((a, b) => b.s.blocks.length - a.s.blocks.length);
  let used = 0; const taken = new Set();
  for (const { s, i } of cands) {
    if (used >= 2) break;
    if (taken.has(i - 1) || taken.has(i + 1)) continue;   // 不相邻
    s.layout = { kind: 'index', steps: s.blocks.map((b, k) => ({ label: label(b.intent, k), blockIds: [b.id] })) };
    taken.add(i); used++;
    log(`[layout] scene#${i + 1} "${s.headline || ''}" → index(${s.blocks.length} 节) 确定性分配`);
  }
  // sidenote 兜底：恰 2 块、末块是 callout（天然语境旁注）的内容页 → compose sidenote（主栏+右窄栏）。
  // 与 index(≥3 块)不重叠；每份至多 2 页，避免新单调。规划器实测不自选 compose，同 index/section 确定性化（见 FE-59）。
  let side = 0;
  (doc.scenes || []).forEach((s, i) => {
    if (side >= 2) return;
    if (s.kind === 'content' && !s.layout && Array.isArray(s.blocks) && s.blocks.length === 2
        && s.blocks[1] && s.blocks[1].type === 'callout') {
      s.layout = { kind: 'compose', preset: 'sidenote' };
      side++;
      log(`[layout] scene#${i + 1} "${s.headline || ''}" → compose/sidenote 确定性分配`);
    }
  });
  return used + side;
}

/** STORM 阶段二：把多视角覆盖清单综合成一份连贯、递进的 skeleton（大纲生成）。 */
export async function planLecture({ topic, pages = 12, theme = '', audience = '', wants = '', extra = '', material = '', autoTypes, authoringRules, log = () => {} }) {
  // 阶段一：多视角覆盖
  const _tp = Date.now();
  const perspectives = await discoverCoverage({ topic, audience, extra, material });
  const perspectiveMs = Date.now() - _tp;
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
  const user = `课题: ${topic}${audience ? '\n受众: ' + audience : ''}${theme ? '\n主题: ' + theme : ''}${wants ? '\n要的交互: ' + wants : ''}${extra ? '\n额外要求: ' + extra : ''}${material ? '\n\n参考素材（讲义内容据此取材，别脱离/编造）：\n' + material : ''}\n\n${coverage}\n\n产出骨架 JSON。`;
  let lastErr;
  const _ts = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4 });
      const doc = parseJson(raw);
      // 章节分隔页确定性插入（规划器几乎从不主动产 section；focused 调用判定部分边界）——在返回骨架前完成，
      // 使分隔页的 statement 占位块随后进入 fan-out 正常生成（不 mock）。失败/无分界则不插（graceful）。
      try { const secs = await insertSections(doc, log); if (secs) log(`[section] 插入 ${secs} 个章节分隔页（打节拍，破每页一个样）`); } catch (e) { log('[section] 跳过: ' + String(e.message || e).slice(0, 50)); }
      return { doc, perspectives, timing: { perspectiveMs, skeletonMs: Date.now() - _ts } };
    } catch (e) { lastErr = e; if (attempt < 3) { log(`[plan] 骨架生成第 ${attempt} 次失败(${String(e.message || e).slice(0, 50)})，退避重试…`); await new Promise(r => setTimeout(r, 3000 * attempt)); } }
  }
  throw new Error('骨架生成失败（网络/限流/解析）: ' + String(lastErr?.message || lastErr).slice(0, 100));
}
