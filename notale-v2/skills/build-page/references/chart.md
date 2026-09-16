# Chart as Authored Evidence

Position, length, area, color, shape, or connection must encode the data supporting the claim. Compose that evidence as a complete authored page, not a renderer demo.

## Write the chart-page contract

Complete:

`The learner should understand <one quantitative or relational claim> because <visible marks, values, comparison, or uncertainty>.`

Refine the first-response construction decision before selecting a library; no separate written contract:

- audience and page job;
- reader question and intended conclusion;
- canonical records, stable IDs, units, provenance, and uncertainty;
- starting data and reference geometry visible at step 0, and the comparison or relation established by subsequent steps;
- plot, annotation, conclusion, control, and source-note regions;
- one subject-specific signature treatment that does not distort encoding;
- authored states and motion role;
- reduced-motion and renderer-failure evidence.

Give the plot and its decisive annotation the largest uninterrupted region. Keep the conclusion next to the marks that support it. Resolve typography and colors from the supplied theme; derive identity from data geometry, annotation, subject notation, and motion rather than a generic dashboard surface.

## Choose the renderer from the relationship

| Need | Renderer |
|---|---|
| Conventional line, bar, area, scatter, heatmap, or mixed statistical view | ECharts or the host chart system |
| Custom network, tree, hierarchy, flow, chord, or novel data-bound geometry | D3 with SVG |
| A small set of exact values | Semantic table or aligned HTML |
| A few non-quantitative boxes and arrows | SVG or semantic HTML, not a chart library |
| Thousands of moving marks | Aggregate first; use 2D rendering only when individuals matter |
| Real depth or Earth coordinates | Use the 3D reference only when spatial position is evidence |

Before selecting a renderer, state the reader's question and map each data field to one visual channel. If a table answers the question faster, use the table.

## Define an encoding contract

Record:

- x, y, length, size, color, shape, and connection encodings actually used;
- units, domains, sort order, aggregation, and missing-value policy;
- comparison groups and which scales must be shared;
- annotation targets and source note;
- optional inspection state and exact reset.

Keep canonical records outside renderer options. Derive series, scales, filtered records, annotations, selected datum, and DOM values from one page state.

Use semantic color roles. Assign categorical roles consistently across chart, annotation, legend, and prose. Use a continuous theme-derived ramp only for an ordered or continuous variable. Do not color successive stages arbitrarily or let decorative gradients imply magnitude.

## Preserve statistical truth

- Put units in axis names, tooltips, nearby values, and tables.
- Use a zero baseline for bars unless the exception is explained next to the chart.
- Represent missing observations explicitly; do not silently interpolate them.
- Share domains for views intended for direct magnitude comparison.
- Show uncertainty with bands, intervals, ranges, or a precise note.
- Use area and angle only when approximate comparison is acceptable.
- Sort categories by a meaningful order and preserve it across states.
- Distinguish measured, estimated, and simulated values.
- Do not use animation to conceal a changing axis or aggregation rule.

## Compose the chart into the page

- Give the plotting region more space than legend chrome or explanatory prose.
- Put the conclusion near the marks that support it.
- Directly label a small number of important series; use a legend when labels would collide.
- Place annotations at the exact datum, interval, or relation they interpret.
- Keep axes, legends, annotation, and prose within one shared vocabulary and number format.
- Make the initial view answer a useful question without hover.
- Offer the exact evidence in a compact table or ordered list when values matter.

Filtering for inspection remains a page behavior when it does not alter the model or ask the reader to reason through a consequence.

## Engineer the plotting region

Size the renderer from an explicit host, not from the canvas element's intrinsic defaults. Give the host a measurable height and width, then resize the existing chart instance when that host changes.

Reserve room for real text:

- measure or conservatively estimate the longest category, tick, direct label, and annotation;
- include axis-name and source-note clearance in the plot budget;
- rotate labels only when a different orientation, wrapping, abbreviation, or chart form is worse;
- keep connector and label endpoints within the scaled stage;
- use internal chart padding for marks and labels, not an oversized outer frame that shrinks the plot.

Format values through one function shared by axis ticks, tooltip, direct labels, annotation, DOM evidence, and fallback table. Preserve meaningful precision; do not show more decimals than the evidence supports. Attach units at the axis or value level where they remain unambiguous.

The initial render establishes the data, scale, and a useful starting observation. Deck steps establish the full comparison or conclusion; hover and focus supply optional exact detail.

## Use authored motion

Organize the explanation through Deck steps in one stable plotting region. Add a comparison series, residuals, uncertainty, differences, or focused annotations while preserving the needed earlier evidence. Both cases may be present initially and their differences emphasized across steps. Do not create a separate card or bordered chart panel for each step.

