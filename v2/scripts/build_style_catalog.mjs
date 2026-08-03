import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'runs', 'style-catalog-curated');

const groups = [
  {
    lecture: '数据结构：树',
    sourceRoot: 'runs/style-lab-curated',
    report: 'selection-report.json',
    styles: ['handdrawn-technical', 'swiss-editorial', 'dark-data-editorial', 'retro-flat-learning'],
    pages: ['page-003', 'page-017', 'page-020'],
    roles: ['concept', 'comparison', 'summary'],
  },
  {
    lecture: 'HTTP 请求生命周期',
    sourceRoot: 'runs/style-lab-http-curated',
    report: 'selection-report.json',
    styles: ['ink-wash-systems', 'clay-isometric-learning', 'neo-brutalist-signal'],
    pages: ['page-004', 'page-011', 'page-015'],
    roles: ['process', 'comparison', 'summary'],
  },
];

await mkdir(outDir, { recursive: true });
const catalog = {
  generatedAt: new Date().toISOString(),
  purpose: '把两种讲义主题中的七套精选视觉系统放入同一目录，验证跨讲义风格分离与单套稳定性。',
  slots: ['slot-1', 'slot-2', 'slot-3'],
  styles: {},
};

for (const group of groups) {
  const sourceRoot = path.join(root, group.sourceRoot);
  const report = JSON.parse(await readFile(path.join(sourceRoot, group.report), 'utf8'));
  for (const style of group.styles) {
    const styleOut = path.join(outDir, style);
    await mkdir(styleOut, { recursive: true });
    const pages = [];
    for (let index = 0; index < group.pages.length; index += 1) {
      const pageId = group.pages[index];
      const slot = `slot-${index + 1}`;
      const source = path.join(sourceRoot, style, `${pageId}.jpg`);
      const target = path.join(styleOut, `${slot}.jpg`);
      await copyFile(source, target);
      pages.push({
        slot,
        role: group.roles[index],
        pageId,
        source: path.relative(root, source),
        textStatus: report.styles?.[style]?.pages?.[pageId]?.textStatus ?? null,
      });
    }
    catalog.styles[style] = {
      lecture: group.lecture,
      score: report.styles?.[style]?.score ?? null,
      verdict: report.styles?.[style]?.verdict ?? null,
      pages,
    };
  }
}

await writeFile(path.join(outDir, 'catalog-report.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outDir, styleCount: Object.keys(catalog.styles).length }, null, 2)}\n`);
