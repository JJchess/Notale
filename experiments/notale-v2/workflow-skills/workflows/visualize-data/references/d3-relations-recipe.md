# D3 Relations Recipe

Use this recipe for custom data-driven relations. The chassis provides D3 7.9.0 as the `d3` UMD global.

## Start with stable graph data

```html
<script src="assets/lib/d3.min.js"></script>
```

```js
const nodes = rawNodes.map(d => ({ ...d, id: String(d.id) }));
const links = rawLinks.map(d => ({
  ...d,
  source: String(d.source),
  target: String(d.target)
}));
```

- Reject duplicate node IDs and links to unknown IDs before drawing.
- Preserve a canonical copy because D3 force layouts mutate node and link objects.
- Sort nodes and links explicitly before layout.
- Use `viewBox` for responsive SVG and keep labels in SVG or nearby DOM.

## Make force layouts reproducible

```js
const rng = d3.randomLcg(0.314159);
const layoutNodes = nodes.map(d => ({ ...d }));
const layoutLinks = links.map(d => ({ ...d }));
const simulation = d3.forceSimulation(layoutNodes)
  .randomSource(rng)
  .force('link', d3.forceLink(layoutLinks).id(d => d.id).distance(72))
  .force('charge', d3.forceManyBody().strength(-180))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .stop();

for (let i = 0; i < 240; i += 1) simulation.tick();
```

Precompute a settled default layout instead of leaving a decorative force simulation running forever. Restart only while direct manipulation requires it, then cool and stop it. On Reset, rebuild from canonical records with the same seed.

For trees, partitions, chords, and other deterministic layouts, keep the input order and sort rule explicit.

## Bind and update by identity

```js
const node = layer.selectAll('[data-node]')
  .data(layoutNodes, d => d.id)
  .join(
    enter => enter.append('circle').attr('data-node', ''),
    update => update,
    exit => exit.remove()
  );
```

- Use keyed joins for nodes, links, labels, and annotations.
- Centralize scales and geometry in `render(state)`.
- Keep zoom transform in state only when Reset must restore it.
- Do not rebuild tooltips or attach duplicate listeners on each render.

## Add understandable interaction

- Make nodes focusable or pair the SVG with a DOM list of entities.
- Provide buttons or list controls as a keyboard alternative to drag and zoom.
- On selection, highlight the chosen node and its immediate relation path; dim rather than hide context.
- Write the selected entity and relation into a DOM status element.
- Constrain zoom and provide “Reset view”.

## Bound work and clean up

- Prefer SVG below roughly one thousand visible marks; aggregate or route essential high-volume motion to `simulate-2d`.
- Avoid per-tick DOM queries and object allocation.
- Call `simulation.stop()`, interrupt D3 transitions, remove namespaced handlers, disconnect observers, and remove transient tooltips during teardown.

## Smoke

- Confirm every link resolves to two existing nodes.
- Confirm node and link counts match the filtered state.
- Select one entity with pointer and keyboard and verify the same relation readout.
- Reset twice and compare node coordinates within a small tolerance.
- Confirm no simulation continues after settling or teardown.
