---
name: create-sim
description: "Execute the shared final sim contract for LectureDoc after planning has selected create-state-sim, create-model-sim, or create-geometry-sim. Own dynamics1d/searchCompare/custom/widget engine generation, GenUI build/repair, offline safety, theme-token mapping, and final schema validation. This core is intentionally hidden from the planner so evidence profiles remain explicit."
license: MIT
metadata:
  version: 1.1.0
  platforms: [linux, macos, windows]
  hermes:
    tags: [Courseware, LectureDoc, Simulation, Canvas, Physics]
    related_skills: [lecture-doc-schema, generate-lecture, create-code-runtime]
---

# create-sim — shared simulation execution core

Read `lecture-doc-schema` first (SPEC §3.2 sim, §4 restricted expressions, §8 themes). Produce ONE sim block; self-check with `node <lecture-doc-schema>/scripts/validate.mjs --block <file>`.

## Profile contract

Receive the evidence decision from `create-state-sim`, `create-model-sim`, or `create-geometry-sim`; do not collapse the planner back to an undifferentiated sim choice. The runtime-owned vendored GenUI fragments are the single visual/interaction source of truth. Do not load or maintain a second guideline copy under this Skill.

## Decision contract — preserve the selected evidence

Claude-style custom visuals are generated for the specific question when a visual explains the idea better than prose, then remain directly manipulable: buttons, sliders, selections, and follow-up changes update the same visual state. Apply that principle to learning evidence:

**Sim is mandatory** when the learner must see any of these to meet the objective:
- an ordered state sequence or an intermediate state;
- a structure changing across an operation, including before/active/after states;
- a mechanism unfolding step by step, with the changed part visibly highlighted;
- one input causing a recomputed visual outcome;
- two or more conditions explored through the same synchronized model.

Do not wait for `learningAction=manipulate`. `trace`, `construct`, `predict`, or `compare` also require sim when their evidence is dynamic. Examples: AVL rotations, sorting passes, graph traversal frontier, parser stack evolution, protocol state changes, geometric construction, or a physical trajectory.

Use a static block when the evidence is a fixed relationship, one final structure, or a small set of snapshots that the learner does not need to control. Use `runnable` when success is editable code plus stdout/tests. If one page asks for both code authoring and a state sequence, narrow or split the objective rather than letting one capability impersonate the other.

## Interaction closure — a control alone is not a simulation

Every sim must close this loop:

`meaningful first paint → learner action → model recomputation → visible state change → interpretable evidence`

- Start one step in, never with a blank “click to begin” stage.
- Every control must change the underlying model, not merely a label or decoration.
- Keep previous/current or before/after state legible; highlight exactly what changed.
- For discrete processes provide appropriate `step`, `back/reset`, and optionally `play/pause`; keep replay deterministic.
- Put phase, invariant, comparison, or key readout on the stage so the learner can explain the consequence.
- Define reproducible verification cases for initial state, at least one transition, reset, and boundary input.
- If the same lesson is equally clear after taking a screenshot, the interaction has not earned its place.

## Engine priority — pick the LEAST powerful that fits (this is the anti-slop discipline)
1. **`dynamics1d` / `searchCompare`** (registry, declarative) — first choice.
2. **`custom`** — param-driven compute that returns line series, when the two registry engines can't express the model.
3. **`widget`** — discrete algorithm/state transitions, structure mutation, canvas/SVG animation, geometric construction, or direct manipulation in a sandbox iframe. It is the required engine when the evidence is visual state rather than a line series; “least powerful” must not mean “discard the required state sequence.”

## `dynamics1d` — 1-D iterated dynamics
```json
{ "type":"sim", "engine":"dynamics1d",
  "params":[{"name":"alpha","label":"学习率 α =","min":0,"max":2,"step":0.05,"default":0.9},
            {"name":"sigma","label":"噪声 σ =","min":0,"max":0.5,"step":0.01,"default":0.05}],
  "model":{ "stateVar":"c", "init":0.05, "steps":40, "update":"c + alpha*(T - c) + sigma*xi", "consts":{"T":1} },
  "regimes":[{"when":"alpha < 1","label":"收敛","desc":"...","tone":"ink"}],
  "chart":{"xLabel":"t","yLabel":"c(t)","targetLine":{"value":1,"label":"目标"}} }
```
- `update`/`regimes[].when`/`noiseNote.when` are **restricted expressions** (SPEC §4): identifiers limited to `params[].name` + `model.consts` keys + `stateVar` + noise `xi` + math fns (`sin cos tan exp log sqrt abs pow min max floor round`, `PI E`). No arbitrary JS.
- `regimes` pick the first true `when` → line tone (`line`/`accent`/`ink`) + dash + panel caption.

