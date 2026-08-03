const PRESENTATION_KEYS = new Set([
  'layout',
  'style',
  'css',
  'html',
  'svg',
  'position',
  'width',
  'height',
  'color',
  'font',
  'theme',
]);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
}

function rejectPresentationKeys(value, path = 'page') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectPresentationKeys(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PRESENTATION_KEYS.has(key)) throw new Error(`${path}.${key} 越过语义/呈现边界`);
    rejectPresentationKeys(child, `${path}.${key}`);
  }
}

export function validateContentPack(pack) {
  assertObject(pack, 'content-pack');
  if (pack.version !== '2.0') throw new Error('content-pack.version 必须是 2.0');
  assertString(pack.title, 'content-pack.title');
  if (!Array.isArray(pack.sources)) throw new Error('content-pack.sources 必须是数组');
  if (!Array.isArray(pack.pages) || pack.pages.length === 0) {
    throw new Error('content-pack.pages 至少需要一页');
  }

  const sourceIds = new Set();
  for (const [index, source] of pack.sources.entries()) {
    assertObject(source, `sources[${index}]`);
    assertString(source.id, `sources[${index}].id`);
    assertString(source.path, `sources[${index}].path`);
    if (!/^[a-f0-9]{64}$/.test(source.sha256 || '')) {
      throw new Error(`sources[${index}].sha256 必须是 64 位十六进制`);
    }
    if (sourceIds.has(source.id)) throw new Error(`重复 source id: ${source.id}`);
    sourceIds.add(source.id);
  }

  const pageIds = new Set();
  for (const [index, page] of pack.pages.entries()) {
    assertObject(page, `pages[${index}]`);
    assertString(page.id, `pages[${index}].id`);
    assertString(page.title, `pages[${index}].title`);
    assertString(page.purpose, `pages[${index}].purpose`);
    if (pageIds.has(page.id)) throw new Error(`重复 page id: ${page.id}`);
    pageIds.add(page.id);
    rejectPresentationKeys(page, `pages[${index}]`);

    for (const [claimIndex, claim] of (page.claims || []).entries()) {
      assertObject(claim, `pages[${index}].claims[${claimIndex}]`);
      assertString(claim.text, `pages[${index}].claims[${claimIndex}].text`);
      if (!Array.isArray(claim.sourceIds)) {
        throw new Error(`pages[${index}].claims[${claimIndex}].sourceIds 必须是数组`);
      }
      for (const sourceId of claim.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(`pages[${index}] 引用了不存在的 source id: ${sourceId}`);
        }
      }
    }

    if (page.graph) {
      if (!Array.isArray(page.graph.nodes) || !Array.isArray(page.graph.edges)) {
        throw new Error(`pages[${index}].graph 需要 nodes/edges 数组`);
      }
      const nodes = new Set();
      for (const node of page.graph.nodes) {
        assertString(node.id, `pages[${index}].graph.nodes[].id`);
        assertString(node.label, `pages[${index}].graph.nodes[].label`);
        if (nodes.has(node.id)) throw new Error(`pages[${index}] graph node 重复: ${node.id}`);
        nodes.add(node.id);
      }
      for (const edge of page.graph.edges) {
        if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
          throw new Error(`pages[${index}] graph edge 指向不存在节点: ${edge.from} -> ${edge.to}`);
        }
      }
    }
  }
  return pack;
}

export function validateDesignBaseline(design) {
  assertObject(design, 'design baseline');
  assertString(design.styleLine, 'design.styleLine');
  assertObject(design.colors, 'design.colors');
  for (const key of ['primary', 'secondary', 'accent']) {
    if (!/^#[0-9a-f]{6}$/i.test(design.colors[key] || '')) {
      throw new Error(`design.colors.${key} 必须是 6 位 hex`);
    }
  }
  if (!Array.isArray(design.antiSlop) || design.antiSlop.length === 0) {
    throw new Error('design.antiSlop 至少需要一项');
  }
  const { width, height, safeInset } = design.canvas || {};
  if (![width, height, safeInset].every(Number.isFinite)) throw new Error('design.canvas 不完整');
  return design;
}

export function validateSectionHtml(html, pageId) {
  assertString(html, `page ${pageId} HTML`);
  const openSections = html.match(/<section\b/gi) || [];
  const closeSections = html.match(/<\/section>/gi) || [];
  if (openSections.length !== 1 || closeSections.length !== 1) {
    throw new Error(`${pageId}: 页面产物必须且只能包含一个 <section>`);
  }
  const requiredId = `data-page-id="${pageId}"`;
  if (!html.includes(requiredId)) throw new Error(`${pageId}: 缺少 ${requiredId}`);
  const dangerous = [
    [/<script\b/i, '<script>'],
    [/\son[a-z]+\s*=/i, '事件处理器'],
    [/\bjavascript\s*:/i, 'javascript: URL'],
    [/<(?:iframe|object|embed|link)\b/i, '危险或外链元素'],
    [/\b(?:src|href)\s*=\s*["']https?:/i, '外链资源'],
  ];
  for (const [pattern, label] of dangerous) {
    if (pattern.test(html)) throw new Error(`${pageId}: 禁止 ${label}`);
  }
  const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  if (!styleBlocks.length) throw new Error(`${pageId}: 页面必须携带局部 <style>`);
  for (const [, css] of styleBlocks) {
    const prefix = `[data-page-id="${pageId}"]`;
    if (css.includes('@scope')) {
      if (!new RegExp(`@scope\\s*\\([^)]*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(css)) {
        throw new Error(`${pageId}: @scope 根未绑定当前页面`);
      }
      continue;
    }
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...cleaned.matchAll(/(?:^|})\s*([^@}{][^{}]*)\{/g)]
      .flatMap(match => match[1].split(',').map(selector => selector.trim()))
      .filter(Boolean);
    if (!selectors.length || selectors.some(selector => !selector.includes(prefix))) {
      throw new Error(`${pageId}: CSS 未按页面 scope 隔离`);
    }
  }
  return html;
}
