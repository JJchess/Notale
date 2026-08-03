import { resolveStylePreset } from './style-presets.mjs';
import { buildSceneDesign, sceneDesignPromptBrief } from './scene-design.mjs';

const OWNERS = new Set(['imagegen', 'html', 'svg', 'none']);

const DEFAULT_LAYOUT_BANK = [
  {
    id: 'cover-hero-path',
    pageTypes: ['cover'],
    visualSignature: '大标题与一条连续的概念演化路径共同构成封面，画面只有一个视觉中心。',
    contentCapacity: '标题 1 个、副标题 1 行、章节锚点 2–4 个。',
    bestFor: ['课程封面', '章节地图', '主题开场'],
    avoidFor: ['密集知识点', '多组数据', '代码'],
  },
  {
    id: 'concept-orbit',
    pageTypes: ['concept', 'content'],
    visualSignature: '一个中央概念主视觉，2–4 个术语或证据贴近对应对象环绕排布。',
    contentCapacity: '一个核心概念，2–4 个短解释。',
    bestFor: ['术语解释', '组成关系', '概念模型'],
    avoidFor: ['长段落', '多阶段流程'],
  },
  {
    id: 'constraint-frame',
    pageTypes: ['definition', 'content'],
    visualSignature: '中心定义由四周的约束共同框定，约束通过空间关系指向中心而非做成等权卡片。',
    contentCapacity: '一个定义，3–5 条约束。',
    bestFor: ['定义', '规则', '不变量'],
    avoidFor: ['时间序列', '代码'],
  },
  {
    id: 'diagram-hero-annotated',
    pageTypes: ['diagram'],
    visualSignature: '确定性关系图占主体 60%–72%，短注释贴近对象，结论形成安静的底部收束。',
    contentCapacity: '一个主图，0–3 个短注释，一句结论。',
    bestFor: ['树图', '网络图', '架构图', '路径解释'],
    avoidFor: ['卡片墙', '长段落'],
  },
  {
    id: 'metric-asymmetric-band',
    pageTypes: ['data'],
    visualSignature: '一个关键指标放大成为锚点，其余指标沿一条尺度带形成对照，不做仪表盘。',
    contentCapacity: '2–5 个指标，一句解释。',
    bestFor: ['指标解释', '复杂度对照', '结果摘要'],
    avoidFor: ['多段正文', '流程'],
  },
  {
    id: 'nested-recursion',
    pageTypes: ['concept'],
    visualSignature: '大结构中嵌套同构小结构，用尺度和重复关系解释递归。',
    contentCapacity: '一个递归主视觉，2–3 个步骤。',
    bestFor: ['递归', '分形', '层级拆解'],
    avoidFor: ['对比表', '密集数据'],
  },
  {
    id: 'comparison-dual-worlds',
    pageTypes: ['comparison'],
    visualSignature: '左右两种方法各形成完整视觉世界，中间只保留一条判断轴或权衡标尺。',
    contentCapacity: '两种方案，各 2–3 个短要点；中央 1 个判断依据。',
    bestFor: ['方法对照', '前后对比', '权衡选择'],
    avoidFor: ['三种以上方案', '长段落'],
  },
  {
    id: 'code-stage-callouts',
    pageTypes: ['code'],
    visualSignature: '真实代码占主体，2–3 个执行节点沿代码阅读方向形成注释路径。',
    contentCapacity: '6–12 行代码，2–3 个短注释。',
    bestFor: ['算法讲解', '代码走读'],
    avoidFor: ['伪 IDE 界面', '多窗口拼贴'],
  },
  {
    id: 'process-journey',
    pageTypes: ['process'],
    visualSignature: '一条有方向的连续路径串联 3–5 个阶段，阶段形态随语义变化而非重复卡片。',
    contentCapacity: '3–5 个阶段，每阶段一个短标题。',
    bestFor: ['流程', '演化', '算法步骤'],
    avoidFor: ['双方案比较', '密集表格'],
  },
  {
    id: 'decision-branches',
    pageTypes: ['decision'],
    visualSignature: '从一个核心问题出发，分支到 3–4 个选择结果；分支短、方向明确、无回环。',
    contentCapacity: '一个起点，3–4 个判断维度或结果。',
    bestFor: ['选择框架', '决策树', '课程总结'],
    avoidFor: ['复杂网络', '长正文'],
  },
  {
    id: 'summary-constellation',
    pageTypes: ['summary', 'closing'],
    visualSignature: '3–5 个关键词围绕一句核心结论形成有层级的收束画面。',
    contentCapacity: '一句结论，3–5 个关键词。',
    bestFor: ['总结', '结束页', '记忆锚点'],
    avoidFor: ['引入新知识', '复杂图表'],
  },
  {
    id: 'derivation-linked-steps',
    pageTypes: ['math'],
    visualSignature: '已知、关键变换与结论形成连续推导链，公式和几何图共享符号与强调色。',
    contentCapacity: '一个问题，3–6 个推导步骤，一个结论。',
    bestFor: ['公式推导', '几何证明', '例题讲解'],
    avoidFor: ['大段定义', '装饰插画'],
  },
  {
    id: 'scientific-mechanism-chain',
    pageTypes: ['scientific'],
    visualSignature: '实验、通路或机制主链占据画面主体，变量与观察结果贴近对应对象。',
    contentCapacity: '一个机制，3–6 个状态或部件，少量变量标签。',
    bestFor: ['实验装置', '生物通路', '反应机制'],
    avoidFor: ['未经验证的数据图', '科幻实验室背景'],
  },
  {
    id: 'humanities-editorial-spread',
    pageTypes: ['humanities'],
    visualSignature: '一个文本、人物或史料主锚点与编辑式解释形成跨栏节奏，氛围服务于细读。',
    contentCapacity: '一个主材料，2–4 个解释锚点，一句判断。',
    bestFor: ['文学赏析', '人物关系', '史料细读'],
    avoidFor: ['通用古风装饰', '头像墙'],
  },
  {
    id: 'activity-focus-state',
    pageTypes: ['activity'],
    visualSignature: '题目或任务是第一焦点，材料和作答区沿操作顺序组织，提示与答案保持状态隔离。',
    contentCapacity: '一个任务，2–5 个材料或选项，一个作答区域。',
    bestFor: ['课堂活动', '选择题', '预测与讨论'],
    avoidFor: ['答案泄漏', '密集小字'],
  },
  {
    id: 'map-time-axis',
    pageTypes: ['map'],
    visualSignature: '地图或时间主轴占主体，路线、事件和阶段使用一致编码并直接标注。',
    contentCapacity: '一个区域或时间段，3–6 个地点或事件。',
    bestFor: ['历史路线', '地理变化', '迁移与传播'],
    avoidFor: ['错误底图', '装饰性路线'],
  },
];

