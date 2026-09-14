# General Authored Page

The claim must remain understandable without the learner changing a governing model. Step 0 establishes the subject and useful starting evidence; chassis-controlled steps develop the explanation into a complete, inspectable final state.

## Develop the construction decision

Use these questions to refine the claim and evidence already chosen in the first response; no separate written contract:

| Decision | Required answer |
|---|---|
| Audience | What can the learner already recognize without explanation? |
| Page job | Compare, trace, classify, locate, inspect, generalize, or explain a mechanism? |
| Decisive evidence | What visible fact makes the claim credible? |
| Entities | Which objects, states, labels, values, and relations must remain identifiable? |
| Representation | Reference map, mechanism view, transformation, comparison, illustration, or bounded object? |
| Reading path | Where does attention begin, what relation follows, and where does it resolve? |
| Motion role | What hierarchy, correspondence, state, process, or atmosphere benefits from change over time? |
| Signature | Which subject-specific visual event makes this page memorable? |
| First view | What subject, objects, and starting evidence are visible at step 0, and what relationship will subsequent steps establish? |

Remove material that does not serve the claim. If it cannot fit, remove repetition and secondary material while preserving readable type, decisive evidence and necessary conditions. Steps and interaction serve understanding, not capacity avoidance.

## Choose representation from intent

Choose the representation from the question's verb, not its topic noun:

| Intent | Primary representation | Visible invariant |
|---|---|---|
| What is it made of? Where is it? | Reference diagram, section, map, nested structure | Stable labels, containment, orientation, and scale |
| How does it work? Why does it happen? | Functional mechanism, cross-section, spatial metaphor | Inputs, changed property, path, and outcome |
| What happens in what order? | Directed path or authored state sequence | Stable identities and the change at each transition |
| How do cases differ? | Aligned comparison or shared baseline | Common scale and exactly controlled difference |
| What belongs together? | Grouped field, branches, or nested regions | Membership rule and sibling distinction |
| What stays invariant? | Multiple examples converging on one relation | What varies, what stays fixed, and resulting rule |
| How does a part relate to the whole? | Focal object, section, exploded 2D layers, aligned callouts | Part identity preserved in whole context |
| What does a product or interface look like? | Bounded object in a designed host field | Clear boundary between the page and represented object |

Do not choose a flowchart because the subject contains a process noun, or an illustration because the subject is physical. Choose the form that exposes the asked relationship.

## Separate reference and intuition views

A **reference view** gives a stable map that can be pointed into later. It favors exact labels, ordered paths, containment, structural grouping, and predictable geometry.

An **intuition view** makes a mechanism directly visible. It favors recognizable functional parts, sections, flows, forces, accumulation, and a simplified spatial metaphor.

Choose one language as primary. If both are necessary, give one the dominant stage and use the other as a compact locator or legend. Do not create an unresolved hybrid whose shapes look schematic while its connectors, perspective, and textures imply a physical scene.

For intuition views, draw the mechanism rather than a diagram about the mechanism:

- use a recognizable functional silhouette before decorative detail;
- show the part that changes, the direction or field producing change, and the resulting state;
- let labels confirm object identity instead of substituting for shape;
- show continuous physical properties with continuous encodings, and categories or states with discrete theme roles;
- retain enough context to locate the mechanism without redrawing the entire real object.

For abstract mechanisms, invent a spatial metaphor only when its geometry preserves the real relation. Name what position, distance, enclosure, flow, or transformation means; remove metaphorical features that imply false rules.

## Compose one dominant evidence field

Allocate space in this order:

1. decisive evidence or mechanism;
2. labels, values, units, and annotations needed to read it;
3. claim and short interpretation;
4. genuine comparison or inspection controls, when needed;
5. supporting context.

The evidence stage should read as one world, not as a collection of independent parts. Place status and values inside or immediately beside the region that produces them. Keep the claim close enough to be tested against the evidence without eye travel across unrelated panels.

