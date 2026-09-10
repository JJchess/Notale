# Matter.js Recipe

Use Matter.js only when physical behavior carries the teaching meaning.

## Initialize deterministic world state

```html
<script src="assets/lib/matter.min.js"></script>
<script src="assets/lib/seedrandom.min.js"></script>
```

```js
const engine = Matter.Engine.create({ enableSleeping: true });
engine.gravity.y = 1;
const world = engine.world;
const bodies = buildBodies(new Math.seedrandom('page-model-v1'));
Matter.Composite.add(world, bodies);
```

Set every relevant mass, friction, frictionAir, restitution, constraint length, stiffness, and initial velocity explicitly. Generate bodies in stable ID order.

## Own the clock when results matter

Use one fixed-step loop instead of combining `Runner.run` with another animation loop:

```js
const STEP = 1000 / 60;
let previous = performance.now();
let accumulator = 0;
let raf = 0;

function frame(now) {
  accumulator += Math.min(now - previous, 50);
  previous = now;
  while (accumulator >= STEP) {
    Matter.Engine.update(engine, STEP);
    accumulator -= STEP;
  }
  Matter.Render.world(render);
  syncReadoutFromBodies();
  raf = requestAnimationFrame(frame);
}
```

Pause the loop while hidden when the lesson does not require background progress. Reset from a fresh canonical body definition rather than attempting to reverse accumulated physics.

## Render for explanation

- Matter.js is a physics engine, not an asset library. It provides no ready-made vehicles, people, machines, or teaching illustrations.
- Use `Matter.Render` to establish correctness. Keep it only when the primitive bodies are the concept; otherwise use a custom view and hide debug bodies in the delivered page.
- A body's `render.sprite.texture` points to a local image that you supply. Treat its scale and offset as view configuration, not as physics state.
- For a familiar object, create one visual group from recognizable functional parts and transform it from the authoritative body pose. Do not expose its rectangle-and-circle collision approximation as the final illustration.
- Keep labels, values, legends, and controls in DOM.
- Color bodies by semantic role, not random decoration.
- Display the parameter changed and the measured outcome with units.
- Do not claim physically accurate results unless constants, scale, and integration assumptions support that claim.

## Add manipulation

- Add `MouseConstraint` only when direct dragging is part of the model.
- Verify pointer mapping under page scale and touch.
- Give the same action a keyboard or form-control route.
- Apply parameter changes at a controlled step boundary.
- Prevent dragging static boundaries or hidden bodies.

## Clean up

```js
function cleanup() {
  cancelAnimationFrame(raf);
  if (mouse) Matter.Mouse.clearSourceEvents(mouse);
  Matter.Render.stop(render);
  Matter.Composite.clear(world, false, true);
  Matter.Engine.clear(engine);
  render.canvas.remove();
  render.textures = {};
}
```

If using a Matter runner, call `Matter.Runner.stop(runner)`. Remove every external listener and observer as well.

## Smoke

- Step the same initial state twice and compare key body positions within a declared tolerance.
- Confirm collision or constraint behavior, not merely animation.
- Change one parameter and verify the outcome readout changes in the expected direction.
- Suspend the tab or inject a long frame; confirm the time clamp prevents an explosion.
- Reset while bodies are moving and confirm exact initial body count and transforms.
