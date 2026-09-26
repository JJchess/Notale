# Continuous code-course editing

The React course dialog uses an independent `CourseSession` for the draft, confirmed baseline and serialized explicit saves. Saving captures the current sources; later typing stays dirty. A second explicit save replaces the pending request rather than creating a FIFO queue. Closing flushes the local draft while an already submitted save finishes in its owning session. Transport retries continue to use the existing journal operation.

Drafts are actor-scoped IndexedDB records with a baseline and sequence. Writes debounce for 300 ms, have a 2 second maximum delay while typing, and use a single latest-pending writer. Normal dialog close awaits the final write. Page hiding initiates a best-effort flush; abrupt browser/process termination can lose the last uncommitted interval. Storage failures retain the in-memory draft and do not prevent an explicit server save.

The last three courses retain Monaco models, undo history and view state for the current browser session. Worker/preview lifetimes end on close; undo history is not serialized across a browser reload. Reopening still fetches the authoritative lesson version. Divergent drafts get per-file conflict resolution: separate changes merge, shared files require choosing or editing the result, and confirmation only rebases the draft. Saving remains explicit.

Python typing does not touch the visible preview or cancel execution. Run executes a snapshot, while Stop cancels initialization, execution and queued requests. Renderer changes debounce for 300 ms and use the last execution state; a candidate sandbox must render successfully before it replaces the previous view. The runtime validates message origin, channel, session/request correlation, and independently schedules the latest run and render requests. Old results cannot confirm newer drafts.

The dialog opens before asynchronous preparation completes. Editor readiness and preview readiness are independent; a bounded readiness handshake avoids depending on the outer iframe's full load event. Python starts only when execution is requested. Saved preview caches must match the source digest and immutable runtime stamp.

Use current harness publications for the upgraded authoring message protocol. Reimport a regenerated Notale artifact to update code-runtime resources in an existing document; course editing does not silently rewrite an imported runtime.
