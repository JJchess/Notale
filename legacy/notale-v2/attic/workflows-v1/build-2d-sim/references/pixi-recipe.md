# PixiJS Recipe

Use PixiJS for high-volume authored 2D motion. The chassis provides PixiJS 7.4.2; do not copy v8 examples that use asynchronous `Application.init()`.

## Initialize the UMD v7 build

```html
<script src="assets/lib/pixi.min.js"></script>
<script src="assets/lib/seedrandom.min.js"></script>
```

```js
const canvas = document.querySelector('[data-pixi]');
const app = new PIXI.Application({
  view: canvas,
  width: logicalWidth,
  height: logicalHeight,
  antialias: true,
  backgroundAlpha: 0,
  autoDensity: true,
  resolution: Math.min(devicePixelRatio || 1, 2)
});
const rng = new Math.seedrandom('page-particles-v1');
```

Use `app.view`, `app.stage`, and `app.ticker` from the v7 API.

## Select the right container

- Use `PIXI.Container` for a modest number of independently interactive sprites.
- Use `new PIXI.ParticleContainer(maxSize, properties)` for thousands of repeated sprites with a small set of dynamic properties.
- Declare only the properties that change, such as `position: true`; static tint, rotation, vertices, and UVs are cheaper.
- Pool particles and update typed or plain state records; do not allocate new sprites per frame.

## Keep simulation outside sprites

- Store position, velocity, life, category, and stable ID in model records.
- Advance records with a clamped `dt`, then copy results to sprites.
- Seed every generated initial condition and reset the RNG with the same seed.
- Keep scores, labels, instructions, and live values in DOM.
- Route pointer and keyboard controls into the same model actions.

## Protect frame time

- Cap DPR before reducing visible information.
- Avoid filters on the whole stage; constrain `filterArea` and use at most the effects that convey meaning.
- Reuse textures and graphics geometry.
- Avoid updating `PIXI.Text` every frame; use a DOM readout.
- Pause `app.ticker` while hidden or under reduced motion when autonomous movement is nonessential.
- Measure representative worst-case particle count rather than quoting an assumed capacity.

## Clean up owned resources

```js
function cleanup() {
  app.ticker.stop();
  app.ticker.remove(update);
  app.stage.removeChildren();
  app.destroy(false, {
    children: true,
    texture: true,
    baseTexture: true
  });
}
```

Do not destroy textures shared by another component; track ownership and use `texture: false` for shared assets. Remove observers and DOM listeners separately.

## Smoke

- Count model records and visible sprites in the initial state.
- Run a fixed number of steps twice and compare sampled positions.
- Change density at runtime without creating a second ticker.
- Reset and confirm pools are reused and values match the initial seed.
- Force reduced motion and WebGL failure; confirm a static summary or lower-tech fallback remains.
