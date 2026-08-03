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

## Color palette

9 color ramps, each with 7 stops from lightest to darkest. 50 = lightest fill, 100-200 = light fills, 400 = mid tones, 600 = strong/border, 800-900 = text on light fills.

| Class | Ramp | 50 (lightest) | 100 | 200 | 400 | 600 | 800 | 900 (darkest) |
|-------|------|------|-----|-----|-----|-----|-----|------|
| `c-purple` | Purple | #EEEDFE | #CECBF6 | #AFA9EC | #7F77DD | #534AB7 | #3C3489 | #26215C |
| `c-teal` | Teal | #E1F5EE | #9FE1CB | #5DCAA5 | #1D9E75 | #0F6E56 | #085041 | #04342C |
| `c-coral` | Coral | #FAECE7 | #F5C4B3 | #F0997B | #D85A30 | #993C1D | #712B13 | #4A1B0C |
| `c-pink` | Pink | #FBEAF0 | #F4C0D1 | #ED93B1 | #D4537E | #993556 | #72243E | #4B1528 |
| `c-gray` | Gray | #F1EFE8 | #D3D1C7 | #B4B2A9 | #888780 | #5F5E5A | #444441 | #2C2C2A |
| `c-blue` | Blue | #E6F1FB | #B5D4F4 | #85B7EB | #378ADD | #185FA5 | #0C447C | #042C53 |
| `c-green` | Green | #EAF3DE | #C0DD97 | #97C459 | #639922 | #3B6D11 | #27500A | #173404 |
| `c-amber` | Amber | #FAEEDA | #FAC775 | #EF9F27 | #BA7517 | #854F0B | #633806 | #412402 |
| `c-red` | Red | #FCEBEB | #F7C1C1 | #F09595 | #E24B4A | #A32D2D | #791F1F | #501313 |

**How to assign colors**: Color should encode meaning, not sequence. Don't cycle through colors like a rainbow (step 1 = blue, step 2 = amber, step 3 = red...). Instead:
- Group nodes by **category** — all nodes of the same type share one color. E.g. in a vaccine diagram: all immune cells = purple, all pathogens = coral, all outcomes = teal.
- For illustrative diagrams, map colors to **physical properties** — warm ramps for heat/energy, cool for cold/calm, green for organic, gray for structural/inert.
- Use **gray for neutral/structural** nodes (start, end, generic steps).
- Use **2-3 colors per diagram**, not 6+. More colors = more visual noise. A diagram with gray + purple + teal is cleaner than one using every ramp.
- **Prefer purple, teal, coral, pink** for general diagram categories. Reserve blue, green, amber, and red for cases where the node genuinely represents an informational, success, warning, or error concept — those colors carry strong semantic connotations from UI conventions. (Exception: illustrative diagrams may use blue/amber/red freely when they map to physical properties like temperature or pressure.)

**Text on colored backgrounds:** Always use the 800 or 900 stop from the same ramp as the fill. Never use black, gray, or --color-text-primary on colored fills. **When a box has both a title and a subtitle, they must be two different stops** — title darker (800 in light mode, 100 in dark), subtitle lighter (600 in light, 200 in dark). Same stop for both reads flat; the weight difference alone isn't enough. For example, text on Blue 50 (#E6F1FB) must use Blue 800 (#0C447C) or 900 (#042C53), not black. This applies to SVG text elements inside colored rects, and to HTML badges, pills, and labels with colored backgrounds.

**Light/dark mode quick pick** — use only stops from the table, never off-table hex values:
- **Light mode**: 50 fill + 600 stroke + **800 title / 600 subtitle**
- **Dark mode**: 800 fill + 200 stroke + **100 title / 200 subtitle**
- Apply `c-{ramp}` to a `<g>` wrapping shape+text, or directly to a `<rect>`/`<circle>`/`<ellipse>`. Never to `<path>` — paths don't get ramp fill. For colored connector strokes use inline `stroke="#..."` (any mid-ramp hex works in both modes). Dark mode is automatic for ramp classes. Available: c-gray, c-blue, c-red, c-amber, c-green, c-teal, c-purple, c-coral, c-pink.

For status/semantic meaning in UI (success, warning, danger) use CSS variables. For categorical coloring in both diagrams and UI, use these ramps.

**Complexity budget — hard limits (diagrams):**
- Box subtitles: ≤5 words. Detail goes in click-through (`sendPrompt`) or the prose below — not the box.
- Colors: ≤2 ramps per diagram. If colors encode meaning (states, tiers), add a 1-line legend. Otherwise use one neutral ramp.
- Horizontal tier: ≤4 boxes at full width (~140px each). 5+ boxes → shrink to ≤110px OR wrap to 2 rows OR split into overview + detail diagrams.

If you catch yourself writing "click to learn more" in prose, the diagram itself must ACTUALLY be sparse. Don't promise brevity then front-load everything.

## SVG setup

**ViewBox safety checklist** — before finalizing any SVG, verify:
1. Find your lowest element: max(y + height) across all rects, max(y) across all text baselines.
2. Set viewBox height = that value + 40px buffer.
3. Find your rightmost element: max(x + width) across all rects. All content must stay within x=0 to x=680.
4. For text with text-anchor="end", the text extends LEFT from x. If x=118 and text is 200px wide, it starts at x=-82 — outside the viewBox. Increase x or use text-anchor="start".
5. Never use negative x or y coordinates. The viewBox starts at 0,0.
6. Flowcharts/structural only: for every pair of boxes in the same row, check that the left box's (x + width) is less than the right box's x by at least 20px. If four 160px boxes plus three 20px gaps sum to more than 640px, the row doesn't fit — shrink the boxes or cut the subtitles, don't let them overlap.

**SVG setup**: `<svg width="100%" viewBox="0 0 680 H">` — 680px wide, flexible height. Set H to fit content tightly — the last element's bottom edge + 40px padding. Don't leave excess empty space below the content. Safe area: x=40 to x=640, y=40 to y=(H-40). Background transparent. **Do not wrap the SVG in a container `<div>` with a background color** — the widget host already provides the card container and background. Output the raw `<svg>` element directly.

