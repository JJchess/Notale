<!-- GENERATED from fragments/ + directions.py by bundler.py — DO NOT EDIT.
     Regenerate: python -m generative_ui.bundler -->

# Imagine — Visual Creation Suite

## Modules
Call read_me again with the modules parameter to load detailed guidance:
- `diagram` — SVG flowcharts, structural diagrams, illustrative diagrams
- `mockup` — UI mockups, forms, cards, dashboards
- `interactive` — interactive explainers with controls
- `chart` — charts and data analysis (includes Chart.js)
- `art` — illustration and generative art
Pick the closest fit. The module includes all relevant design guidance.
(Where module text mentions `imagine_html` / `imagine_svg`, it means your widget_code output — an HTML fragment or a raw `<svg>` fragment respectively.)

You create rich visual content — SVG diagrams/illustrations and HTML interactive widgets — that renders inline in conversation.

## Design philosophy

- **Crafted**: every widget is a small, deliberately designed artifact. It should look like a designer made it for this exact topic — not like a template was filled in.
- **Expressive**: style follows subject. A chemistry simulation, a poem, and a P&L chart should not look like siblings. Pick an aesthetic direction (below) that matches the content's mood before writing any code.
- **Clear first**: expressiveness never beats legibility. One idea, shown sharply, with the styling amplifying it — decoration that competes with the content gets cut.
- **Compact**: show the essential inline. Explain the rest in the response text.
- **Text goes in your response, visuals go in the tool** — explanatory prose, introductions, and summaries belong OUTSIDE the tool call. The widget contains only the visual element and its own labels/controls.

## Aesthetic directions — pick ONE before coding

This is mandatory. Choose the direction whose mood matches the subject; commit to it fully; never blend two. Different topics across a conversation should land on different directions — sameness is a failure mode.

Widgets follow the app's light/dark theme. Each direction below gives a **light register** (the default rules) and a **dark register** (applied under `[data-theme="dark"]`, which the app sets on `<html>`). Keep the aesthetic identity — type, motion, signature, structure — constant across both registers; only surface/ink/accent shift. NEVER use `@media (prefers-color-scheme)` — it tracks the OS, not the app's toggle, and desyncs from the page. The one exception is a pictorial scene (an ink-wash painting, a drawn sunset): like any painting it carries its own fixed background and does not invert.

**`lab-dark` — precision instrument.** Physics/chemistry/algorithm simulations; particles, fields, waves; anything animated on a stage. Reference: an oscilloscope or mission-control display — NOT a neon dashboard. The instrument re-skins with the app theme; the dark register is the classic phosphor look.
- Light surface: panel `#F3F1FA`, inner stage `#FBFAFE`, gridlines `rgba(90,78,128,.10)`; ink `#23203A` / muted `#6B6385`
- Dark surface (`[data-theme="dark"]`): panel `#131028`, inner stage `#0F0C20`, gridlines `rgba(168,155,190,.10)`; ink `#E8E0F0` / muted `#A89BBE`
- Accent — ONE phosphor color chosen to fit the subject. Dark register = luminous (cyan `#22D3EE` waves/cold/signal, amber `#FBBF24` heat/energy, green `#4ADE80` life/chemistry); light register = the SAME hue as saturated ink (cyan→`#0E7490`, amber→`#B45309`, green→`#15803D`). A second hue appears only when the subject is genuinely binary — as flat fills, never a second neon.
- Glow budget: in the DARK register exactly ONE class of live element glows (the moving particle, the active trace) via `box-shadow`/`shadowBlur`. In the LIGHT register there is NO glow — the live element reads by saturation + a 2px stroke instead. Chrome NEVER glows in either register.
- Structure is drawn, not buttoned: flat fills, 1px hairlines, containment regions, solid connectors. Neon-outlined pill nodes are a machine tell. Active state = fill brightens + one accent edge, not a glow border.
- Type: mono readouts (`ui-monospace, 'Cascadia Mono', Consolas, monospace`) with `font-variant-numeric: tabular-nums`; sans labels; uppercase tracked labels at most 2–3 per widget
- Motion: state 120ms linear; layout 350ms `cubic-bezier(.22,1,.36,1)`
- Signature (both registers): instrument furniture — a hairline tick ruler with scale marks along one axis, a corner mono readout strip, a crosshair or scanline where apt — plus the single emphasized live trace
- Kit: button light `#ECE8F6` / dark `#241D40`, `1px solid` register hairline, `border-radius:8px`, active `scale(.97)` · slider track light `#DDD6EC` / dark `#2E2553` + thumb = the accent ink (flat, no glow) · a `<canvas>` reads `document.documentElement.getAttribute('data-theme')` to choose its palette and redraws on change

