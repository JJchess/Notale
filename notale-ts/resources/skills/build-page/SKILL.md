---
name: build-page
description: "Builds pages explaining concepts, mechanisms, or data relationships through diagrams, charts, and animated demonstrations, without requiring learner manipulation to convey the core explanation."
---

# Build Page

<!--teaching:start-->
## Teach through Deck steps

Use chassis-controlled steps when a derivation, comparison or state progression develops understanding. Advance evidence or attention to a specific relationship within one stable main scene. Each step must make that relationship more understandable; do not merely reveal another paragraph or register an unchanged state as a step. If a single static presentation fully establishes the relationship, do not invent empty steps.

Comparisons also use steps: add B alongside A on the same baseline, add a difference or residual, or progressively focus relationships with both cases already visible. Preserve object identities, semantic colors, scales, and reference geometry. Accumulate evidence when useful; changing states must retain enough reference to understand the change. Never wrap each step in its own panel or relayout the page into successive cards.

Compose the evidence and its explanations as one scene: place short labels, values, and formulas beside the objects or relationships they explain. A diagram on the left plus a stack of explanatory cards on the right is not this composition, even if the cards have Deck step attributes. Neither are separate boxed cases in a comparison. Use spacing, alignment, leaders, and shared reference geometry instead. Borders may represent actual objects or scientific boundaries; do not use decorative card shells around individual facts, steps, or cases.

Preserve theme colors, typography and material details while adapting a sample to this shared scene. Compared objects retain their identity, units and baseline; place necessary calculations beside the evidence they explain. Inspect the actual enclosure rather than trusting its class name.

Step 0 establishes the subject, question, objects and useful starting evidence; it need not disclose the final conclusion. Paired claims and evidence, or limitations and corresponding next steps, advance together. The final state must support complete review. Choose meaningful teaching beats without a fixed step quota. The whole-page text budget still applies across the explanation; advancing a step does not grant a new text allowance.

Use `data-deck-step="n"` for element reveals or `Deck.onStep(renderStep, maxStep)` for drawn state changes. The chassis owns forward/backward navigation. Transfer a sample's explanatory states, not its next buttons, sequential tabs, or automatic progression. Preserve controls for genuine free comparison, model input, zoom, and inspection. Continuous motion may explain the current step but must not advance the teaching sequence automatically.

Remove sample step selectors entirely, including numbered pills and clickable teaching titles, even when they also call Deck. A registered step count alone is insufficient: each advance must visibly reveal or focus the relevant evidence in the scene, and going backward must restore it.

Design these states within the existing construction decision and first implementation; do not add a planning document, extra response, or extra Read. Apply this Build Page requirement when the shared chassis describes steps as optional for pages in general.

<!--teaching:end-->
Choose the medium carrying the decisive evidence:

- `3d`: flattening would remove necessary depth, occlusion, volume, assembly, terrain, or viewpoint evidence.
- `chart`: quantitative encoding, comparison, distribution, uncertainty, or a data relation carries the claim.
- `general`: authored HTML, SVG, Canvas, diagrams, mechanisms, maps, bounded objects, or narrative motion carry the claim.

In the first response, name the evidence relation and transferable pattern in one sentence. Choose Main by evidence geometry and state organisation, not topic similarity; then issue parallel `Read` calls for exactly one reference and one Main from the same category. Do not read any other sample. Never combine references or use `general` as a base layer beneath another category.

Develop the same decision with the selected reference; do not write a separate contract.

## References

- `general`: `<skill-dir>/references/general.md`
- `chart`: `<skill-dir>/references/chart.md`
- `3d`: `<skill-dir>/references/3d.md`

## Samples

Read path: `samples/bundles/<category>/<id>.mini.md`

### general

- escapement — stable component identities and authored states expose a mechanism across one stage.
- lenna-image-lineage — editorial scale, repetition, focus, and authored progression make continuity visible.
- neuron-to-formula — stable correspondences carry one object across anatomical, diagrammatic, and symbolic states.
- rain-paths — comparable mini-landscapes share a grammar while each path remains distinct.

- wine-bottle-choice — A stable object lineup uses original rotation frames, focus, and reveal to expose category evidence.

- menu-reading-room — Original scans move from a spatial collection into a readable zoom-and-pan inspection surface.

- walk-photo-journal — A persistent route joins dated photographs and videos to their geographic and narrative positions.

- flipbook-branches — Synchronized image sequences expose divergent branches through a shared frame index and stable panels.

- iconography-lens — Registered masks reveal overlapping motifs without moving the underlying original image or its landmarks.

- pantheon-index — A dense original sprite index links compact visual identities to detailed illustrations and related records.

- music-sample-pair — Paired original recordings, waveform regions, and sequential playback make a source-to-derivative correspondence inspectable.

- masked-wrestler-index — A sprite atlas preserves individual identities across an animated pixel reveal, an index, and linked biographies.

### chart

- climate-zone-shift-map — a native geographic map uses stable anchors to compare spatial category change.
- lenna-scroll-bars — a common scale and authored disclosure turn bars into an editorial narrative.
- pollinator-network — direct labels, bridge nodes, and weighted edges make network structure inspectable.
- solar-storage — a shared time axis and annotations expose lag and the storage gap.
- swarm-spectrum — a directly labelled beeswarm combines position and occurrence area without decorative chrome.

- waistline-cohorts — Stable image identities and percentile interpolation expose how overlapping cohorts occupy a shared scale.

- brand-size-atlas — Aligned intervals and a common measurement axis reveal disagreement among category labels.

- wine-animal-rankings — Original object images retain identity while metric-driven ordering changes on a shared ranking field.

- illustrated-cover-shelves — A common image-shelf grammar links individual covers, yearly cohorts, and aggregate proportions.

- jersey-edition-board — Original uniform images act as stable category keys for game counts and edition comparisons.

- dog-flow-atlas — Paired geographic flows use a shared breed identity and count encoding to compare inbound and outbound movement.

- population-clock — A shared time state maps real observations into alternative geographic and population encodings.

- banknote-firsts — Original portraits and banknote images form a chronological index with explicit missing-image states and gender comparisons.

- foundation-shade-desk — Common histogram bins and count-driven opacity reveal distribution differences across paired product ranges.

- artist-repetition-lab — Individual song points and a shared reference distribution connect within-group variation to a population baseline.

- yearbook-hair-timeline — Original image cohorts remain registered to a shared time series, connecting aggregate measurements to visual evidence.

- dress-code-clothing — Stable grouped labels use authored highlighting and original counts to separate prevalence from category composition.

### 3d

- gimbal — stable part identities, authored cameras, and adjacent evidence explain spatial behavior.
- population-mountains — synchronized spatial and profile views connect position, height, and quantity.