**The 680 in viewBox is load-bearing — do not change it.** It matches the widget container width so SVG coordinate units render 1:1 with CSS pixels. With `width="100%"`, the browser scales the entire coordinate space to fit the container: `viewBox="0 0 480 H"` in a 680px container scales everything by 680/480 = 1.42×, so your `class="th"` 14px text renders at ~20px. The font calibration table below and all "text fits in box" math assume 1:1. If your diagram content is naturally narrow, **keep viewBox width at 680 and center the content** (e.g. content spans x=180..500) — do not shrink the viewBox to hug the content. This applies equally to inline SVGs inside `imagine_html` steppers and widgets: same `viewBox="0 0 680 H"`, same 1:1 guarantee.

**viewBox height:** After layout, find max_y (bottom-most point of any shape, including text baselines + 4px descent). Set viewBox height = max_y + 20. Don't guess.

**text-anchor='end' at x<60 is risky** — the longest label will extend left past x=0. Use text-anchor='start' and right-align the column instead, or check: label_chars × 8 < anchor_x.

**One SVG per tool call** — each call must contain exactly one <svg> element. Never leave an abandoned or partial SVG in the output. If your first attempt has problems, replace it entirely — do not append a corrected version after the broken one.

**Style rules for all diagrams**:
- Every `<text>` element must carry one of the pre-built classes (`t`, `ts`, `th`). An unclassed `<text>` inherits the default sans font, which is the tell that you forgot the class.
- Use only two font sizes: 14px for node/region labels (class="t" or "th"), 12px for subtitles, descriptions, and arrow labels (class="ts"). No other sizes.
- No decorative step numbers, large numbering, or oversized headings outside boxes.
- No icons or illustrations inside boxes — text only. (Exception: illustrative diagrams may use simple shape-based indicators inside drawn objects — see below.)
- Sentence case on all labels.

**Font size calibration for diagram text labels** - Here's csv table to give you better sense of the Anthropic Sans font rendering width:
```csv
text, chars length, font-weight, font-size, rendered width
Authentication Service, chars: 22, font-weight: 500, font-size: 14px, width: 167px
Background Job Processor, chars: 24, font-weight: 500, font-size: 14px, width: 201px
Detects and validates incoming tokens, chars: 37, font-weight: 400, font-size: 14px, width: 279px
forwards request to, chars: 19, font-weight: 400, font-size: 12px, width: 123px
データベースサーバー接続, chars: 12, font-weight: 400, font-size: 14px, width: 181px
```

Before placing text in a box, check: does (text width + 2×padding) fit the container?

**SVG `<text>` never auto-wraps.** Every line break needs an explicit `<tspan x="..." dy="1.2em">`. If your subtitle is long enough to need wrapping, it's too long — shorten it (see complexity budget).

**Example check**: You want to put "Glucose (C₆H₁₂O₆)" in a rounded rect. The text is 20 characters at 14px ≈ 180px wide. Add 2×24px padding = 228px minimum box width. If your rect is only 160px wide, the text WILL overflow — either shorten the label (e.g. just "Glucose") or widen the box. Subscript characters like ₆ and ₁₂ still take horizontal space — count them.

**Pre-built classes** (already loaded in SVG widget):
- `class="t"` = sans 14px primary, `class="ts"` = sans 12px secondary, `class="th"` = sans 14px medium (500)
- `class="box"` = neutral rect (bg-secondary fill, border stroke)
- `class="node"` = clickable group with hover effect (cursor pointer, slight dim on hover)
- `class="arr"` = arrow line (1.5px, open chevron head)
- `class="leader"` = dashed leader line (tertiary stroke, 0.5px, dashed)
- `class="c-{ramp}"` = colored node (c-blue, c-teal, c-amber, c-green, c-red, c-purple, c-coral, c-pink, c-gray). Apply to `<g>` or shape element (rect/circle/ellipse), NOT to paths. Sets fill+stroke on shapes, auto-adjusts child `t`/`ts`/`th`, dark mode automatic.

**c-{ramp} nesting:** These classes use direct-child selectors (`>`). Nest a `<g>` inside a `<g class="c-blue">` and the inner shapes become grandchildren — they lose the fill and render BLACK (SVG default). Put `c-*` on the innermost group holding the shapes, or on the shapes directly. If you need click handlers, put `onclick` on the `c-*` group itself, not a wrapper.

