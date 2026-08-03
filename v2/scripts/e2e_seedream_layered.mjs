#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPipeline, verifyRun } from '../src/pipeline.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const testRoot = path.join(root, 'runs', 'e2e-seedream-layered', stamp);
const generationOut = path.join(testRoot, 'generation');
const decompositionOut = path.join(testRoot, 'decomposition');
const layeredOut = path.join(testRoot, 'layered');
const startedAt = Date.now();

function assert(condition, message) {
  if (!condition) throw new Error(`E2E assertion failed: ${message}`);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  await mkdir(testRoot, { recursive: true });

  const generation = await buildPipeline({
    projectFile: path.join(root, 'examples', 'tree-master', 'project-premium-b.json'),
    outDir: generationOut,
  });
  assert(generation.manifest.status === 'pass', 'Seedream generation run did not pass');
  assert(generation.manifest.providerModes.reference === 'paratera', 'generation did not use Paratera');

  const evidenceDir = path.join(generationOut, 'evidence', 'page-001');
  const referenceName = (await readdir(evidenceDir)).find(name => /^ref\.(png|jpe?g|webp)$/i.test(name));
  assert(referenceName, 'generated reference image missing');
  const referenceFile = path.join(evidenceDir, referenceName);
  const referenceMeta = await readJson(path.join(evidenceDir, 'reference-meta.json'));
  assert(referenceMeta.provider === 'Paratera', 'reference metadata provider mismatch');
  assert(referenceMeta.model === 'Doubao-Seedream-4.0', 'Seedream model mismatch');

  const specFile = path.join(root, 'examples', 'tree-editorial', 'assets', 'layer-spec.json');
  await execFileAsync(process.env.PYTHON || 'python', [
    path.join(root, 'scripts', 'decompose_reference.py'),
    '--source', referenceFile,
    '--spec', specFile,
    '--out', decompositionOut,
  ], { cwd: root, timeout: 120_000, windowsHide: true });

  const decomposition = await readJson(path.join(decompositionOut, 'decomposition.json'));
  const snapshotManifest = await readJson(path.join(decompositionOut, 'snapshots', 'manifest.json'));
  assert(decomposition.textMaskCount === 12, 'expected 12 text regions');
  assert(decomposition.nodeCount === 6 && decomposition.edgeCount === 5, 'graph decomposition mismatch');
  assert(snapshotManifest.wholePageSnapshot === false, 'whole-page snapshot is forbidden');
  assert(snapshotManifest.coverageFraction <= 0.55, 'snapshot coverage exceeds anti-cheat limit');

  const layeredProject = {
    extends: path.join(root, 'examples', 'tree-master', 'project-premium-b.json').replaceAll('\\', '/'),
    slug: 'e2e-seedream-layered',
    title: '真实 Seedream 到可编辑 HTML · E2E',
    design: path.join(root, 'examples', 'tree-fidelity', 'design.json').replaceAll('\\', '/'),
    materials: [path.join(root, 'examples', 'tree-fidelity', 'materials', 'tree-fidelity.md').replaceAll('\\', '/')],
    fidelityGate: {
      maxMeanAbsDiff: 2,
      maxChangedPixelFraction32: 0.02,
      maxImmutableMeanAbsDiff: 0.6,
      maxImmutableChangedPixelFraction32: 0.008,
      maxEditableMeanAbsDiff: 4,
      maxEditableChangedPixelFraction32: 0.04,
    },
    providers: {
      reference: { mode: 'static-image', file: referenceFile.replaceAll('\\', '/') },
      page: {
        mode: 'layered-reference',
        layerSpec: specFile.replaceAll('\\', '/'),
        baseImage: path.join(decompositionOut, 'base.png').replaceAll('\\', '/'),
        nodeSpritesDir: path.join(decompositionOut, 'nodes').replaceAll('\\', '/'),
        fidelityMask: path.join(decompositionOut, 'fidelity-mask.png').replaceAll('\\', '/'),
        snapshotManifest: path.join(decompositionOut, 'snapshots', 'manifest.json').replaceAll('\\', '/'),
        maxSnapshotCoverage: 0.55,
        renderShapes: false,
      },
      review: { mode: 'local' },
    },
  };
  const projectFile = path.join(testRoot, 'layered-project.json');
  await writeFile(projectFile, `${JSON.stringify(layeredProject, null, 2)}\n`, 'utf8');

  const layered = await buildPipeline({ projectFile, outDir: layeredOut });
  const fidelity = await readJson(path.join(layeredOut, 'fidelity-summary.json'));
  const interaction = await readJson(path.join(layeredOut, 'interaction-summary.json'));
  const verification = await verifyRun({ runDir: layeredOut });
  assert(layered.manifest.status === 'pass', 'layered run did not pass');
  assert(layered.manifest.hardGate === 'pass', 'hard gate failed');
  assert(layered.manifest.fidelityGate === 'pass' && fidelity.pass, 'fidelity gate failed');
  assert(layered.manifest.interactionGate === 'pass' && interaction.pass, 'interaction gate failed');
  assert(interaction.pages[0]?.dragAfter?.pass, 'Alt+drag or SVG edge synchronization failed');
  assert(verification.pass, 'final browser verification failed');

  const summary = {
    version: '1.0',
    status: layered.manifest.visualGate === 'pass' ? 'pass' : 'technical-pass-visual-pending',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    provider: referenceMeta.provider,
    model: referenceMeta.model,
    generatedReference: path.relative(testRoot, referenceFile).replaceAll('\\', '/'),
    decomposition: {
      textMaskCount: decomposition.textMaskCount,
      nodeCount: decomposition.nodeCount,
      edgeCount: decomposition.edgeCount,
      snapshotCoverageFraction: snapshotManifest.coverageFraction,
      wholePageSnapshot: snapshotManifest.wholePageSnapshot,
    },
    gates: {
      hard: layered.manifest.hardGate,
      fidelity: layered.manifest.fidelityGate,
      interaction: layered.manifest.interactionGate,
      visual: layered.manifest.visualGate,
      verification: verification.pass ? 'pass' : 'fail',
    },
    fidelity: fidelity.pages[0].metrics,
    interaction: interaction.pages[0],
    artifacts: {
      root: testRoot,
      deck: path.join(layeredOut, 'deck.html'),
      report: path.join(layeredOut, 'report.html'),
      screenshot: path.join(layeredOut, 'evidence', 'page-001', 'shot.png'),
      editScreenshot: path.join(layeredOut, 'evidence', 'page-001', 'edit-mode.png'),
    },
  };
  await writeFile(path.join(testRoot, 'e2e-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