const MODEL_LAYOUT_BRIEFS = {
  'cover-hero-path': 'Use one continuous conceptual path as the hero visual. Place a large title in generous negative space and attach only a few short chapter anchors to the path.',
  'concept-orbit': 'Build one central explanatory visual. Place two to four short concepts close to the exact objects they explain, with an organic editorial rhythm rather than equal cards.',
  'constraint-frame': 'Place one definition at the center and let three to five constraints visually frame or shape it. Use spatial relationships instead of a repeated card grid.',
  'diagram-hero-annotated': 'Let one accurate diagram occupy roughly two thirds of the body. Keep connectors short and clear; attach only a few compact annotations and one quiet concluding line.',
  'metric-asymmetric-band': 'Make one metric the dominant anchor and arrange the remaining metrics along an asymmetric comparison band. Do not create a dashboard.',
  'nested-recursion': 'Show a large structure containing a smaller self-similar structure. Explain recursion through scale and repetition, with only a few nearby annotations.',
  'comparison-dual-worlds': 'Create two clearly different visual worlds for the two methods, left and right. Put a single trade-off axis or balancing device between them. Each side must feel complete, not like a generic card.',
  'code-stage-callouts': 'Make the real code block the largest object. Place two or three execution callouts along the reading direction. Avoid fake IDE chrome and multiple windows.',
  'process-journey': 'Use one directional continuous journey through three to five stages. Vary the stage shapes according to meaning instead of repeating identical boxes.',
  'decision-branches': 'Start from one central question and branch cleanly toward three or four outcomes. Keep branches short, directional, non-crossing, and free of loops.',
  'summary-constellation': 'Arrange three to five memorable concepts around one decisive closing statement. Build a strong final image without introducing new content.',
  'derivation-linked-steps': 'Create one inspectable reasoning chain from givens through three to six transformations to the conclusion. Keep mathematical symbols, colors, and geometry consistent across steps.',
  'scientific-mechanism-chain': 'Make one scientific mechanism or experimental chain the dominant visual. Bind variables, materials, arrows, and observed outcomes to the exact objects they describe.',
  'humanities-editorial-spread': 'Use one text, person, artifact, or archival image as the editorial anchor. Build a paced spread with close-reading annotations and atmospheric but truthful supporting imagery.',
  'activity-focus-state': 'Make the question or task the first visual focus. Arrange materials and response areas in action order while keeping hints, answers, and explanations in separate states.',
  'map-time-axis': 'Let an accurate map or time axis dominate. Encode places, routes, events, and periods consistently, with labels and legend adjacent to the evidence.',
};

function unique(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function semanticRole(page) {
  if (page.graph) return 'relationship-explainer';
  if (page.code) return 'code-walkthrough';
  if (page.series) return 'data-story';
  if ((page.claims || []).length >= 4) return 'evidence-synthesis';
  return 'editorial-explainer';
}

function defaultArchetype(page) {
  if (page.graph) return 'annotated-hero-diagram';
  if (page.code) return 'code-with-guided-annotation';
  if (page.series) return 'metric-hero-with-context';
  if ((page.claims || []).length >= 4) return 'editorial-evidence-field';
  return 'single-message-editorial';
}

function defaultPageType(page, index, total) {
  if (index === 0) return 'cover';
  if (index === total - 1) return 'summary';
  if (page.graph) return 'diagram';
  if (page.code) return 'code';
  if (page.series) return 'data';
  const text = `${page.title} ${page.purpose} ${page.coreLogic || ''} ${page.designBridge?.semanticStructure || ''}`;
  if (/公式|定理|证明|推导|几何|函数|方程|概率|坐标|角度/.test(text)) return 'math';
  if (/选择题|练习|课堂活动|讨论|判断题|作答|自测|预测/.test(text)) return 'activity';
  if (/地图|地理|区域|迁移|路线|疆域|战役|年代|时间线/.test(text)) return 'map';
  if (/实验|反应|通路|机制|分子|细胞|遗传|化学/.test(text)) return 'scientific';
  if (/文学|小说|诗歌|人物|叙事|文本细读|史料|文化|艺术|哲学/.test(text)) return 'humanities';
  if (/对照|比较|取决于|权衡/.test(`${page.title} ${page.purpose}`)) return 'comparison';
  if (/选择|决策|四个问题/.test(`${page.title} ${page.purpose}`)) return 'decision';
  if (/过程|步骤|推进|跃迁|遍历/.test(`${page.title} ${page.purpose}`)) return 'process';
  if (/递归|同构/.test(`${page.title} ${page.purpose}`)) return 'concept';
  if (/定义|约束|不变量|规则/.test(`${page.title} ${page.purpose}`)) return 'definition';
  return 'content';
}

function normalizeLayout(layout) {
  const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
  return {
    id: String(layout.id),
    pageTypes: unique(asArray(layout.pageTypes || layout.pageType || 'content')),
    visualSignature: String(layout.visualSignature || layout.summary || ''),
    contentCapacity: String(layout.contentCapacity || ''),
    bestFor: unique(asArray(layout.bestFor)),
    avoidFor: unique(asArray(layout.avoidFor)),
    modelBrief: String(layout.modelBrief || MODEL_LAYOUT_BRIEFS[layout.id] || 'Create one dominant explanatory visual with a clear reading path and generous negative space.'),
  };
}

function selectLayout(layoutBank, override, pageType) {
  const requested = override.layoutId || override.layoutBlueprint?.id;
  const selected = requested
    ? layoutBank.find(layout => layout.id === requested)
    : layoutBank.find(layout => layout.pageTypes.includes(pageType));
  if (!selected) throw new Error(`找不到适用于 ${pageType} 的版式${requested ? `: ${requested}` : ''}`);
  return { ...selected, ...(override.layoutBlueprint || {}) };
}

function defaultStyleSystem(design) {
  return {
    name: '现代中文教学编辑风',
    visualDirection: '像优秀教材编辑与信息设计师共同完成的课程页：知识结构先于装饰，图形有解释作用，整体有鲜明但克制的作者感。',
    canvas: '16:9 横版；安全边距充足；允许大胆不对称，但视觉重心稳定。',
    palette: `主色 ${design.colors?.primary || '#1557B0'}；深色 ${design.colors?.secondary || '#0B1F3A'}；强调 ${design.colors?.accent || '#E4552D'}；暖白背景。`,
    typography: '中文标题使用清晰有力量的现代黑体，正文使用高可读中文无衬线；字号差异明确；短句优先。',
    graphicLanguage: '二维编辑插画、抽象几何、清楚的关系线与少量手工质感；图形必须帮助解释概念。',
    depth: '平面为主，可用轻微纸张纹理和极克制阴影建立层次，不使用 3D 舞台或玻璃拟态。',
    density: '中等教学密度；一页一个学习目标；主体信息约占画布 55%–72%，保留真正留白。',
    recurringMotifs: ['细线章节标记', '单一朱红重点', '页底一句收束'],
    layoutUsageRule: '整套共享配色、字体、图形语言和边距；页面构图随教学任务变化，不重复同一套卡片。',
  };
}

function defaultZones(page) {
  const zones = [
    { id: 'header', purpose: '建立页面主题与阅读起点', priority: 1, elasticity: 'medium' },
  ];
  if (page.graph) {
    zones.push(
      { id: 'support', purpose: '放置少量解释性概念', priority: 3, elasticity: 'high' },
      { id: 'hero', purpose: '承载确定性关系图，保持干净且连续', priority: 1, elasticity: 'medium' },
      { id: 'metrics', purpose: '承载结构指标或证据', priority: 2, elasticity: 'high' },
    );
  } else if (page.code) {
    zones.push(
      { id: 'code', purpose: '承载可编辑代码与高亮', priority: 1, elasticity: 'medium' },
      { id: 'annotation', purpose: '解释关键执行路径', priority: 2, elasticity: 'high' },
    );
  } else if (page.series) {
    zones.push(
      { id: 'metric-hero', purpose: '形成一个主数据锚点', priority: 1, elasticity: 'high' },
      { id: 'context', purpose: '解释其余数据与因果', priority: 2, elasticity: 'high' },
    );
  } else {
    zones.push({ id: 'body', purpose: '承载论点与证据的视觉叙事', priority: 1, elasticity: 'high' });
  }
  zones.push({ id: 'takeaway', purpose: '收束核心结论', priority: 2, elasticity: 'high' });
  return zones;
}

function defaultOwnership(page) {
  return {
    background: 'imagegen',
    atmosphere: 'imagegen',
    decorativeIllustration: 'imagegen',
    title: 'html',
    body: 'html',
    graphTopology: page.graph ? 'svg' : 'none',
    graphLabels: page.graph ? 'html' : 'none',
    metrics: page.series ? 'html' : 'none',
    code: page.code ? 'html' : 'none',
  };
}

function defaultVisualCue(page) {
  if (page.graph) return '用边缘处若隐若现的分支节奏暗示层级与连接，但不要画任何可识别的节点、连线或图表。';
  if (page.code) return '用克制的嵌套层次与路径节奏暗示递归和执行顺序，但不要画代码窗口或字符。';
  if (page.series) return '用尺度、疏密和节奏差异暗示比较关系，但不要画坐标轴、数字或图表。';
  return '用抽象的视觉重心与留白支持单一论点，不要画具体界面或信息卡。';
}

function defaultQualityContract(page) {
  if (page.graph) {
    return {
      visualThesis: '让关系本身成为画面：主图必须比装饰、说明和指标更早被看见。',
      readingPath: ['标题命题', '中央关系主图', '两侧证据', '底部结论'],
      hierarchy: {
        dominant: '关系主图与页面命题',
        supporting: '概念解释与结构指标',
        quiet: '背景纹理、分隔线与装饰',
      },
      compositionPrinciples: [
        '只建立一个主视觉，不让辅助模块争夺焦点',
        '用尺度、位置和留白形成层级，而不是依赖阴影和发光',
        '让连线在节点之间保持连续、短而易追踪',
      ],
      finishCriteria: [
        '缩略图尺寸下仍能看出标题、主图和结论三个层级',
        '正文和副标题保持可靠对比度',
        '删除没有叙事作用的纹理、边框和装饰线',
      ],
    };
  }
  return {
    visualThesis: '用一个清晰的视觉命题承载页面结论，而不是把内容平均分配到模块。',
    readingPath: ['标题命题', '主视觉或主数据', '证据', '结论'],
    hierarchy: {
      dominant: '页面核心命题',
      supporting: '关键证据',
      quiet: '背景与非必要装饰',
    },
    compositionPrinciples: [
      '只建立一个主视觉',
      '用留白和尺度组织信息',
      '避免等权卡片网格',
    ],
    finishCriteria: [
      '缩略图下层级仍然成立',
      '文字具有可靠对比度',
      '每个视觉元素都服务于叙事',
    ],
  };
}

function mergeQualityContract(base, override = {}) {
  return {
    ...base,
    ...override,
    hierarchy: { ...base.hierarchy, ...(override.hierarchy || {}) },
    readingPath: override.readingPath || base.readingPath,
    compositionPrinciples: override.compositionPrinciples || base.compositionPrinciples,
    finishCriteria: override.finishCriteria || base.finishCriteria,
  };
}

function exactText(page) {
  return unique([
    page.title,
    page.purpose,
    ...(page.claims || []).map(claim => claim.text),
    ...(page.graph?.nodes || []).map(node => node.label),
    ...(page.series || []).flatMap(item => [String(item.value), item.label]),
    page.code?.source,
  ]);
}

function pageOverride(project, pageId) {
  const defaults = project.visualPlanning?.pageDefaults || {};
  const pages = project.visualPlanning?.pages;
  const specific = !pages
    ? {}
    : Array.isArray(pages)
      ? pages.find(item => item.id === pageId) || {}
      : pages[pageId] || {};
  const merge = (base, override) => {
    if (!base || typeof base !== 'object' || Array.isArray(base)) return override;
    if (!override || typeof override !== 'object' || Array.isArray(override)) return override;
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) result[key] = key in base ? merge(base[key], value) : value;
    return result;
  };
  return merge(defaults, specific);
}

