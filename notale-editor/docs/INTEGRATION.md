# Host integration and contracts

## Source ownership

`DeckDocument.schemaVersion = 1`. A document owns its page order, canvas dimensions, theme, presentation settings and resource manifest. Each slide owns normalized author HTML with `data-notale-id` on editable source elements, notes, transitions, locks, selection groups, transforms, interaction bindings and animation specifications. A resource path resolves to an immutable SHA-256 blob.

Runtime DOM is disposable. Script-created descendants are not automatically durable objects. Edit existing author objects, expose defaults through existing controls, or implement a content-type adapter for a custom scene. Script-owned Canvas internals do not become individual vector objects merely because their carrier is selectable. Source-script text is preserved through normal manual commands.

Source IDs are stable inside each slide. Duplicating a slide creates an independent HTML document, preserving its local DOM IDs and scripts. Duplicating ordinary SVG/HTML elements remaps IDs and SVG paint references; arbitrary script-owned Canvas/iframe instance duplication currently requires duplicating the page or adding an explicit component adapter. This remains a capability boundary to assess during completion audit.

## Attach to an existing backend

After `npm run build`, import from `dist/index.js` (or use a local workspace package dependency). The store accepts the host's `pg.Pool`; tables use the `editor_` prefix. Migrations are protected by a PostgreSQL advisory transaction lock. Do not call `pool.end()` from a module that does not own the pool.

```ts
import { Store, createApps } from '@notale/editor';

const store = new Store(hostPool);
await store.migrate();

await hostFastify.register(async (scoped) => {
  const { content } = createApps({
    api: scoped,
    store,
    serveWorkbench: false,
    secret: config.editorPreviewSecret,
    contentOrigin: 'https://slides-content.example.net',
    integration: {
      context: async (request) => {
        const session = await hostSessions.require(request);
        return { actor: session.userId, scope: session.workspaceId };
      },
      authorize: async (context, action, documentId) =>
        hostPolicy.check(context, action, documentId),
    },
  });
  // Route this separate server through the configured content origin.
  await content.listen({ host: '127.0.0.1', port: 4311 });
  scoped.addHook('onClose', async () => {
    await content.close();
  });
});
```

Register inside a Fastify plugin scope so the editor error handler stays encapsulated. Configure host request size limits for intended uploads. `createApps()` without `api` creates a standalone API server. A non-Fastify host can call `Store`, validators and command functions directly and implement equivalent transport routes.

Every API call invokes host identity/policy, and the store also scopes document reads/writes. No caller-supplied JSON can select another workspace. Host session/CSRF handling stays with the host. Preview grants cover a specific document revision with a renewable one-hour lease; content needs a separate origin from the authenticated application. A grant conveys read access to that revision's HTML and resources, not write access. Keep the signing secret stable across app instances. Revocation-before-expiry is not implemented yet.

## HTTP surface

| Method and path                                            | Meaning                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| GET `/api/schema`                                          | Document and commit JSON schemas                                    |
| GET/POST `/api/documents`                                  | List scoped documents / create from a complete author model         |
| GET `/api/documents/:id?version=N`                         | Read head or an immutable revision                                  |
| POST `/api/documents/:id/commits`                          | Atomically apply a batch of typed commands                          |
| GET `/api/documents/:id/history`                           | Revision metadata                                                   |
| POST `/api/documents/:id/restore`                          | Make an old revision the content of a new head                      |
| GET `/api/documents/:id/slides/:slideId/objects?version=N` | Source-object inspection                                            |
| POST `/api/assets`                                         | Upload base64 bytes plus MIME type; returns immutable hash metadata |
| GET `/api/documents/:id/preview?version=N`                 | Read-only preview URLs and bridge channel                           |
| GET `/api/documents/:id/export?version=N`                  | Portable ZIP from a fixed revision                                  |
| POST `/api/import`                                         | Import base64 ZIP, optionally specifying a new UUID                 |
| POST `/api/documents/:id/preview/renew` | Reauthorize and renew the original preview channel/revision |
| GET `/health`                                              | Database connectivity                                               |

Example commit:

```json
{
  "baseVersion": 4,
  "mutationId": "c8110466-f15d-4469-90d4-9cc417b12ba4",
  "commands": [
    {
      "type": "element.patch",
      "slideId": "slide-id",
      "target": "source-node-id",
      "patch": { "text": "Revised title", "style": { "font-size": "48px" } }
    }
  ]
}
```

The returned `Snapshot` contains `version`, `document`, `createdAt`, and `actor`. Preserve a pending batch's exact mutation ID and payload until the response is confirmed. The store locks the document row, checks idempotency and version, writes the revision/resources/mutation, and updates head in one transaction. A stale save returns HTTP 409 `VERSION_CONFLICT`; reusing an ID with different content or actor returns `IDEMPOTENCY_MISMATCH`. The retry of an already-committed request returns its original revision even if head has advanced.

There is no separate server undo stack. The frontend groups gestures into commits and can restore any previous revision with a new conditional save. Restore uses `{version,baseVersion,mutationId}` and never deletes later history. The reference workbench demonstrates local undo/redo and persistent pending-save retries.

`element.patch`, `element.content`, insertion/deletion/duplication/move, transforms, locks, groups, slide operations, metadata, animation/binding changes and asset changes are described by the exported `commandSchema`. The source tree and metadata references are validated after a batch. Source scripts cannot be introduced through ordinary object insert/replace operations. Whole imported projects retain their existing executable HTML and run on the content origin.

## Save acknowledgement and canvas readiness

A successful commit or `NotaleWorkbench.commands(...)` confirms author-state persistence. The reference workbench then loads the matching native preview asynchronously; a saved status or advanced snapshot alone does not mean that iframe is ready for another pointer gesture or geometry read. `render()` makes the iframe inert and invalidates its channel until the matching native `ready` report arrives. After a programmatic command, await `NotaleWorkbench.whenReady()` before inspecting or operating on the canvas.

For gesture-originated saves, first observe the intended revision/domain change, then await `whenReady()` before the next gesture. Calling it immediately after mouseup can precede delivery of the gesture message and still refer to the previous ready frame. Presentation counters likewise restore before their native iframe finishes loading; integrations should wait for native readiness/state, and browser tests should retry the full read/assertion across iframe replacement instead of synchronously reading an old execution context.

## Page operations and navigation

Page insertion/duplication/deletion/reordering are revisioned commands. Duplicating a page retains its local DOM IDs, scripts and resource directory, creates a new page identity and rewrites explicit self-links to its new filename. Removing a referenced page fails until the referencing HTML is repaired in the same batch. Undo/restore preserves the original page content, bindings, visibility and ordering.

The workbench selects newly created/copied pages and selects an adjacent page after deletion. Ordinary links between document pages are routed through the workbench/show navigation so the selected page, counter and notes remain synchronized. Modified clicks, downloads, external links and fragment-only links retain their native behavior. The static export player also routes page links. The current show excludes hidden pages from its sequence; links to an excluded hidden target report that condition rather than silently replacing only the iframe.

## Layouts, clipboard, tables and geometry

`layouts[]` stores shared HTML/SVG/media overlays with a name, CSS, resource `sourcePath`, theme overrides and front/behind layer. A slide references `layoutId`; layout updates propagate to referring slides. `layout.detach` copies editable source objects into that slide, keeping its independent appearance. Shared overlays currently accept static objects; original page scripts stay in their own page context. Theme inheritance is document → layout → slide. Document theme URLs are relative to the project root; layout theme URLs are relative to `layout.sourcePath`; slide theme URLs are relative to that slide. Detachment rebases inherited theme values into the slide's own path. All these references participate in atomic save validation.

