---
name: build-interaction
description: "Build a 1600×900 learning interaction where learner action changes real model state and visible evidence. Use for planner pages labeled [交互页], including simulations, construction, decisions, learning games, essential 3D manipulation, and runnable code."
---

# Build Interaction

This skill is the deterministic workflow for a planner page labeled `[交互页]`. The selected reference supplies the complete learning, visual-world, state, input, lifecycle, and verification contract.

## Pass the boundary

The learner must act on a real algorithm, simulation, rule system, data transformation, or constrained state model, and the visible evidence must be derived from the resulting state. Click-to-reveal, decorative motion, hover-only detail, passive playback, filter-only charts, arbitrary points, and free camera orbit do not satisfy this label; if authored evidence already explains the relationship, use `build-page` instead.

## Choose one reference

Choose from the implementation architecture of the learning action, then load exactly one document:

- `code` → [references/code.md](references/code.md): the learner writes or modifies runnable code and execution, tests, trace, console output, or a code-derived view is the evidence.
- `3d` → [references/3d.md](references/3d.md): acting on depth, orientation, occlusion, assembly, volume, terrain, or geographic space changes the model or evidence.
- `general` → [references/general.md](references/general.md): all other consequential browser interactions using DOM, SVG, Canvas, Chart, p5, Pixi, Konva, Matter, or similar renderers.

Never load another interaction reference. `code` uses the supplied runtime template and native-view contract; do not invent a parallel editor or execution shell.

## Load working context

Before modifying the page, call the host reader exactly once. For `general` or `code`, use:

`workflow-context --reference <category> --main <sample-id> [--aux <sample-id> ...]`

For sample-less `3d`, use `workflow-context --reference 3d`. The command returns the complete reference-and-sample payload. Do not open `references/`, `samples/`, or `samples/catalog.json` directly before or after this call.

- `general`: choose one full main sample by transferable learning loop and state/evidence mechanism. Add zero to three auxiliaries only when each contributes a different useful mechanism; prefer two when two genuinely complementary options exist.
- `3d`: no approved sample exists in this version. Load the reference alone and build from the task.
- `code`: load the single `code-core-bundle`; it contains all four compact author layers and has no mini or auxiliary split.
- An auxiliary uses `mini` when available. A full sample below 10,000 characters is already its mini-equivalent.
- Auxiliary code may total at most 30,000 characters. The whole loaded bundle—this file, one reference, main, and auxiliaries—may total at most 110,000 characters.
- Select by state transition, feedback evidence, and runtime architecture rather than topic nouns. Never copy a sample's answer, data, labels, or surface styling.

<!-- SAMPLE_LAYER_START -->
## Sample catalog

### general

- `future-climate-analogy` — A real geographic matching model links a selected city to a future climate analogue and derived map evidence. Full 26,012 chars; main-only because its rejected mini is not approved.
- `lawn-path` — A constrained path-construction puzzle preserves legal partial progress, exposes rule consequences on the board, and supports exact reset. Full 26,499; mini 9,757.
- `motif-match` — A playable piano construction task turns interval choices into audible and spatial evidence with deterministic correction. Full 15,236; mini 9,781.

### code

- `code-core-bundle` — Four compact author layers loaded together: edit-distance dynamic programming, Euclidean recursion, grid BFS, and tree traversal. They demonstrate starter code, tests, trace extraction, lesson configuration, and code-derived native views without repeating the fixed runtime template. Full 66,087 chars; no mini.

### 3d

No approved sample. Use `references/3d.md` alone.
<!-- SAMPLE_LAYER_END -->

## Execute

Follow the selected reference as the complete design and implementation contract. Preserve the host chassis, theme interface, deck boundary, page specification, and output path already supplied by the builder. Do not read another reference or browse unrelated samples after construction begins.

Before finishing, use the host page check on the rendered page, exercise every rule-relevant state and access path, and repair all failures.