Use geometry to encode relations:

- alignment for comparison;
- shared baselines and scales for magnitude;
- paths for sequence, flow, or transformation;
- containment for membership and part–whole relations;
- proximity for local association;
- repeated identity for correspondence across states;
- occupied area and contrast for hierarchy.

Group explanation with proximity, negative space, alignment, and guides. Do not put individual facts, teaching beats, or comparison cases into decorative cards, including a stack beside the main diagram. Place their labels and evidence in the shared scene. Enclosure must encode a real object or relation, such as a represented interface or physical vessel; it must not merely package a paragraph.

## Build a subject-specific visual world

The supplied theme sets the direction and offers shared styling foundations. Design the content world's visual expression from the subject; theme classes are optional tools, not mandatory containers.
Keep its typography hierarchy and shape/material language for equivalent roles; subject-driven geometry is not permission to invent a separate page skin. Chart libraries should carry the published stroke, point and label treatment, not just its palette.

Choose:

- **material:** a real artifact, notation, tool, texture, field, or environment from the subject;
- **shape vocabulary:** silhouettes, line behavior, edge quality, and proportions that fit that material;
- **scene layers:** background field, governing structure, evidence objects, annotations, and sparse accents;
- **motion vocabulary:** precise, elastic, drifting, accumulating, mechanical, fluid, or stepwise behavior justified by the subject;
- **signature visual:** one relationship made unusually tangible.

Assign theme colors semantically and keep their roles stable. Categories use distinct roles; intensity and continuous physical state may use a continuous ramp. Never rotate colors merely to distinguish ordered steps.

Texture comes from meaningful repetition—hatching, stipple, fibers, contour marks, strata, traces, particles, or generated variation. Apply it selectively to describe material or depth. Blur, grain, glow, gradient, and noise are treatments, not the visual concept.

Background, middle ground, and foreground need distinct responsibilities and contrast budgets. The background establishes field or scale; the middle ground carries the mechanism; the foreground frames, annotates, or reveals controlled occlusion. If a layer has no different role or update rate, merge or remove it.

## Calculate diagram geometry

Use real copy before fixing geometry. Estimate label widths from the actual font metrics when possible; otherwise use a conservative character-width estimate and verify in the browser.

For repeated labelled nodes, calculate:

`node width = max(minimum shape width, longest label width + 2 × horizontal padding)`

Then calculate total tier width, inter-node gaps, container padding, annotation margin, and the longest connector route. Do not shrink text to rescue a layout that exceeds capacity.

Before drawing connectors:

1. place semantic entities and label bounds;
2. reserve quiet lanes for paths and callouts;
3. route each path from object boundary to object boundary;
4. check every segment against unrelated objects and labels;
5. move geometry or choose another orientation before accepting a crossing.

Connector rules:

- `fill: none` for open paths;
- one arrowhead at the true destination;
- visible line endings at object edges, not under object centers;
- stable path language for the same relation type;
- no decorative line that implies direction, causality, or dependency;
- labels placed on quiet segments or in aligned callouts, never over intersections.

Callouts should collect in one quiet region when possible. Align their labels, keep leader lines unambiguous, and point to the exact feature rather than the object's general area.

Use a ring only when cyclic spatial continuity is itself the claim. A process that merely returns to an earlier state may be clearer as a directed path with an explicit return relation. Count entities and edges before committing to a circular or nested layout.

## Select the renderer

Choose the lightest renderer that preserves the evidence:

| Need | Renderer |
|---|---|
| Text, supplied imagery, ordinary layout, and simple motion | Semantic HTML and CSS |
| Labelled vectors, diagrams, maps, paths, and hundreds of inspectable shapes | SVG |
| Procedural drawing, pixels, dense custom marks, or traces | Canvas or p5 |
| Grouped transforms, authored pan/zoom, or bounded hit-tested inspection | Konva |
| Thousands of sprites, particles, or frequently updated repeated marks | PixiJS |