function mergeOwnership(base, override = {}) {
  return Object.fromEntries(Object.entries({ ...base, ...override }).map(([field, owner]) => {
    if (!OWNERS.has(owner)) throw new Error(`renderOwnership.${field} 的所有者无效: ${owner}`);
    return [field, owner];
  }));
}

export function buildVisualPlan({ project, contentPack, design }) {
  const planning = project.visualPlanning || {};
  const inferredVisualDirection = contentPack.deckCharter?.visualDirection || {};
  const layoutBank = (planning.layoutBank || DEFAULT_LAYOUT_BANK).map(normalizeLayout);
  const preset = resolveStylePreset(planning.stylePreset);
  const styleSystem = { ...defaultStyleSystem(design), ...(preset || {}), ...(planning.styleSystem || {}) };
  const motifLibrary = unique(inferredVisualDirection.recurringMotifs || []);
  const styleKeywords = unique([
    ...(planning.styleKeywords || []),
    inferredVisualDirection.concept,
    ...(inferredVisualDirection.styleKeywords || []),
    design.styleLine,
    design.referenceMood,
  ]);
  return {
    version: '1.0',
    deck: {
      title: contentPack.title,
      audience: contentPack.audience || project.audience || '',
      intent: planning.deckIntent || contentPack.deckCharter?.thesis || `让受众理解并记住「${contentPack.title}」的核心逻辑`,
      narrativeArc: planning.narrativeArc || contentPack.storyMap?.narrativeArc || '先建立问题与概念，再用结构或证据解释，最后收束为可复述结论',
      density: planning.density || 'balanced',
      styleKeywords,
      motifLibrary,
      assetStrategy: planning.assetStrategy || 'AI 负责氛围、视觉隐喻与版式探索；HTML/SVG 负责可编辑文字、数据与拓扑真值。',
      promptSystem: planning.promptSystem || 'planned-v1',
      stylePreset: planning.stylePreset || null,
      styleSystem,
      layoutBank,
      sceneExpertSystem: {
        version: planning.sceneExpertSystem?.version || '1.0',
        routing: planning.sceneExpertSystem?.routing || 'content-and-audience',
        enabled: planning.sceneExpertSystem?.enabled !== false,
      },
    },
    pages: contentPack.pages.map((page, index) => {
      const override = pageOverride(project, page.id);
      const bridge = page.designBridge || {};
      const pageType = override.pageType || defaultPageType(page, index, contentPack.pages.length);
      const layoutBlueprint = selectLayout(layoutBank, override, pageType);
      const renderOwnership = mergeOwnership(defaultOwnership(page), override.renderOwnership);
      const inheritDeckStyle = override.imageIntent?.inheritDeckStyle !== false;
      const sceneDesign = buildSceneDesign({
        page,
        project,
        contentPack,
        index,
        total: contentPack.pages.length,
        override: override.sceneDesign || {},
      });
      return {
        id: page.id,
        sequence: index + 1,
        role: override.role || semanticRole(page),
        pageType,
        message: override.message || bridge.communicationTask || page.purpose,
        archetype: override.archetype || bridge.semanticStructure || defaultArchetype(page),
        layoutBlueprint,
        sceneDesign,
        pageDesignContract: {
          visualObjective: sceneDesign.visualTask,
          compositionGrammar: sceneDesign.compositionGrammar,
          mediaStrategy: sceneDesign.mediaStrategy,
          audienceAdaptation: sceneDesign.ageAdaptation,
          precisionMode: sceneDesign.precisionMode,
          truthBoundary: sceneDesign.truthBoundary,
          designFreedom: sceneDesign.designFreedom,
        },
        layoutIntent: override.layoutIntent || bridge.compositionGoal || '围绕一个主视觉建立清楚的阅读顺序；区域比例可由视觉导演调整，不要求等宽或等距。',
        hierarchy: override.hierarchy || ['message', 'hero', 'evidence', 'takeaway'],
        zones: override.zones || defaultZones(page),
        qualityContract: mergeQualityContract(defaultQualityContract(page), override.qualityContract),
        renderOwnership,
        semanticLocks: {
          exactText: override.semanticLocks?.exactText || exactText(page),
          copyPlan: override.semanticLocks?.copyPlan || page.displayCopy || [],
          graph: override.semanticLocks?.graph ?? page.graph ?? null,
          metrics: override.semanticLocks?.metrics || page.series || [],
          code: override.semanticLocks?.code ?? page.code ?? null,
        },
        imageIntent: {
          useCase: override.imageIntent?.useCase || (page.designBridge ? 'research-grounded-lecture' : 'stylized-concept'),
          assetType: override.imageIntent?.assetType || (page.designBridge ? 'complete 16:9 Chinese lecture slide' : 'full-frame abstract background plate for later compositing'),
          role: override.imageIntent?.role || 'background-plate',
          generationScope: override.imageIntent?.generationScope || 'background-plate',
          operation: override.imageIntent?.operation || 'generate',
          editInstructions: override.imageIntent?.editInstructions || '',
          invariants: override.imageIntent?.invariants || [],
          subject: override.imageIntent?.subject || bridge.imageSubject || page.coreLogic || page.purpose,
          visualCue: override.imageIntent?.visualCue || bridge.visualOpportunity || defaultVisualCue(page),
          seedreamBrief: override.imageIntent?.seedreamBrief || '',
          copyPlan: override.imageIntent?.copyPlan || [],
          modelBrief: override.imageIntent?.modelBrief || bridge.visualOpportunity || '',
          composition: override.imageIntent?.composition || bridge.compositionGoal || '用不对称但平衡的版式建立单一焦点，并为确定性内容层保留自然的负空间。',
          inheritDeckStyle,
          style: unique([...(override.imageIntent?.style || []), ...(inheritDeckStyle ? styleKeywords : [])]),
          avoid: unique([...(design.antiSlop || []), ...(inferredVisualDirection.avoid || []), ...(override.imageIntent?.avoid || [])]),
        },
        creativeFreedom: override.creativeFreedom || (bridge.creativeLevers?.length ? bridge.creativeLevers : [
          '主视觉隐喻与抽象程度',
          '不对称程度与留白节奏',
          '背景纹理、光影与微细节',
          '辅助几何的形状与尺度',
        ]),
      };
    }),
  };
}