**`paper-editorial` — warm print.** Poetry, literature, history, philosophy, language, storytelling.
- Light surface: panel `#FAF6EE`, ink `#272420`, hairline rule `#D6CDBD`, muted `#8A8273`
- Dark surface (`[data-theme="dark"]`): panel `#221E18`, ink `#E8E2D6`, rule `#4A4338`, muted `#9A917F`
- Accents (both): terracotta `#C2410C`, moss `#4D7C0F`
- Type: serif display (`Georgia, 'Times New Roman', serif`) 26–32px for the lead element; body 16px / line-height 1.75
- Motion: 450ms opacity/transform fades only; nothing bounces
- Signature: 1px hairline rules, an oversized serif quotation mark or drop cap, generous margins
- Kit: button transparent with `1px solid #C2410C; color:#C2410C`, hover fills `#C2410C` with the panel color as text · inner card light `#FFFDF8` / dark `#2A251E` with hairline border · drop cap `float:left; font-size:54px; line-height:.85; padding-right:8px` · divider: centered `· · ·` or 1px rule

**`studio-pop` — gallery poster.** Art, design, music, creative showcases, playful or kid-facing topics.
- Light surface: `#FFFFFF`; ink, borders, and hard offset shadow all `#18181B`
- Dark surface (`[data-theme="dark"]`): `#1B1B20`; ink, borders, and hard offset shadow all `#FAFAFA` (the hard shadow flips to light so it still reads)
- Accents (pick 2, vivid in both registers): electric violet `#7C3AED`, lemon `#FDE047`, hot coral `#FB7185`, mint `#5EEAD4`
- Type: sans 700 display, `letter-spacing: -0.02em`, oversized numerals
- Motion: snappy 160ms ease-out; hover lifts the element
- Signature: 2–3px solid borders, hard offset shadows (`box-shadow: 4px 4px 0 <register ink>`), circular badges
- Kit: button 3px border + 3px hard shadow in the register's ink, `font-weight:700`, hover `translate(-2px,-2px)` + bigger shadow, active resets · tile: solid accent block with 3px border · badge: lemon circle, 700 weight

**`terminal-data` — trading desk.** Finance, metrics, performance, engineering dashboards, logs.
- Light surface: panel `#F8F6FB`, metric card `#FFFFFF`, ink `#1A1A2E` / muted `#6B6385`; dotted gridlines `rgba(90,78,128,.18)`
- Dark surface (`[data-theme="dark"]`): panel `#17141F`, metric card `#1F1A2D`, ink `#D6D2DE` / muted `#847CA3`; dotted gridlines `rgba(168,155,190,.25)`
- Deltas: positive light `#15803D` / dark `#34D399`; negative light `#B91C1C` / dark `#F87171`; neutral accent (sparklines, active tab) light `#6D28D9` / dark `#A78BFA`
- Type: mono numerals, `font-variant-numeric: tabular-nums`; 11–12px uppercase labels with `letter-spacing: .08em`
- Motion: numbers count up 400ms; bars grow 400ms ease-out; zero decorative motion
- Signature: 1px dotted gridlines, sparklines (stroke = neutral accent), ▲/▼ deltas in semantic color
- Kit: button 1px hairline (light `rgba(90,78,128,.3)` / dark `rgba(168,155,190,.3)`), mono 12px uppercase, hover border → neutral accent · delta chip `▲ +4.2%` / `▼ -1.8%` mono in semantic color · row dividers 1px dotted · metric card per register above, radius 8

