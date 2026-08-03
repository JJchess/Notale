import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPipeline } from './pipeline.mjs';
import { buildNativeHtmlFromReferenceRun } from './native-pipeline.mjs';
import { preflightReferenceProvider } from './providers.mjs';
import { ensureDir, writeJson } from './lib/io.mjs';
import { audienceLabelFromQuery } from './scene-design.mjs';
import { MODEL_POLICY } from './model-policy.mjs';

const V2_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slugify(text) {
  return String(text || 'query-deck')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42)
    .toLowerCase() || 'query-deck';
}

export function parseQueryRequest(query) {
  const normalized = String(query || '').trim();
  if (!normalized) throw new Error('query 必须是非空字符串');
  const pageMatch = normalized.match(/(?:生成|制作|需要|共|约)?\s*(\d{1,2})\s*(?:页|pages?)/i);
  const pageCount = clamp(pageMatch ? Number(pageMatch[1]) : 12, 3, 70);
  const firstClause = normalized.split(/[。；;\n]/).map(part => part.trim()).find(Boolean) || normalized;
  const topic = firstClause
    .replace(/^(?:请|帮我|为我)?(?:生成|制作|创建|做)\s*(?:一套|一个)?/u, '')
    .replace(/(?:生成|制作|创建|做)?\s*\d{1,2}\s*(?:页|pages?).*$/iu, '')
    .trim() || normalized.slice(0, 80);
  const language = /[\u3400-\u9fff]/u.test(normalized) ? 'zh-CN' : 'en';
  return { query: normalized, topic, pageCount, language, slug: slugify(topic) };
}

export function projectFromQuery(query) {
  const request = parseQueryRequest(query);
  const isChinese = request.language === 'zh-CN';
  return {
    slug: request.slug,
    title: request.topic,
    goal: isChinese
      ? `仅依据用户查询，自主研究并规划一套可教授、可复述的「${request.topic}」课程讲义。`
      : `Research and plan a teachable, memorable lecture deck about “${request.topic}” using only the user query.`,
    audience: isChinese ? audienceLabelFromQuery(request.query, request.topic) : `Learners and instructors studying “${request.topic}”`,
    language: request.language,
    design: path.join(V2_ROOT, 'config', 'design-baseline.json'),
    materials: [],
    referenceConcurrency: 3,
    maxRevisions: 0,
    minFontPx: 18,
    nativeHtml: {
      vlmConcurrency: 3,
      assetConcurrency: 3,
      renderConcurrency: 4,
      allowWebgl: false,
      assets: { enabled: true },
      review: { enabled: true },
    },
    contentPlanning: {
      pageCount: request.pageCount,
      pageBatchSize: 3,
      pageContractConcurrency: 4,
      storyMapBatchSize: 5,
      requireVisualDirection: true,
      instructions: request.query,
      research: {
        required: true,
        allowUnscopedResults: true,
        maxQueries: 8,
        resultsPerQuery: 4,
        maxSources: 8,
        searchConcurrency: 4,
        fetchConcurrency: 4,
        maxCharsPerSource: 6500
      }
    },
    visualPlanning: {
      sceneExpertSystem: {
        enabled: true,
        version: '1.0',
        routing: 'content-and-audience',
      },
      density: 'balanced',
      assetStrategy: isChinese
        ? '由规划阶段根据课程主题自主建立视觉语言，图像生成模型生成完整横向中文参考图；不套用预设学科风格。'
        : 'Let planning infer a topic-native visual language; the image model generates complete horizontal reference slides.',
      pageDefaults: {
        imageIntent: {
          generationScope: 'full-slide-master',
          operation: 'generate',
          role: 'complete-query-planned-lecture-slide',
          useCase: 'query-to-reference-experiment',
          assetType: isChinese ? '完整横向中文课程讲义参考图' : 'complete horizontal lecture reference slide',
          inheritDeckStyle: true,
          avoid: isChinese
            ? ['网页 UI', '代码墙', '交叉连线', '伪引文', 'logo', '水印', '来源编号']
            : ['web UI', 'code walls', 'crossing connectors', 'fake quotes', 'logos', 'watermarks', 'source ids']
        },
        creativeFreedom: isChinese
          ? ['根据课程语义自主选择视觉隐喻、媒介、构图、尺度和跨页节奏']
          : ['Choose topic-native metaphors, media, composition, scale, and pacing']
      }
    },
    providers: {
      content: {
        mode: 'research-planner',
        envFile: path.join(V2_ROOT, '.env'),
        apiKeyEnv: MODEL_POLICY.text.apiKeyEnv,
        baseUrl: MODEL_POLICY.text.baseUrl,
        model: MODEL_POLICY.text.model,
        temperature: 0.3,
        timeoutMs: 300000,
        maxTokens: 10000,
        researchBriefEnableThinking: false,
        storyMapEnableThinking: false,
        pageContractEnableThinking: false
      },
      reference: {
        mode: 'openrouter-image',
        envFile: path.join(V2_ROOT, '.env'),
        apiKeyEnv: MODEL_POLICY.referenceImage.apiKeyEnv,
        baseUrl: MODEL_POLICY.referenceImage.baseUrl,
        model: MODEL_POLICY.referenceImage.model,
        promptProfile: 'research-grounded-v1',
        aspectRatio: '16:9',
        quality: 'high',
        background: 'opaque',
        timeoutMs: 300000,
        preflight: true,
        preflightQuality: 'low',
        preflightTimeoutMs: 120000
      },
      page: { mode: 'reference-image' },
      review: { mode: 'local' }
    }
  };
}

