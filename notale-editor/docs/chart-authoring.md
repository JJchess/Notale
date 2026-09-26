# ECharts authoring contract

Charts store editable data in `Slide.nativeCharts[target].authoring` (version 1).
The DOM target is a stable, sized HTML container. `compileChart` is shared by the
editor runtime and exported slides; the data grid is not included in exports.

## Commands

- `native-chart.create`: slideId, target, model, x, y, width, height.
- `native-chart.edit`: slideId, target, model, optional before. With `before`, only
  changed fields are applied; stable-ID arrays preserve unrelated concurrent edits.
  At a concurrently changed scalar, the latest explicit edit wins.
- `native-chart.reset`: slideId, target, scope (appearance, data, all). Dynamic
  data restoration requires a source recipe; a manual chart has no dynamic source.
- `native-chart.convert`: convert an existing data-backed SVG chart in place.
  Root identity and data survive; document reference validation prevents removing
  referenced descendants. Arbitrary SVG artwork is not inferred as chart data.

## Model

`columns`, `rows`, `series`, `edges`, `annotations`, and `states` have stable IDs.
`bindings` selects category / x / y / size / value columns and the displayed series.
Empty numeric cells are null; invalid strings are rejected, never converted to 0.
Appearance, axes, per-series styles and per-point overrides remain distinct.
`cleanChartReferences` removes references to deleted rows, series and annotations.
`cloneChart` remaps identifiers and references without rewriting user text.

Supported kinds: bar, column, stacked, percent, line, area, stacked-area, combo,
pie, doughnut, rose, scatter, bubble, histogram, boxplot, radar, heatmap, tree,
treemap, sunburst, graph, sankey, funnel, gauge, waterfall.
Histogram bins use Sturges by default. Box plots use linearly interpolated
quartiles, 1.5-IQR whiskers and an outlier series. Hierarchies reject missing
parents/cycles; Sankey links reject cycles. Limits: 20,000 rows/edges, 100 columns,
4 MB authoring payload, hierarchy depth 128.

## Teaching and synchronization

An animation with `effect: chart-state` references a model state via `chartStateId`.
State overrides are applied deterministically in cue order. Creating a teaching
step, its state and the corresponding animation is one document transaction.
Returning to a previous step reconstructs from the base model.

Edits preview immediately and enter the existing durable document queue and
history. Chart acknowledgements update chart instances without replacing the
slide iframe. Preview freezes locally queued chart models; formal export waits
for server synchronization. Structural/text edits still use their established
preview synchronization path. Pending chart edits are projected into clipboard
snapshots. Invalid grid drafts remain in document/page/chart-scoped local storage.

Existing ECharts source recipes and callbacks are preserved in memory. Editing
manual data freezes the authored chart; restoring dynamic data resumes the source.
Automatic authoring projection currently covers simple scalar line/bar/pie source
series. Other native chart sources retain their original runtime instead of being
lossily converted. Scatter/bubble authoring currently uses one x/y/size mapping.

## Verification and boundaries

Focused domain tests cover all advertised kinds with real ECharts SSR, IDs and
clipboard transfer, nulls, validation, deterministic states, reference cleanup,
concurrent field merging and SVG conversion. Candidate browser smoke checked grid
edit, autosave, reload, preview and teaching-step creation on an isolated lecture.
This is not evidence of exhaustive interaction coverage for every chart kind.

Undo uses the shared queue/history. Undo of an already transmitting operation can
still await synchronization. CSV/TSV imports offer a header-row choice; direct
paste treats cells as data. Row/column transposition is unavailable when existing
annotations, teaching states or network edges would lose their meaning.
