---
name: create-sim
description: Author a sim (simulation) block for a LectureDoc lecture — a parameter-driven interactive that recomputes and redraws in-browser as the student changes inputs. Reach for it whenever a quantitative or mechanistic process becomes clearer by letting the student turn a knob and watch the outcome change (physics/chem dynamics, algorithm behaviour, parameter sensitivity); pick a sim over a static chart when the interaction itself is the teaching point. Engines are chosen at build time: dynamics1d/searchCompare (declarative restricted-expression math → line charts), custom (sandboxed compute), widget (live canvas/SVG animation, geometric construction, or arbitrary mouse interaction). Not for non-quantitative humanities/history/opinion topics. Produces schema-valid sim block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Simulation, Canvas, Physics]
    related_skills: [lecture-doc-schema, generate-lecture, create-code-runtime]
---

# create-sim — simulation blocks

Read `lecture-doc-schema` first (SPEC §3.2 sim, §4 restricted expressions, §8 themes). Produce ONE sim block; self-check with `node <lecture-doc-schema>/scripts/validate.mjs --block <file>`.

## Engine priority — pick the LEAST powerful that fits (this is the anti-slop discipline)
1. **`dynamics1d` / `searchCompare`** (registry, declarative) — first choice.
2. **`custom`** — param-driven compute that returns line series, when the two registry engines can't express the model.
3. **`widget`** — canvas/SVG animation, particles, geometric construction, arbitrary interaction, in a sandbox iframe. **Last resort**, only when you genuinely need live animation / non-line visuals.

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
- **Theme consistency:** read colors from tokens — `getComputedStyle(document.documentElement).getPropertyValue('--ink'|'--accent'|'--line'|'--bg')`. Never hardcode hex.
- **Anti-slop lint (validator will warn):** interactive widget must have motion (`requestAnimationFrame`/`transition`/`animation`); no self-introducing `<h1>`; no "提示:/Tip:" instruction pill; no `@media (prefers-color-scheme)` (use tokens); don't copy the stock color `#4fc3f7`; don't pair a fixed dark hex background with `var(--)`/currentColor text.
- **Generation subrecipe (implemented, SPEC §7.1, borrowed from GenUI):** when the skeleton marks a sim placeholder `"engine":"widget"`, the orchestrator routes it to `domain/generation/widget.py::generate_widget` — a two-stage **plan→build→repair** loop: ① emit a structural contract (`render_medium` canvas|svg, `state_model` named vars, `interactions` trigger→effect, single `update()` redraw entry, mid-action `initial_paint`), ② build the fragment against that contract + the craft guidelines, ③ validate via `validate_block`, ④ feed path-tagged errors back ≤3 rounds. The trimmed craft library lives in `guidelines/{craft-core,interactive,registers,example.html}` (loaded by `load_widget_guidelines`). Aesthetic is **pinned to the deck theme** via injected `--token`s (not GenUI's per-widget direction menu) — see `guidelines/registers.md`.

## Rule
`params`: 1–4 sliders `{name(identifier), label, min, max, step, default, decimals?}` (widget doesn't use params — controls are inside its html). Keep captions/legends terse (SPEC §5); teaching detail → scene `notes`.
