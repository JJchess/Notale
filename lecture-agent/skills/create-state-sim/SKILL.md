---
name: create-state-sim
description: Plan a discrete state simulation for a LectureDoc lecture. Use whenever learning evidence depends on an algorithm's intermediate states, stepwise execution, tree/graph/array mutation, structural transformation, replay, or before-to-after mapping. AVL rotations and data-structure updates belong here even though nodes have positions. The final block lowers to sim.widget.
---

# Create a state simulation plan

Require a meaningful mid-action first frame, a real single-step transition, visible highlighting of what changed, preserved previous/current state, and deterministic reset. Add play/pause only when repeated stepping helps.

Describe state and transition evidence in `interactionBrief`; do not write HTML. The shared `create-sim` execution core compiles the brief and builds the final widget.