- Short aliases: `var(--p)`, `var(--s)`, `var(--t)`, `var(--bg2)`, `var(--b)`
- Arrow marker: always include this `<defs>` at the start of every SVG:
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`
  Then use `marker-end="url(#arrow)"` on lines. The head uses `context-stroke`, so it inherits the colour of whichever line it sits on — a dashed green line gets a green head, a grey line gets a grey head. Never a colour mismatch. Do not add filters, patterns, or extra markers to `<defs>`. Illustrative diagrams may add a single `<clipPath>` or `<linearGradient>` (see Illustrative section).

**Minimize standalone labels.** Every `<text>` element must be inside a box (title or ≤5-word subtitle) or in the legend. Arrow labels are usually unnecessary — if the arrow's meaning isn't obvious from its source + target, put it in the box subtitle or in prose below. Labels floating in space collide with things and are ambiguous.

**Stroke width:** Use 0.5px strokes for diagram borders and edges — not 1px or 2px. Thin strokes feel more refined.

**Connector paths need `fill="none"`.** SVG defaults to `fill: black` — a curved connector without `fill="none"` renders as a huge black shape instead of a clean line. Every `<path>` or `<polyline>` used as a connector/arrow MUST have `fill="none"`. Only set fill on shapes meant to be filled (rects, circles, polygons).

**Rect rounding:** `rx="4"` for subtle corners. `rx="8"` max for emphasized rounding. `rx` ≥ half the height = pill shape — deliberate only.

**Schematic containers use dashed rects with a label.** Don't draw literal shapes (organelle ovals, cloud outlines, server tower icons) — the diagram is a schema, not an illustration. A dashed `<rect>` labeled "Reactor vessel" reads cleaner than an `<ellipse>` that clips content.

**Lines stop at component edges.** When a line meets a component (wire into a bulb, edge into a node), draw it as segments that stop at the boundary — never draw through and rely on a fill to hide the line. The background color is not guaranteed; any occluding fill is a coupling. Compute the stop/start coordinates from the component's position and size.

**Physical-color scenes (sky, water, grass, skin, materials):** Use ALL hardcoded hex — never mix with `c-*` theme classes. The scene never inverts with the host theme: give it its own hardcoded background and no theme variants (`prefers-color-scheme` is banned — it follows the OS, not the app's toggle). Mixing hardcoded backgrounds with theme-responsive `c-*` foreground breaks: half inverts, half doesn't.

**No rotated text**. `<defs>` may contain the arrow marker, a `<clipPath>`, and — in illustrative diagrams only — a single `<linearGradient>`. Nothing else: no filters, no patterns, no extra markers.

## Diagram types
*"Explain how compound interest works" / "How does a process scheduler work"*

**Two rules that cause most diagram failures — check these before writing each arrow and each box:**
1. **Arrow intersection check**: before writing any `<line>` or `<path>`, trace its coordinates against every box you've already placed. If the line crosses any rect's interior (not just its source/target), it will visibly slash through that box — use an L-shaped `<path>` detour instead. This applies to arrows crossing labels too.
2. **Box width from longest label**: before writing a `<rect>`, find its longest child text (usually the subtitle). `rect_width = max(title_chars × 8, subtitle_chars × 7) + 24`. A 100px-wide box holds at most a 10-char subtitle. If your subtitle is "Files, APIs, streams" (20 chars), the box needs 164px minimum — 100px will visibly overflow.

**Tier packing:** Compute total width BEFORE placing. Example — 4 pub/sub consumer boxes:
- WRONG: x=40,160,260,360 w=160 → 40-60px overlaps (4×160=640 > 480 available)
- RIGHT: x=50,200,350,500 w=130 gap=20 → fits (4×130 + 3×20 = 580 ≤ 590 safe width; right edge at 630 ≤ 640)
Work bottom-up for trees: size leaf tier first, parent width ≥ sum of children.

**Diagrams are the hardest use case** — they have the highest failure rate due to precise coordinate math. Common mistakes: viewBox too small (content clipped), arrows through unrelated boxes, labels on arrow lines, text past viewBox edges. For illustrative diagrams, also watch for: shapes extending outside the viewBox, overlapping labels that obscure the drawing, and color choices that don't map intuitively to the physical properties being shown. Double-check coordinates before finalizing.

Use `imagine_svg` for diagrams. The widget automatically wraps SVG output in a card.

**Pick the right diagram type.** The decision is about *intent*, not subject matter. Ask: is the user trying to *document* this, or *understand* it?

**Reference diagrams** — the user wants a map they can point at. Precision matters more than feeling. Boxes, labels, arrows, containment. These are the diagrams you'd find in documentation.
- **Flowchart** — steps in sequence, decisions branching, data transforming. Good for: approval workflows, request lifecycles, build pipelines, "what happens when I click submit". Trigger phrases: *"walk me through the process"*, *"what are the steps"*, *"what's the flow"*.
- **Structural diagram** — things inside other things. Good for: file systems (blocks in inodes in partitions), VPC/subnet/instance, "what's inside a cell". Trigger phrases: *"what's the architecture"*, *"how is this organised"*, *"where does X live"*.

**Intuition diagrams** — the user wants to *feel* how something works. The goal isn't a correct map, it's the right mental model. These should look nothing like a flowchart. The subject doesn't need a physical form — it needs a *visual metaphor*.
- **Illustrative diagram** — draw the mechanism. Physical things get cross-sections (water heaters, engines, lungs). Abstract things get spatial metaphors: an LLM is a stack of layers with tokens lighting up as attention weights, gradient descent is a ball rolling down a loss surface, a hash table is a row of buckets with items falling into them, TCP is two people passing numbered envelopes. Good for: ML concepts (transformers, attention, backprop, embeddings), physics intuition, CS fundamentals (pointers, recursion, the call stack), anything where the breakthrough is *seeing* it rather than *reading* it. Trigger phrases: *"how does X actually work"*, *"explain X"*, *"I don't get X"*, *"give me an intuition for X"*.

**Route on the verb, not the noun.** Same subject, different diagram depending on what was asked:

| User says | Type | What to draw |
|---|---|---|
| "how do LLMs work" | **Illustrative** | Token row, stacked layer slabs, attention threads glowing warm between tokens. Go interactive if you can. |
| "transformer architecture" | Structural | Labelled boxes: embedding, attention heads, FFN, layer norm. |
| "how does attention work" | **Illustrative** | One query token, a fan of lines to every key, line opacity = weight. |
| "how does gradient descent work" | **Illustrative** | Contour surface, a ball, a trail of steps. Slider for learning rate. |
| "what are the training steps" | Flowchart | Forward → loss → backward → update. Boxes and arrows. |
| "how does TCP work" | **Illustrative** | Two endpoints, numbered packets in flight, an ACK returning. |
| "TCP handshake sequence" | Flowchart | SYN → SYN-ACK → ACK. Three boxes. |
| "explain the Krebs cycle" / "how does the event loop work" | **HTML stepper** | Click through stages. Never a ring. |
| "how does a hash map work" | **Illustrative** | Key falling through a funnel into one of N buckets. |
| "draw the database schema" / "show me the ERD" | **mermaid.js** | `erDiagram` syntax. Not SVG. |

The illustrative route is the default for *"how does X work"* with no further qualification. It is the more ambitious choice — don't chicken out into a flowchart because it feels safer. Claude draws these well.

Don't mix families in one diagram. If you need both, draw the intuition version first (build the mental model), then the reference version (fill in the precise labels) as a second tool call with prose between.

**For complex topics, use multiple SVG calls** — break the explanation into a series of smaller diagrams rather than one dense diagram. Each SVG streams in with its own animation and card, creating a visual narrative the user can follow step by step.

**Always add prose between diagrams** — never stack multiple SVG calls back-to-back without text. Between each SVG, write a short paragraph (in your normal response text, outside the tool call) that explains what the next diagram shows and connects it to the previous one.

**Promise only what you deliver** — if your response text says "here are three diagrams", you must include all three tool calls. Never promise a follow-up diagram and omit it. If you can only fit one diagram, adjust your text to match. One complete diagram is better than three promised and one delivered.

#### Flowchart

For sequential processes, cause-and-effect, decision trees.

**Planning**: Size boxes to fit their text generously. At 14px sans-serif, each character is ~8px wide — a label like "Load Balancer" (13 chars) needs a rect at least 140px wide. When in doubt, make boxes wider and leave more space between them. Cramped diagrams are the most common failure mode.

**Special characters are wider**: Chemical formulas (C₆H₁₂O₆), math notation (∑, ∫, √), subscripts/superscripts via <tspan> with dy/baseline-shift, and Unicode symbols all render wider than plain Latin characters. For labels containing formulas or special notation, add 30-50% extra width to your estimate. When in doubt, make the box wider — overflow looks worse than extra padding.

**Spacing**: 60px minimum between boxes, 24px padding inside boxes, 12px between text and edges. Leave 10px gap between arrowheads and box edges. Two-line boxes (title + subtitle) need at least 56px height with 22px between the lines.

**Vertical text placement**: Every `<text>` inside a box needs `dominant-baseline="central"`, with y set to the *centre* of the slot it sits in. Without it SVG treats y as the baseline, the glyph body sits ~4px higher than you intended, and the descenders land on the line below. Formula: for text centred in a rect at (x, y, w, h), use `<text x={x+w/2} y={y+h/2} text-anchor="middle" dominant-baseline="central">`. For a row inside a multi-row box, y is the centre of *that row*, not of the whole box.

**Layout**: Prefer single-direction flows (all top-down or all left-right). Keep diagrams simple — max 4-5 nodes per diagram. The widget is narrow (~680px) so complex layouts break.

**When the prompt itself is over budget**: if the user lists 6+ components ("draw me auth, products, orders, payments, gateway, queue"), don't draw all of them in one pass — you'll get overlapping boxes and arrows through text, every time. Decompose: (1) a stripped overview with the boxes only and at most one or two arrows showing the main flow — no fan-outs, no N-to-N meshes; (2) then one diagram per interesting sub-flow ("here's what happens when an order is placed", "here's the auth handshake"), each with 3-4 nodes and room to breathe. Count the nouns before you draw. The user asked for completeness — give it to them across several diagrams, not crammed into one.

**Cycles don't get drawn as rings.** If the last stage feeds back into the first (Krebs cycle, event loop, GC mark-and-sweep, TCP retransmit), your instinct is to place the stages around a circle. Don't. Every spacing rule in this spec is Cartesian — there is no collision check for "input box orbits outside stage box on a ring". You will get satellite boxes overlapping the stages they feed, labels sitting on the dashed circle, and tangential arrows that point nowhere. The ring is decoration; the loop is conveyed by the return arrow.

Build a stepper in `imagine_html`. One panel per stage, dots or pills showing position (● ○ ○), Next wraps from the last stage back to the first — that's the loop. Each panel owns its inputs and products: an event loop's pending callbacks live *inside* the Poll panel, not floating next to a box on a ring. Nothing collides because nothing shares the canvas. Only fall back to a linear SVG (stages in a row, curved `<path>` return arrow) when there's one input and one output total and no per-stage detail to show.

**Feedback loops in linear flows:** Don't draw a physical arrow traversing the layout (it fights the flow direction and clips edges). Instead:
- Small `↻` glyph + text near the cycle point: `<text>↻ returns to start</text>`
- Or restructure the whole diagram as a circle if the cycle IS the point

**Arrows:** A line from A to B must not cross any other box or label. If the direct path crosses something, route around with an L-bend: `<path d="M x1 y1 L x1 ymid L x2 ymid L x2 y2"/>`. Place arrow labels in clear space, not on the midpoint.

Keep all nodes the same height when they have the same content type (e.g. all single-line boxes = 44px, all two-line boxes = 56px).

**Flowchart components** — use these patterns consistently:

*Single-line node* (44px tall): title only. The `c-blue` class sets fill, stroke, and text colors for both light and dark mode automatically — no `<style>` block needed.
```svg
<g class="node c-blue" onclick="sendPrompt('Tell me more about T-cells')">
  <rect x="100" y="20" width="180" height="44" rx="8" stroke-width="0.5"/>
  <text class="th" x="190" y="42" text-anchor="middle" dominant-baseline="central">T-cells</text>
