import { unzipSync } from 'fflate';
// A read-only PPTX importer: text frames, pictures and their positions become ordinary
// editor objects, so an imported deck is editable with the same tools as an authored one.
// Masters, themes, tables, charts and animations are deliberately not read; a slide keeps
// only what this pass can place honestly.
const EMU = 9525; // English Metric Units per CSS pixel at 96dpi.
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', tiff: 'image/tiff',
};
export type ImportedMedia = { path: string; bytes: Uint8Array; mime: string };
export type ImportedSlide = { name: string; html: string; media: ImportedMedia[] };
export type ImportedDeck = { width: number; height: number; slides: ImportedSlide[]; skipped: number };
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const px = (value: string | null | undefined) => (value ? Math.round(Number(value) / EMU) : 0);
const local = (node: Element, name: string) => [...node.children].find((child) => child.localName === name);
function frame(shape: Element) {
  const xfrm = local(local(shape, 'spPr') ?? shape, 'xfrm') ?? local(local(shape, 'grpSpPr') ?? shape, 'xfrm');
  const off = xfrm && local(xfrm, 'off'), ext = xfrm && local(xfrm, 'ext');
  if (!off || !ext) return undefined;
  return { x: px(off.getAttribute('x')), y: px(off.getAttribute('y')), width: px(ext.getAttribute('cx')), height: px(ext.getAttribute('cy')) };
}
function paragraphs(shape: Element) {
  const body = local(shape, 'txBody');
  if (!body) return [];
  return [...body.children]
    .filter((child) => child.localName === 'p')
    .map((paragraph) => {
      const runs = [...paragraph.getElementsByTagName('*')].filter((node) => node.localName === 'r');
      const text = runs.map((run) => [...run.getElementsByTagName('*')].find((node) => node.localName === 't')?.textContent ?? '').join('');
      const properties = runs.map((run) => [...run.children].find((child) => child.localName === 'rPr')).find(Boolean);
      const style = [...paragraph.children].find((child) => child.localName === 'pPr');
      return {
        text,
        size: properties?.getAttribute('sz') ? Number(properties.getAttribute('sz')) / 100 : undefined,
        bold: properties?.getAttribute('b') === '1',
        italic: properties?.getAttribute('i') === '1',
        align: { ctr: 'center', r: 'right', just: 'justify' }[style?.getAttribute('algn') ?? ''] ?? 'left',
      };
    })
    .filter((paragraph) => paragraph.text.trim());
}
// Imported markup carries its own stable ids: the document API only accepts source whose
// editable elements are already identified, unlike element.insert which assigns them.
export function parsePptx(bytes: Uint8Array, id: () => string = () => crypto.randomUUID()): ImportedDeck {
  const files = unzipSync(bytes);
  const read = (path: string) => (files[path] ? new TextDecoder().decode(files[path]) : undefined);
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
  const presentation = read('ppt/presentation.xml');
  if (!presentation) throw new Error('这不是有效的 PPTX 文件');
  const size = parse(presentation).getElementsByTagName('p:sldSz')[0];
  const width = px(size?.getAttribute('cx')) || 1280, height = px(size?.getAttribute('cy')) || 720;
  const slidePaths = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  let skipped = 0;
  const slides = slidePaths.map((path, index) => {
    const document = parse(read(path)!);
    const rels = read(path.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels');
    const targets = new Map<string, string>();
    if (rels)
      for (const rel of parse(rels).getElementsByTagName('Relationship'))
        targets.set(rel.getAttribute('Id')!, (rel.getAttribute('Target') ?? '').replace(/^\.\.\//, 'ppt/'));
    const media: ImportedMedia[] = [];
    const parts: string[] = [];
    let title = '';
    for (const node of document.getElementsByTagName('*')) {
      if (node.localName === 'sp') {
        const box = frame(node), lines = paragraphs(node);
        if (!lines.length) continue;
        if (!box) { skipped++; continue; }
        if (!title) title = lines[0].text.slice(0, 40);
        const size = lines[0].size ?? Math.max(14, Math.min(48, Math.round(box.height / Math.max(1, lines.length) * 0.5)));
        parts.push(
          `<div data-notale-id="${id()}" data-notale-name="${esc(lines[0].text.slice(0, 16) || '文本框')}" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;min-height:${box.height}px;display:flex;flex-direction:column;justify-content:center">${lines
            .map(
              (line) =>
                `<p data-notale-id="${id()}" style="margin:0;font-size:${Math.round(line.size ?? size)}px;line-height:1.35;text-align:${line.align};${line.bold ? 'font-weight:700;' : ''}${line.italic ? 'font-style:italic;' : ''}">${esc(line.text)}</p>`,
            )
            .join('')}</div>`,
        );
      }
      if (node.localName === 'pic') {
        const box = frame(node);
        const embed = [...node.getElementsByTagName('*')].find((child) => child.localName === 'blip')?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
        const source = embed ? targets.get(embed) : undefined;
        const extension = (source ?? '').split('.').pop()?.toLowerCase() ?? '';
        if (!box || !source || !files[source] || !MIME[extension]) { skipped++; continue; }
        const target = `media/pptx/${source.split('/').pop()}`;
        if (!media.some((item) => item.path === target)) media.push({ path: target, bytes: files[source], mime: MIME[extension] });
        parts.push(
          `<img data-notale-id="${id()}" alt="导入的图片" src="${esc(target)}" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;object-fit:contain">`,
        );
      }
    }
    return {
      name: title || `第 ${index + 1} 页`,
      media,
      html: `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;font-family:system-ui,'Microsoft YaHei',sans-serif;color:#1f2733}#stage{position:relative;overflow:hidden}</style></head><body><main id="stage" data-notale-id="${id()}">${parts.join('')}</main></body></html>`,
    };
  });
  return { width, height, slides, skipped };
}
