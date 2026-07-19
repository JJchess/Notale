---
name: create-chart
description: Author a chart block for a LectureDoc lecture — a data chart (bar/line/area/scatter) rendered via Observable Plot, theme-aware. Use whenever a page needs to show numeric comparison, trend, share, or correlation instead of a plain table. Produces schema-valid chart block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
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