Do not add a second renderer to compensate for an unclear representation. Prefer DOM or SVG for meaningful text and labels. Keep labels, units, controls, and accessible evidence outside raw pixels even when Canvas carries the primary scene.

### SVG construction

- Set a logical `viewBox` and let CSS size the host.
- Group entities by semantic role and give each a stable ID.
- Keep connector paths behind nodes and annotations above evidence.
- Use explicit `<tspan>` lines for controlled wrapping; do not depend on implicit SVG text wrap.
- Measure or conservatively budget the longest label before setting node sizes.
- Render state through keyed groups rather than rebuilding anonymous shapes in a changing order.

### Canvas and p5 construction

- Separate immutable configuration, canonical scene data, theme color roles, and mutable authored state.
- Use one logical coordinate system shared with DOM overlays.
- Use one loop only when the scene changes continuously; `noLoop()` or render on invalidation for a settled scene.
- Use offscreen buffers only for layers with different update rates, persistent traces, masks, or costly stable geometry.
- Clamp time deltas, pause nonessential work while hidden, and avoid allocation or DOM work in the hot loop.
- Rebuild deterministically on resize when geometry depends on host dimensions.

### Pixi construction

- Keep canonical position, category, state, and identity outside sprites.
- Use ordinary containers for independently authored objects and a particle container only for many repeated marks.
- Pool records and sprites; reuse textures and geometry.
- Keep explanatory labels and controls in DOM or SVG.
- Track ownership of textures and avoid destroying shared assets during teardown.

## Preserve one scene model

Meaningful entities retain stable identity across renderers and authored states:

```js
const pageState = {
  beat: 'overview',
  progress: 0,
  selectedId: null,
  entities: [],
  view: { width: 0, height: 0 },
  reducedMotion: false
};
```

Store relations, labels, ordering, geometry, and named states outside renderer nodes. Derive DOM, SVG, Canvas, and displayed values from this state. Do not recover truth from CSS classes, partially animated transforms, pixels, or sprite order.

Choose logical scene dimensions independent of CSS size. Compute one logical-to-host transform for marks, overlays, and optional inspection. Use the actual rendered host rectangle for resize and coordinates; do not combine CSS scaling with a second undocumented correction.

## Use motion as page language

Use Deck steps for the teaching progression, including comparison and evidence focus. Build one stable scene whose objects, paths, differences, and annotations change meaningfully; do not reveal a sequence of boxed sections. Animation can connect states but does not replace keyboard-controlled teaching steps.

Design named states before transitions:

- `initial`: complete orientation and unresolved relation;
- `focus`: the evidence currently receiving attention;
- `decisive`: the state that proves the claim;
- `settled`: a stable inspectable result;
- `reduced`: the equivalent state without nonessential interpolation.

For an authored sequence, define each beat by what becomes understandable, what remains visible, what changes, and why the reader needs a hold. Preserve IDs, color roles, labels, baselines, and landmarks across beats. Comparison and progressive focus are useful beats even when their order is not mathematically necessary.

Transfer sample states to the chassis instead of copying sequential tabs, next buttons, or autoplay. DOM/SVG evidence can use `data-deck-step="1"`. For a drawn scene, register `Deck.onStep(renderStep, states.length - 1)`: states 0/1/2 mean maxStep 2. `renderStep(step)` must reconstruct the entire selected state, including labels and earlier evidence, so direct jumps and backward navigation work. Initialize the scene before registering, since the callback runs immediately. Cancel prior transitions before rendering another step.

Choose the smallest motion mechanism that fits the authored behavior:

- CSS transitions for one or two state-linked properties;
- Web Animations for a few coordinated DOM/SVG tracks that need cancellation or replay;
- GSAP timeline when the host already provides it and named labels, overlap, nesting, seeking, or synchronized replay materially simplify the sequence;
- one Canvas/p5 clock or state machine for continuous drawn geometry.

