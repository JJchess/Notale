import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../doc-to-deck.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app.html', import.meta.url), 'utf8');

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
  assert.match(runtime, /motifs\.slice\(0, 4\)/);
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