export function validateVisualPlan(plan, contentPack) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('visual-plan 必须是对象');
  if (plan.version !== '1.0') throw new Error('visual-plan.version 必须是 1.0');
  if (!plan.deck || !Array.isArray(plan.pages)) throw new Error('visual-plan 需要 deck 与 pages');
  const semanticIds = new Set(contentPack.pages.map(page => page.id));
  const visualIds = new Set();
  for (const page of plan.pages) {
    if (!semanticIds.has(page.id)) throw new Error(`visual-plan 出现未知页面: ${page.id}`);
    if (visualIds.has(page.id)) throw new Error(`visual-plan 页面重复: ${page.id}`);
    visualIds.add(page.id);
    if (!page.role || !page.message || !page.archetype) throw new Error(`${page.id}: visual-plan 页面职责不完整`);
    if (!Array.isArray(page.zones) || !page.zones.length) throw new Error(`${page.id}: visual-plan.zones 不能为空`);
    for (const [field, owner] of Object.entries(page.renderOwnership || {})) {
      if (!OWNERS.has(owner)) throw new Error(`${page.id}: renderOwnership.${field} 的所有者无效: ${owner}`);
    }
    if (!page.semanticLocks || !Array.isArray(page.semanticLocks.exactText)) {
      throw new Error(`${page.id}: semanticLocks 不完整`);
    }
    if (!page.sceneDesign?.expertId || !page.pageDesignContract?.compositionGrammar) {
      throw new Error(`${page.id}: 场景专家或页面设计契约不完整`);
    }
  }
  if (visualIds.size !== semanticIds.size) throw new Error('visual-plan 必须覆盖 content-pack 的全部页面');
  return plan;
}

function imageOwnedFields(renderOwnership) {
  return Object.entries(renderOwnership).filter(([, owner]) => owner === 'imagegen').map(([field]) => field);
}

function deterministicFields(renderOwnership) {
  return Object.entries(renderOwnership).filter(([, owner]) => owner === 'html' || owner === 'svg');
}

function graphLevels(graph) {
  if (!graph?.nodes?.length) return [];
  const incoming = new Map(graph.nodes.map(node => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges || []) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const roots = graph.nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id);
  const queue = (roots.length ? roots : [graph.nodes[0].id]).map(id => [id, 0]);
  const depths = new Map();
  while (queue.length) {
    const [id, depth] = queue.shift();
    if (depths.has(id) && depths.get(id) <= depth) continue;
    depths.set(id, depth);
    for (const child of outgoing.get(id) || []) queue.push([child, depth + 1]);
  }
  for (const node of graph.nodes) if (!depths.has(node.id)) depths.set(node.id, 0);
  const grouped = [];
  for (const node of graph.nodes) {
    const depth = depths.get(node.id);
    if (!grouped[depth]) grouped[depth] = [];
    grouped[depth].push(node.label);
  }
  return grouped.filter(Boolean);
}

