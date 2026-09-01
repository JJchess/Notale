---
name: build-cover
description: "Build a 1600×900 title or chapter-opening page whose identity comes from authored composition, purposeful motion, or a procedural visual system. Use for planner pages labeled [标题页], not explanatory or consequential learning pages."
---

# Build Cover

This skill is the deterministic workflow for a planner page labeled `[标题页]`. The page specification says what the opening is about; the selected reference decides how to build it. Do not turn the cover into a lesson summary or an interaction exercise.

## Choose one reference

Select the visual system that carries the cover's identity, then load exactly one document:

- `composition` → [references/composition.md](references/composition.md): a representative still made from an authored arrangement of type, imagery, SVG, or drawn forms carries the identity.
- `motion` → [references/motion.md](references/motion.md): an authored setup, transformation, and payoff over time carries the identity.
- `generative` → [references/generative.md](references/generative.md): a rule, field, growth system, simulation, shader, or seeded Canvas/p5 process carries the identity.

Resolve overlaps by asking what would still distinguish the cover if the other layer disappeared. A procedural system with a title sequence is `generative`; authored choreography that merely uses procedural texture as material is `motion`. Never load a second cover reference.

## Load working context

Before modifying the page, choose samples only from the selected category and call the host reader exactly once:

`workflow-context --reference <category> --main <sample-id> [--aux <sample-id> ...]`

The command returns the complete reference-and-sample payload. Do not open `references/`, `samples/`, or `samples/catalog.json` directly before or after this call.

- Choose one full main sample by transferable visual or motion mechanism, not by matching topic nouns.
- Add zero to three auxiliaries only when each contributes a different useful mechanism. Prefer two when two genuinely complementary options exist; do not fill slots mechanically.
- An auxiliary uses `mini` when available. A full sample below 10,000 characters is already its mini-equivalent.
- Auxiliary code may total at most 30,000 characters. The whole loaded bundle—this file, one reference, main, and auxiliaries—may total at most 110,000 characters.
- Treat samples as completion and implementation evidence, never as a template to recolor or a source of subject matter.

<!-- SAMPLE_LAYER_START -->
## Sample catalog

### composition

- `climate-zones-title` — Editorial cartographic title frame: a large geographic field, disciplined crop, and typographic safe area behave as one composition. Full 9,660 chars; full is auxiliary-ready.
- `grid-to-preview` — An image grid resolves into a focused preview while preserving a strong poster-like first frame and image-led hierarchy. Full 12,760; mini 9,957.
- `prism-light` — A single-file prism and spectral-light composition in which subject geometry, title placement, and restrained animation share one focal axis. Full 18,354; mini 9,970.

### motion

- `telescope-zoom` — A continuous authored zoom through nested scales; transition continuity and spatial handoff, rather than UI chrome, create the cover memory. Full 9,994 chars; full is auxiliary-ready.

### generative

- `lenna-pixel-field` — A compact seeded pixel field turns image persistence and erosion into the cover material while keeping typography dominant. Full 6,896 chars; full is auxiliary-ready.
- `magnetic-field` — Deterministic dipole field lines organize a visible flow around a protected title region. Full 17,909; mini 9,917.
- `mycelium-growth` — A branching growth system responds to resource positions and produces a legible settled network rather than undirected particles. Full 18,660; mini 9,995.
- `neural-signal-network` — A graph-shaped signal field coordinates node pulses, edge propagation, and a stable typographic foreground. Full 21,895; mini 9,982.
- `tactile-grid` — A WebGL pin surface turns a continuous pointer field into material height, light, and wave response without becoming a control panel. Full 16,506; mini 9,578.
<!-- SAMPLE_LAYER_END -->

## Execute

Follow the selected reference as the complete design and implementation contract. Preserve the host chassis, theme interface, deck boundary, page specification, and output path already supplied by the builder. Do not read another reference or browse unrelated samples after construction begins.

Before finishing, use the host page check on the actual rendered page and repair failures in every relevant state.
