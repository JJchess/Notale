const STAGES = [
  ['research', /(?:科研|论文|学术报告|答辩|研究生|博士|实验室|课题组|conference|research)/i],
  ['university', /(?:大学|本科|高校|学院|专业课|undergraduate|university)/i],
  ['high-school', /(?:高中|高一|高二|高三|中考|高考)/i],
  ['middle-school', /(?:初中|初一|初二|初三|七年级|八年级|九年级)/i],
  ['primary-upper', /(?:小学高年级|小学.{0,4}(?:四年级|五年级|六年级)|(?:四年级|五年级|六年级))/i],
  ['primary-lower', /(?:小学|一年级|二年级|三年级|低年级|儿童|少儿|启蒙)/i],
];

const STAGE_CONTRACTS = {
  'primary-lower': {
    label: '小学低年级', density: 'very-low',
    adaptation: '一页只完成一个观察或动作；用一个大场景、清楚角色和具象物件承担解释；可见短句尽量不超过三组。',
  },
  'primary-upper': {
    label: '小学高年级', density: 'low',
    adaptation: '以具象场景和图解为主，允许三到四个短标签；先让学生看见关系，再给术语。',
  },
  'middle-school': {
    label: '初中', density: 'medium-low',
    adaptation: '使用观察、对比和步骤化图解；控制术语数量，因果箭头必须短而明确。',
  },
  'high-school': {
    label: '高中', density: 'medium',
    adaptation: '允许机制、推导和实验变量同页出现，但保留唯一主问题；证据、条件和结论分层呈现。',
  },
  university: {
    label: '大学', density: 'medium-high',
    adaptation: '允许公式、代码、复杂关系和多层证据；用专业视觉语法组织，不以装饰替代定义。',
  },
  research: {
    label: '科研报告', density: 'evidence-led',
    adaptation: '结论和证据优先；区分概念示意与定量真值，保留图注、变量、来源和不确定性的位置。',
  },
  general: {
    label: '通用学习者', density: 'balanced',
    adaptation: '一页一个核心判断，以清楚视觉关系和适量文字完成解释。',
  },
};