Layout CSS is compiled with [PostCSS](https://github.com/postcss/postcss), its selector parser and value parser. Head/body `<style>` blocks, bundled stylesheet links and nested `@import` are included; import media/layer/supports conditions survive compilation. Selectors are scoped to the master container, IDs are remapped exactly, and keyframe/font names are isolated. CSS color hashes remain colors. Linked layout stylesheets must be local document assets; missing/cyclic imports and parse errors reject the save transaction. Validation, previews, exports and detach use the same compiler.

`Store` resolves CSS blobs within the host scope automatically. A caller using the pure domain function can supply `applyCommands(document, commands, {stylesheets})`, where `stylesheets` maps resource paths to source CSS, when detaching a layout that has linked/imported CSS. `materializeLayout` and the `Stylesheets` type are also exported. Advanced global CSS at-rules still need further compatibility review.

`elements.transfer` copies or cuts selected source subtrees across slides. Supply the source slide ID, target slide ID, selected IDs, and a frozen `sourceSnapshot` for clipboard semantics. The workbench additionally captures computed CSS and geometry so the destination preserves typography and transformed placement. Copies rebase local resource paths and remap source IDs, DOM IDs, SVG paint references, bindings and animation targets. Cut is one atomic document commit; a changed cut selection is rejected rather than moving different content.

Forward the bridge capture's optional `nativeChartTargets` with clipboard transfers. It identifies live ECharts hosts anywhere in the selected subtree, including hosts without existing author patches. The backend rejects captured charts without a reviewed reconstruction source and hints outside the selected subtree. This runtime evidence prevents unreviewed script variants from silently becoming empty copied containers. The field is omitted when no chart is detected and has no schema default, preserving historical request representations. Source-only clients must provide equivalent runtime evidence for script-owned content; an arbitrary unannotated div cannot be reliably classified from its author DOM alone.

`elements.arrange` supports six alignments, horizontal/vertical equal-gap distribution, translation, collective rotation and uniform or independent-axis scaling, relative to the selection or slide. Send current page-space rectangles from `capture`, including each object's `geometry` basis. The backend conjugates the requested page operation through the parent matrix, preserving skew, nonuniform ancestor scale and transform origin. Resulting `transform.matrix` becomes the object's CSS matrix; individual translation/rotation/scale can then be edited on that baseline. Capture must correspond to the commit's base revision. Without a basis, the geometric fallback assumes an untransformed parent. SVG graphics now provide a basis and an optional local `geometry.center`; that center accounts for irregular path bounds instead of assuming a rectangle starting at (0,0). Groups are flat, disjoint selection sets and cannot contain both a container and its descendant.

For `action: 'scale'`, optional `factorX` and `factorY` override the corresponding axis of `factor` (default 1). `anchor: [x,y]` sets a page-space pivot for scaling or rotation; omitting it retains the selection-center behavior. The browser's eight selection handles use the opposite edge/corner as the fixed anchor; Alt uses the center, Shift makes scaling proportional. The circular handle rotates about the center and Shift snaps the delta to 15°. Ratios are clamped to 0.01–100 per gesture, so crossing the anchor does not collapse/invert the selection; `element.transform` retains explicit negative `scaleX`/`scaleY` values for flipping. Groups and non-text content use affine scaling, including child content. Horizontal text containers default to the reflow behavior below. Ruler guide gestures are described below.

Handle previews and source commits share the affine basis conversion. The `transform` bridge event carries `rectangles`, `action`, `anchor`, and either `factorX`/`factorY` or `angle`; legacy translations retain `dx`/`dy` and default to `action: 'translate'`. The overlay uses shadow DOM and constant screen-size hit areas. Handles appear only in editing mode for unlocked selections with supported, invertible geometry. Escape, pointer cancellation, loss of capture or focus restore the exact previous styles without a commit. Handle focus stays inside the slide so Escape cancels the gesture rather than clearing selection through the host shortcut handler.

SVG capture uses [SVG geometry interfaces](https://w3c.github.io/svgwg/svg2-draft/types.html#InterfaceSVGGraphicsElement) and the [CSS transform reference box](https://www.w3.org/TR/css-transforms-1/#transform-box). The bridge converts legacy six-component SVG matrices to DOMMatrix, includes viewBox/ancestor transforms and fill-box origin offsets, and measures the local point corresponding to the current page bounding-box center. The same backend affine operation therefore handles mixed HTML/SVG selections. Browser evidence covers nested SVG groups, nonuniform viewBox scaling, nonzero viewBox origins, skew/rotation, percentage translation, fill-box origins, irregular paths and save/reopen. Perspective/3D, stroke-box origins, nested SVG viewport carriers and SVG child cross-page clipboard context still need work; unsupported SVG drag bases report an error before source mutation.

Canvas and object-list selection share `selectIds(current, incoming, objects, groups, mode)`, exported for other frontends. Modes are `replace`, `add` and `toggle`. Groups expand as a unit; selection removes ancestor/descendant conflicts so a shared container is not moved or deleted twice. Shift/Ctrl/Command clicks toggle selection, while dragging an already selected object carries the complete selection. A Shift drag retains the selection and constrains direction. Dragging blank stage space performs containment marquee selection; modifier marquee adds to the previous set. A blank click clears selection. Escape restores the previous selection when cancelling a marquee, and none of these selection-only operations creates a revision. Locked objects can be inspected, but cannot be moved by dragging themselves or a containing selection, or edited through double-click text entry.

The host `select` message now accepts `{ids: string[]}` (including an empty list); legacy `{id}` remains accepted. The bridge's `select` event includes `ids`, the first `id` for older consumers, and current object measurements. The workbench exposes `getSelection()` alongside `selectMany()`. Selection outlines and marquee are editing chrome; playback hides them. Native HTML drag/drop and touch panning are suppressed while editing to keep the object gesture in control; native interaction mode retains source behavior.

The example handles editing shortcuts consistently with canvas or workbench focus: arrow keys move the selection by one slide unit, Shift+arrow moves ten, Ctrl/Command+C/X/V/D copy/cut/paste/duplicate, Delete/Backspace delete, Ctrl/Command+Z and Shift+Z (or Ctrl+Y) undo/redo, Ctrl/Command+A selects author roots, Escape clears, and Ctrl/Command+S flushes queued edits. Form fields and contenteditable text keep native keyboard handling; interaction/play mode keeps native navigation and controls. The bridge emits `edit-action` with `{slideId, action}` only in edit mode; hosts must validate the source window/channel and allowlisted action before executing it. The `focus` host message restores canvas keyboard focus after an editing reload.

Repeated nudges within 100 ms coalesce into one translation command. The workbench serializes accepted editing actions, waits for an active save and the current canvas to be ready, measures geometry against the latest snapshot and checks document/page identity before execution. An additional browser test holds a save response, queues nudges, and verifies they use the acknowledged revision and updated geometry. A page switch cancels leftover actions rather than applying them to a different page. Nudge deltas use the same affine basis as mouse dragging, including SVG geometry; locked selections are rejected before enqueueing an HTTP commit. Copy/paste operations update the selected root IDs so subsequent editing targets the pasted objects. The exported workbench surface includes `whenEditsIdle()` for integrations/tests that need the queued keyboard work to finish.

Once a batched nudge becomes a commit, it uses the existing durable pending request and mutation ID. A browser test drops the response after successful persistence, reopens and retries, and verifies both exact displacement and unchanged revision count. Buffered gestures warn before unloading; unsubmitted input is not a server revision. Restore requests use the same durable request journal and are verified independently for lost-response replay.

Each slide can store `guides: [{id, axis: "x" | "y", position}]`; X denotes a vertical line and Y a horizontal line in slide coordinates. Update the entire list through `slide.update.patch.guides`. IDs must be unique within a page, with at most 200 guides. Older documents default to an empty list. Guides travel through page copies, immutable revisions, restoration and project export/import; a partial rename does not reset them.

The exported pure `snapTranslation(selection, neighbors, dx, dy, options)` returns a page-space translation plus matching lines. It considers the whole selection's bounding edges/center, page edges/center, neighboring objects, explicit guides and an optional grid. Pass `tolerance: screenPixels / stageScale`; the workbench uses six screen pixels. Nearest candidates win; explicit guides win exact ties. The bridge excludes moving objects, their ancestors/descendants and non-visible candidates. It uses the same result for the live affine preview and committed `elements.arrange`, preserving group spacing. Shift constrains movement to the dominant axis, Alt bypasses snapping, and Escape/pointer cancellation restores the original styles without saving. Object/guide/grid snapping also applies to the grabbed resize edge/corner, with oriented text reflow behavior described below. Rotation handles provide 15° angle snapping with Shift; rulers provide direct guide creation and editing.

The exported `snapResize(box, handle, neighbors, dx, dy, options)` returns `{anchor,factorX,factorY,lines}` in page coordinates. `ResizeHandle` covers the eight edges/corners. It shares translation's page/object/guide/grid targets, but only the grabbed edge/corner attracts to a target; the fixed opposite anchor stays fixed. `centered: true` uses the selection center. `constrain: true` maintains a single proportional ratio and considers the full handle displacement when applying tolerance, so a narrow/tall selection cannot jump far along its other axis to satisfy a nearby target. Only actually attained targets produce guide lines, and factors remain within 0.01–100. The workbench preserves Alt for center scaling and uses Ctrl/Command to temporarily bypass resize snapping.

Before a keyboard edit is enqueued from the slide, active movement/resize/rotation previews are restored. A direction key therefore nudges the original geometry rather than committing a transient mouse preview as its baseline. Resize/rotation also cancel on viewport resize, focus loss, pointer cancellation/capture loss, mode change or a changed selection; movement and marquee cancel on viewport resize as well. Movement and handle gestures also compare viewport/stage geometry on every pointer move/up, so a delayed resize notification cannot commit a transform measured in the previous viewport. Browser evidence verifies source styles, exact nudge displacement and unchanged revision counts across these interruption paths. Same-selection host echoes retain the active gesture.

Host message `snapping` accepts `{enabled: boolean, visible: boolean, grid: number}` (zero disables the grid). These editing preferences are local to the workbench/browser, while guide locations belong to the document. The guide overlay is isolated from source styles in a shadow tree and only appears in edit mode. It is never captured as author HTML or displayed in normal playback. The example's document panel can add, reposition and delete guides, toggle snapping/visibility and set grid spacing.

`table.edit` uses zero-based row/column indices and supports insertion/deletion, rectangular merging and unmerging. Rowspans/colspans are adjusted across structural edits; merges cannot cross a row group or cut through an existing spanning cell. Native cells retain source IDs where they survive an operation.

### SVG child clipboard context

For an internal SVG graphics element, the browser capture includes `rectangle.svgViewport = {width,height}` from its owning viewport, alongside `geometry.center` and the existing affine basis. The transfer wraps that element in an independent SVG viewport, preserves the source user-coordinate dimensions (including percentage coordinates), and compensates its matrix for the new viewport's scale. The wrapper occupies the captured page-space bounds plus the requested paste offset. Root placement, flattened child CSS and stored child transform metadata agree. Missing SVG context rejects the transfer with `SVG_GEOMETRY_REQUIRED`; nonfinite flattened geometry also rejects it.

Local `url(...)` paint/clip/filter/marker references and supported SVG `href` references are parsed with PostCSS's value parser. Transfer follows the complete dependency graph, including gradient inheritance, clipping through `<use>` and cyclic references, assigns independent DOM/editor IDs and rewrites links. Missing or script-owned referenced subtrees reject the atomic transfer. Referenced gradient stops and filter flood colors capture their computed source colors; their definitions can therefore retain those values even when the source's CSS selector is not present on the destination page. DOM IDs on noneditable titles are remapped too, along with ARIA associations.

`data-notale-clipboard-svg` marks the visible viewport wrapper. `data-notale-clipboard-defs` marks the hidden definition holder; the reference workbench excludes it and its descendants from the new paste selection. The inner graphics remain independently addressable source objects. Animation/binding/group metadata continues to map to the copied source IDs, and cut uses the normal conditional revision/journal path. The real browser scenario verifies affine corners, percentage coordinates, gradient/clip/use links, source color, reopen/history and a committed cut whose lost response replays exactly once.

This covers measured internal graphics. Root/nested SVG viewport carriers, ancestor clipping/filter contexts and arbitrary class-dependent symbol/marker definition styling still require additional compatibility work; this is not a conversion of script-owned scenes into static shapes.

### Data-backed charts

`chart.update` validates author data before rendering editable SVG. Kinds are bar, line, area, pie and doughnut. Cartesian charts accept multiple series and negative values; pie/doughnut require one nonnegative series with a positive total. Invalid data aborts the entire command batch. `chartDataSchema` and `chartSvg` are exported for frontend insertion workflows.

Chart author data also stores `fontSize` (10–24), `textColor`, `background`, `gridColor`, `colors`, `showValues`, `showLegend`, `showGrid`, `labelAngle` (0/−45/−90), `labelEvery` (0 for automatic), `valueDecimals` (0–6), `lineWidth` (0.5–12) and `pointRadius` (0–12). Defaults keep older chart payloads valid. Color validation accepts the actual 3/4/6/8-digit CSS hexadecimal forms. The workbench provides direct style controls and an “应用图表样式” action; raw data editing remains available separately.

Cartesian layout reserves title, axis labels and up to two rows of series legends. Horizontal labels wrap; tilted/vertical labels reserve their projected space. Automatic category intervals reduce label density while keeping every data sample; explicit intervals override that sampling. Grid/tick density adapts to available height. Value labels are emitted only when their reserved bounds fit without colliding with previous labels; very long values remain available in the source data and each mark's native SVG title. Titles/legend names may be shortened visually, with full labels retained in SVG titles and author JSON. Numeric axis labels keep their full numbers. SVG [textLength](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/textLength) bounds rendered text width even if fonts load differently, and inline text styles keep ordinary page CSS from overriding chart typography.

Chart updates regenerate owned SVG children while retaining the root source ID, placement, transforms and sizing. The background is an owned SVG rectangle; the root's CSS background is transparent. Doughnuts use annular paths with a true open center, including the single-positive-slice case, so transparent backgrounds do not reveal an underlying filled pie. Pie/doughnut share palette, text/background, legend visibility and number formatting; dense radial legends and advanced axis/legend placement still need further work.

### Object layers

`elements.order` accepts `{slideId, targets, action}` with `front`, `back`, `forward` or `backward`. It reorders native SVG graphics among their sibling graphic slots. Selection order in the request has no effect: multi-selection retains original relative paint order. Each selected sibling run moves across one unselected graphic for the one-step actions; front/back stable-partition all selected graphics. Independent parents are processed in one atomic command. Parent/child selections normalize to selected ancestors.

Objects keep their parent, namespace, IDs, attributes, transforms and metadata. Definitions, styles, scripts, comments and whitespace remain in their existing child slots. Selected locked objects, locked ancestors and locked descendants reject the whole batch. Text runs, switch alternatives, HTML and outermost SVG roots are not independent SVG sibling layers and reject this command with `INVALID_LAYER`. Supported containers include SVG/group/link containers and reusable symbol/marker/pattern/mask/clip containers. Ordering can affect authored structural selectors or scripts that depend on sibling order; arbitrary script-owned scene adaptation remains separate work.

`inspectSlide` now includes the element's `namespace` string. The exported pure `isSvgLayer(object, parent)` lets hosts classify eligible source objects using `{tag, namespace}`. The workbench routes SVG selections to `elements.order`, provides one-step layer controls, and can combine SVG ordering with existing HTML layer patches in the same save. Nested SVG viewports move as complete objects within their original parent. Text fragments and conditional alternatives require selecting their containing graphic.

For HTML/outer-SVG, exported `htmlLayerCommands(slideId, targets, objects, computedStyles, action)` plans ordinary `element.patch` commands for front/back/forward/backward within each immediate parent. Pass computed `position`, `display` and `z-index` for the selection, siblings, parent and relevant descendants. Positioning and flex/grid items use actual sibling z-index plus DOM tie order, preserve multi-selection order and leave DOM structure and box geometry unchanged. Unselected locked siblings retain their z-index; impossible locked intervals reject atomically. Unlocked sibling z-index values can be normalized to represent the new order. The workbench captures the required styles and checks page/document/revision before committing.

Static flow objects support front/back by becoming relative with zero offsets and a layer outside the sibling range. A flow container with absolute/fixed descendants rejects this conversion because it could change their containing block. Ordinary flow single-step ordering and arbitrary cross-parent/stacking-context order remain unsupported; the planner does not flatten CSS stacking contexts.

The workbench supports object names (`data-notale-name`), object search by name/tag/text/DOM ID, and hide/show (`visibility: hidden/visible`, preserving layout). These use existing atomic element patches and share locks, revision history, reopen and export behavior. Visibility can still be constrained by a hidden ancestor or authored CSS; show changes the selected object's visibility.

SVG rendering reference: [W3C SVG rendering model](https://www.w3.org/TR/SVG2/render.html#RenderingOrder). Browser acceptance verifies actual overlapping hit order and unchanged native affine geometry, rather than relying only on serialized child order.


## Bound object connectors

Slides have an additive `connectors` array (default `[]` for older author documents). Each connector stores `{id,start:{target,anchor},end:{target,anchor},kind,color,width,dash,startArrow,endArrow}`. Endpoint targets are stable source IDs within the same slide; `anchor` is `auto`, `top`, `right`, `bottom` or `left`. `kind` is `straight`, `elbow` or `curve`; width is 0.5–30, colors use valid hexadecimal CSS forms, and dash is `solid`, `dashed` or `dotted`. `connectorSchema`, `connectorEndpointSchema`, `connectorGeometry`, `connectorSvg` and their public types are exported.

`connector.set` accepts `{slideId,connector}` and creates or replaces a complete connector specification. It inserts/updates a corresponding owned native SVG root with the same `data-notale-id` and a `data-notale-connector` marker. Its line and arrow paths are owned implementation children; the source inspector exposes the connector as one object. Each endpoint accepts either `{ target, anchor? }` or `{ point: { x, y }, anchor? }`, exactly one of `target`/`point`. Free points are finite coordinates (±1,000,000) in the owned SVG viewBox, not browser pixels. `ConnectorEndpoint` and its schema are public exports; existing target-only payloads retain their defaults. Validation requires matching source/metadata and independent bound endpoints, rejects self-references and dangling references, and respects locked connectors and ancestor containers. Use `element.delete`/`element.lock` for removal/locking. Generic insertion or reparenting into the owned connector SVG also rejects with `DERIVED_GEOMETRY`, and content destinations respect all locked ancestors. Source geometry patches on the connector reject with `DERIVED_GEOMETRY`; opacity, visibility and z-index patches remain available. Configure its endpoints instead of treating its page-sized carrier as a free shape.

The native bridge resolves endpoint border/graphics edge midpoints through current HTML affine transforms or SVG screen matrices. Automatic ports choose the closest midpoint pair, or the closest midpoint to a free endpoint. Free endpoints use the carrier screen matrix and choose a cardinal tangent toward the opposite endpoint for visible curve bends and orthogonal elbow stubs. It computes outward normals, transforms ports into the connector's SVG space, and updates only changed path geometry on animation frames while the page is live. Straight lines, outward control-point curves and elbow routes retain their bound endpoints during object dragging, resizing, transforms and animation. The owned SVG has pointer-transparent surroundings and stroke hit targets. Generated path coordinates are runtime projections; source objects and connector specifications remain the saved author state. Exported HTML includes the same runtime and metadata and therefore retains binding behavior independently of the API.

Deleting a bound endpoint or its containing subtree removes incident connectors in the same revision; a locked incident connector prevents that deletion. A batch that explicitly deletes both an endpoint and its incident line removes the line once, including when the same batch first inserts or duplicates the page. Only a line actually removed by endpoint cleanup receives this treatment; unrelated missing objects and repeated direct line deletion remain errors. Recreating a connector or page clears the old deletion record. Undo/restore recovers both the endpoint and relationship. Clipboard copy/cut of a connected selection maps connector IDs and endpoint IDs together. Cross-page copying requires every bound endpoint to be included with the connector; free endpoints need no source-object dependency. Free coordinates stay in carrier space, while existing clipboard placement/affine capture moves the carrier, avoiding double offsets. For bound endpoints, incomplete selections reject `CONNECTOR_CLONE` rather than save broken links. Same-page copying can retain original unselected endpoints. The workbench duplicate button and keyboard shortcut use this clipboard workflow for connected subtrees; the low-level generic duplicate command directs callers to it. Page duplication preserves independent per-page bindings.

In the workbench, inserting a connector with zero, one or two selected objects creates a free, mixed or fully bound line. The new connector is selected automatically; its format panel edits endpoints, free-point X/Y coordinates and line settings. Selected unlocked lines show two fixed-screen-size endpoint handles. Drag onto an object to bind (near an edge midpoint selects that port, otherwise auto); drag onto empty space or hold Alt to create a free endpoint. A filled handle indicates a bound endpoint. Pointer moves are local previews; release commits one `connector.set`. Escape, pointer cancellation/capture loss, focus/visibility loss, changed viewport/carrier matrix, mode or selection changes cancel the gesture. Playback hides handles. Existing unbound arrows remain available as “自由箭头”. Connector geometry is excluded from ordinary multi-object transform bounds and snapping candidates; moving the selected endpoint objects drives the connection. Selection highlighting appears only in edit mode and does not leak into interaction playback; the canvas can select the rendered stroke; connector-only nudge/alignment shows an endpoint-editing notice without submitting an empty mutation. Geometry/text patches are disabled for selected connectors. Normal document save/history/journal behavior applies.

Evidence includes a real lecture with rotated/sheared HTML and transformed SVG endpoints: live mouse drag and saved/reopened/history positions match independent native port measurements; curve/elbow, dash/arrow settings and panel containment are checked; a complete graph cut survives a dropped successful response and exact replay; endpoint deletion/undo preserves relationships. A standalone exported slide checks bound endpoints frame by frame while its SVG endpoint plays a saved motion animation.

Remaining connector work includes obstacle-aware routing, finer custom ports, whole-line direct movement and content-specific non-affine/Canvas scene endpoints. The current elbow route does not claim obstacle avoidance. Arbitrary script-owned scene internals still need an editing adapter, and browser-only path updates are not serialized back as author HTML.

## Media editing and native playback

`media.update` targets an existing `img`, `video` or `audio` source ID. A patch can replace `src`, update image `alt` or video `poster`, and partially change typed `settings`. Resource replacement preserves geometry, animation targets and existing visual effects; responsive `<picture>` source selection is updated with the new image. Replacement by itself does not take over previously unmanaged native video/audio behavior.

Settings include `fit`, focal position percentages, four crop-edge percentages, native controls/mute, volume, playback rate, non-destructive `startAt`/`endAt` seconds, interval looping and optional `startStep`. Fit/focus operates inside the existing object box; crop edges clip that box without rewriting image bytes. Invalid empty crops and backwards time intervals fail the entire commit. Omitted patch settings retain their existing values; default values apply to complete author objects, not unrelated fields in a partial update.

```json
{
  "type": "media.update",
  "slideId": "page-id",
  "target": "video-node-id",
  "patch": {
    "settings": { "startAt": 2, "endAt": 8, "rate": 1.5, "muted": true, "startStep": 1 }
  }
}
```

The settings travel in source HTML as `data-notale-media`, so copies, saved revisions and exported HTML retain them. The bridge uses [native media properties and events](https://html.spec.whatwg.org/multipage/media.html#media-elements) to enforce the playable interval, reset on backward seek/edit mode and start on the chosen step. Unconfigured source media and scripts retain their original ownership. Browser autoplay policy still applies; a blocked automatic start exposes native controls for a user gesture. Speaker previews suppress automatic media starts while the audience window receives the actual step transition.

Signed resource responses support single [HTTP byte ranges](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests), suffix/open ranges, `206`, unsatisfiable `416` and strong ETag `If-Range` checks. Unsupported multipart range syntax falls back to the full representation. Trims are playback instructions, not transcoding jobs.

## Playback and animations

`animations[]` is ordered author data. Every effect has a target, presentation step, duration, delay, easing and trigger. `click` starts at the requested step; `with-previous` and `after-previous` derive their start from the previous cue in that step. `object` starts on a target click and subsequent relative cues inherit that event group. Custom keyframes are part of the backend contract; offsets must be ordered within 0..1, with supported easing/composition. The workbench edits existing cues in place and supports duplication plus both reorder directions.

The bridge resets animations on seek and computes the desired state; native steps call the source's `Deck.stepTo`. `stepMap` maps presentation steps to original script states, so an inserted pause can repeat the previous native state. Empty mapping retains the original progression. Imported runtime callbacks may reveal a larger step count than static HTML; the bridge reports the actual maximum when ready.

Host messages use `{source:'notale-host',channel,type,data}`; slide messages use `source:'notale-slide'`. Verify both `event.source` and the channel. Host commands: `mode`, `seek`, `select`, `measure`, `capture`, `snapping`, `focus`, `state`. Events: `ready`, `select`, `text`, `transform`, `step`, `navigate`, `measure`, `capture`, `edit-action`, `edit-error`. Wait for `ready` before measuring geometry or capturing a selection. The workbench is the reference consumer. Its `whenReady()` waits for the current native page. Async `commands()` waits for initial document loading; `showSlide(id)` waits for active saves/loads, validates the page, renders it and resolves only when that target native frame is ready. A later page switch superseding the request rejects its promise. Page cards and native internal links use the same path. Render generations prevent late object/history/preview responses from replacing a newer selection; the old iframe is inert until the current channel reports the expected page ready. A channel is a routing guard, not a substitute for validating command authorization on the server.

## Editor history and presentation recovery

The workbench journal records the operation kind (`commit` or `restore`), exact request/mutation ID, page/selection context and the resulting undo/redo stacks before sending. Success writes the acknowledged local history checkpoint before clearing the journal. Replaying a response that was lost applies the saved history plan exactly once instead of pushing an extra undo entry. Legacy pending commits without a kind remain supported. The same retry control handles normal commits, undo, redo and explicit historical restoration. Browser evidence drops a successfully persisted response for each restore action, reloads, retries the identical payload, checks the revision count and exercises the next history operation on a real interactive page.

Acknowledged undo/redo history is stored per document in sessionStorage and survives reloading the same tab. It is reused only if its revision matches the fetched head; external edits invalidate stale shortcut history. The original immutable server revisions remain available through the explicit history selector. PostgreSQL tests also verify a repeated restore returns its original revision after later edits without moving the newer head, and rejects a changed restore target or actor using the same mutation ID. After a successful commit or replay, the workbench also fetches the current head. If another window has advanced it beyond the acknowledged revision, the workbench displays that newer head and invalidates the obsolete local undo plan instead of presenting the old acknowledgment as current. A failed head fetch retains the request for another exact retry.

Each unconfirmed request now has a separate localStorage entry under `notale-editor-pending-v2:<documentId>:<mutationId>` (components URL-encoded). Its envelope is `{schema:2,task,title,createdAt}`; `task` is the exact pending operation described above. Each tab stores a per-document pointer in sessionStorage. Saving or discarding one mutation removes only that mutation's entry and a matching pointer, so unrelated tabs and documents retain their requests. Switching documents restores that tab's own pointer for the selected document; it never silently adopts another window's pending operation. Duplicated windows can share a pointer, but retry the same server-idempotent request.

The recovery list discovers all remaining entries in the same browser/origin, including work left by closed windows. The user can select a batch to recover, export its complete envelope, or import that file from the document panel and explicitly select it for recovery. Import preserves the request, mutation ID and original timestamp; it validates document identifiers and command/request shape, does not auto-submit, and refuses to replace a different payload with the same ID. File reads have a 50 MB cap, and browser storage quotas still apply. Corrupt v2 records remain untouched and can be exported as raw data. A local durable-write or pointer-write failure prevents sending the HTTP request; if only pointer persistence fails, the already-written record remains discoverable. `NotaleWorkbench.getPending()` exposes a clone of the current pending task for hosts/tests.

The legacy single-slot v1 request migrates to its own v2 record. A migration marker prevents completed legacy work from reappearing; the old slot is retained so migration never deletes a concurrently replaced request from an older workbench. Normal new writes use v2 only. Storage events refresh the recovery list across windows. These are local recovery records, not automatic merging or cross-device synchronization: unresolved version conflicts retain their exact request until the user retries, exports or explicitly discards it. The backend continues to validate host scope, actor identity, idempotency and base version for every retry.

A show URL now pins the loaded revision and retains a session ID. A small local checkpoint stores page identity, step/max, timer start, blackout, speaker mode and overview. Reloading that URL reconstructs the current step without replaying its entrance transition and uses the same revision even if editing has advanced the document head. Audience windows in the same browser/origin can load the controller checkpoint, ask the controller for its latest state, and resume from it even after the controller closes. Timer resets propagate to the audience. New step broadcasts still animate; catch-up broadcasts and duplicate readiness do not restart the same cue.

The bridge's `state` host message requests a fresh ready report after native initialization. Ready reports include a runtime ID, allowing the show to distinguish a newly loaded runtime from repeated messages for an already initialized frame. This also resets cached/preloaded slides correctly when revisited. Invalid checkpoints or a checkpoint for a different document/revision are ignored. Recovery covers explicit page/step state and presentation controls; precise media playhead time, random Canvas simulation internals and arbitrary script-owned transient state still require content-specific adapters. Long sessions renew the same content URLs through the authenticated host API as described below.

## Stable preview URLs and renewal

`GET /api/documents/:id/preview?version=N` returns `{version,channel,expiresAt,renewAfterMs,slides}`. `expiresAt` is an absolute expiry timestamp for diagnostics; `renewAfterMs` is a duration (currently 30 minutes), so scheduling does not depend on a client's wall clock matching the server. Content URLs and bridge channels remain unchanged during renewal.

Send `POST /api/documents/:id/preview/renew` with `{channel,version}` to extend that channel's lease by one hour. The API reruns host identity/read authorization and verifies the signed grant's original actor, scope, document and immutable revision. Possession of the content URL alone does not authorize renewal. The response contains the same channel/version and new expiry/delay. Concurrent renewals preserve one record; a later document head does not change what the old URLs render, and renewal creates no document revision.

`editor_preview_leases` stores token hashes and expiry in PostgreSQL, shared across API/content instances. Content validates the signature and active lease on each request, including range requests. An expired or absent lease returns 403. An authorized original user can renew an expired lease after reconnecting. Renewal removes lease rows expired for more than one day; this never removes document history or assets, and an authorized renewal can recreate the row. Previously issued stateless grants remain readable until their signed expiry, provided the signing secret is unchanged; only new lease grants support renewal. Keep the same secret and database across host instances/restarts. The standalone local server uses `EDITOR_PREVIEW_SECRET` when supplied; otherwise it atomically creates and reuses a private `.local/preview-secret` file. Concurrent starts agree on one key, and a corrupt existing file fails startup rather than silently rotating it.

Both reference browser surfaces schedule renewal, retry failed requests after 15 seconds and on reconnection/focus/visibility, and abort a request after 15 seconds without a response. A failure exposes “重试资源连接” while retaining the current iframe. Success removes the notice without reloading source DOM, animations or native interaction state. Replacing a workbench preview stops the old renewal loop; page closure cancels requests and timers. The browser integration is a host-authenticated client, not an alternative login system. Host logout/policy denial prevents subsequent renewal; an already issued lease remains readable until expiry (immediate revocation remains a separate host policy concern).

## Exclusive presentation control

The show integration uses an exclusive [Web Lock](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request) scoped by session, document and fixed revision. The first controller acquires it without waiting. Opening the same show URL again creates a following window; it receives page/step, timer, blackout and overview updates, but cannot advance the session, schedule automatic transitions or overwrite the recovery checkpoint. Audience windows retain native Canvas/media interaction while their presentation navigation is controlled by the speaker.

`接管放映` explicitly queues for the lock and requests a cooperative handoff over the existing BroadcastChannel. The current owner verifies that a claim remains queued, records/broadcasts its final state, disables its controls and automatic advance, then releases. The new owner reads the checkpoint after acquiring the lock and catches up without replaying the audience's active cue. Concurrent requests serialize; stale request messages cannot evict an owner when no claim remains queued. Closing a controller releases its lock; closing a follower never writes a checkpoint. Back/forward-cache restoration reloads before rejoining.

This coordination is for windows within the same browser/origin, with Web Locks available in a secure context (HTTPS or localhost). Unsupported environments display the limitation and do not claim control. A suspended controller must resume or close to complete a cooperative handoff; takeover never forcibly releases a lock while the previous controller's callback continues running. Cross-device presentation control requires a host coordination transport. `NotaleShow.state().control` exposes `controlling`, `following`, `waiting`, `starting`, `unavailable`, or `audience` for integration diagnostics.

## Resources, exports, and operations

Upload bytes first, then reference the returned hash in a commit. A blob must have been uploaded in the same scope. The save transaction validates referenced hashes/sizes and static HTML/CSS dependency paths. Original JS can load resources dynamically; the importer packages the complete asset tree and browser audit supplements static checking.

Blobs are kept while revisions exist; there is currently no destructive history pruning or automatic resource GC. This prioritizes restoration integrity and means storage grows with retained content. PostgreSQL `pg_dump` covers document metadata and blob bytes together. The executable `npm run test:restore` drill pins a consistent source snapshot, restores an isolated database, checks all editor tables/blob bytes and historical mutation replay, and runs the real-slide/browser validations. See [OPERATIONS.md](OPERATIONS.md) for the workflow and recovery boundaries. Restore into a separate database and run the browser audit before switching traffic. Stop the dedicated local database with `docker compose -p notale-editor stop`; retain the volume to retain saved work.

The `.notale` v1 ZIP container contains `notale-project.json` with original author HTML, rendered page files, `index.html`, and resource paths. Rendered pages include the bridge and current author defaults; reopening a project uses the manifest, not the runtime HTML. Import validates hashes and creates a new document ID. Linked online resources remain online dependencies; runtime/library licenses and network needs travel with those resources, rather than being silently removed.


### Text-box dimensions and reflow

A single horizontal text container exposes handles along its own rotated/skewed axes. Containers may retain multiple paragraphs, headings, nested ordered/unordered lists, blockquotes, CSS columns and text-only grid/flex layouts. Horizontal edge resizing keeps font size and automatically fits height after wrapping; vertical edges and corners set explicit dimensions. Alt preserves the center and Shift preserves the box-size ratio. The opposite top corner stays fixed for an ordinary horizontal resize. The format-panel “文字框调整尺寸时保持字号” checkbox switches to affine content scaling. Groups, embedded media/controls, positioned child scenes and unsupported geometry retain the other geometry path; automatic inference is not a universal HTML layout engine.

The bridge sends `box-resize` with `{id,width,height,matrix,style}`. Commit its `element.patch` style normalization and `element.transform` in one command batch. Transform dimensions accept `null` to explicitly set CSS `auto`; omitted dimensions leave existing declarations untouched. Reflow canonicalizes the element to border-box dimensions and a zero-origin matrix while retaining its linear transform, font size and rich source. Logical dimension declarations are reset so later physical width/height edits work. Source style patches place each explicit declaration last, preserving CSS precedence across shorthand/longhand and logical/physical aliases. Later affine arrangement retains nullable dimension metadata.

Browser evidence uses independent temporary corner probes on a real lecture augmented with rotated/skewed/nonuniform ancestors, percentage translation, a noncentral origin, content-box padding/border and inline strong/emphasis. It checks wrapping, font/content preservation, fixed and centered anchors, preview/save/reopen, undo/redo, cancellation, keyboard movement, subsequent dimensions, affine-mode fallback and the lecture's native Canvas control. Text reflow also snaps to page/object/guide/grid targets. It preserves fixed/center anchors and proportions, bounds the full grabbed-handle correction to six screen pixels and checks the actual post-wrap position. Line-break discontinuities that would exceed tolerance or miss the guide retain the raw resize geometry and emit no snap line. Ctrl/Command bypasses text snapping as well as affine snapping. Vertical writing, embedded mixed-content scene flow and CSS transform reference-box edges require further work.


The exported `snapConstrainedPoint(point, directions, neighbors, options)` returns `{delta,lines}` for one allowed direction or an invertible pair. Each direction maps one resize parameter into page-space displacement. This permits text dimensions to change along transformed local axes without translating the fixed anchor. The helper considers the same page/object/guide/grid targets as other snapping, prefers an attainable two-axis match within the full Euclidean tolerance, and gives explicit guides priority on exact ties. Zero/singular directions and disabled snapping return zero deltas. It does not perform text layout: the browser applies its candidate dimensions, remeasures the actual handle, retries at most three corrections and falls back to the raw dimensions if wrapping or dimension bounds prevent a valid result. Visible line accuracy is checked within 0.04 screen pixels, allowing CSS subpixel layout quantization.

Real-deck browser scenarios independently probe corners for rotated text edge snapping, center/proportional resizing, two-axis corners, identical saved/reopened geometry and Ctrl/cancellation. A measured line-break threshold explicitly shows a raw nearby width would add a line and move the handle more than six pixels; snapping rejects that jump and persists the unsnapped dimensions. Existing pure geometry/reflow assertions disable snapping through its actual UI control, so raw-coordinate checks remain distinct from snap behavior.


Structured text resizing preserves the complete authored descendant tree; children keep their IDs, margins, padding, fonts, list styles, numbering and layout declarations. It changes the container dimensions and transform only, so a paragraph remains independently editable afterward. For horizontal automatic height, the bridge releases the bottom/logical block-end inset and stretch alignment, preventing top/bottom constraints or a taller parent grid track from forcing an unrelated height. The fixed anchor is corrected after this layout change as part of the same persisted style/transform batch.

Four real-lecture browser variants verify paragraphs, balanced two-column content, grid and column-flex content through preview, save, undo/redo and reopening. Their contents include distinct heading/paragraph/quote fonts, a Roman ordered list starting at three, a nested square-marker list and strong/emphasis spans. Independent corner and computed-style checks cover the entire descendant tree. The grid variant lives in a stretched 700px parent track and verifies content height remains smaller than that track; each variant also edits a child paragraph after reopening. Automatic inference continues to exclude embedded media/controls, positioned descendants, custom elements and shadow content; those need their own editing semantics rather than assuming plain text flow.


Container lock behavior is enforced by the backend as well as the canvas: `element.transform` and `element.patch` reject a target containing any locked descendant, including inherited style and attribute/class edits. Arrangement expands into the same guarded transforms. Rejection leaves the document and revision history unchanged. Unrelated sibling text edits remain allowed, and an explicit unlock followed by a resize can be committed atomically. This aligns host-submitted commands with the canvas rule that a container cannot carry a locked child along with it.


### Rulers and editable guides

The workbench's ruler preference is off by default and stored with local snapping preferences. `snapping` bridge messages accept `rulers: boolean`; ruler chrome appears only in edit mode. Rulers and guide hit areas live in shadow DOM and never become author content. They retain screen-sized ticks/markers while displaying page coordinates; object resize handles remain above guide hit areas.

Drag the top ruler to create a horizontal Y guide or the left ruler for a vertical X guide. Existing guide lines and ruler markers are draggable. Release on the corresponding ruler strip or outside the page to remove an existing guide; an abandoned new guide creates no mutation. Shift rounds drag positions to ten page units; positions otherwise retain hundredth-unit precision. The active guide supports its axis's arrow keys, Shift coarse steps and Delete/Backspace. The numeric guide list remains available for precise and off-page coordinates.

The bridge sends `guide-edit` with `{id?,axis,position?,remove?,delta?}`. The host assigns new IDs, applies the edit to current `slide.guides` and submits the existing `slide.update` command. Keyboard deltas are evaluated against the latest acknowledged guide position in a serial queue, so keys received during a held response do not overwrite each other. Queued work is discarded if its document/page context changes. After an acknowledged edit the host may send `guide-focus` with the guide ID to restore keyboard focus. Saving uses the same durable pending journal and idempotency path as other edits.

Live preview is local only. Escape, pointer cancellation/capture loss, focus loss, mode/visibility changes and changed viewport/stage dimensions cancel it. Starting an object gesture or changing object selection also cancels a guide gesture. The release path independently validates its captured viewport geometry. Play mode hides the ruler layer and leaves native slide controls available.

Real-lecture browser evidence covers creating both axes, mouse movement, fine/coarse keyboard movement, three queued nudges with the first response held, cancellation, delete/undo/redo/reopen, unchanged author HTML and preserved native Canvas input. A separate scenario drops a successfully persisted guide response, reloads, retries the identical request and verifies exactly one guide/revision.


## Native ECharts editing

`Slide.nativeCharts` is an additive record keyed by a stable source host ID, defaulting to `{}` for older documents. Each entry is `{adapter: "echarts", option: NativeChartOption}`. `native-chart.set` replaces that host's complete author patch; `native-chart.remove` removes the patch. These commands use the same conditional, idempotent commit/history contract as other edits. Replay also accepts the pre-adapter request hash for inserted slides and clipboard source snapshots whose newly defaulted `nativeCharts` is empty. Nonempty chart changes and different actors never gain that compatibility exception; new commits still store their exact parsed request hash. They honor host, ancestor and descendant locks, validate existing div/canvas hosts, and preserve source HTML/scripts. Metadata follows page duplication and is cleaned when its source host is removed.

```ts
const command: Command = {
  type: 'native-chart.set', slideId, target: chartHostId,
  option: {
    series: [{lineStyle: {width: 9, color: '#873e98'}}],
    yAxis: {axisLabel: {fontSize: 18}},
  },
};
```

The exported `nativeChartOptionSchema` validates the supported patch: series data/names/types, line/item/label styles, symbols and smoothing, title/legend/text/palette/background, and basic axis data/range/labels/split lines. Data accepts finite numbers, strings, null gaps, coordinate tuples and named value objects. Unknown fields/functions, malformed colors, inverted axis ranges and excessive samples/payloads reject before persistence. This typed subset can expand; it is not advertised as the complete ECharts option schema.

An omitted series `data` keeps the original simulation's changing values. An explicit `data` array fixes that series to the author's values across native updates. Series arrays use ECharts' component matching, with index placeholders (`{}`) for preceding unchanged series or explicit IDs where the source defines them. Keep source series identities/order stable or update the author patch with the new structure. The renderer uses the page's existing ECharts library; it does not download a replacement runtime.

The bridge discovers instances through their source hosts, applies the author patch after initialization and each native `setOption`, and reattaches after disposal/reinitialization. Native calls retain their arguments, including full `notMerge` updates. The subsequent author merge is silent. Original formatter functions stay in the native instance; the bridge does not JSON-serialize/reconstruct the full option tree. ResizeObserver keeps adapted charts sized to their hosts, and pagehide/pageshow releases/reinstalls observers and method wrappers. See the [official ECharts instance API](https://echarts.apache.org/en/api.html#echartsInstance.setOption) for native merge semantics.

In bridge measurements, `nativeChart: true` identifies a live instance. Send `native-chart-inspect` with `{requestId,target}` and receive the same type with `{requestId,target,available,error?,series}`. The series projection contains name/type/data/color/width/showSymbol for the inspector; it is not a serialization format for arbitrary runtime callbacks/state. Existing channel and source-window validation applies. The workbench's Format panel demonstrates reading series, applying style edits, optionally fixing data, applying a validated option patch, and restoring original configuration. Wait for canvas readiness after each acknowledged save.

Standalone exports include the same adapter and immutable metadata. Real-page tests exercise native redraw, data/style persistence, exact lost-response replay, undo/redo/reopen, callback output, independent instances, reinitialization, page copying and portable playback.

### Independent native chart copies

`inspectChartSources(slide)` discovers reviewed source factories for the four ECharts hosts on lecture pages 11, 17 and 24. Discovery parses source without executing it. The registry requires the exact original inline-script SHA-256 and target DOM ID; each factory retains reviewed data construction and callback closures while omitting original DOM ownership and event bindings. Changed or unsupported scripts require a reviewed adapter. This is not generic JavaScript closure serialization.

Use `elements.transfer` with the chart host itself selected, measured rectangles and computed styles, as with ordinary clipboard editing. The resulting `nativeCharts[newHostId]` contains an optional `source: NativeChartSource` alongside the author `option`. Its fields are the reviewed original `script`, original `domId`, and `library`, a canonical document-relative asset path. The backend validates source identity and the referenced immutable library asset. The renderer rebases/injects that library when the destination page lacks it and emits a fresh factory per owned host. The author HTML is not rewritten to store runtime-generated SVG or functions. External consumers can import `inspectChartSources` and `NativeChartSource` from the package root.

Every factory invocation creates independent data and formatter functions. The browser adapter initializes, resizes, disposes and recreates these owned chart instances. Copies inherit saved author patches; native-chart edits preserve their source metadata. For owned copies, `native-chart.remove` clears the author patch and retains the source so reset reconstructs a working original configuration. `element.delete` removes an owned copy and its metadata; clipboard cut can move it across pages. A cut rejects a stale clipboard snapshot whose chart metadata changed after capture. The original source page can be deleted without breaking the independent copy, and standalone export/engineering import retain its factory and library.

The workbench duplicate button routes live native charts and containers enclosing them through this clipboard contract. Page/document navigation and immediate paste wait for in-progress clipboard capture, including when source measurement is delayed. The browser acceptance verifies callback outputs, exact series data, independent editing, disposal/reinitialization, delayed capture, dropped-response cut/reload/exact retry, undo/redo, source-page removal, reset/delete and portable export/import.

Copying a bare chart captures the authored source and saved patches; page 24's bare-chart factory starts from its authored learning-rate default. Whole learning-rate components use the stateful contract below. Other parents enclosing native controls still require an adapter. The four reviewed original hosts now support direct cut and deletion through the lifecycle projection below. Canvas instance copying and other source families remain open work.

Native canvas readiness does not mean every media element has loaded its metadata. For media assertions, wait for loadedmetadata/readiness and the configured playback state. For asynchronous third-party data, verify the relevant instance state as well.


### Original chart deletion and direct cut

For the same reviewed source families, ordinary `element.delete` removes an original chart host, and `elements.transfer` with `mode: "cut"` moves it directly into an independent destination instance. The author script remains unchanged in the stored source. The renderer identifies missing original DOM hosts and uses Acorn source ranges to omit their initialization, `setOption` and resize calls only in its disposable projection. Page 17's surviving chart still receives its data and resize handler. Page 24 skips the deleted chart's initialization/error-fallback block; its remaining buttons and metric cards continue running.

Undo/restoration reintroduces the host and original runtime normally. Cut retains the saved author patch and uses the existing atomic commit, exact retry and export/import contracts. A frozen cut snapshot also compares its discovered chart source against the current source, rejecting source changes even when host HTML and author patch are identical. Locks still apply. Portable rendering uses the same lifecycle projection.

This source-specific handling does not rewrite arbitrary JavaScript references. A moved chart becomes independent; source-page controls continue controlling remaining source-page content and do not become remote controls for the moved chart. The learning-rate component adapter below moves its reviewed controls and captures their selection. Arbitrary deleted metric/control dependencies and other script variants require further adapters.

## Private Canvas startup parameters and captured state

`GET /api/documents/:id/slides/:slideId/scenes?version=N` discovers source-backed scene descriptors under the existing host read policy. The exported `inspectSourceScenes(slide)` provides the same server-side discovery without HTTP. Descriptors include a source fingerprint ID, a state group name, associated source object IDs, scalar parameter defaults, optional finite choices, and recognized native control links/ranges. Discovery parses source with [Acorn and its ancestor walker](https://github.com/acornjs/acorn/tree/master/acorn-walk); it never evaluates source JavaScript on the server.

The current adapter recognizes scalar fields in object literal startup declarations at program level or directly inside an immediately invoked function, with Canvas DOM references in the same scope. It deliberately distinguishes nested/callback-local variables and does not present them as that startup state. Direct input/change handlers assigning `event.target.value` or `checked` (including numeric parsing) provide control links. Computed values, external scripts, dynamic scene graphs and other initialization patterns need additional adapters; this is not a universal JavaScript state serializer.

`scene.set` stores `{sceneId, values}` in the optional `Slide.scenes` array, replacing that scene's author override. `scene.remove` removes the override. The field is absent for untouched legacy slides, so adding this capability does not inject a new default into old request hashes. A scene ID includes script index, SHA-256 and declaration location; stale or missing source, unknown/mistyped parameters, invalid explicit control ranges/steps, values outside inferred choices and locked source dependencies reject atomically.

```ts
const scene = inspectSourceScenes(slide)[0];
const command: Command = {
  type: 'scene.set', slideId: slide.id, sceneId: scene.id,
  values: {rho: 0.3, M: 31, eps: 0.25, seed: 1234},
};
```

Author HTML stays unchanged. The render projection substitutes only validated initializer values and inserts getters in the original lexical scope, preserving original methods and closure access. It escapes embedded JSON so string parameters cannot terminate the script element. The bridge then synchronizes linked controls through their native events before announcing readiness. The page's original simulation and drawing functions run normally. Preview and standalone export use the same projection; the engineering manifest retains the author source and metadata.

Bridge `ready` includes scene descriptors. Send `scene-inspect` with `{requestId,sceneId}` to receive `{requestId,sceneId,values}` or an error, through the existing channel/source validation. The getter reads the live private state, including a newly chosen random seed. The workbench Format panel demonstrates reading it, editing numeric/string/boolean parameters or choosing a finite option and committing them; reading alone creates no revision. Persisting a captured state still uses the ordinary conditional commit, pending journal and exact retry contract.

For a linked parameter, the last explicit edit wins: `scene.set` clears conflicting form defaults for the parameter values it supplies; a later `binding.set` removes the corresponding scene initializer override and uses the form event instead. Other parameter overrides/defaults remain intact. Undo/restore retains the complete previous source/metadata/binding combination. Resetting the scene returns its initializer parameters to source defaults while preserving independently authored form defaults that remain.

The page-07 acceptance scenario verifies the real correlation/model-count/error-rate/seed state, actual Canvas pixel identity across reopening, captured resampling, dropped-response/reload/retry, undo/redo, independent page copy/reset and exported playback with working controls. Single-instance copying/deleting/reparenting and restoring arbitrary transient simulation state remain lifecycle work; do not infer them from parameter persistence alone. More complex event wiring, implicit native control defaults and select/radio choice constraints need further coverage before claiming general control adaptation.

Finite choices are derived from static array/object lookups such as `tasks[state.taskIdx]` and `currentTask.methods[state.selectedMethod]`. Lexical `const` aliases and nested literal tables are resolved without evaluation. The exported `SceneChoice` is `{value: SceneScalar, label: string}`; `SceneParameter.choices` is optional. Array entries retain numeric index values and use literal title/label/name text when available; object entries retain their string keys. Multiple possible branches use their common keys, so this does not yet describe dependent option sets that differ by another parameter. The workbench uses typed selects and preserves numeric values when capturing/saving.

Inference excludes sparse/spread/computed/cyclic or unresolved tables and tracks direct mutations, aliases and escapes to unknown calls. Primitive value formatting does not make its containing table mutable. This is a bounded source analysis, not a proof of arbitrary JavaScript immutability: reflective changes and complex aliases require an explicit adapter. No choices is absence of a proven finite set, not a claim that every scalar is a valid runtime value. Implicit form defaults and native select/radio constraints remain separate follow-up work.

## Full native scene checkpoints

Scene descriptors may now include `checkpoint: "bootstrap-forest-v1"`. This is a reviewed adapter for the actual page-12 Bootstrap decision-boundary simulation. It matches the complete original inline-script SHA-256 and the private state declaration, so changing its script requires a reviewed adapter update. Ordinary HTML/CSS editing and page copies keep the original source script and continue to use the adapter. Other native scenes continue to use their existing scalar parameter adapters; this contract does not automatically serialize arbitrary JavaScript closures.

`scene-inspect` includes a typed `checkpoint` when that adapter is available. The exported `SceneCheckpoint` and `sceneCheckpointSchema` contain the decision trees, current sample, previous single/ensemble prediction grids, displayed comparison metrics and the separate generator state. Validation bounds tree depth/count, enforces the native model-count choices, requires 80 sample points and 2,000 binary cells in each grid, and accepts the source's numeric initial metrics or formatted percentage strings. The generator supports its full positive 31-bit range; it is not truncated to the ordinary parameter scalar limit.

```ts
const command: Command = {
  type: 'scene.checkpoint', slideId, sceneId,
  checkpoint: sceneCheckpointSchema.parse(captured.checkpoint),
};
```

The command stores the checkpoint in `Slide.scenes` with empty `values`, using the same conditional commit, idempotency, pending recovery and immutable history contract. Checkpoints and initializer overrides cannot coexist in one scene setting. Saving a checkpoint clears conflicting source-control defaults; an explicit subsequent initializer edit or linked form default releases the old checkpoint. `scene.remove` returns the scene to source initialization. These operations honor locks on the source canvases, controls and labels; the exact source fingerprint and adapter must match before persistence.

Runtime hooks are inserted only into the disposable render projection. After native initialization and form defaults, the bridge restores the private object and generator and invokes the original `updateUI`, which redraws both canvases and updates the native controls/metrics. It preserves the original tree algorithms and handlers. Missing restoration hooks prevent readiness rather than silently showing an initial scene. The workbench offers native interaction followed by read/save of the complete state; derived counters and metrics are not offered as editable initializer parameters. Model count can still be set through a validated `scene.set` initializer when a fresh simulation is wanted.

This is an author checkpoint, not continuous learner-session autosave. Reading captures a particular moment; later unsaved interaction remains transient. Reopening, history restoration, independent page copies and ZIP export/import carry the saved state. Tests additionally compare the *next* native sample after restoration to uninterrupted execution, proving that the private generator and prediction history are preserved, not merely the displayed values.


### Stateful interactive chart components

The exact reviewed page-24 learning-rate source supports transferring its complete chart, three buttons and four metric values as one component. `inspectChartComponents(slide)` discovers the component root and stable member IDs. `elements.transfer` remaps all those IDs together; copies have independent controller closures and can survive deletion of the source page. The renderer scopes the original script’s button queries away from independent component roots. Stored author scripts remain unchanged.

Forward the bridge’s optional `nativeChartStates` alongside `nativeChartTargets`. This record is keyed by captured chart host ID and contains `{value, active, inactive}`: `value` is `"1.0" | "0.1" | "0.02"`, and each appearance has `backgroundColor`, `color`, `borderColor` and `fontWeight`. The bridge reads the selected button and computed appearance when the whole component is captured. Dynamic metric slots retain intrinsic width/height unless explicitly authored, so later profile values are not confined to the captured digit count. Omitting this record uses the authored/default or previously saved selection. Neither new optional field has a schema default, preserving historical request hashes.

An owned chart’s optional `interaction` stores adapter `learning-rate-v1`, the root, button IDs keyed by learning rate, metric IDs (`optM`, `minErr`, `overfit`, `verdict`) and saved value/appearances. All members must be distinct and contained in the root. Chart, control and metric carriers cannot contain one another; independent component roots cannot overlap or enclose another known native chart. These checks prevent a metric update from replacing its own controls. State hints require the complete component selection. `native-chart.state` accepts `{slideId, target, value}` for an owned component chart host. The workbench can read a live choice and save it through the native chart inspector. Native clicks alone change playback state; saving or copying the component makes the choice durable. Author chart patches still apply after each native redraw; fixed series data overrides therefore deliberately replace the profile’s generated data until reset.

Button text and ordinary object styling remain editable. The controller owns the four captured button appearance properties and reapplies the selected/inactive appearance on each choice; those states are editable with the dedicated appearance inspector and command described below. Partial deletion/replacement or transfer of required members rejects with `COMPONENT_BOUNDARY`; transfer or delete the complete root. The standard object duplication command cannot duplicate an owned component; use clipboard transfer. State changes respect locked controls, metrics, containers and affected descendants. This adapter does not yet support detaching members or arbitrary component restructuring, arbitrary JavaScript source variants, or a universal transient runtime snapshot.

### General HTML/SVG components, states and teaching steps

`Slide.components` is optional and has no schema default. Each `InteractiveComponent` has a stable `id`, source DOM `root`, `name`, `initial` state, named `states`, event transitions, step mappings and transition duration/easing. Components retain the original HTML; runtime state changes are disposable projections. This model applies to ordinary HTML/SVG objects and can also drive an adopted native chart through `nativeChartValue`.

```ts
const component: InteractiveComponent = {
  id: 'explanation', root: panelId, name: 'Question and explanation', initial: 'question',
  states: [
    {id: 'question', name: 'Question', patches: {[answerId]: {visible: false}}},
    {id: 'answer', name: 'Explanation', patches: {
      [answerId]: {visible: true, text: 'The independent errors partly cancel.', style: {color: '#17613f'}},
      [panelId]: {style: {transform: 'translateX(80px)'}},
    }},
  ],
  events: [{id: 'reveal', target: buttonId, event: 'click', to: 'answer'}],
  steps: [{step: 2, state: 'answer'}], duration: 250, easing: 'ease',
};
// Commands use the usual atomic commit, version precondition and mutation ID.
{type: 'component.set', slideId, component}
{type: 'component.state', slideId, id: component.id, state: 'answer'}
{type: 'component.remove', slideId, id: component.id}
```

A state's patches may change CSS, leaf text, visibility, or a native chart value (`"1.0" | "0.1" | "0.02"`). A native value requires the complete adopted native component inside the general component's root, so its controls/metrics cannot be changed outside the declared component or bypass their locks. State styles reference existing content resources; switching among image objects uses visibility rather than introducing a new URL in a CSS state patch. Source text with child elements requires editing those children individually rather than replacing their structure through a text state.

State changes restore properties omitted by the new state to their authored baseline. Event transitions support `click`, `pointerenter` and `pointerleave`, with optional `from` state; ambiguous source transitions reject. Events are inactive during editing, while the inspector can explicitly preview a state. Transitions use Web Animations and respect reduced-motion preferences. Step seeking selects the latest mapped state at or before the requested step, including backward seeking, and contributes to the page's step maximum. Step zero must agree with `initial`; changing the initial state also updates an explicit zero mapping. Entering edit mode shows a component's initial state; explicitly scrubbing steps still previews its step mappings.

The workbench offers component creation, internal object selection, state duplication/removal, text/visibility/style/native-value edits, initial-state selection, event editing, step mapping, duration/easing and flow/flex/grid container layout. `component.remove` removes the behavior and restores the original author content on rerender. Deleting ordinary internal objects prunes their state patches and events; removing the root removes the definition. Native adapters retain their stricter required-member boundaries.

Clipboard transfers forward optional `componentStates`, keyed by component ID. Whole-component transfer remaps root, patch and trigger targets; state IDs remain local to the new component. Copying captures the current state as its initial state, including an explicit zero-step mapping. The bridge measures the authored baseline during clipboard capture and restores the current display immediately, so a transient transform is not baked into the base and applied twice. The baseline of a driven native chart is retained separately from the general component's current state. Required state/event members require whole-root transfer; unrelated static children may still transfer independently. Frozen cut snapshots compare component metadata and reject changed definitions.

Root/reference/state uniqueness, containment, event determinism, property ownership and locks are validated before a commit. The workbench is an integration reference; general vector drawing, arbitrary script-owned Canvas instance reconstruction, reusable component library overrides and more sophisticated layout constraints remain tracked in the capability ledger.

### Editing a reviewed original chart component in place

`native-chart.component` accepts `{slideId, target, state?}`. It discovers the reviewed component and adopts it under the same source IDs, preserving existing chart patches and the unchanged source HTML. An optional captured `{value, active, inactive}` seeds the initial interaction. The renderer suppresses the original instance initializer and original control handlers in its projection; the independent controller takes over the same host. Ordinary undo/history restores the earlier author model.

`native-chart.appearance` accepts `{slideId, target, state: "active" | "inactive", patch}`. The nonempty partial patch contains `backgroundColor`, `color`, `borderColor` and/or `fontWeight`. It preserves the other state's appearance, omitted properties, selected value and chart data. The inspector checks CSS support before submission. Control/container locks are enforced; an unrelated locked metric does not prevent changing button appearance. The inspector can adopt and style an original component in one atomic batch, and its component selector navigates the root, chart, buttons and metrics.


## Reusable teaching components and instance overrides

`DeckDocument.componentLibrary` is an optional array of `componentDefinitionSchema` values. Publishing captures a transferable source subtree with its behavior, assets, measured typography and layout; it does not retain unrelated page scripts or depend on the source page remaining present. The workbench captures the authored baseline before publishing. Pass only `rectangles` and `computedStyles` from `NotaleWorkbench.captureSelection([root])` to the publication command.

```ts
await commands([
  {
    type: 'component.publish', slideId: sourceSlideId,
    id: componentId, definitionId: sharedId, name: '问题与解释卡片',
    rectangles: capture.rectangles, computedStyles: capture.computedStyles,
  },
  { type: 'component.instantiate', slideId: destinationSlideId,
    definitionId: sharedId, offset: { x: 40, y: 40 } },
]);
```

Re-publishing the original component to the same definition ID atomically refreshes all linked instances across the document. Instances have independent object/DOM IDs; the source-to-instance object map preserves existing IDs across updates, including event and external object references. New source children receive fresh local IDs. Instance position, containing parent and layer order remain local. The optional `InteractiveComponent.instance` field records the definition ID, object map, initial-state override, base/state patches, layout overrides and internal transform overrides.

```ts
await commands([
  { type: 'component.override', slideId, id: instanceId, target: titleId,
    patch: { text: '本页独立问题', style: { color: '#8c351f' } } },
  { type: 'component.override', slideId, id: instanceId, target: answerId,
    state: 'answer', patch: { text: '本页独立解释' } },
]);
```

Base overrides edit authored leaf text, style, visibility or an adopted chart default. State overrides merge into a named state's patch. Omitted properties inherit the shared definition. Pass `patch: null` to clear the selected base/state patch. Ordinary `element.patch` text/style commands on instance members also record base overrides. Internal `element.transform` commands and `container.layout` commands retain their instance overrides through subsequent shared updates. `component.state` stores a local initial choice. Shared structural/behavior changes are made at the source; detach an instance before independent rich-text/attribute restructuring or changing the shared state/event structure.

`component.unlink` removes the link while preserving the currently materialized author content, behavior and constraints. A complete clipboard copy/cut preserves the link and remaps its local object map. `component.library-remove` rejects while instances still reference the definition. Source-page deletion does not remove the definition: existing instances continue to play and new instances can be inserted after export/import. `component.checkout` restores an editable source page when the original source is absent; see the workflow below.

A shared update rejects atomically if it touches a locked instance, removes an overridden target/state, or would leave invalid external references. Definition source objects and all local maps are validated on import. The existing revision/CAS, mutation replay and portable archive contracts cover the entire library update as one edit.

## Container constraints and hierarchical selection

`container.layout` applies a typed CSS layout and persists its contract in optional `Slide.constraints`. The schema supports row/column flex layout, grid columns, wrapping, gap/padding, main/cross-axis alignment, fixed/hug/fill dimensions, explicit fixed dimensions and minimum/maximum bounds. Child constraints target direct children and configure sizing, grow/shrink and self-alignment.

```ts
await commands([{
  type: 'container.layout', slideId, target: containerId,
  layout: containerLayoutSchema.parse({
    mode: 'column', gap: 18, padding: 24,
    width: 'fixed', widthValue: 500, height: 'hug',
    children: { [paragraphId]: { width: 'fill', height: 'hug' } },
  }),
}]);
```

`hug` uses intrinsic content sizing; `fill` fills the parent dimension. A fixed axis with no explicit dimension preserves its existing authored size. CSS rules and bounds remain part of the source HTML, so standalone playback retains reflow. Clipboard transfer remaps constraint targets and reapplies intrinsic sizing after geometry capture. Locked ancestors/descendants reject layout mutation, and removed ordinary children are pruned from constraints.

In edit mode, a normal canvas click selects the enclosing component as a whole. Double-click enters its content, subsequent clicks address internal objects, and Escape returns to the component. Alt-click selects the direct object. The source list and inspector remain direct selection paths, and the component inspector has a parent-selection control. These gestures do not consume component events in playback mode.


Reference-line edits preserve the live canvas when the complete document differs only in guide metadata. The workbench updates the guide overlay after the normal revisioned save, retaining the native scene and keyboard focus. Newly created guides have an immediate local identity so keyboard nudges can queue while the creation response is pending. Content/asset/behavior changes still follow the normal page-render path. Guide undo/redo, cancellation and lost-response recovery keep their existing transaction contracts.

## Teaching sequence authoring

Optional `Slide.steps` adds stable IDs, names, notes and pacing to a page's teaching sequence. Existing documents remain valid without this field. `step.initialize` discovers native, animation, component and media positions; its optional `nativeMax` accepts the native runtime maximum, not the combined presentation maximum. Position zero is the initial state and cannot be removed or moved.

The typed commands `step.insert`, `step.duplicate`, `step.move`, `step.remove` and `step.update` operate through the existing atomic commit/history protocol. Insertions hold the preceding visual and component state; duplications also copy that position's animation and media cues. Reordering follows the original step's native state, component state and cue ownership. Removing a step removes its cues. Animation duplicates receive new IDs. Affected locked objects reject the complete edit. Notes and names can change without rewriting HTML.

Each step has `{ id, name, notes, advanceAfter }`. `advanceAfter: null` inherits the page interval; `0` explicitly waits for manual navigation; positive milliseconds override the page. Exported `stepLabel`, `stepNotes` and `stepInterval` apply the same semantics as the presenter. Notes combine page notes with current-step notes. A newly added cue extends an existing named sequence when necessary.

Media settings retain `startStep` for the first automatic trigger and optional `startSteps` for additional trigger positions. Duplication and reordering remap these together. Linked component instances store optional local `instance.steps`; shared source updates preserve this schedule and reject removal of a state it still uses.

The workbench animation panel exposes sequence initialization, naming, notes, pacing, insertion, duplication, ordering, deletion and state preview. Speaker/audience playback and the exported standalone player use the same sequence; the player includes a step selector, notes and automatic-playback toggle. Timers wait for the current runtime to become ready before advancing.

Selecting a named step changes the editing position; **Preview current step** enters playback and executes the selected step's animations, media and visibility. The user can return to editing with the existing interaction toggle. Source-property forms preserve unfinished input across runtime readiness and repeated selection notifications when the authored object is unchanged; saving or selecting different source content refreshes those fields.


## Reopening a shared component source

`component.checkout { definitionId, newId }` creates a hidden source-editing slide from a stored component definition. It preserves source object/component identities, rebases resources through the existing transferable-object adapter, and retains behavior and constraints. The command rejects a duplicate page ID or an already-present unlinked source, preventing competing source pages. The workbench **编辑共享源** opens the existing source if present, or checks out the stored definition and selects its root.

The recovered page uses ordinary object, layout, state and animation commands. Editing this page does not change the stored definition or instances until `component.publish` runs. Publication then reuses the existing atomic update, stable local IDs, instance override and local teaching-schedule contracts. Checkout, edits and publication participate in normal undo/redo, conditional commits and replay. The hidden page remains editable and portable but does not join the default presentation sequence. Deleting it again leaves the published definition available for a later checkout.

## Editing master objects on the canvas

`layout.checkout { id, newId }` creates a hidden master editing page with optional `Slide.layoutSourceId`. The workbench's **画布编辑母版** opens the existing editing page or creates it. Text, images, shapes, SVG objects, typography and geometry use ordinary page editing commands. `layout.publish { slideId }` publishes the author HTML and theme back to the linked master; all linked pages render that revision, while detached pages keep their independent copy. The original layer setting is preserved.

Checkout rebases HTML/inline-style/linked-stylesheet resources and expands imported layout CSS using the server's stylesheet resolver. Publishing retains placeholder attributes such as `data-notale-field="slide-number"`; it never captures substituted runtime DOM. Draft edits do not affect consumers before publication. The optional source field is absent in legacy documents. A master has one editing page, which cannot inherit another layout; copying it creates an independent page. The workbench's apply-all operation excludes master editing pages. Removing a master requires first removing its editing page and detaching consumers.

Master authoring retains the existing static HTML/SVG/media contract. Publication rejects scripts, Canvas/iframe and authored animation/component/scene/binding metadata; interactive reusable content is edited with the component library. All operations use the same revision, conditional commit, replay and history contracts. Hidden editor pages stay in engineering archives for later editing but are omitted from default standalone presentation navigation.

## Page-specific master text

A master can mark a text-only object with `data-notale-placeholder="title"` and an optional `data-notale-label="本页标题"`. `layoutPlaceholders(html)` exports validated IDs, labels and defaults for a host inspector. Keys are unique within a master. A placeholder cannot also be a dynamic field or contain child elements. The master source inspector can mark a selected text object through **将选中文字设为逐页内容**; publish the source to expose it on consumer pages.

`layout.values { slideId, id: layoutId, values: { title: "本页标题", body: null } }` merges changed text values. Strings are literal text (including empty strings), and `null` restores the master's default. Optional `Slide.layoutValues` groups values by master ID, so switching masters does not overwrite the other master's content. Existing documents do not acquire this property until needed. The workbench saves only changed fields, avoiding accidental overrides of untouched defaults.

Rendering applies page values before the master is scoped and inserted. Shared typography/geometry changes preserve page values. Removing a placeholder with saved values rejects the entire shared update; reset those values before removing it. Copying a page retains its values. Detachment materializes the page's actual text and removes its association with that master's values. Unused cached values must be reset before deleting their master. Source dynamic fields, including automatic page numbering, remain separate.

The page inspector provides text fields, save and restore-default controls. Normal conditional commits, pending-response recovery, undo/redo and project export/import apply to these edits. This contract covers plain text slots; rich-content and image slots remain further authoring work.

## Page-specific master images

An ordinary master `<img>` can carry `data-notale-image-placeholder="photo"` and an optional label. `layoutImageSlots(html)` exposes its key, label and default source. The source inspector recognizes a selected image when marking it as page-specific content. Responsive `<picture>` sources must be authored as an ordinary image slot first; replacing a slot clears its own `srcset`/`sizes` to use the selected source reliably.

`layout.image { slideId, id: layoutId, key, image: { path, alt? } | null }` replaces or resets one slot. `path` is a document asset path, not a page-relative URL; it must identify a retained `image/*` asset. Optional `Slide.layoutImages` stores values by master and slot. The command preserves inherited dimensions, transforms, fit and positioning. The workbench uploads an image and commits `asset.put` plus `layout.image` together; an upload completing after page/document navigation does not mutate the new page.

Rendering rebases the chosen path to the destination page. Page duplication retains its selection, master style changes preserve it, and reset restores the original master source. Detach writes the selected image into independent page HTML and releases its slot association. Removing a used image asset or occupied slot rejects atomically. Assets travel through the normal revision retention, export and import mechanisms; no external image URL dependency is introduced by upload.

## Independent native Canvas regions

The reviewed page-07 correlation simulation now supports whole-region object copy/cut. `inspectCanvasSources(slide)` exposes each supported root with a typed `CanvasInstance`: adapter `correlation-v1`, inherited `lang`, exact original inline source, and a map from its required member names to author object IDs. The 16 members comprise two canvases, three range controls, three preset buttons, resampling, labels and metrics. `Slide.canvasInstances` records independent copies by root ID. The source fingerprint is `7d303cb0e07466311e4d90f30070c5e1a032db847928ee268ced300867beb647`.

`SourceScene.root` identifies the selectable complete region. The workbench scene inspector provides **选择完整互动区域**, after which **复制对象** uses the complete clipboard path. Clipboard `elements.transfer` accepts optional `canvasSceneStates: Record<rootId, SceneValues>`; the bridge captures the live private scalar state and relevant CSS tokens alongside normal geometry/styles. Copies map every member ID, retain the reviewed drawing source and inherit author defaults/bindings plus captured live values. Conflicting copied control bindings are omitted when the captured scene owns those values. Other script-owned Canvas/iframe selections still require their own adapter; copying only one canvas or an incomplete supported region rejects `CANVAS_BOUNDARY`.

An independent scene uses its root ID as the ordinary scene ID. Existing `scene.set`, `scene.remove`, inspection/capture and parameter controls apply, including range/step checks and locks across the whole region. `scene.remove` resets authored defaults without removing the instance. The source scene retains its original fingerprint-based ID. Unsaved source interaction is transient across a normal save-induced preview reload; use `scene.set` to preserve it. Copy capture preserves that interaction for the copy without silently changing the source's author defaults.

Each rendered copy gets a fresh lexical state, scoped DOM queries, private `document.currentSimEnsRate`, managed event listeners, and a local Canvas/Deck facade. The root inherits its stored source language before drawing, preserving CJK Canvas font fallback even when exported into a language-neutral empty document. Drawing uses original algorithms; resize observation redraws the canvases and replaces prior drawing callbacks instead of accumulating source `Deck.autofit` listeners. Removing a root disposes its listeners/observers; page hide/show retains its controller state. Preset active appearance follows the independent selected value. The original script queries only its original workspace, so sibling copies do not join its button list. Removing the complete original region suppresses its initialization in the render projection while retaining author source for undo. Partial required-member removal rejects atomically.

This adapter does not turn Canvas pixels into vector objects, support arbitrary script variants or add the region to the general reusable-component library. Independent source controls, parameter defaults, ordinary root geometry and surrounding text/style editing are the supported manual workflow. Portability uses the same embedded factory and bridge, with no dependency on the deleted source page or a destination Deck script.

Rendered slides declare `<meta charset="utf-8">` as the first head child and remove conflicting encoding declarations from the projection. This is necessary for new fragment-based pages whose author HTML contains no charset: the same UTF-8 JavaScript/string literals must work on a static server without a response charset. The original author HTML remains unchanged. The real blank-target/export/import workflow verifies document encoding and exact Canvas pixels.

## Independent frontend contract

Use `@notale/editor/browser` from browser bundles for public document/command types and browser-safe schemas/helpers. The Node package root remains the backend integration surface. The browser entry can be installed from an `npm pack` artifact and bundled with `platform: browser`; the formal frontend in `../notale-editor-frontend/` demonstrates this without importing backend source or sharing dependencies. Its local server proxies API and show routes to this backend and serves its own HTML, CSS and JavaScript. Rendered lecture content remains on the separately configured content origin. Main-system deployments should provide the same path routing and host identity rather than introducing an independent account system.

## Durable editor synchronization

The manual editor uses `POST /api/documents/:id/sync` with the existing `{baseVersion, mutationId, commands}` envelope. Optional `geometry: true` treats a gesture transform as an explicit atomic geometry write. Empty commands require either `inverseVersion` (undo that committed transaction) or `restoreVersion` (explicit historical restore); these modes are mutually exclusive. Existing `/commits` and `/restore` retain strict version checks.

The sync transaction locks the current head, deduplicates immutable mutation IDs and payloads, applies intent against its base, merges changed object properties onto the head, and records the new revision atomically. Different properties survive independently; explicit same-property writes follow server arrival order. Deleted targets and unsafe structural dependencies return `SYNC_RECOVERY_REQUIRED`; clients retain the intent rather than silently dropping it. A repeated acknowledged mutation returns its original revision, even when the current head has advanced.

`GET /api/sync-context` supplies the authorized actor and scope for local draft isolation. `GET /api/documents/:id/sync-head` supplies `{version}` for lightweight catch-up. `POST /api/documents/:id/sync-recovery` accepts the ordinary commit envelope and creates a separate recovery document from the source revision; it requires source edit and document create permission. It never rewrites the source document.

The frontend serializes all editing through a durable IndexedDB outbox, preserves exact retry payloads, coordinates browser tabs with Web Locks and broadcasts acknowledgements. Local persistence failure is distinct from network delay. The latest confirmed document checkpoint is retained with acknowledgements; this is not a full offline application/asset cache. Structural recovery and synchronization tests live in `tests/sync.test.ts` and the sibling frontend's `tests/sync-session.spec.ts`.

## Sidebar animation authoring additions

`AnimationSpec` retains the existing step/trigger contract and adds optional `repeat` (1–20), `autoReverse`, `effectDirection` (`left|right|up|down`) and `path` (2–50 `{x,y}` offsets for `motion`). Omitted options preserve old playback. Cue length includes all repeated and reverse cycles, so `after-previous` follows the effective end; `with-previous` follows its start. Paths interpolate through authored offsets. New effects are `disappear`, `zoom-out`, `wipe-in`, `wipe-out`, `split-in`, `split-out`, `float-in` and `bounce-in`.

The isolated edit bridge accepts channel-validated `animations-update` and schema-validated `animation-preview`; `animation-preview-stop` cancels the temporary preview. Live updates replace only animation metadata and recalculate cues. They do not recreate the document or reset native Canvas state. The same frame generator and timing model remain in portable playback; no second frontend-only effect implementation is introduced.

#### 画布富文本会话

编辑预览通过已有签名 content 路由加载 `__notale_runtime__/text-editor.js`；导出 HTML 不加载此模块。`EDITOR_RUNTIME_DIR` 可指定独立候选运行时目录，构建与服务需使用同一目录。

Bridge 事件 `text-session-start`、`text-draft`、`text-context-state`、`text-session-end` 带 slideId/runtimeId/sessionId；草稿额外携带 target/sequence/html，可附根节点 style。宿主持久化后沿既有 `/sync` 提交 `element.patch.richText`，确认通过 `text-confirm` 返回。文字选区 bookmark 留在 iframe 内，宿主只发送带 selectionToken 的格式意图。不要把未封批草稿当作已提交请求重写；封批后的 mutationId 与请求保持不可变。

Current native file/API details: [NOTALE-V1.md](NOTALE-V1.md). Binary imports replace the previous base64 JSON import payload.