function structuredLayoutBrief(page, pagePlan) {
  const common = [
    '页眉约占画布高度 15%：章节标记、主标题、副标题严格对齐；不要出现比例、模板名或设计说明。',
    '主体约占画布高度 68%：只设置一个最强视觉锚点，辅助信息沿清楚的网格或轨道组织。',
    '底部约占画布高度 10%：用一句结论或视觉收束，不增加新的知识点。',
  ];
  if (page.graph) {
    const levels = graphLevels(page.graph).map((items, index) => `第 ${index + 1} 层：${items.join('、')}`).join('；');
    return [
      ...common,
      `主体采用「${pagePlan.archetype}」：关系图占主体面积至少 60%，节点与短连线优先于解释性装饰。`,
      `结构层级固定为：${levels}。同层节点等距，层间距离明显，连线不得交叉、折返或穿过文字。`,
      '解释只放在主图两侧或底部的少量注释区；不得自动扩写段落，不得给边添加标签。',
    ].join('\n');
  }
  if (page.code) {
    return [
      ...common,
      `主体采用「${pagePlan.archetype}」：代码区是最大视觉锚点，占主体宽度 52%–62%，使用真实等宽字体与清楚缩进。`,
      '另一侧只放 3 个执行步骤或一个算法路径图；不要伪造 IDE 菜单、窗口按钮、状态栏或额外代码。',
    ].join('\n');
  }
  if (page.series) {
    return [
      ...common,
      `主体采用「${pagePlan.archetype}」：一个指标作为视觉主锚点，其余指标形成对照，不要平均做成仪表盘卡片墙。`,
      '所有数值必须和标签绑定；不增加坐标刻度、百分比、趋势线或推导结果。',
    ].join('\n');
  }
  if (page.id === 'page-001') {
    return [
      '封面使用 16:9 全幅编辑式构图，标题占据左上至中上区域，保持大字号和大量呼吸空间。',
      '主体是一条从树枝分叉逐渐演变为图网络的连续视觉路径；它是唯一主视觉，不要放卡片墙。',
      '三个章节名称沿路径形成三个清楚停靠点，底部保持干净，不加页码、机构名或设计说明。',
    ].join('\n');
  }
  return [
    ...common,
    `主体采用「${pagePlan.archetype}」，围绕「${pagePlan.imageIntent.visualCue}」建立一个明确视觉命题。`,
    '论点数量必须和输入一致；用尺度、分组、连接或对比组织，不自动增加正文、标签或数据。',
  ].join('\n');
}

function semanticContentBrief(page) {
  const lines = [
    `主标题：「${page.title}」`,
    `副标题：「${page.purpose}」`,
  ];
  if (page.claims?.length) {
    lines.push('论点：');
    page.claims.forEach((claim, index) => lines.push(`${index + 1}. 「${claim.text}」`));
  }
  if (page.series?.length) {
    lines.push('指标：');
    page.series.forEach((item, index) => lines.push(`${index + 1}. 「${item.value}」—「${item.label}」`));
  }
  if (page.graph) {
    lines.push(`节点：${page.graph.nodes.map(node => `${node.id}=「${node.label}」`).join('；')}`);
    lines.push(`连线：${page.graph.edges.map(edge => `${edge.from}→${edge.to}`).join('；')}`);
  }
  if (page.code) {
    lines.push(`代码语言：${page.code.language}`);
    lines.push(`代码逐字内容：\n${page.code.source}`);
  }
  if (page.coreLogic) lines.push(`底部结论：「${page.coreLogic}」`);
  return lines.join('\n');
}

function styleSystemBrief(styleSystem) {
  return [
    `风格名称：${styleSystem.name}`,
    `视觉方向：${styleSystem.visualDirection}`,
    `画布与构图：${styleSystem.canvas}`,
    `配色：${styleSystem.palette}`,
    `字体层级：${styleSystem.typography}`,
    `图形语言：${styleSystem.graphicLanguage}`,
    `空间与质感：${styleSystem.depth}`,
    `信息密度：${styleSystem.density}`,
    `系列母题：${(styleSystem.recurringMotifs || []).join('、')}`,
    `跨页规则：${styleSystem.layoutUsageRule}`,
  ].join('\n');
}

function researchDisplayCopy(page, pagePlan) {
  const planned = (pagePlan.semanticLocks.copyPlan || [])
    .map(item => ({ role: item.role || '正文', text: String(item.text || '').trim() }))
    .filter(item => item.text);
  if (planned.length) {
    const bodyCopy = planned.filter(item => !/标题/.test(item.role) && item.text !== page.title);
    return [{ role: '主标题', text: page.title }, ...bodyCopy].slice(0, 7);
  }
  return [
    { role: '主标题', text: page.title },
    { role: '导语', text: page.purpose },
    ...(page.claims || []).slice(0, 3).map(claim => ({ role: '证据', text: claim.text })),
    ...(page.coreLogic ? [{ role: '结论', text: page.coreLogic }] : []),
  ].filter(item => item.text).slice(0, 7);
}

