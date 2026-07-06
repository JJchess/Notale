---
name: create-freeform
description: Author a freeform block for a LectureDoc lecture — the sanctioned escape hatch for layouts/content shapes that none of the 15 formal block types can express. Rare, always rendered visibly (dashed frame + warning label + rationale). Produces schema-valid freeform block JSON. Prefer grid/sim.custom/sim.widget first.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Freeform, EscapeHatch]
    related_skills: [lecture-doc-schema, create-content, create-sim, evolve-schema]
---

# create-freeform — the escape hatch (use rarely)

Read `lecture-doc-schema` first (SPEC §3.3). `freeform` is the last resort when a **layout/content shape** isn't in the 15 formal types AND `grid` / `sim.custom` / `sim.widget` also don't fit. Before using it, confirm those don't work — the rationale must say specifically why.

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
It always renders with a dashed frame + `⚠ 未分类内容` label + the `rationale` shown beneath — it will NOT blend into normal layout. That friction is intentional: it keeps freeform a rare exit, and its `rationale` becomes a signal for `evolve-schema` (recurring same-shape rationales → propose a new formal block type). `rationale` ≥ 10 chars, specific — "需要自定义排版" is rejected.

Self-check: `node <lecture-doc-schema>/scripts/validate.mjs --block <file>` — fix any path-tagged error/warning.
