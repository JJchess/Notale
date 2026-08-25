---
name: compose-page
description: "Turn a lesson claim and its evidence into a clear 1600x900 Notale page composition. Use when planning, implementing, or repairing the spatial hierarchy, knowledge relationship, explanatory visual, controls, annotations, and density of a projected interactive lecture page."
---

# Compose Page

Make the knowledge relationship occupy the page. Compose one fixed projected frame, not a scrolling site, a dashboard, or a collection of interchangeable cards.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command:

1. Read [relationship-compositions.md](references/relationship-compositions.md).
2. Also read [framing-and-density.md](references/framing-and-density.md) when the brief requires three or more peer groups, repeated panels, structural rules, guides, callouts, cut edges, or an explicit repair of a sparse or crowded frame.
3. Do not load other workflow references.

## Preserve the Notale contract

- Work in the `1600x900` logical coordinate system and keep the stage free of scrolling.
- Treat `56px` horizontal and `28px` vertical stage padding as already consumed when the shared theme uses the standard Notale inset; the resulting working area is `1488x844`.
- Preserve the contract, theme classes, `#stage`, page data attributes, chassis scaling, and supplied assets.
- Keep `#stage` as a flex column. Give the main content `flex:1` and `min-height:0`; add `.min0` to every flex/grid child that must shrink.
- Use `position:absolute` only inside a bounded visual or annotation field. Never use `position:fixed` inside the scaled stage.
- Keep the first frame teachable and every essential state inside the canvas.

## Workflow

### 1. Reduce the page to one teaching sentence

Write internally:

`The learner should see that <claim> because <visible relationship/evidence>.`

Inventory only what must appear to prove that sentence:

- the claim or question;
- the primary visual model, media, diagram, or data display;
- labels and evidence attached to it;
- the one main interaction path, if planned;
- the current value, legend, hint, or feedback needed to interpret the state.

Move supporting facts to another page or a disclosure when they do not change the sentence. Do not shrink everything to preserve unnecessary copy.

### 2. Identify the knowledge geometry

Choose the relationship before choosing columns:

- **Process:** show direction, order, causality, or state progression with a path or axis.
- **Comparison:** put alternatives on a shared dimension, scale, baseline, or aligned row.
- **Classification:** make containment, nesting, or indentation visible.
- **Generalization:** make the claim dominant and attach every support to one trunk.
- **Exploration:** center one model and place controls beside the property they change.
- **Single focus:** let one image, object, formula, or question dominate with only necessary annotation.

Do not use a two-column split or card grid as a substitute for a relationship.

### 3. Budget the frame

Sketch the composition with named rectangles before coding. Include actual pixel or percentage bounds and the mobile/browser-independent `1600x900` stage coordinates.

- Keep the page title zone compact, usually `72–112px` high including its gap.
- Give the explanatory visual or relationship the largest uninterrupted region, normally `55–72%` of the working area.
- Keep controls and live readouts in one nearby instrument cluster rather than scattering them around the frame.
- Keep hints, captions, and source notes in a stable quiet edge; do not float them over busy media.
- Limit the first-level composition to two or three zones. Nested boxes do not create hierarchy.
- Aim for meaningful occupancy between roughly `45%` and `85%`. Enlarge the teaching relationship when sparse; remove or split content when crowded.

### 4. Place the visual and interaction first

1. Size the primary visual for the labels and states it must support.
2. Reserve label lanes before drawing connectors; route lines without crossing text or controls.
3. Put each control close to its affected property and keep its resulting readout in the same visual neighborhood.
4. Show an informative initial state. Do not begin with an empty chart, invisible object, or animation at zero information.
5. Keep one main interaction path for one relationship. Avoid duplicate buttons, sliders, and direct manipulation that all do the same thing.
6. Keep selected, correct/incorrect, disabled, and feedback states inside the same geometry so the layout does not jump.

### 5. Implement resilient geometry

- Prefer flex for one-dimensional allocation and grid only for genuine row-and-column alignment.
- Size top-level regions with fixed header/footer bounds plus a flexible main region. Avoid arbitrary fixed heights on normal content blocks.
- Let SVG use a coherent `viewBox`; let canvas fill a positioned parent with `.cv-fill` and chassis fitting helpers.
- Convert pointer coordinates with `Deck.pt()` on scaled interactive surfaces.
- Keep media cropped intentionally with `object-fit`, not stretched to occupy leftover space.
- Keep shared theme classes for shared relationships; put page-specific geometry near the page.
- Draw connectors, baselines, brackets, and nesting directly enough that the relationship survives with fills removed.

### 6. Inspect, then revise by cause

Render the complete page at `1600x900` and inspect a screenshot. Exercise every major interaction state, then use the available page checker for JavaScript errors, resource failures, overflow, and clipping.

Review in this order:

1. Can a viewer identify the focal relationship in two seconds?
2. Does eye movement follow the intended teaching order?
3. Are connected labels visually closer to their evidence than to unrelated objects?
4. Does the full page fit without clipped text, controls, canvas, or SVG?
5. Is any card, divider, corner, or glow merely filling space?
6. Does the layout remain stable across initial, active, feedback, and reduced-motion states?

Fix the allocation model when several elements overflow or leave a void. Fix one component only when the fault is local. Re-render after every geometry change.

## Deliverable

Return the requested page artifact with its visible relationship, visual region, control cluster, annotations, and states implemented. When the task requests a composition proposal rather than code, provide the teaching sentence, relationship type, named regions with bounds, interaction path, and state plan—enough for another agent to build without choosing a new layout.