export function compileResearchGroundedSlidePrompt({ page, pagePlan, deckPlan }) {
  const bridge = page.designBridge || {};
  const copy = researchDisplayCopy(page, pagePlan);
  const graphLabels = page.graph?.nodes?.map(node => node.label).filter(Boolean) || [];
  const truthSeries = page.contentKind === 'data' ? (page.series || []) : [];
  const metricLabels = truthSeries.flatMap(item => [item.label, item.value]).filter(Boolean);
  const titleCopy = copy.filter(item => /标题/.test(item.role || '')).slice(0, 1);
  const conclusionCopy = copy.filter(item => /结论/.test(item.role || '')).slice(0, 1);
  const candidateCopy = page.graph
    ? [
        ...titleCopy,
        ...graphLabels.map(text => ({ role: '节点', text })),
        ...conclusionCopy,
      ].slice(0, 8)
    : [...copy, ...metricLabels.map(text => ({ role: '数据', text }))].slice(0, 7);
  const authorizedCopy = [];
  const seenCopy = new Set();
  for (const item of candidateCopy) {
    const text = String(item.text || '').trim();
    if (!text || seenCopy.has(text)) continue;
    seenCopy.add(text);
    authorizedCopy.push({ role: item.role || '正文', text });
  }
  const visibleCopy = authorizedCopy.map(item => `“${item.text}”`).join('\n');
  const labelById = new Map((page.graph?.nodes || []).map(node => [node.id, node.label]));
  const graphTruth = page.graph
    ? `关系真值：只使用白名单中的节点文字；连接只能是 ${page.graph.edges.map(edge => `“${labelById.get(edge.from)}”→“${labelById.get(edge.to)}”`).join('；')}。不得增删节点或连线，不显示节点编号。`
    : '';
  const metricTruth = truthSeries.length
    ? `数据真值：${truthSeries.map(item => `“${item.label}”=“${item.value}”`).join('；')}。数字与标签必须配对。`
    : '';
  const codeTruth = page.code
    ? `代码真值（${page.code.language}，保持逐字和缩进）：\n${page.code.source}`
    : '';
  const style = unique(deckPlan.styleKeywords || []).join('；');
  const motifRule = deckPlan.motifLibrary?.length
    ? `跨页母题库：${deckPlan.motifLibrary.join('；')}。母题只用于建立系列识别，本页最多选择一个且必须服务当前语义；不适合时完全不用。禁止把整个母题库同时塞进一页，也不要让同一母题连续主导多页。`
    : '没有强制跨页母题；优先让本页语义自然决定主视觉。';
  const creativeLevers = unique([...(pagePlan.creativeFreedom || []), ...(bridge.creativeLevers || [])]).join('；');
  const truthRisks = unique(bridge.truthRisks || []).join('；');
  const schemaOnlyRule = page.contentKind === 'data' && !page.series?.length
    ? '本页只提供字段结构，没有提供任何真实记录行。禁止生成表格正文、样例数据行、URL、时间戳、哈希串、趋势线、坐标轴或示例数字；把字段关系画成无额外文字的结构图。'
    : '';
  const semanticStructure = schemaOnlyRule
    ? '字段关系结构：每个字段只出现一次，用连线表达依赖；不是表格'
    : bridge.semanticStructure || page.contentKind || '围绕核心判断组织证据';
  const imageSubject = schemaOnlyRule
    ? '五个字段标签构成的清晰关系图，不出现单元格、表头或数据行'
    : bridge.imageSubject || pagePlan.imageIntent.subject;
  const visualOpportunity = schemaOnlyRule
    ? '用五个字段节点和短连线表现可追溯链路，所有非标签区域保持纯净'
    : bridge.visualOpportunity || pagePlan.imageIntent.visualCue;
  const sceneBrief = sceneDesignPromptBrief(pagePlan.sceneDesign);

  return `生成一张完整、可直接展示的横向中文讲义幻灯片画布，无水印、无页码、无品牌标识。画布内容必须贴满图像四边；不要把幻灯片放进屏幕、纸张、展板、相框、房间、书桌或任何场景照片中。

整套讲义命题：${deckPlan.intent}
叙事推进：${deckPlan.narrativeArc}
目标受众：${deckPlan.audience}
本页沟通任务：${bridge.communicationTask || page.purpose}
本页唯一判断：${page.coreLogic || page.purpose}

【必须逐字显示的页面文字】
${visibleCopy}
这是整张图片唯一的文字白名单。引号只是提示词边界，不属于页面文案；画面中不得出现引号、项目符号、序号、“主标题”“核心概念”“核心论点”“反证”“正解”“结论”“应用价值”“评估维度”等字段名或角色名。每条完整字符串全画面最多出现一次。除以上引号内的完整字符串本身外，不生成其它汉字、字母、数字、节点编号、占位符或伪文字；不要缩写、拆字、补写示例，不要显示来源编号、查询词或设计说明。图形内部如无白名单文字就保持纯色或留白，不得用细线冒充文字。不要使用带微型文字的照片缩略图、截图、文档页、书籍封面或界面控件。

【内容真值】
${graphTruth}
${metricTruth}
${codeTruth}
${schemaOnlyRule}

【设计桥】
语义关系：${semanticStructure}
画面对象：${imageSubject}
视觉机会：${visualOpportunity}
阅读体验：${bridge.compositionGoal || pagePlan.imageIntent.composition}
期望反应：${bridge.audienceResponse || '观众能快速理解并复述核心判断'}
可自由发挥：${creativeLevers || '构图、媒介、尺度、节奏和视觉隐喻'}
需要特别避免的真值风险：${truthRisks || '不要把装饰误画成数据或关系'}

【页面场景设计契约】
${sceneBrief}
场景专家名称、精度模式和以上设计术语都只是内部指令，绝对不能作为页面可见文字。场景能力决定页面如何表达，整套风格只决定它属于哪个视觉世界。

【整套视觉连续性】
${style || '当代中文知识编辑设计；清楚、克制、有鲜明视觉立场'}。${motifRule}同一讲义保持字体气质、色彩角色和图形语言一致，但本页构图必须由内容关系自然产生。不要套用固定模板，不要为了复杂而堆卡片、图标或无意义装饰，也不要模仿任何已命名系统的界面。

【完成度】
先在内部比较至少两种实质不同的画面组织方式，再选择最适合本页论证的一种；不要输出比较过程。最终画面要像资深信息设计师完成的成品：主次明确，中文清晰，连线不穿字，边距安全，投影环境下仍可读。`;
}

export function compileSeedreamNativeSlidePrompt({ page, pagePlan, deckPlan }) {
  if (!pagePlan?.layoutBlueprint) throw new Error(`${page.id}: Seedream 原生提示词缺少 layoutBlueprint`);
  const style = deckPlan.styleSystem.seedreamBrief
    || '高级中文知识课件，现代编辑设计，清晰信息图，专业排版，克制配色，留白自然。';
  const pageStyleHint = deckPlan.styleSystem.pageHints?.[page.id]
    || deckPlan.styleSystem.pageHints?.[pagePlan.pageType]
    || '';
  const composition = deckPlan.styleSystem.pageCompositions?.[page.id]
    || deckPlan.styleSystem.pageCompositions?.[pagePlan.pageType]
    || pagePlan.imageIntent.seedreamBrief
    || pagePlan.layoutBlueprint.visualSignature;
  const copyPlan = pagePlan.semanticLocks.copyPlan?.length
    ? pagePlan.semanticLocks.copyPlan
    : pagePlan.semanticLocks.exactText.map((text, index) => ({
        role: index === 0 ? '主标题' : index === pagePlan.semanticLocks.exactText.length - 1 ? '底部结论' : '正文',
        text,
      }));
  const copyLines = copyPlan.map(item => {
    const position = item.position ? `，${item.position}` : '';
    return `${item.role || '文字'}${position}：“${item.text}”`;
  }).join('；');

  return `生成一张横版高端中文技术课程 PPT 成品页。${style} ${pageStyleHint} ${composition} 画面具有一个强主视觉，图形真正解释知识，层级清楚，适合课堂投影，达到专业设计工作室交付质量。画面文字仅包含以下内容并逐字准确排版：${copyLines}。除引号内内容外，不生成任何文字、英文字母、数字、页码、色号、比例说明、设计注释、logo 或水印。不要网页界面，不要仪表盘，不要等权卡片墙，不要伪文字。`;
}

export function compileSeedreamCopyIsolatedPrompt({ page, pagePlan, deckPlan }) {
  if (!pagePlan?.layoutBlueprint) throw new Error(`${page.id}: Seedream copy-isolated prompt 缺少 layoutBlueprint`);
  const style = deckPlan.styleSystem.modelBrief
    || 'Premium editorial design for a Chinese technical lecture, with a disciplined palette, strong hierarchy and one explanatory hero visual.';
  const pageStyleHint = deckPlan.styleSystem.pageModelHints?.[page.id]
    || deckPlan.styleSystem.pageModelHints?.[pagePlan.pageType]
    || '';
  const composition = deckPlan.styleSystem.pageModelCompositions?.[page.id]
    || deckPlan.styleSystem.pageModelCompositions?.[pagePlan.pageType]
    || pagePlan.imageIntent.modelBrief
    || pagePlan.layoutBlueprint.modelBrief;
  const copyPlan = pagePlan.semanticLocks.copyPlan?.length
    ? pagePlan.semanticLocks.copyPlan
    : pagePlan.semanticLocks.exactText.map(text => ({ text }));
  const visibleCopy = copyPlan.map(item => `“${item.text}”`).join(' | ');

  return `Create one finished 16:9 premium lecture slide. Style system: ${style} ${pageStyleHint} Page composition: ${composition} Use one dominant explanatory visual, clear hierarchy, confident negative space, and presentation-scale typography. Visible copy contract: ${visibleCopy}. Render every quoted string exactly once and character-for-character. The quoted strings are the complete visible copy whitelist. Do not render any other Chinese characters, Latin letters, numbers, punctuation labels, captions, legends, annotations, UI text, page numbers, logos, watermarks, pseudo-text, or placeholder text. Never convert composition instructions into visible labels. Do not create a web interface, dashboard, equal-card grid, style guide, or template sheet.`;
}