The renderer must actually consume the selected step. Registering `Deck.onStep(renderAll, 1)` while `renderAll` draws the same marks for both values is a broken teaching sequence. For example, keep the curve and current point visible at step 0, add the tangent at step 1, and add the downhill direction at step 2. Derive every mark's presence and emphasis from the current step, including when going backward; do not reset to step 0 on resize. Use shared axes or aligned unboxed plots, with formulas beside the corresponding evidence, rather than plot cards plus a separate stack of formula cards.

For ECharts, a shorter `series` array in a default merging `setOption` call can leave later-step series visible when going backward. When returning complete options for each step, use `chart.setOption(optionsForStep(step), { notMerge: true })`; otherwise explicitly replace/remove the relevant series and annotations. Verify that a tangent or residual added at step 1 is actually absent again at step 0, not merely that `Deck.step` returned to zero.

Convert sample narration tabs, next buttons, and autoplay to chassis progression; preserve genuine free filtering or comparison controls. Reveal DOM/SVG groups with `data-deck-step="n"`, or register `Deck.onStep(renderStep, states.length - 1)` after initializing the chart. `renderStep(step)` derives the complete chart options and annotations from the selected state; it must restore earlier states, not only append series. States 0/1/2 use maxStep 2. Cancel pending transitions before changing step. The chassis owns the navigation; chart animation connects the current states without automatically advancing steps.

Motion may establish reading order, connect a filter or named view to changed marks, preserve identity across a comparison, or reveal accumulation. It may also give the page restrained life, but it must not hide a domain or make a transient frame the only evidence.

- Design complete `initial`, `comparison`, `decisive`, `settled`, and `reduced` states when they apply.
- Keep stable series IDs, category ordering, axes, and scale domains across transitions intended for comparison.
- If a domain or aggregation changes, label that change before or with the transition.
- Use chart-native update animation for stable keyed marks; use a host timeline only when chart, DOM annotation, and other page regions need one shared playhead.
- Cancel or finish owned transitions before direct state navigation and reset.
- Under reduced motion, update marks and annotation directly to the same final state.
- Stop force simulations, ambient sweeps, and animation loops when their explanatory job is complete.
- In the existing Check step states, verify that marks or relationships actually change, previous steps restore correctly, and the final/reduced-motion/`?all` view supports review. Inspect one continuous chart composition rather than successive boxed sections; do not add a separate checking loop.

## ECharts recipe

Use the SVG renderer when readable chart text and scalable output matter. Initialize once and update the existing instance:

```js
const chart = echarts.init(host, null, { renderer: 'svg' });

function render(state) {
  chart.setOption(makeOption(state), { notMerge: true });
  evidence.textContent = describeEvidence(state);
}

const observer = new ResizeObserver(() => chart.resize());
observer.observe(host);
```

Use stable series IDs. Keep animation deterministic and disable it when change over time does not teach anything. Do not initialize inside `render()` or the resize observer. Dispose the instance and observer during teardown.

For Canvas-rendered charts, preserve essential labels and conclusions in DOM and test pixel density at the actual display. For SVG-rendered charts, verify generated text, clipping paths, and focus behavior rather than assuming vector output is automatically accessible.

## D3 relation recipe

Normalize IDs and preserve an untouched canonical copy because force layouts mutate records. Use keyed joins for marks, links, labels, and annotations.

For a reproducible force layout, use a seeded random source, tick it to a settled default, and stop it. Restart only while direct inspection needs motion; reset from canonical records and the same seed. Deterministic layouts must retain explicit input ordering and sort rules.

Keep scales and geometry in `render(state)`. Highlight a selected entity and its immediate relation while dimming, rather than removing, useful context. Stop simulations, interrupt transitions, and remove handlers during teardown.

## Make inspection accessible

- Put filters and view controls in semantic DOM outside the chart.
- Mirror selected or focused evidence into a status element.
- Provide keyboard access through controls or an entity list instead of requiring SVG drag or hover.
- Keep purely hover-based tooltips supplemental.
- Preserve visible focus and adequate target size.
- Provide a textual fallback when the renderer fails.

## Diagnose chart failures

| Failure | Cause | Repair |
|---|---|---|
| Chart wallpaper | Marks are present but no reader question was chosen | Name the question and annotate the decisive evidence |
| View drift | Several charts compete without a shared claim | Keep the one representation that carries the conclusion |
| Clipped evidence | Host sizing and label budget were left to defaults | Measure the host, reserve label space, then resize one existing instance |
| Theme-only identity | The page looks polished but could contain any dataset | Add subject notation, a decisive annotation, and a data-specific signature relation |

## Verify the chart

- Trace every conclusion to a visible mark, value, or relation.
- Check units, domains, baselines, missing values, and uncertainty.
- Change each inspection control and confirm chart, annotation, and DOM evidence agree.
- Reset twice and compare data ordering, scales, selection, and deterministic layout.
- Inspect initial, decisive, settled, and reduced-motion states without hover.
- Verify scaled-stage labels and legend collisions.
- Compare chart values, annotation, DOM evidence, and fallback table for identical units and formatting.
- Confirm the renderer initializes once and all simulations, observers, and instances are disposed.
