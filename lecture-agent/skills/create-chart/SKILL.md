---
name: create-chart
description: Author a chart block for a LectureDoc lecture — a data chart (bar/line/area/scatter) rendered via Observable Plot, theme-aware. Reach for it whenever a page shows numeric comparison, trend over time, share/composition, or correlation — anything where seeing the shape of the numbers beats reading them. Prefer a chart over a table when magnitude/trend/relationship is the point; use a table only for exact nominal lookup where values are not being compared. Produces schema-valid chart block JSON.
license: MIT
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Chart, DataViz]
    related_skills: [lecture-doc-schema, generate-lecture, create-sim]
---

# create-chart — data chart blocks

Produce ONE chart block. Four `chartType`s, pick the **one that matches what the data is actually saying** — this is the anti-slop discipline (same spirit as `create-sim`'s engine priority).

## `bar` — single-series categorical comparison
```json
{ "type":"chart", "chartType":"bar",
  "categories":["2021","2022","2023"],
  "series":[{"name":"营收","values":[12,18,25]}],
  "xLabel":"年份","yLabel":"亿元" }
```
Only the first `series` renders as bars. Need to compare more than one series side by side? Use `line` or `area` instead — don't expect grouped/stacked bars.

## `line` — trend(s) over categories/time
```json
{ "type":"chart", "chartType":"line",
  "categories":["Q1","Q2","Q3","Q4"],
  "series":[{"name":"A国","values":[1.2,1.5,1.4,1.8]},{"name":"B国","values":[0.9,1.0,1.3,1.6]}],
  "xLabel":"季度","yLabel":"增长率 %" }
```
Supports multiple series overlaid (multi-line comparison) — the natural fit for "compare how several things evolve".

## `area` — cumulative / share over categories
```json
{ "type":"chart", "chartType":"area",
  "categories":["2020","2021","2022"],
  "series":[{"name":"份额","values":[0.3,0.45,0.6]}],
  "yLabel":"占比" }
```
Same shape as `line`; pick `area` when the visual weight of "how much" matters more than the exact trajectory.

## `scatter` — correlation between two numeric variables
```json
{ "type":"chart", "chartType":"scatter",
  "points":[{"x":1,"y":2.3},{"x":2,"y":3.1},{"x":3,"y":2.8,"label":"异常点"}],
  "xLabel":"投入","yLabel":"产出" }
```
`points`, not `categories`/`series`. Needs ≥2 points.

## Rule
`categories.length` must equal every `series[].values.length` (bar/line/area) — mismatched lengths are rejected by schema. **When the data has no numeric comparison to make — a glossary, a step list, a pairing of terms — use `table`, not `chart`.** Chart is for "there's a number, and its size/trend/correlation is the point."

Before emitting JSON, audit the chart as evidence, not decoration:

1. Every value must be traceable to supplied material, directly reproducible from a formula shown in the lecture, or explicitly described in `caption` as illustrative/synthetic. Never invent a paper/year, benchmark result, percentage, or measured series.
2. Recompute formula-derived points, endpoints, and schedules. The caption, axis labels, categories, and values must describe the same function (for example, a “5→50 cosine schedule” must actually start at 5 and end at 50 in the stated direction).
3. Choose domains and sampling points that reveal the page brief's `visualTask`; do not waste most of the plot area or make the decisive labels unreadably small.
4. A coordinate, trajectory, gradient, boundary, or loss surface is quantitative geometry: encode it with scatter/line/series (or a sim when interaction matters), never substitute a decorative diagram.
5. Use optional `annotations` for a few pedagogical points/segments/arrows; never fake a point or tangent by adding a mostly-zero line series. Scatter annotations use numeric coordinates, e.g. `{"kind":"point","x":1.5,"y":2.25,"label":"当前点","tone":"accent"}` or `{"kind":"arrow","x":1.5,"y":2.25,"x2":0.5,"y2":0.25,"label":"更新"}`. Category charts use category strings that already exist in `categories`. `line`/`arrow` require `x2` and `y2`.
6. Plot the quantity the page claims to explain. For a learning-rate schedule, plot $\eta_t$ versus step. Do not invent downstream loss/accuracy curves and present them as if the schedule formula determined those values.
7. Budget the visible labels. Keep at most six point/annotation labels and label only endpoints, thresholds, anomalies, or the exact comparison needed for the claim. Do not copy every row's prose into the plot.
8. Keep `caption` to source/measurement basis plus one interpretive sentence (at most 240 characters). Put calculation tasks, multi-step instructions, and extended interpretation in scene notes or a sibling block.
9. Make the chart self-reading: units belong on axes, categories stay short, and a series name identifies the measure rather than repeating the page title. If labels need paragraphs, the page needs a table or a split, not smaller chart type.

## Visual craft translated from GenUI chart guidance

Keep the structured Observable Plot block as the rendering interface; do not emit HTML, Chart.js, CDN dependencies, ornamental dashboards, or fake controls. Establish one dominant quantitative question, make axis labels and units explicit, keep series names short and distinguishable, and use annotations only for the few values that complete the teaching argument. Prefer direct visual comparison over legends that force memory, but never overload the plot with labels. A chart must remain legible as a fixed lecture frame; if changing a parameter is necessary to reveal the claim, route to `create-model-sim` instead.

If `viewport` is present, it is the immutable Plot container, not a suggestion. The renderer must use the container's measured width and height (and redraw through `ResizeObserver`) rather than a fixed 744×418 canvas. Reduce annotation count and choose margins appropriate to the available height; never introduce scrolling, clipping, or sub-14px text to preserve a crowded chart.
