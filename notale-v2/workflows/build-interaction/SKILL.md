---
name: build-interaction
description: "Build a non-scrolling learning interaction where learner action changes real model state and visible evidence. Use for planner pages labeled [交互页], excluding pages whose primary action is editing runnable code."
---

# Build Interaction

The learner must act on a real algorithm, simulation, rule system, data transformation, or constrained state model, and visible evidence must derive from the resulting state. Reveal-only controls, decorative motion, hover detail, passive playback, filter-only charts, arbitrary points, and free camera orbit do not meet this boundary.

Choose one category:

- `3d`: acting on depth, orientation, occlusion, assembly, volume, terrain, or geographic space changes the model or evidence.
- `general`: every other consequential browser interaction.

Before choosing, name the main action → state → evidence loop of this page. Select the Main by its interaction loop, never by a similar topic name. In the first response, state the needed transferable pattern in one sentence, then issue parallel `Read` calls for exactly one reference and one Main from the same category. Do not read any other sample. The `3d` category currently has no approved sample and reads only its reference.

## References

- `general`: `<skill-dir>/references/general.md`
- `3d`: `<skill-dir>/references/3d.md`

## Samples

### general

- `future-climate-analogy`
  - geographic anchors, comparison values, and map evidence remain one coherent field.
  - choosing a city runs a real matching model and updates the derived analogue and spatial evidence.
  `<skill-dir>/samples/bundles/general/future-climate-analogy.full.md`
- `lawn-path`
  - legal progress, blocked structure, and route consequence stay visible on one board.
  - each segment changes a constrained path state; illegal moves, completion, and exact reset derive from the same rule system.
  `<skill-dir>/samples/bundles/general/lawn-path.full.md`
- `motif-match`
  - keys, interval positions, and current sequence form a compact instrument rather than a quiz.
  - each note changes the deterministic interval sequence and produces audible, spatial, and corrective evidence.
  `<skill-dir>/samples/bundles/general/motif-match.full.md`

Follow the selected reference as the construction contract. Preserve the supplied chassis, theme interface, page brief, and output path.
