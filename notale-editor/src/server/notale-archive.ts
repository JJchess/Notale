import {discoverCodeLessons} from '@notale/format';
import {digestCode} from '../domain/code-lessons.js';
import { NOTALE_FORMAT, isNotaleEnvelope, notaleFilename } from '@notale/format';
export { NOTALE_FORMAT, notaleFilename };
import { unzip, unzipSync, zip, strFromU8 } from 'fflate';
import { documentSchema, filePath, invariant } from '../domain/model.js';
import postcss from 'postcss';
import { references } from '../domain/resources.js';
import { importHtml, parse, elements, textOf } from '../domain/html.js';

export function encodeArchive(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data)));
}
export async function decodeArchive(bytes: Uint8Array) {
  let total = 0, count = 0;
  const paths = new Set<string>();
  // Inspect the central directory without inflating any data before starting workers.
  unzipSync(bytes, { filter: entry => {
    filePath.parse(entry.name);
    invariant(!paths.has(entry.name), 'INVALID_PROJECT', 'Duplicate archive path');
    paths.add(entry.name);
    total += entry.originalSize;
    invariant(++count <= 10000 && total <= 150_000_000, 'TOO_LARGE', 'Expanded Notale exceeds resource limits', 413);
    return false;
  } });
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(bytes, (error, data) => error ? reject(error) : resolve(data)));
  invariant(files['notale-project.json'], 'INVALID_PROJECT', 'Notale manifest is missing');
  const manifest = JSON.parse(strFromU8(files['notale-project.json']));
  invariant(isNotaleEnvelope(manifest),
    'INVALID_PROJECT', 'Expected Notale format version 1');
  invariant(files[manifest.entry], 'INVALID_PROJECT', 'Notale player is missing');
  const document = documentSchema.parse(manifest.document);
  const reserved = new Set(['index.html', 'notale-project.json']);
  for (const [index, slide] of document.slides.entries()) {
    invariant(!reserved.has(slide.sourcePath), 'PATH_COLLISION', 'Duplicate or reserved slide path');
    reserved.add(slide.sourcePath);
    const source = importHtml(slide.html);
    slide.html = source.html;
    const authored = (manifest.document as {slides:Record<string,unknown>[]}).slides[index];
    if (authored.notes === undefined) slide.notes = source.notes;
    if (authored.nativeStepCount === undefined && /^page-\d+$/.test(slide.name)) slide.name = source.name;
    slide.nativeStepCount = Math.max(slide.nativeStepCount, source.nativeStepCount);
  }
  for (const path of Object.keys(document.assets)) {
    invariant(!reserved.has(path), 'PATH_COLLISION', 'Reserved asset path');
    invariant(files[path], 'MISSING_ASSET', `Missing ${path}`);
  }
  document.codeLessons = discoverCodeLessons(files, document.assets, digestCode);
  if (!document.themeTokens) {
    const tokens: Record<string, string> = {};
    const styles = new Set<string>();
    for (const slide of document.slides) {
      for (const ref of references(slide.sourcePath, slide.html, 'html'))
        if (ref.path?.endsWith('.css') && files[ref.path]) styles.add(ref.path);
    }
    const readTokens = (css: string) => {
      postcss.parse(css).walkRules(rule => {
        if (!rule.selectors.some(selector => [':root', 'html'].includes(selector.trim()))) return;
        rule.walkDecls(decl => {
          if (/^--[\w-]+$/.test(decl.prop) && !/^--(stage-|s$|step$)/.test(decl.prop) &&
              (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(decl.value) || /^--(font|fs|text-size)/.test(decl.prop)))
            tokens[decl.prop] ??= decl.value;
        });
      });
    };
    for (const path of styles) readTokens(strFromU8(files[path]));
    for (const slide of document.slides)
      for (const el of elements(parse(slide.html))) if (el.tagName === 'style') readTokens(textOf(el));
    document.themeTokens = tokens;
  }
  return { document, files };
}
