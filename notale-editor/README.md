# Notale HTML slide editor

**面向讲授的互动演示编辑器，具备设计工具的编辑深度。**

The default workflow centers on pages, teaching sequence, within-slide steps and presenting. The same author model supports progressively deeper editing of objects, layout, components and native interaction state. This product direction guides the backend and integration workbench; it does not cap the capability scope at basic slide editing.

TypeScript editing backend and browser integration workbench for native HTML slides. Original HTML, SVG, CSS and interactive scripts remain the author source; editing commands create immutable document revisions. The workbench demonstrates manual editing, author interaction defaults, animation steps, presenting, overview and speaker/audience synchronization.

The animation panel now authors named teaching steps: insert, duplicate, reorder and remove steps while retaining their native visual states, animation cues, interaction states and media triggers. Each step can carry speaker notes and manual or automatic pacing. The speaker/audience views and exported standalone player use the same sequence.

**Implementation is in progress.** The live evidence and remaining acceptance work are recorded in [docs/WORKLOG.md](docs/WORKLOG.md). Passing a narrow probe is not a claim of complete PowerPoint parity.

## Run locally

Requires Node >=20.19, npm, and Docker Compose (or PostgreSQL 16).

```bash
cd ~/ws2/Notale/notale-editor
npm ci
docker compose -p notale-editor up -d --wait
npm run build
npm start
```

In another terminal, import the final slide output:

```bash
npm run import:slides -- ../notale-v2/runs/ens-trim-full-0907/pages '集成学习 · 完整资源讲义'
```

Open **http://127.0.0.1:4310/**. The importer copies resources, including symlinked runtime dependencies, into PostgreSQL; it never modifies the input directory. It prints the imported document URL. Existing source generation code is not invoked.

Defaults: API/workbench port 4310, isolated content server port 4311, PostgreSQL port 55439. `DATABASE_URL`, `EDITOR_PORT`, `EDITOR_CONTENT_PORT`, and `EDITOR_PREVIEW_SECRET` override them. Standalone mode binds to loopback and uses a fixed local author for development. Host integration supplies real identity and policy.

## What to exercise

