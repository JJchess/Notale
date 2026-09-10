# Renderer Routing

Choose the renderer from the representation, not from familiarity.

| Need | Choose | Reason |
|---|---|---|
| Line, bar, area, scatter, pie, heatmap, or mixed statistical chart | ECharts | Axes, legends, tooltips, responsive layout, and interaction are already coherent |
| Network, tree, hierarchy, custom flow, chord relation, or novel data-bound geometry | D3 + SVG | Layout and marks need explicit data binding and fine control |
| A few static boxes or arrows without quantitative encoding | Neither | Keep the diagram semantic HTML or SVG; route interaction work elsewhere |
| Thousands of moving marks | Reconsider the learning goal | Aggregate first; if individual motion is essential, route to `simulate-2d` |
| Spatial depth or Earth coordinates carry meaning | Neither | Route to `build-3d-scene` |

## Decision checks

Before selecting a library, answer:

1. What question can the reader answer after interacting?
2. Which field controls each visual channel?
3. Must axes and legends update together? Choose ECharts.
4. Must the code calculate a custom topology or geometry? Choose D3.
5. Would a table answer the question more directly? Prefer the table.

## Shared constraints

- Load only local chassis files: `assets/lib/echarts.min.js` or `assets/lib/d3.min.js`.
- Keep all user-facing text in DOM or SVG so page checks and assistive technology can inspect it.
- Make the initial view useful without animation, hover, or a precise pointer.
- Use stable IDs and deterministic ordering for every mark.
- Keep one renderer instance per container and provide explicit cleanup.
