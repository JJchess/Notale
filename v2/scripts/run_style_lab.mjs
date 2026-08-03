import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPipeline } from '../src/pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultBaseFile = path.join(root, 'examples', 'data-structures-20', 'style-lab-base.json');
const baseFile = process.argv[6] ? path.resolve(root, process.argv[6]) : defaultBaseFile;
const baseDir = path.dirname(baseFile);
const variant = process.argv[2] || 'v1';
const seed = Number(process.argv[3] || 20260801);
const presetFilter = process.argv[4]?.split(',').map(value => value.trim()).filter(Boolean) || [];
const pageFilter = process.argv[5]?.split(',').map(value => value.trim()).filter(Boolean) || [];
if (!/^[a-z0-9-]+$/i.test(variant)) throw new Error(`无效 variant: ${variant}`);
if (!Number.isFinite(seed)) throw new Error(`无效 seed: ${process.argv[3]}`);
const labDir = path.join(root, 'runs', variant === 'v1' ? 'style-lab' : `style-lab-${variant}`);
const configDir = path.join(labDir, 'configs');
const allPresets = [
  'handdrawn-technical',
  'swiss-editorial',
  'dark-data-editorial',
  'retro-flat-learning',
  'ink-wash-systems',
  'clay-isometric-learning',
  'neo-brutalist-signal',
];
const presets = presetFilter.length ? presetFilter : allPresets;
const unknownPresets = presets.filter(preset => !allPresets.includes(preset));
if (unknownPresets.length) throw new Error(`未知 preset: ${unknownPresets.join(', ')}`);

await mkdir(configDir, { recursive: true });
const base = JSON.parse(await readFile(baseFile, 'utf8'));
const prepared = [];

for (const preset of presets) {
  const project = structuredClone(base);
  project.slug = `data-structures-style-lab-${preset}`;
  project.design = path.resolve(baseDir, base.design);
  project.materials = base.materials.map(file => path.resolve(baseDir, file));
  project.visualPlanning.stylePreset = preset;
  project.providers.reference.envFile = path.resolve(baseDir, base.providers.reference.envFile);
  project.providers.reference.seed = seed;
  if (pageFilter.length) {
    const requested = new Set(pageFilter);
    project.pages = project.pages.filter(page => requested.has(page.id));
    project.visualPlanning.pages = Object.fromEntries(
      Object.entries(project.visualPlanning.pages).filter(([pageId]) => requested.has(pageId)),
    );
    const missing = pageFilter.filter(pageId => !project.pages.some(page => page.id === pageId));
    if (missing.length) throw new Error(`未知 page: ${missing.join(', ')}`);
  }
  const projectFile = path.join(configDir, `${preset}.json`);
  await writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  prepared.push({
    preset,
    projectFile,
    outDir: path.join(labDir, preset),
  });
}

const results = [];
for (let offset = 0; offset < prepared.length; offset += 2) {
  const batch = prepared.slice(offset, offset + 2);
  const batchResults = await Promise.all(batch.map(async item => {
    const result = await buildPipeline({ projectFile: item.projectFile, outDir: item.outDir });
    return {
      preset: item.preset,
      outDir: item.outDir,
      manifest: result.manifest,
    };
  }));
  results.push(...batchResults);
}

const summary = {
  generatedAt: new Date().toISOString(),
  variant,
  seed,
  pageFilter: pageFilter.length ? pageFilter : null,
  baseProject: baseFile,
  pageRoles: (pageFilter.length ? pageFilter : base.pages.map(page => page.id)).map(
    pageId => base.visualPlanning.pages?.[pageId]?.pageType || pageId,
  ),
  presets: results.map(result => ({
    preset: result.preset,
    outDir: result.outDir,
    status: result.manifest.status,
    pageCount: result.manifest.pageCount,
    timings: result.manifest.timings,
    experimentLog: result.manifest.experimentLog,
  })),
};
await writeFile(path.join(labDir, 'style-lab-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