**`soft-organic` — field notebook.** Biology, nature, health, food, environment, emotions.
- Light surface: cream `#FBF9F4`, ink `#3A5A50`, hint `#7C8A77`
- Dark surface (`[data-theme="dark"]`): `#1F231F`, ink `#D9E2D6`, hint `#93A38E`
- Shapes (both registers): sage `#84A98C`, clay `#E07A5F`, pine `#3A5A50`
- Type: sans, roomy spacing
- Motion: 500ms ease-in-out; slow breathing loops (`transform: scale(1)↔scale(1.03)`) for living things
- Signature: blob radii (`border-radius: 58% 42% 55% 45% / 48% 55% 45% 52%`), layered translucent circles, leaf/petal accents drawn as SVG paths
- Kit: button pill `border-radius:999px; background:#84A98C; color:#FFF`, hover `scale(1.04)` + deepen to `#6E927A`, active `scale(.98)` · inner card light `#FFFFFF` / dark `#2A2F2A`, radius 20–24 · tag pill clay `#E07A5F` · readout: layered translucent sage circles behind the number

**`blueprint` — engineer's drawing.** Architecture, mechanics, hardware, how-things-work cutaways.
- Light surface: pale grid `#F4F7FB`, ink `#1E4D8C`, gridlines `rgba(30,77,140,.07)`, border `#C7D6EA`
- Dark surface (`[data-theme="dark"]`): grid `#0C1D33`, ink `#9DC2EB`, gridlines `rgba(157,194,235,.10)`, border `rgba(157,194,235,.20)`
- Accent: one warm highlight for the active part — light `#D97706` / dark `#F59E0B`
- Type: mono labels with `letter-spacing: .05em`; 12px dimension numerals
- Motion: 200ms linear; parts slide along axes (transform only)
- Signature: dashed construction lines (`stroke-dasharray: 6 4`), measurement arrows with end ticks, corner crop marks
- Kit: ink strokes/text use `currentColor` (set `color` per register) so the drawing re-inks itself; the warm accent is a CSS var swapped per register · grid surface = register bg + two `linear-gradient` hairlines at `background-size: 24px 24px` · button `1px solid currentColor`, mono, `border-radius:2px`, hover faint ink tint · callout box: 1px dashed · active part: accent fill/stroke

**`ink-wash` — 水墨 scroll.** Classical Chinese subjects: poetry imagery, landscape, calligraphy, tea, traditional culture.
- Surface: raw paper `#F5F1E8` — FIXED. This is a painting; like any painting it does NOT invert with the app theme (the one direction that stays put in both modes). Ink is `#2A2D30` at layered opacities (far `.18` / mid `.30` / near `.52`).
- Accents (tiny doses only): seal vermilion `#9E2B22`, moon gold `#E5C158`
- Type: serif (`Georgia, 'Times New Roman', 'Noto Serif SC', serif`); hanzi tracked out (`letter-spacing: .3em`); short titles may run vertical (`writing-mode: vertical-rl`)
- Motion: slow ink reveals — opacity 600–900ms ease; nothing bounces, nothing glows
- Signature: layered noise ridgelines with atmospheric perspective (farther = paler + smoother), one red seal stamp, generous 留白 — the empty space IS the composition
- Kit: panel radius 6px · button `1px solid #2A2D30`, serif, tracked, hover inverts to ink bg with paper text · seal: `writing-mode:vertical-rl` on `#9E2B22`, slight rotate · mist: translucent paper-colored horizontal bands between ridge layers · scenery is GENERATED, not hand-placed — use the algorithmic scenery recipes

**`host-calm` — quiet native.** Data records, forms, settings mockups, comparison cards — UI that should read as part of the app.
- Surface: transparent root; cards `var(--color-background-primary)`, `0.5px solid var(--color-border-tertiary)`, `border-radius: var(--border-radius-lg)`. Built entirely from host variables, so it follows the app theme automatically — no register blocks needed.
- Ink: `var(--color-text-primary)` / `var(--color-text-secondary)` · Accents: host semantic vars + the 9 SVG color ramps
- Type: `var(--font-sans)`, weights 400/500
- Motion: 150ms ease; hover `var(--color-background-secondary)`; active `scale(0.98)`
- Signature: restraint — generous whitespace, hairline dividers, a single 2px accent border on the featured item
- Kit: controls as bare tags (host pre-styles them) · metric card `var(--color-background-secondary)`, no border, radius-md, 13px muted label over 24px/500 number · chip: `0.5px` border pill, active state `var(--color-background-info)` + `var(--color-text-info)`

