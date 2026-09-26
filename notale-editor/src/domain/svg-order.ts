import { type Command, type Slide, invariant } from './model.js';
import { parse, serialize, elements, findElement, attr, NODE_ID, type Element } from './html.js';

import { isSvgLayer } from './svg-layers.js';

export function orderSvgObjects(
  slide: Slide,
  command: Extract<Command, { type: 'elements.order' }>,
) {
  const root = parse(slide.html);
  const requested = [...new Set(command.targets)].map((id) => findElement(root, id));
  const selected = requested.filter(
    (el) => !requested.some((ancestor) => ancestor !== el && elements(ancestor).includes(el)),
  );
  const parents = new Map<Element, Set<Element>>();
  const info = (el: Element) => ({ tag: el.tagName, namespace: el.namespaceURI });
  for (const el of selected) {
    const parent = el.parentNode;
    invariant(
      parent && 'tagName' in parent && isSvgLayer(info(el), info(parent)),
      'INVALID_LAYER',
      'Choose SVG graphics within a shared graphics container',
    );
    let ancestor: Element | undefined = el;
    while (ancestor) {
      invariant(
        !slide.locked.includes(attr(ancestor, NODE_ID) ?? ''),
        'LOCKED',
        'Object or its container is locked',
      );
      ancestor =
        ancestor.parentNode && 'tagName' in ancestor.parentNode ? ancestor.parentNode : undefined;
    }
    invariant(
      !elements(el).some((node) => slide.locked.includes(attr(node, NODE_ID) ?? '')),
      'LOCKED',
      'Operation would reorder a locked descendant',
    );
    if (!parents.has(parent)) parents.set(parent, new Set());
    parents.get(parent)!.add(el);
  }
  for (const [parent, moving] of parents) {
    const siblings = parent.childNodes.filter(
      (node): node is Element => 'tagName' in node && isSvgLayer(info(node), info(parent)),
    );
    let ordered = [...siblings];
    if (command.action === 'front' || command.action === 'back') {
      const chosen = siblings.filter((node) => moving.has(node));
      const rest = siblings.filter((node) => !moving.has(node));
      ordered = command.action === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
    } else if (command.action === 'forward') {
      for (let i = ordered.length - 2; i >= 0; i--)
        if (moving.has(ordered[i]) && !moving.has(ordered[i + 1]))
          [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
    } else {
      for (let i = 1; i < ordered.length; i++)
        if (moving.has(ordered[i]) && !moving.has(ordered[i - 1]))
          [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]];
    }
    // Leave definitions, scripts, whitespace and comments in their existing slots.
    const slots = new Set(siblings);
    let next = 0;
    parent.childNodes = parent.childNodes.map((node) =>
      slots.has(node as Element) ? ordered[next++] : node,
    );
  }
  slide.html = serialize(root);
}
