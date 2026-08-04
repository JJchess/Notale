---
name: create-freeform
description: Author a freeform block for a LectureDoc lecture — the long-tail fallback for a visual relationship that none of the formal block types can express, drawn as inline SVG/HTML restricted to theme colour tokens. Reach for it only after checking the structured types: graph covers trees, DAGs and branching flowcharts; chart covers data; diagram covers fixed shapes; grid and sim.widget cover custom layouts and interactive pieces. When it genuinely is the right tool it now renders as normal page content, so use it without hedging. Produces schema-valid freeform block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Freeform, EscapeHatch]
    related_skills: [lecture-doc-schema, create-content, create-sim, evolve-schema]
---

# create-freeform — the escape hatch (use rarely)

Read `lecture-doc-schema` first (SPEC §3.3). `freeform` is the long-tail fallback for a **layout/content shape** that isn't in the formal types AND that `graph` / `grid` / `sim.custom` / `sim.widget` also can't express. Before using it, confirm those don't work — the rationale must say specifically why.

**Check `graph` first for anything with edges.** Trees, DAGs, branching flowcharts and dependency
diagrams are now first-class blocks (`create-diagram`), rendered as real layered SVG with
computed edge routing. Hand-drawing one of those in freeform is strictly worse: you'd be laying out
node coordinates by hand with no re-layout when the text changes.

## Shape
```json
{ "type": "freeform",
  "rationale": "需要「带缩略图 + 绝对定位标注」的时间轴拼贴，agenda/table/grid 都排不出这种图文定位关系（≥10 字，要具体）",
  "html": "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:var(--gap,16px)\">…</div>" }
```

## Two gates (both enforced; know them so your output survives)
- **Static (validate.mjs):** rejects `<script>/<style>/<iframe>/<object>/<embed>`, inline event handlers, `javascript:`, remote `<img>`; and in `style=` attributes, `color/background/border/fill/stroke/font-family/box-shadow` must be `var(--token)` or `currentColor`/`transparent`/`none` — **bare colors/fonts are rejected**. Also runs the anti-slop lint (no `<h1>`, no "提示:", etc.).
- **Runtime (sanitizeFreeformHtml):** whitelist tag/attr/style scrub (defense in depth).

## What you CAN use (自由在布局，不在裸视觉)
- Structural/text tags, `<img>` (local only: `vendor/`/`assets/`/`data:image/`), `<svg>` (path/rect/circle/line/g/text/polyline/polygon), `<a>` (sanitized href).
- **Layout `style`**: grid/flex/gap/sizes/`position:relative|absolute`/transform/text-align/aspect-ratio/border-radius/font-size…
- **Colors/fonts only via `var(--token)`** — so freeform still stays inside the chosen theme.

## Contract you cannot change
`rationale` is required, ≥ 10 chars, and must be specific — "需要自定义排版" is rejected. It renders as
a small footnote under the block and, more importantly, feeds `evolve-schema`: recurring same-shape
rationales are the signal to propose a new formal block type (that's exactly how `graph` came to exist).

Note this used to say freeform "always renders with a dashed frame + `⚠ 未分类内容` label" as
deliberate friction. That was removed: for a visual relationship the schema never modelled, freeform
is the *correct* tool, and branding it as defective merely pushed models toward a worse structured
approximation. Colours/fonts are still confined to `var(--token)`, so it cannot break theme coherence
— which was the only part of that friction actually doing useful work.

Self-check: `node <lecture-doc-schema>/scripts/validate.mjs --block <file>` — fix any path-tagged error/warning.
