# Native scene audit

This records the initial scene audit against the actual 32-page lecture. The observations below predate the ECharts adapter; implementation and subsequent evidence are recorded at the end. Source files under `../notale-v2/runs/ens-trim-full-0907/pages` were read without modification. Runtime probes used the original imported document at version 1 and verified that its complete before/after API snapshots were identical.

## Observed scene types

| Source page | Native scene | Current editing gap |
| --- | --- | --- |
| 01 | Canvas `field-canvas` | Script-owned decorative scene; carrier geometry alone does not edit its content. |
| 07 | Canvas `matrix-canvas`, `curve-canvas` | Three range controls expose correlation, model count and error rate. Random seed remains private to the script. |
| 12 | Canvas `cv-single`, `cv-bagging` | Native option buttons and resampling are outside the form-control binding model. |
| 14 | Canvas `forestCv` | Drawing data and appearance remain script-owned. |
| 22 | Canvas `plotCanvas` | Native buttons and step action require a scene-specific editing/state contract. |
| 23 | Canvas `cv-residual`, `cv-gradient` | Drawing content remains script-owned. |
| 31 | Canvas `chartCanvas` | Task/card selections update a native chart through its script. |
| 11 | ECharts `chart` | Three line series; source host is identifiable but generated SVG descendants are transient. |
| 17 | ECharts `chart-trees`, `chart-features` | Two and three line series; runtime options contain one and two function callbacks respectively. |
| 24 | ECharts `chart` | Two 150-sample line series; native option buttons rebuild the chart with `notMerge: true`. |

The source inventory found ten authored canvases on seven pages, four ECharts instances on three pages, and only three native `input`/`select`/`textarea` controls across the lecture. Button-driven scenes therefore cannot be covered by extending only the existing form-value inspector. Evidence: `.local/native-scene-inventory.json`, which includes per-source SHA-256 hashes.

## Runtime findings

- All four ECharts hosts retain source object IDs. Their generated SVG trees contain 47, 61, 60 and 47 descendants respectively, with no author object IDs. Source-object editing does not provide a durable chart-series model for these instances.
- On page 24, applying a temporary first-series line width of 9 through the live chart instance works. Clicking the native `1.0` learning-rate button restores the width to 2. An adapter must preserve authored overrides when the native script performs a complete option replacement; applying an override once on load is insufficient.
- Page 17's runtime options contain functions. A JSON snapshot of the whole option tree would lose those callbacks. Preserve the original behavior and persist validated author edits separately; do not claim JSON serialization is a complete capture of an arbitrary native instance.
- On page 07, resampling changes the matrix canvas pixels. Reload restores the exact original pixel hash. This is normal transient playback behavior today, but an author cannot currently save the chosen sample as a reproducible scene default. Adding seed/state editing requires an explicit adapter into the private simulation state.
- These probes produced no page errors and did not create a document revision. Runtime evidence: `.local/native-scene-runtime-audit.json` and `.local/native-scene-runtime-audit.log`. Counts and pixel hashes are observations of this fixture, not universal claims about generated HTML.

## Next implementation and verification

Prioritize a concrete ECharts adapter for the existing four instances, with typed persisted overrides and an inspector that proves data and style edits. Verify native redraw, callbacks, undo/redo, reopen, exact retry and standalone export. Keep generated SVG disposable. Adapter deletion, copying and cross-page transfer must account for the native instance lifecycle rather than copying only its host DOM.

Then expose a concrete parameter/state adapter for the page 07 simulation, including reproducible seed editing, before generalizing to the other Canvas scenes. Verify actual rendered output and original controls after authored changes. Keep authored defaults separate from transient presentation state, and make any restoration of transient state explicit. Neither a generic registration interface nor a selectable scene carrier alone satisfies these acceptance requirements.


## ECharts adapter implementation

A concrete native ECharts adapter now persists typed data/style/axis patches independently of source scripts. It reapplies them after native full redraw and instance reinitialization, preserves formatter callbacks, and provides series controls in the workbench. The integration contract is in `INTEGRATION.md`; targeted and full validation evidence is in `WORKLOG.md`. The original inventory above remains useful evidence of what needed fixing.

At the time of that increment, standalone object reconstruction/transfer, source-host deletion, broader options and Canvas state adapters remained open. Subsequent implementations and their specific boundaries are recorded below. Page duplication preserves complete native script context and independent author patches.


## Canvas parameter adapter implementation

