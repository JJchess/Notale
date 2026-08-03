## Technical contract — hard constraints

- No DOCTYPE, `<html>`, `<head>`, or `<body>` — output a content fragment only.
- Structure order inside widget_code: `<style>` → markup → `<script>`.
- No `<!-- comments -->` or `/* comments */` — they waste tokens.
- The widget container is `display: block; width: 100%` with transparent background; your root element fills it. Width is fluid and unknown — never hardcode pixel widths on layout containers; use `width: 100%`, `max-width`, `1fr`, `minmax(0,1fr)`. Height is content-driven — no fixed height and no `overflow: hidden` on the root.
- Never use `position: fixed` — the iframe sizes itself to in-flow content height, so fixed elements collapse it. For modal/overlay mockups, build a faux viewport: a normal-flow `<div style="min-height: 400px; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;">` with the modal inside.
- No nested scrolling — let height grow to fit. Ranked/score lists render only the top 6–8 items (never `max-height` + `overflow-y: auto`); if the data is longer, cut it and note the cut in a muted footer line.
- Scripts execute after the fragment is in the DOM. Load libraries via `<script src="...">` (UMD globals), then use the global in a plain `<script>` that follows.
- **CDN allowlist (CSP-enforced)**: external resources may ONLY load from `cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`. Anything else silently fails — including Google Fonts.
- Canvas does not resolve `var(--color-*)` in fillStyle/strokeStyle — use hardcoded hex on canvas (fine inside a self-contained panel).
- `grid-template-columns: 1fr` children need `minmax(0,1fr)` to clamp min-content overflow.
- Multi-column layouts: set `align-items: start` on the grid/flex container. The default `stretch` inflates a panel past its content — a square SVG inside a stretched wrapper leaves a dead band below the drawing.
- Balance column heights: in a stage + sidebar layout, estimate both columns' heights before coding; if the sidebar runs much taller than the stage, move its bottom card below the stage at full width instead of letting the stage panel stretch.
- The title gets its own row. Never pair a title with a wide control cluster in one non-wrapping flex row — the title gets crushed into vertical wrapping on narrow hosts. Controls live in their own full-width wrap row below the title.
- A small data-space viewBox (e.g. `0 0 100 100`) scales stroke-width and text up with the container — hairlines render fat and blurry. Add `vector-effect="non-scaling-stroke"` to hairlines, or use a pixel-scale viewBox (`0 0 680 H`) and map data coordinates onto it.

### Host CSS variables (for `host-calm` and as neutral fallbacks)
**Backgrounds**: `--color-background-primary` (white), `-secondary` (surfaces), `-tertiary` (page bg), `-info`, `-danger`, `-success`, `-warning`
**Text**: `--color-text-primary` (black), `-secondary` (muted), `-tertiary` (hints), `-info`, `-danger`, `-success`, `-warning`
**Borders**: `--color-border-tertiary` (0.15α, default), `-secondary` (0.3α, hover), `-primary` (0.4α), semantic `-info/-danger/-success/-warning`
**Typography**: `--font-sans`, `--font-serif`, `--font-mono`
**Layout**: `--border-radius-md` (8px), `--border-radius-lg` (12px), `--border-radius-xl` (16px)
All auto-adapt to light/dark mode.

**Theme policy — widgets follow the app's light/dark toggle**:
The app sets `data-theme="light"|"dark"` on `<html>` (its own toggle, NOT the OS). Your widget renders inside that element, so it can read the toggle directly:
- **CSS** — write the **light register as the default rules**, then the dark register under the ancestor selector: `[data-theme="dark"] .yourClass { background:#131028; color:#E8E0F0 }`. The descendant selector matches because `<html>` carries the attribute; it re-applies instantly when the user toggles.
- **Canvas / JS** — CSS can't reach a canvas. Read `document.documentElement.getAttribute('data-theme')` when you draw, pick your palette from it, and redraw on change: a `requestAnimationFrame` loop already re-reads every frame; a static canvas needs `new MutationObserver(draw).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']})`.
- `@media (prefers-color-scheme: ...)` is BANNED (validator-enforced): it tracks the OS, not the app's toggle, so it desyncs from the page. (`prefers-reduced-motion` is unrelated — still required for loops.)
- Each direction spec gives a light register and a dark register — implement BOTH. `host-calm` and SVG ramp classes (`c-blue`, `t`/`ts`/`th`) are built from host variables and adapt with zero extra work.
- **Surface and ink move together.** For any element — and ESPECIALLY chips, pills, tags, token labels, and inactive-state buttons — the background and the text color must be on the same footing: either BOTH follow the theme, or BOTH are fixed. The classic bug: a chip gets a hardcoded dark `background:#1a1a2e` (fixed) while its label uses `color: var(--ink)` or `currentColor` (theme-following). In dark mode the pale ink reads fine; in light mode the ink flips to near-black and vanishes on the still-dark chip. If a chip's fill is a fixed dark hex, its label must be a fixed light hex too — or, better, give the chip a light-register fill (`background:#ECE8F6`) and a `[data-theme="dark"]` dark fill so both surface and ink track the toggle.
- **This rule extends to SVG/canvas nodes drawn in JS.** When JS sets a node's `fill`/`stroke` via `setAttribute('fill', …)` or `ctx.fillStyle`, pull EVERY color from a single theme palette (e.g. a `getThemeColors()` that branches on `getAttribute('data-theme')`) — including box/node fills, not just text. Never `setAttribute('fill', '#0B0F19')` with a hardcoded hex while the label color comes from the palette: in light mode the box stays dark and the now-dark label vanishes on it (same footgun, invisible to the CSS validator because the fill lives in JS). A `[data-theme="light"]` CSS register that re-skins the chrome does NOT reach these JS-painted nodes — re-skin them in the palette. Also give SVG `:hover`/`.selected` rect-fill CSS rules a `[data-theme="light"]` override, or they keep their dark default in light mode.
- The one exception is a pictorial scene (an ink-wash painting, a drawn sunset): like any painting it carries its own fixed hardcoded background and does NOT invert.
- Mental test: toggle the app light↔dark — the widget must shift with it (except a pictorial scene, which stays put and still reads on either page background).

### sendPrompt(text)
A global function that sends a message to chat as if the user typed it. Use it when the user's next step benefits from the assistant thinking. Handle filtering, sorting, toggling, and calculations in JS instead.

### Links
`<a href="https://...">` works — clicks open the host's link-confirmation dialog. Or call `openLink(url)` directly.

## When nothing fits
Pick the closest module use case and adapt. When nothing fits cleanly:
- Explanatory content → editorial layout (paper-editorial or host-calm)
- A bounded object (record, receipt, card) → host-calm card layout
- All craft rules and the technical contract still apply
- Use `sendPrompt()` for any action that benefits from assistant reasoning
