---
name: build-2d-sim
description: "Build deterministic, visually legible interactive 2D teaching models with explicit rules, controls, feedback, and reset behavior. Use when learners must manipulate a physical system, explore collisions or constraints, drag meaningful objects, or observe thousands of animated 2D elements; includes separating physics bodies from polished custom visuals when familiar objects must remain recognizable."
---

# Simulate in 2D

Build a manipulable model whose visible behavior follows a small, explainable rule set. Use the renderer as a view of state, never as the only source of truth.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command. Do not defer it until implementation is already underway.

1. Read the assigned brief, page specification, shared contract, `CHASSIS.md`, and chassis `LIBS.md`.
2. State the concept, learner action, observable consequence, and success condition.
3. Read [renderer-routing.md](references/renderer-routing.md).
4. Select exactly one primary engine:
   - Use **Konva** for draggable shapes, handles, groups, transforms, and hit-tested diagram scenes.
   - Use **Matter.js** when collision, gravity, momentum, joints, ropes, stacks, or constraints carry the meaning.
   - Use **PixiJS** when thousands of sprites or particles must update smoothly and the behavior is authored directly.
5. Read only the selected recipe:
   - [konva-recipe.md](references/konva-recipe.md)
   - [matter-recipe.md](references/matter-recipe.md)
   - [pixi-recipe.md](references/pixi-recipe.md)
6. Do not combine engines. Do not read an unselected recipe. Route the page elsewhere if one primary engine cannot express its teaching model.

Choose an engine for behavior, not for artwork. Matter.js supplies physics and a basic renderer; it does not contain a vehicle, person, machine, or classroom asset library.

## Follow the workflow

### 1. Write the model contract

Define before rendering:

- entities and stable IDs;
- adjustable parameters, valid ranges, and units;
- initial state, derived quantities, and invariants;
- one misconception the interaction should expose;
- permitted learner actions and the feedback for each;
- reset, pause, completion, and failure behavior;
- the sentence that must remain true for every permitted state.

Remove motion that does not help a learner predict, compare, or explain.

### 2. Separate model, view, and controls

- Keep canonical state in serializable plain data.
- Implement `reset()`, `step(dt)`, `applyAction(action)`, and `render(state)` as distinct responsibilities.
- Let the renderer mirror state; do not read a sprite position as the authoritative answer.
- Derive labels, counters, and explanations from the same state used by the scene.
- Put user-facing controls and important text in semantic DOM outside the canvas.

### 3. Make familiar objects recognizable

- Before coding, name three silhouette or construction cues that identify each familiar object without a label.
- Keep collision bodies and visible artwork separate. A body may be a rectangle while its view is a layered SVG, custom Canvas drawing, Konva group, or supplied local image.
- Use `Matter.Render` as a diagnostic view unless primitive bodies are themselves the lesson. Do not ship a cart, body, animal, or instrument as unarticulated rectangles and circles merely because its colliders use those shapes.
- `body.render.sprite.texture` can display a local image supplied by the page, but Matter.js supplies no textures or model catalog.
- Keep functional parts visible: supports, joints, contact points, load path, controls, and scale cues should agree with the model state.
- Inspect the scene at quarter size with labels hidden. If the subject is no longer identifiable, improve the silhouette before adding polish.

When an authored visual is needed, obtain or create the local SVG/raster first, record its source when applicable, then bind it to state. Never substitute emoji or a debug collider for the teaching object.

### 4. Make every run reproducible

- Load `assets/lib/seedrandom.min.js` when generating samples or initial positions.
- Create a named fixed seed and keep the RNG local. Never replace global `Math.random`.
- Use a fixed simulation step for rule-dependent motion; clamp elapsed real time after a suspended tab.
- Save the complete initial state, including RNG seed, so Reset reproduces the same scene.
- Use stable iteration order and stable entity IDs.
- Keep scored or narrated outcomes deterministic under the permitted interactions.

### 5. Build the smallest complete interaction

- Implement the core action and consequence before decoration.
- Give draggable targets generous hit areas and visible hover, focus, active, and disabled states.
- Offer buttons, sliders, or arrow-key controls as alternatives to drag-only input.
- Keep pointer, touch, and keyboard actions routed through the same `applyAction`.
- Announce meaningful changes through a nearby DOM status element.
- Show values with units and explain why the state changed.

### 6. Fit the page and bound work

- Measure the host container and maintain one logical coordinate system.
- Test pointer mapping under the harness stage scale; do not apply a second correction when the engine already uses the canvas bounds.
- Cap device pixel ratio, particle count, filters, and collision-body count.
- Pool repeated visual objects and allocate no new scene objects in the frame loop.
- Pause when hidden or offscreen when continued simulation does not affect the lesson.
- Degrade density before removing the interaction.

### 7. Add accessibility and fallback

- Label the scene as a figure and provide a concise DOM description of its purpose and current state.
- Keep essential labels, instructions, values, and controls outside canvas.
- Provide a keyboard path to the same outcome as pointer interaction.
- Under reduced motion, pause autonomous motion and allow direct stepped controls or show a meaningful final state.
- If canvas or WebGL initialization fails, leave an explanatory diagram, value table, or step-through DOM control available.

### 8. Clean up completely

- Keep one animation loop, observer, and listener set.
- Stop Matter runners, Pixi tickers, or custom animation frames.
- Destroy stages, renderers, owned textures, bodies, constraints, and transient canvases.
- Disconnect observers and remove document, window, pointer, and keyboard listeners.
- Ensure remounting creates one scene rather than stacking duplicate canvases.

## Deliver

Deliver the requested page and local assets with:

- preserved `#stage`, page metadata, shared assets, and fixed-stage harness behavior;
- one engine selected for a stated reason;
- recognizable visual bodies distinct from debug colliders when the subject is a familiar object;
- a deterministic model contract and serializable initial state;
- visible instructions, values, controls, Reset, and keyboard operation;
- a textual fallback and reduced-motion behavior;
- an explicit cleanup function when remounting is possible.

## Run the minimum smoke

1. Load from the harness-compatible local path and confirm zero JavaScript errors and failed resources.
2. Confirm the scene contains the expected entity count and the initial DOM readout matches model state.
3. Complete the primary interaction with pointer, then Reset and complete it with keyboard.
4. Reset twice and confirm identical initial positions, values, and seeded samples.
5. Pause or hide the page and confirm the loop does not accumulate a destructive time jump.
6. Resize once narrow and once wide; confirm hit testing and labels remain aligned.
7. Emulate reduced motion and force renderer failure; confirm the lesson remains understandable.
8. Run the available `Check` or page self-check and fix runtime, overflow, clipping, and text-size failures.