- Select a page, then select an object from the canvas or source-object list. Double-click leaf text to edit; drag to reposition. Format controls change geometry, font and CSS. Shift-select supports alignment and distribution; groups associate source objects without rewriting their DOM containers.
- Insert text, SVG shapes/arrows, tables, charts and uploaded image/audio/video. Table cells and SVG paths remain individual source objects. The advanced inspector edits rich text, attributes and authored chart data.
- Drag the selection’s eight handles to scale objects or groups, or its circular handle to rotate. Shift keeps the scale proportional or snaps rotation to 15°; Alt scales about the center. Resize handles snap to objects, the page, saved guides and the grid; Ctrl/Command temporarily bypasses resize snapping. Escape cancels the gesture. Groups and non-text content use affine scaling. A single horizontal text container, including paragraphs/lists and text-only columns/grid/flex, instead gets oriented size handles that preserve font size: side handles rewrap with automatic height, top/bottom/corner handles set fixed dimensions. Alt keeps the center; Shift keeps the box ratio. The format-panel checkbox switches back to content scaling. Text resizing snaps the grabbed handle within its permitted directions, measures actual wrapping and rejects unattainable guides or layout jumps beyond six screen pixels.
- Shift/Ctrl/Command click to select multiple objects in the canvas or list; drag any selected object to move the whole set. Drag blank space to box-select and press Escape to cancel. Mixed HTML/SVG selections retain measured geometry through viewBox and parent transforms.
- Use arrow keys for precise movement (Shift for larger steps), standard copy/cut/paste/duplicate/delete and undo/redo shortcuts from the canvas. Continuous nudges are batched into one save; input fields retain native keyboard behavior.
- Enable rulers in 讲义 → 参考线与吸附. Drag from the top/left ruler to create a horizontal/vertical guide, drag a guide or its marker to move it, and return it to its ruler or outside the page to delete. Arrow keys nudge the active guide (Shift: 10 units); Escape cancels. Guides share normal save/history/recovery.
- Drag with smart alignment to objects, page edges/center, saved reference lines or a grid. Shift constrains the direction, Alt bypasses snapping and Escape cancels the gesture. The document panel edits reference lines; they survive history and export.
- New/copied pages become selected immediately; page ordering, hidden status, deletion and undo remain durable. Links between pages update the workbench/show navigation.
- Connect two selected HTML/SVG objects with a bound straight, elbow or curved line. Edit endpoint sides, color/width, dashes and arrowheads. Connections follow transformed objects during dragging and native playback; connected graph copy/cut remaps endpoint IDs, and deleting an endpoint removes its incident lines with history/lock protection.
- SVG layer controls bring graphics to front/back or move them one layer at a time. Multi-selection retains relative order, transforms, references and animation targets; changes support normal save/history/retry.
- Copy/cut source objects between pages with their typography, placement and animation metadata. Internal SVG graphics retain their measured affine placement and percentage coordinates in independent viewports; referenced gradient/use/clip chains are copied with independent IDs, including after save/reopen and cut retry. Shared layouts provide reusable footer/master objects, per-page application and independent detachment. Bundled stylesheet imports and scoped theme resource paths are retained in preview/export. Table controls insert/delete rows and columns and merge/unmerge cells; charts include bar, line, area, pie and doughnut. Direct chart style controls adjust typography, palette/background, grid/legend/value visibility, label direction/density, line width and markers. Cartesian labels avoid overlap, full data survives visual label sampling, and chart restyling preserves object placement.
- Media controls replace files without changing object IDs, apply fit/focus and edge cropping, and configure native video/audio trims, rate, volume, loops and step starts. Source bytes remain intact; history restores the previous resource.
- Native ECharts hosts expose a Format-panel series editor. Change names, colors, line widths and data, or apply typed axis/title/legend patches. Styles survive native redraw; only explicitly fixed series data overrides the original interaction. Original callbacks and scripts remain active. See [native chart integration](docs/INTEGRATION.md#native-echarts-editing).
- Select a reviewed native chart host and duplicate it, or copy/paste it onto another page. Its independent instance retains authored data/styles and formatter callbacks; you can edit, reset, move or delete that copy, even after deleting the original page. The current source factories cover the four charts on real lecture pages 11, 17 and 24. These reviewed original hosts also support deletion and direct cut; sibling charts and remaining native controls continue running. The learning-rate component described below also transfers its surrounding controls.
- On lecture page 24, select the `.main-grid` container from the source-object list and duplicate or cut/paste the complete learning-rate component. Its chart, three buttons and four metrics remain independent, including when multiple copies share a page. Copying captures the current choice and active-button appearance. Select an owned chart, read its live choice in Format, and use “保存互动选择” to persist it. Button labels remain editable; required component members move/delete together. See [component integration](docs/INTEGRATION.md#stateful-interactive-chart-components).
- Turn an HTML/SVG container into a component in Format → 组件与状态. Create named states with different text, styles and visibility, configure click/hover transitions and map states to teaching steps. Adjust container flow/flex/grid layout and transition timing, preview states, and copy the complete component with its behavior. Components can drive the learning-rate chart through its native value adapter. [Component contracts](docs/INTEGRATION.md#general-htmlsvg-components-states-and-teaching-steps).
- Publish a component into the shared library, insert instances on other pages, and update the source once to refresh linked instances. Instance text/style/state, layout and internal transform overrides remain independent. Reset a patch or detach an instance when needed; the library survives deleting the source page and engineering export/import. [Library and override contracts](docs/INTEGRATION.md#reusable-teaching-components-and-instance-overrides).
- Set fixed, content-sized or parent-filling container/child dimensions, flex/grid flow, padding, gaps, wrapping and alignment. Click a component to select the whole object, double-click to enter its contents, Alt-click for direct selection and Escape to return to the component.
- Recognized Canvas startup state exposes a Format-panel parameter editor. Read the current simulation (including its random seed), edit parameters (including inferred task/method dropdown choices), and save it as the reproducible startup state. Real scene pixels survive reopen/history/copy; original controls remain interactive. See [private scene integration](docs/INTEGRATION.md#private-canvas-startup-parameters-and-captured-state).
- The correlation simulation supports independent region copies: select a canvas, choose **选择完整互动区域**, then **复制对象** or copy/cut/paste. Its canvases, controls, metrics and captured seed move together; each copy has independent parameters and can play after source-page deletion or export. See [Canvas region integration](docs/INTEGRATION.md#independent-native-canvas-regions).
- The reviewed Bootstrap Canvas scene also saves its full trees, prediction history and random generator as a checkpoint; reopening or exporting preserves the next native sampling result. See [checkpoint integration](docs/INTEGRATION.md#full-native-scene-checkpoints).
- Select an input, range or select element to save its initial value. The bridge applies it through the existing input/change event after the original runtime initializes. This does not serialize transient Canvas pixels or learner state.
- Add or edit entrance, exit, emphasis, motion or custom keyframe effects; duplicate/reorder cues and choose step, delay, duration, easing, relative timing and object trigger. Native step mapping can repeat or reorder the original script states. Preview forward and backward.
- Edit notes, page transitions, sections and hidden pages. Open slide show or speaker mode; use overview, timer, black screen, fullscreen and a synchronized audience window. Reopening the same show session restores its fixed revision, page, step, timer and presentation controls; an audience window can reconnect. Duplicate controller windows follow the active session until explicitly taking over with “接管放映”. Preview resources renew through the host session without reloading the slide; connection failures can be retried while preserving native interaction state.
- Restore history or use undo/redo. Commits and restores keep their mutation ID and resulting history plan in local storage, allowing exact retry after a lost response. Acknowledged undo/redo history survives reloading the same tab.
- Pending batches are isolated across tabs and documents. The recovery list can resume work left by a closed window or export it; the document panel imports recovery files. Conflicting batches stay recoverable, and retrying an older acknowledgment shows the latest document version.
- Export includes the exact revision manifest, rendered pages, assets and an HTML player. Import restores the original author model under a new document ID. Serve extracted output with an HTTP static server, especially for module scripts/workers.

## Tests

Use the [verification cadence](docs/VERIFICATION.md): fast checks during implementation, selected browser workflows per complete module, and a full regression before delivery or broad shared-code changes. `npm run verify:quick` runs typechecking and backend tests concurrently; `npm run test:smoke` runs a small integration subset.

```bash
npm run build
npm test
npm run test:package
# Full logical backup/restore drill on an isolated database (real fixture required):
npm run test:restore
npx playwright install chromium
npm run test:browser
# Optional parallel regression on independent test documents:
BROWSER_WORKERS=2 npm run test:browser -- --fully-parallel
npx tsx scripts/verify-slides.ts
```

`npm test` uses real PostgreSQL, including competing saves and injected rollback. `npm run test:package` installs a packed artifact in a separate temporary TypeScript project and checks strict compilation, HTTP integration, rendered content and bundled static files. Browser tests require the running app and an imported 32-page sample. `TEST_DATABASE_URL`, `EDITOR_URL`, and `CHROMIUM_PATH` can override test infrastructure. Runtime audit results and screenshots are in `.local/`, browser failures in `test-results/`.

## Integrate

See [host integration and API contract](docs/INTEGRATION.md). The package exports document/command schemas, source import/introspection, a PostgreSQL store, timeline functions and configurable Fastify routes. There is no account or membership database, AI editing service or server Python task system.

The implementation reuses PostCSS and its selector/value parsers (shared styles), parse5 (source parsing), Fastify (HTTP), PostgreSQL/pg (transactions), Zod (contracts), fflate (portable archives), reveal.js (presentation) and the browser Web Animations API. Third-party modules retain their own licenses.

Backup/restore workflow, evidence artifacts and local recovery commands are documented in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Independent formal frontend

The formal editor now lives in sibling `../notale-editor-frontend/`, with its own package lock, static browser build, development host (4312) and browser acceptance. Its layout follows the user-supplied September 9 screen recording: narrow creation rail, contextual drawers, dominant slide canvas and edit/interactive-preview switching. This backend retains the original reference workbench and the rendered-slide bridge; formal frontend UI changes belong in the sibling directory.

`@notale/editor/browser` is the browser-safe public integration entry for command/model schemas, authoring helpers and inspection types. It excludes persistence/server/filesystem entry points. The frontend consumes a packed package, not relative backend source imports. HTTP API, rendering, history, resources and isolated content origins remain backend responsibilities. See the sibling frontend README for setup and current limits.
