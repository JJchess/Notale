---
name: create-code-runtime
description: "Author a runnable (edit → Run) code cell block for a LectureDoc lecture — an in-browser Python (Pyodide) + JavaScript editor with a console and a result chart. Reach for it whenever the student should learn by writing/modifying and actually executing code themselves: implementing an algorithm by hand, tuning parameters and seeing the effect, exploratory what-if coding. Use a plain `code` block instead for read-only display the student will not run. Produces schema-valid runnable block JSON."
license: MIT
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Runnable, Pyodide, CodeRuntime]
    related_skills: [lecture-doc-schema, generate-lecture, create-sim]
---

# create-code-runtime — the runnable (edit→Run) block

Read `lecture-doc-schema` first (SPEC §3.2 runnable, §4 restricted expressions). This is the editable code cell: CodeMirror editor + language tabs + Run + stdout console + result plot, Python via offline Pyodide, JS native. Produce ONE runnable block; self-check with `node <lecture-doc-schema>/scripts/validate.mjs --block <file>`.

## Multiple runnables per deck
A lecture can contain **more than one** runnable block — each gets its own editor/portal/Python namespace at render time (see knowledge-base 001: the CodeMirror-in-`transform:scale` workaround now supports N instances, one shared Pyodide interpreter + per-block namespace isolation). Prefer **at most one runnable per slide** (layout — the dedicated full-bleed treatment triggers when it's the sole block on its scene). Use it whenever the student genuinely needs to edit-and-run — don't avoid it because it "feels heavy"; also don't reach for it where a static `code` block (create-content) or a live non-editable `sim` (create-sim) already fits better.

## Shape
```json
{
  "type": "runnable",
  "languages": ["python", "js"],
  "starter": {
    "python": "kappa = 2.0\n# 编辑采集函数 / 预算 / 选点循环，把结果点赋给 result\nresult = [{'x': x, 'y': truef(x)} for x in candidates[:8]]",
    "js": "let kappa = 2.0;\nresult = candidates.slice(0,8).map(x => ({x, y: truef(x)}));"
  },
  "env": {
    "kind": "objective1d",
    "objective": "sin(x) + sin(10*x/3)",
    "domain": [2.7, 7.5]
  }
}
```

## Fields & contract
- `languages`: subset of `["python","js"]` (offer both when equivalent starter code is natural).
- `starter.{python,js}`: initial code per offered language. **Convention: assign the final result to `result`** = a point array `[{x,y}]` → the runtime auto-plots it. Keep starters short, readable, and genuinely editable (the interesting knob — acquisition fn / kappa / budget / loop — is what the student changes).
- `env.kind:"objective1d"`: runtime injects equivalent helpers into BOTH languages from the `objective` (a **restricted expression**, var only `x`, see SPEC §4) + `domain`: `truef(x)`, `candidates` (uniform samples over domain), `predict(observed, x)` → `[mu, sd]` (nearest-neighbor surrogate).
- `env.kind:"custom"`: `pythonPreamble` (literal Python source) and/or `jsPreamble` (a JS expression returning a helper object) — at least one required. Use only when objective1d can't express the setup.

## Rules
- Prefer nothing heavier than pure Python (no numpy/matplotlib — Pyodide core only). Put helper machinery in the preamble/env; the student edits the short, conceptual part.
- Keep each visible `starter` within 60 lines and roughly 2400 characters. Put data fixtures, test harnesses, tree builders, plotting adapters, and other scaffolding in `env.pythonPreamble` / `env.jsPreamble`; the editor should expose only the algorithmic decision the learner is meant to change.
- **The preamble is scaffolding, not a concept vault.** If the scene objective says implement/write/complete/debug an algorithm, the visible `starter` must contain that algorithm's core branch, recurrence, update rule, invariant check, or deliberately incomplete function. Never put the finished target implementation in the preamble and leave only an input list or parameter knob in the editor. For an AVL lesson, `Node` fixtures and a tree printer may be preamble; `insert`, balance-case selection, and rotations belong in the visible starter (or the objective must honestly say “run/inspect,” not “implement”).
- Start the editor at the first meaningful edit, not with a screen of imports, comments, or completed reference implementation. A runnable is an activity stage, not a code appendix.
- Treat the runnable as the complete learner-response loop when the page asks for a prediction, judgment, implementation, or debug decision: expose the choice as editable input or an incomplete branch, run fixed cases, and print visible pass/fail assertions with the observed result. Do not add a separate full quiz beside the runnable; it creates a competing interaction surface and compresses both below presentation legibility.
- Prefer `env.output:"console"` when the evidence is test output, invariants, traversal order, or debugging. Do not reserve a blank result chart for non-quantitative programs.
- No "点 Run 查看结果" onboarding copy on-slide (SPEC §5); the UI is self-evident. Teaching detail → scene `notes`.
- The `objective` expression must pass the SPEC §4 whitelist (identifiers = `x` + math fns; no arbitrary JS). If you need real programming, that's what this block already is — don't smuggle it into a sim expression.
