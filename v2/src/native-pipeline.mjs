import { appendFile, copyFile, cp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindDeck, writeReport } from './bind.mjs';
import { probeNativeGeometry, probeNativeInteractions } from './browser.mjs';
import { validateContentPack, validateDesignBaseline, validateSectionHtml } from './contracts.mjs';
import { ensureDir, readJson, rel, replaceDir, writeBinary, writeJson, writeText } from './lib/io.mjs';
import { auditNativePage, summarizeNativeAudit } from './native-audit.mjs';
import { analyzeReferenceScene, generateNativeAsset, reprocessNativeChromaAsset, reviewNativeScreenshot } from './native-providers.mjs';
import { buildDeterministicNativeScene, normalizeNativeScene, validateNativeScene } from './native-scene.mjs';
import { renderNativeScene } from './native-renderer.mjs';
import { probeDeck } from './probe.mjs';
import { validateVisualPlan } from './visual-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function mapLimit(items, concurrency, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      result[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return result;
}

function createNativeTelemetry(runDir) {
  const events = [];
  let chain = Promise.resolve();
  const file = path.join(runDir, 'experiment-log.jsonl');
  return {
    log(event, fields = {}) {
      const record = { timestamp: new Date().toISOString(), event, ...fields };
      events.push(record);
      chain = chain.then(() => appendFile(file, `${JSON.stringify(record)}\n`, 'utf8'));
      return record;
    },
    async flush() { await chain; },
    events,
  };
}

