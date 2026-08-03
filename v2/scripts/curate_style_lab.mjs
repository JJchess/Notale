import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'runs', 'style-lab-curated');

const selections = {
  'handdrawn-technical': {
    score: 86,
    verdict: '稳定的纸张、墨线和彩铅语言；三种页面角色构图差异明确。概念页存在术语重复，但没有伪文字。',
    pages: {
      'page-003': { variant: 'v2', seed: 20260802, textStatus: 'partial', reason: '无伪文字；节点、边、路径词汇准确，但作为图内标签有重复。' },
      'page-017': { variant: 'v2', seed: 20260802, textStatus: 'pass', reason: '标题、比较标签与结论完整，天平主视觉清楚。' },
      'page-020': { variant: 'v8', seed: 20260808, textStatus: 'pass', reason: '最终四向规划一次通过，文字白名单完整。' },
    },
  },
  'swiss-editorial': {
    score: 82,
    verdict: '跨页网格、黑/钴蓝/朱红和大字号尺度稳定；早期会生成杂志式伪正文，修订后已在精选页消除。',
    pages: {
      'page-003': { variant: 'v10', seed: 20260810, textStatus: 'partial', reason: '页面角色约束消除了半幅黑底，色彩与同套另外两页一致；无伪正文，但边与路径标签有重复。' },
      'page-017': { variant: 'v3', seed: 20260803, textStatus: 'pass', reason: '邻接表、天平、矩阵三分区明确，无额外正文。' },
      'page-020': { variant: 'v7', seed: 20260807, textStatus: 'pass', reason: '词语绑定上/左/右/下后通过，无第五端点或伪注释。' },
    },
  },
  'dark-data-editorial': {
    score: 88,
    verdict: '深海军蓝场域、青蓝/珊瑚强调和细线网络最稳定，概念、比较、总结三页的版式区分清楚。',
    pages: {
      'page-003': { variant: 'v2', seed: 20260802, textStatus: 'partial', reason: '无伪文字；术语准确但在网络节点上有重复。' },
      'page-017': { variant: 'v2', seed: 20260802, textStatus: 'pass', reason: '三分区比较关系和结论清楚，配色纪律稳定。' },
      'page-020': { variant: 'v8', seed: 20260808, textStatus: 'pass', reason: '最终四向规划一次通过，四词和结论完整。' },
    },
  },
  'retro-flat-learning': {
    score: 87,
    verdict: '奶油底、深绿/芥末/砖红/湖蓝套色和丝网颗粒稳定，亲和力强且没有幼儿化。',
    pages: {
      'page-003': { variant: 'v2', seed: 20260802, textStatus: 'partial', reason: '无伪文字；路径标签因图内解释重复一次。' },
      'page-017': { variant: 'v2', seed: 20260802, textStatus: 'pass', reason: '比较结构完整，图形隐喻和色彩稳定。' },
      'page-020': { variant: 'v2', seed: 20260802, textStatus: 'pass', reason: '比最终规划的首轮候选更完整，标题、四词与结论均准确。' },
    },
  },
};

const variantDir = variant => variant === 'v1' ? 'style-lab' : `style-lab-${variant}`;
const report = {
  generatedAt: new Date().toISOString(),
  purpose: '同一讲义三种页面角色的跨风格多元性、同风格稳定性与排版多样性实验',
  acceptance: {
    crossStyleDiversity: 'pass',
    withinStyleVisualConsistency: 'pass',
    withinStyleLayoutDiversity: 'pass',
    nativeChineseTextStability: 'partial',
    note: '精选 12 页没有伪正文；4 张概念页仍有准确术语的重复。原生位图中文字不能视为最终可编辑文字层。',
  },
  styles: {},
};

await mkdir(outDir, { recursive: true });
for (const [style, styleSelection] of Object.entries(selections)) {
  const styleOut = path.join(outDir, style);
  await mkdir(styleOut, { recursive: true });
  const pages = {};
  for (const [pageId, selection] of Object.entries(styleSelection.pages)) {
    const runRoot = path.join(root, 'runs', variantDir(selection.variant), style);
    const source = path.join(runRoot, 'evidence', pageId, 'ref.jpg');
    const target = path.join(styleOut, `${pageId}.jpg`);
    await copyFile(source, target);
    const timings = JSON.parse(await readFile(path.join(runRoot, 'timings-summary.json'), 'utf8'));
    const timing = timings.referencePages.find(item => item.pageId === pageId) || null;
    pages[pageId] = {
      ...selection,
      source: path.relative(root, source),
      curated: path.relative(root, target),
      generationDurationMs: timing?.durationMs ?? null,
      bytes: timing?.bytes ?? null,
    };
  }
  report.styles[style] = {
    score: styleSelection.score,
    verdict: styleSelection.verdict,
    pages,
  };
}

await writeFile(path.join(outDir, 'selection-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
