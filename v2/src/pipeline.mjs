import { appendFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindDeck, writeReport } from './bind.mjs';
import { validateContentPack, validateDesignBaseline, validateSectionHtml } from './contracts.mjs';
import { copyFiles, ensureDir, readJson, rel, replaceDir, sha256File, writeBinary, writeJson, writeText } from './lib/io.mjs';
import { probeDeck } from './probe.mjs';
import { compareImagesInBrowser, probeSnapshotEditability } from './browser.mjs';
import { buildVisualPlan, validateVisualPlan } from './visual-plan.mjs';
import {
  callProvider,
  localContentProvider,
  localPageProvider,
  localReferenceProvider,
  localReviewProvider,
} from './providers.mjs';

const V2_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createTelemetry(runDir) {
  const file = path.join(runDir, 'experiment-log.jsonl');
  const events = [];
  let writeChain = Promise.resolve();
  return {
    log(event, fields = {}) {
      const record = { timestamp: new Date().toISOString(), event, ...fields };
      events.push(record);
      writeChain = writeChain.then(() => appendFile(file, `${JSON.stringify(record)}\n`, 'utf8'));
      return record;
    },
    async flush() { await writeChain; },
    events,
  };
}

function providerConfig(project, name) {
  return project.providers?.[name] || { mode: 'local' };
}

function deepMerge(base, override) {
  if (!base || typeof base !== 'object' || Array.isArray(base)) return override;
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result;
}

async function loadProject(projectPath, seen = new Set()) {
  const resolved = path.resolve(projectPath);
  if (seen.has(resolved)) throw new Error(`project.extends 循环引用: ${resolved}`);
  seen.add(resolved);
  const project = await readJson(resolved);
  if (!project.extends) return project;
  const base = await loadProject(path.resolve(path.dirname(resolved), project.extends), seen);
  const own = { ...project };
  delete own.extends;
  return deepMerge(base, own);
}

function runIdFor(project) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const slug = String(project.slug || project.title || 'deck')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
    .toLowerCase() || 'deck';
  return `${timestamp}-${slug}`;
}

function assertSafeOutput(outputDir) {
  const resolved = path.resolve(outputDir);
  if (resolved === V2_ROOT || resolved === path.dirname(V2_ROOT)) {
    throw new Error(`输出目录不能是项目根目录: ${resolved}`);
  }
}

async function materialSources(project, projectDir) {
  const materials = project.materials || [];
  return Promise.all(materials.map(async (sourcePath, index) => {
    const absolute = path.resolve(projectDir, sourcePath);
    return {
      id: `src-${String(index + 1).padStart(2, '0')}`,
      path: path.relative(projectDir, absolute).split(path.sep).join('/'),
      sha256: await sha256File(absolute),
    };
  }));
}

function referenceInput(page, pagePlan, deckPlan, design, ledger) {
  return {
    slots: {
      pageIntent: page.purpose,
      semanticContent: page,
      styleLine: design.styleLine,
      colors: design.colors,
      referenceMood: design.referenceMood,
      antiSlop: design.antiSlop,
      canvasContract: design.canvas,
      priorCompositions: ledger,
      graphTruth: page.graph || null,
      visualDirection: pagePlan,
      deckDirection: deckPlan,
      outputContract: '一张全页构图参考图；只定义构图、分区、层级，不进入最终产物与验收。',
    },
  };
}

function pageInput(page, pagePlan, design, reference, ledger, repair) {
  return {
    page,
    design: {
      styleLine: design.styleLine,
      colors: design.colors,
      antiSlop: design.antiSlop,
      canvas: design.canvas,
    },
    reference: {
      file: reference.file,
      composition: reference.composition,
      instruction: '只借鉴构图、分区与层级；不复制参考图文字和质感。',
    },
    graphTruth: page.graph || null,
    visualDirection: pagePlan,
    priorCompositions: ledger,
    repair,
    outputContract: `返回且仅返回一个 <section data-page-id="${page.id}">；CSS 必须按页面 scope 隔离；禁止脚本、事件处理器与外链。`,
  };
}

async function copyVendor(runDir) {
  const vendorSource = path.join(V2_ROOT, 'vendor', 'reveal');
  const vendorTarget = path.join(runDir, 'vendor', 'reveal');
  await copyFiles([
    path.join(vendorSource, 'reveal.js'),
    path.join(vendorSource, 'reveal.css'),
  ], vendorTarget);
}

