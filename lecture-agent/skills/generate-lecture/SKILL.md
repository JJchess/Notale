---
name: generate-lecture
description: The orchestrator that turns a course topic into a complete, valid LectureDoc lecture. Flow is input → clarification → output. Plans the scene/block skeleton, fans out per-block generation (each block routed to its family skill's contract), assembles, validates, self-repairs, and verifies. Implemented in src/agent.mjs; run via the CLI.
version: 1.0.0
license: MIT
metadata:
  role: orchestrator (meta-skill; no contracts.json)
  related_skills: [lecture-doc-schema, create-content, create-quiz, create-sim, create-code-runtime, create-freeform, evolve-schema]
---

# generate-lecture — the orchestrator (meta-skill)

This documents the编排 flow. The implementation is `src/agent.mjs` + `bin/lecture-agent.mjs` (this is a pure-Node agent — no external framework). Run it:

```
node bin/lecture-agent.mjs generate "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab] [--audience ..] [--wants sim,quiz] [--no-clarify]
```

## Flow (input → clarify → output)
1. **Clarify** (`src/clarify.mjs`) — interactively ask 受众/篇幅/要哪些交互/主题气质; `--no-clarify` or non-TTY skips it.
2. **Plan** — one LLM call → skeleton LectureDoc: `scenes[]` with framing (kind/eyebrow/headline/lead/notes) and block placeholders `{id, type, intent}`; picks `theme` per SPEC §8. Auto-plannable block types come from the loaded skills' registry (`lecture-agent skills` to inspect), minus escape hatches (runnable/freeform).
3. **Fan-out** (`src/delegate.mjs`, concurrency pool) — each placeholder → route by `type` to the owning family skill's contract (`skills.mjs` registry) → one focused LLM call → `validateBlock` self-check → feed path-tagged errors back to self-repair (≤3 rounds).
4. **Assemble** — fill placeholders; a block that can't be made valid is honestly dropped/downgraded and reported (never fabricated).
5. **Validate + repair** — `validateDoc`; block-level errors are routed back by JSON path and regenerated (≤2 rounds).
6. **Verify** — `render-verify.mjs` structural assertions + overflow heuristic (true render/interaction needs a headless browser or a human pass in `viewer/serve.py`).
7. **Output** — a valid `course.lecture.json` (written to `out/<id>/` and `viewer/generated/<id>.lecture.json` for `?doc=` preview).

## Principles
- Orchestration-first: this skill's job is *what block goes where*; each family skill owns *how* to write its blocks well (see `create-*`).
- Content is JSON only — never author HTML/CSS (except inside a `sim.widget`/`freeform` fragment, which is the family skill's business).
- Read `lecture-doc-schema` for the schema + authoring rules (SPEC §5) + theme guide (§8).
- Standing loop / batch / self-evolution: `lecture-agent loop|batch|evolve` (see README, `evolve-schema`).
