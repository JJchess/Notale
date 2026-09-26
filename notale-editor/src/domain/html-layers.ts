import { invariant, type Command } from './model.js';
type ObjectInfo = { id: string; parent?: string; namespace: string; tag: string; locked?: boolean };
/** Plan CSS stacking changes without moving DOM nodes or altering authored box geometry. */
export function htmlLayerCommands(
  slideId: string,
  targets: string[],
  objects: ObjectInfo[],
  styles: Record<string, Record<string, string>>,
  action: 'front' | 'back' | 'forward' | 'backward',
): Command[] {
  const chosen = new Set(targets),
    byId = new Map(objects.map((object) => [object.id, object]));
  const parents = new Set(targets.map((id) => byId.get(id)?.parent));
  const edits: Command[] = [];
  for (const parent of parents) {
    const display = parent ? (styles[parent]?.display ?? '') : '';
    const flowItems = /^(inline-)?(flex|grid)$/.test(display);
    const siblingObjects = objects.filter(
      (object) =>
        object.parent === parent &&
        (object.namespace === 'http://www.w3.org/1999/xhtml' || object.tag === 'svg'),
    );
    const movable = (object: ObjectInfo) =>
      flowItems || (styles[object.id]?.position ?? 'static') !== 'static';
    const candidates = siblingObjects.filter((object) => movable(object) || chosen.has(object.id));
    const z = (object: ObjectInfo) =>
      Number.parseInt(styles[object.id]?.['z-index'] ?? '0', 10) || 0;
    const dom = new Map(candidates.map((object, index) => [object.id, index]));
    const before = [...candidates].sort((a, b) => z(a) - z(b) || dom.get(a.id)! - dom.get(b.id)!);
    const ordered = [...before];
    if (action === 'front' || action === 'back') {
      const selected = before.filter((object) => chosen.has(object.id)),
        rest = before.filter((object) => !chosen.has(object.id));
      ordered.splice(
        0,
        ordered.length,
        ...(action === 'front' ? [...rest, ...selected] : [...selected, ...rest]),
      );
    } else if (action === 'forward') {
      for (let i = ordered.length - 2; i >= 0; i--)
        if (chosen.has(ordered[i].id) && !chosen.has(ordered[i + 1].id))
          [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
    } else
      for (let i = 1; i < ordered.length; i++)
        if (chosen.has(ordered[i].id) && !chosen.has(ordered[i - 1].id))
          [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]];
    for (const object of ordered.filter((object) => chosen.has(object.id))) {
      invariant(!object.locked, 'LOCKED', 'The selected layer is locked');
      if (!movable(object)) {
        invariant(
          action === 'front' || action === 'back',
          'INVALID_LAYER',
          'Single-layer moves require positioned objects or flex/grid items',
        );
        invariant(
          !objects.some((child) => {
            let at = child.parent;
            while (at) {
              if (at === object.id)
                return ['absolute', 'fixed'].includes(styles[child.id]?.position);
              at = byId.get(at)?.parent;
            }
            return false;
          }),
          'INVALID_LAYER',
          'Changing this flow container would move positioned descendants',
        );
      }
    }
    if (ordered.every((object, index) => object === before[index]) && ordered.every(movable))
      continue;
    // Equal z-index values preserve DOM order; inversions need a strict integer increment.
    const distance = ordered.map(() => 0);
    for (let i = 1; i < ordered.length; i++)
      distance[i] =
        distance[i - 1] + (dom.get(ordered[i - 1].id)! > dom.get(ordered[i].id)! ? 1 : 0);
    const anchors = ordered.flatMap((object, index) => (object.locked ? [index] : []));
    for (let i = 1; i < anchors.length; i++)
      invariant(
        z(ordered[anchors[i]]) - z(ordered[anchors[i - 1]]) >=
          distance[anchors[i]] - distance[anchors[i - 1]],
        'LOCKED',
        'Locked layer positions leave no room for this order',
      );
    const base = anchors.length
      ? z(ordered[anchors[0]]) - distance[anchors[0]]
      : Math.min(0, ...before.map(z));
    let anchor = -1;
    for (let i = 0; i < ordered.length; i++) {
      const object = ordered[i];
      if (object.locked) {
        anchor = i;
        continue;
      }
      let value =
        anchor >= 0 ? z(ordered[anchor]) + distance[i] - distance[anchor] : base + distance[i];
      if (!movable(object))
        value =
          action === 'front'
            ? Math.max(0, ...siblingObjects.map(z)) + 1
            : Math.min(0, ...siblingObjects.map(z)) - 1;
      invariant(
        Number.isSafeInteger(value) && Math.abs(value) <= 2147483647,
        'INVALID_LAYER',
        'Layer range exceeded',
      );
      if (value === z(object) && movable(object)) continue;
      edits.push({
        type: 'element.patch',
        slideId,
        target: object.id,
        patch: {
          style: {
            ...(!movable(object)
              ? { position: 'relative', left: '0px', right: 'auto', top: '0px', bottom: 'auto' }
              : {}),
            'z-index': String(value),
          },
        },
      });
    }
  }
  return edits;
}