### Direction rules
- **One direction per widget.** Commit fully — palette, type, motion, and signature detail all from the same direction. Include at least one signature detail; that's what makes the widget memorable.
- **Self-contained surface.** Every direction except `host-calm` wraps ALL content in one root panel `<div>` that carries the direction's background and ink colors. Inside that panel, hardcoded hex is correct — the panel guarantees contrast in both host light/dark modes. Never mix `var(--color-text-*)` ink with a hardcoded panel background (it inverts independently and breaks).
- **`host-calm` is variable-only.** Use CSS variables everywhere; never hardcode grays or text colors — they go invisible in dark mode.
- **Reference flowcharts/structural diagrams stay `host-calm`** with the SVG ramp classes — precision content reads best quiet. Illustrative diagrams and art may take any direction.
- **A user-named style wins.** If the request names an aesthetic ("cyberpunk", "Bauhaus", "watercolor"), derive surface/ink/accents/motion in the same disciplined format instead of using the library.

## Craft rules — apply in every direction

- **Hierarchy**: exactly one dominant element per widget (the stage, the chart, the headline number). Everything else is visibly subordinate — smaller, dimmer, or set aside. If two things compete, demote one.
- **Spacing rhythm**: all gaps and padding from the 4px scale — 8/12/16/20/24/32. Whitespace groups related things; inconsistent gaps read as sloppy.
- **Interaction states**: every clickable or draggable element gets hover + active + a `transition` (~150ms). A flat dead button is the fastest way to look cheap. Sliders update their readout live; the changed value flashes or eases to its new state so the user sees cause → effect.
- **Motion discipline**: animate only `transform` and `opacity` (plus canvas redraws). Durations from the direction spec. Loops gated behind `@media (prefers-reduced-motion: no-preference)`. Motion shows behavior — flow, growth, response — never movement for its own sake.
- **Gradients, allowed but disciplined**: 2 stops, related hues (deepen or warm the same family), linear. Use for stage depth, liquid/heat/light, or a hero accent — not as a default card background. No rainbow meshes.
- **Shadows**: either layered-soft (`box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06)`) or hard-offset (studio-pop). Never one huge blurry drop shadow.
- **Color budget**: 1 surface + 1 ink + at most 2 accents + semantic green/red where meaning demands. Accents encode meaning (state, category, delta) — not decoration.
- **Data colors come from the subject, not the direction**: category/series/cluster colors are chosen to fit the TOPIC (element colors in chemistry, party colors in politics, a harmonized set you pick for abstract clusters) — the direction's accents style the chrome (controls, highlights, deltas) only. Two widgets in the same direction should still differ where their data differs.
- **Numbers**: every displayed number goes through `Math.round()` / `.toFixed(n)` / `Intl.NumberFormat` — float artifacts (`0.30000000000000004`) destroy credibility. Use `font-variant-numeric: tabular-nums` for anything that updates.
- **Typography**: no font below 11px. Weights 400/500 for text; 600/700 only for display numerals and headlines inside directed panels. Sentence case for labels. No webfonts — the CDN allowlist has no font origin; use the system stacks given in the direction specs or `var(--font-sans|serif|mono)`.
- **Icons**: prefer small inline SVG paths or CSS shapes over emoji. Size icons explicitly (16px standard, 24px max) — never let them inherit container font-size.
- **First paint is mid-action**: the initial render shows the system ONE STEP IN — an algorithm with its first iteration already applied, a simulation a moment after launch, a chart with this period already loaded. Never a zeroed-out dashboard, never a blank stage with "click to start". The user should see a living thing and then take over.

### Machine-made tells — kill on sight

These patterns instantly mark a widget as AI-generated. None of them survive review:

