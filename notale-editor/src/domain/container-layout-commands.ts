import type { ContainerLayout } from './container-layout.js';
import type { Slide } from './model.js';
import { invariant } from './model.js';
import { parse, serialize, findElement, elements, attr, NODE_ID, patchStyle } from './html.js';
function sizeStyle(
  spec: Pick<
    ContainerLayout,
    | 'width'
    | 'height'
    | 'widthValue'
    | 'heightValue'
    | 'minWidth'
    | 'maxWidth'
    | 'minHeight'
    | 'maxHeight'
  >,
) {
  const style: Record<string, string> = {};
  for (const axis of ['width', 'height'] as const) {
    if (
      spec[axis] === 'fixed' &&
      spec[axis === 'width' ? 'widthValue' : 'heightValue'] !== undefined
    )
      style[axis] = `${spec[axis === 'width' ? 'widthValue' : 'heightValue']}px`;
    if (spec[axis] !== 'fixed') style[axis] = spec[axis] === 'hug' ? 'max-content' : '100%';
    for (const bound of ['min', 'max'] as const) {
      const key = `${bound}${axis === 'width' ? 'Width' : 'Height'}` as
        | 'minWidth'
        | 'maxWidth'
        | 'minHeight'
        | 'maxHeight';
      style[`${bound}-${axis}`] =
        spec[key] === undefined ? (bound === 'min' ? '0' : 'none') : `${spec[key]}px`;
    }
    invariant(
      spec[axis === 'width' ? 'minWidth' : 'minHeight'] === undefined ||
        spec[axis === 'width' ? 'maxWidth' : 'maxHeight'] === undefined ||
        spec[axis === 'width' ? 'minWidth' : 'minHeight']! <=
          spec[axis === 'width' ? 'maxWidth' : 'maxHeight']!,
      'INVALID_LAYOUT',
      'Minimum size must not exceed maximum size',
    );
  }
  return style;
}
export function applyContainerLayout(slide: Slide, target: string, layout: ContainerLayout) {
  const root = parse(slide.html),
    node = findElement(root, target);
  invariant(
    node.namespaceURI !== 'http://www.w3.org/2000/svg',
    'INVALID_LAYOUT',
    'CSS container layout requires an HTML container',
  );
  for (const child of elements(node))
    invariant(
      !slide.locked.includes(attr(child, NODE_ID) ?? ''),
      'LOCKED',
      'Layout contains a locked object',
    );
  for (
    let ancestor: typeof node | undefined = node;
    ancestor;
    ancestor =
      ancestor.parentNode && 'tagName' in ancestor.parentNode ? ancestor.parentNode : undefined
  )
    invariant(
      !slide.locked.includes(attr(ancestor, NODE_ID) ?? ''),
      'LOCKED',
      'Layout container is locked',
    );
  patchStyle(node, {
    ...sizeStyle(layout),
    display: layout.mode === 'grid' ? 'grid' : layout.mode === 'block' ? 'block' : 'flex',
    'flex-direction': layout.mode === 'column' ? 'column' : 'row',
    'flex-wrap': layout.wrap ? 'wrap' : 'nowrap',
    gap: `${layout.gap}px`,
    padding: `${layout.padding}px`,
    'box-sizing': 'border-box',
    'align-items': layout.align,
    'justify-content': layout.justify,
    'grid-template-columns':
      layout.mode === 'grid' ? `repeat(${layout.columns},minmax(0,1fr))` : 'none',
  });
  for (const [id, spec] of Object.entries(layout.children)) {
    const child = findElement(root, id);
    invariant(
      child.parentNode === node,
      'INVALID_LAYOUT',
      'Child constraints require direct container children',
    );
    patchStyle(child, {
      ...sizeStyle(spec),
      position: 'relative',
      inset: 'auto',
      margin: '0',
      'box-sizing': 'border-box',
      'flex-grow': String(spec.grow),
      'flex-shrink': String(spec.shrink),
      'align-self': spec.align,
    });
  }
  slide.constraints ??= {};
  slide.constraints[target] = structuredClone(layout);
  slide.html = serialize(root);
}
