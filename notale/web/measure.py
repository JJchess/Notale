"""In-page measurement: what the browser actually rendered.

deckbase had to recover this from pixels with OpenCV because its output was a
raster it did not lay out. notale lays out the page itself, so the same facts —
where text sits, at what size, in what colour, over what ground — are available
directly from the DOM, exactly and for free.

The one thing that still needs pixels is the backplate: when text is set over a
generated image, only the image knows whether the ground under a given line is
light or dark. That is sampled with canvas `getImageData`, which
`scripts/probe_canvas_taint.py` confirms is readable for `file://` documents
under the `--allow-file-access-from-files` flag the renderer already sets.

Everything here is descriptive. Judgement lives in `core/stages/page_qa.py`, so
this module can be exercised in a browser without deciding anything and that one
can be tested without a browser.
"""

from __future__ import annotations

MEASUREMENT_SCHEMA_VERSION = 1

# Tag -> type role, used only when the element does not declare data-notale-role.
# Deliberately coarse: an inferred role never fails a check, it only ever
# downgrades one to "pending", so a wrong guess costs a signal and never a
# false accusation.
_ROLE_BY_TAG = {
    "H1": "title",
    "H2": "banner",
    "H3": "card",
    "H4": "card",
    "H5": "card",
    "H6": "card",
    "P": "lede",
    "LI": "cell",
    "TD": "cell",
    "TH": "cell",
    "FIGCAPTION": "cell",
}