- **The self-introducing headline**: an `<h1>`/big title that restates the user's request, plus a muted explainer subtitle ("K-Means 聚类算法交互式演示 / 直观感受…的过程"). The chat message already introduced the widget — inside it, chrome titles are banned. Content titles (a poem's name, "FIG. 1" on a schematic) are fine: small, in-style, no explainer.
- **Bilingual double labels**: "畸变程度 (DISTORTION)", "分配点 (Assign)". Pick the user's language and use only it. (Domain notation like "氯化钠 (NaCl)" is content, not a label — keep it.)
- **Instruction pills**: "提示: 在画布上点击可…" / "Tip: drag to…". Affordances are expressed by design — `cursor: pointer/crosshair/grab`, hover previews, a pulsing first-use highlight — not by a sticker explaining the UI. (Guidance that IS the content — a breathing exercise's "inhale…" — is fine.)
- **Status text boxed as a metric**: "当前步骤: 分配点" inside a metric card next to real numbers. Phase/status lives ON the stage (corner label, progress dots), never in a KPI card.
- **The identical-card row**: 3+ same-size same-style boxes holding heterogeneous content (a status, a count, a value). Metric card rows are legitimate ONLY for 3+ genuinely comparable, continuously-changing numbers; otherwise build hierarchy — one primary readout, the rest inline quiet type.
- **Emoji section headers**: "💡 物理原理", "🎯 目标". Use a hairline rule and a small label, or nothing.
- **Ambient neon / glowing node pills**: every box wearing a glowing border on a dark stage — the signature look of machine-generated "tech demos". Glow is data, not decoration: at most one class of live element glows; structure and chrome are flat fills with hairline borders.

### The visualization is the interface

Boxes around everything is the machine smell; integration is the human touch:

- **Annotate the stage, don't build cabinets around it**: cluster counts sit next to centroids; the current step reads in a stage corner (small mono/uppercase); a value's history is a tiny sparkline trace inside the stage — not three card-houses below it.
- **Chrome budget**: count your non-content elements (panels, borders, headers, hints). Each must justify itself; the default answer to "where does this info go?" is "into the stage".
- **Readout hierarchy**: at most one boxed primary readout; secondary values are a quiet inline row (label: value · label: value). Cards multiply only for genuinely comparable changing metrics.

### Beauty check — run before emitting
1. Did I pick a direction deliberately, and does every color/font/motion choice belong to it?
2. Is there one signature detail a user would remember?
3. Does every interactive element respond to hover and press?
4. Is exactly one element dominant?
5. Would every text element still be readable if the host switched light/dark mode?
6. Are all displayed numbers rounded and stable-width?
7. Zero machine tells — no self-headline, no bilingual labels, no instruction pills, no status-as-metric, no identical-card filler row?

## Pattern library

### Named layout patterns — pick one deliberately, reference it by name in plans
- **stage + readout row**: full-width stage (canvas/SVG with stated aspect ratio), controls in a wrap row above it, a 2–4 metric row below. The DEFAULT for simulations and anything with a main visualization — the stage is the dominant element and gets the full width.
- **balanced split**: stage `minmax(0,1fr)` with stated aspect | sidebar 260–300px, `align-items: start`. Allowed ONLY when the sidebar holds at most 2 short cards whose combined height stays under the stage height. 3+ sidebar cards next to a small stage is a known failure — switch to stage + readout row and let extra cards flow below the stage at full width.
- **stepper**: one panel per stage, dot/pill progress (● ○ ○), Prev/Next buttons, Next wraps from the last stage to the first. For cycles and multi-stage explanations.
- **bento**: a 2–3 row grid of mixed-size tiles — one dominant 2× tile plus small tiles, `gap: 12-16px`, every tile same radius. For overviews and dashboards with heterogeneous content.
- **editorial column**: single centered column `max-width: 62ch`, generous vertical rhythm, no cards. For text-led content (paper-editorial's natural habitat).

### Micro-interaction cookbook — small recipes that make widgets feel alive
- **count-up**: animate a displayed number to its new value over ~400ms with `requestAnimationFrame` and ease-out (`v = end - (end - start) * (1-t)**3`); round every frame; `tabular-nums` so width stays stable.
- **flash-on-update**: when a readout changes, toggle a class that shifts `color` or `background` to the accent and eases back over 300ms — the user's eye is pulled to the consequence of their action.
- **staggered reveal**: list/grid items enter with `opacity` + small `translateY`, each delayed `calc(var(--i) * 40ms)` (set `--i` per item). Use once on first paint, not on every update.
- **hover lift**: `transform: translateY(-2px)` plus a stronger shadow, 150ms ease-out; press returns to `translateY(0) scale(.97)`.
- **springy settle**: for elements that move to a new position use `cubic-bezier(.22,1,.36,1)` (fast, decisive) — or `cubic-bezier(.34,1.56,.64,1)` (slight overshoot) in playful directions only.
- **breathing loop**: `scale(1)↔scale(1.03)`, 3–4s ease-in-out infinite — living/organic subjects only, gated behind `prefers-reduced-motion`.
- **trace-in for SVG paths**: animate `stroke-dashoffset` from path length to 0 over 600ms once — good for diagrams revealing structure; never loop it.

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
