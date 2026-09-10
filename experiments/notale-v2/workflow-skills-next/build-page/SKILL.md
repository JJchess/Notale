---
name: build-page
description: "Build a 1600×900 explanatory page whose claim is understandable without learner manipulation. Use for planner pages labeled [内容页], including authored diagrams, charts, 2D compositions, and necessary 3D evidence; not title covers or consequential interactions."
---

# Build Page

This skill is the deterministic workflow for a planner page labeled `[内容页]`. The page must carry its claim through authored evidence; playback, reveal, hover, filtering, zoom, or camera orbit may inspect predetermined evidence but do not turn it into a learning interaction.

## Choose one reference

Choose by the medium carrying the decisive evidence, in this order, then load exactly one document:

- `3d` → [references/3d.md](references/3d.md): flattening would remove a necessary depth, occlusion, volume, assembly, terrain, or viewpoint relationship.
- `chart` → [references/chart.md](references/chart.md): quantitative encoding, comparison, distribution, uncertainty, or a data relation carries the claim.
- `general` → [references/general.md](references/general.md): authored HTML, SVG, Canvas, p5, Pixi, diagrams, mechanisms, illustrations, maps, bounded objects, or narrative motion carries the claim.

Choose the category carrying the main evidence and implementation risk. Never load `general.md` as a base layer and never combine references for a mixed-media page.

## Load working context

Before modifying the page, choose samples only from the selected category and call the host reader exactly once:

`workflow-context --reference <category> --main <sample-id> [--aux <sample-id> ...]`

The command returns the complete reference-and-sample payload. Do not open `references/`, `samples/`, or `samples/catalog.json` directly before or after this call.

- Choose one full main sample by transferable evidence structure, composition, or renderer lifecycle—not by matching topic nouns.
- Add zero to three auxiliaries only when each supplies a different useful mechanism. Prefer two when two genuinely complementary options exist; do not fill slots mechanically.
- An auxiliary uses `mini` when available. A full sample below 10,000 characters is already its mini-equivalent.
- Auxiliary code may total at most 30,000 characters. The whole loaded bundle—this file, one reference, main, and auxiliaries—may total at most 110,000 characters.
- Samples establish a finish and implementation threshold. Do not copy their subject, labels, data, or surface styling.

<!-- SAMPLE_LAYER_START -->
## Sample catalog

### general

- `escapement` — A staged mechanism explanation keeps component identity stable while authored states expose lock, impulse, and release. Full 45,820; mini 9,997.
- `lenna-image-lineage` — An editorial image lineage uses scale, repetition, focus, and authored progression to make persistence across copies visible. Full 20,422; mini 9,999.
- `neuron-to-formula` — One object morphs through stable correspondences from biological structure to a compact equation. Full 29,643; mini 9,999.
- `rain-paths` — Five surface treatments share a comparable visual grammar while each reveals a distinct path for rainfall. Full 16,702; mini 9,999.

### chart

- `climate-zone-shift-map` — A native geographic map compares present and projected classifications while cities remain fixed evidence anchors. Full 22,831; mini 9,980.
- `lenna-scroll-bars` — A scroll-authored bar narrative preserves a common scale as yearly evidence is progressively disclosed. Full 28,429; mini 9,997.
- `pollinator-network` — A labelled two-community network makes bridge nodes and weighted connections directly inspectable. Full 37,549; mini 9,995.
- `solar-storage` — A shared time axis and annotations expose the lag between solar supply and electricity demand. Full 31,112; mini 9,986.
- `swarm-spectrum` — A directly labelled beeswarm combines rank position and occurrence area without falling back to dashboard cards. Full 12,020; mini 9,723.

### 3d

- `gimbal` — A real rigid-body scene, stable part identities, authored camera states, and adjacent evidence explain orientation preservation. Full 54,993; mini 9,999.
- `population-mountains` — A height field and synchronized side profile connect geographic position, elevation encoding, and quantitative comparison. Full 15,904; mini 9,997.
<!-- SAMPLE_LAYER_END -->

## Execute

Follow the selected reference as the complete design and implementation contract. Preserve the host chassis, theme interface, deck boundary, page specification, and output path already supplied by the builder. Do not read another reference or browse unrelated samples after construction begins.

Before finishing, use the host page check on the actual rendered page and repair failures in every relevant authored state.
