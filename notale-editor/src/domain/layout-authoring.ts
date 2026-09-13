import { type Command, type DeckDocument, invariant, slideSchema } from './model.js';
import { parse, serialize, elements, normalizeHtml, appendHtml, setText, textOf } from './html.js';
import { assertStatic, rebaseElements } from './layouts.js';
import { expandCss, type Stylesheets } from './layout-css.js';
import { rebaseTheme } from './urls.js';

export function applyLayoutAuthoring(
  doc: DeckDocument,
  command: Command,
  stylesheets: Stylesheets = {},
) {
  if (command.type === 'layout.checkout') {
    const layout = doc.layouts.find((item) => item.id === command.id);
    invariant(layout, 'LAYOUT_NOT_FOUND', 'Shared layout does not exist');
    invariant(
      !doc.slides.some((page) => page.id === command.newId),
      'DUPLICATE_SLIDE',
      'Slide exists',
    );
    invariant(
      !doc.slides.some((page) => page.layoutSourceId === layout.id),
      'LAYOUT_SOURCE_EXISTS',
      'Open the existing master editing page',
    );
    const path = `masters/${command.newId}.html`,
      tree = parse(layout.html);
    for (const node of elements(tree))
      if (node.tagName === 'style')
        setText(node, expandCss(textOf(node), layout.sourcePath, path, stylesheets).toString());
    rebaseElements(elements(tree), layout.sourcePath, path);
    const head = elements(tree).find((node) => node.tagName === 'head')!;
    appendHtml(
      head,
      `<style>${expandCss(layout.css, layout.sourcePath, path, stylesheets).toString().replaceAll('</', '<\\/')}</style>`,
      undefined,
      false,
    );
    doc.slides.push(
      slideSchema.parse({
        id: command.newId,
        name: layout.name,
        sourcePath: path,
        html: normalizeHtml(serialize(tree)),
        hidden: true,
        layoutSourceId: layout.id,
        theme: rebaseTheme(layout.theme, layout.sourcePath, path),
      }),
    );
    return true;
  }
  if (command.type === 'layout.publish') {
    const page = doc.slides.find((item) => item.id === command.slideId);
    invariant(
      page?.layoutSourceId,
      'INVALID_LAYOUT_SOURCE',
      'Open a master editing page before publishing',
    );
    const layout = doc.layouts.find((item) => item.id === page.layoutSourceId);
    invariant(layout, 'LAYOUT_NOT_FOUND', 'Shared layout does not exist');
    assertStatic(page.html);
    invariant(
      !page.animations.length &&
        !page.components?.length &&
        !Object.keys(page.nativeCharts).length &&
        !page.scenes?.length &&
        !page.bindings.length,
      'SCRIPTED_LAYOUT',
      'Interactive content belongs in reusable components',
    );
    layout.html = page.html;
    layout.css = '';
    layout.sourcePath = page.sourcePath;
    layout.theme = structuredClone(page.theme);
    layout.name = page.name;
    return true;
  }
  return false;
}
