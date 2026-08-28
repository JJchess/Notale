---
name: build-interaction
description: "One bounded learning widget inside the page: the learner manipulates something and sees evidence change, with reset. Not for decorative motion, plain charts, or full games."
---

# Design Interaction

Build one coherent learning widget inside the assigned page. Treat the widget as a bounded component: the host page owns its title, surrounding explanation, outer layout, theme, navigation, and page metadata; the component owns its model, controls, evidence, state, feedback, and lifecycle.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command. Do not defer it until implementation is already underway.

1. Read [widget-core.md](references/widget-core.md) — the operating premise, the private contract, evidence design, composition, state architecture, and input/accessibility. Always read it.
2. Read [pattern-routing.md](references/pattern-routing.md), then read **only the one pattern family it selects**:
   - [pattern-tune.md](references/pattern-tune.md) — set a value, watch it propagate (Instrument, Transformation)
   - [pattern-build.md](references/pattern-build.md) — move or assemble things in space (Manipulator, Constructor)
   - [pattern-observe.md](references/pattern-observe.md) — follow what a system is doing (Tracer, Inspector, Live system)
   - [pattern-judge.md](references/pattern-judge.md) — weigh alternatives or predict, then see (Synchronized comparison, Counterexample, Prediction and reveal)
3. Read a conditional reference only when the brief contains the matching feature:
   - [craft-render.md](references/craft-render.md) once step 4 below picks a rendering medium, or when aligning to host-theme detail
   - [motion.md](references/motion.md) when change over time carries part of the teaching point
   - [recipes.md](references/recipes.md) when you hit one of the fragile mechanics it names; read the recipes you need, not all of them
   - [worked-example.md](references/worked-example.md) when you are unsure how a whole component fits together and want one complete skeleton to read
   - [studies.md](references/studies.md) when you want precedent for a mechanism; optional
4. Read [delivery.md](references/delivery.md) after the component works and before you deliver.
5. Do not read an unselected pattern family. Do not read unmatched conditional references. Do not load an unrelated workflow reference.

## 1. Read the host contract

1. Read the assigned page specification, shared contract, and `CHASSIS.md`.
2. Preserve the specified lesson boundary, exact copy and values, allotted page region, theme semantics, `#stage`, `data-page`, `data-total`, and shared assets.
3. Let the page specification determine the outer title zone and page skeleton. Do not use the widget reference to invent a parallel page composition or visual system.
4. Identify the one region that will host the widget. If the specification includes supporting prose, place it in the prescribed outer region rather than turning it into widget chrome.

## 2. Define the component boundary

Before coding, write a compact private contract using the fields from the reference:

- insight;
- learner action;
- manipulated quantity;
- visible evidence;
- meaningful states and reveal rule;
- internal anatomy;
- rendering medium;
- exact reset and cleanup behavior.

Create one component root inside the allotted region. Scope page-specific CSS beneath that root and scope selectors, state, timers, observers, and listeners to the component. The delivered file may contain the component inline, but its behavior must not depend on page-wide element lookup or leak styles and events into the host.

## 3. Adapt the component to Notale

- Fill the region assigned by the page; do not make the component decide the page's full-frame padding, navigation, or background.
- Reuse the theme's tokens and semantic classes. Add only the component geometry and states the theme does not supply.
- Use `Deck.pt()` for pointer coordinates on scaled custom surfaces.
- Use the chassis resize or fitting helper that matches the renderer, such as `Deck.autofit()` for state-driven Canvas, and retain every returned stop function.
- Use `Deck.loop()` or the documented page animation interface when continuous work is necessary; keep the component's still state meaningful under reduced motion.
- Prevent interaction keys from reaching deck navigation only while a focused component control consumes them. Never capture deck keys globally.
- Keep essential labels, instructions, controls, values, and accessible status in DOM or SVG even when the model is drawn on Canvas.

## 4. Implement from state outward

1. Build the informative initial state and the primary visual evidence first.
2. Route every input through the component's canonical state and one idempotent render/update path.
3. Add the main action, then the intermediate, extreme, failure, reveal, and completion states required by the private contract.
4. Add deterministic reset when the learner can leave the initial state. Reset must cancel active work before restoring and rendering state.
5. Add keyboard/touch alternatives and textual feedback without creating a second interaction model.
6. Centralize teardown so listeners, observers, timers, frames, pointer capture, and owned graphics can be safely released once or repeatedly.

## 5. Integrate without expanding scope

- Implement the required outer page copy and layout exactly as specified, then let the widget dominate its allotted teaching region.
- Do not add another widget, dashboard, article section, page navigation, or decorative system to make the page feel fuller.
- Do not modify shared assets or another page unless the task explicitly grants that scope.
- Keep all essential component states inside the fixed `1600x900` page and avoid nested scrolling.

## 6. Verify the component and its host

Exercise and inspect at least:

1. informative initial state;
2. one primary pointer action;
3. the equivalent keyboard or non-drag path;
4. one meaningful extreme, negative, failure, or reveal state;
5. reset followed by the primary action again;
6. rapid repeated input and teardown-sensitive work;
7. reduced-motion behavior when motion is present.

Run the available page `Check` for every materially different visual state. Require zero JavaScript errors, failed resources, overflow, clipping, and unreachable controls. Inspect screenshots for component hierarchy and causal clarity; passing synthetic checks does not establish interaction quality.

## Deliverable

Modify only the assigned page file unless explicitly told otherwise. Report the component's learner action, the evidence it changes, supported input paths, reset/cleanup behavior, and the last checks actually run.
