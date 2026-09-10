<!-- 这一份是 build-interaction 的 渲染器与视觉手艺。选定渲染介质、或要对齐主题细节时读。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

## 10. Renderer-specific craft

### Choose the renderer from the representation

Use semantic DOM for:

- controls;
- short records;
- discrete choices;
- sortable or placeable labeled items;
- text-heavy states;
- accessible readouts.

Use SVG for:

- precise lines, vectors, nodes, regions, paths, axes, and connectors;
- small or medium data-bound sets;
- direct manipulation of named geometric elements;
- diagrams whose elements need focus, labels, or individual state;
- analytic curves and boundaries.

Use Canvas for:

- dense fields;
- image-like grids;
- thousands of moving marks;
- particle or pixel-based models;
- a scene that redraws as one surface;
- expensive visualizations that do not benefit from named DOM elements.

Use a hybrid when the layers have different needs: Canvas field plus DOM controls and labels; SVG overlay over Canvas; DOM construction objects beside an SVG consequence view. Keep one canonical state and one coordinated render.

### DOM craft

- Use real controls and concise labels.
- Keep selection state in state, then derive `aria-pressed`, disabled feasibility, classes, and readouts.
- Avoid rebuilding the entire subtree on continuous input.
- Keep changing numbers stable with tabular numerals and explicit formatting.
- Prevent feedback text from changing layout height; reserve a stable local line when necessary.
- Scope selectors beneath the component root.

### SVG craft

- Use a viewBox that matches a useful drawing coordinate system.
- Use named groups for semantic layers: construction, data, active path, annotation, handles.
- Compute analytic geometry and update attributes; do not approximate a crisp boundary by sampling dots.
- Add `vector-effect="non-scaling-stroke"` where scaled hairlines must stay crisp.
- Define arrowheads, clips, masks, and gradients with component-unique IDs.
- Keep text horizontal and legible unless the subject requires rotation.
- Place invisible wider hit paths behind thin visible paths.
- Convert pointer coordinates through the surface bounding box and viewBox.
- Avoid clearing and rebuilding all SVG elements for every pointer move.

Recommended layer order:

```text
background construction
reference geometry / invariant
model data
active or selected evidence
handles and hit regions
labels and local measurements
focus / feedback
```

### Canvas craft

Separate model stepping from drawing. Use the host's Canvas helper and resize callback. Draw at device-appropriate resolution while using CSS pixels for layout and logical coordinates for state.

Recommended draw order:

```text
clear
quiet field/grid
invariant/reference marks
primary model
active consequence/trail
annotations that belong on canvas
```

Keep essential text in DOM when it changes, requires accessibility, or needs exact typography. Canvas labels are appropriate for numerous tightly bound marks, but their font, contrast, and alignment must be deliberate.

Avoid a permanent `requestAnimationFrame` loop for a static instrument. Mark the view dirty and render on demand. For continuous systems, stop the loop on teardown and honor reduced motion.

### Hybrid alignment

When overlaying DOM or SVG on Canvas:

- share a common logical coordinate transform;
- update overlay position after resize;
- ensure page scaling is accounted for exactly once;
- avoid reading layout on every frame;
- keep pointer hit testing in the same coordinate space;
- use stable anchor points rather than guessed offsets.

### Performance priorities

Optimize only after representation is correct:

- cap particle and history counts;
- precompute static geometry;
- cache offscreen image-like layers;
- throttle expensive field recomputation while rendering the final committed value;
- schedule at most one pending render for high-frequency input;
- update DOM text only when its formatted value changes;
- avoid allocating large arrays per frame;
- suspend work when hidden or destroyed.

Performance degradation must not change the logical result or comparison fairness. Reduce visual density or interpolation first.

## 11. Visual craft under the host theme

### Inherit, then specialize

Use host tokens for:

- background and surfaces;
- general text and muted text;
- base borders;
- display and body type roles;
- standard control treatment;
- page-level accent behavior.

Add only component-owned semantics:

