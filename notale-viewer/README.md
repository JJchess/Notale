# Notale Viewer

Next.js client for creating Notale generation runs, following durable SSE progress, and previewing generated static artifacts.

Run the backend first:

```bash
cd ../notale-ts
npm run dev -- serve
```

Then start the viewer:

```bash
cd ../notale-viewer
npm run dev
```

Set `NOTALE_API_URL` when the backend is not at `http://127.0.0.1:4321`. In production, set it when running `npm run build`: Next.js stores this rewrite destination in the build, so setting it only for `npm run start` does not change the backend. Rebuild when changing the production API origin.

The viewer installs and builds on its own. Its small local protocol-v1 declarations describe the HTTP boundary; it has no `file:` dependency on `notale-ts`. The centered home screen creates runs. A run page replays prior events, follows live SSE updates, restores after refresh, shows generation progress, and automatically opens the final static lecture on success.

## Browser delivery

Generation uses a TSX progress view based on viewer/progress-view.js: planned page squares, checking states and retries shown with the same active appearance as generation, completion counts, elapsed/estimated time, a progress sparkline, and the latest 60 activity entries. Generation is linear: no header, query, preview tabs, or page-preview actions while running. Completion opens the full-viewport original Reveal lecture shell with a corner download menu. Failed/cancelled runs retain their progress and error details. The menu downloads `.notale`, a versioned ZIP container holding the static lecture and existing editor document structure. The backend packs it after preview becomes ready and caches it; downloads wait for an active job. The original `/download` ZIP endpoint remains available for the current editor, which is unchanged. Stable editor element IDs are added to the manifest's HTML copy, leaving generated files unchanged. Local `.notale` opening in Viewer is not part of this release.

For the local preview deployment, build with `NOTALE_API_URL=http://127.0.0.1:45400` and `NOTALE_LEGACY_PREVIEW_URL=http://127.0.0.1:45402`, then start on port 4177. The latter optional setting forwards existing `/experiments/...` lecture links to the preserved static preview service. Both origins are build-time settings. Keep the API running independently when restarting the Viewer.

The existing v1 API adds `plan.ready` (ordered pages), `page.progress` (page ID/state/message), and optional snapshot `pages`. `workflow.progress` adds deterministic Planner/Style Director stage observations; these notifications are queued without awaiting the Viewer, adding model calls, or changing parallel execution. Confirmed page squares appear as soon as Planner finishes, independently of Director completion. `page.ready` remains the delivery gate. Notifications observe existing tool results without changing generation, checks, or retries. Historical runs recover known page states from existing manifests/events/results; unavailable historical detail is not invented.
