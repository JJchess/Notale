---
name: create-state-sim
description: Plan a discrete state simulation for a LectureDoc lecture. Use whenever learning evidence depends on an algorithm's intermediate states, stepwise execution, tree/graph/array mutation, structural transformation, replay, or before-to-after mapping. AVL rotations and data-structure updates belong here even though nodes have positions. The final block lowers to sim.widget.
---

# Create a state simulation plan

Require a complete, meaningful initial state on the first paint, a real single-step transition, visible highlighting of what changed, preserved previous/current state, and deterministic reset. The initial step is `0`; reset must return to that exact pre-transition state. “Pre-transition” does not mean an empty stage: preload the smallest valid, inspectable structure needed to understand the next operation. A structural state must show at least three meaningful evidence marks; tree/graph/array operations must include enough labeled entities and relationships to make the first nontrivial transition predictable. For a rotation, step 0 must already show at least the three participating nodes, their edges, labels, and invariant/readout. A grid, axes, watermark, instruction, one isolated placeholder node, or `EMPTY_TREE` label does not count as visual evidence. A widget must never initialize at step 1 or at an already-completed transformation merely to make the first frame look active. Add play/pause only when repeated stepping helps.

Describe state and transition evidence in `interactionBrief`; do not write HTML. The shared `create-sim` execution core compiles the brief and builds the final widget.

Prediction feedback must be derived from the state currently painted, never from the next or previous history entry. If the implementation stores `expected*` values per step, add assertions for every step index that pair the visible invariant/readout with its expected action; explicitly test the transition immediately before and immediately after a rotation or structural mutation. An off-by-one answer key is a failed simulation even when the drawing is correct.