- active versus inactive;
- cause versus consequence;
- class/category distinctions required by the subject;
- positive/negative where the domain defines them;
- a concept-specific shape, texture, line, or motion signature.

Do not replace the host background, import another font system, or wrap the component in an unrelated themed poster.

### Define a concept signature

Before CSS, write one sentence:

```text
The component will be remembered for …
```

Good signatures emerge from the model:

- a decision boundary pivoting around its bias;
- a space visibly folding until classes separate;
- responsibility flowing backward along a stable graph;
- identical runners diverging on one shared terrain;
- a kernel window carrying source cells into an output;
- a constraint rail compressing as objects are selected;
- a trajectory leaving a fading but persistent envelope.

Bad signatures are generic effects:

- neon glow;
- glass cards;
- gradient blobs;
- floating particles unrelated to the model;
- a giant decorative number;
- a hover lift applied to everything.

### Shape language

Let shape express the subject:

- vectors, axes, construction lines, and dimension ticks for geometry;
- channels, pulses, and junctions for propagation;
- cells, footprints, and mapped outputs for local operators;
- rails, sockets, and capacity bands for constraints;
- fields, contours, and trajectories for optimization;
- layers, folds, and correspondence threads for transformations.

Repeat a small shape vocabulary consistently. Do not mix pills, soft blobs, sharp technical cut corners, glass panels, and cartoon badges without a conceptual reason.

### Semantic color

Use a restrained budget:

- host surface and ink;
- one primary active accent;
- one secondary consequence or comparison accent when necessary;
- domain category colors only when categories carry meaning;
- warning/error/success colors only for actual domain semantics.

Keep each color role stable across states and coordinated views. If cyan means input in the model, do not reuse it for a different “best result” badge. Use opacity, stroke weight, pattern, or enclosure to show intensity without multiplying hues.

### Hierarchy

Exactly one element dominates: the model, field, trajectory, or transformation. Establish hierarchy through:

- area;
- contrast;
- spatial centrality;
- detail;
- motion;
- annotation density.

Controls should be discoverable but subordinate. Readouts should be close but not louder than what they measure. If two views are equally large, they must be a true comparison; otherwise demote one.

### Spacing and alignment

Use the host rhythm and a small internal spacing scale. Align:

- control labels with their values;
- compared plots to shared baselines;
- local readouts to measured geometry;
- steps to stable graph coordinates;
- probe detail to the overview footprint;
- formula terms to the objects they describe.

Irregular gaps and near-missed alignments read as machine-generated even when colors are attractive.

### Typography and numbers

- Use host type roles.
- Keep labels short and in the page language.
- Do not create bilingual interface labels unless the domain term genuinely requires both.
- Format all changing numbers with deliberate precision.
- Use tabular numerals for changing readouts.
- Pair units with values consistently.
- Avoid tiny uppercase labels when Chinese or projection distance makes them hard to read.
- Do not repeat the page title inside the component.

### Controls as instruments

Controls should feel coupled to the model:

- slider track may carry meaningful ticks or regimes;
- a play button reflects running/paused state;
- a step control advances one actual transition;
- a preset names a diagnostic condition;
- a constrained object previews feasibility;
- a direct handle visually belongs to the geometry.

Give every actionable element hover, active, focus, and disabled treatment. Do not overstyle standard controls into ornamental objects that obscure their function.

### Local annotation

Prefer:

- leader lines;
- on-path labels;
- bracketed dimensions;
- small formula terms;
- direct object labels;
- threshold marks;
- origin and endpoint labels;
- shared axis notes.

Avoid:

- remote prose cards;
- legends for two directly labelable items;
- instruction badges;
- status cards;
- repeated section headings inside a small component.

### Craft check

Before technical QA, ask:

1. Is the model visibly dominant?
2. Is the concept signature derived from the subject?
3. Does the host theme remain intact?
4. Are cause and consequence visually distinct?
5. Are comparable states spatially and numerically fair?
6. Does every control feel attached to what it changes?
7. Can redundant panels, borders, labels, or effects be removed?
8. Would a still screenshot communicate the current relationship?