export function compileArtDirectedSlidePrompt({ page, pagePlan, deckPlan, design, referenceRoles = [] }) {
  if (!pagePlan?.layoutBlueprint) throw new Error(`${page.id}: 原创成品页模式缺少 layoutBlueprint`);
  const layout = pagePlan.layoutBlueprint;
  const quality = pagePlan.qualityContract || defaultQualityContract(page);
  const references = referenceRoles.length
    ? referenceRoles.map((item, index) => `${index + 1}. ${item.role || 'visual-reference'}：${item.instruction || '只用于理解抽象设计规律，不得复制构图或内容。'}`).join('\n')
    : 'None. The design must be created from the written brief and must not imitate an existing slide.';
  const exactText = pagePlan.semanticLocks.exactText;
  const visibleCopy = exactText.map((text, index) => `${index + 1}. ${text}`).join('\n');
  const graphTruth = pagePlan.semanticLocks.graph
    ? `\nDiagram truth: use exactly these nodes: ${pagePlan.semanticLocks.graph.nodes.map(node => `${node.id}="${node.label}"`).join('; ')}. Use exactly these directed links: ${pagePlan.semanticLocks.graph.edges.map(edge => `${edge.from}->${edge.to}`).join('; ')}. Do not add nodes or route a connector through text.`
    : '';
  const styleBrief = deckPlan.styleSystem.modelBrief || [
    deckPlan.styleSystem.visualDirection,
    deckPlan.styleSystem.typography,
    deckPlan.styleSystem.graphicLanguage,
    deckPlan.styleSystem.depth,
    deckPlan.styleSystem.density,
  ].join(' ');
  const pageVisualBrief = pagePlan.imageIntent.modelBrief || 'Translate the lesson into one explanatory hero visual; use scale, grouping, connection, and whitespace to make the idea immediately understandable.';
  const prohibited = unique([...(design.antiSlop || []), ...(pagePlan.imageIntent.avoid || [])])
    .filter(item => /^[\x00-\x7F]*$/.test(item));
  const sceneBrief = sceneDesignPromptBrief(pagePlan.sceneDesign);

  return `Act as an award-winning presentation art director, information designer, and educational illustrator. Create one complete, original, production-ready widescreen lecture slide. This is the finished slide—not a background plate, website, template preview, style guide, or placeholder.

ART DIRECTION — instructions only, never print any words, codes, labels, or swatches from this section:
${styleBrief}

COMPOSITION — instructions only, never print the layout name or these directions:
${layout.modelBrief}
${pageVisualBrief}
Build a clear four-level hierarchy: title, explanatory hero visual, supporting evidence, closing takeaway. Prefer one strong visual thesis over equal cards. Use generous but purposeful negative space. Every diagram, icon, line, and decorative mark must explain the lesson.

SCENE DESIGN CONTRACT — instructions only, never print any term from this section:
${sceneBrief}

VISIBLE COPY — the following lines are the complete and exclusive set of text allowed to appear in the image. Render the Chinese exactly as written. Do not render the numbers that prefix this list. Do not invent, paraphrase, repeat, translate, or add any other characters:
${visibleCopy}${graphTruth}

QUALITY BAR:
- Sophisticated Chinese editorial design with the finish of a top educational publisher or specialist design studio.
- Clear, natural, highly legible Chinese typography; no corrupted glyphs or pseudo-text.
- Strong thumbnail hierarchy, accurate visual explanation, precise alignment, and clean non-crossing connectors.
- Allow bold scale shifts, asymmetric balance, and illustration-led storytelling. Avoid generic slide templates and repeated card grids.
- Keep all visible content comfortably inside the canvas. Do not add page numbers, aspect-ratio labels, color codes, font names, design annotations, logos, watermarks, or UI chrome.

INPUT IMAGES:
${references}

ADDITIONAL PROHIBITIONS — semantic hints only; never print these phrases:
${prohibited.join('; ')}; dashboard wall; cheap glow; glassmorphism; 3D stage; irrelevant people; stock-template look.

Return only the finished slide image.`;
}

