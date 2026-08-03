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
