---
name: evolve-schema
description: The self-evolution mechanism for the lecture-generation agent — aggregate signals from many generated LectureDocs (recurring freeform rationales, theme/engine usage) and draft PROPOSALS for growing the schema (new block type / new theme / new sim engine). Proposals are human-reviewed before merge; the agent never silently edits the schema. Run periodically (cron) or after a batch.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, SelfEvolution, Schema, Governance]
    related_skills: [lecture-doc-schema, generate-lecture, create-freeform]
---

# evolve-schema — grow the vocabulary from real demand (not guesswork)

The agent's "learning / accumulation" capability. The invariant (whole project): **structure layer stays strongly constrained; the content-shape layer grows only when real, recurring demand shows a genuine gap** — and growth is a *proposal a human reviews*, never a silent schema edit. This is the self-reflection → self-improvement loop of the course's own thesis, applied to the generator.

## Where signals come from
- **`freeform` rationales** — every escape-hatch use records *why the 15 formal types didn't fit*. When the same shape (e.g. "时间轴", "地图标注") recurs across multiple lectures, that's the signal a new formal block type should exist.
- **theme usage** — a mood repeatedly wanted but not covered → add a `[data-theme=x]` token block (from `refs/frontend-slides`, 34 design.md) + a SPEC §8 row.
- **sim engine usage** — a simulation topic repeatedly forced into `custom`/`widget` → sediment a new registry engine (like `dynamics1d`/`searchCompare`).

## Run the aggregator
```
node scripts/aggregate.mjs <dir-of-generated-docs...>
```
It scans generated `course.lecture.json` files, tallies freeform rationales (keyword frequency **across distinct docs**, ≥2 = recurring), theme/engine distributions, and prints candidate signals + a machine-readable `@@EVOLVE_JSON@@` line for cron/batch to consume. It changes nothing.

## From signal to proposal (human-reviewed)
For the top recurring signal, draft — as a PR-style proposal, not an applied change:
1. **schema 片段** — the new block type's fields (added to `demo/schema/lecture-doc.schema.json`), via **additive** `schemaVersion` bump.
2. **渲染器分支** — a `blockRenderers.<type>` sketch in `demo/doc-to-deck.js`.
3. **create-* 技能草案** — a new/updated family skill so future generation can use it.
4. **反例测试** — a validate.mjs case (positive + negative).
Present all four to a human. Only after review does it merge (then `node lecture-agent/sync.mjs` re-syncs the skill copies).

## Batch as the data source
`refs/hermes-agent/batch_runner.py` runs `generate-lecture` over a topics JSONL (see `lecture-agent/hermes/topics.sample.jsonl`), producing many docs + pass/rate/repair stats (trajectories). Point `aggregate.mjs` at that output dir to turn a batch into evolution signals. Wire it as a Hermes cron routine (see `lecture-agent/hermes/config.sample.yaml`) for a standing loop: generate → aggregate → surface proposals.

## Guardrail (do not cross)
The agent may **draft** proposals; it must not silently modify `demo/schema/`, the renderer, or the family skills' contracts. Growth is governed, additive, and human-approved — that's what keeps "controlled self-evolution" controlled.
