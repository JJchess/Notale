---
name: visualize-data
description: "Turn quantitative or relational teaching material into truthful, accessible, interactive web visualizations. Use for conventional charts with axes, legends, or tooltips; custom networks, hierarchies, flows, and other data-driven SVG relations; or an existing visualization that needs better encoding, interaction, responsiveness, or validation."
---

# Visualize Data

Build one legible figure that answers one explicit learning question. Treat the source data, units, and teaching claim as a contract; never invent values to improve the composition.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command. Do not defer it until implementation is already underway.

1. Read the assigned brief, page specification, shared contract, `CHASSIS.md`, and chassis `LIBS.md`.
2. State the question the figure must answer in one sentence.
3. Identify the records, fields, units, source, missing values, and allowed transformations.
4. Select one renderer:
   - Use **ECharts** for conventional line, bar, scatter, area, pie, heatmap, or combined charts with axes and legends.
   - Use **D3** for custom networks, trees, hierarchies, flows, chord-like relations, or novel data-bound SVG layouts.
5. Read [renderer-routing.md](references/renderer-routing.md), then read only the selected recipe:
   - [echarts-recipe.md](references/echarts-recipe.md)
   - [d3-relations-recipe.md](references/d3-relations-recipe.md)
6. Do not read an unselected recipe. Do not use D3 to rebuild a standard chart that ECharts already expresses clearly.

## Follow the workflow

### 1. Write the representation contract

Record the following before writing rendering code:

- learning question and one primary comparison or relationship;
- visual marks and the field mapped to position, length, area, color, or connection;
- units, domains, baselines, sorting, aggregation, and uncertainty;
- interaction states and the sentence that must remain true in every state;
- the textual or tabular fallback.

Reject decorative encodings that do not carry data. Keep only supporting annotations that help interpret the claim.

### 2. Normalize data once

- Convert input into one canonical array or graph with stable IDs.
- Parse numbers and dates explicitly; preserve raw values when displaying them.
- Mark missing data instead of converting it to zero.
- Sort with an explicit stable rule. Never depend on object iteration order.
- Keep canonical data immutable. Derive filtered and selected views from state.
- Use a fixed seed for generated layouts or samples. Never call unseeded `Math.random()`.

### 3. Establish static truth first

- Render the default state before adding animation or filtering.
- Make the primary pattern readable without hover.
- Label axes, units, legends, source, and important thresholds near the figure.
- Start quantitative axes at zero when length encodes magnitude; disclose justified truncation.
- Use area for area, counts for counts, and comparable scales for comparisons.
- Do not encode essential categories by color alone.

### 4. Add one coherent interaction model

- Store persistent controls in one serializable `state` object.
- Route every control through `setState(patch)` and one idempotent `render(state)`.
- Keep hover and focus transient; do not let them silently change the data domain.
- Give filters, modes, and selections visible labels and selected states.
- Provide keyboard access for every pointer action and a deterministic Reset action.
- Update a nearby DOM readout or live region with the selected value and its unit.

### 5. Fit the page

- Measure the visualization container, not the window.
- Re-render or resize through one `ResizeObserver`; debounce expensive layout work.
- Preserve minimum label sizes and remove secondary detail before shrinking text.
- Keep tooltips inside the viewport and usable with focus as well as hover.
- Use local chassis libraries only; do not add a CDN or network dependency.

### 6. Add fallback and reduced motion

- Wrap the graphic in a labelled `figure` with a concise `figcaption`.
- Provide a visible summary and a compact table or list for the values needed to understand the conclusion.
- Add a useful accessible name and description to SVG output.
- Replace entrance animation with the final state under `prefers-reduced-motion: reduce`.
- If the library fails, keep the title, conclusion, source, and data alternative visible.

### 7. Bound work and clean up

- Reuse one chart, simulation, observer, and listener set; never initialize again on every state change.
- Stop D3 simulations after the layout settles unless motion communicates meaning.
- Cancel animation frames and timers, disconnect observers, remove listeners, and dispose the selected renderer on teardown.
- Avoid hidden duplicate charts and per-frame DOM allocation.

## Deliver

Deliver the requested page and its local assets with:

- preserved `#stage`, page metadata, shared assets, and fixed-stage harness behavior;
- the canonical data and source or clearly labelled assumptions;
- one selected renderer and no redundant second implementation;
- a deterministic initial state, visible Reset control, and state-driven rendering;
- an explanatory caption plus accessible data alternative;
- a small cleanup function when the page or component can be remounted.

## Run the minimum smoke

1. Load the page from the harness-compatible local path.
2. Confirm zero JavaScript errors and zero failed resources.
3. Confirm the figure is non-empty and its caption, labels, and units are visible.
4. Exercise every control with pointer and keyboard; confirm at least one mark and the DOM readout change.
5. Reset twice and confirm the same marks, ordering, and values return.
6. Resize once narrow and once wide; confirm no clipping, stretching, or misplaced tooltip.
7. Emulate reduced motion and confirm the final state remains understandable.
8. Run the available `Check` or page self-check and fix reported overflow, clipping, and text-size failures.
