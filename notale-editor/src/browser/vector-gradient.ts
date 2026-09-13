import {
  cleanVector,
  createSvg,
  freshVector,
  pointIn,
  vectorDiff,
  paintVector,
} from './vector-dom.js';
/** Paint handles live in viewport coordinates; the gradient remains native SVG. */
export function editVectorGradient(
  target: SVGGraphicsElement,
  root: SVGSVGElement,
  commit: (before: Element) => void,
) {
  const id = getComputedStyle(target).fill.match(/#([^)'"\s]+)/)?.[1];
  let gradient = id ? (document.getElementById(id) as unknown as SVGGradientElement) : null;
  if (!gradient || !['linearGradient', 'radialGradient'].includes(gradient.localName))
    throw Error('请先应用线性或径向渐变');
  if (gradient.hasAttribute('href') || gradient.hasAttribute('xlink:href'))
    throw Error('请先为此图形应用独立渐变');
  const overlay = createSvg('svg');
  overlay.removeAttribute('data-notale-id');
  overlay.setAttribute('data-notale-handles', '');
  overlay.setAttribute('aria-label', '编辑渐变');
  overlay.setAttribute('tabindex', '-1');
  overlay.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible';
  document.documentElement.append(overlay);
  let drag: { key: string; before: Element; original: SVGGradientElement } | undefined,
    privatePaint = false;
  const radial = gradient.localName === 'radialGradient';
  function geometry() {
    const bbox = target.getBBox(),
      user = gradient!.getAttribute('gradientUnits') === 'userSpaceOnUse';
    const transform = gradient!.gradientTransform.baseVal.consolidate()?.matrix;
    const matrix = new DOMMatrix(
      transform
        ? [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f]
        : undefined,
    );
    return { bbox, user, matrix };
  }
  function value(key: string, fallback: number) {
    const raw = gradient!.getAttribute(key),
      user = gradient!.getAttribute('gradientUnits') === 'userSpaceOnUse',
      vb = root.viewBox.baseVal,
      basis =
        key === 'r'
          ? Math.hypot(vb.width, vb.height) / Math.SQRT2
          : /y/.test(key)
            ? vb.height
            : vb.width;
    if (raw === null) return fallback * (user ? basis : 1);
    return (
      (parseFloat(raw) / (raw.endsWith('%') ? 100 : 1)) * (raw.endsWith('%') && user ? basis : 1)
    );
  }
  function points() {
    if (radial) {
      const x = value('cx', 0.5),
        y = value('cy', 0.5);
      return [
        { key: 'center', x, y },
        { key: 'radius', x: x + value('r', 0.5), y },
        {
          key: 'focus',
          x: gradient!.hasAttribute('fx') ? value('fx', 0) : x,
          y: gradient!.hasAttribute('fy') ? value('fy', 0) : y,
        },
      ];
    }
    return [
      { key: 'start', x: value('x1', 0), y: value('y1', 0) },
      { key: 'end', x: value('x2', 1), y: value('y2', 0) },
    ];
  }
  function screen(x: number, y: number) {
    const { bbox, user, matrix } = geometry();
    let p = new DOMPoint(x, y).matrixTransform(matrix);
    if (!user) p = new DOMPoint(bbox.x + p.x * bbox.width, bbox.y + p.y * bbox.height);
    return p.matrixTransform(target.getScreenCTM()!);
  }
  function refresh() {
    overlay.replaceChildren();
    const pts = points().map((p) => ({ ...p, ...screen(p.x, p.y).toJSON() }));
    const a = pts[0],
      b = pts[1];
    const line = createSvg('line', {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      stroke: '#7450e9',
      'stroke-width': 2,
    });
    line.removeAttribute('data-notale-id');
    overlay.append(line);
    for (const p of pts) {
      const c = createSvg('circle', {
        cx: p.x,
        cy: p.y,
        r: p.key === 'focus' ? 4 : 6,
        fill: 'white',
        stroke: '#7450e9',
        'stroke-width': 2,
        'data-gradient-handle': p.key,
      });
      c.removeAttribute('data-notale-id');
      c.style.pointerEvents = 'all';
      overlay.append(c);
    }
  }
  overlay.addEventListener('pointerdown', (e) => {
    const key = (e.target as Element).getAttribute('data-gradient-handle');
    if (!key) return;
    window.focus();
    (overlay as SVGSVGElement).focus({ preventScroll: true });
    e.preventDefault();
    e.stopPropagation();
    drag = { key, before: cleanVector(root), original: gradient! };
    if (!privatePaint) {
      const clone = freshVector(gradient!) as SVGGradientElement;
      gradient!.after(clone);
      gradient = clone;
      target.style.fill = `url(#${clone.id})`;
      privatePaint = true;
    }
    overlay.setPointerCapture(e.pointerId);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { bbox, user, matrix } = geometry();
    let p = pointIn(target, e.clientX, e.clientY);
    if (!user)
      p = new DOMPoint((p.x - bbox.x) / (bbox.width || 1), (p.y - bbox.y) / (bbox.height || 1));
    p = p.matrixTransform(matrix.inverse());
    if (drag.key === 'radius')
      gradient!.setAttribute(
        'r',
        String(Math.hypot(p.x - value('cx', 0.5), p.y - value('cy', 0.5))),
      );
    else {
      const keys = {
        start: ['x1', 'y1'],
        end: ['x2', 'y2'],
        center: ['cx', 'cy'],
        focus: ['fx', 'fy'],
      }[drag.key]!;
      gradient!.setAttribute(keys[0], String(p.x));
      gradient!.setAttribute(keys[1], String(p.y));
    }
    refresh();
  });
  overlay.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const before = drag.before;
    drag = undefined;
    overlay.releasePointerCapture(e.pointerId);
    commit(before);
  });
  function cancel() {
    if (!drag) return;
    paintVector(vectorDiff(cleanVector(root), drag.before));
    gradient = document.getElementById(drag.original.id) as unknown as SVGGradientElement;
    drag = undefined;
    privatePaint = false;
    refresh();
  }
  const blur = () => cancel();
  window.addEventListener('blur', blur);
  overlay.addEventListener('pointercancel', cancel);
  refresh();
  return {
    refresh,
    cancel,
    destroy() {
      cancel();
      overlay.remove();
      window.removeEventListener('blur', blur);
    },
  };
}