MEASURE_JS = """(async () => {
  "use strict";
  const FRAME_W = 1280, FRAME_H = 720;
  const ROLE_BY_TAG = %s;

  const root = document.querySelector('[data-notale-page]') || document.body;

  const srgb = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  // --- backplate pixels -----------------------------------------------------
  let plate = null;
  const plateEl = root.querySelector('img[data-notale-backplate]');
  if (plateEl) {
    const info = {src: plateEl.getAttribute('src') || '', natural: [plateEl.naturalWidth, plateEl.naturalHeight]};
    try {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_W; canvas.height = FRAME_H;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      // Mirror object-fit: cover so samples line up with what is displayed.
      const nw = plateEl.naturalWidth || FRAME_W, nh = plateEl.naturalHeight || FRAME_H;
      const scale = Math.max(FRAME_W / nw, FRAME_H / nh);
      const dw = nw * scale, dh = nh * scale;
      ctx.drawImage(plateEl, (FRAME_W - dw) / 2, (FRAME_H - dh) / 2, dw, dh);
      info.pixels = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
      plate = info;
    } catch (err) {
      plate = Object.assign(info, {error: String((err && err.name) || err)});
    }
  }

  // Median luminance + a representative fill for one rect of the plate.
  const sampleGround = rect => {
    if (!plate || !plate.pixels) return null;
    const data = plate.pixels.data;
    const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(FRAME_W, Math.ceil(rect.x + rect.w)), y1 = Math.min(FRAME_H, Math.ceil(rect.y + rect.h));
    if (x1 <= x0 || y1 <= y0) return null;
    const stepX = Math.max(1, Math.floor((x1 - x0) / 24)), stepY = Math.max(1, Math.floor((y1 - y0) / 12));
    const lums = []; let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        const i = (y * FRAME_W + x) * 4;
        lums.push(lum(data[i], data[i + 1], data[i + 2]));
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    if (!n) return null;
    lums.sort((p, q) => p - q);
    const mid = lums[Math.floor(lums.length / 2)];
    return {
      luminance: mid,
      min: lums[0],
      max: lums[lums.length - 1],
      fill: hex(r / n, g / n, b / n),
      samples: n,
    };
  };

  // --- text elements --------------------------------------------------------
  const hasOwnText = el => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) return true;
    }
    return false;
  };

  const num = v => { const f = parseFloat(v); return Number.isFinite(f) ? f : 0; };

  // Content taller/wider than its box is only a defect when something actually
  // cuts it. A large CJK heading routinely paints beyond a tight line box with
  // overflow:visible and is not clipped at all -- gating on the raw
  // scrollHeight > clientHeight comparison would reject every such heading.
  const isClipped = (el, cs) => {
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') return false;
    const overX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const overY = cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1;
    return overX || overY;
  };
  const elements = [];
  let index = 0;
  for (const el of root.querySelectorAll('*')) {
    if (!hasOwnText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || num(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const declared = (el.getAttribute('data-notale-role') || '').trim().toLowerCase();
    const role = declared || ROLE_BY_TAG[el.tagName] || '';
    const rect = {x: r.x, y: r.y, w: r.width, h: r.height};
    const fontSize = num(cs.fontSize);
    elements.push({
      id: 'e' + (index++),
      tag: el.tagName.toLowerCase(),
      role: role,
      role_source: declared ? 'declared' : (role ? 'inferred' : 'none'),
      text: (el.textContent || '').trim().slice(0, 200),
      rect: rect,
      font_size_px: fontSize,
      line_height_px: cs.lineHeight === 'normal' ? fontSize * 1.2 : num(cs.lineHeight),
      letter_spacing_px: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing),
      font_weight: num(cs.fontWeight) || 400,
      font_family: cs.fontFamily,
      color: cs.color,
      background_color: cs.backgroundColor,
      clipped: isClipped(el, cs),
      ground: sampleGround(rect),
    });
  }

  // --- decorations, overflow, palette --------------------------------------
  const decorations = [];
  for (const el of root.querySelectorAll('img, svg, canvas, iframe, [data-notale-decoration]')) {
    if (el.matches('img[data-notale-backplate]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    decorations.push({
      tag: el.tagName.toLowerCase(),
      rect: {x: r.x, y: r.y, w: r.width, h: r.height},
      backplate: false,
    });
  }

  const overflow = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.left < -1 || r.top < -1 || r.right > FRAME_W + 1 || r.bottom > FRAME_H + 1) {
      overflow.push({
        tag: el.tagName.toLowerCase(),
        rect: {x: r.x, y: r.y, w: r.width, h: r.height},
        reason: 'escapes-frame',
        text: (el.textContent || '').trim().slice(0, 80),
      });
    } else if (isClipped(el, getComputedStyle(el))) {
      overflow.push({
        tag: el.tagName.toLowerCase(),
        rect: {x: r.x, y: r.y, w: r.width, h: r.height},
        reason: 'clipped',
        text: (el.textContent || '').trim().slice(0, 80),
      });
    }
  }

  const palette = {};
  const bump = v => { if (v && v !== 'rgba(0, 0, 0, 0)') palette[v] = (palette[v] || 0) + 1; };
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    bump(cs.color); bump(cs.backgroundColor); bump(cs.borderTopColor);
  }

  // textContent would include the bodies of <style> and <script>, so a page with
  // an inline stylesheet reads as if it rendered its own CSS as copy. Walk real
  // text nodes instead and skip anything living inside a non-rendered element.
  const collectText = () => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('style, script, template, noscript')) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const parts = [];
    let node;
    while ((node = walker.nextNode())) parts.push(node.textContent.trim());
    return parts.join(' ');
  };

  const plateOut = plate ? {src: plate.src, natural: plate.natural} : null;
  if (plate && plate.error) plateOut.error = plate.error;

  return {
    schema_version: %d,
    frame: {width: FRAME_W, height: FRAME_H},
    elements: elements,
    decorations: decorations,
    overflow: overflow.slice(0, 40),
    palette: palette,
    text: collectText(),
    backplate: plateOut,
  };
})()""" % (
    __import__("json").dumps(_ROLE_BY_TAG),
    MEASUREMENT_SCHEMA_VERSION,
)


def measurement_schema_version() -> int:
    return MEASUREMENT_SCHEMA_VERSION