With GSAP, use labels that match named page states and the position parameter for overlap. Use timeline defaults for shared durations and easing. Own one top-level timeline, cancel or kill it before reconstruction, and do not chain a sequence through scattered `delay` values.

Let the chassis own teaching navigation; derive annotations and visual state from its step. Keep free inspection controls only for their actual inspection purpose. Continuous motion stays within the current teaching step. Under reduced motion or `?all`, show the complete review state without requiring playback.

Ambient motion is permitted when it reinforces material or spatial depth. Keep it slower and lower contrast than explanatory motion, stop it while hidden, and make no claim depend on it.

## Keep inspection authored

Hover, focus, selection, pan, zoom, or filtering may reveal predetermined detail without turning the page into a learning interaction.

- Make initial evidence useful without inspection.
- Mirror hover detail through focus or a semantic list.
- Keep selected detail visible long enough to read.
- Let Reset restore the exact authored overview.
- Bounded inspection must not change the governing model, constraints, success criteria, or meaningful next actions.

## Make resize and lifecycle deterministic

- Measure the actual host with one observer.
- Recompute logical-to-host transforms and overlays from canonical geometry.
- The fixed logical stage scales as one picture; verify labels and overlays at the displayed size.
- Preserve the evidence region, real labels, and title before decorative detail.
- Initialize each renderer once, update existing instances, and keep one owned animation clock.
- On reset, cancel active motion before restoring the initial snapshot.
- On teardown, stop animation frames and timelines, disconnect observers, remove listeners, release pointer capture, destroy renderer instances, and release owned graphics resources.

## Provide semantic evidence

- Keep headings, explanatory copy, important labels, values, and controls in semantic DOM or accessible SVG.
- Preserve visible focus and a keyboard route for any authored inspection control.
- Keep units attached to values and relationships.
- Provide an ordered textual description, compact list, or decisive still when the primary renderer fails.
- Under reduced motion, preserve every state and conclusion; remove only interpolation and ambient movement.

## Repair failures

| Failure | Structural cause | Repair |
|---|---|---|
| Component cabinet | Independent regions replaced one relationship | Recompose around one evidence stage and shared geometry |
| Label fog | Text compensates for weak objects or no callout lanes | Improve silhouettes, align callouts, and reserve label space |
| Diagram about a mechanism | Labels name parts but do not expose operation | Draw functional parts, changed state, path, and outcome |
| Primitive soup | Generic shapes have no subject identity | Build functional silhouettes and subject-derived geometry |
| Reveal theater | Motion delays evidence without changing interpretation | Show the decisive state directly and retain only useful motion |
| Dead canvas | A custom renderer is static, flat, and visually unfinished | Add subject material, layer roles, signature detail, and restrained life |
| Dirty remount | Loops, observers, or canvases survive | Centralize ownership and teardown, then remount-test |

## Verify the complete page

- State the page claim using only visible evidence.
- Trace each conclusion to an object, path, value, or spatial relation.
- Inspect initial, focus, decisive, settled, and reduced-motion states as still compositions.
- Test the longest real label and most crowded relation at the target display size.
- Confirm connector endpoints, callout targets, overlays, and optional hit regions remain aligned after resize.
- Use the existing Check step states to verify real evidence changes, backward restoration, and a complete final state; zero runtime errors alone does not establish this. Inspect that steps modify one scene rather than introduce separate bordered panels. Reuse the same Check, without adding a separate checking loop.
- Replay, interrupt, jump, reset, and replay again when authored motion exists; verify one controller and no stale completion.
- Confirm theme roles remain semantically stable across states.
- Confirm zero clipped text, hidden evidence, failed resources, runtime errors, duplicate loops, and leaked renderer resources.
- Render a screenshot at target size and thumbnail size; the evidence stage, reading path, and signature visual must survive both.
