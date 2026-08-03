import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualPlan, compileArtDirectedSlidePrompt, compilePlannedImagePrompt, compileResearchGroundedSlidePrompt, compileSeedreamCopyIsolatedPrompt, compileSeedreamNativeSlidePrompt, validateVisualPlan } from '../src/visual-plan.mjs';

const page = {
  id: 'page-001',
  title: '树的结构',
  purpose: '看懂真实父子关系。',
  coreLogic: '父子关系定义结构。',
  claims: [{ text: 'A 是根节点。', sourceIds: ['src-01'] }],
  graph: {
    nodes: [{ id: 'a', label: 'A · 根' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'a', to: 'b' }],
  },
  series: [{ label: '节点数量', value: 2 }],
};

const contentPack = { version: '2.0', title: '树', audience: '学习者', pages: [page] };
const design = {
  styleLine: '克制的编辑式科技信息图',
  referenceMood: '出版级',
  colors: { primary: '#1464b4', secondary: '#08254b', accent: '#d81e06' },
  antiSlop: ['禁止卡片堆叠'],
  canvas: { width: 1440, height: 900, safeInset: 56 },
};

test('visual plan 把图像探索与语义真值分配到不同渲染层', () => {
  const plan = validateVisualPlan(buildVisualPlan({ project: { title: '树' }, contentPack, design }), contentPack);
  assert.equal(plan.pages[0].renderOwnership.background, 'imagegen');
  assert.equal(plan.pages[0].renderOwnership.graphTopology, 'svg');
  assert.equal(plan.pages[0].renderOwnership.graphLabels, 'html');
  assert.equal(plan.pages[0].renderOwnership.title, 'html');
  assert.equal(plan.pages[0].sceneDesign.expertId, 'story-world');
  assert.ok(plan.pages[0].pageDesignContract.compositionGrammar.length > 20);
});

test('planned prompt 把控制面压缩成位图 asset brief，不泄漏量尺和语义真值', () => {
  const plan = buildVisualPlan({ project: { title: '树' }, contentPack, design });
  const prompt = compilePlannedImagePrompt({
    page,
    pagePlan: plan.pages[0],
    deckPlan: plan.deck,
    design,
    ledger: [],
  });
  assert.match(prompt, /纯抽象横向背景底板/);
  assert.match(prompt, /后期由可编辑 HTML\/SVG 精确叠加/);
  assert.match(prompt, /NO TEXT, NO LETTERS, NO NUMBERS/);
  assert.doesNotMatch(prompt, /优先级|安全边距|\d+px|graphTopology→svg/);
  assert.match(prompt, /构图原型只是启发/);
});

test('visual planning 可覆盖构图原型但不能把所有权写成未知渲染器', () => {
  const project = {
    title: '树',
    visualPlanning: { pages: { 'page-001': { archetype: '自由编辑式构图', renderOwnership: { title: 'canvas' } } } },
  };
  assert.throws(() => buildVisualPlan({ project, contentPack, design }), /所有者无效/);
});

test('单个图像资产可脱离整页风格词独立路由', () => {
  const project = {
    title: '树',
    visualPlanning: {
      styleKeywords: ['整页科技仪表盘'],
      pages: {
        'page-001': { imageIntent: { inheritDeckStyle: false, style: ['瑞士编辑式背景'] } },
      },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  assert.deepEqual(plan.pages[0].imageIntent.style, ['瑞士编辑式背景']);
  assert.equal(plan.pages[0].imageIntent.inheritDeckStyle, false);
});

test('full-slide-master 使用源图语义锁，但不改变最终 HTML/SVG 所有权', () => {
  const project = {
    title: '树',
    visualPlanning: { pages: { 'page-001': {
      semanticLocks: { exactText: ['树的结构', 'A', 'B'] },
      imageIntent: { generationScope: 'full-slide-master' },
    } } },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compilePlannedImagePrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck, design });
  assert.equal(plan.pages[0].renderOwnership.graphTopology, 'svg');
  assert.match(prompt, /负责完整源母图/);
  assert.match(prompt, /「树的结构」、「A」、「B」/);
  assert.match(prompt, /连线必须且只能是 a->b/);
  assert.match(prompt, /连线本身没有文字标签/);
  assert.match(prompt, /Art director brief/);
  assert.match(prompt, /标题命题 → 中央关系主图/);
  assert.match(prompt, /不存在需要复制的输入母版/);
  assert.doesNotMatch(prompt, /严格保留布局母版/);
});

test('规划阶段可以覆盖视觉导演目标，但不会把它变成固定坐标模板', () => {
  const project = {
    title: '树',
    visualPlanning: { pages: { 'page-001': {
      qualityContract: {
        visualThesis: '一眼看清父子关系，而不是先看到装饰。',
        readingPath: ['命题', '关系', '结论'],
        finishCriteria: ['副标题与正文均具备高对比度'],
      },
      imageIntent: { generationScope: 'full-slide-master' },
    } } },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compilePlannedImagePrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck, design });
  assert.match(prompt, /一眼看清父子关系/);
  assert.match(prompt, /命题 → 关系 → 结论/);
  assert.match(prompt, /goals, not a rigid template/);
  assert.doesNotMatch(prompt, /x=|y=|grid-template/);
});

