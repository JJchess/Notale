# Next.js migration

The frontend now uses Next.js App Router, React and TypeScript. The backend remains a sibling service with the same HTTP contracts.

- `app/layout.tsx` owns the persistent editor host; `app/page.tsx` supplies the editor route.
- `src/components/editor-chrome.tsx` contains the actual JSX controls and panel hosts, preserving the former DOM identifiers, defaults and CSS classes. No legacy HTML page or standalone editor bundle is embedded.
- `src/components/editor.tsx` starts `mountWorkbench()` after React commits the DOM. The controller mounts once per browser document, including React strict effect replay. Internal navigation preserves the root layout; document selection uses the existing document loader.
- Existing canvas, geometry, save, clipboard and inspector controllers remain imperative. They own the contents of their panel hosts; high-frequency gestures are not mirrored into React state. The shell must not reconcile controller-owned children while a session is active.
- Next.js compiles and splits the browser application. The former esbuild entry and `index.html` have been removed.
- The custom host retains API/presentation forwarding and blocks editor routes on the isolated content hostname. It delegates the editor and framework assets to Next.js.
- Build with `npm run build`; start with `npm start`. For a candidate, set the same `NEXT_DIST_DIR` for build and start. `npm run dev` uses webpack and the same proxy host.

## Migration evidence

At 1600×1000, the activity bar, header, workspace, canvas viewport and bottom controls have identical measured bounds on the old and Next.js versions. A focused browser test covers dragging, geometry undo/redo, Ctrl+D, persisted text edits, reopening and insertion/template panels.

## Follow-up: save/undo consistency repaired

The pre-existing `DANGLING_OBJECT` error after dragging, duplicating and undoing has been repaired in the backend merge logic. Empty removed transform records no longer retain an object identity. `tests/next-migration.spec.ts` now covers this sequence, redo and history after reload.

Concurrent reference conflicts preserve the head and retain a recoverable operation. History recovery supports inverse and explicit restore versions in an isolated copy. `tests/save-consistency.spec.ts` verifies a lost committed response, a later gesture, reload and idempotent retry without losing or duplicating either edit.