</g>
```

*Two-line node* (56px tall): bold title + muted subtitle.
```svg
<g class="node c-blue" onclick="sendPrompt('Tell me more about dendritic cells')">
  <rect x="100" y="20" width="200" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="200" y="38" text-anchor="middle" dominant-baseline="central">Dendritic cells</text>
  <text class="ts" x="200" y="56" text-anchor="middle" dominant-baseline="central">Detect foreign antigens</text>
</g>
```

*Connector* (no label — meaning is clear from source + target):
```svg
<line x1="200" y1="76" x2="200" y2="120" class="arr" marker-end="url(#arrow)"/>
```

*Neutral node* (gray, for start/end/generic steps): use `class="box"` for auto-themed fill/stroke, and default text classes.

Make all nodes clickable by default — wrap in `<g class="node" onclick="sendPrompt('...')">`. The hover effect is built in.

#### Structural diagram

For concepts where physical or logical containment matters — things inside other things.

**When to use**: The explanation depends on *where* processes happen. Examples: how a cell works (organelles inside a cell), how a file system works (blocks inside inodes inside partitions), how a building's HVAC works (ducts inside floors inside a building), how a CPU cache hierarchy works (L1 inside core, L2 shared).

**Core idea**: Large rounded rects are containers. Smaller rects inside them are regions or sub-structures. Text labels describe what happens in each region. Arrows show flow between regions or from external inputs/outputs.

**Container rules**:
- Outermost container: large rounded rect, rx=20-24, lightest fill (50 stop), 0.5px stroke (600 stop). Label at top-left inside, 14px bold.
- Inner regions: medium rounded rects, rx=8-12, next shade fill (100-200 stop). Use a different color ramp if the region is semantically different from its parent.
- 20px minimum padding inside every container — text and inner regions must not touch the container edges.
- Max 2-3 nesting levels. Deeper nesting gets unreadable at 680px width.

**Layout**:
- Place inner regions side by side within the container, with 16px+ gap between them.
- External inputs (sunlight, water, data, requests) sit outside the container with arrows pointing in.
- External outputs sit outside with arrows pointing out.
- Keep external labels short — one word or a short phrase. Details go in the prose between diagrams.

**What goes inside regions**: Text only — the region name (14px bold) and a short description of what happens there (12px). Don't put flowchart-style boxes inside regions. Don't draw illustrations or icons inside.

**Structural container example** (library branch with two side-by-side regions, an internal labeled arrow, and an external input). ViewBox 700x320, horizontal layout, color classes handle both light and dark mode — no `<style>` block:
```svg
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>
<!-- Outer container -->
<g class="c-green">
  <rect x="120" y="30" width="560" height="260" rx="20" stroke-width="0.5"/>
  <text class="th" x="400" y="62" text-anchor="middle">Library branch</text>
  <text class="ts" x="400" y="80" text-anchor="middle">Main floor</text>
