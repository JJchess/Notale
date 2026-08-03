import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { researchPlanningContentProvider, scoreSearchResultRelevance } from '../src/content-planner.mjs';

function jsonResponse(value) {
  return new Response(JSON.stringify({
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function pageContract(index, title, evidenceId) {
  return {
    index,
    title,
    purpose: `${title}的页面目的`,
    coreLogic: `${title}的核心判断`,
    contentKind: 'explanation',
    claims: [{ text: `${title}的有据事实`, evidenceIds: [evidenceId], supportQuote: '原始支持片段' }],
    metrics: [],
    relations: null,
    codeExample: null,
    displayCopy: [{ role: '主标题', text: title }, { role: '结论', text: `${title}的核心判断` }],
    designBridge: {
      communicationTask: `解释${title}`,
      semanticStructure: '因果解释',
      imageSubject: `${title}的主要对象`,
      visualOpportunity: `${title}的关系变化`,
      compositionGoal: '先看到关系，再看到结论',
      audienceResponse: '能够复述',
      truthRisks: ['不要混淆因果与相关'],
      creativeLevers: ['尺度与节奏'],
    },
  };
}

test('research planner 确实执行搜索并把 web evidence 编译进页面合同', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-content-planner-'));
  const envName = `WORKFLOW_PLANNER_KEY_${process.pid}`;
  process.env[envName] = 'test-secret';
  await writeFile(path.join(temp, 'brief.md'), '# 本地目标\n建立一个有证据的三页讲义。');
  const chatOutputs = [
    {
      deckQuestion: '如何把研究转成讲义？',
      audienceNeed: '看清证据到页面的链路',
      facets: [
        { id: 'q1', question: '证据如何收集？', query: 'evidence research official', desiredEvidence: '官方说明' },
        { id: 'q2', question: '页面如何规划？', query: 'presentation planning paper', desiredEvidence: '论文' },
      ],
    },
    {
      deckThesis: '先研究，再组织，最后生成。',
      narrativeArc: '问题 → 研究 → 页面',
      sections: [{ id: 's1', title: '主线', job: '解释链路' }],
      pages: [
        { index: 1, sectionId: 's1', title: '为什么先研究', job: '提出问题', coreMessage: '事实先于页面', evidenceIds: ['src-01', 'web-001'], contentKind: 'opening', visualOpportunity: '输入到证据' },
        { index: 2, sectionId: 's1', title: '来源形成账本', job: '解释研究', coreMessage: '搜索结果必须可追踪', evidenceIds: ['web-001', 'web-002'], contentKind: 'process', visualOpportunity: '查询汇聚为证据' },
        { index: 3, sectionId: 's1', title: '证据进入页面', job: '完成收束', coreMessage: '每个判断都有来源', evidenceIds: ['src-01', 'web-002'], contentKind: 'summary', visualOpportunity: '证据连接页面' },
      ],
    },
    { pages: [pageContract(1, '为什么先研究', 'web-001'), pageContract(2, '来源形成账本', 'web-002')] },
    { pages: [pageContract(3, '证据进入页面', 'web-002')] },
  ];
  let chatIndex = 0;
  const calls = [];
  const chatBodies = [];
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Evidence research official source A</title><link>https://example.test/a</link><description>Evidence research official guidance</description></item>
    <item><title>Presentation planning paper source B</title><link>https://example.test/b</link><description>Presentation planning paper evidence</description></item>
  </channel></rss>`;
  const fetchImpl = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).endsWith('/chat/completions')) {
      chatBodies.push(JSON.parse(options.body));
      return jsonResponse(chatOutputs[chatIndex++]);
    }
    if (String(url).startsWith('https://www.bing.com/search')) return new Response(rss, { status: 200, headers: { 'content-type': 'text/xml' } });
    if (String(url).startsWith('https://example.test/')) return new Response('<main><h1>Official</h1><p>原始支持片段。可靠的研究证据。</p></main>', { status: 200, headers: { 'content-type': 'text/html' } });
    throw new Error(`unexpected fetch: ${url} ${JSON.stringify(options)}`);
  };

  try {
    const result = await researchPlanningContentProvider({
      project: {
        title: '研究型讲义',
        audience: '产品与工程团队',
        language: 'zh-CN',
        contentPlanning: { pageCount: 3, pageBatchSize: 2, research: { maxQueries: 2, maxSources: 4, required: true } },
      },
      projectDir: temp,
      cwd: temp,
      sources: [{ id: 'src-01', path: 'brief.md', sha256: 'a'.repeat(64) }],
      config: { apiKeyEnv: envName, model: 'deepseek-ai/DeepSeek-V4-Flash', researchBriefEnableThinking: false, storyMapEnableThinking: false },
      fetchImpl,
    });
    assert.equal(result.contentPack.pages.length, 3);
    assert.equal(result.contentPack.sources.filter(source => source.type === 'web').length, 2);
    assert.equal(result.planningArtifacts.searchRuns.length, 2);
    assert.equal(result.planningArtifacts.metrics.queriesSucceeded, 2);
    assert.equal(result.planningArtifacts.metrics.modelCallCount, 4);
    assert.ok(result.planningArtifacts.metrics.webClaims >= 3);
    assert.ok(result.contentPack.pages.every(page => page.designBridge?.visualOpportunity));
    assert.ok(result.contentPack.pages.some(page => page.claims.some(claim => claim.sourceIds.some(id => id.startsWith('web-')))));
    assert.ok(calls.some(url => url.startsWith('https://www.bing.com/search')));
    assert.ok(calls.some(url => url === 'https://example.test/a'));
    assert.deepEqual(chatBodies.map(body => body.enable_thinking), [false, false, false, false]);
  } finally {
    delete process.env[envName];
    await rm(temp, { recursive: true, force: true });
  }
});

test('搜索相关性评分拒绝只碰巧命中实体片段的跑题结果', () => {
  const query = '百年孤独 时间循环 叙事结构 句法分析';
  const relevant = scoreSearchResultRelevance(query, {
    title: '《百年孤独》的时间循环与叙事结构研究',
    snippet: '分析小说的非线性时间。',
  });
  const dictionary = scoreSearchResultRelevance(query, {
    title: '百年（汉语词语）_百度百科',
    snippet: '百年表示很长的时间。',
  });
  const insurance = scoreSearchResultRelevance(query, {
    title: '百年人寿保险股份有限公司',
    snippet: '保险产品与企业信息。',
  });
  assert.equal(relevant.score >= 4, true);
  assert.equal(dictionary.score, 0);
  assert.equal(insurance.score, 0);

  assert.equal(scoreSearchResultRelevance('孟德尔豌豆实验 原始数据 统计分析', {
    title: '现代遗传学之父孟德尔：超越时代的实验',
    snippet: '介绍豌豆杂交实验。',
  }).score >= 4, true);

  const authorQuery = '詹姆斯·乔伊斯 弗吉尼亚·伍尔夫 加西亚·马尔克斯 意识流 比较研究';
  assert.equal(scoreSearchResultRelevance(authorQuery, {
    title: '勒布朗·詹姆斯职业生涯',
    snippet: '篮球运动员新闻。',
  }).score, 0);
});
