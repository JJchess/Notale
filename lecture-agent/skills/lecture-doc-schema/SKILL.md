---
name: lecture-doc-schema
description: The shared contract for generating a LectureDoc (new-generation interactive courseware / "PPT"). Read this before authoring any lecture or block. Holds the JSON schema, the SPEC, and deterministic validation/assembly/verify scripts. Planning skills such as create-state-sim, create-model-sim, create-geometry-sim, and create-diagram lower to the final block types defined here.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Schema, Contract, Reference]
    related_skills: [generate-lecture, create-sim, create-code-runtime, create-quiz, create-content, create-freeform, evolve-schema]
---

# LectureDoc v1 — shared contract

A **LectureDoc** is one JSON document that a reveal.js runtime (`doc-to-deck.js`) renders into an interactive lecture deck (rich text, KaTeX formulas, in-browser simulations, an editable code runtime, quizzes, an AI tutor). It is web-native, offline-first, and **data-driven**: the agent only ever produces JSON — never HTML/CSS/renderer code. "Schema is the interface."

This skill is the single source of truth every lecture-generation skill reads.

## Files (load via skill_view)

- `references/lecture-doc.schema.json` — the formal JSON Schema (draft 2020-12). The authoritative field list.
- `references/SPEC.md` — the human/agent spec: every block type's semantics + fields + examples, the **authoring rules** (§5, hard constraints learned from real user feedback), the **restricted-expression** rules for sims (§4), and the **theme selection guide** (§8). **Read SPEC.md before generating.**
- `templates/skeleton.json` — a minimal LectureDoc skeleton to start from.
- `scripts/validate.mjs` — validator. `scripts/assemble.mjs` — skeleton+fragments → full doc. `scripts/render-verify.mjs` — structural render check.

## Three-layer shape (memorize)

```
LectureDoc { schemaVersion:"1.0", id, title, subtitle?, language, audience?, theme, tutor:{suggestions[],kb[]}, scenes[] }
  Scene   { id, kind:"hero"|"content"|"quiz"|"statement", eyebrow?, headline?, lead?, notes(必填), blocks[], decor? }
    Block { type, status?, ... }   // 16 types, grouped below
```

- **Content/structure blocks:** `hero` `statement` `list` `agenda` `callout` `formula` `flow` `table` `code` `compare` `grid` → owned by **create-content**.
- **Interactive blocks:** `quiz` (→ create-quiz), planning capabilities `state-sim|model-sim|geometry-sim` (→ shared final `sim` via create-sim), `runnable` (→ create-code-runtime), `embed` (reserved placeholder — not wired this phase).
- **Media:** `assets` + `media` blocks + `scene.background` (→ create-media). Media is optional and must declare purpose and placement; it cannot substitute for state, execution, quantitative, relational, or geometric evidence.
- **Escape hatch:** `freeform` (→ create-freeform) — rare, always-visible, sanctioned.

## Validate / assemble / verify (deterministic, always run these)

From this skill's dir (the agent resolves `scripts/` to an absolute path):

```
node scripts/validate.mjs <doc.json>              # whole doc
node scripts/validate.mjs --block <block.json>    # a single block (use during per-block authoring)
node scripts/assemble.mjs <skeleton.json> <fragments-dir> [out.json]   # fill pending blocks by id → full doc + validate
node scripts/render-verify.mjs <doc.json>         # structural assertions + overflow heuristic (true render needs headless browser)
```

Validator errors carry a JSON path (e.g. `$.scenes[2].blocks[0].html — ...`) — read the path, fix that field, re-run. This is the self-repair loop's feedback channel.

## Non-negotiables (full list in SPEC §5 — violating any was previously rejected by the user)

- **正文克制，细节进 `notes`.** Every page = one clear point. `lead` is one short statement, not "本页将展示…" onboarding copy. No "让我们一起…"/"值得注意的是…". No feature-pill badges.
- **Colors/fonts/spacing always go through theme tokens** — the content layer NEVER writes literal colors/fonts. Want a different look → change `theme` (§8), don't hand-color.
- **Formulas are always LaTeX** (`$...$` inline / `formula` block). Never Unicode super/subscripts.
- **Sim: registry engines first** (`dynamics1d`/`searchCompare`), then `custom` (param-driven line series), then `widget` (canvas/animation in a sandbox iframe) last.
- **Chinese typography:** full-width punctuation in Chinese sentences; a space between CJK and Latin/digits (`2026 年`, `AI 产品`); no uppercasing/letter-spacing on Chinese labels.

## Note on maintenance

`references/` and `scripts/` here are **synced from `viewer/schema/`** (single source of truth) via `node lecture-agent/sync.mjs`. Edit the contract in `viewer/schema/`, then re-sync — don't edit the copies here.
