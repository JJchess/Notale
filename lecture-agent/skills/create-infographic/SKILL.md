---
name: create-infographic
description: Author stats (KPI number cards), diagram (fixed structural shapes — cycle/pyramid/staircase/snake/arrow-seq/circular-grid/connected-circles) and graph (true node-edge trees, DAGs and branching flowcharts, rendered as real layered SVG) blocks for a LectureDoc lecture. Reach for stats to spotlight a handful of standalone key numbers; reach for graph whenever nodes have *named relationships* — parent/child, dependency, branch, merge — since it is the only block type with an edges field; reach for diagram only for a fixed decorative shape with no explicit edges. Use flow for a simple linear 2-3 step sequence. Produces schema-valid stats/diagram/graph block JSON.
affordances: [spatial-structure, node-edge-relations, hierarchy, fixed-state]
learner-actions: [inspect, trace, compare]
evidence-outputs: [named-relations, topology, fixed-structure]
limitations: [single state, no learner manipulation, no code execution]
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

`stats` is not permission to manufacture specificity. A real-world percentage, count, quotation-like number, or paper result must come from supplied material. Without a source, replace it with a qualitative claim or clearly label it as a toy/illustrative value; never output authoritative-looking “>90% / <10%” cards from general memory.

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

Decorative topology is not mathematical geometry. `connected-circles`, `snake`, and the other fixed shapes do not have a coordinate system and cannot prove direction, distance, slope, curvature, trajectory, or convergence. If the page brief asks the learner to *see* any of those, return to the orchestrator's chart/sim choice instead of approximating the idea with labeled shapes.

## `graph` — 带边的树 / DAG / 分支流程

```json
{ "type":"graph", "graphType":"tree", "orientation":"vertical",
  "nodes":[
    {"id":"root","title":"二叉搜索树","sub":"BST"},
    {"id":"l","title":"左子树","sub":"全部 < 根"},
    {"id":"r","title":"右子树","sub":"全部 > 根"}
  ],
  "edges":[
    {"from":"root","to":"l","label":"左"},
    {"from":"root","to":"r","label":"右"}
  ],
  "caption":"BST 的定义性质：中序遍历即有序序列" }
```

**这是唯一带 `edges` 的块类型。** 只要节点之间存在具名关系（父子、依赖、分支、汇聚），
就用 `graph`，不要拿 `diagram`/`flow` 硬凑——那两个没有边字段：`flow` 只能表达一条线性链，
`diagram` 只能表达一圈环或一种固定形状。一棵带父子关系的树在它们里**根本表达不出来**，
硬塞的结果就是「叠盘子」和指向空白的箭头。

| graphType | 用于 | 约束 |
|---|---|---|
| `tree` | 二叉树、目录树、分类体系、组织架构、语法树 | 每节点至多一父、恰好一根 |
| `dag` | 依赖关系、数据流水线、状态演化、知识点前置图 | 允许多父/汇聚，不许环 |
| `flowchart` | 带判定的分支流程 | 判定节点 `shape:"diamond"`，分支边用 `label` 标「是」「否」；唯一允许回边，且回边必须 `style:"dashed"` |

硬规则（校验器会拦）：
1. `node.id` 同块内唯一；`edges` 的 `from`/`to` 必须引用已存在的 id——断边直接报错。
2. 每个节点至少连一条边，别留孤立节点。
3. `tree` 不许多父、不许多根；真需要多父就改 `dag`。
4. 节点 `title` 要短（一般 ≤10 字），长解释放 `sub`；节点多于 8 个时优先 `orientation:"horizontal"` 或拆两页。

渲染细节：SVG 画边（自动分层 + 重心法减少交叉 + 正交折线 + 箭头），节点是继承主题排版的 HTML
盒子，整图按 viewBox 等比缩放。节点宽度由 canvas `measureText` 实测文字得出——不依赖 DOM 布局，
所以在 reveal 的隐藏页里也能算准。

何时**不**用 `graph`：纯线性 2-5 步流程用 `flow` 或 `diagram:arrow-seq`；纯数据走势用 `chart`；
时间轴用 `timeline`。