const EXPERTS = {
  'story-world': {
    visualTask: '用人物、物件、环境和动作建立可进入的学习情境。',
    compositionGrammar: '一个连续场景作为画面主体；角色目光、动作或路径引导阅读；文字落在天然留白，不围成卡片墙。',
    mediaStrategy: '优先使用编辑插画、绘本、拼贴或情境摄影语言；跨页角色保持外观、服装和比例一致。',
    truthBoundary: '场景可以虚构，知识事实、时代物件和人物身份不可混淆。',
    avoid: ['漂浮图标集合', '无动作的排排站人物', '成人商务信息图'],
  },
  'concept-explainer': {
    visualTask: '把抽象概念转化为一个可观察的视觉模型或类比。',
    compositionGrammar: '一个主模型占主体，定义、条件和例子贴近对应部位；先看整体，再读局部。',
    mediaStrategy: '根据语义选择编辑插画、视觉隐喻、实物类比或简洁结构图，不限定单一媒介。',
    truthBoundary: '类比必须标明边界，不能把装饰关系误当成机制。',
    avoid: ['平均卡片阵列', '百科条目堆叠', '与概念无关的科技纹理'],
  },
  'process-mechanism': {
    visualTask: '表现状态如何沿时间、因果或操作顺序发生变化。',
    compositionGrammar: '一条连续、单向、无交叉的路径连接三到六个有语义差异的状态；起点、变化和结果一眼可辨。',
    mediaStrategy: '流程插画、实验序列、生命周期或短箭头机制图；状态形态随语义改变。',
    truthBoundary: '不得改变步骤顺序、因果方向或增添不存在的中间状态。',
    avoid: ['相同方框流水账', '回环装饰线', '穿过文字的箭头'],
  },
  'comparison-evidence': {
    visualTask: '让两个或多个对象在同一尺度上形成可判断的差异。',
    compositionGrammar: '共享比较轴或共同基准；每一侧形成完整视觉世界；差异点直接标注在对象附近。',
    mediaStrategy: '对照插画、样本并置、前后状态、矩阵或有限指标带。',
    truthBoundary: '所有比较对象使用一致口径，不用面积、透视或装饰制造虚假差异。',
    avoid: ['无共同尺度的双栏', '胜负式装饰', '仪表盘墙'],
  },
  'relationship-map': {
    visualTask: '表现节点之间真实、可追踪的层级、依赖或网络关系。',
    compositionGrammar: '主关系图占主体；按层级或簇组织节点；连线短、单向、少转折、不交叉、不穿字。',
    mediaStrategy: 'SVG式关系图、家系图、知识图谱、树图或系统结构图。',
    truthBoundary: '节点、方向和边必须来自语义真值；生成式装饰不得伪装成额外连接。',
    avoid: ['毛线团连线', '无含义节点', '发光HUD网络'],
  },
  'physical-spatial': {
    visualTask: '解释实体的部件、位置、层级、剖面或空间装配关系。',
    compositionGrammar: '一个大主体居中或偏置；部件按真实空间层级展开；调用线从部件边缘出发并避开标签。',
    mediaStrategy: '剖面、爆炸图、等距模型、解剖图或装置示意；复杂外观可生成，语义标注必须清晰。',
    truthBoundary: '部件数量、相对位置和连接关系不可因美化而改变。',
    avoid: ['无依据的3D层', '悬空标签', '透视与标注互相矛盾'],
  },
  'math-derivation': {
    visualTask: '把公式、几何或证明过程呈现为可逐步检查的推理。',
    compositionGrammar: '已知条件、变换步骤和结论形成连续阅读链；同一符号跨步骤保持位置或颜色身份；几何图与公式相互对齐。',
    mediaStrategy: '精确公式、坐标、几何构造和少量强调色；装饰插画只用于情境，不承担计算真值。',
    truthBoundary: '公式、符号、比例、角度和变换必须精确；禁止用生成式图像伪造数学几何。',
    avoid: ['把公式当纹理', '跳步', '不一致符号颜色', '伪手写乱码'],
  },
  'scientific-schematic': {
    visualTask: '解释实验装置、生物通路、反应机制或科学系统如何工作。',
    compositionGrammar: '按实验或机制主链组织；变量、材料、作用方向和观察结果分层；主证据比装饰更醒目。',
    mediaStrategy: '科学示意、局部剖面、实验序列或机制图；照片/生成插画与精确标签分离。',
    truthBoundary: '不能虚构器材、分子、通路、实验数据或作用方向；概念示意不得冒充定量结果。',
    avoid: ['科幻实验室背景', '随机分子结构', '无方向箭头'],
  },
  'quantitative-figure': {
    visualTask: '用数据和统计证据支撑一句明确结论。',
    compositionGrammar: '结论标题先行；一个主图或一个主指标占据视觉中心；关键点就地注释，辅助面板服从证据层级。',
    mediaStrategy: '精确绘图优先；生成式图像只负责非数据背景、概念面板或风格探索。',
    truthBoundary: '数值、坐标轴、比例、误差线、样本量和统计标注必须来自真实数据。',
    avoid: ['AI生成坐标轴', '3D柱状图', '装饰性趋势线', '无来源数字'],
  },
  'code-execution': {
    visualTask: '让代码、算法状态与数据结构变化能够沿执行顺序被追踪。',
    compositionGrammar: '真实代码或伪代码为主锚点；状态图、内存图或调用路径贴近对应行；一次只强调一个执行阶段。',
    mediaStrategy: '等宽代码、变量状态、内存结构、指针或调用栈；可使用逐步高亮而非伪IDE装饰。',
    truthBoundary: '代码、缩进、变量值和执行顺序必须准确。',
    avoid: ['伪IDE窗口', '代码墙', '与代码无关的霓虹装饰'],
  },
  'humanities-editorial': {
    visualTask: '通过文本、人物、时代材料和氛围建立解释性的阅读体验。',
    compositionGrammar: '使用编辑式主图或史料为锚点；引文、人物关系和解释形成有呼吸的叙事节奏；允许跨栏和尺度突变。',
    mediaStrategy: '档案拼贴、文学插画、人物关系、文本细读、时间材料或克制摄影。',
    truthBoundary: '引文、人物、时间和史料来源不可伪造；氛围图不能被误认为史实照片。',
    avoid: ['通用古风卷轴', '名人头像墙', '装饰性伪引文'],
  },
  'exercise-activity': {
    visualTask: '让学习者明确看见任务、材料、作答空间与反馈状态。',
    compositionGrammar: '题目或任务是第一焦点；材料与选项按操作顺序排列；答案、提示和解析属于不同状态，不在初始画面泄漏。',
    mediaStrategy: '题卡、可操作图形、标注练习、选择题、排序或预测活动；保持课堂投影可读。',
    truthBoundary: '题干、选项、答案和解析必须严格绑定，不能出现多余提示。',
    avoid: ['把答案画进题面', '过度游戏化界面', '密集小字'],
  },
  'map-timeline': {
    visualTask: '表现地理位置、迁移路径、历史阶段与空间—时间关系。',
    compositionGrammar: '地图或时间主轴占主体；地点、路线、事件和阶段使用一致编码；图例紧邻主图。',
    mediaStrategy: '准确底图、时间轴、路线、区域着色、史料小图和局部放大。',
    truthBoundary: '边界、地点、方向、年代和路线必须可核验；示意地图需明确其示意性质。',
    avoid: ['装饰性错误地图', '路线穿过标签', '年代间距暗示错误比例'],
  },
  'closing-synthesis': {
    visualTask: '把已学内容收束为一个可记忆、可复述的最终心智模型。',
    compositionGrammar: '一句结论为核心，三到五个记忆锚点围绕它形成层级；不引入新知识。',
    mediaStrategy: '概念星座、统一隐喻的终态、简洁关系总图或视觉回扣。',
    truthBoundary: '只总结前文已经建立的概念和证据。',
    avoid: ['新增术语', '感谢页', '平均九宫格总结'],
  },
};