export async function buildQueryReferencePipeline({ query, outDir }) {
  const request = parseQueryRequest(query);
  const project = projectFromQuery(query);
  const queryHash = createHash('sha256').update(request.query).digest('hex');
  const absoluteOut = path.resolve(outDir);
  const projectDir = path.join(path.dirname(absoluteOut), '_query-inputs');
  const projectFile = path.join(projectDir, `${request.slug}-${queryHash.slice(0, 12)}.project.json`);
  await Promise.all([ensureDir(projectDir), ensureDir(path.join(absoluteOut, 'input'))]);
  await writeJson(projectFile, project);
  const queryRecord = {
    query: request.query,
    sha256: queryHash,
    parsed: { topic: request.topic, pageCount: request.pageCount, language: request.language },
    semanticInputFields: ['query']
  };
  await writeJson(path.join(absoluteOut, 'input', 'query.json'), queryRecord);
  const preflightFile = path.join(absoluteOut, 'input', 'reference-provider-preflight.json');
  let preflightRecord;
  try {
    const preflight = await preflightReferenceProvider({ config: project.providers.reference, cwd: projectDir });
    preflightRecord = { ...preflight, checkedAt: new Date().toISOString() };
    await writeJson(preflightFile, preflightRecord);
  } catch (error) {
    await writeJson(preflightFile, {
      status: 'fail',
      provider: project.providers.reference.mode,
      model: project.providers.reference.model,
      checkedAt: new Date().toISOString(),
      error: error.message,
    });
    throw new Error(`参考图 provider 前置探针失败，规划尚未启动: ${error.message}`);
  }
  try {
    const result = await buildPipeline({ projectFile, outDir: absoluteOut, through: 'reference' });
    return { ...result, query: request, projectFile };
  } finally {
    await ensureDir(path.join(absoluteOut, 'input'));
    await Promise.all([
      writeJson(path.join(absoluteOut, 'input', 'query.json'), queryRecord),
      writeJson(preflightFile, preflightRecord),
    ]);
  }
}

export async function buildQueryNativeHtmlPipeline({ query, outDir, options = {} }) {
  const reference = await buildQueryReferencePipeline({ query, outDir });
  const native = await buildNativeHtmlFromReferenceRun({ sourceRun: reference.runDir, outDir: reference.runDir, options });
  return { ...native, query: reference.query, projectFile: reference.projectFile };
}
