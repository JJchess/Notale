const svgNamespace = 'http://www.w3.org/2000/svg';
const graphics = new Set([
  'a',
  'circle',
  'ellipse',
  'foreignObject',
  'g',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'svg',
  'switch',
  'text',
  'use',
]);
const containers = new Set(['svg', 'g', 'a', 'symbol', 'marker', 'pattern', 'mask', 'clipPath']);

// Text runs and switch alternatives have semantic order, not independent layers.
export function isSvgLayer(
  element: { tag: string; namespace: string },
  parent?: { tag: string; namespace: string },
) {
  return (
    element.namespace === svgNamespace &&
    graphics.has(element.tag) &&
    parent?.namespace === svgNamespace &&
    containers.has(parent.tag)
  );
}
