import { cleanVector, createSvg } from './vector-dom.js';
/** Close paint references and embed image bytes before creating a portable static SVG. */
export async function portableVector(root: SVGSVGElement) {
  const copy = cleanVector(root) as SVGSVGElement;
  const paints = [
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'word-spacing',
    'text-anchor',
    'dominant-baseline',
    'writing-mode',
    'text-orientation',
    'text-decoration',
    'clip-path',
    'mask',
    'filter',
    'marker-start',
    'marker-mid',
    'marker-end',
    'stop-color',
    'stop-opacity',
    'color',
    'paint-order',
    'vector-effect',
    'visibility',
    'display',
  ];
  const local = (value: string) =>
    value.replace(/url\(["']?([^)'"\s]+)["']?\)/g, (all, url) => {
      try {
        const parsed = new URL(url, location.href);
        return parsed.hash && parsed.origin === location.origin ? `url(${parsed.hash})` : all;
      } catch {
        return all;
      }
    });
  function bake(source: Element, out: Element) {
    const a = [source, ...source.querySelectorAll('*')],
      b = [out, ...out.querySelectorAll('*')];
    a.forEach((n, i) => {
      if (!(b[i] instanceof SVGElement)) return;
      const css = getComputedStyle(n),
        target = b[i] as SVGElement;
      for (const k of paints) target.style.setProperty(k, local(css.getPropertyValue(k)));
      for (const attr of [...target.attributes])
        if (
          /^on/i.test(attr.name) ||
          (attr.name.startsWith('data-notale-') && attr.name !== 'data-notale-id')
        )
          target.removeAttribute(attr.name);
    });
  }
  bake(root, copy);
  for (const n of copy.querySelectorAll(
    'script,style,foreignObject,animate,animateTransform,animateMotion,set',
  ))
    n.remove();
  let defs = copy.querySelector(':scope > defs');
  if (!defs) {
    defs = createSvg('defs');
    copy.prepend(defs);
  }
  const included = new Set([copy, ...copy.querySelectorAll('[id]')].map((n) => n.id));
  const visited = new Set<string>();
  for (let pass = 0; pass < 30; pass++) {
    let added = false;
    for (const n of [copy, ...copy.querySelectorAll('*')])
      for (const a of [...n.attributes]) {
        const refs = [...a.value.matchAll(/url\(["']?#([^)'"\s]+)["']?\)/g)].map((m) => m[1]);
        if (['href', 'xlink:href'].includes(a.name) && a.value.startsWith('#'))
          refs.push(a.value.slice(1));
        for (const id of refs) {
          if (included.has(id) || visited.has(id)) continue;
          visited.add(id);
          const source = document.getElementById(id);
          if (!source) throw Error('缺少 SVG 引用资源：' + id);
          const clone = cleanVector(source);
          bake(source, clone);
          defs.append(clone);
          for (const d of [clone, ...clone.querySelectorAll('[id]')]) included.add(d.id);
          added = true;
        }
      }
    if (!added) break;
  }
  for (const image of copy.querySelectorAll('image')) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
    if (!href || href.startsWith('#') || href.startsWith('data:')) continue;
    const response = await fetch(new URL(href, document.baseURI));
    if (!response.ok) throw Error('无法嵌入图形图片资源');
    const blob = await response.blob();
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    image.removeAttribute('xlink:href');
    image.setAttribute('href', url);
  }
  for (const k of [
    'position',
    'left',
    'top',
    'right',
    'bottom',
    'transform',
    'translate',
    'rotate',
    'scale',
  ])
    copy.style.removeProperty(k);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return copy;
}
