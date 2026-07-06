---
name: generate-lecture
description: The harness that turns a course topic into a complete, valid LectureDoc interactive lecture ("PPT"). Flow is input query → clarification → output. Plans the scene/block skeleton, fans out per-block sub-agents (each loading a create-* family skill), assembles, validates, self-repairs, and verifies. Use when asked to generate/author a lecture, courseware, interactive slides, or 讲义 for a topic.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Orchestrator, Generation, Harness]
    related_skills: [lecture-doc-schema, create-content, create-quiz, create-sim, create-code-runtime, create-freeform, evolve-schema]
---

# generate-lecture — the lecture-generation harness

Turn a topic into a valid **LectureDoc** (rendered by `demo/doc-to-deck.js` into an interactive reveal.js deck). You are the orchestrator: you plan structure and delegate each block to the right `create-*` family skill, then assemble + validate + verify. **Read `lecture-doc-schema` first** (schema, SPEC §5 authoring rules, §8 theme guide). Content is JSON only — never author HTML/CSS/renderer code (except inside a `sim.widget`/`freeform` fragment, which is the delegated skill's job).

Let `$SCHEMA` = the absolute dir of the `lecture-doc-schema` skill (contains `scripts/` and `references/`). Resolve it once via `skill_view('lecture-doc-schema')`.

## Flow: input → clarify → output

### ① Clarify (do not skip)
Use the `clarify` tool to ask the user, in one batch:
- 课题范围（这门课/这一章具体讲什么，边界在哪）
- 受众与深度（谁听、假设了什么前置）
- 篇幅（大约几页，"十几页"是好默认）
- 要不要动手交互：仿真（`sim`）/ 可运行代码（`runnable`，全 deck 至多一个）/ 测验（`quiz`）
- 气质 → 主题（按 SPEC §8：cartesian 克制人文 / cobalt-grid 研究公报 / lab 暗仪表台，多仿真时选它）
若用户已在 query 里给全，可跳过对应问题；不要问已知的。

### ② PlanScenes — emit the skeleton
Start from `references/templates/skeleton.json`. Produce a full LectureDoc where:
- `theme` chosen per §8; `tutor.suggestions`/`kb` seeded from the topic.
- Each scene has `id`, `kind` (hero/content/quiz/statement), `notes` (讲者稿，可详细), and `blocks[]`.
- **Every block that needs generation is a placeholder** `{ "id": "<unique>", "type": "<type>", "status": "pending" }`. Trivial blocks you can write inline directly (mark `status:"ready"` or omit).
- One clear point per page; sequence tells a story; put the interaction where it teaches best. Save the skeleton to a working dir, e.g. `out/<id>/skeleton.json`, and make a `out/<id>/frags/` dir.

Sanity-check the skeleton parses and the structure is sound before fanning out.

### ③ Fan-out — one delegate_task per pending block (parallel)
For each pending block, dispatch a child. **You must include `skills` in toolsets** so the child can `skill_view` the family skill (stock examples omit it — don't):

```
delegate_task(
  goal="Author LectureDoc block '<id>' (type <type>) for lecture '<title>'.",
  context="""
  Load and follow the skill '<family>' via skill_view('<family>'), and read the contract via skill_view('lecture-doc-schema', file_path='references/SPEC.md') as needed.
  This block's teaching job: <one-sentence intent for this block>.
  Page context: <scene headline + what came before/after>. Theme: <theme>.
  Source material (if any): <inlined excerpt>.
  Produce ONLY the block JSON. Self-check: write it to $SCHEMA/../out/<id>/frags/<id>.json and run
    node $SCHEMA/scripts/validate.mjs --block out/<id>/frags/<id>.json
  Fix any path-tagged error/warning until it passes. Return the final block JSON.
  """,
  toolsets=['terminal','file','skills']
)
```

Family routing:
- `hero/statement/list/agenda/callout/formula/flow/table/code/compare/grid` → **create-content**
- `quiz` → **create-quiz**   ·   `sim` → **create-sim**   ·   `runnable` → **create-code-runtime**
- `freeform` → **create-freeform** (rare)

Have each child **write its block to `out/<id>/frags/<blockId>.json`** (that's what assemble reads). Run children in parallel (batch delegate_task).

### ④ Assemble
```
node $SCHEMA/scripts/assemble.mjs out/<id>/skeleton.json out/<id>/frags out/<id>/course.lecture.json
```
This fills every pending block by id, strips pipeline fields, and runs full validation.

### ⑤ Validate + self-repair loop
`assemble.mjs` already validated. If it exits non-zero, its errors carry JSON paths like `$.scenes[2].blocks[0].html — ...`. **Route each error back to the child that owns that block** (re-`delegate_task` with the error text + the current block), regenerate that fragment, re-assemble. Repeat ≤ 3 rounds. Warnings (caps / anti-slop lint) are non-fatal but worth fixing.

### ⑥ Verify
```
node $SCHEMA/scripts/render-verify.mjs out/<id>/course.lecture.json
```
Structural assertions + overflow heuristic. If a page is flagged dense, split it (SPEC §5) rather than shrinking type. (True render/interaction/overflow verification needs a headless browser or a human pass in `demo/serve.py` — say so honestly.)

### ⑦ Output
The validated `out/<id>/course.lecture.json` **is** the lecture. Drop it in as `demo/course.lecture.json` (or point the runtime at it) to view. Report: page/block counts, theme, any freeform used (with rationale — feeds `evolve-schema`), and what still needs a human render pass.

## Principles
- Orchestration-first: your judgment is *what block goes where*; the family skills own *how* to write each block well.
- Never inline literal colors/fonts; the theme's tokens carry all visuals.
- If a block keeps failing a family skill's contract, that's a signal — don't force `freeform`; reconsider the block type. Recurring genuine gaps go to `evolve-schema`.
