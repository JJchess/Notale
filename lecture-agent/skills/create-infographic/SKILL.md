---
name: create-infographic
description: Author stats (KPI number cards) and diagram (structural shapes — cycle/pyramid/staircase/snake/arrow-seq/circular-grid/connected-circles) blocks for a LectureDoc lecture. Reach for stats to spotlight a handful of standalone key numbers the audience should remember; reach for diagram to show a non-linear or specially-shaped relationship — a cycle, hierarchy, progression, or network — that a plain flow/timeline/chart cannot capture. Use flow instead for a simple linear 2-3 step sequence. Produces schema-valid stats/diagram block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Infographic, Diagram, Stats]
    related_skills: [lecture-doc-schema, generate-lecture, create-chart]
---

# create-infographic — stats cards & diagram shapes

## `stats` — KPI number cards
```json
{ "type":"stats", "items":[
  {"value":"92%", "label":"完成率", "delta":"+8pp"},
  {"value":"1.2万", "label":"活跃用户"}
] }
```
2-6 items. `value` is the big number/percentage to spotlight (string, no unit conversion done for you — write it exactly as it should render). `label` says what the number is. `delta` is optional (YoY/QoQ change). **If the data has a trend or distribution across categories, that's a `chart`, not `stats`** — stats is for a handful of standalone numbers you want to spotlight, not for anything with an x-axis.

## `diagram` — sequence/relationship shapes
```json
{ "type":"diagram", "diagramType":"pyramid", "nodes":[
  {"title":"基础", "sub":"..."},
  {"title":"进阶"},
  {"title":"精通"}
] }
```
2-8 nodes, each with a required `title` and optional one-line `sub`.

**Pick the one `diagramType` that actually matches the relationship — this is the anti-slop discipline (same spirit as `create-sim`'s engine priority and `create-chart`'s chartType rules):**

| diagramType | Use when | Don't use for |
|---|---|---|
| `cycle` | Stages that loop back to the start, no true endpoint (PDCA, seasonal cycles, retro loops) | A one-time linear process |
| `pyramid` | Top-down priority or containment (Maslow's hierarchy, org levels, foundational→advanced skills), typically 3-5 layers | Anything with no "level" structure |
| `staircase` | Clear forward progression where each step is strictly "further along" (maturity models, difficulty ramps) — not circular, not containment | Loops (use cycle) or hierarchies (use pyramid) |
| `snake` | A longer linear sequence (6+ steps) that needs to wrap across rows to fit the page | Short sequences (use arrow-seq or plain `flow`) |
| `arrow-seq` | A short (2-5 step) linear flow where you want bolder arrow/block visuals than the plain `flow` block gives | Anything `flow` already handles fine — don't duplicate |
| `circular-grid` | A set of equally-important items all orbiting one central theme, no order, no loop semantics | Sequential or hierarchical data |
| `connected-circles` | Cross-connections between nodes (stakeholder maps, concept networks) rather than a single path | A simple chain (that's arrow-seq/staircase/snake) |

**Don't use `diagram` for quantitative comparison/trend data** (that's `chart`'s job), **and don't reach for it for a trivial 2-3 step flow with no special emphasis need** — the existing `flow` block already covers that; adding a new type just to use it is not a reason.
