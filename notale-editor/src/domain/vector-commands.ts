import svgpath from 'svgpath';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { type Slide, type Command, invariant } from './model.js';
import {
  parse,
  serialize,
  elements,
  findElement,
  attr,
  setAttr,
  setText,
  appendHtml,
  removeElement,
  textOf,
  NODE_ID,
  type Element,
} from './html.js';
const ns = 'http://www.w3.org/2000/svg';
const allowed = new Set(
  'svg g a style title desc defs metadata symbol use rect circle ellipse line polyline polygon path text tspan textPath image linearGradient radialGradient stop pattern clipPath mask filter feGaussianBlur feDropShadow feOffset feFlood feComposite feMerge feMergeNode feColorMatrix feBlend feComponentTransfer feFuncR feFuncG feFuncB feFuncA marker'.split(
    ' ',
  ),
);
function safeAttribute(name: string, value: string | null) {
  invariant(
    !/^on/i.test(name) && !['srcdoc', NODE_ID, 'id'].includes(name),
    'INVALID_SVG',
    'Cannot overwrite SVG identity or executable attributes',
  );
  if (value !== null) {
    invariant(
      !/(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|expression\s*\(/i.test(value),
      'INVALID_SVG',
      'Executable SVG values are not allowed',
    );
    if (name === 'd')
      invariant(
        !(svgpath(value) as ReturnType<typeof svgpath> & { err?: string }).err,
        'INVALID_PATH',
        'Invalid SVG path',
      );
    if (['d', 'points', 'transform', 'viewBox'].includes(name))
      invariant(!/\b(?:NaN|Infinity)\b/.test(value), 'INVALID_PATH', 'Geometry must be finite');
  }
}
function checkMarkup(html: string) {
  const nodes = elements(parse(`<svg xmlns="${ns}">${html}</svg>`));
  for (const node of nodes) {
    if (node.namespaceURI !== ns) {
      invariant(
        ['html', 'head', 'body'].includes(node.tagName),
        'INVALID_SVG',
        'Only SVG content can be imported',
      );
      continue;
    }
    invariant(
      allowed.has(node.tagName),
      'INVALID_SVG',
      `Unsupported imported SVG element: ${node.tagName}`,
    );
    if (node.tagName === 'style') {
      const css = postcss.parse(textOf(node));
      css.walkAtRules((rule) =>
        invariant(
          ['media', 'supports', 'layer', 'container'].includes(rule.name),
          'INVALID_SVG',
          'Only scoped SVG styles are supported',
        ),
      );
      css.walkDecls((d) => safeAttribute('style', d.toString()));
      css.walkRules((rule) => {
        selectorParser((selectors) => {
          selectors.each((selector) => {
            const first = selector.nodes[0];
            invariant(
              first?.type === 'id' &&
                nodes.some((n) => n.tagName === 'svg' && attr(n, 'id') === first.value) &&
                !['+', '~'].includes(
                  selector.nodes.find((n) => n.type === 'combinator')?.value.trim() ?? '',
                ),
              'INVALID_SVG',
              'Imported styles must be scoped to an SVG identity',
            );
          });
        }).processSync(rule.selector);
      });
    }
    for (const a of node.attrs)
      if (![NODE_ID, 'id'].includes(a.name)) safeAttribute(a.name, a.value);
  }
}
export function applyVectorCommand(
  slide: Slide,
  cmd: Extract<Command, { type: 'svg.patch' | 'svg.structure' | 'svg.import' }>,
) {
  const root = parse(slide.html);
  const originalDomIds = new Map<string, number>();
  for (const n of elements(root)) {
    const id = attr(n, 'id');
    if (id) originalDomIds.set(id, (originalDomIds.get(id) ?? 0) + 1);
  }
  function writable(node: Element) {
    for (
      let p: Element | undefined = node;
      p;
      p = p.parentNode && 'tagName' in p.parentNode ? p.parentNode : undefined
    ) {
      invariant(
        !slide.locked.includes(attr(p, NODE_ID) ?? ''),
        'LOCKED',
        'Object or its container is locked',
      );
      invariant(
        !attr(p, 'data-notale-chart') &&
          !attr(p, 'data-notale-connector') &&
          !slide.nativeCharts?.[attr(p, NODE_ID) ?? ''] &&
          !(slide.components ?? []).some((c) => c.root === attr(p, NODE_ID)),
        'SVG_GENERATED',
        'Edit chart parameters or create an editable copy',
      );
    }
  }
  function svg(id: string) {
    const node = findElement(root, id);
    invariant(node.namespaceURI === ns, 'INVALID_SVG', 'Choose an SVG object');
    writable(node);
    return node;
  }
  function attributes(node: Element, values: Record<string, string | null> = {}) {
    for (const [name, value] of Object.entries(values)) {
      safeAttribute(name, value);
      if (value === null) node.attrs = node.attrs.filter((a) => a.name !== name);
      else setAttr(node, name, value);
    }
  }
  function subtree(node: Element) {
    invariant(
      !elements(node).some((n) => slide.locked.includes(attr(n, NODE_ID) ?? '')),
      'LOCKED',
      'Operation includes a locked descendant',
    );
  }
  if (cmd.type === 'svg.import') {
    checkMarkup(cmd.html);
    const source = elements(parse(cmd.html)).filter(
      (n) => n.namespaceURI === ns && n.tagName === 'svg',
    );
    invariant(source.length > 0, 'INVALID_SVG', 'Expected an SVG image');
    const parent = cmd.parent
      ? findElement(root, cmd.parent)
      : (elements(root).find((n) => attr(n, 'id') === 'stage') ??
        elements(root).find((n) => n.tagName === 'body')!);
    writable(parent);
    appendHtml(parent, cmd.html, undefined, false);
  } else
    for (const mutation of cmd.mutations) {
      if (mutation.op === 'insert') {
        const parent = svg(mutation.parent);
        checkMarkup(mutation.html);
        appendHtml(parent, mutation.html, mutation.index, false);
        continue;
      }
      const node = svg(mutation.target);
      if (mutation.op === 'set') {
        attributes(node, mutation.attributes);
        if (mutation.text !== undefined) {
          invariant(
            ['text', 'tspan', 'textPath', 'title', 'desc'].includes(node.tagName),
            'INVALID_SVG',
            'Only SVG text can receive text',
          );
          invariant(
            !node.childNodes.some((n) => 'tagName' in n),
            'SVG_TEXT_RUNS',
            'Edit individual text runs to preserve their identities',
          );
          setText(node, mutation.text);
        }
      } else if (mutation.op === 'replace') {
        subtree(node);
        checkMarkup(mutation.html);
        const parent = node.parentNode as Element;
        const index = parent.childNodes.indexOf(node);
        const added = appendHtml(parent, mutation.html, index, false);
        invariant(
          added.length === 1 &&
            'tagName' in added[0] &&
            attr(added[0], NODE_ID) === mutation.target,
          'INVALID_SVG',
          'Replacement must preserve object identity',
        );
        const retained = new Set(elements(added[0] as Element).map((n) => attr(n, NODE_ID)));
        const lost = new Set(
          elements(node)
            .map((n) => attr(n, NODE_ID))
            .filter((id) => !retained.has(id)),
        );
        invariant(
          !slide.animations.some((a) => lost.has(a.target) || lost.has(a.triggerTarget)) &&
            !slide.bindings.some((b) => lost.has(b.target)),
          'SVG_BOUND',
          'Replacement would remove interaction targets',
        );
        removeElement(node);
      } else if (mutation.op === 'remove') {
        subtree(node);
        const ids = new Set(elements(node).map((n) => attr(n, NODE_ID)));
        invariant(
          !slide.animations.some((a) => ids.has(a.target) || ids.has(a.triggerTarget)) &&
            !slide.bindings.some((b) => ids.has(b.target)),
          'SVG_BOUND',
          'This object has interactions; operate on a copy',
        );
        removeElement(node);
      } else {
        subtree(node);
        const parent = svg(mutation.parent);
        invariant(
          node !== parent && !elements(node).includes(parent),
          'INVALID_SVG',
          'Cannot move into a descendant',
        );
        removeElement(node);
        parent.childNodes.splice(Math.min(mutation.index, parent.childNodes.length), 0, node);
        node.parentNode = parent;
        attributes(node, mutation.attributes);
      }
    }
  const ids = elements(root)
    .map((n) => attr(n, NODE_ID))
    .filter(Boolean);
  invariant(
    ids.length === new Set(ids).size,
    'DUPLICATE_ID',
    'SVG object identities must be unique',
  );
  const counts = new Map<string, number>();
  for (const n of elements(root)) {
    const id = attr(n, 'id');
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of counts)
    invariant(
      count <= Math.max(1, originalDomIds.get(id) ?? 0),
      'DUPLICATE_ID',
      'SVG reference identities must be unique',
    );
  slide.html = serialize(root);
}
