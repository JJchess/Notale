import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPipeline } from '../src/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('示例工程完成内容包、参考图、页面、真机证据与装订', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-v2-e2e-'));
  const outDir = path.join(temp, 'run');
  try {
    const exampleDir = path.join(ROOT, 'examples', 'tree-basics');
    const project = JSON.parse(await readFile(path.join(exampleDir, 'project.json'), 'utf8'));
    project.design = path.join(ROOT, 'config', 'design-baseline.json');
    project.materials = [path.join(exampleDir, 'materials', 'tree-basics.md')];
    project.providers.reference = { mode: 'local' };
    const projectFile = path.join(temp, 'project.json');
    await writeFile(projectFile, JSON.stringify(project), 'utf8');
    const result = await buildPipeline({
      projectFile,
      outDir,
    });
    assert.equal(result.manifest.status, 'pass');
    assert.equal(result.manifest.hardGate, 'pass');
    assert.equal(result.manifest.visualGate, 'pending');
    assert.equal(result.manifest.pageCount, 4);
    for (const file of ['content-pack.json', 'composition-ledger.json', 'deck.html', 'report.html', 'run.json', 'probe-summary.json']) {
      await access(path.join(outDir, file));
    }
    for (const pageId of ['page-001', 'page-002', 'page-003', 'page-004']) {
      for (const file of ['ref.svg', 'page.html', 'probe.json', 'shot.png', 'verdict.json']) {
        await access(path.join(outDir, 'evidence', pageId, file));
      }
    }
    const deck = await readFile(path.join(outDir, 'deck.html'), 'utf8');
    assert.doesNotMatch(deck, /https?:\/\//);
    assert.match(deck, /vendor\/reveal\/reveal\.js/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('reference 终点只生成规划与参考图，不进入 HTML 页面阶段', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-v2-reference-only-'));
  const outDir = path.join(temp, 'run');
  try {
    const exampleDir = path.join(ROOT, 'examples', 'tree-basics');
    const project = JSON.parse(await readFile(path.join(exampleDir, 'project.json'), 'utf8'));
    project.design = path.join(ROOT, 'config', 'design-baseline.json');
    project.materials = [path.join(exampleDir, 'materials', 'tree-basics.md')];
    project.providers.reference = { mode: 'local' };
    const projectFile = path.join(temp, 'project.json');
    await writeFile(projectFile, JSON.stringify(project), 'utf8');
    const result = await buildPipeline({ projectFile, outDir, through: 'reference' });
    assert.equal(result.manifest.status, 'pass');
    assert.equal(result.manifest.through, 'reference');
    assert.equal(result.manifest.referenceGate, 'pass');
    await access(path.join(outDir, 'content-pack.json'));
    await access(path.join(outDir, 'visual-plan.json'));
    await access(path.join(outDir, 'reference-summary.json'));
    await access(path.join(outDir, 'evidence', 'page-001', 'ref.svg'));
    await assert.rejects(access(path.join(outDir, 'deck.html')));
    await assert.rejects(access(path.join(outDir, 'evidence', 'page-001', 'page.html')));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('硬闸失败会携带证据定点回炉步骤③', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-v2-repair-'));
  const projectDir = path.join(temp, 'project');
  const outDir = path.join(temp, 'run');
  await mkdir(path.join(projectDir, 'materials'), { recursive: true });
  await writeFile(path.join(projectDir, 'materials', 'source.md'), '# 一页\n用于回炉测试。', 'utf8');
  const project = {
    title: '回炉测试',
    design: path.join(ROOT, 'config', 'design-baseline.json'),
    materials: ['materials/source.md'],
    maxRevisions: 2,
    providers: {
      content: { mode: 'local' },
      reference: { mode: 'local' },
      page: {
        mode: 'command',
        argv: [process.execPath, path.join(ROOT, 'tests', 'fixtures', 'revising-page-provider.mjs')],
      },
      review: { mode: 'local' },
    },
    pages: [{
      id: 'page-001',
      title: '先失败，再修复',
      purpose: '证明硬闸能够驱动步骤③定点重写。',
      claims: [{ text: '测试事实', sourceIds: ['src-01'] }],
    }],
  };
  await writeFile(path.join(projectDir, 'project.json'), JSON.stringify(project), 'utf8');
  try {
    const result = await buildPipeline({
      projectFile: path.join(projectDir, 'project.json'),
      outDir,
    });
    assert.equal(result.manifest.status, 'pass');
    assert.equal(result.manifest.attempts, 2);
    const first = JSON.parse(await readFile(path.join(outDir, 'evidence', 'page-001', 'attempt-00', 'probe.json'), 'utf8'));
    const second = JSON.parse(await readFile(path.join(outDir, 'evidence', 'page-001', 'attempt-01', 'probe.json'), 'utf8'));
    assert.equal(first.pass, false);
    assert(first.issues.some(issue => ['overflow-x', 'element-outside'].includes(issue.code)));
    assert.equal(second.pass, true);

    const exhaustedProject = { ...project, maxRevisions: 0 };
    await writeFile(path.join(projectDir, 'project-exhausted.json'), JSON.stringify(exhaustedProject), 'utf8');
    const exhausted = await buildPipeline({
      projectFile: path.join(projectDir, 'project-exhausted.json'),
      outDir: path.join(temp, 'run-exhausted'),
    });
    assert.equal(exhausted.manifest.status, 'fail');
    assert.equal(exhausted.manifest.hardGate, 'fail');
    assert.equal(exhausted.manifest.attempts, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('reference-image 页面通过像素级 fidelity gate', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-v2-fidelity-'));
  const projectDir = path.join(temp, 'project');
  const outDir = path.join(temp, 'run');
  await mkdir(path.join(projectDir, 'materials'), { recursive: true });
  await writeFile(path.join(projectDir, 'materials', 'source.md'), '# 像素基线\n参考图直接进入页面。', 'utf8');
  const project = {
    title: '像素还原基线',
    design: path.join(ROOT, 'config', 'design-baseline.json'),
    materials: ['materials/source.md'],
    maxRevisions: 0,
    fidelityGate: { maxMeanAbsDiff: 1, maxChangedPixelFraction32: 0.005 },
    providers: {
      content: { mode: 'local' },
      reference: { mode: 'local' },
      page: { mode: 'reference-image' },
      review: { mode: 'local' },
    },
    pages: [{
      id: 'page-001',
      title: '像素级还原',
      purpose: '证明浏览器页面与参考图一致。',
      claims: [{ text: '参考图是唯一像素真值。', sourceIds: ['src-01'] }],
    }],
  };
  const projectFile = path.join(projectDir, 'project.json');
  await writeFile(projectFile, JSON.stringify(project), 'utf8');
  try {
    const result = await buildPipeline({ projectFile, outDir });
    assert.equal(result.manifest.status, 'pass');
    assert.equal(result.manifest.fidelityGate, 'pass');
    const fidelity = JSON.parse(await readFile(path.join(outDir, 'evidence', 'page-001', 'fidelity.json'), 'utf8'));
    assert.equal(fidelity.pass, true);
    assert(fidelity.metrics.meanAbsDiff <= 1);
    await access(path.join(outDir, 'fidelity-summary.json'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
