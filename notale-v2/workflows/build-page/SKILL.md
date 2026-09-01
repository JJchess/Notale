---
name: build-page
description: "Build a 1600×900 explanatory page whose claim is understandable without learner manipulation. Use for planner pages labeled [内容页], including authored diagrams, charts, and necessary 3D evidence."
---

# Build Page

Choose the medium carrying the decisive evidence:

- `3d`: flattening would remove necessary depth, occlusion, volume, assembly, terrain, or viewpoint evidence.
- `chart`: quantitative encoding, comparison, distribution, uncertainty, or a data relation carries the claim.
- `general`: authored HTML, SVG, Canvas, diagrams, mechanisms, maps, bounded objects, or narrative motion carry the claim.

In your first response, issue parallel `Read` calls for exactly one reference and one Main path from the same category. Do not read any other sample. Select by transferable evidence structure, composition, and renderer lifecycle rather than topic words. Never combine references or use `general` as a base layer beneath another category.

## References

- `general`: `<skill-dir>/references/general.md`
- `chart`: `<skill-dir>/references/chart.md`
- `3d`: `<skill-dir>/references/3d.md`

## Samples

### general

- `escapement`
  - Scene: a mechanical escapement moving through lock, impulse, and release.
  - Visual: stable component identities and authored states expose a mechanism across one stage.
  - Main: `<skill-dir>/samples/bundles/general/escapement.full.md`
- `lenna-image-lineage`
  - Scene: one image persisting through a lineage of copies and transformations.
  - Visual: editorial scale, repetition, focus, and authored progression make continuity visible.
  - Main: `<skill-dir>/samples/bundles/general/lenna-image-lineage.full.md`
- `neuron-to-formula`
  - Scene: a biological neuron transforming into a compact mathematical model.
  - Visual: stable correspondences carry one object across anatomical, diagrammatic, and symbolic states.
  - Main: `<skill-dir>/samples/bundles/general/neuron-to-formula.full.md`
- `rain-paths`
  - Scene: rainfall following five different surface treatments.
  - Visual: comparable mini-landscapes share a grammar while each path remains distinct.
  - Main: `<skill-dir>/samples/bundles/general/rain-paths.full.md`

### chart

- `climate-zone-shift-map`
  - Scene: present and projected climate classifications around fixed cities.
  - Visual: a native geographic map uses stable anchors to compare spatial category change.
  - Main: `<skill-dir>/samples/bundles/chart/climate-zone-shift-map.full.md`
- `lenna-scroll-bars`
  - Scene: yearly image-use evidence accumulating through a bar sequence.
  - Visual: a common scale and authored disclosure turn bars into an editorial narrative.
  - Main: `<skill-dir>/samples/bundles/chart/lenna-scroll-bars.full.md`
- `pollinator-network`
  - Scene: two ecological communities connected by weighted pollination links.
  - Visual: direct labels, bridge nodes, and weighted edges make network structure inspectable.
  - Main: `<skill-dir>/samples/bundles/chart/pollinator-network.full.md`
- `solar-storage`
  - Scene: solar supply and electricity demand compared across one day.
  - Visual: a shared time axis and annotations expose lag and the storage gap.
  - Main: `<skill-dir>/samples/bundles/chart/solar-storage.full.md`
- `swarm-spectrum`
  - Scene: named observations distributed across a ranked spectrum.
  - Visual: a directly labelled beeswarm combines position and occurrence area without dashboard cards.
  - Main: `<skill-dir>/samples/bundles/chart/swarm-spectrum.full.md`

### 3d

- `gimbal`
  - Scene: a rigid-body gimbal preserving orientation through nested rotations.
  - Visual: stable part identities, authored cameras, and adjacent evidence explain spatial behavior.
  - Main: `<skill-dir>/samples/bundles/3d/gimbal.full.md`
- `population-mountains`
  - Scene: population rendered as a geographic height field with a side profile.
  - Visual: synchronized spatial and profile views connect position, height, and quantity.
  - Main: `<skill-dir>/samples/bundles/3d/population-mountains.full.md`

Follow the selected reference as the construction contract. Preserve the supplied chassis, theme interface, page brief, and output path. Use `Check` when you need rendered evidence; finish by leaving the complete page at the target path.