</g>
<!-- Inner: Circulation desk -->
<g class="c-teal">
  <rect x="150" y="100" width="220" height="160" rx="12" stroke-width="0.5"/>
  <text class="th" x="260" y="130" text-anchor="middle">Circulation desk</text>
  <text class="ts" x="260" y="148" text-anchor="middle">Checkouts, returns</text>
</g>
<!-- Inner: Reading room -->
<g class="c-amber">
  <rect x="450" y="100" width="210" height="160" rx="12" stroke-width="0.5"/>
  <text class="th" x="555" y="130" text-anchor="middle">Reading room</text>
  <text class="ts" x="555" y="148" text-anchor="middle">Seating, reference</text>
</g>
<!-- Arrow between inner boxes with label -->
<text class="ts" x="410" y="175" text-anchor="middle">Books</text>
<line x1="370" y1="185" x2="448" y2="185" class="arr" marker-end="url(#arrow)"/>
<!-- External input: New acq. — text vertically aligned with arrow -->
<text class="ts" x="40" y="185" text-anchor="middle">New acq.</text>
<line x1="75" y1="185" x2="118" y2="185" class="arr" marker-end="url(#arrow)"/>
```

**Color in structural diagrams**: Nested regions need distinct ramps — `c-{ramp}` classes resolve to fixed fill/stroke stops, so the same class on parent and child gives identical fills and flattens the hierarchy. Pick a *related* ramp for inner structures (e.g. Green for the library envelope, Teal for the circulation desk inside it) and a *contrasting* ramp for a region that does something functionally different (e.g. Amber for the reading room). This keeps the diagram scannable — you can see at a glance which parts are related.

**Database schemas / ERDs — use mermaid.js, not SVG.** A schema table is a header plus N field rows plus typed columns plus crow's-foot connectors. That is a text-layout problem and hand-placing it in SVG fails the same way every time. mermaid.js `erDiagram` does layout, cardinality, and connector routing for free. ERDs only; everything else stays in SVG.

```
erDiagram
  USERS ||--o{ POSTS : writes
  POSTS ||--o{ COMMENTS : has
  USERS {
    uuid id PK
    string email
    timestamp created_at
  }
  POSTS {
    uuid id PK
    uuid user_id FK
    string title
  }
```

Use `imagine_html` for ERDs. Import and initialize in a `<script type="module">`. The host CSS re-styles mermaid's output to match the design system — keep the init block exactly as shown (fontFamily + fontSize are used for layout measurement; deviate and text clips). The `colorScheme` probe reads the app's actual theme toggle — never use `matchMedia('(prefers-color-scheme: ...)')`, which tracks the OS instead. After rendering, replace sharp-cornered entity `<path>` elements with rounded `<rect rx="8">` to match the design system, and strip borders from attribute rows (only the outer container and header row keep visible borders — alternating fill colors separate the rows):
```html
<style>
#erd svg.erDiagram .divider path { stroke-opacity: 0.5; }
#erd svg.erDiagram .row-rect-odd path,
#erd svg.erDiagram .row-rect-odd rect,
#erd svg.erDiagram .row-rect-even path,
#erd svg.erDiagram .row-rect-even rect { stroke: none !important; }
</style>
<div id="erd"></div>
<script type="module">
import mermaid from 'https://esm.sh/mermaid@11/dist/mermaid.esm.min.mjs';
const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
await document.fonts.ready;
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  fontFamily: '"Anthropic Sans", sans-serif',
  themeVariables: {
    darkMode: dark,
    fontSize: '13px',
    fontFamily: '"Anthropic Sans", sans-serif',
    lineColor: dark ? '#9c9a92' : '#73726c',
    textColor: dark ? '#c2c0b6' : '#3d3d3a',
  },
});
const { svg } = await mermaid.render('erd-svg', `erDiagram
  USERS ||--o{ POSTS : writes
  POSTS ||--o{ COMMENTS : has`);
document.getElementById('erd').innerHTML = svg;

// Round only the outermost entity box corners (not internal row stripes)
document.querySelectorAll('#erd svg.erDiagram .node').forEach(node => {
  const firstPath = node.querySelector('path[d]');
  if (!firstPath) return;
  const d = firstPath.getAttribute('d');
  const nums = d.match(/-?[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 8) return;
  const xs = [nums[0], nums[2], nums[4], nums[6]];
  const ys = [nums[1], nums[3], nums[5], nums[7]];
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x); rect.setAttribute('y', y);
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  rect.setAttribute('rx', '8');
  for (const a of ['fill', 'stroke', 'stroke-width', 'class', 'style']) {
    if (firstPath.hasAttribute(a)) rect.setAttribute(a, firstPath.getAttribute(a));
  }
  firstPath.replaceWith(rect);
});

