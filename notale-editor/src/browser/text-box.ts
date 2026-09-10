import { geometryBasis, linearMatrix, localMatrix } from './coordinates.js';
import {
  snapConstrainedPoint,
  type ResizeHandle,
  type SnapRect,
  type SnapOptions,
  type SnapLine,
} from '../domain/snapping.js';

export type BoxSize = { width: number; height: number };
export type BoxEdit = {
  width: number;
  height: number | null;
  matrix: number[];
  style: Record<string, string>;
};
/** Infer text containers from their complete content tree. Paragraphs, lists,
 * columns and text-only grid/flex layouts keep their native flow and source.
 * Embedded scenes and positioned children retain content scaling. */
export function textBox(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.innerText?.trim()) return false;
  const roots = [
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'DIV',
    'SECTION',
    'ARTICLE',
    'BLOCKQUOTE',
    'LI',
    'UL',
    'OL',
    'DL',
    'DT',
    'DD',
    'PRE',
  ];
  if (!roots.includes(el.tagName)) return false;
  const css = getComputedStyle(el);
  if (['inline', 'contents', 'none'].includes(css.display) || css.writingMode !== 'horizontal-tb')
    return false;
  if (
    el.querySelector(
      'svg,canvas,img,video,audio,input,textarea,select,button,iframe,table,object,embed',
    )
  )
    return false;
  const flow = new Set([
    'inline',
    'inline-block',
    'contents',
    'none',
    'block',
    'flow-root',
    'list-item',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
  ]);
  for (const child of el.querySelectorAll('*')) {
    const c = getComputedStyle(child);
    if (
      !(child instanceof HTMLElement) ||
      child.shadowRoot !== null ||
      child.localName.includes('-') ||
      ['absolute', 'fixed', 'sticky'].includes(c.position) ||
      (!flow.has(c.display) && child.tagName !== 'BR')
    )
      return false;
  }
  for (let node: Element | null = el; node; node = node.parentElement)
    if (getComputedStyle(node).perspective !== 'none') return false;
  return !!linearMatrix(el);
}
export function boxSize(el: HTMLElement): BoxSize {
  const c = getComputedStyle(el),
    n = (key: string) => parseFloat(c.getPropertyValue(key)) || 0;
  return {
    width:
      n('width') +
      (c.boxSizing === 'border-box'
        ? 0
        : n('padding-left') +
          n('padding-right') +
          n('border-left-width') +
          n('border-right-width')),
    height:
      n('height') +
      (c.boxSizing === 'border-box'
        ? 0
        : n('padding-top') +
          n('padding-bottom') +
          n('border-top-width') +
          n('border-bottom-width')),
  };
}
export function boxPoint(el: HTMLElement, x: number, y: number) {
  const m = linearMatrix(el)!,
    size = boxSize(el),
    r = el.getBoundingClientRect();
  return {
    x: r.x + r.width / 2 + m.a * (x - size.width / 2) + m.c * (y - size.height / 2),
    y: r.y + r.height / 2 + m.b * (x - size.width / 2) + m.d * (y - size.height / 2),
  };
}
export function beginBoxResize(el: HTMLElement, handle: ResizeHandle) {
  const size = boxSize(el),
    full = linearMatrix(el),
    local = localMatrix(el);
  if (!full || !local || size.width <= 0 || size.height <= 0) return undefined;
  const inverse = full.inverse();
  if (!Number.isFinite(inverse.a)) return undefined;
  const origin = getComputedStyle(el).transformOrigin.split(/\s+/).map(parseFloat);
  const matrix = [
    local.a,
    local.b,
    local.c,
    local.d,
    local.e + origin[0] - local.a * origin[0] - local.c * origin[1],
    local.f + origin[1] - local.b * origin[0] - local.d * origin[1],
  ];
  const originalStyle = el.getAttribute('style');
  const horizontal = /[ew]/.test(handle),
    vertical = /[ns]/.test(handle);
  const points = new Map<string, { x: number; y: number }>();
  for (const x of [0, 0.5, 1])
    for (const y of [0, 0.5, 1])
      points.set(`${x},${y}`, boxPoint(el, x * size.width, y * size.height));
  const whiteSpace = getComputedStyle(el).whiteSpace;
  return {
    el,
    size,
    handle,
    horizontal,
    vertical,
    inverse,
    full,
    matrix,
    originalStyle,
    points,
    whiteSpace: whiteSpace === 'nowrap' ? 'normal' : whiteSpace === 'pre' ? 'pre-wrap' : whiteSpace,
  };
}
export type BoxGesture = NonNullable<ReturnType<typeof beginBoxResize>>;
/** Reflow in the browser, then correct parent-space translation to retain the
 * opposite anchor despite changing transform origins, content height or layout. */
