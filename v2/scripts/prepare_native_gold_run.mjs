#!/usr/bin/env node
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, parseArgs, readJson, replaceDir, writeJson, writeText } from '../src/lib/io.mjs';
import { buildVisualPlan } from '../src/visual-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { flags } = parseArgs(['prepare', ...process.argv.slice(2)]);
const onlyA = flags['only-a'] === true;
if (!flags.out || !flags['reference-a'] || (!onlyA && !flags['reference-b'])) {
  throw new Error('用法: node scripts/prepare_native_gold_run.mjs --reference-a <genetics.png> [--reference-b <exploded.png>] --out <run-dir> [--only-a]');
}

const runDir = path.resolve(String(flags.out));
await replaceDir(runDir);
const design = await readJson(path.join(ROOT, 'config', 'design-baseline.json'));
const contentPack = {
  version: '2.0',
  title: '图转原生 HTML 金标样例',
  sources: [],
  pages: [
    {
      id: 'page-001',
      title: '从抽象因子到实体基因：遗传物质的现代映射',
      purpose: '用人物、概念节点和 DNA 结构说明遗传学从抽象规律走向分子实体。',
      coreLogic: '孟德尔提出遗传因子，现代遗传学将其定位为染色体上具有具体序列的基因。',
      claims: [
        { text: '遗传因子描述可传递的性状单位。', sourceIds: [] },
        { text: '等位基因是同一基因座上的不同序列版本。', sourceIds: [] },
        { text: 'DNA 序列为遗传信息提供分子载体。', sourceIds: [] }
      ],
      displayCopy: [
        { role: '人物', text: '孟德尔' },
        { role: '概念', text: '遗传因子' },
        { role: '概念', text: '等位基因' },
        { role: '结论', text: '抽象规律最终落到可定位、可测量的 DNA 序列。' }
      ],
      graph: {
        nodes: [
          { id: 'factor', label: '遗传因子' },
          { id: 'allele', label: '等位基因' },
          { id: 'dna', label: 'DNA 序列' }
        ],
        edges: [{ from: 'factor', to: 'allele' }, { from: 'allele', to: 'dna' }]
      },
      designBridge: {
        communicationTask: '建立从科学史人物到现代分子实体的连续阅读路径。',
        semanticStructure: '左侧人物档案，中部概念映射，右侧 DNA 结构。',
        imageSubject: '细胞纹理、科学家肖像与 DNA 双螺旋。',
        visualOpportunity: '用冷暗显微背景衬托蓝红 DNA 和精确关系线。',
        compositionGoal: '横向单向路径，人物与分子结构形成尺度反差。',
        audienceResponse: '一眼理解遗传概念的历史演化与实体落点。',
        truthRisks: ['参考图文字可能乱码'],
        creativeLevers: ['显微纹理', '科学档案质感', 'DNA 结构']
      }
    },
    {
      id: 'page-002',
      title: '设计桥只负责视觉翻译，不负责事实真值',
      purpose: '用可交互爆炸图解释内容、可验证文本和视觉风格是彼此独立的原生层。',
      coreLogic: '视觉模型生成审美素材，确定性渲染器保留文本和结构真值，各层可以独立编辑与验收。',
      claims: [
        { text: '设计桥把语义计划转译为构图和素材任务。', sourceIds: [] },
        { text: '可验证文本层保存精确文字与数据。', sourceIds: [] },
        { text: '视觉风格层提供材质、插画和装饰表现。', sourceIds: [] }
      ],
      displayCopy: [
        { role: '底层', text: '设计桥' },
        { role: '中层', text: '可验证文本层' },
        { role: '上层', text: '视觉风格层' }
      ],
      designBridge: {
        communicationTask: '解释原生 HTML 的分层所有权。',
        semanticStructure: '三个可分离平面构成一个 CSS 3D 爆炸视图。',
        imageSubject: '纸张、网格、装饰图案构成的分层模型。',
        visualOpportunity: '使用网页常见的等距 CSS 3D 分层交互。',
        compositionGoal: '白色主卡片置于深蓝照片拼贴背景之上，爆炸图占据主体。',
        audienceResponse: '理解每一层都能独立编辑，而不是整页截图。',
        truthRisks: ['把爆炸图烘焙成位图'],
        creativeLevers: ['CSS 透视', '透明平面', '调用线']
      }
    }
  ]
};
if (onlyA) contentPack.pages = contentPack.pages.slice(0, 1);
const project = {
  title: contentPack.title,
  language: 'zh-CN',
  design: path.join(ROOT, 'config', 'design-baseline.json'),
  materials: [],
  nativeHtml: {
    vlmConcurrency: 2,
    assetConcurrency: 2,
    renderConcurrency: 2,
    allowWebgl: false,
    assets: { enabled: true },
    review: { enabled: true },
    viewports: [{ width: 2560, height: 1440 }, { width: 1500, height: 844 }, { width: 980, height: 800 }, { width: 390, height: 844 }]
  },
  visualPlanning: {
    density: 'balanced',
    assetStrategy: '照片、肖像、纹理和复杂装饰交给生图；文字、关系图和分层结构交给 HTML/SVG/CSS3D。'
  },
  providers: { content: { mode: 'local' }, reference: { mode: 'static-image' }, page: { mode: 'native-scene' }, review: { mode: 'native-single-image' } }
};
const visualPlan = buildVisualPlan({ project, contentPack, design });
await writeJson(path.join(runDir, 'content-pack.json'), contentPack);
await writeJson(path.join(runDir, 'visual-plan.json'), visualPlan);
await writeJson(path.join(runDir, 'composition-ledger.json'), []);
await writeJson(path.join(runDir, 'input', 'project.json'), project);
await writeJson(path.join(runDir, 'input', 'design-baseline.json'), design);
await ensureDir(path.join(runDir, 'evidence', 'page-001'));
if (!onlyA) await ensureDir(path.join(runDir, 'evidence', 'page-002'));
await ensureDir(path.join(runDir, 'vendor', 'reveal'));
await copyFile(path.resolve(String(flags['reference-a'])), path.join(runDir, 'evidence', 'page-001', 'ref.png')).catch(async error => {
  if (error.code !== 'ENOENT') throw error;
  throw new Error(`参考图不存在: ${flags['reference-a']}`);
});
if (!onlyA) {
  await copyFile(path.resolve(String(flags['reference-b'])), path.join(runDir, 'evidence', 'page-002', 'ref.png')).catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`参考图不存在: ${flags['reference-b']}`);
  });
}
await copyFile(path.join(ROOT, 'vendor', 'reveal', 'reveal.js'), path.join(runDir, 'vendor', 'reveal', 'reveal.js'));
await copyFile(path.join(ROOT, 'vendor', 'reveal', 'reveal.css'), path.join(runDir, 'vendor', 'reveal', 'reveal.css'));
await writeJson(path.join(runDir, 'reference-summary.json'), {
  pass: true,
  pages: contentPack.pages.map(page => ({ pageId: page.id, title: page.title, file: `evidence/${page.id}/ref.png`, composition: { source: 'gold-reference' } }))
});
await writeJson(path.join(runDir, 'run.json'), { version: '2.0', status: 'pass', through: 'reference', pageCount: 2, referenceGate: 'pass' });
await writeText(path.join(runDir, 'experiment-log.jsonl'), '');
process.stdout.write(`${runDir}\n`);
