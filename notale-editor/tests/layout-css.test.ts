import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { importHtml, parse, elements, attr, textOf } from '../src/domain/html.js';
import { materializeLayout } from '../src/domain/layouts.js';
import { applyCommands } from '../src/domain/commands.js';
import { renderSlide } from '../src/server/render.js';
import { missingReferences, references } from '../src/domain/resources.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Scoped design',
    theme: { '--doc-image': 'url("assets/doc(1).svg")' },
    assets: Object.fromEntries(
      [
        'assets/doc(1).svg',
        'assets/layout.svg',
        'assets/slide.svg',
        'styles/base.css',
        'styles/nested.css',
      ].map((path) => [
        path,
        {
          hash: '0'.repeat(64),
          size: 0,
          mime: path.endsWith('css') ? 'text/css' : 'image/svg+xml',
        },
      ]),
    ),
    layouts: [
      {
        id: 'master',
        name: 'Master',
        sourcePath: 'layouts/master.html',
        theme: { '--layout-image': 'url(../assets/layout.svg)' },
        html: '<html><head><link rel="stylesheet" href="../styles/base.css"><style>:root{--local:blue} #abc{color:#abc;animation:pulse 1s} #abcdef{background:var(--layout-image)}</style></head><body><footer id="abc" class="footer" style="animation:pulse 2s">Master</footer><span id="abcdef">Separate ID</span></body></html>',
        css: '@keyframes pulse{from{opacity:.2}to{opacity:.9}}',
      },
    ],
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'pages/one.html',
        layoutId: 'master',
        theme: { '--slide-image': 'url(../assets/slide.svg)' },
        ...importHtml('<main id="stage"><footer class="footer">Page footer</footer></main>'),
      }),
    ],
  });
}
const sheets = {
  'styles/base.css':
    '@import "nested.css" screen; .footer{font-size:27px;background-image:url("../assets/layout.svg")}',
  'styles/nested.css': '.footer{border:2px solid green}',
};
test('layout CSS includes linked and head styles, scopes selectors and exact IDs without changing colors', () => {
  const doc = fixture(),
    html = materializeLayout(doc, doc.slides[0], false, sheets),
    root = parse(html),
    scope = elements(root).find((e) => attr(e, 'data-notale-layout-scope'))!,
    css = elements(root)
      .filter((e) => e.tagName === 'style')
      .map(textOf)
      .join('\n');
  assert.match(css, /data-notale-layout-scope/);
  assert.match(css, /@media screen/);
  assert.match(css, /font-size:27px/);
  assert.match(css, /color:#abc/);
  assert.doesNotMatch(css, /@import/);
  const child = elements(scope).find((e) => e.tagName === 'footer')!;
  assert.match(attr(child, 'style')!, /animation:master-master-one-pulse/);
  assert.ok(css.includes('#' + attr(child, 'id')));
  assert.equal(materializeLayout(doc, doc.slides[0], false, sheets), html);
});
test('theme URLs resolve from their own scope and survive detachment', async () => {
  let doc = fixture();
  const rendered = await renderSlide(doc, doc.slides[0], 'test', sheets);
  assert.match(rendered, /url\("\.\.\/assets\/doc\(1\)\.svg"\)/);
  assert.equal(missingReferences(doc).length, 0);
  doc = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [{ type: 'layout.detach', slideId: 'one' }],
    }).commands,
    { stylesheets: sheets },
  );
  assert.equal(doc.slides[0].theme['--layout-image'], 'url("../assets/layout.svg")');
  assert.equal(doc.slides[0].layoutId, null);
  assert.match(doc.slides[0].html, /font-size:27px/);
  delete doc.assets['assets/doc(1).svg'];
  assert.ok(missingReferences(doc).some((r) => r.path === 'assets/doc(1).svg'));
  assert.equal(
    references('pages/page.html', 'x{background:url("../assets/a(b).svg")}', 'css')[0].path,
    'assets/a(b).svg',
  );
});
test('missing and cyclic layout imports fail explicitly', () => {
  const doc = fixture();
  assert.throws(() => materializeLayout(doc, doc.slides[0]), { code: 'MISSING_STYLESHEET' });
  assert.throws(
    () =>
      materializeLayout(doc, doc.slides[0], false, { 'styles/base.css': '@import "base.css";' }),
    { code: 'CSS_IMPORT_CYCLE' },
  );
});

test('scoped font faces preserve quoted and unquoted multiword family references', () => {
  const doc = fixture();
  doc.layouts[0].html = '<footer style="font:italic 20px Shared Font, sans-serif">Font</footer>';
  doc.layouts[0].css =
    '@font-face{font-family:"Shared Font";src:url(data:font/woff2;base64,AA==)} footer{font-family:shared font,serif}';
  const html = materializeLayout(doc, doc.slides[0]),
    root = parse(html),
    footer = elements(root).find((e) => e.tagName === 'footer' && textOf(e) === 'Font')!;
  assert.match(attr(footer, 'style')!, /master-master-one-Shared Font/);
  assert.match(
    elements(root)
      .filter((e) => e.tagName === 'style')
      .map(textOf)
      .join(''),
    /font-family:"master-master-one-Shared Font",serif/,
  );
});