export function previewBoxResize(
  g: BoxGesture,
  dx: number,
  dy: number,
  centered: boolean,
  proportional: boolean,
  stageScale: number,
  snapping?: { neighbors: SnapRect[]; options: SnapOptions; stageX: number; stageY: number },
): BoxEdit & { lines: SnapLine[] } {
  const v = new DOMPoint(dx, dy).matrixTransform(g.inverse),
    multiplier = centered ? 2 : 1;
  let width =
      g.size.width + (g.horizontal ? v.x * (g.handle.includes('w') ? -1 : 1) * multiplier : 0),
    height =
      g.size.height + (g.vertical ? v.y * (g.handle.includes('n') ? -1 : 1) * multiplier : 0);
  if (proportional) {
    const fx = width / g.size.width,
      fy = height / g.size.height,
      factor = !g.horizontal
        ? fy
        : !g.vertical
          ? fx
          : Math.abs(fx - 1) >= Math.abs(fy - 1)
            ? fx
            : fy;
    width = g.size.width * factor;
    height = g.size.height * factor;
  }
  width = Math.max(1, Math.min(100000, width));
  height = Math.max(1, Math.min(100000, height));
  const autoHeight = g.horizontal && !g.vertical && !proportional;
  const ax = centered ? 0.5 : g.handle.includes('w') ? 1 : g.horizontal ? 0 : 0.5,
    ay = centered ? 0.5 : g.handle.includes('n') ? 1 : 0;
  const anchor = g.points.get(`${ax},${ay}`)!;
  function apply(width: number, height: number): BoxEdit {
    const style: Record<string, string> = {
      'box-sizing': 'border-box',
      'transform-origin': '0px 0px',
      'min-width': '0px',
      'min-height': '0px',
      'max-width': 'none',
      'max-height': 'none',
      'min-inline-size': '0px',
      'min-block-size': '0px',
      'max-inline-size': 'none',
      'max-block-size': 'none',
      'inline-size': 'unset',
      'block-size': 'unset',
      ...(autoHeight ? { bottom: 'auto', 'inset-block-end': 'auto', 'align-self': 'start' } : {}),
      flex: 'none',
      'white-space': g.whiteSpace,
      'overflow-wrap': 'anywhere',
    };
    if (g.originalStyle === null) g.el.removeAttribute('style');
    else g.el.setAttribute('style', g.originalStyle);
    for (const [key, value] of Object.entries(style)) g.el.style.setProperty(key, value);
    g.el.style.removeProperty('width');
    g.el.style.removeProperty('height');
    g.el.style.width = `${width}px`;
    g.el.style.height = autoHeight ? 'auto' : `${height}px`;
    g.el.style.transform = `matrix(${g.matrix.join(',')})`;
    g.el.style.translate = g.el.style.rotate = g.el.style.scale = 'none';
    const actual = boxSize(g.el),
      after = boxPoint(g.el, actual.width * ax, actual.height * ay),
      basis = geometryBasis(g.el, stageScale)!;
    const [a, b, c, d] = basis.parent,
      det = a * d - b * c;
    if (Math.abs(det) < 1e-10) throw new Error('文字框的父级坐标不可逆');
    const px = (anchor.x - after.x) / stageScale,
      py = (anchor.y - after.y) / stageScale,
      matrix = [...g.matrix];
    matrix[4] += (d * px - c * py) / det;
    matrix[5] += (-b * px + a * py) / det;
    g.el.style.transform = `matrix(${matrix.join(',')})`;
    return { width, height: autoHeight ? null : height, matrix, style };
  }
  const base = apply(width, height);
  if (!snapping || snapping.options.enabled === false) return { ...base, lines: [] };
  const hx = g.handle.includes('w') ? 0 : g.horizontal ? 1 : 0.5;
  const hy = g.handle.includes('n') ? 0 : g.vertical ? 1 : 0.5;
  const point = () => {
    const size = boxSize(g.el),
      p = boxPoint(g.el, hx * size.width, hy * size.height);
    return { x: (p.x - snapping.stageX) / stageScale, y: (p.y - snapping.stageY) / stageScale };
  };
  const start = point();
  const xdir = { x: (g.full.a * (hx - ax)) / stageScale, y: (g.full.b * (hx - ax)) / stageScale };
  const ydir = { x: (g.full.c * (hy - ay)) / stageScale, y: (g.full.d * (hy - ay)) / stageScale };
  const directions = proportional
    ? [
        {
          x: xdir.x * g.size.width + ydir.x * g.size.height,
          y: xdir.y * g.size.width + ydir.y * g.size.height,
        },
      ]
    : [...(g.horizontal ? [xdir] : []), ...(g.vertical ? [ydir] : [])];
  let w = width,
    h = height;
  // Re-measure after wrapping. A line-break discontinuity may make a nearby
  // guide unattainable; never retain its line or silently move the fixed anchor.
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapped = snapConstrainedPoint(point(), directions, snapping.neighbors, snapping.options);
    if (!snapped.lines.length) break;
    if (proportional) {
      w += snapped.delta[0] * g.size.width;
      h += snapped.delta[0] * g.size.height;
    } else {
      if (g.horizontal) w += snapped.delta[0];
      if (g.vertical) h += snapped.delta[g.horizontal ? 1 : 0];
    }
    if (w < 1 || w > 100000 || h < 1 || h > 100000) break;
    const edit = apply(w, h),
      actual = point();
    if (Math.hypot(actual.x - start.x, actual.y - start.y) > snapping.options.tolerance + 1e-8)
      break;
    if (snapped.lines.every((l) => Math.abs(actual[l.axis] - l.position) <= 0.04 / stageScale))
      return { ...edit, lines: snapped.lines };
  }
  return { ...apply(width, height), lines: [] };
}
