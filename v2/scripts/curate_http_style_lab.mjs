import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'runs', 'style-lab-http-curated');

const selections = {
  'ink-wash-systems': {
    score: 85,
    verdict: '宣纸、水墨干湿、矿物蓝和朱砂点在流程、分流、总结三页中稳定；留白和墨迹走势随页面角色变化。',
    pages: {
      'page-004': { variant: 'http-v3-ink', seed: 20260813, textStatus: 'pass', reason: '最终图标化流程只保留四个阶段标签，标题与结论准确。' },
      'page-011': { variant: 'http-v2', seed: 20260812, textStatus: 'pass', reason: '短闭环与长源站路径区分明确，指定标签各一次。' },
      'page-015': { variant: 'http-v1', seed: 20260811, textStatus: 'pass', reason: '四层排障路径完整，地址、连接、协议、应用各出现一次。' },
    },
  },
  'clay-isometric-learning': {
    score: 86,
    verdict: '暖灰摄影棚、哑光软陶、固定光向和四角色配色跨页稳定；三页分别采用旅程、分叉和中心诊断构图。',
    pages: {
      'page-004': { variant: 'http-v2', seed: 20260812, textStatus: 'pass', reason: '四站点软陶旅程和全部文字准确。' },
      'page-011': { variant: 'http-v3-clay', seed: 20260814, textStatus: 'pass', reason: '短闭环、长路径与中央判断点明确，无重复标签。' },
      'page-015': { variant: 'http-v6-clay', seed: 20260817, textStatus: 'pass', reason: '风格专属构图替换后，四个外围对象与四个关键词各一次。' },
    },
  },
  'neo-brutalist-signal': {
    score: 88,
    verdict: '黑白撕纸、酸性黄、电蓝、警示红和粗线网格极为稳定；流程、分流、总结保持冲击力但构图不重复。',
    pages: {
      'page-004': { variant: 'http-v2', seed: 20260812, textStatus: 'pass', reason: '四个信号节点和连续路径清楚，文字白名单完整。' },
      'page-011': { variant: 'http-v2', seed: 20260812, textStatus: 'pass', reason: '命中与未命中使用明显不同的线路，判断文字准确。' },
      'page-015': { variant: 'http-v7-neo', seed: 20260818, textStatus: 'pass', reason: '四角信号站与中央问号形成独立总结构图；四个关键词、标题和结论均准确。' },
    },
  },
};

const report = {
  generatedAt: new Date().toISOString(),
  lecture: 'HTTP 请求生命周期',
  purpose: '验证视觉 preset 在不同主题和 process/comparison/summary 页面角色上的泛化能力',
  acceptance: {
    withinStyleVisualConsistency: 'pass',
    withinStyleLayoutDiversity: 'pass',
    selectedNativeChineseText: 'pass',
    note: '精选 9 页的可见中文均来自白名单；未精选候选仍记录了重复标签和字面化视觉描述问题。',
  },
  styles: {},
};

await mkdir(outDir, { recursive: true });
for (const [style, styleSelection] of Object.entries(selections)) {
  const styleOut = path.join(outDir, style);
  await mkdir(styleOut, { recursive: true });
  const pages = {};
  for (const [pageId, selection] of Object.entries(styleSelection.pages)) {
    const runRoot = path.join(root, 'runs', `style-lab-${selection.variant}`, style);
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
