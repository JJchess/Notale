# globe.gl Recipe

Use globe.gl only when Earth coordinates carry meaning.

## Load in order

```html
<script src="assets/lib/three.min.js"></script>
<script src="assets/lib/globe.gl.min.js"></script>
```

```js
const host = document.querySelector('[data-globe]');
const globe = Globe()(host)
  .backgroundColor('rgba(0,0,0,0)')
  .pointsData(points)
  .pointLat('lat')
  .pointLng('lng')
  .pointAltitude(0.02)
  .pointRadius(0.24)
  .arcsData(routes)
  .arcStartLat(d => d.from.lat)
  .arcStartLng(d => d.from.lng)
  .arcEndLat(d => d.to.lat)
  .arcEndLng(d => d.to.lng);
```

Use only local textures or a plain globe material. Do not add a remote globe image URL.

## Validate geographic data

- Require stable IDs and finite latitude/longitude.
- Clamp or reject latitude outside -90…90 and normalize longitude explicitly.
- State whether routes are directional and what altitude, width, or color encodes.
- Keep data ordering stable and animation dash timing deterministic.
- Avoid plotting a globe when country names or a flat map would answer the question faster.

## Make states inspectable

- Keep layer data and selected entity in canonical state.
- Use `onPointClick`, `onArcClick`, or polygon handlers to dispatch actions rather than mutate prose directly.
- Mirror every selectable place or route in a keyboard-accessible DOM list.
- Provide named region/view buttons and Reset view.
- Keep labels and values in DOM; avoid dense HTML labels on the sphere.
- Stop auto-rotation by default. If rotation helps orientation, provide Pause and respect reduced motion.

## Resize and bound layers

```js
const observer = new ResizeObserver(() => {
  const rect = host.getBoundingClientRect();
  globe.width(Math.max(1, rect.width)).height(Math.max(1, rect.height));
});
observer.observe(host);
```

Aggregate dense points, cap animated arcs, and avoid combining every globe layer. Keep one or two encodings that answer the question.

## Clean up

```js
function cleanup() {
  observer.disconnect();
  globe.pauseAnimation();
  globe.pointsData([]).arcsData([]).polygonsData([]);
  if (typeof globe._destructor === 'function') globe._destructor();
  host.replaceChildren();
}
```

Remove DOM listeners and controls separately. Treat the underscored destructor as version-specific and guard it as shown.

## Smoke

- Confirm every plotted coordinate is valid and the intended point/arc counts render.
- Select the same place through globe and DOM list; compare the status.
- Exercise region presets and Reset twice.
- Resize and confirm the sphere remains round and hit targets aligned.
- Force WebGL failure and confirm the geographic list or table remains useful.
