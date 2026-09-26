import { invariant, type Command } from './model.js';
import type { InteractiveComponent } from './components.js';
import { assertStatic } from './static-html.js';
import { attr, elements, parse, NODE_ID } from './html-tree.js';
/** Inserting markup together with an interaction takes three commands, because `element.insert`
 * re-mints every id (so a component could not name the new nodes) while `slide.insert` keeps
 * author ids and `elements.transfer` is the only mover that remaps ids and rewrites component
 * references to match. This is the one place that knows how to spell that transaction. */
export function interactionInsertCommands(input: {
  slide: { id: string; sourcePath: string };
  scratchId: string;
  html: string;
  components: InteractiveComponent[];
}): Command[] {
  assertStatic(input.html);
  const main = elements(parse(`<!doctype html><html><body><main>${input.html}</main></body></html>`)).find(
    (el) => el.tagName === 'main',
  )!;
  const tops = main.childNodes.filter((node): node is typeof main => 'tagName' in node);
  invariant(tops.length === 1, 'INTERACTION_ROOT', '插入的 html 必须恰好有一个顶层元素，把内容包进一个容器里');
  const ids = elements(main)
    .filter((el) => el !== main)
    .map((el) => attr(el, NODE_ID))
    .filter((id): id is string => id !== undefined);
  // `assignIds` would silently re-mint a duplicate or malformed id, and the component would then
  // point at an object that no longer exists under that name.
  invariant(
    new Set(ids).size === ids.length && ids.every((id) => /^[\w-]{1,100}$/.test(id)),
    'INTERACTION_IDS',
    'data-notale-id 必须互不重复，且只含字母、数字、下划线、连字符',
  );
  const root = attr(tops[0], NODE_ID);
  invariant(root !== undefined, 'INTERACTION_ROOT', '顶层元素需要 data-notale-id');
  const known = new Set(ids);
  for (const component of input.components)
    // transferObjects drops a component whose root is outside the moved subtree without a word.
    invariant(known.has(component.root), 'INTERACTION_COMPONENT', `组件根 ${component.root} 不在插入的 html 里`);
  // A sibling of the target page: transferObjects rebases relative asset urls between the two paths.
  const sourcePath = input.slide.sourcePath.replace(/[^/]*$/, `${input.scratchId}.html`);
  return [
    {
      type: 'slide.insert',
      after: input.slide.id,
      slide: {
        id: input.scratchId,
        name: '临时',
        sourcePath,
        html: `<!doctype html><html><body><main id="stage">${input.html}</main></body></html>`,
        components: input.components,
      },
    },
    // The fragment carries its own absolute geometry; without `rectangles` the transfer leaves it
    // alone and only adds an identity translate. The default offset would shift it by 20px.
    { type: 'elements.transfer', slideId: input.slide.id, sourceSlideId: input.scratchId, targets: [root], mode: 'copy', offset: { x: 0, y: 0 } },
    { type: 'slide.delete', slideId: input.scratchId },
  ] as Command[];
}