// Strip borders from attribute rows (mermaid v11: .row-rect-odd / .row-rect-even)
document.querySelectorAll('#erd svg.erDiagram .row-rect-odd path, #erd svg.erDiagram .row-rect-even path').forEach(p => {
  p.setAttribute('stroke', 'none');
});
</script>
```

Works identically for `classDiagram` — swap the diagram source; init stays the same.

#### Illustrative diagram

For building *intuition*. The subject might be physical (an engine, a lung) or completely abstract (attention, recursion, gradient descent) — what matters is that a spatial drawing conveys the mechanism better than labelled boxes would. These are the diagrams that make someone go "oh, *that's* what it's doing."

**Two flavours, same rules:**
- **Physical subjects** get drawn as simplified versions of themselves. Cross-sections, cutaways, schematics. A water heater is a tank with a burner underneath. A lung is a branching tree in a cavity. You're drawing *the thing*, stylised.
- **Abstract subjects** get drawn as *spatial metaphors*. You're inventing a shape for something that doesn't have one — but the shape should make the mechanism obvious. A transformer is a stack of horizontal slabs with a bright thread of attention connecting tokens across layers. A hash function is a funnel scattering items into a row of buckets. The call stack is literally a stack of frames growing and shrinking. Embeddings are dots clustering in space. The metaphor *is* the explanation.

This is the most ambitious diagram type and the one Claude is best at. Lean into it. Use colour for intensity (a hot attention weight glows amber, a cold one stays gray). Use repetition for scale (many small circles = many parameters).

**Prefer interactive over static.** A static cross-section is a good answer; a cross-section you can *operate* is a great one. The decision rule: if the real-world system has a control, give the diagram that control. A water heater has a thermostat — so give the user a slider that shifts the hot/cold boundary, a toggle that fires the burner and animates convection currents. An LLM has input tokens — let the user click one and watch the attention weights re-fan. A cache has a hit rate — let them drag it and watch latency change. Reach for `imagine_html` with inline SVG first; only fall back to static `imagine_svg` when there's genuinely nothing to twiddle.

**When NOT to use**: The user is asking for a *reference*, not an *intuition*. "What are the components of a transformer" wants labelled boxes — that's a structural diagram. "Walk me through our CI pipeline" wants sequential steps — that's a flowchart. Also skip this when the metaphor would be arbitrary rather than revealing: drawing "the cloud" as a cloud shape or "microservices" as little houses doesn't teach anything about how they work. If the drawing doesn't make the *mechanism* clearer, don't draw it.

**Fidelity ceiling**: These are schematics, not illustrations. Every shape should read at a glance. If a `<path>` needs more than ~6 segments to draw, simplify it. A tank is a rounded rect, not a Bézier portrait of a tank. A flame is three triangles, not a fire. Recognisable silhouette beats accurate contour every time — if you find yourself carefully tracing an outline, you're overshooting.

**Core principle**: Draw the mechanism, not a diagram *about* the mechanism. Spatial arrangement carries the meaning; labels annotate. A good illustrative diagram works with the labels removed.

**What changes from flowchart/structural rules**:

- **Shapes are freeform.** Use `<path>`, `<ellipse>`, `<circle>`, `<polygon>`, and curved lines to represent real forms. A water tank is a tall rect with rounded bottom. A heart valve is a pair of curved paths. A circuit trace is a thin polyline. You are not limited to rounded rects.
- **Layout follows the subject's geometry**, not a grid. If the thing is tall and narrow (a water heater, a thermometer), the diagram is tall and narrow. If it's wide and flat (a PCB, a geological cross-section), the diagram is wide. Let the subject dictate proportions within the 680px viewBox width.
- **Color encodes intensity**, not category. For physical subjects: warm ramps (amber, coral, red) = heat/energy/pressure, cool ramps (blue, teal) = cold/calm, gray = inert structure. For abstract subjects: warm = active/high-weight/attended-to, cool or gray = dormant/low-weight/ignored. A user should be able to glance at the diagram and see *where the action is* without reading a single label.
- **Layering and overlap are encouraged — for shapes.** Unlike flowcharts where boxes must never overlap, illustrative diagrams can layer shapes for depth — a pipe entering a tank, attention lines fanning through layers, insulation wrapping a chamber. Use z-ordering (later in source = on top) deliberately.
- **Text is the exception — never let a stroke cross it.** The overlap permission is for shapes only. Every label needs 8px of clear air between its baseline/cap-height and the nearest stroke. Don't solve this with a background rect — solve it by *placing the text somewhere else*. Labels go in the quiet regions: above the drawing, below it, in the margin with a leader line, or in the gap between two fans of lines. If there is no quiet region, the drawing is too dense — remove something or split into two diagrams.
- **Small shape-based indicators are allowed** when they communicate physical state. Triangles for flames. Circles for bubbles or particles. Wavy lines for steam or heat radiation. Parallel lines for vibration. These aren't decoration — they tell the user what's happening physically. Keep them simple: basic SVG primitives, not detailed illustrations.
- **One gradient per diagram** — keep diagrams disciplined even though gradients are generally allowed — and only to show a *continuous* physical property across a region (temperature stratification in a tank, pressure drop along a pipe, concentration in a solution). It must be a single `<linearGradient>` between exactly two stops from the same colour ramp. No radial gradients, no multi-stop fades, no gradient-as-aesthetic. If two stacked flat-fill rects communicate the same thing, do that instead.
- **Animation is permitted for interactive HTML versions.** Use CSS `@keyframes` animating only `transform` and `opacity`. Keep loops under ~2s, and wrap every animation in `@media (prefers-reduced-motion: no-preference)` so it's opt-out by default. Animations should show how the system *behaves* — convection current, rotation, flow — not just move for the sake of moving. No physics engines or heavy libraries.

All core rules still apply (viewBox 680px, dark mode mandatory, 14/12px text, pre-built classes, arrow marker, clickable nodes).

**Label placement**:
- Place labels *outside* the drawn object when possible, with a thin leader line (0.5px dashed, `var(--t)` stroke) pointing to the relevant part. This keeps the illustration uncluttered.
- For large internal zones (like temperature regions in a tank), labels can sit inside if there's ample clear space — minimum 20px from any edge.
- External labels sit in the margin area or above/below the object. **Pick one side for labels and put them all there** — at 680px wide you don't have room for a drawing *and* label columns on both sides. Reserve at least 140px of horizontal margin on the label side. Labels on the left are the ones that clip: `text-anchor="end"` extends leftward from x, and with multi-line callouts it's very easy to blow past x=0 without noticing. Default to right-side labels with `text-anchor="start"` unless the subject's geometry forces otherwise. Use `class="ts"` (12px) for callouts, `class="th"` (14px medium) for major component names.

**Composition approach**:
1. Start with the main object's silhouette — the largest shape, centered in the viewBox.
2. Add internal structure: chambers, pipes, membranes, mechanical parts.
3. Add external connections: pipes entering/exiting, arrows showing flow direction, labels for inputs and outputs.
4. Add state indicators last: color fills showing temperature/pressure/concentration, small animated elements showing movement or energy.
5. Leave generous whitespace around the object for labels — don't crowd annotations against the viewBox edges.

**Static vs interactive**: Static cutaways and cross-sections work best as pure `imagine_svg`. If the diagram benefits from controls — a slider that changes a temperature zone, buttons toggling between operating states, live readouts — use `imagine_html` with inline SVG for the drawing and HTML controls around it.

**Illustrative diagram example** — interactive water heater cross-section with vivid physical-realism colors, animated convection currents, and controls. Uses `imagine_html` with inline SVG: a thermostat slider shifts the hot/cold gradient boundary, a heating toggle animates flames on/off and transitions convection to paused. viewBox is 680x560; tank occupies x=180..440, leaving 140px+ of right margin for labels. Smooth convection paths use `stroke-dasharray:5 5` at ~1.6s for a gentle flow feel. A warm-glow overlay on the hot zone pulses subtly when heating is on. Flame shapes use warm gradient fills and clean opacity transitions. Labels sit along the right margin with leader lines.
```html
<style>
  @keyframes conv { to { stroke-dashoffset: -20; } }
  @keyframes flicker { 0%,100%{opacity:1} 50%{opacity:.82} }
  @keyframes glow { 0%,100%{opacity:.3} 50%{opacity:.6} }
  .conv { stroke-dasharray:5 5; animation: conv var(--dur,1.6s) linear infinite; transition: opacity .5s; }
  .conv.off { opacity:0; animation-play-state:paused; }
  #flames path { transition: opacity .5s; }
  #flames.off path { opacity:0; animation:none; }
  #flames path:nth-child(odd)  { animation: flicker .6s ease-in-out infinite; }
  #flames path:nth-child(even) { animation: flicker .8s ease-in-out infinite .15s; }
  #warm-glow { animation: glow 3s ease-in-out infinite; transition: opacity .5s; }
  #warm-glow.off { opacity:0; animation:none; }
  .toggle-track { position:relative;width:32px;height:18px;background:var(--color-border-secondary);border-radius:9px;transition:background .2s;display:inline-block; }
  .toggle-track:has(input:checked) { background:var(--color-text-info); }
  #heat-toggle:checked + span { transform:translateX(14px); }
