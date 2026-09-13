import {
  type Command,
  type DeckDocument,
  type Slide,
  invariant,
  transformSchema,
} from './model.js';
import { parse, findElement, elements, attr, NODE_ID } from './html.js';

import { arrangePlan } from './arrange-plan.js';

type Arrange = Extract<Command, { type: 'elements.arrange' }>;
export function arrangeCommands(doc: DeckDocument, slide: Slide, command: Arrange): Command[] {
  const rects = command.rectangles;
  invariant(
    new Set(rects.map((r) => r.id)).size === rects.length,
    'DUPLICATE_SELECTION',
    'Geometry selection contains duplicate objects',
  );
  const root = parse(slide.html),
    nodes = rects.map((r) => findElement(root, r.id));
  for (const el of nodes)
    invariant(
      !elements(el)
        .slice(1)
        .some((n) => rects.some((r) => r.id === attr(n, NODE_ID))),
      'NESTED_SELECTION',
      'Select a container or its children, not both',
    );
  return arrangePlan(doc,slide,command);
}
