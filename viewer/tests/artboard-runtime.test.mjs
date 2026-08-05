import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../doc-to-deck.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const renderAudit = await readFile(new URL('../../tools/render-check.mjs', import.meta.url), 'utf8');

test('visualSystem is compiled through guarded CSS token maps', () => {
  assert.match(runtime, /function applyVisualSystem\(visualSystem\)/);
  for (const token of ['background', 'surface', 'surfaceAlt', 'ink', 'muted', 'accent', 'accent2', 'line']) {
    assert.match(runtime, new RegExp(`${token}:\\s*'--`));
  }
  assert.match(runtime, /!\/\[;\{\}\]\/\.test\(v\)/);
  assert.match(runtime, /applyVisualSystem\(doc\.visualSystem\)/);
  assert.match(runtime, /const VISUAL_FONT_STACKS =/);
  assert.match(runtime, /'Noto Sans SC'/);
  assert.match(runtime, /const VISUAL_TYPE_SCALES =/);
  assert.match(runtime, /const VISUAL_SHADOWS =/);
});

test('artboard rejects incomplete or invalid block mappings atomically', () => {
  assert.match(runtime, /function resolveArtboardLayout\(scene, L\)/);
  assert.match(runtime, /!map\[key\] \|\| used\.has\(key\)/);
  assert.match(runtime, /blockIds\.length !== used\.size/);
  assert.match(runtime, /L\.kind === 'artboard' \? 'flow'/);
  assert.match(runtime, /--artboard-gap/);
  assert.match(runtime, /title\.style\.maxWidth = artboard\.title\.maxWidth/);
  assert.match(styles, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(styles, /grid-template-rows:repeat\(12,minmax\(0,1fr\)\)/);
});

test('titleless artboards collapse the reserved title rows', () => {
  assert.match(runtime, /body\.classList\.add\('artboard-without-title'\)/);
  assert.match(styles, /\.artboard-without-title/);
  assert.match(styles, /repeat\(3,0\) repeat\(9,minmax\(0,1fr\)\)/);
});

test('media treatments and masks have real rendering rules', () => {
  for (const treatment of ['frame', 'full-bleed', 'cutout', 'duotone', 'soft-mask']) {
    assert.match(runtime, new RegExp(`['"]${treatment}['"]`));
    assert.match(styles, new RegExp(`media-treatment-${treatment}`));
  }
  for (const mask of ['circle', 'rounded', 'arch', 'blob', 'hexagon']) {
    assert.match(styles, new RegExp(`data-mask=[\\"]${mask}[\\"]`));
  }
});

test('motifs are decorative, bounded, and non-interactive', () => {
  assert.match(runtime, /sceneIndex % 4 !== 0/);
  assert.match(runtime, /motifs\[sceneIndex % motifs\.length\]/);
  for (const motif of ['orb', 'wave', 'rule', 'grid', 'corner', 'blob']) {
    assert.match(runtime, new RegExp(`${motif}:`));
  }
  assert.match(runtime, /colorRoles\[spec\.colorRole\]/);
  assert.match(runtime, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(styles, /\.motif-layer\{[^}]*pointer-events:none/);
  assert.match(styles, /data-visual-texture="soft-gradient"/);
});

test('every declared composition family has a visible runtime signature', () => {
  for (const family of [
    'full-bleed-hero', 'text-over-image', 'cutout-split', 'annotated-specimen', 'focal-object',
    'process-path', 'before-after', 'comparison', 'experiment-setup', 'proof-equation-stage',
    'data-evidence', 'collage', 'poster', 'research-figure', 'interactive-stage',
  ]) assert.match(styles, new RegExp(`composition-${family}`));
});

test('artboard interaction stretches the widget root, not only its iframe', () => {
  assert.match(styles, /\.artboard-area\.role-stage>\.widlab[^}]*height:100%/s);
  assert.match(styles, /\.artboard-area\.has-interaction>\.widlab[^}]*height:100%/s);
});

test('widget iframe receives a light-dark register separate from the deck theme name', () => {
  assert.match(runtime, /function widgetColorScheme\(/);
  assert.match(runtime, /data-theme="' \+ colorScheme/);
  assert.match(runtime, /data-deck-theme="' \+ escapeHtml\(theme\)/);
  assert.match(runtime, /initial frame has an empty primary visualization stage/);
  assert.match(runtime, /function visiblePrimitiveCount\(svg\)/);
  assert.match(runtime, /grid\|background\|backdrop\|watermark\|axis\|tick\|guide\|decoration\|ornament/);
  assert.doesNotMatch(runtime, /querySelectorAll\("path,line,polyline,polygon,circle,ellipse,rect,text,image,use"\)/);
  assert.match(runtime, /initial frame exposes an empty data structure instead of inspectable evidence/);
  assert.match(runtime, /state simulation initial frame has too few evidence marks/);
  assert.match(runtime, /b\.spec && b\.spec\.profile/);
  assert.match(runtime, /--color-border:var\(--line\)/);
});

test('index layout fits every reachable panel before navigation', () => {
  assert.match(runtime, /stage\.querySelectorAll\('\.step-panel'\)\.forEach/);
  assert.doesNotMatch(runtime, /querySelector\('\.step-panel\.show'\).*fitScroll/s);
  assert.match(styles, /\.composition-comparison \.body:not\(\[data-layout\]\)/);
  assert.doesNotMatch(styles, /\.composition-comparison:not\(:has\(\.layout-artboard\)\) \.body/);
});

test('evidence blocks preserve semantic content and readable scale', () => {
  assert.match(runtime, /function richProse\(/);
  assert.match(runtime, /prose-table/);
  assert.match(runtime, /stripDisplayDelimiters/);
  assert.match(runtime, /fontSize:\s*'15px'/);
  assert.match(runtime, /plotwrap\.clientHeight/);
  assert.match(styles, /\.chart-block\{[^}]*height:100%/s);
  assert.match(styles, /\.quiz-context \.prose-table/);
  assert.match(styles, /\.graph-node \.gn-title\{[^}]*font-size:18px/s);
});

test('render audit reports actual content occupancy rather than parent size', () => {
  assert.match(renderAudit, /occupiedRatio/);
  assert.match(renderAudit, /mainSubjectRatio/);
  assert.match(renderAudit, /visualCells/);
});