function textOf(page) {
  return [page.title, page.purpose, page.coreLogic, page.contentKind, page.designBridge?.semanticStructure, page.designBridge?.visualOpportunity]
    .filter(Boolean).join(' ');
}

export function inferAudienceProfile(project = {}, contentPack = {}) {
  const text = [project.audience, project.title, project.contentPlanning?.instructions, contentPack.audience, contentPack.title]
    .filter(Boolean).join(' ');
  const matched = STAGES.find(([, pattern]) => pattern.test(text));
  const id = matched?.[0] || 'general';
  return { id, ...STAGE_CONTRACTS[id] };
}

export function audienceLabelFromQuery(query, topic) {
  const profile = inferAudienceProfile({ title: topic, audience: query, contentPlanning: { instructions: query } });
  return profile.id === 'general' ? `学习「${topic}」的课程学习者与授课教师` : `${profile.label}学习者与授课教师`;
}

export function selectSceneExpert(page, { index = 0, total = 1 } = {}) {
  const text = textOf(page);
  if (index === 0 || /导入|开场|情境|故事|想象/i.test(text)) return 'story-world';
  if (index === total - 1 || /总结|回顾|结语|takeaway|summary/i.test(text)) return 'closing-synthesis';
  if (page.code || /代码|算法执行|调用栈|指针|内存|伪代码|program|code/i.test(text)) return 'code-execution';
  if (page.series?.length || /统计|数据|实验结果|趋势|相关性|分布|消融|benchmark|metric/i.test(text)) return 'quantitative-figure';
  if (/公式|定理|证明|推导|几何|函数|方程|概率|坐标|角度|斜率|微积分|代数/i.test(text)) return 'math-derivation';
  if (/选择题|练习|课堂活动|讨论|判断题|作答|自测|实验任务|预测/i.test(text)) return 'exercise-activity';
  if (/地图|地理|区域|迁移|路线|疆域|战役|年代|时间线|历史阶段/i.test(text)) return 'map-timeline';
  if (/装置|剖面|解剖|爆炸图|部件|器官|结构层|空间位置/i.test(text)) return 'physical-spatial';
  if (/实验|反应|通路|机制|分子|细胞|遗传|化学|物理过程|变量控制/i.test(text)) return 'scientific-schematic';
  if (page.graph || /关系图|家系|网络|层级|依赖|知识图谱|树结构/i.test(text)) return 'relationship-map';
  if (/比较|对照|区别|异同|权衡|前后/i.test(text) || page.contentKind === 'comparison') return 'comparison-evidence';
  if (/过程|步骤|生命周期|演化|发展|阶段|遍历/i.test(text) || page.contentKind === 'process') return 'process-mechanism';
  if (/文学|小说|诗歌|人物|叙事|文本细读|史料|文化|艺术|哲学/i.test(text)) return 'humanities-editorial';
  return 'concept-explainer';
}

export function buildSceneDesign({ page, project, contentPack, index, total, override = {} }) {
  const audience = inferAudienceProfile(project, contentPack);
  const expertId = override.expertId || selectSceneExpert(page, { index, total });
  const expert = EXPERTS[expertId];
  if (!expert) throw new Error(`未知场景专家: ${expertId}`);
  const precisionMode = ['math-derivation', 'quantitative-figure', 'code-execution', 'map-timeline'].includes(expertId)
    ? 'deterministic-truth-first'
    : ['relationship-map', 'scientific-schematic', 'physical-spatial'].includes(expertId)
      ? 'hybrid-structure-first'
      : 'generative-art-direction';
  return {
    version: '1.0',
    expertId,
    audience,
    visualTask: override.visualTask || expert.visualTask,
    compositionGrammar: override.compositionGrammar || expert.compositionGrammar,
    mediaStrategy: override.mediaStrategy || expert.mediaStrategy,
    precisionMode: override.precisionMode || precisionMode,
    truthBoundary: override.truthBoundary || expert.truthBoundary,
    ageAdaptation: override.ageAdaptation || audience.adaptation,
    avoid: [...new Set([...(expert.avoid || []), ...(override.avoid || [])])],
    designFreedom: override.designFreedom || '在满足语义真值、受众适配和构图语法后，自主选择视觉隐喻、媒介、视角、尺度、节奏与风格组合。',
    provenance: ['Garden gpt-image-2 prompt taxonomy', 'Concept Diagrams visual grammar', 'Scientific figure contract pattern', 'Editorial slide design patterns'],
  };
}

export function sceneDesignPromptBrief(scene) {
  return [
    `场景专家：${scene.expertId}`,
    `页面视觉任务：${scene.visualTask}`,
    `构图语法：${scene.compositionGrammar}`,
    `媒介策略：${scene.mediaStrategy}`,
    `学段适配：${scene.ageAdaptation}`,
    `精度模式：${scene.precisionMode}`,
    `真值边界：${scene.truthBoundary}`,
    `避免：${scene.avoid.join('；')}`,
    `设计自由：${scene.designFreedom}`,
  ].join('\n');
}

export const SCENE_EXPERT_IDS = Object.freeze(Object.keys(EXPERTS));