async function exists(file) {
  try { await readFile(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function findReference(runDir, pageId, summaryById) {
  const fromSummary = summaryById.get(pageId)?.file;
  if (fromSummary && await exists(path.resolve(runDir, fromSummary))) return path.resolve(runDir, fromSummary);
  const dir = path.join(runDir, 'evidence', pageId);
  const names = await readdir(dir).catch(() => []);
  const name = names.find(item => /^ref\.(?:png|jpe?g|webp)$/i.test(item));
  if (!name) throw new Error(`${pageId}: 找不到参考图 evidence/${pageId}/ref.*`);
  return path.join(dir, name);
}

function operationalConfig(project, overrides = {}) {
  const base = project.nativeHtml || {};
  const offline = overrides.offline === true || base.offline === true;
  return {
    offline,
    strict: !offline && overrides.strict !== false && base.strict !== false,
    allowWebgl: overrides.allowWebgl === true || base.allowWebgl === true,
    vlmConcurrency: Number(overrides.vlmConcurrency || base.vlmConcurrency || 3),
    assetConcurrency: Number(overrides.assetConcurrency || base.assetConcurrency || 3),
    renderConcurrency: Number(overrides.renderConcurrency || base.renderConcurrency || 4),
    minFontPx: Number(base.minFontPx || project.minFontPx || 16),
    geometryTolerance: Number(base.geometryTolerance || .015),
    minSceneConfidence: Number(base.minSceneConfidence || .5),
    minNodeConfidence: Number(base.minNodeConfidence || .4),
    vlm: { ...(base.vlm || {}), allowWebgl: overrides.allowWebgl === true || base.allowWebgl === true },
    assets: { enabled: !offline && base.assets?.enabled !== false, ...(base.assets || {}) },
    review: { enabled: !offline && base.review?.enabled !== false, ...(base.review || {}) },
    viewports: Array.isArray(base.viewports) && base.viewports.length
      ? base.viewports
      : [{ width: 2560, height: 1440 }, { width: 1500, height: 844 }, { width: 980, height: 800 }, { width: 390, height: 844 }],
  };
}

async function prepareRun(sourceRun, outDir) {
  const source = path.resolve(sourceRun);
  const output = path.resolve(outDir);
  if (source === output) return output;
  if (output === ROOT || output === path.dirname(ROOT)) throw new Error(`输出目录不能是项目根目录: ${output}`);
  await replaceDir(output);
  await cp(source, output, { recursive: true, force: true });
  return output;
}

function timingSummary(events, totalDurationMs, config, pageCount) {
  const totals = {};
  for (const event of events.filter(item => item.event.endsWith('.end'))) {
    const stage = event.stage || event.event.replace(/\.end$/, '');
    totals[stage] = (totals[stage] || 0) + Number(event.durationMs || 0);
  }
  return {
    version: '1.0', totalDurationMs, pageCount,
    concurrency: { vlm: config.vlmConcurrency, assets: config.assetConcurrency, render: config.renderConcurrency },
    providerStageTotalsMs: totals,
    events: events.filter(item => item.durationMs != null).map(item => ({ event: item.event, stage: item.stage, pageId: item.pageId, assetId: item.assetId, status: item.status, durationMs: item.durationMs })),
  };
}

export async function buildNativeHtmlFromReferenceRun({ sourceRun, outDir, options = {} }) {
  const totalStarted = performance.now();
  const runDir = await prepareRun(sourceRun, outDir);
  const telemetry = createNativeTelemetry(runDir);
  telemetry.log('native.run.start', { sourceRun: path.resolve(sourceRun), outputDir: runDir });
  const contentPack = validateContentPack(await readJson(path.join(runDir, 'content-pack.json')));
  const visualPlan = validateVisualPlan(await readJson(path.join(runDir, 'visual-plan.json')), contentPack);
  const designFile = path.join(runDir, 'input', 'design-baseline.json');
  const design = validateDesignBaseline(await readJson(await exists(designFile) ? designFile : path.join(ROOT, 'config', 'design-baseline.json')));
  const projectFile = path.join(runDir, 'input', 'project.json');
  const project = await exists(projectFile) ? await readJson(projectFile) : { title: contentPack.title, language: 'zh-CN' };
  const config = operationalConfig(project, options);
  const summaryFile = path.join(runDir, 'reference-summary.json');
  const summary = await exists(summaryFile) ? await readJson(summaryFile) : { pages: [] };
  const summaryById = new Map((summary.pages || []).map(item => [item.pageId, item]));
  const visualById = new Map(visualPlan.pages.map(item => [item.id, item]));
  const references = new Map();
  const sceneAnalyzer = options.sceneAnalyzer || analyzeReferenceScene;
  for (const page of contentPack.pages) references.set(page.id, await findReference(runDir, page.id, summaryById));

  await ensureDir(path.join(runDir, 'native-scenes'));
  await ensureDir(path.join(runDir, 'assets', 'native'));
  await ensureDir(path.join(runDir, 'pages'));

  const sceneResults = await mapLimit(contentPack.pages, config.vlmConcurrency, async page => {
    const started = performance.now();
    telemetry.log('native.scene.start', { stage: 'native-scene', pageId: page.id });
    let scene;
    let metadata;
    let status = 'pass';
    let failure = null;
    const existingSceneFile = path.join(runDir, 'native-scenes', `${page.id}.json`);
    if (options.reuseScenes === true && await exists(existingSceneFile)) {
      scene = normalizeNativeScene(await readJson(existingSceneFile), { page, design });
      metadata = { provider: 'scene-replay', model: null, reason: 'reuse-scenes' };
      status = 'replay';
    } else if (config.offline || options.vlm === false) {
      scene = buildDeterministicNativeScene({ page, pagePlan: visualById.get(page.id), design });
      metadata = { provider: 'deterministic-fallback', model: null, reason: 'offline' };
      status = 'fallback';
    } else {
      try {
        const result = await sceneAnalyzer({
          referenceFile: references.get(page.id), page, pagePlan: visualById.get(page.id), design,
          config: config.vlm, cwd: ROOT,
        });
        scene = result.scene;
        metadata = { ...result.metadata, attempts: result.attempts };
      } catch (error) {
        if (config.strict) {
          // Strict failures are quarantined, never silently accepted.  A
          // deterministic semantic scene keeps the experiment inspectable and
          // lets unrelated pages finish, while sceneGate remains failed.
          failure = { reason: error.message, attempts: error.attempts || [] };
          scene = buildDeterministicNativeScene({ page, pagePlan: visualById.get(page.id), design });
          metadata = { provider: 'strict-failure', model: null, ...failure, quarantinePreview: true };
          status = 'quarantine';
        } else {
          scene = buildDeterministicNativeScene({ page, pagePlan: visualById.get(page.id), design });
          metadata = { provider: 'deterministic-fallback', model: null, reason: error.message, attempts: error.attempts || [] };
          status = 'fallback';
        }
      }
    }
    if (config.strict && !failure) {
      const lowNodes = scene.nodes.filter(node => Number(node.geometryConfidence ?? .5) < config.minNodeConfidence || Number(node.layerConfidence ?? .5) < config.minNodeConfidence).map(node => node.id);
      if (scene.confidence < config.minSceneConfidence || lowNodes.length) {
        const reason = `${page.id}: 场景置信度未达严格门禁；scene=${scene.confidence.toFixed(2)} lowNodes=${lowNodes.join(',') || 'none'}`;
        failure = { reason, attempts: metadata?.attempts || [] };
        scene = buildDeterministicNativeScene({ page, pagePlan: visualById.get(page.id), design });
        metadata = { provider: 'strict-failure', model: metadata?.model || null, ...failure, quarantinePreview: true };
        status = 'quarantine';
      }
    }
    validateNativeScene(scene, { pageId: page.id, allowWebgl: config.allowWebgl });
    await writeJson(path.join(runDir, 'native-scenes', `${page.id}.json`), scene);
    await writeJson(path.join(runDir, 'evidence', page.id, 'native-scene-meta.json'), metadata);
    const durationMs = Math.round(performance.now() - started);
    telemetry.log('native.scene.end', { stage: 'native-scene', pageId: page.id, status, durationMs, provider: metadata.provider, model: metadata.model, ...(failure ? { error: failure.reason } : {}) });
    return { page, scene, metadata, status, failure };
  });
  const sceneById = new Map(sceneResults.map(item => [item.page.id, item.scene]));

  const assetTasks = sceneResults.flatMap(item => item.scene.assets.map(asset => ({ page: item.page, scene: item.scene, asset })));
  const previousAssetFile = path.join(runDir, 'asset-manifest.json');
  const previousAssets = options.reuseScenes === true && await exists(previousAssetFile)
    ? (await readJson(previousAssetFile)).assets || []
    : [];
  const assetManifest = await mapLimit(assetTasks, config.assetConcurrency, async task => {
    const { page, asset } = task;
    const started = performance.now();
    telemetry.log('native.asset.start', { stage: 'native-asset', pageId: page.id, assetId: asset.id, role: asset.role });
    const base = { id: asset.id, pageId: page.id, role: asset.role, bbox: asset.bbox, transparent: asset.transparent, providerPreference: asset.providerPreference };
    const previous = previousAssets.find(item => item.pageId === page.id && item.id === asset.id && item.status === 'pass' && item.file);
    if (previous && await exists(path.join(runDir, previous.file))) {
      let record = { ...previous, ...base, status: 'pass', replayed: true };
      if (asset.transparent && String(previous.postprocess || '').includes('local-chroma-key')) {
        const target = path.join(runDir, previous.file);
        const reprocessed = await reprocessNativeChromaAsset({ binary: await readFile(target), role: asset.role });
        await writeBinary(target, reprocessed.binary);
        record = { ...record, ...reprocessed.metadata, reprocessed: true };
      }
      telemetry.log('native.asset.end', { stage: 'native-asset', pageId: page.id, assetId: asset.id, status: 'replay', durationMs: 0 });
      return record;
    }
    if (!config.assets.enabled) {
      const record = { ...base, status: 'skipped', file: null, reason: 'asset generation disabled' };
      telemetry.log('native.asset.end', { stage: 'native-asset', pageId: page.id, assetId: asset.id, status: 'skipped', durationMs: 0 });
      return record;
    }
    try {
      const output = await generateNativeAsset({
        asset, pagePlan: visualById.get(page.id), referenceFile: references.get(page.id), config: config.assets, cwd: ROOT,
      });
      const assetDir = path.join(runDir, 'assets', 'native', page.id);
      await ensureDir(assetDir);
      const safeId = asset.id.replace(/[^a-z0-9_-]/gi, '-');
      const target = path.join(assetDir, `${safeId}.${output.extension}`);
      await writeBinary(target, output.binary);
      const record = { ...base, status: 'pass', file: rel(runDir, target), ...output.metadata };
      telemetry.log('native.asset.end', { stage: 'native-asset', pageId: page.id, assetId: asset.id, status: 'pass', durationMs: Math.round(performance.now() - started), provider: output.metadata.provider, model: output.metadata.model, bytes: output.metadata.bytes });
      return record;
    } catch (error) {
      const record = { ...base, status: 'fail', file: null, reason: error.message };
      telemetry.log('native.asset.end', { stage: 'native-asset', pageId: page.id, assetId: asset.id, status: 'fail', durationMs: Math.round(performance.now() - started), error: error.message });
      return record;
    }
  });
  await writeJson(path.join(runDir, 'asset-manifest.json'), { version: '1.0', assets: assetManifest });
  const assetsByPage = new Map(contentPack.pages.map(page => [page.id, assetManifest.filter(item => item.pageId === page.id)]));

  const rendered = await mapLimit(contentPack.pages, config.renderConcurrency, async page => {
    const started = performance.now();
    telemetry.log('native.render.start', { stage: 'native-render', pageId: page.id });
    const scene = sceneById.get(page.id);
    const result = renderNativeScene({ scene, page, design, assetManifest: assetsByPage.get(page.id) });
    validateSectionHtml(result.html, page.id);
    await writeText(path.join(runDir, 'pages', `${page.id}.html`), result.html);
    const audit = auditNativePage({
      scene, page, html: result.html, assetManifest: assetsByPage.get(page.id), referenceFile: references.get(page.id), allowWebgl: config.allowWebgl,
    });
    await writeJson(path.join(runDir, 'evidence', page.id, 'native-audit.json'), audit);
    telemetry.log('native.render.end', { stage: 'native-render', pageId: page.id, status: audit.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - started), issueCount: audit.issues.length });
    return { page, html: result.html, audit };
  });
  const nativeAudit = summarizeNativeAudit(rendered.map(item => item.audit));
  await writeJson(path.join(runDir, 'native-audit.json'), nativeAudit);
  await bindDeck({ runDir, project, design, pages: contentPack.pages, sections: rendered.map(item => item.html) });

  const viewportResults = await mapLimit(config.viewports, config.renderConcurrency, async viewport => {
    const started = performance.now();
    const name = `${viewport.width}x${viewport.height}`;
    telemetry.log('native.probe.start', { stage: 'native-probe', viewport: name });
    const result = await probeDeck({
      runDir, pages: contentPack.pages, canvas: viewport, attempt: `native-${name}`, minFontPx: config.minFontPx, nativeCapture: true,
    });
    telemetry.log('native.probe.end', { stage: 'native-probe', viewport: name, status: result.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - started) });
    return { viewport, ...result };
  });
  const nativeProbe = { version: '1.0', pass: viewportResults.every(item => item.pass), viewports: viewportResults };
  await writeJson(path.join(runDir, 'native-probe-summary.json'), nativeProbe);

  const interactionStarted = performance.now();
  const interactions = await probeNativeInteractions({ runDir, root: runDir, pages: contentPack.pages, width: design.canvas.width, height: design.canvas.height });
  await writeJson(path.join(runDir, 'native-interaction-summary.json'), interactions);
  telemetry.log('native.interaction.end', { stage: 'native-interaction', status: interactions.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - interactionStarted) });

  const geometryStarted = performance.now();
  const geometry = await probeNativeGeometry({
    runDir, root: runDir, pages: contentPack.pages, scenes: Object.fromEntries(sceneResults.map(item => [item.page.id, item.scene])),
    width: design.canvas.width, height: design.canvas.height, tolerance: config.geometryTolerance,
  });
  await writeJson(path.join(runDir, 'native-geometry-summary.json'), geometry);
  telemetry.log('native.geometry.end', { stage: 'native-geometry', status: geometry.pass ? 'pass' : 'fail', durationMs: Math.round(performance.now() - geometryStarted), tolerance: config.geometryTolerance });

  const primaryProbe = viewportResults[0];
  const reviews = await mapLimit(contentPack.pages, config.vlmConcurrency, async page => {
    const screenshot = primaryProbe.pages.find(item => item.pageId === page.id)?.screenshot;
    if (!config.review.enabled || !screenshot) return { pageId: page.id, status: 'not-applicable', pass: true, blocking: false, issues: [], reason: '单图评审已关闭' };
    telemetry.log('native.review.start', { stage: 'native-review', pageId: page.id });
    const started = performance.now();
    try {
      const verdict = await reviewNativeScreenshot({ screenshotFile: path.join(runDir, screenshot), page, config: config.review, cwd: ROOT });
      const blockingLanguage = (verdict.issues || []).some(item => /(?:missing (?:required|content|title|label)|does not include|required .{0,24} absent|text.{0,30}overlap|overlap.{0,30}text|unreadable|illegible|缺少(?:人物|必需|关键|标题|标签|内容)|未呈现|文字.{0,20}遮挡|遮挡.{0,20}文字|裁切|乱码)/i.test(String(item)));
      const blocking = !verdict.pass && (Number(verdict.score || 0) < 55 || blockingLanguage);
      const result = { pageId: page.id, ...verdict, status: verdict.pass ? 'pass' : blocking ? 'fail' : 'advisory', blocking };
      telemetry.log('native.review.end', { stage: 'native-review', pageId: page.id, status: result.status, durationMs: Math.round(performance.now() - started), score: verdict.score });
      return result;
    } catch (error) {
      telemetry.log('native.review.end', { stage: 'native-review', pageId: page.id, status: 'pending', durationMs: Math.round(performance.now() - started), error: error.message });
      return { pageId: page.id, status: 'pending', pass: false, blocking: false, issues: [error.message], reason: '评审服务不可用，保留硬闸结果' };
    }
  });
  await writeJson(path.join(runDir, 'native-review-summary.json'), { pass: reviews.every(item => item.pass || !item.blocking), pages: reviews });

  const reviewFailures = reviews.filter(item => !item.pass && item.blocking);
  const reviewPending = reviews.some(item => item.status === 'pending');
  const sceneFailures = sceneResults.filter(item => item.status === 'quarantine');
  const hardPass = !sceneFailures.length && nativeAudit.pass && nativeProbe.pass && interactions.pass && geometry.pass && !reviewFailures.length;
  const status = !hardPass ? 'fail' : config.strict && reviewPending ? 'pending' : 'pass';
  const previousRun = await exists(path.join(runDir, 'run.json')) ? await readJson(path.join(runDir, 'run.json')) : {};
  const manifest = {
    ...previousRun,
    version: '2.1',
    createdAt: new Date().toISOString(),
    status,
    through: 'native-html',
    sceneGate: sceneFailures.length ? 'fail' : 'pass',
    nativeGate: nativeAudit.pass ? 'pass' : 'fail',
    hardGate: nativeProbe.pass ? 'pass' : 'fail',
    interactionGate: interactions.pass ? 'pass' : 'fail',
    geometryGate: geometry.pass ? 'pass' : 'fail',
    visualGate: reviewFailures.length ? 'fail' : reviews.some(item => item.status === 'pending') ? 'pending' : 'pass',
    deck: 'deck.html',
    nativeScenes: 'native-scenes',
    assetManifest: 'asset-manifest.json',
    nativeAudit: 'native-audit.json',
    nativeProbe: 'native-probe-summary.json',
    nativeInteractions: 'native-interaction-summary.json',
    nativeGeometry: 'native-geometry-summary.json',
    nativeReview: 'native-review-summary.json',
    nativeTimings: 'native-timings-summary.json',
    pageCount: contentPack.pages.length,
    degradedPages: sceneResults.filter(item => item.status === 'fallback').map(item => item.page.id),
    failedPages: sceneFailures.map(item => ({ pageId: item.page.id, stage: 'native-scene', reason: item.failure?.reason || item.metadata?.reason || 'scene failure' })),
  };
  await writeJson(path.join(runDir, 'run.json'), manifest);
  const reportEvidence = contentPack.pages.map(page => {
    const probe = primaryProbe.pages.find(item => item.pageId === page.id);
    const review = reviews.find(item => item.pageId === page.id);
    return { page, probe, verdict: { ...review, issues: [...(review.issues || []), ...(rendered.find(item => item.page.id === page.id)?.audit.issues || [])] } };
  });
  await writeReport({ runDir, project, runManifest: manifest, pageEvidence: reportEvidence });
  const totalDurationMs = Math.round(performance.now() - totalStarted);
  telemetry.log('native.run.end', { status, pageCount: contentPack.pages.length, totalDurationMs, degradedPages: manifest.degradedPages.length });
  await telemetry.flush();
  await writeJson(path.join(runDir, 'native-timings-summary.json'), timingSummary(telemetry.events, totalDurationMs, config, contentPack.pages.length));
  return { runDir, manifest, audit: nativeAudit, probes: nativeProbe, interactions, geometry, reviews };
}
