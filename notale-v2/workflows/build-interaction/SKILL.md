---
name: build-interaction
description: "Build a 1600×900 learning interaction where learner action changes real model state and visible evidence. Use for planner pages labeled [交互页], excluding pages whose primary action is editing runnable code."
---

# Build Interaction

The learner must act on a real algorithm, simulation, rule system, data transformation, or constrained state model, and visible evidence must derive from the resulting state. Reveal-only controls, decorative motion, hover detail, passive playback, filter-only charts, arbitrary points, and free camera orbit do not meet this boundary.

Choose one category:

- `3d`: acting on depth, orientation, occlusion, assembly, volume, terrain, or geographic space changes the model or evidence.
- `general`: every other consequential browser interaction.

In your first response, issue parallel `Read` calls for the selected reference and, for `general`, exactly one Main path. Do not read any other sample. Select the Main by action → state transition → visible evidence, not topic words. The `3d` category currently has no approved sample and reads only its reference.

## References

- `general`: `<skill-dir>/references/general.md`
- `3d`: `<skill-dir>/references/3d.md`

## Samples

### general

- `future-climate-analogy`
  - Scene: a selected city matched to a future climate analogue on a map.
  - Visual: geographic anchors, comparison values, and map evidence remain one coherent field.
  - Interaction: choosing a city runs a real matching model and updates the derived analogue and spatial evidence.
  - Main: `<skill-dir>/samples/bundles/general/future-climate-analogy.full.md`
- `lawn-path`
  - Scene: a path-construction puzzle crossing a constrained lawn grid.
  - Visual: legal progress, blocked structure, and route consequence stay visible on one board.
  - Interaction: each segment changes a constrained path state; illegal moves, completion, and exact reset derive from the same rule system.
  - Main: `<skill-dir>/samples/bundles/general/lawn-path.full.md`
- `motif-match`
  - Scene: a short musical motif constructed on an interactive piano.
  - Visual: keys, interval positions, and current sequence form a compact instrument rather than a quiz card.
  - Interaction: each note changes the deterministic interval sequence and produces audible, spatial, and corrective evidence.
  - Main: `<skill-dir>/samples/bundles/general/motif-match.full.md`

Follow the selected reference as the construction contract. Preserve the supplied chassis, theme interface, page brief, and output path. Use `Check` to inspect the initial state and consequential states when useful; finish by leaving the complete page at the target path.
