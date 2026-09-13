/** CSS individual transforms precede the transform matrix. Translation is local
 * to the element's parent, before its own rotation and scale. */
function referenceBox(el: HTMLElement | SVGGraphicsElement) {
  if (el instanceof HTMLElement)
    return { x: 0, y: 0, width: el.offsetWidth, height: el.offsetHeight };
  if (el instanceof SVGSVGElement && el.parentElement instanceof HTMLElement)
    return { x: 0, y: 0, width: el.clientWidth, height: el.clientHeight };
  if (getComputedStyle(el).transformBox === 'fill-box') return el.getBBox();
  if (getComputedStyle(el).transformBox === 'stroke-box') return undefined;
  const viewport = el.ownerSVGElement;
  if (!viewport) return undefined;
  const box = viewport.viewBox.baseVal;
  return {
    x: 0,
    y: 0,
    width: box.width || viewport.clientWidth,
    height: box.height || viewport.clientHeight,
  };
}
export function localMatrix(el: HTMLElement | SVGGraphicsElement) {
  const reference = referenceBox(el);
  if (!reference) return undefined;
  const css = getComputedStyle(el),
    matrix = new DOMMatrix(css.transform === 'none' ? undefined : css.transform);
  if (!matrix.is2D || (css.rotate !== 'none' && !/^-?[\d.]+(deg|rad|grad|turn)$/.test(css.rotate)))
    return undefined;
  const rotation =
    css.rotate === 'none'
      ? 0
      : parseFloat(css.rotate) *
        (css.rotate.endsWith('turn')
          ? 360
          : css.rotate.endsWith('grad')
            ? 0.9
            : css.rotate.endsWith('rad')
              ? 180 / Math.PI
              : 1);
  const values = css.scale === 'none' ? [1, 1] : css.scale.split(/\s+/).map(Number);
  const translation = css.translate === 'none' ? ['0', '0'] : css.translate.split(/\s+/);
  const amount = (value: string, size: number) =>
    parseFloat(value) * (value.endsWith('%') ? size / 100 : 1);
  return new DOMMatrix()
    .translate(
      amount(translation[0], reference.width),
      amount(translation[1] ?? '0', reference.height),
    )
    .rotate(rotation)
    .scale(values[0], values[1] ?? values[0])
    .multiply(matrix);
}
/** The center of an affine rectangle equals the center of its AABB. */
export function linearMatrix(el: HTMLElement) {
  if (!(el instanceof HTMLElement)) return undefined;
  let linear = new DOMMatrix();
  for (let current: HTMLElement | null = el; current; current = current.parentElement) {
    const matrix = localMatrix(current);
    if (!matrix) return undefined;
    const local = new DOMMatrix()
      .scale(Number(getComputedStyle(current).zoom) || 1)
      .multiply(matrix);
    local.e = 0;
    local.f = 0;
    linear = local.multiply(linear);
  }
  return linear;
}
export function geometryBasis(el: HTMLElement | SVGGraphicsElement, stageScale: number) {
  if (el instanceof SVGGraphicsElement && !(el instanceof SVGSVGElement)) {
    // getScreenCTM may expose only six SVGMatrix components even when an HTML
    // ancestor has perspective; reject that case rather than silently flatten it.
    for (let node: Element | null = el; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (
        css.perspective !== 'none' ||
        !new DOMMatrix(css.transform === 'none' ? undefined : css.transform).is2D ||
        (css.rotate !== 'none' && !/^-?[\d.]+(deg|rad|grad|turn)$/.test(css.rotate))
      )
        return undefined;
    }

    const local = localMatrix(el),
      screen = el.getScreenCTM(),
      full = screen
        ? new DOMMatrix([screen.a, screen.b, screen.c, screen.d, screen.e, screen.f])
        : null,
      reference = referenceBox(el);
    if (!local || !full || !full.is2D || !reference) return undefined;
    const parent = full.multiply(local.inverse()),
      inverse = full.inverse();
    if (![parent.a, parent.b, parent.c, parent.d, inverse.a].every(Number.isFinite))
      return undefined;
    const box = el.getBoundingClientRect(),
      bounds = el.getBBox();
    const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
      inverse,
    );
    const origin = getComputedStyle(el).transformOrigin.split(/\s+/).slice(0, 2).map(parseFloat);
    origin[0] += reference.x;
    origin[1] += reference.y;
    return {
      parent: [
        parent.a / stageScale,
        parent.b / stageScale,
        parent.c / stageScale,
        parent.d / stageScale,
      ],
      local: [local.a, local.b, local.c, local.d, local.e, local.f],
      origin,
      size: [bounds.width, bounds.height],
      center: [center.x, center.y],
    };
  }
  if (
    !el.parentElement ||
    !(
      el instanceof HTMLElement ||
      (el instanceof SVGSVGElement && el.parentElement instanceof HTMLElement)
    )
  )
    return undefined;
  const parent = linearMatrix(el.parentElement),
    local = localMatrix(el);
  if (!parent || !local) return undefined;
  const zoom = (Number(getComputedStyle(el).zoom) || 1) / stageScale;
  const origin = getComputedStyle(el).transformOrigin.split(/\s+/).slice(0, 2).map(parseFloat);
  return {
    parent: [parent.a * zoom, parent.b * zoom, parent.c * zoom, parent.d * zoom],
    local: [local.a, local.b, local.c, local.d, local.e, local.f],
    origin,
    size: [
      el instanceof HTMLElement ? el.offsetWidth : el.clientWidth,
      el instanceof HTMLElement ? el.offsetHeight : el.clientHeight,
    ],
  };
}
export function localPoint(el: HTMLElement, event: { clientX: number; clientY: number }) {
  const linear = linearMatrix(el);
  if (!linear) return undefined;
  const inverse = linear.inverse();
  if (!Number.isFinite(inverse.a)) return undefined;
  const box = el.getBoundingClientRect(),
    point = new DOMPoint(
      event.clientX - box.x - box.width / 2,
      event.clientY - box.y - box.height / 2,
    ).matrixTransform(inverse);
  return { x: point.x + el.offsetWidth / 2, y: point.y + el.offsetHeight / 2 };
}