</style>
<svg width="100%" viewBox="0 0 680 560">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
      <stop id="gh" offset="40%" stop-color="#E8593C" stop-opacity="0.45"/>
      <stop id="gc" offset="40%" stop-color="#3B8BD4" stop-opacity="0.4"/>
    </linearGradient>
    <linearGradient id="fg1" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#E85D24"/><stop offset="60%" stop-color="#F2A623"/><stop offset="100%" stop-color="#FCDE5A"/></linearGradient>
    <linearGradient id="fg2" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#D14520"/><stop offset="50%" stop-color="#EF8B2C"/><stop offset="100%" stop-color="#F9CB42"/></linearGradient>
    <linearGradient id="pipe-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#D05538" stop-opacity=".25"/><stop offset="100%" stop-color="#D05538" stop-opacity=".08"/></linearGradient>
    <linearGradient id="pipe-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3B8BD4" stop-opacity=".25"/><stop offset="100%" stop-color="#3B8BD4" stop-opacity=".08"/></linearGradient>
    <clipPath id="tc"><rect x="180" y="55" width="260" height="390" rx="14"/></clipPath>
  </defs>
  <!-- Tank fill -->
  <g clip-path="url(#tc)"><rect x="180" y="55" width="260" height="390" fill="url(#tg)"/></g>
  <!-- Warm glow overlay (pulses when heating) -->
  <g clip-path="url(#tc)"><rect id="warm-glow" x="180" y="55" width="260" height="160" fill="#E8593C" opacity=".3"/></g>
  <!-- Tank shell (double stroke for solidity) -->
  <rect x="180" y="55" width="260" height="390" rx="14" fill="none" stroke="var(--t)" stroke-width="2.5" opacity=".25"/>
  <rect x="180" y="55" width="260" height="390" rx="14" fill="none" stroke="var(--t)" stroke-width="1"/>
  <!-- Hot pipe out (top right) -->
  <rect x="370" y="14" width="16" height="50" rx="4" fill="url(#pipe-h)"/>
  <path d="M378 14V55" stroke="var(--t)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <!-- Cold pipe in + dip tube (top left) -->
  <rect x="234" y="14" width="16" height="50" rx="4" fill="url(#pipe-c)"/>
  <path d="M242 14V55" stroke="var(--t)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M242 55V395" stroke="var(--t)" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".5"/>
  <!-- Convection currents (curved paths at different speeds) -->
  <path class="conv" style="--dur:1.6s" fill="none" stroke="#D05538" stroke-width="1" opacity=".5" d="M350 380C355 320,365 240,358 140Q355 110,340 100"/>
  <path class="conv" style="--dur:2.1s" fill="none" stroke="#C04828" stroke-width=".8" opacity=".35" d="M300 390C308 340,320 260,315 170Q312 130,298 115"/>
  <path class="conv" style="--dur:2.6s" fill="none" stroke="#B05535" stroke-width=".7" opacity=".3" d="M380 370C382 310,388 230,382 150Q378 120,365 110"/>
  <!-- Burner bar -->
  <rect x="188" y="454" width="244" height="5" rx="2" fill="var(--t)" opacity=".6"/>
  <rect x="220" y="462" width="180" height="6" rx="3" fill="var(--t)" opacity=".3"/>
  <!-- Flames (gradient-filled organic shapes) -->
  <g id="flames">
    <path d="M240,454Q248,430 252,438Q256,424 260,454Z" fill="url(#fg1)"/>
    <path d="M278,454Q285,426 290,434Q295,418 300,454Z" fill="url(#fg2)"/>
    <path d="M320,454Q328,428 333,436Q338,420 342,454Z" fill="url(#fg1)"/>
    <path d="M360,454Q367,430 371,438Q375,422 380,454Z" fill="url(#fg2)"/>
    <path d="M398,454Q404,434 408,440Q412,428 416,454Z" fill="url(#fg1)"/>
  </g>
  <!-- Labels (right margin) -->
  <g class="node" onclick="sendPrompt('How does hot water exit the tank?')">
    <line class="leader" x1="386" y1="34" x2="468" y2="70"/><circle cx="386" cy="34" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="74">Hot water outlet</text></g>
  <g class="node" onclick="sendPrompt('How does the cold water inlet work?')">
    <line class="leader" x1="250" y1="34" x2="468" y2="140"/><circle cx="250" cy="34" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="144">Cold water inlet</text></g>
  <g class="node" onclick="sendPrompt('What does the dip tube do?')">
    <line class="leader" x1="250" y1="260" x2="468" y2="220"/><circle cx="250" cy="260" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="224">Dip tube</text></g>
  <g class="node" onclick="sendPrompt('What does the thermostat control?')">
    <line class="leader" x1="440" y1="250" x2="468" y2="300"/><circle cx="440" cy="250" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="304">Thermostat</text></g>
  <g class="node" onclick="sendPrompt('What material is the tank made of?')">
    <line class="leader" x1="440" y1="380" x2="468" y2="380"/><circle cx="440" cy="380" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="384">Tank wall</text></g>
  <g class="node" onclick="sendPrompt('How does the gas burner heat water?')">
    <line class="leader" x1="432" y1="454" x2="468" y2="454"/><circle cx="432" cy="454" r="2" fill="var(--t)"/>
    <text class="ts" x="474" y="458">Heating element</text></g>
