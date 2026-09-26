# Observer code courses

The editor imports current `observer-v1` Notale publications. Double-click a code object (or choose its context-menu edit action) to edit `starter.py`, `observe.py`, `tests.py`, and `view/render.js` in the React course dialog. Other runtime and lesson configuration files are fixed publication resources.

Drafts are retained locally in IndexedDB, scoped by actor, document, slide and object. Trial runs do not change the document. Explicit Save prepares resources and commits one `codeLesson.update` through the normal durable synchronization journal. A lost response retries the original operation; the dialog clears its draft only after confirmation. Concurrent changes to the same course are rejected rather than overwritten.

## Contract

- `document.codeLessons` maps the published iframe entry path to a `CodeLessonDescriptor`.
- The descriptor binds the four editable paths, lesson root, fixed runtime root and content revision. Revisions cover authored sources and fixed runtime asset hashes.
- `GET /api/documents/:id/slides/:slideId/code/:target` returns the descriptor, sources and document version.
- `POST /api/documents/:id/slides/:slideId/code/:target/prepare` accepts `expectedEntry`, `expectedRevision`, `sources` and an optional derived `preview`; it returns the command and prepared descriptor. Preparation alone does not mutate the document.
- `codeLesson.update` validates the expected entry/revision, preserves iframe query parameters, and atomically binds the prepared resources. Normal sync authorization and conflict rules apply.

Each saved revision gets an immutable lesson directory. Duplicated pages can initially reference the same resources; changing one leaves the other intact. Previous assets remain available for undo and exported histories. Asset garbage collection is not performed by course saving.

## Runtime

Editing and poster views load the native visualization and a matching cached initial step without starting Python or Monaco. Trial/interaction initializes the runtime on demand. Preview validity includes both source and fixed-runtime revision. Authoring messages are bound to the preview channel, parent window and origin.

The presentation controller runs the course; audience/following frames apply its session state without starting Python workers. Runtime role changes are observed after frame initialization. Learner sessions are separate from author sources and identified by document, slide and object.

Current harness publications include the lesson descriptor marker, four author files, fixed runtime, runtime revision, and derived `preview.json`. Notale import/export retains these assets and font references. No migration path for older code-course formats is provided.

## Verification for this change

Targeted domain coverage checks revision validation, atomic replacement, stale updates, duplication, merge and undo safety. Real insertion-sort and neural-network publications exercise lightweight rendering and execution. Browser checks cover explicit saving after a lost response, draft recovery, undo/redo, and Notale roundtrip with fonts. Full repository suites are not required for this feature's local acceptance.