The page-07 private startup state now has a concrete source-backed adapter. Acorn locates the original object literal and direct form handlers; render-time lexical getters expose current scalar values, and validated author overrides change only the render projection's initializer values. The source HTML remains the recovery authority. Existing control events synchronize saved correlation/model-count/error-rate values, and captured random seeds make resampling reproducible.

The real Canvas scenario passes pixel comparisons through save/reopen, capture/retry, undo/redo and independent page copy/reset, with working exported controls. Details: `INTEGRATION.md` and the source-scene section of `WORKLOG.md`. This closes the page-07 seed persistence gap from the original audit. It does not establish equivalent behavior for all other Canvas pages, arbitrary private scene graphs or per-instance lifecycle operations. Implicit form constraints, more complex event wiring and select/radio choices are explicit follow-up cases.


## Finite task/method scene choices

Page 31 now has an actual task-comparison editing path. Source lookup analysis exposes three task indices with native titles and four method keys; backend choice validation prevents invalid indices/keys from reaching the renderer. Real browser acceptance verifies numeric/string select serialization, native controls and metrics, exact chart pixels through reopen/history/copy/reset, native selection capture, atomic rejection and exported interaction. The actual author source remains unchanged. See `WORKLOG.md` for current verification evidence.

A read-only descriptor audit of the original 32-page lecture kept its complete API snapshot unchanged at version 1 (`.local/scene-choice-audit.json`). Discovered state groups remain on pages 01, 07, 12, 14 and 31. Page 12 needs a distinct recovery treatment: its random generator is the separate `seedCounter` variable; `trees`, `currentSample` and previous comparison grids are nonscalar fields; `diffSingle` and `diffBagging` are derived and forcibly overwritten during initialization, then change from numbers to formatted strings after resampling. Merely persisting its four discovered scalars cannot restore that scene's sample or comparison history. The current parameter panel must be extended to distinguish author inputs from derived values and capture the required generator/history state. This remains open work, not a completed adapter.

## Complete Bootstrap checkpoints

The page-12 state gap described above now has a reviewed, exact-source adapter. `scene.checkpoint` persists the full forest/current sample, both comparison grids, displayed metrics and independent RNG, then restores them in the original closure and calls the native drawing/UI function. Derived metrics/counters reject initializer edits. The local source fixture is `tests/fixtures/scene-bootstrap.html`; the adapter's inline-script SHA-256 is `ab5457aba4d955bd0297e4ecfb0c428b48ff7e085f77213cf2feba809fcfe2bf`.

The targeted browser acceptance now proves both Canvas images through save/retry/reopen/history, independent page copy/reset, portable export and engineering ZIP reimport. It also compares the next native sample and metrics against uninterrupted execution, including after export/import. This resolves the demonstrated page-12 model/history/RNG recovery gap. It does not turn arbitrary private Canvas scene graphs into editable shapes or establish an adapter for every generated script variant. Broader scene discovery, source host lifecycle and richer object-level editing remain part of the active goal.

## Independent ECharts object lifecycle

Reviewed exact-source factories now cover all four chart hosts on pages 11, 17 and 24. Clipboard copying transfers original data construction and callback closures into independent chart metadata, rebases the library asset and reconstructs a fresh instance in the destination. Generated SVG remains disposable. Domain tests verify all four factories, independent arrays/functions, reset/delete, stale cut rejection and source/library validation. Real browser tests exercise the three source families, including the page-11 data-building loop and page-17 formatter outputs.

The page-17 acceptance duplicates a chart, edits only the copy, recreates a disposed instance, then cuts it across pages with delayed clipboard capture and a lost successful response. Exact retry/history, original-page deletion, export/import, source reset and owned-host deletion all retain the expected behavior. Copies use authored initial state plus saved patches, not arbitrary transient native button selections. Registry hashes and source fixtures are in `src/domain/chart-sources.ts` and `tests/fixtures/chart-*.html`.

This closes the demonstrated lifecycle for independent copies of the four reviewed charts. The subsequent original-host implementation below adds direct cut/deletion; copying an enclosing control container still requires a component adapter. Other generated source variants, Canvas instances, copying surrounding controls and capturing transient chart state remain part of the active goal.

A source-only lifecycle probe (`.local/chart-host-lifecycle-audit.mjs` / `.json`) sharpens the original-host deletion follow-up. With a minimal DOM/ECharts test double, page 11's existing null-host guard exits cleanly. Page 17 initializes both charts before applying either option: deleting the first host prevents both instances, while deleting the second leaves the first initialized with no data and no resize handler. Page 24 catches missing-host initialization and displays its error fallback even though the chart was deliberately removed; its three buttons still update the remaining metrics. These are source-control-flow observations, not a new browser acceptance result. A deletion adapter must preserve the sibling chart and distinguish deliberate removal from runtime loading failure.

