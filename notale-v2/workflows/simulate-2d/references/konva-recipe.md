# Konva Recipe

Use Konva for a shape-based scene whose main work is hit testing, dragging, grouping, or transformation.

## Initialize one logical stage

```html
<script src="assets/lib/konva.min.js"></script>
```

```js
const stage = new Konva.Stage({
  container: 'scene',
  width: logicalWidth,
  height: logicalHeight
});
const layer = new Konva.Layer();
stage.add(layer);
```

Keep logical dimensions in model state and size the host with CSS. Konva maps pointer coordinates through the canvas bounds, including the harness stage scale; verify it, then avoid a second manual correction.

## Keep state authoritative

- Create shapes once and index them by stable entity ID.
- On drag, convert the constrained final position into an action, update model state, then render.
- Clamp movement from model rules rather than only with visual boundaries.
- Store selection and mode state outside Konva nodes.
- Rebuild the same initial geometry from the same seed on Reset.

## Handle text and controls

- Use DOM controls, instructions, labels, values, and status text over or beside the stage.
- Avoid `Konva.Text` for important labels because canvas text is invisible to DOM typography and accessibility checks.
- If a short label must rotate with a shape, set its font size explicitly and duplicate its meaning in DOM.
- Give drag-only actions a button, slider, or arrow-key alternative.

## Resize without breaking hit tests

- Observe the host once.
- Either keep a fixed logical stage and scale its container, or update `stage.size()` and recompute the scene from state.
- Do not mix CSS canvas dimensions, stage dimensions, and an extra custom pointer scale.
- Reposition DOM overlays from the same logical-to-host transform used by rendering.

## Keep work bounded

- Split static and frequently changing marks into separate layers.
- Call `layer.batchDraw()` after grouped updates.
- Cache only genuinely complex static groups; clear caches when they change.
- Reuse nodes rather than destroy and recreate them during drag.

## Clean up

```js
function cleanup() {
  observer.disconnect();
  stage.off();
  stage.destroy();
}
```

Also remove DOM listeners and controls created by the component. A remount must leave one canvas inside the host.

## Smoke

- Drag one object to a valid and an invalid location; verify state constraints.
- Complete the same change with keyboard controls.
- Reset twice and compare entity transforms and readouts.
- Resize and verify pointer hit location against the visible shape.
- Destroy and remount; confirm one stage and one listener response.