test('20 页实验可用 pageDefaults 统一声明完整母图策略，再按页覆盖', () => {
  const project = {
    title: '树',
    visualPlanning: {
      pageDefaults: {
        imageIntent: { generationScope: 'full-slide-master', style: ['统一出版风'] },
        creativeFreedom: ['留白节奏'],
      },
      pages: { 'page-001': { imageIntent: { visualCue: '关系图占主导' } } },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  assert.equal(plan.pages[0].imageIntent.generationScope, 'full-slide-master');
  assert.equal(plan.pages[0].imageIntent.visualCue, '关系图占主导');
  assert.deepEqual(plan.pages[0].creativeFreedom, ['留白节奏']);
});

test('原创成品页模式把设计 DNA 与页面版式在规划阶段绑定', () => {
  const project = {
    title: '树',
    visualPlanning: {
      promptSystem: 'art-directed-v2',
      styleSystem: {
        name: '原创教学编辑风',
        visualDirection: '知识结构先于装饰。',
      },
      pages: { 'page-001': { pageType: 'diagram', layoutId: 'diagram-hero-annotated' } },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const pagePlan = plan.pages[0];
  assert.equal(plan.deck.styleSystem.name, '原创教学编辑风');
  assert.equal(pagePlan.layoutBlueprint.id, 'diagram-hero-annotated');
  const prompt = compileArtDirectedSlidePrompt({ page, pagePlan, deckPlan: plan.deck, design });
  assert.match(prompt, /complete, original, production-ready/);
  assert.match(prompt, /not a background plate/);
  assert.match(prompt, /ART DIRECTION/);
  assert.match(prompt, /one accurate diagram occupy roughly two thirds/);
  assert.match(prompt, /must be created from the written brief/);
  assert.doesNotMatch(prompt, /后期由可编辑 HTML\/SVG 精确叠加/);
});

test('Seedream 原生提示词保持短自然语言并把可见文字逐项加引号', () => {
  const project = {
    title: '树',
    visualPlanning: {
      styleSystem: { seedreamBrief: '暖白纸张上的高端手绘技术解释风。' },
      pages: { 'page-001': {
        pageType: 'diagram',
        layoutId: 'diagram-hero-annotated',
        semanticLocks: {
          exactText: ['树的结构', '父子关系定义结构。'],
          copyPlan: [
            { role: '主标题', position: '左上方', text: '树的结构' },
            { role: '结论', position: '底部', text: '父子关系定义结构。' },
          ],
        },
        imageIntent: { seedreamBrief: '中央绘制一棵两层树，连线短而清楚。' },
      } },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compileSeedreamNativeSlidePrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /主标题，左上方：“树的结构”/);
  assert.match(prompt, /结论，底部：“父子关系定义结构。”/);
  assert.match(prompt, /除引号内内容外/);
  assert.ok(prompt.length < 800);
  assert.doesNotMatch(prompt, /#[0-9A-Fa-f]{6}/);
});

test('Seedream copy-isolated 提示词把中文限制在可见文案引号内', () => {
  const project = {
    title: '树',
    visualPlanning: {
      stylePreset: 'dark-data-editorial',
      pages: {
        'page-001': {
          pageType: 'diagram',
          semanticLocks: {
            exactText: ['树结构', '根节点', '叶节点'],
            copyPlan: [
              { role: '主标题', position: '左上', text: '树结构' },
              { role: '节点一', position: '顶部', text: '根节点' },
              { role: '节点二', position: '底部', text: '叶节点' },
            ],
          },
          imageIntent: {
            modelBrief: 'Place one strict three-node tree in the center. Put the title at upper left and the two labels at root and leaf.',
          },
        },
      },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compileSeedreamCopyIsolatedPrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /“树结构” \| “根节点” \| “叶节点”/);
  assert.doesNotMatch(prompt.replace(/“[^”]*”/g, ''), /[\u3400-\u9fff]/);
  assert.doesNotMatch(prompt, /左上|顶部|底部|主标题|节点一|节点二/);
});

test('视觉规划可选择内置风格 preset，并允许项目级覆盖', () => {
  const project = {
    title: '树',
    visualPlanning: {
      stylePreset: 'swiss-editorial',
      styleSystem: { density: '低密度封面节奏' },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  assert.equal(plan.deck.stylePreset, 'swiss-editorial');
  assert.equal(plan.deck.styleSystem.name, '瑞士网格知识编辑风');
  assert.equal(plan.deck.styleSystem.density, '低密度封面节奏');
  assert.match(plan.deck.styleSystem.seedreamBrief, /瑞士国际主义/);
  assert.throws(
    () => buildVisualPlan({ project: { visualPlanning: { stylePreset: 'missing-style' } }, contentPack, design }),
    /未知 visualPlanning\.stylePreset/,
  );
});

test('风格 preset 可按页面角色追加约束而不替换页面构图', () => {
  const project = {
    title: '树',
    visualPlanning: {
      stylePreset: 'swiss-editorial',
      pages: {
        'page-001': {
          pageType: 'concept',
          imageIntent: { seedreamBrief: '主体是一张六节点关系图。' },
        },
      },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const pagePlan = plan.pages[0];
  const prompt = compileSeedreamNativeSlidePrompt({ page, pagePlan, deckPlan: plan.deck });
  assert.match(prompt, /整页连续暖白底/);
  assert.match(prompt, /主体是一张六节点关系图/);
});

test('跨主题风格库包含水墨、黏土与新粗野主义三个可选 preset', () => {
  for (const stylePreset of ['ink-wash-systems', 'clay-isometric-learning', 'neo-brutalist-signal']) {
    const plan = buildVisualPlan({
      project: { title: '网络请求', visualPlanning: { stylePreset } },
      contentPack,
      design,
    });
    assert.equal(plan.deck.stylePreset, stylePreset);
    assert.ok(plan.deck.styleSystem.seedreamBrief.length > 40);
    assert.ok(plan.deck.styleSystem.layoutUsageRule.length > 10);
    if (stylePreset === 'clay-isometric-learning') {
      assert.match(plan.deck.styleSystem.pageHints.summary, /关键词数量完全一致/);
      assert.match(plan.deck.styleSystem.pageCompositions.summary, /中央白色圆形诊断镜/);
    }
    if (stylePreset === 'neo-brutalist-signal') {
      assert.match(plan.deck.styleSystem.pageHints.summary, /不要黑色中央面板/);
      assert.match(plan.deck.styleSystem.pageCompositions.summary, /copy plan/);
    }
  }
});

test('风格 preset 可替换页面构图但保留语义文字白名单', () => {
  const project = {
    title: '网络请求',
    visualPlanning: {
      stylePreset: 'clay-isometric-learning',
      pages: {
        'page-001': {
          pageType: 'summary',
          semanticLocks: { exactText: ['排障总结', '地址', '连接'] },
          imageIntent: { seedreamBrief: '基础构图是一条四级阶梯。' },
        },
      },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compileSeedreamNativeSlidePrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /中央白色圆形诊断镜/);
  assert.doesNotMatch(prompt, /基础构图是一条四级阶梯/);
  assert.match(prompt, /“排障总结”/);
});

test('风格 preset 不把上一讲义的关键词泄漏到新主题', () => {
  const project = {
    title: '数据结构',
    visualPlanning: {
      stylePreset: 'neo-brutalist-signal',
      pages: {
        'page-001': {
          pageType: 'summary',
          semanticLocks: {
            exactText: ['结构总结', '关系', '约束', '操作', '复杂度'],
            copyPlan: [
              { role: '主标题', text: '结构总结' },
              { role: '关键词一', text: '关系' },
              { role: '关键词二', text: '约束' },
              { role: '关键词三', text: '操作' },
              { role: '关键词四', text: '复杂度' },
            ],
          },
        },
      },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compileSeedreamNativeSlidePrompt({ page, pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /“关系”/);
  assert.match(prompt, /“复杂度”/);
  assert.doesNotMatch(prompt, /“(?:地址|连接|协议|应用)”/);
});

test('风格参考图只锁定完成度，不会被误声明为布局母版', () => {
  const project = {
    title: '树',
    visualPlanning: {
      pageDefaults: { imageIntent: { generationScope: 'full-slide-master' } },
    },
  };
  const plan = buildVisualPlan({ project, contentPack, design });
  const prompt = compilePlannedImagePrompt({
    page,
    pagePlan: plan.pages[0],
    deckPlan: plan.deck,
    design,
    referenceRoles: [
      { role: 'finish-density-reference', instruction: '只学习完成度与信息密度。' },
      { role: 'palette-reference', instruction: '只学习配色与编辑式节奏。' },
    ],
  });
  assert.match(prompt, /输入图片只用于锁定专业完成度/);
  assert.match(prompt, /Reference-led finish contract/);
  assert.match(prompt, /Spatial layout contract/);
  assert.match(prompt, /Semantic content/);
  assert.match(prompt, /第 1 层：A · 根/);
  assert.match(prompt, /第 2 层：B/);
  assert.doesNotMatch(prompt, /输入布局母版中的信息结构/);
  assert.match(prompt, /禁止出现“16:9”“宽屏设计”“模板”/);
});

test('研究型提示词消费页面设计桥且不泄漏来源编号或固定模板', () => {
  const researchedPage = {
    ...page,
    displayCopy: [
      { role: '主标题', text: '模型生成的第二标题' },
      { role: '主标题', text: '树的结构' },
      { role: '结论', text: '父子关系定义结构。' },
    ],
    designBridge: {
      communicationTask: '让学习者先看懂父子关系。',
      semanticStructure: '从根到叶的层级关系',
      imageSubject: '一棵由真实节点与边构成的树',
      visualOpportunity: '用分叉方向表现父子关系',
      compositionGoal: '先读结构，再读结论',
      audienceResponse: '能够复述树的结构定义',
      truthRisks: ['不得增加节点'],
      creativeLevers: ['空间张力'],
    },
  };
  const researchedPack = { ...contentPack, pages: [researchedPage], deckCharter: { thesis: '用关系理解树' }, storyMap: { narrativeArc: '关系 → 结构 → 操作' } };
  const plan = buildVisualPlan({
    project: { title: '树', visualPlanning: { styleKeywords: ['当代知识编辑设计'] } },
    contentPack: researchedPack,
    design,
  });
  const prompt = compileResearchGroundedSlidePrompt({ page: researchedPage, pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /让学习者先看懂父子关系/);
  assert.match(prompt, /用分叉方向表现父子关系/);
  assert.match(prompt, /页面场景设计契约/);
  assert.match(prompt, /关系本身成为画面|连续场景作为画面主体/);
  assert.match(prompt, /“A · 根”→“B”/);
  assert.doesNotMatch(prompt, /a=“A · 根”|a->b/);
  const whitelist = prompt.match(/【必须逐字显示的页面文字】\n([\s\S]*?)\n这是整张图片唯一的文字白名单/)[1];
  assert.match(whitelist, /“A · 根”/);
  assert.match(whitelist, /“树的结构”/);
  assert.doesNotMatch(whitelist, /主标题|节点|结论|\d+\./);
  assert.match(prompt, /不得出现引号、项目符号、序号、“主标题”/);
  assert.doesNotMatch(prompt, /模型生成的第二标题/);
  assert.match(prompt, /不要把幻灯片放进屏幕、纸张、展板、相框、房间、书桌/);
  assert.doesNotMatch(prompt, /16:9|高分辨率/);
  assert.doesNotMatch(prompt, /src-01|web-001|layoutBank|三栏模板/);

  const schemaPrompt = compileResearchGroundedSlidePrompt({
    page: { ...researchedPage, contentKind: 'data', series: [] },
    pagePlan: plan.pages[0],
    deckPlan: plan.deck,
  });
  assert.match(schemaPrompt, /没有提供任何真实记录行/);
  assert.match(schemaPrompt, /禁止生成表格正文、样例数据行/);
  assert.match(schemaPrompt, /不是表格/);

  const processPrompt = compileResearchGroundedSlidePrompt({
    page: { ...researchedPage, contentKind: 'process', series: [{ label: '无关硬件', value: '3090' }] },
    pagePlan: plan.pages[0],
    deckPlan: plan.deck,
  });
  assert.doesNotMatch(processPrompt, /无关硬件|3090/);
});

test('研究型提示词把跨页母题作为可选库而不是每页强制风格词', () => {
  const pack = {
    ...contentPack,
    deckCharter: {
      visualDirection: {
        concept: '记忆的螺旋',
        styleKeywords: ['泛黄手稿质感'],
        recurringMotifs: ['黄蝴蝶', '破碎的镜子', '无限长廊'],
      },
    },
  };
  const plan = buildVisualPlan({ project: { title: '文学课' }, contentPack: pack, design });
  assert.deepEqual(plan.deck.motifLibrary, ['黄蝴蝶', '破碎的镜子', '无限长廊']);
  assert.equal(plan.deck.styleKeywords.some(item => item.startsWith('跨页母题：')), false);
  const prompt = compileResearchGroundedSlidePrompt({ page: pack.pages[0], pagePlan: plan.pages[0], deckPlan: plan.deck });
  assert.match(prompt, /本页最多选择一个/);
  assert.match(prompt, /不适合时完全不用/);
  assert.match(prompt, /禁止把整个母题库同时塞进一页/);
});
