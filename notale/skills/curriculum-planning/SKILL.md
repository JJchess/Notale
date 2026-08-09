---
name: curriculum-planning
description: Architect a learner-appropriate curriculum, route its factual basis to page builders, and lock one globally consistent contract within a deterministic budget.
required_tools: [skill_read, artifact_read, artifact_search, submit_contract]
---

# Curriculum planning

1. Read the complete course brief, page/chapter budget, Research prep records, and pedagogy notes.
   Use the brief's audience, prior knowledge, intensity, and duration to identify the learning gap for
   this course; do not invent a longitudinal learner mission.
2. Build the smallest coherent concept-and-skill sequence that crosses that gap. Give every page one
   `centralMessage` knowledge proposition and one `learningAction`: comparing, predicting, tracing,
   explaining, or applying—not clicking, running, or reading UI instructions. Lock one concise deck
   `throughline`, one `narrativeGoal` per chapter, and one `narrativeRole` per page.
3. Treat Research records as the preferred factual base. You may add stable, standard, uncontroversial
   textbook knowledge only by creating a `planner-*` record in `supplementalPrepRecords`. Put the claim,
   necessary derivation, assumptions, invariants, valid range, and known limitations in that record.
   Never attach a broad or merely topical Research record to legitimize a claim it does not support.
4. Bind every page to all records needed for its factual basis. Builders may mechanically instantiate
   examples, visual states, and computed results from those records, but must not add a new subject-matter
   conclusion. Preserve every bound record's `invariants`, `validRange`, and `knownInaccuracies`.
5. Use retrieval, spacing, interleaving, misconception repair, and transfer only as budget-aware ideas
   when they directly help the course goal. They are not quotas or required page phases.
6. Add at most three selective `continuity` links per page. Use them only for real dependencies,
   contrasts, callbacks, setups, or synthesis—not as a mechanical neighbor list. Every chapter after
   the first must include a non-adjacent callback to an earlier chapter so the deck remains coherent
   beyond local page transitions.
7. Cite one or more exact `pedagogyNoteIds` for every chapter and explain the choice in `rationale`.
   Decide terminology and notation once for the deck. Use the assigned deck-visual skill for the shared
   art direction, semantic tokens, and recurring motif. Never output component or library names as a
   visual contract, and leave each page's visual object, layout, title, subtitle, controls, and
   interaction implementation to its Builder.
8. Submit through `submit_contract` as soon as the full contract validates. Harness events maintain the
   task ledger; a prose answer is not a submission.