async function writeLatestEvidence(runDir, pageId, attemptDir, probe, verdict) {
  const pageDir = path.join(runDir, 'evidence', pageId);
  await writeJson(path.join(pageDir, 'probe.json'), probe);
  await writeJson(path.join(pageDir, 'verdict.json'), verdict);
  await copyFile(path.join(attemptDir, 'shot.png'), path.join(pageDir, 'shot.png'));
  await copyFile(path.join(attemptDir, 'page.html'), path.join(pageDir, 'page.html'));
}

async function generatePage({ project, projectDir, runDir, page, pagePlan, design, reference, ledger, attempt, repair, telemetry }) {
  const payload = pageInput(page, pagePlan, design, reference, ledger, repair);
  const attemptDir = path.join(runDir, 'evidence', page.id, `attempt-${String(attempt).padStart(2, '0')}`);
  await ensureDir(attemptDir);
  await writeJson(path.join(attemptDir, 'page-input.json'), payload);
  const started = performance.now();
  telemetry?.log('provider.start', { stage: 'page', pageId: page.id, attempt });
  let result;
  try {
    result = await callProvider(
      'page',
      providerConfig(project, 'page'),
      { ...payload, attempt, runDir },
      localPageProvider,
      projectDir,
    );
    telemetry?.log('provider.end', { stage: 'page', pageId: page.id, attempt, status: 'pass', durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    telemetry?.log('provider.end', { stage: 'page', pageId: page.id, attempt, status: 'fail', durationMs: Math.round(performance.now() - started), error: error.message });
    throw error;
  }
  validateSectionHtml(result.html, page.id);
  await writeText(path.join(attemptDir, 'page.html'), result.html);
  await writeText(path.join(runDir, 'pages', `${page.id}.html`), result.html);
  return result.html;
}

export async function buildPipeline({ projectFile, outDir, through = 'complete' }) {
  if (!['complete', 'reference'].includes(through)) throw new Error(`未知流水线终点: ${through}`);
  const runStarted = performance.now();
  const projectPath = path.resolve(projectFile);
  const projectDir = path.dirname(projectPath);
  const project = await loadProject(projectPath);
  if (!project.title) throw new Error('project.title 必填');
  const designPath = path.resolve(projectDir, project.design || path.join(V2_ROOT, 'config', 'design-baseline.json'));
  const design = validateDesignBaseline(await readJson(designPath));
  const runDir = path.resolve(outDir);
  assertSafeOutput(runDir);
  await replaceDir(runDir);
  const telemetry = createTelemetry(runDir);
  telemetry.log('run.start', { projectFile: projectPath, outputDir: runDir });
  await ensureDir(path.join(runDir, 'pages'));
  await ensureDir(path.join(runDir, 'evidence'));
  await copyVendor(runDir);
  await writeJson(path.join(runDir, 'input', 'project.json'), project);
  await writeJson(path.join(runDir, 'input', 'design-baseline.json'), design);

  const sources = await materialSources(project, projectDir);
  const contentStarted = performance.now();
  telemetry.log('provider.start', { stage: 'content' });
  const contentResult = await callProvider(
    'content',
    providerConfig(project, 'content'),
    { project, projectDir, sources, planningEventFile: path.join(runDir, 'planning', 'planner-events.jsonl') },
    localContentProvider,
    projectDir,
  );
  telemetry.log('provider.end', { stage: 'content', status: 'pass', durationMs: Math.round(performance.now() - contentStarted) });
  const planningFileNames = {
    researchBrief: 'research-brief.json',
    searchRuns: 'search-runs.json',
    webEvidence: 'web-evidence.json',
    storyMap: 'story-map.json',
    pageContracts: 'page-contracts.json',
    modelCalls: 'model-calls.json',
    metrics: 'planning-metrics.json',
  };
  if (contentResult.planningArtifacts) {
    for (const [key, value] of Object.entries(contentResult.planningArtifacts)) {
      const fileName = planningFileNames[key];
      if (!fileName) continue;
      await writeJson(path.join(runDir, 'planning', fileName), value);
    }
    telemetry.log('planning.artifacts.written', { files: Object.keys(contentResult.planningArtifacts).filter(key => planningFileNames[key]).length });
    for (const call of contentResult.planningArtifacts.modelCalls || []) {
      telemetry.log('planning.model.call', call);
    }
  }
  for (const item of contentResult.telemetry || []) {
    const { event, ...fields } = item;
    telemetry.log(event || 'planning.event', fields);
  }
  const contentPack = validateContentPack(contentResult.contentPack);
  await writeJson(path.join(runDir, 'content-pack.json'), contentPack);
  const visualPlan = validateVisualPlan(buildVisualPlan({ project, contentPack, design }), contentPack);
  await writeJson(path.join(runDir, 'visual-plan.json'), visualPlan);
  telemetry.log('visual-plan.complete', { pageCount: visualPlan.pages.length });
  const visualPages = new Map(visualPlan.pages.map(page => [page.id, page]));

  const ledger = [];
  const references = new Map();
  const sections = new Map();
  const referenceConcurrency = Math.max(1, Math.min(8, Number(project.referenceConcurrency || 1)));
  telemetry.log('reference-batches.start', { pageCount: contentPack.pages.length, concurrency: referenceConcurrency });
  for (let offset = 0; offset < contentPack.pages.length; offset += referenceConcurrency) {
    const batch = contentPack.pages.slice(offset, offset + referenceConcurrency);
    const priorLedger = [...ledger];
    telemetry.log('reference-batch.start', { batch: Math.floor(offset / referenceConcurrency) + 1, pageIds: batch.map(page => page.id) });
    const results = await Promise.all(batch.map(async page => {
      const pagePlan = visualPages.get(page.id);
      const pageEvidenceDir = path.join(runDir, 'evidence', page.id);
      await ensureDir(pageEvidenceDir);
      const input = referenceInput(page, pagePlan, visualPlan.deck, design, priorLedger);
      await writeJson(path.join(pageEvidenceDir, 'reference-input.json'), input);
      const referenceStarted = performance.now();
      telemetry.log('provider.start', { stage: 'reference', pageId: page.id });
      let referenceResult;
      try {
        referenceResult = await callProvider(
          'reference',
          providerConfig(project, 'reference'),
          { page, pagePlan, deckPlan: visualPlan.deck, design, input, ledger: priorLedger },
          localReferenceProvider,
          projectDir,
        );
        telemetry.log('provider.end', { stage: 'reference', pageId: page.id, status: 'pass', durationMs: Math.round(performance.now() - referenceStarted), bytes: referenceResult.metadata?.bytes || null });
      } catch (error) {
        telemetry.log('provider.end', { stage: 'reference', pageId: page.id, status: 'fail', durationMs: Math.round(performance.now() - referenceStarted), error: error.message });
        throw error;
      }
      if (!referenceResult.extension || (!Buffer.isBuffer(referenceResult.binary) && typeof referenceResult.content !== 'string')) {
        throw new Error(`${page.id}: reference provider 需要返回 extension 与 binary/content`);
      }
      const referenceFile = path.join(pageEvidenceDir, `ref.${referenceResult.extension}`);
      if (Buffer.isBuffer(referenceResult.binary)) await writeBinary(referenceFile, referenceResult.binary);
      else await writeText(referenceFile, referenceResult.content);
      if (referenceResult.metadata) await writeJson(path.join(pageEvidenceDir, 'reference-meta.json'), referenceResult.metadata);
      const reference = { file: rel(runDir, referenceFile), composition: referenceResult.composition || {} };
      const pageLedger = [...priorLedger, { pageId: page.id, ...reference.composition }];
      const html = through === 'reference'
        ? null
        : await generatePage({ project, projectDir, runDir, page, pagePlan, design, reference, ledger: pageLedger, attempt: 0, repair: null, telemetry });
      return { page, reference, html };
    }));
    for (const result of results) {
      references.set(result.page.id, result.reference);
      sections.set(result.page.id, result.html);
      ledger.push({ pageId: result.page.id, ...result.reference.composition });
    }
    telemetry.log('reference-batch.end', { batch: Math.floor(offset / referenceConcurrency) + 1, pageIds: batch.map(page => page.id) });
  }
  telemetry.log('reference-batches.end', { pageCount: contentPack.pages.length, concurrency: referenceConcurrency });
  await writeJson(path.join(runDir, 'composition-ledger.json'), ledger);

  if (through === 'reference') {
    const totalDurationMs = Math.round(performance.now() - runStarted);
    const runManifest = {
      version: '2.0',
      runId: runIdFor(project),
      createdAt: new Date().toISOString(),
      status: 'pass',
      through: 'reference',
      referenceGate: references.size === contentPack.pages.length ? 'pass' : 'fail',
      project: path.basename(projectPath),
      contentPack: 'content-pack.json',
      planning: contentResult.planningArtifacts ? {
        status: 'pass',
        directory: 'planning',
        metrics: 'planning/planning-metrics.json',
        pagesUsingWebEvidence: contentResult.planningArtifacts.metrics?.pagesUsingWebEvidence || 0,
        webSourcesSelected: contentResult.planningArtifacts.metrics?.webSourcesSelected || 0,
      } : { status: 'not-applicable' },
      visualPlan: 'visual-plan.json',
      referenceSummary: 'reference-summary.json',
      experimentLog: 'experiment-log.jsonl',
      timings: 'timings-summary.json',
      pageCount: contentPack.pages.length,
      providerModes: Object.fromEntries(
        ['content', 'reference'].map(name => [name, providerConfig(project, name).mode || 'local']),
      ),
    };
    const referenceSummary = contentPack.pages.map(page => ({
      pageId: page.id,
      title: page.title,
      file: references.get(page.id)?.file || null,
      composition: references.get(page.id)?.composition || {},
    }));
    await writeJson(path.join(runDir, 'reference-summary.json'), { pass: runManifest.referenceGate === 'pass', pages: referenceSummary });
    await writeJson(path.join(runDir, 'run.json'), runManifest);
    telemetry.log('run.end', { status: runManifest.status, through, pageCount: contentPack.pages.length, totalDurationMs });
    await telemetry.flush();
    const completedProviders = telemetry.events.filter(event => event.event === 'provider.end');
    const stageTotals = {};
    for (const event of completedProviders) stageTotals[event.stage] = (stageTotals[event.stage] || 0) + Number(event.durationMs || 0);
    const referencePages = completedProviders.filter(event => event.stage === 'reference').map(event => ({ pageId: event.pageId, durationMs: event.durationMs, status: event.status, bytes: event.bytes }));
    await writeJson(path.join(runDir, 'timings-summary.json'), {
      version: '1.0',
      through,
      totalDurationMs,
      pageCount: contentPack.pages.length,
      referenceConcurrency,
      providerStageTotalsMs: stageTotals,
      summedReferenceDurationMs: referencePages.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
      referencePages,
    });
    return { runDir, manifest: runManifest, evidence: referenceSummary };
  }

  const maxRevisions = Number.isInteger(project.maxRevisions) ? project.maxRevisions : 2;
  let finalProbe;
  let finalEvidence = [];
  let completedAttempt = 0;
  for (let attempt = 0; attempt <= maxRevisions; attempt += 1) {
    completedAttempt = attempt;
    const probeStarted = performance.now();
    telemetry.log('browser-probe.start', { attempt, pageCount: contentPack.pages.length });
    await bindDeck({
      runDir,
      project,
      design,
      pages: contentPack.pages,
      sections: contentPack.pages.map(page => sections.get(page.id)),
    });
    finalProbe = await probeDeck({
      runDir,
      pages: contentPack.pages,
      canvas: design.canvas,
      attempt,
      minFontPx: project.minFontPx || 16,
    });
    telemetry.log('browser-probe.end', { attempt, pageCount: contentPack.pages.length, status: finalProbe.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - probeStarted) });

    finalEvidence = [];
    const repairs = [];
    for (const page of contentPack.pages) {
      const probe = finalProbe.pages.find(item => item.pageId === page.id);
      const attemptDir = path.join(runDir, 'evidence', page.id, `attempt-${String(attempt).padStart(2, '0')}`);
      let verdict;
      if (!probe.pass) {
        verdict = {
          pageId: page.id,
          pass: false,
          status: 'skipped',
          blocking: true,
          issues: [{ message: '硬闸未通过，未进入单图评审' }],
          reason: '先修复确定性问题',
        };
      } else {
        const screenshot = path.join(runDir, probe.screenshot);
        const reviewStarted = performance.now();
        telemetry.log('provider.start', { stage: 'review', pageId: page.id, attempt });
        verdict = await callProvider(
          'review',
          providerConfig(project, 'review'),
          { screenshot, page, probe, design },
          localReviewProvider,
          projectDir,
        );
        telemetry.log('provider.end', { stage: 'review', pageId: page.id, attempt, status: verdict.pass ? 'pass' : (verdict.status || 'pending'), durationMs: Math.round(performance.now() - reviewStarted) });
        verdict = {
          pageId: page.id,
          pass: Boolean(verdict.pass),
          status: verdict.status || (verdict.pass ? 'pass' : 'fail'),
          blocking: verdict.blocking !== false,
          issues: verdict.issues || [],
          reason: verdict.reason || '',
          pageIntent: page.purpose,
        };
      }
      await writeJson(path.join(attemptDir, 'verdict.json'), verdict);
      await writeLatestEvidence(runDir, page.id, attemptDir, probe, verdict);
      finalEvidence.push({ page, probe, verdict });
      if (!probe.pass || (!verdict.pass && verdict.blocking)) {
        repairs.push({
          page,
          issues: [...(probe.issues || []), ...(verdict.issues || [])],
          previousAttempt: attempt,
        });
      }
    }

    if (!repairs.length || attempt === maxRevisions) break;
    for (const repair of repairs) {
      sections.set(repair.page.id, await generatePage({
        project,
        projectDir,
        runDir,
        page: repair.page,
        pagePlan: visualPages.get(repair.page.id),
        design,
        reference: references.get(repair.page.id),
        ledger,
        attempt: attempt + 1,
        repair,
        telemetry,
      }));
    }
  }

  await bindDeck({
    runDir,
    project,
    design,
    pages: contentPack.pages,
    sections: contentPack.pages.map(page => sections.get(page.id)),
  });

  const hardPass = finalEvidence.every(item => item.probe.pass);
  const fidelityEvidence = [];
  if (['reference-image', 'layered-reference'].includes(providerConfig(project, 'page').mode)) {
    const pageProvider = providerConfig(project, 'page');
    const thresholds = {
      maxMeanAbsDiff: Number(project.fidelityGate?.maxMeanAbsDiff ?? 1),
      maxChangedPixelFraction32: Number(project.fidelityGate?.maxChangedPixelFraction32 ?? 0.005),
      maxImmutableMeanAbsDiff: Number(project.fidelityGate?.maxImmutableMeanAbsDiff ?? 1),
      maxImmutableChangedPixelFraction32: Number(project.fidelityGate?.maxImmutableChangedPixelFraction32 ?? 0.005),
      maxEditableMeanAbsDiff: Number(project.fidelityGate?.maxEditableMeanAbsDiff ?? 40),
      maxEditableChangedPixelFraction32: Number(project.fidelityGate?.maxEditableChangedPixelFraction32 ?? 0.32),
    };
    for (const item of finalEvidence) {
      const fidelityStarted = performance.now();
      telemetry.log('fidelity.start', { pageId: item.page.id });
      const metrics = await compareImagesInBrowser({
        root: runDir,
        source: references.get(item.page.id).file,
        preview: item.probe.screenshot,
        mask: pageProvider.fidelityMask ? `assets/${item.page.id}/fidelity-mask.png` : null,
        width: design.canvas.width,
        height: design.canvas.height,
      });
      const pass = metrics.meanAbsDiff <= thresholds.maxMeanAbsDiff
        && metrics.changedPixelFraction32 <= thresholds.maxChangedPixelFraction32
        && (!metrics.immutableRegion || (
          metrics.immutableRegion.meanAbsDiff <= thresholds.maxImmutableMeanAbsDiff
          && metrics.immutableRegion.changedPixelFraction32 <= thresholds.maxImmutableChangedPixelFraction32
        ))
        && (!metrics.editableRegion || (
          metrics.editableRegion.meanAbsDiff <= thresholds.maxEditableMeanAbsDiff
          && metrics.editableRegion.changedPixelFraction32 <= thresholds.maxEditableChangedPixelFraction32
        ));
      const result = { pageId: item.page.id, pass, thresholds, metrics };
      await writeJson(path.join(runDir, 'evidence', item.page.id, 'fidelity.json'), result);
      fidelityEvidence.push(result);
      telemetry.log('fidelity.end', { pageId: item.page.id, status: pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - fidelityStarted), meanAbsDiff: metrics.meanAbsDiff, changedPixelFraction32: metrics.changedPixelFraction32 });
    }
  }
  const fidelityPass = fidelityEvidence.every(item => item.pass);
  const interactionEvidence = [];
  const pageProvider = providerConfig(project, 'page');
  if (pageProvider.mode === 'layered-reference' && pageProvider.snapshotManifest) {
    for (const item of finalEvidence) {
      const interactionStarted = performance.now();
      telemetry.log('interaction.start', { pageId: item.page.id });
      const screenshotFile = path.join(runDir, 'evidence', item.page.id, 'edit-mode.png');
      const result = await probeSnapshotEditability({
        root: runDir,
        pageId: item.page.id,
        width: design.canvas.width,
        height: design.canvas.height,
        screenshotFile,
      });
      const evidence = { pageId: item.page.id, ...result, screenshot: rel(runDir, screenshotFile) };
      await writeJson(path.join(runDir, 'evidence', item.page.id, 'interaction.json'), evidence);
      interactionEvidence.push(evidence);
      telemetry.log('interaction.end', { pageId: item.page.id, status: evidence.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - interactionStarted) });
    }
  }
  const interactionPass = interactionEvidence.every(item => item.pass);
  const visualFailures = finalEvidence.filter(item => !item.verdict.pass && item.verdict.blocking);
  const visualPending = finalEvidence.some(item => item.verdict.status === 'pending');
  const status = hardPass && fidelityPass && interactionPass && !visualFailures.length ? 'pass' : 'fail';
  const runManifest = {
    version: '2.0',
    runId: runIdFor(project),
    createdAt: new Date().toISOString(),
    status,
    hardGate: hardPass ? 'pass' : 'fail',
    fidelityGate: fidelityEvidence.length ? (fidelityPass ? 'pass' : 'fail') : 'not-applicable',
    interactionGate: interactionEvidence.length ? (interactionPass ? 'pass' : 'fail') : 'not-applicable',
    visualGate: visualFailures.length ? 'fail' : visualPending ? 'pending' : 'pass',
    attempts: completedAttempt + 1,
    maxRevisions,
    project: path.basename(projectPath),
    contentPack: 'content-pack.json',
    planning: contentResult.planningArtifacts ? {
      status: 'pass',
      directory: 'planning',
      metrics: 'planning/planning-metrics.json',
      pagesUsingWebEvidence: contentResult.planningArtifacts.metrics?.pagesUsingWebEvidence || 0,
      webSourcesSelected: contentResult.planningArtifacts.metrics?.webSourcesSelected || 0,
    } : { status: 'not-applicable' },
    visualPlan: 'visual-plan.json',
    experimentLog: 'experiment-log.jsonl',
    timings: 'timings-summary.json',
    deck: 'deck.html',
    report: 'report.html',
    pageCount: contentPack.pages.length,
    providerModes: Object.fromEntries(
      ['content', 'reference', 'page', 'review'].map(name => [name, providerConfig(project, name).mode || 'local']),
    ),
  };
  await writeJson(path.join(runDir, 'run.json'), runManifest);
  await writeJson(path.join(runDir, 'probe-summary.json'), finalProbe);
  if (fidelityEvidence.length) await writeJson(path.join(runDir, 'fidelity-summary.json'), { pass: fidelityPass, pages: fidelityEvidence });
  if (interactionEvidence.length) await writeJson(path.join(runDir, 'interaction-summary.json'), { pass: interactionPass, pages: interactionEvidence });
  await writeReport({ runDir, project, runManifest, pageEvidence: finalEvidence });
  const totalDurationMs = Math.round(performance.now() - runStarted);
  telemetry.log('run.end', { status, pageCount: contentPack.pages.length, totalDurationMs });
  await telemetry.flush();
  const completedProviders = telemetry.events.filter(event => event.event === 'provider.end');
  const stageTotals = {};
  for (const event of completedProviders) stageTotals[event.stage] = (stageTotals[event.stage] || 0) + Number(event.durationMs || 0);
  const referencePages = completedProviders.filter(event => event.stage === 'reference').map(event => ({ pageId: event.pageId, durationMs: event.durationMs, status: event.status, bytes: event.bytes }));
  await writeJson(path.join(runDir, 'timings-summary.json'), {
    version: '1.0',
    totalDurationMs,
    pageCount: contentPack.pages.length,
    referenceConcurrency,
    providerStageTotalsMs: stageTotals,
    summedReferenceDurationMs: referencePages.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
    referencePages,
  });
  return { runDir, manifest: runManifest, evidence: finalEvidence };
}

export async function verifyRun({ runDir }) {
  const absolute = path.resolve(runDir);
  const pack = validateContentPack(await readJson(path.join(absolute, 'content-pack.json')));
  const design = validateDesignBaseline(await readJson(path.join(absolute, 'input', 'design-baseline.json')));
  const result = await probeDeck({
    runDir: absolute,
    pages: pack.pages,
    canvas: design.canvas,
    attempt: 'verify',
  });
  await writeJson(path.join(absolute, 'verification.json'), result);
  return result;
}
