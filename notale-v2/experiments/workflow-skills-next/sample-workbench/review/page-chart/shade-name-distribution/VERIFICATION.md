# Verification

## Results

Run from this directory:

```bash
python3 tests/data_check.py
python3 tests/browser_check.py
```

Both commands pass. The browser report is saved in `browser-check.json`.

Data verification:

- 5,307 of 5,307 source rows retained.
- 93 brands and 17 categories.
- Every retained brand, product, name, specific value, hex value, lightness value, and category mask compared against the canonical CSV.
- Source SHA-256 matched.
- Minimum lightness `0.154902`; maximum `0.996078`.
- 4,104 records at or above 50% lightness.
- No URL is present in the runtime payload.

Browser verification:

| State or behavior | 1600 by 900 | 1280 by 720 |
|---|---:|---:|
| Initial 5,307-record mountain | Pass | Pass |
| No body overflow or clipped stage | Pass | Pass |
| Brand filter: bareMinerals = 370 | Pass | Pass |
| Dependent category list: 14 choices | Pass | Pass |
| Brand plus food category = 51 | Pass | Pass |
| Filtered summary: 37 of 51 above 50% | Pass | Pass |
| Pointer tooltip and selected-mark outline | Pass | Pass |
| Click to pin, pointer leave, Escape to clear | Pass | Pass |
| Compare-to-all shared-scale lines | Pass | Pass |
| Names view uses all current records | Pass | Pass |
| Full names canvas = 5,307 labels and 7,798px | Pass | Pass |
| Table = 10 rows per page; next/previous | Pass | Pass |
| Reset restores filters, view, compare, and count | Pass | Pass |
| Keyboard inspection: focus, arrows, Enter, Escape | Pass | Pass |
| Console errors, page errors, failed resources | 0 | 0 |
| External requests | 0 | 0 |

Reduced motion renders the same final evidence without animation. Aborting `data/shades.js` exposes the visible data-failure fallback. The test dispatches `pagehide`, navigates away, and closes each context after observers and the chassis resize registration receive their teardown signal.

## Render comparisons

- `screenshots/original-explore-frame.png`: upstream Explore component at desktop width.
- `screenshots/browser-1600x900-initial.png`: final initial state.
- `screenshots/browser-1600x900-compare.png`: filtered compare state.
- `screenshots/browser-1280x720-initial.png`: scaled supported boundary.
- `screenshots/final-names-all.png`: complete names view at its initial scroll position.
- `screenshots/final-table-all.png`: exact-value table.
- `screenshots/browser-reduced-motion.png`: reduced-motion state.

## Page and anti-slop audit

The selected workflow reference is `build-page/references/chart.md`. The chart is authored evidence, not a learning interaction: filters inspect predetermined records and do not change the model. The initial view already exposes the distribution and its exact above-50% count. Compare lines share a scale, every tooltip value comes from the canonical row, and the table provides exact evidence without relying on hover.

The three anti-slop passes were applied surgically because the upstream interface already has a coherent publication style:

- `design-taste-frontend`: redesign-preserve mode. No replacement aesthetic or component system was introduced. The source's editorial density and functional controls outrank landing-page defaults.
- `avoid-ai-design`: no generic hero, card grid, purple gradient, glass surface, icon chip, decorative status dot, fake metric, or templated section chrome. The small green selection shadow is retained because it is source-aligned semantic feedback, not decorative glow.
- `shuorenhua`: authored copy uses functional source labels and verifiable dataset facts. It has no kicker, section numbering, staged instruction text, sycophantic opener, value inflation, narrator conclusion, invented claim, dash flourish, or repeated synonym. One canonical product name contains an en dash; it remains unchanged because source field values are protected spans. Dates, counts, source attribution, field names, and units were protected as well.

One rendered element was removed during the screenshot pass: a redundant all-data percentage variable that was calculated but never displayed. No evidence element was removed.

## Size

- Main application document, including topic CSS and JavaScript: `pages/index.html`, 13,818 characters.
- Compact complete dataset: `pages/data/shades.js`, 247,391 characters (247,454 UTF-8 bytes).
- Reproducible data builder: `tools/build-data.py`, 2,637 characters.

The main document remains above the 10,000-character preference because the retained source behaviors include three complete views, two linked filters, shared-scale comparison, pointer pinning, keyboard inspection, exact-value pagination, responsive fixed-stage support, reduced-motion handling, failure fallback, resize handling, and teardown. None was removed solely to meet the size target.