The bridge now also captures live `nativeChartTargets` for unannotated hosts and enclosing containers. The workbench forwards these hints through its clipboard; unsupported source variants reject without saving an empty host. Real-page tests verify both host/container paths and immediate paste during delayed capture, with HTTP 422, unchanged version/content and a still-working original chart. Source-only clients must carry equivalent runtime evidence; author DOM alone cannot identify every script-owned div. The final 68-case browser regression, 92-test backend/domain suite and packed consumer pass; detailed evidence is in `WORKLOG.md`.


## Original chart-host deletion and direct cut

The deletion failures identified by the source-only probe above are now addressed for the four reviewed charts. Render-only AST range edits omit initialization and calls for missing original hosts. The original author scripts are retained; undo restores normal initialization. Page 17's surviving chart keeps its data/callbacks/resize behavior, and page 24 retains button-driven metrics without showing a false loading-error fallback. Direct original-host cut creates an independent destination chart, inherits saved author patches, respects locks and rejects changed captured source.

Real browser acceptance verifies original chart cut with lost-response/reload/exact retry, both page-17 sibling directions, history/restoration, standalone source/destination playback and engineering ZIP import. Page 24 verifies delete/reload, two native learning-rate selections, hidden fallback and undo/redo. The scene screenshot `.local/native-chart-deleted.png` was visually inspected. The source-family boundary remains explicit: surrounding controls are not moved or remotely rebound, arbitrary source variants and deleted metric dependencies are not covered, and transient native selections are not a general state snapshot.


## Whole learning-rate components

The page-24 source now has a component adapter for its enclosing chart, three learning-rate buttons and four metrics. Whole-component transfer captures the live selection and selected/unselected appearance, remaps member IDs, and creates independent source-derived controllers. Original button queries exclude copied roots, including when original and multiple copies share a page. The native chart inspector can persist a component’s selected value. Bare-chart copies retain the earlier authored-default behavior.

Required members cannot be partially deleted or transferred; button text remains editable. Other source variants and arbitrary component restructuring remain open. See `INTEGRATION.md` for the optional state capture and saved interaction metadata contracts; verification evidence is recorded in `WORKLOG.md`.


## In-place adoption and general teaching states

The reviewed learning-rate component can now be adopted in place without rewriting its source HTML or object IDs. Render-time lifecycle handling gives its retained host to the independent controller, and partial active/inactive button appearance edits preserve other saved properties. Root, chart, controls and metrics are individually reachable from the integration inspector.

General HTML/SVG components can include the complete adopted native component and assign its native choice in named states, events and teaching steps. The native authored default is retained separately from the current general state through clipboard transfer and playback. Explicit requested choices survive native instance reconstruction. Acceptance covers backward step seeking, deliberate instance disposal, cross-page cut with lost-response recovery, history, source-page deletion and independent export/import. Other script families and arbitrary Canvas internals still require appropriate editing adapters.


## Independent correlation Canvas regions

The page-07 workspace now has a reviewed independent factory using its complete original script (`7d303cb0e07466311e4d90f30070c5e1a032db847928ee268ced300867beb647`). Both canvases, three sliders, three preset buttons, sample action and metrics transfer as one mapped region. Copies preserve live scalar state and CSS tokens while retaining distinct closures, events, metrics and drawing callbacks. Original queries exclude sibling copies. Partial required-member deletion/copy rejects; full removal suppresses the original initializer only in the render projection. The workbench exposes complete-region selection and toolbar duplication, with ordinary parameter read/save/reset on copies.

The final real-lecture run passes toolbar duplication with exact initial Canvas pixels, independent presets/model counts, captured cross-page cut with lost-response replay, default edits, source-page deletion, reopen, independent blank-page playback without Deck scripts, engineering ZIP import and reset. All three related browser cases pass in 36.8 seconds; the 131-case domain suite and build/typecheck pass. Final package/audit details are in WORKLOG.md. The clean exported-region screenshot `.local/canvas-instance-export.png` was inspected.

The blank target uncovered a general portable-render defect: no charset declaration allowed a plain static HTTP server to decode Chinese script literals incorrectly. Comparing the pixel differences localized them to Canvas text; font/language probes did not resolve it. Rendered output now declares UTF-8 first in the head, and the final export matches the editor Canvas bitmap exactly. Instance language is also retained explicitly. This resolves the demonstrated correlation-region lifecycle, not arbitrary Canvas source variants, pixel-to-vector conversion, general library integration or automatic capture of every scene's hidden model.
