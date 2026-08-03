#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPipeline, verifyRun } from '../src/pipeline.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const experimentRoot = path.join(root, 'runs', 'lecture-20-experiment', stamp);
const runDir = path.join(experimentRoot, 'run');
const driverLogFile = path.join(experimentRoot, 'experiment-driver-log.jsonl');
const startedAt = Date.now();

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function driverLog(event, fields = {}) {
  await mkdir(experimentRoot, { recursive: true });
  await writeFile(driverLogFile, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`, { encoding: 'utf8', flag: 'a' });
}

function pageType(page) {
  if (page.graph) return 'graph';
  if (page.code) return 'code';
  if (page.series) return 'series';
  return 'claims';
}

function markdownTable(rows) {
  const lines = [
    '| 页 | 类型 | API生成 | 下载 | 图片 | Prompt | 硬闸 | Fidelity MAE |',
    '|---:|---|---:|---:|---:|---:|---|---:|',
  ];
  for (const row of rows) {
    lines.push(`| ${row.pageId} | ${row.type} | ${(row.apiGenerationMs / 1000).toFixed(1)}s | ${(row.downloadMs / 1000).toFixed(1)}s | ${(row.bytes / 1024).toFixed(0)}KB | ${row.promptChars} 字符 | ${row.hardPass ? 'PASS' : 'FAIL'} | ${row.meanAbsDiff.toFixed(3)} |`);
  }
  return lines.join('\n');
}

async function main() {
  await driverLog('experiment.start', { experimentRoot, pageCount: 20, referenceConcurrency: 4 });
  const buildStarted = Date.now();
  let build;
  try {
    build = await buildPipeline({
      projectFile: path.join(root, 'examples', 'data-structures-20', 'project.json'),
      outDir: runDir,
    });
    await driverLog('pipeline.complete', { status: build.manifest.status, durationMs: Date.now() - buildStarted });
  } catch (error) {
    await driverLog('pipeline.fail', { durationMs: Date.now() - buildStarted, error: error.stack || error.message });
    throw error;
  }

  const verifyStarted = Date.now();
  const verification = await verifyRun({ runDir });
  await driverLog('verification.complete', { status: verification.pass ? 'pass' : 'fail', durationMs: Date.now() - verifyStarted });

  const contentPack = await readJson(path.join(runDir, 'content-pack.json'));
  const visualPlan = await readJson(path.join(runDir, 'visual-plan.json'));
  const timings = await readJson(path.join(runDir, 'timings-summary.json'));
  const probe = await readJson(path.join(runDir, 'probe-summary.json'));
  const fidelity = await readJson(path.join(runDir, 'fidelity-summary.json'));
  const visualById = new Map(visualPlan.pages.map(page => [page.id, page]));
  const probeById = new Map(probe.pages.map(page => [page.pageId, page]));
  const fidelityById = new Map(fidelity.pages.map(page => [page.pageId, page]));
  const rows = [];
  for (const page of contentPack.pages) {
    const meta = await readJson(path.join(runDir, 'evidence', page.id, 'reference-meta.json'));
    const pageProbe = probeById.get(page.id);
    const pageFidelity = fidelityById.get(page.id);
    const exactText = visualById.get(page.id)?.semanticLocks?.exactText || [];
    rows.push({
      pageId: page.id,
      title: page.title,
      type: pageType(page),
      apiGenerationMs: Number(meta.timings?.generationDurationMs || 0),
      downloadMs: Number(meta.timings?.downloadDurationMs || 0),
      apiTotalMs: Number(meta.timings?.totalDurationMs || 0),
      bytes: Number(meta.bytes || 0),
      promptChars: String(meta.prompt || '').length,
      exactTextCount: exactText.length,
      exactTextChars: exactText.join('').length,
      hardPass: Boolean(pageProbe?.pass),
      hardIssues: pageProbe?.issues || [],
      fidelityPass: Boolean(pageFidelity?.pass),
      meanAbsDiff: Number(pageFidelity?.metrics?.meanAbsDiff || 0),
      changedPixelFraction32: Number(pageFidelity?.metrics?.changedPixelFraction32 || 0),
      reference: `run/evidence/${page.id}/ref.jpg`,
      screenshot: `run/evidence/${page.id}/shot.png`,
    });
  }

  const apiGenerationSumMs = rows.reduce((sum, row) => sum + row.apiGenerationMs, 0);
  const apiGenerationAverageMs = apiGenerationSumMs / rows.length;
  const slowest = [...rows].sort((a, b) => b.apiGenerationMs - a.apiGenerationMs).slice(0, 5);
  const hardFailures = rows.filter(row => !row.hardPass);
  const totalDurationMs = Date.now() - startedAt;
  const summary = {
    version: '1.0',
    status: build.manifest.status === 'pass' && verification.pass ? 'technical-pass-visual-review-required' : 'fail',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    totalDurationMs,
    environment: {
      platform: process.platform,
      release: os.release(),
      cpu: os.cpus()[0]?.model || '',
      logicalCpus: os.cpus().length,
      memoryGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      node: process.version,
    },
    configuration: {
      pageCount: rows.length,
      referenceConcurrency: timings.referenceConcurrency,
      provider: 'Paratera',
      model: 'Doubao-Seedream-4.0',
      size: '2560x1440',
      pageMode: 'reference-image',
    },
    timing: {
      pipelineTotalMs: timings.totalDurationMs,
      experimentTotalMs: totalDurationMs,
      apiGenerationSumMs,
      apiGenerationAverageMs,
      summedReferenceProviderMs: timings.summedReferenceDurationMs,
      effectiveParallelism: Number((apiGenerationSumMs / Math.max(1, timings.totalDurationMs)).toFixed(2)),
      slowestPages: slowest.map(row => ({ pageId: row.pageId, durationMs: row.apiGenerationMs })),
    },
    quality: {
      hardGate: build.manifest.hardGate,
      fidelityGate: build.manifest.fidelityGate,
      visualGate: build.manifest.visualGate,
      verification: verification.pass ? 'pass' : 'fail',
      hardFailureCount: hardFailures.length,
      semanticImageReview: 'manual-required',
      editability: 'not-applicable: reference-image pages preserve 1:1 pixels but are not decomposed into editable objects',
    },
    pages: rows,
    artifacts: {
      runDir,
      deck: path.join(runDir, 'deck.html'),
      report: path.join(runDir, 'report.html'),
      pipelineLog: path.join(runDir, 'experiment-log.jsonl'),
      timings: path.join(runDir, 'timings-summary.json'),
    },
  };
  await writeFile(path.join(experimentRoot, 'experiment-results.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const contactScript = path.join(root, 'scripts', 'create_contact_sheet.py');
  const rawSheet = path.join(experimentRoot, 'contact-sheet-references.png');
  const shotSheet = path.join(experimentRoot, 'contact-sheet-screenshots.png');
  await execFileAsync(process.env.PYTHON || 'python', [contactScript, '--run', runDir, '--out', rawSheet, '--kind', 'reference'], { cwd: root, timeout: 120_000, windowsHide: true });
  await execFileAsync(process.env.PYTHON || 'python', [contactScript, '--run', runDir, '--out', shotSheet, '--kind', 'shot'], { cwd: root, timeout: 120_000, windowsHide: true });

  const report = `# 20 页讲义流水线实验\n\n` +
    `- 状态：**${summary.status}**\n` +
    `- 主题：数据结构：从树到图\n` +
    `- 页面：${rows.length}\n` +
    `- 模型：Paratera / Doubao-Seedream-4.0 / 2560×1440\n` +
    `- 并发：${timings.referenceConcurrency}\n` +
    `- 流水线墙钟时间：${(timings.totalDurationMs / 1000).toFixed(1)} 秒\n` +
    `- 20 次图像生成累计：${(apiGenerationSumMs / 1000).toFixed(1)} 秒\n` +
    `- 单页平均生成：${(apiGenerationAverageMs / 1000).toFixed(1)} 秒\n` +
    `- 有效并行倍数：${summary.timing.effectiveParallelism}×\n` +
    `- 硬闸失败：${hardFailures.length}\n` +
    `- 视觉语义：需要人工查看 contact sheet；像素闸不验证图中文字是否正确。\n` +
    `- 编辑性：本轮使用 reference-image 作为 20 页规模基线，1:1 但不可对象化编辑。\n\n` +
    `## 逐页日志\n\n${markdownTable(rows)}\n\n` +
    `## 后续优化观察点\n\n` +
    `1. 从 contact sheet 统计错字、伪文字、错误节点、错误连线和风格漂移。\n` +
    `2. 比较 Prompt 字符数、精确文字字符数与错误率。\n` +
    `3. 对最慢 5 页检查内容密度、页面类型和 API 延迟。\n` +
    `4. 下一轮将高风险文字页改成“无文字视觉底板 + HTML 语义层”。\n` +
    `5. 只有通过视觉语义闸的页面才进入自动分解与可编辑层。\n`;
  await writeFile(path.join(experimentRoot, 'experiment-report.md'), report, 'utf8');
  await driverLog('experiment.end', { status: summary.status, totalDurationMs, hardFailureCount: hardFailures.length });
  process.stdout.write(`${JSON.stringify({ experimentRoot, ...summary }, null, 2)}\n`);
}

main().catch(async error => {
  await driverLog('experiment.fail', { error: error.stack || error.message, totalDurationMs: Date.now() - startedAt }).catch(() => {});
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
