---
name: create-model-sim
description: Plan a parameterized model simulation for a LectureDoc lecture. Use when learners must change real parameters and observe a recomputed quantitative consequence, compare model regimes, or inspect deterministic or stochastic causal behavior. Use chart for a fixed dataset and state-sim for discrete algorithm steps. Lowers to the shared sim runtime.
---

# Create a model simulation plan

Require at least one genuine model parameter, an explicit update/equation, and a visible output that changes immediately. If the objective says compare, make all comparison states visible in the first frame. Use a declarative sim engine when it fully expresses the model; otherwise use the shared widget core.

Describe the evidence in `interactionBrief`; do not write final HTML.
