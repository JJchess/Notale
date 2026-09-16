import { rewriteSrcset } from './srcset.js';
import { createHash } from 'node:crypto';
import { rebaseUrl, rebaseCss } from './urls.js';
import { expandCss, scopeCss, linkedCss, type Stylesheets } from './layout-css.js';
export { rebaseUrl, rebaseCss } from './urls.js';
import { type DeckDocument, type Slide, invariant } from './model.js';
import {
  parse,
  serialize,
  elements,
  attr,
  setAttr,
  appendHtml,
  serializeOuter,
  normalizeHtml,
  uid,
  NODE_ID,
  textOf,
  setText,
  parseStyle,
  patchStyle,
  removeElement,
} from './html.js';

export function rebaseElements(nodes: ReturnType<typeof elements>, from: string, to: string) {
  for (const el of nodes) {
    for (const key of ['src', 'href', 'poster', 'data-src']) {
      const v = attr(el, key);
      if (v) setAttr(el, key, rebaseUrl(v, from, to));
    }
    const style = attr(el, 'style');
    if (style) setAttr(el, 'style', rebaseCss(style, from, to));
    const srcset = attr(el, 'srcset');
    if (srcset) setAttr(el, 'srcset', rewriteSrcset(srcset, url => rebaseUrl(url, from, to)));
  }
}
export function assertStatic(html: string) {
  invariant(
    !elements(parse(html)).some(
      (e) =>
        ['script', 'base', 'iframe', 'canvas'].includes(e.tagName) ||
        e.attrs.some((a) => /^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)),
    ),
    'SCRIPTED_LAYOUT',
    'Shared layout objects must be static HTML/SVG/media; page scripts remain on their original page',
  );
}
export function layoutPlaceholders(html: string) {
  const fields = elements(parse(html)).filter(
    (node) => attr(node, 'data-notale-placeholder') !== undefined,
  );
  const ids = new Set<string>();
  return fields.map((node) => {
    const id = attr(node, 'data-notale-placeholder')!;
    invariant(
      /^[a-zA-Z0-9_-]{1,100}$/.test(id) && !ids.has(id),
      'INVALID_PLACEHOLDER',
      'Placeholder keys must be unique identifiers',
    );
    invariant(
      !node.childNodes.some((child) => 'tagName' in child) &&
        ![
          'img',
          'video',
          'audio',
          'input',
          'textarea',
          'select',
          'script',
          'style',
          'link',
          'canvas',
          'iframe',
        ].includes(node.tagName) &&
        attr(node, 'data-notale-field') === undefined,
      'INVALID_PLACEHOLDER',
      'A text placeholder must be a text-only object without a dynamic field',
    );
    ids.add(id);
    return { id, label: attr(node, 'data-notale-label') || id, text: textOf(node) };
  });
}
export function layoutImageSlots(html: string) {
  const keys = new Set<string>();
  return elements(parse(html))
    .filter((node) => attr(node, 'data-notale-image-placeholder') !== undefined)
    .map((node) => {
      const id = attr(node, 'data-notale-image-placeholder')!;
      invariant(
        node.tagName === 'img' &&
          !node.parentNode?.childNodes.some(
            (child) => 'tagName' in child && child.tagName === 'source',
          ) &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(id) &&
          !keys.has(id),
        'INVALID_PLACEHOLDER',
        'Image slots need unique keys on ordinary image objects',
      );
      keys.add(id);
      return { id, label: attr(node, 'data-notale-label') || id, src: attr(node, 'src') || '' };
    });
}
export function materializeLayout(
  doc: DeckDocument,
  slide: Slide,
  detached = false,
  stylesheets: Stylesheets = {},
) {
  if (!slide.layoutId) return slide.html;
  const layout = doc.layouts.find((l) => l.id === slide.layoutId);
  invariant(layout, 'LAYOUT_NOT_FOUND', 'Shared layout does not exist');
  const root = parse(slide.html),
    stage =
      elements(root).find((e) => attr(e, 'id') === 'stage') ??
      elements(root).find((e) => e.tagName === 'body')!;
  const source = parse(layout.html),
    body = elements(source).find((e) => e.tagName === 'body')!;
  const values = slide.layoutValues?.[layout.id] ?? {};
  for (const node of elements(source)) {
    const key = attr(node, 'data-notale-placeholder');
    if (key && Object.hasOwn(values, key)) setText(node, values[key]);
  }
  const scope = detached ? `detached-${uid()}` : `master-${layout.id}-${slide.id}`;
  const cssParts: string[] = [];
  for (const el of elements(source)) {
    if (el.tagName === 'style') {
      const css = expandCss(
          textOf(el),
          layout.sourcePath,
          slide.sourcePath,
          stylesheets,
        ).toString(),
        media = attr(el, 'media');
      cssParts.push(media ? `@media ${media}{${css}}` : css);
      removeElement(el);
    }
    if (
      el.tagName === 'link' &&
      (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')
    ) {
      if (attr(el, 'disabled') === undefined)
        cssParts.push(
          linkedCss(
            attr(el, 'href') ?? '',
            layout.sourcePath,
            slide.sourcePath,
            stylesheets,
            attr(el, 'media'),
          ),
        );
      removeElement(el);
    }
  }
  cssParts.push(expandCss(layout.css, layout.sourcePath, slide.sourcePath, stylesheets).toString());
  const copied = appendHtml(
    stage,
    `<div data-notale-layout="${layout.id}" data-notale-layout-scope="${scope}" style="position:absolute;inset:0;pointer-events:none;z-index:${layout.layer === 'front' ? 1000 : -1}"></div>`,
    undefined,
    detached,
  );
  const container = copied.find((n) => 'tagName' in n)! as ReturnType<typeof elements>[number];
  if (attr(body, 'class')) setAttr(container, 'class', attr(body, 'class')!);
  if (attr(body, 'style')) {
    patchStyle(container, Object.fromEntries(parseStyle(attr(body, 'style')!)));
    patchStyle(container, {
      position: 'absolute',
      inset: '0',
      'pointer-events': 'none',
      'z-index': layout.layer === 'front' ? '1000' : '-1',
    });
  }
  appendHtml(container, serialize(body), undefined, true);
  const nodes = elements(container);
  rebaseElements(nodes, layout.sourcePath, slide.sourcePath);
  for (const node of nodes) {
    const key = attr(node, 'data-notale-image-placeholder'),
      image = key ? slide.layoutImages?.[layout.id]?.[key] : undefined;
    if (image) {
      setAttr(node, 'src', rebaseUrl(image.path, 'document.html', slide.sourcePath));
      setAttr(node, 'srcset', null);
      setAttr(node, 'sizes', null);
      if (image.alt !== undefined) setAttr(node, 'alt', image.alt);
    }
  }

  const idMap = new Map<string, string>();
  for (const el of nodes) {
    const id = attr(el, 'id');
    if (id) {
      const next = `${scope}-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
      idMap.set(id, next);
      setAttr(el, 'id', next);
    }
    if (!detached) setAttr(el, NODE_ID, null);
  }
  for (const el of nodes)
    for (const a of el.attrs) {
      if (a.value.startsWith('#') && idMap.has(a.value.slice(1)))
        a.value = '#' + idMap.get(a.value.slice(1));
      if (['for', 'aria-labelledby', 'aria-describedby', 'aria-controls'].includes(a.name))
        a.value = a.value
          .split(/\s+/)
          .map((id) => idMap.get(id) ?? id)
          .join(' ');
      if (
        [
          'style',
          'fill',
          'stroke',
          'filter',
          'mask',
          'clip-path',
          'marker-start',
          'marker-mid',
          'marker-end',
        ].includes(a.name)
      )
        a.value = rebaseCss(a.value, slide.sourcePath, slide.sourcePath, idMap);
    }
  const head = elements(root).find((e) => e.tagName === 'head')!;
  const compiled = scopeCss(
      cssParts.join('\n'),
      scope,
      idMap,
      nodes.map((el) => attr(el, 'style') ?? ''),
    ),
    css = compiled.css;
  compiled.styles.forEach((style, i) => {
    if (style) setAttr(nodes[i], 'style', style);
  });
  appendHtml(
    head,
    `<style data-notale-layout-css="${layout.id}">#stage{isolation:isolate}${css.replaceAll('</', '<\\/')}</style>`,
    undefined,
    false,
  );
  if (detached) {
    setAttr(container, 'data-notale-layout', null);
    setAttr(
      container,
      'style',
      (attr(container, 'style') ?? '').replace('pointer-events:none;', ''),
    );
    return normalizeHtml(serialize(root));
  }
  return serialize(root);
}
