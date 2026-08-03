import path from 'node:path';
import { resolveBinding, semanticTextWhitelist, validateNativeScene } from './native-scene.mjs';

function decodeHtml(text) {
  return String(text)
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'").replaceAll('&amp;', '&').replace(/<[^>]+>/g, '').trim();
}

function editableTexts(html) {
  const values = [];
  const pattern = /<([a-z0-9-]+)\b[^>]*\bdata-editable=["'][^"']+["'][^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    const value = decodeHtml(match[2]);
    if (value) values.push(value);
  }
  return values;
}

function issue(code, message, detail = null) {
  return { code, message, ...(detail == null ? {} : { detail }) };
}

export function auditNativePage({ scene, page, html, assetManifest = [], referenceFile = null, allowWebgl = false }) {
  const issues = [];
  try { validateNativeScene(scene, { pageId: page.id, allowWebgl }); }
  catch (error) { issues.push(issue('scene-contract', error.message)); }

  if (/<canvas\b/i.test(html)) issues.push(issue('canvas-forbidden', '原生页面禁止 Canvas 截图复刻'));
  if (/<script\b/i.test(html)) issues.push(issue('section-script', '页面 section 内禁止脚本'));
  if (/\b(?:src|href)\s*=\s*["']https?:/i.test(html)) issues.push(issue('external-resource', '页面包含外链资源'));
  if (/\b(?:webgl|three\.js|babylon)/i.test(html) && scene.mode !== 'webgl-exception') {
    issues.push(issue('undeclared-webgl', '检测到未声明的 WebGL 运行时'));
  }
  if (referenceFile) {
    const base = path.basename(referenceFile);
    if (html.includes(base) || html.includes(String(referenceFile).replaceAll('\\', '/'))) {
      issues.push(issue('reference-leak', '最终 HTML 引用了源参考图'));
    }
  }

  const allowed = new Set(semanticTextWhitelist(page));
  const visible = editableTexts(html);
  const invented = visible.filter(text => !allowed.has(text));
  if (invented.length) issues.push(issue('unbound-visible-copy', `${invented.length} 处可见文案不属于 content-pack`, invented));

  const boundNodes = scene.nodes.filter(node => node.type === 'text');
  const emptyBindings = boundNodes.filter(node => !resolveBinding(page, node.binding)).map(node => node.id);
  if (emptyBindings.length) issues.push(issue('empty-binding', `${emptyBindings.length} 个文字节点绑定为空`, emptyBindings));
  const missingDom = boundNodes.filter(node => {
    const expected = resolveBinding(page, node.binding);
    return expected && !visible.includes(expected);
  }).map(node => node.id);
  if (missingDom.length) issues.push(issue('missing-dom-copy', `${missingDom.length} 个绑定文案未出现在可编辑 DOM`, missingDom));

  if (page.graph?.nodes?.length && !/<svg\b[^>]*class=["'][^"']*native-edge-layer/i.test(html)) {
    issues.push(issue('graph-not-svg', '语义关系图缺少 SVG 连接层'));
  }
  if (page.series?.length && !/data-semantic-owner=["']dom-svg["']/i.test(html)) {
    issues.push(issue('chart-not-native', '数据页缺少 DOM/SVG 图表'));
  }

  const manifestById = new Map(assetManifest.map(item => [item.id, item]));
  for (const asset of scene.assets) {
    const record = manifestById.get(asset.id);
    if (!record) {
      issues.push(issue('asset-untracked', `${asset.id} 缺少资产清单记录`));
      continue;
    }
    const requiredByImageNode = scene.nodes.some(node => node.type === 'image' && node.assetId === asset.id);
    if (requiredByImageNode && record.status !== 'pass') {
      issues.push(issue('asset-generation-failed', `${asset.id} 是页面必需素材，但生成状态为 ${record.status}`, record.reason || null));
    }
    if (record.status === 'pass' && !record.file) issues.push(issue('asset-file-missing', `${asset.id} 清单缺少本地文件`));
    if (asset.transparent && record.status === 'pass' && record.alphaChannel !== true) {
      issues.push(issue('asset-alpha-missing', `${asset.id} 请求透明背景，但输出没有 alpha 通道`));
    }
    const coverage = asset.bbox.w * asset.bbox.h;
    if (coverage > .75 && asset.role !== 'background') {
      issues.push(issue('whole-slide-raster', `${asset.id} 非背景位图覆盖 ${(coverage * 100).toFixed(1)}% 画布`));
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*data-native-asset-id=["']([^"']+)["'][^>]*>/gi)) {
    if (!manifestById.has(match[1])) issues.push(issue('unmanifested-image', `HTML 图片 ${match[1]} 不在 asset-manifest`));
  }

  const webgl = scene.mode === 'webgl-exception';
  if (webgl) {
    if (!allowWebgl) issues.push(issue('webgl-disabled', 'WebGL 例外未获运行配置授权'));
    const reason = String(scene.rationale || '');
    if (!/webgl|css3d|无法|exception/i.test(reason)) issues.push(issue('webgl-no-reason', 'WebGL 例外缺少明确理由'));
    if (!scene.nodes.some(node => node.type === 'svg')) issues.push(issue('webgl-no-fallback', 'WebGL 例外缺少 SVG 降级节点'));
  }

  return {
    version: '1.0',
    pageId: page.id,
    pass: issues.length === 0,
    mode: scene.mode,
    nativeOwnership: {
      editableDomTexts: visible.length,
      semanticGraph: page.graph?.nodes?.length ? 'svg+html' : 'not-applicable',
      semanticChart: page.series?.length ? 'dom+svg' : 'not-applicable',
      rasterAssets: scene.assets.length,
      sourceReferenceEmbedded: false,
      webgl: webgl ? 'declared-exception' : 'disabled',
    },
    issues,
  };
}

export function summarizeNativeAudit(pageAudits) {
  const issueCounts = {};
  for (const page of pageAudits) for (const item of page.issues) issueCounts[item.code] = (issueCounts[item.code] || 0) + 1;
  return {
    version: '1.0',
    pass: pageAudits.every(item => item.pass),
    pages: pageAudits,
    totals: {
      pages: pageAudits.length,
      passed: pageAudits.filter(item => item.pass).length,
      failed: pageAudits.filter(item => !item.pass).length,
      issues: Object.values(issueCounts).reduce((sum, value) => sum + value, 0),
    },
    issueCounts,
  };
}