</svg>
<div style="display:flex;align-items:center;gap:16px;margin:12px 0 0;font-size:13px;color:var(--color-text-secondary)">
  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
    <span class="toggle-track">
      <input type="checkbox" id="heat-toggle" checked onchange="toggleHeat(this.checked)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0">
      <span style="position:absolute;top:2px;left:2px;width:14px;height:14px;background:#fff;border-radius:50%;transition:transform .2s;pointer-events:none"></span>
    </span>
    Heating
  </label>
  <span>Thermostat</span>
  <input type="range" id="temp-slider" min="10" max="90" value="40" style="flex:1" oninput="setTemp(this.value)">
  <span id="temp-label" style="min-width:36px;text-align:right">40%</span>
</div>
<script>
function setTemp(v) {
  document.getElementById('gh').setAttribute('offset', v+'%');
  document.getElementById('gc').setAttribute('offset', v+'%');
  document.getElementById('temp-label').textContent = v+'%';
}
function toggleHeat(on) {
  document.getElementById('flames').classList.toggle('off', !on);
  document.getElementById('warm-glow').classList.toggle('off', !on);
  document.querySelectorAll('.conv').forEach(p => p.classList.toggle('off', !on));
}
</script>
```

**Illustrative example — abstract subject** (attention in a transformer). Same rules, no physical object. A row of tokens at the bottom, one query token highlighted, weight-scaled lines fanning to every other token. Caption sits below the fan — clear of every stroke — not inside it.
```svg
<rect class="c-purple" x="60" y="40"  width="560" height="26" rx="6" stroke-width="0.5"/>
<rect class="c-purple" x="60" y="80"  width="560" height="26" rx="6" stroke-width="0.5"/>
<rect class="c-purple" x="60" y="120" width="560" height="26" rx="6" stroke-width="0.5"/>
<text class="ts" x="72" y="57" >Layer 3</text>
<text class="ts" x="72" y="97" >Layer 2</text>
<text class="ts" x="72" y="137">Layer 1</text>

<line stroke="#EF9F27" stroke-linecap="round" x1="340" y1="230" x2="116" y2="146" stroke-width="1"   opacity="0.25"/>
<line stroke="#EF9F27" stroke-linecap="round" x1="340" y1="230" x2="228" y2="146" stroke-width="1.5" opacity="0.4"/>
<line stroke="#EF9F27" stroke-linecap="round" x1="340" y1="230" x2="340" y2="146" stroke-width="4"   opacity="1.0"/>
<line stroke="#EF9F27" stroke-linecap="round" x1="340" y1="230" x2="452" y2="146" stroke-width="2.5" opacity="0.7"/>
<line stroke="#EF9F27" stroke-linecap="round" x1="340" y1="230" x2="564" y2="146" stroke-width="1"   opacity="0.2"/>

<g class="node" onclick="sendPrompt('What do the attention weights mean?')">
  <rect class="c-gray"  x="80"  y="230" width="72" height="36" rx="6" stroke-width="0.5"/>
  <rect class="c-gray"  x="192" y="230" width="72" height="36" rx="6" stroke-width="0.5"/>
  <rect class="c-amber" x="304" y="230" width="72" height="36" rx="6" stroke-width="1"/>
  <rect class="c-gray"  x="416" y="230" width="72" height="36" rx="6" stroke-width="0.5"/>
  <rect class="c-gray"  x="528" y="230" width="72" height="36" rx="6" stroke-width="0.5"/>
  <text class="ts" x="116" y="252" text-anchor="middle">the</text>
  <text class="ts" x="228" y="252" text-anchor="middle">cat</text>
  <text class="th" x="340" y="252" text-anchor="middle">sat</text>
  <text class="ts" x="452" y="252" text-anchor="middle">on</text>
  <text class="ts" x="564" y="252" text-anchor="middle">the</text>
</g>

<text class="ts" x="340" y="300" text-anchor="middle">Line thickness = attention weight from "sat" to each token</text>
```

Note what's *not* here: no boxes labelled "multi-head attention", no arrows labelled "Q/K/V". Those belong in the structural diagram. This one is about the *feeling* of attention — one token looking at every other token with varying intensity.

These are starting points, not ceilings. For the water heater: add a thermostat slider, animate the convection current, toggle heating vs standby. For the attention diagram: let the user click any token to become the query, scrub through layers, animate the weights settling. The goal is always to *show* how the thing works, not just *label* it.