## `searchCompare` — 1-D black-box optimization, three strategies
```json
{ "type":"sim", "engine":"searchCompare",
  "params":[{"name":"n","label":"预算 n =","min":5,"max":30,"step":1,"default":12,"decimals":0}],
  "model":{ "objective":"sin(x) + sin(10*x/3)", "domain":[2.7,7.5], "yDomain":[-2.4,2.2],
            "strategies":["grid","random","bayes"], "budgetParam":"n" },
  "labels":{"grid":"网格","random":"随机","bayes":"贝叶斯"} }
```
- `objective` restricted expr (var only `x`). `budgetParam` must be one of `params`. Bayes = GP+LCB, built in.

## `custom` — sandboxed compute (line series)
```json
{ "type":"sim", "engine":"custom",
  "params":[{"name":"k","label":"k =","min":0,"max":5,"step":0.1,"default":2}],
  "computeJs":"(params, rng) => ({ series:[{ points:[{x:0,y:0},{x:1,y:params.k}], tone:'ink' }], note:'...' })",
  "chart":{"xLabel":"x","yLabel":"y","xDomain":[0,1]} }
```
- `computeJs` = an expression evaluating to `(params, rng) => { series:[{points:[{x,y}], dash?, tone?}], note? }`. Runs as an AsyncFunction with **no DOM/network** passed in. Output is line series only.

## `widget` — canvas/SVG animation in a sandbox iframe (逃生舱, last resort)
```json
{ "type":"sim", "engine":"widget",
  "caption":"点「采点」看置信带收缩",
  "html":"<style>…</style><canvas id=cv></canvas><script>…读 getComputedStyle 的 --token 上色，requestAnimationFrame 画…</script>" }
```
**Contract & safety (SPEC §3.2 widget):**
- `html` is a **self-contained fragment** (`<style>`→markup→`<script>`; controls live inside). **No** `<!doctype>/<html>/<head>/<body>`; must contain at least one of `<div>/<svg>/<canvas>/<style>`. Runtime wraps it in `<iframe sandbox="allow-scripts">` (null origin — true isolation).
- **Offline law → zero-dependency vanilla only** (canvas/SVG + native JS). The null-origin iframe cannot load `vendor/`, fonts, or any network/CDN resource. No Chart.js, no CDN.
- **Theme integration without aesthetic collapse:** anchor root surface, main ink, muted text, and ordinary lines to host tokens. Preserve the selected GenUI `aesthetic_direction`, its matching example, `signature_detail`, and distinct semantic accents. Declare direction/state colors as scoped custom properties on the widget root; never collapse completed/current/pending or multiple series into one `--accent`.
- **Anti-slop lint (validator will warn):** interactive widget must have motion (`requestAnimationFrame`/`transition`/`animation`); no self-introducing `<h1>`; no "提示:/Tip:" instruction pill; no `@media (prefers-color-scheme)` (use tokens); don't copy the stock color `#4fc3f7`; don't pair a fixed dark hex background with `var(--)`/currentColor text.
- **Generation subrecipe (implemented, SPEC §7.1):** when the skeleton marks a sim placeholder `"engine":"widget"`, the orchestrator routes it to `domain/generation/widget.py::generate_widget`. The complete reusable GenUI core is vendored source-identically under `domain/generation/generative_ui/` (`bundler`, aesthetic directions, planning/build/repair prompts, validators, modular fragments, and one high-craft example per direction). Only the outer host adapter is Lecture-specific: LLM port invocation, two-part response parsing, `sim.widget` assembly, fixed-height iframe rules, offline enforcement, and scoped role integration with the deck theme. The adapter must never rewrite the selected direction to `host-calm` or post-process distinct palette roles into one accent. Do not fork or trim the vendored core in this skill.
- The outer loop remains **plan→build→repair**: ① require a GenUI structural contract plus `visible_encodings`, `comparison_states`, `math_model`, and reproducible `verification_cases`; ② build against the full matching GenUI bundle/example; ③ run both GenUI payload/aesthetic validation and LectureDoc schema validation; ④ feed all errors back for repair. Contract failure is a hard error. Mathematical coordinate transforms, arrow direction and plotted variables must come from pure functions exercised by `console.assert`; a “compare” objective must show all comparison states in the initial frame.

## Rule
`params`: 1–4 sliders `{name(identifier), label, min, max, step, default, decimals?}` (widget doesn't use params — controls are inside its html). Keep captions/legends terse (SPEC §5); teaching detail → scene `notes`.
