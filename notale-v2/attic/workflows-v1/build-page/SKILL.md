---
name: build-page
description: "Compose the whole 1600x900 page: layout, typography, and motion that expresses state. The default for static and narrative pages."
---

# Build Page

Make the knowledge relationship occupy the page. Compose one fixed projected frame, not a scrolling site, a dashboard, or a collection of interchangeable cards. Motion, when the page needs it, connects that composition's still states — it never carries meaning the composition itself is missing.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command:

1. Read [relationship-compositions.md](references/relationship-compositions.md).
2. Also read [framing-and-density.md](references/framing-and-density.md) when the brief requires three or more peer groups, repeated panels, structural rules, guides, callouts, cut edges, or an explicit repair of a sparse or crowded frame.
3. Once Step 6 below selects a motion engine, also read [motion-engine-recipes.md](references/motion-engine-recipes.md) — read only the section for the one engine chosen (CSS, Web Animations API, GSAP, Canvas, or Lottie).
4. Do not load other workflow references.

The `<anti_ai_slop_copy>` and `<anti_ai_slop_visual>` blocks already in this system prompt apply to every page claim, label, explanatory sentence, composition, and surface treatment — they are not conditional reading, follow them directly.

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

Cap the reading load a viewer takes in per beat the same way: prefer 4–6 short bullet lines, or 3–4 compact cards inside any single instrument cluster. When a relationship genuinely needs more than that, group it into two or three named clusters instead of one long list. Treat overflow exactly like overflow space — split to another page or a disclosure, never shrink text past comfortable reading size just to fit more lines.

### 2. Confirm the knowledge geometry

Choose the relationship type this page's claim actually needs — the brief no longer specifies one; that decision is yours. Then map it to a geometry:

- **Process:** show direction, order, causality, or state progression with a path or axis.
- **Comparison:** put alternatives on a shared dimension, scale, baseline, or aligned row.
- **Classification:** make containment, nesting, or indentation visible.
- **Generalization:** make the claim dominant and attach every support to one trunk.
- **Exploration:** center one model and place controls beside the property they change.
- **Single focus:** let one image, object, formula, or question dominate with only necessary annotation.

If the brief's relationship is genuinely ambiguous or missing, resolve it against the teaching sentence from Step 1 rather than inventing a parallel structure. Do not use a two-column split or card grid as a substitute for a relationship.

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
- Never negate a CSS function with a leading `-` — `-clamp(...)`, `-min(...)`, and `-max(...)` are silently dropped by the browser with no console error, and the element just ends up in the wrong place. Write `calc(-1 * clamp(...))` instead whenever a clamped or min/max value needs negating.

### 6. Decide whether this page needs motion

Not every page on the static/handout side of Notale needs motion. Add it only when change over time, continuity, sequencing, or action feedback carries part of the teaching point — staged explanations, state transitions, animated diagrams, playback controls, coordinated timelines. If the still composition from Steps 1–5 already teaches the relationship completely, stop here; do not add motion merely to decorate a section or to imply the page is unfinished without it.

When motion is warranted, design the still states first — motion connects those states and must never be the only carrier of meaning. Reuse the teaching sentence from Step 1 rather than writing a second one: identify within it what changes, from which state to which state, and what the learner should infer from that change. Decide whether motion starts on load, by explicit learner action, or after a state change; prefer explicit playback for explanatory sequences longer than a brief transition. Delete any motion that does not explain hierarchy, causality, continuity, progress, or feedback.

### 7. Storyboard stable states

Define named beats before writing animation code:

- `ready`: all controls and the starting model are legible.
- `focus`: the relevant subject is identified without hiding context.
- `change`: one transformation or causal step occurs.
- `evidence`: values, paths, annotations, or comparisons reveal the consequence.
- `settled`: the explanatory end state remains readable until replay or reset.

Use only the beats needed. Give each beat observable visual and textual state. Make replay return through `ready`; do not reverse a destructive simulation and assume it equals reset.

### 8. Select one engine

- Use CSS transitions for hover, press, selection, and simple two-state changes.
- Use the Web Animations API for a small controllable sequence without an existing motion dependency.
- Use GSAP only when it is already available and multiple elements require labels, overlap, seeking, or coordinated cancellation.
- Use `Deck.loop()` for Canvas or continuously computed diagrams; retain its stop function and choose an informative reduced-motion still.
- Use Lottie only when a suitable authored asset already exists and the animation is illustrative rather than the live data model.
- Avoid adding an external library for one transition. Do not mix engines for the same sequence.