export function compilePlannedImagePrompt({ page, pagePlan, deckPlan, design, ledger = [], referenceRoles = [] }) {
  if (!pagePlan) throw new Error(`${page.id}: 缺少 page visual plan`);
  const imageFields = imageOwnedFields(pagePlan.renderOwnership);
  const deterministic = deterministicFields(pagePlan.renderOwnership);
  const fullSlideMaster = pagePlan.imageIntent.generationScope === 'full-slide-master';
  const editMode = pagePlan.imageIntent.operation === 'edit';
  const hasInputImages = referenceRoles.length > 0;
  const hasLayoutMaster = referenceRoles.some(item => /layout-master|wireframe|edit-target|composition-master/i.test(item.role || ''));
  const imageOwnsText = fullSlideMaster || ['title', 'body', 'graphLabels', 'metrics', 'code'].some(
    field => pagePlan.renderOwnership[field] === 'imagegen',
  );
  const imageOwnsGraph = fullSlideMaster || pagePlan.renderOwnership.graphTopology === 'imagegen';
  const previous = ledger.length
    ? ledger.map(item => item.signature || item.emphasis || item.pageId).join('，')
    : '无';
  const references = referenceRoles.length
    ? referenceRoles.map((item, index) => `- 图片 ${index + 1}：${item.role || 'style-reference'}；${item.instruction || '只参考与本页职责相关的视觉语言，不复制内容。'}`).join('\n')
    : '- 无输入图片；独立完成视觉探索。';
  if (editMode) {
    return `Use case: precise-object-edit
Asset type: localized repair of an existing presentation source image
Input images:
${references}
Primary request: ${pagePlan.imageIntent.editInstructions}
Constraints: change only the explicitly named target regions. Keep unchanged: ${pagePlan.imageIntent.invariants.join('；') || 'all other pixels, text, shapes, colors, contrast, exposure, layout and proportions'}.
Text invariant: 不得改写、重排、增删任何未被点名的文字；不得生成新字符或伪文字。
Geometry invariant: 不得移动、缩放、重画或重新连接任何未被点名的节点、线条、面板和图标。
Color invariant: 保持输入图片原有的白场、深蓝、科技蓝、红色与金色的亮度、饱和度和对比度；禁止整体变白、褪色、降对比或重新调色。
Output intent: same-size complete image with only the requested local repair; everything else visually identical to the edit target.`;
  }
  const noText = imageOwnsText
    ? `只允许渲染这些逐字内容：${pagePlan.semanticLocks.exactText.map(text => `「${text}」`).join('、')}。不得增加其它字符。`
    : '零文字：不得出现汉字、字母、数字、百分比、刻度、代码、标签、伪文字、logo 或水印。NO TEXT, NO LETTERS, NO NUMBERS, NO GLYPHS.';
  const laterLayers = deterministic.length
    ? '全部文案、数据、图表、节点与连线会在后期由可编辑 HTML/SVG 精确叠加，本图不要预画或占用这些内容。'
    : '本图只承担位图视觉层，不要擅自增加说明性信息。';
  const backgroundOnly = pagePlan.imageIntent.generationScope === 'background-plate'
    || pagePlan.imageIntent.role === 'background-plate'
    || pagePlan.imageIntent.role === 'background-shell-and-art-direction';
  const structurePlate = pagePlan.imageIntent.generationScope === 'structure-plate'
    || pagePlan.imageIntent.role === 'structure-plate';
  const primaryRequest = editMode
    ? `以输入图片作为唯一编辑目标。${pagePlan.imageIntent.editInstructions}`
    : fullSlideMaster
    ? hasLayoutMaster
      ? '生成一张可以直接作为演示文稿源母图的完整横向成品页。输入布局母版中的信息结构、文字、数量和坐标都是硬约束，只提升视觉完成度。'
      : hasInputImages
        ? '生成一张可以直接作为演示文稿源母图的完整横向成品页。输入图片只用于锁定专业完成度、信息密度、对齐方式和视觉语言；不得复制其中的文字、品牌、业务内容或具体图形。'
        : '生成一张可以直接作为演示文稿源母图的完整横向成品页。依据视觉导演简报自行完成构图，不存在需要复制的输入母版。'
    : backgroundOnly
    ? '生成一张用于后期合成的纯抽象横向背景底板；它不是幻灯片成品，也不是信息图或界面截图。'
    : structurePlate
      ? '生成一张用于后期合成的无字横向结构底板：包含专业完成的背景、分区框架、装饰主视觉和必要容器，但不包含任何文字、数字、节点标签、图表数据或业务符号。'
    : `生成一个用于后期合成的视觉资产：${pagePlan.imageIntent.subject}`;
  const graphContract = imageOwnsGraph && pagePlan.semanticLocks.graph
    ? `Graph truth: 节点必须且只能是 ${pagePlan.semanticLocks.graph.nodes.map(node => `${node.id}=${node.label}`).join('；')}。连线必须且只能是 ${pagePlan.semanticLocks.graph.edges.map(edge => `${edge.from}->${edge.to}`).join('；')}。不得增加、删除、复制或改名。连线本身没有文字标签，禁止在线条或箭头旁生成字符。`
    : pagePlan.semanticLocks.graph
      ? 'Graph policy: 不绘制节点或连线；后续 SVG 层负责拓扑。'
      : '';
  const masterContract = fullSlideMaster
    ? 'Source-master contract: 这是源图生成阶段的完整母图；后续仍会把文字、数据与拓扑拆回 HTML/SVG。不要因为后续可编辑而省略任何可见内容。'
    : laterLayers;
  const constraints = editMode
    ? `只执行指定局部修改；保持不变：${pagePlan.imageIntent.invariants.join('；') || '输入图中未被点名的全部像素、布局、文字、图形、颜色和比例'}。不要重新设计页面。`
    : fullSlideMaster
    ? hasLayoutMaster
      ? '完整宽屏成品页，四周留出呼吸空间，不裁切。严格保留布局母版的区域数量、阅读顺序、文字位置、节点层级与指标数量；允许微调视觉比例和细节，但不能改变语义结构。'
      : '完整宽屏成品页，四周留出呼吸空间，不裁切。依据逐区域布局和阅读路径建立一个主视觉；输入参考只锁定设计质量，页面文字、节点、连线与指标必须来自本页语义真值。'
    : '完整的宽屏画面，边缘留出呼吸空间，不裁切。纯二维平面设计，不要舞台、观众、人物、会议室、屏幕、地板透视、展厅或任何真实场景。';
  const genericAvoid = fullSlideMaster
    ? '乱码；伪文字；额外模块；额外节点；额外指标；重复元素；网页 UI；仪表盘；设备外框；logo；水印；页码；素材网站感'
    : structurePlate
      ? '任何字符；伪文字；页码；比例标记；百分比；数据标签；重复容器；均匀卡片墙；网页 UI；仪表盘；设备外框；logo；水印；素材网站感'
    : '幻灯片边框；标题栏；内容面板；卡片墙；网页 UI；仪表盘；标尺；测量线；百分比；坐标标注；设备外框；素材网站感；廉价发光渐变';
  const outputIntent = editMode
    ? '完成指定局部修正后的同尺寸完整页面；除目标区域外与输入图保持一致。'
    : fullSlideMaster
    ? '可直接阅读、信息准确、现代克制、达到出版与大型科技公司正式发布水准的完整 PPT 源母图。'
    : structurePlate
      ? '专业、克制、可出版的无字结构底板，可直接放在可编辑 HTML/SVG 内容层之下。'
      : '安静、现代、克制、可出版的抽象背景资产，可直接放在排版内容层之下。';
  const quality = pagePlan.qualityContract || defaultQualityContract(page);
  const layoutBrief = structuredLayoutBrief(page, pagePlan);
  const contentBrief = semanticContentBrief(page);
  const directorBrief = `Art director brief (goals, not a rigid template):
- Visual thesis: ${quality.visualThesis}
- Reading path: ${quality.readingPath.join(' → ')}
- Hierarchy: dominant=${quality.hierarchy.dominant}; supporting=${quality.hierarchy.supporting}; quiet=${quality.hierarchy.quiet}
- Composition principles: ${quality.compositionPrinciples.join('；')}
- Finish bar: ${quality.finishCriteria.join('；')}`;

  return `Use case: ${pagePlan.imageIntent.useCase}
Asset type: ${pagePlan.imageIntent.assetType}
Primary request: ${primaryRequest}

${directorBrief}

Reference-led finish contract:
- 输入参考图用于校准专业完成度：学习其严格网格、对齐精度、标题层级、面板边缘、图标一致性、留白与信息密度。
- 不复制参考图文字、品牌、业务内容或具体图形；本页内容只来自下方 Semantic content。
- 画面应像专业设计师在 Figma/Illustrator 中完成的正式技术教材页面，而不是 AI 概念草图、网页截图或模板占位图。

Spatial layout contract:
${layoutBrief}

Semantic content (the complete source of truth; do not invent additions):
${contentBrief}

Visual cue: ${pagePlan.imageIntent.visualCue}
Style/medium: flat two-dimensional editorial art direction; ${pagePlan.imageIntent.style.join('；')}。
Composition/framing: wide full-frame composition; ${pagePlan.imageIntent.composition} 中央或主要内容承载区保持安静、连续、低噪声。不要把区域画成等权卡片网格。
Creative freedom: ${pagePlan.creativeFreedom.join('、')}。构图原型只是启发，可以自由改变非对称程度、视觉轴线与留白节奏。
Raster responsibility: ${fullSlideMaster ? '负责完整源母图' : `只负责 ${imageFields.join('、') || '背景氛围'}`}。${masterContract}
Text policy: ${noText} 文字区域之外保持真正空白；禁止用伪文字、小字段落或装饰字符填充空间。禁止出现“16:9”“宽屏设计”“模板”“章节设计”“PPT”等元文字。
${graphContract}
Cross-page variety: 避免复用此前视觉签名 ${previous} 的构图节奏。

Input images:
${references}

Constraints: ${constraints}
Decomposition readiness: 背景纹理保持极淡；文字与图标不要烧结进复杂纹理；容器边界完整、连接线连续、图标彼此分离，为后续背景/框架/图标/文字四层拆分保留清楚边界。
Avoid: ${pagePlan.imageIntent.avoid.join('；')}；${genericAvoid}；会议照片；无关人物；自动扩写；设计说明；比例标记。
Output intent: ${outputIntent}`;
}
