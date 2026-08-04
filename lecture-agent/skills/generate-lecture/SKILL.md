---
name: generate-lecture
description: Orchestrate a course topic into a complete LectureDoc lecture. Discover knowledge forms and course-level evidence obligations, plan scene and capability placeholders, lower planner capabilities to final block types, fan out generation, assemble, validate, repair, render-verify, and report quality. Use for complete lecture generation rather than authoring one block.
---

# Generate a lecture

Run the Python pipeline in `lecture_agent/engine/pipeline.py` through the `lecture-agent` CLI.

## Flow

1. Discover complementary teaching perspectives and classify knowledge forms.
2. Compile knowledge forms into course-level evidence obligations. Dynamic processes require state evidence; executable artifacts require runnable execution evidence.
3. Plan pages using the planning registry. Select `state-sim`, `model-sim`, or `geometry-sim` explicitly instead of an undifferentiated sim.
4. Run deterministic plan-quality guards even when extra LLM review rounds are disabled.
5. Lower planning capabilities to final LectureDoc block types immediately before fan-out.
6. Generate blocks concurrently. A complete `interactionBrief` compiles directly into the GenUI contract; an incomplete contract falls back to `widget:plan`.
7. Assemble, validate, repair, render-verify, write grounded notes, and return route/quality metadata.

Keep planning metadata out of the final LectureDoc. Never repair an experiment by manually editing the generated deck; fix the reusable workflow or Skill and rerun it.