A single well-orchestrated entrance — one staggered reveal of the page's own elements at `ready` — teaches and delights more than several scattered micro-interactions bolted onto individual widgets. Spend the motion budget there before adding secondary flourishes.

### 9. Choreograph the explanation

1. Animate the primary subject first; introduce supporting labels or traces at the beat where they become useful.
2. Keep the context stable enough to compare before and after. Prefer transforms and opacity over layout-changing properties.
3. Use a small shared motion vocabulary: one quick feedback duration, one state-transition duration, one explanatory duration, and one or two easing curves.
4. Keep labels attached to the object or value they explain. Update textual evidence at the same semantic beat as the visual change.
5. Freeze at `settled`; do not loop a teaching sequence forever. Reserve continuous loops for a process whose continuity is itself meaningful.
6. Make Play/Pause, Step, Replay, or Reset visible when the learner needs control. Route every control through one timeline/controller state.

### 10. Preserve all access paths

- Keep the initial and final states understandable without animation.
- Under `prefers-reduced-motion`, jump between named states or use a short opacity change; retain controls, sequence order, evidence, and completion.
- Provide a textual status or step label when timing communicates progression.
- Keep focus visible and avoid automatically moving focus as beats advance.
- Never flash rapidly, create unbounded parallax, or make essential text move while it must be read.
- Give touch and keyboard users the same playback and replay controls as pointer users.
- Toggle beat visibility through one state attribute or class driving `opacity`/`visibility`/`pointer-events` — never `display:none`/`display:block`. A later layout rule (`.slide-content { display:flex }` and similar) can override a `display` toggle and leave every beat visible at once with no error to warn you; opacity/visibility toggles fail safe instead.

### 11. Make replay deterministic and cleanup complete

Create one controller that owns animations, timers, observers, and listeners. Before Play or Replay, cancel the previous run, restore canonical state, apply the exact ready frame, then start once. Ignore or deliberately restart rapid duplicate commands; never stack timelines.

Pause hidden work, avoid a large time delta after resume, and destroy every timeline, animation, observer, listener, loop, and temporary graphics resource on teardown. Prefer the chassis lifecycle helpers instead of a second global loop.

### 12. Inspect, then revise by cause

Render the complete page at `1600x900` and inspect a screenshot. Exercise every major interaction state and, if the page has motion, every named beat — `ready`, one changing beat, and `settled` — then use the available page checker for JavaScript errors, resource failures, overflow, and clipping at each of them.

Review in this order:

1. Can a viewer identify the focal relationship in two seconds?
2. Does eye movement follow the intended teaching order?
3. Are connected labels visually closer to their evidence than to unrelated objects?
4. Does the full page fit without clipped text, controls, canvas, or SVG?
5. Is any card, divider, corner, or glow merely filling space?
6. Does the layout remain stable across initial, active, feedback, and reduced-motion states?
7. If the page has motion: does one complete sequence show each named beat once, in order, with synchronized visual and textual evidence? Does a second Play/Replay begin from the same ready state and end identically? Does rapid repeated activation leave no duplicate loop, timer, or timeline running? Does reduced motion show an informative still or instant state sequence rather than missing content?

Fix the allocation model when several elements overflow or leave a void. Fix one component only when the fault is local. Re-render after every geometry or motion change; if any Render report contains a failure marker, keep editing and Render again until the report is clean. Leave aesthetic and pedagogical judgment to human review rather than synthetic visual thresholds.

## Deliverable

Return the requested page artifact with its visible relationship, visual region, control cluster, annotations, states, and — when the page has motion — its named beats, controller, and reduced-motion behavior all implemented. Modify only the assigned page file unless the task explicitly grants other files; preserve `#stage`, page metadata, and shared asset interfaces, and use only libraries already exposed by the chassis.

When the task requests a composition proposal rather than code, provide the teaching sentence, relationship type, named regions with bounds, interaction path, and state plan — and, if motion is warranted, the motion claim, trigger, engine, and reduced-motion behavior — enough for another agent to build without choosing a new layout or a new motion design.
