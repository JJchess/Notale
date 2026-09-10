import valueParser from 'postcss-value-parser';
const hrefTags = new Set([
  'use',
  'linearGradient',
  'radialGradient',
  'pattern',
  'filter',
  'textPath',
  'image',
]);
export function svgReferenceValue(
  tag: string,
  name: string,
  value: string,
  replace: (id: string) => string,
) {
  if (hrefTags.has(tag) && (name === 'href' || name === 'xlink:href') && value.startsWith('#'))
    return '#' + replace(value.slice(1));
  if (!/url\s*\(/i.test(value)) return value;
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
    const first = node.nodes[0];
    const url =
      node.nodes.length === 1 && first?.type === 'string'
        ? first.value
        : valueParser.stringify(node.nodes).trim();
    if (url.startsWith('#')) node.nodes = valueParser('#' + replace(url.slice(1))).nodes;
    return false;
  });
  return parsed.toString();
}
