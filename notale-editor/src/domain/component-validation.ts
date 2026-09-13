import type { Slide } from './model.js';
import { invariant } from './model.js';
import { parse, elements, attr, NODE_ID, findElement } from './html.js';
import { componentTargets } from './components.js';
export function validateComponents(slide: Slide) {
  const root = parse(slide.html),
    used = new Map<string, string>();
  const components = slide.components ?? [];
  invariant(
    new Set(components.map((component) => component.root)).size === components.length,
    'INVALID_COMPONENT',
    'Each root has one component definition',
  );
  invariant(
    new Set(components.map((c) => c.id)).size === components.length,
    'INVALID_COMPONENT',
    'Component IDs must be unique',
  );
  for (const component of components) {
    const parent = findElement(root, component.root),
      inside = new Set(elements(parent).map((node) => attr(node, NODE_ID)));
    invariant(
      componentTargets(component).every((id) => inside.has(id)),
      'INVALID_COMPONENT',
      'Component references must remain inside its root',
    );
    const states = new Set(component.states.map((state) => state.id));
    invariant(
      component.steps.every((step) => step.step !== 0 || step.state === component.initial),
      'INVALID_COMPONENT',
      'Step zero must match the initial state',
    );
    invariant(
      states.size === component.states.length && states.has(component.initial),
      'INVALID_COMPONENT',
      'Component needs distinct states and a valid initial state',
    );
    invariant(
      new Set(component.events.map((event) => event.id)).size === component.events.length,
      'INVALID_COMPONENT',
      'Component event IDs must be unique',
    );
    invariant(
      component.events.every(
        (event) => states.has(event.to) && (!event.from || states.has(event.from)),
      ),
      'INVALID_COMPONENT',
      'Event references an unavailable state',
    );
    invariant(
      new Set(component.steps.map((step) => step.step)).size === component.steps.length &&
        component.steps.every((step) => states.has(step.state)),
      'INVALID_COMPONENT',
      'Each step maps to one existing state',
    );
    for (const event of component.events)
      invariant(
        !component.events.some(
          (other) =>
            other !== event &&
            other.target === event.target &&
            other.event === event.event &&
            (!other.from || !event.from || other.from === event.from),
        ),
        'INVALID_COMPONENT',
        'Event transitions must have unambiguous source states',
      );
    for (const state of component.states)
      for (const [target, patch] of Object.entries(state.patches)) {
        const node = findElement(root, target);
        invariant(
          patch.text === undefined ||
            (!node.childNodes.some((child) => 'tagName' in child) &&
              ![
                'script',
                'style',
                'canvas',
                'iframe',
                'input',
                'textarea',
                'select',
                'img',
                'video',
                'audio',
              ].includes(node.tagName)),
          'INVALID_COMPONENT',
          'State text targets a text-only object',
        );
        invariant(
          patch.nativeChartValue === undefined ||
            (!!slide.nativeCharts[target]?.interaction &&
              inside.has(slide.nativeCharts[target].interaction!.root)),
          'INVALID_COMPONENT',
          'Chart state requires its complete editable native component inside this root',
        );
        const properties = [
          ...Object.keys(patch.style ?? {}),
          ...(patch.text !== undefined ? ['$text'] : []),
          ...(patch.visible !== undefined ? ['visibility', 'pointer-events'] : []),
          ...(patch.nativeChartValue !== undefined ? ['$native'] : []),
        ];
        for (const property of properties) {
          const key = target + '/' + property;
          invariant(
            !used.has(key) || used.get(key) === component.id,
            'COMPONENT_CONFLICT',
            'Two components cannot own the same object property',
          );
          used.set(key, component.id);
        }
      }
  }
}
