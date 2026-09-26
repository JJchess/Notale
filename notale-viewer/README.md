# Notale Viewer

Next.js client for Notale sessions: one box to ask for a lecture (with any attachments), a conversation to change it, and the lecture itself.

## Sessions (2026-09-25)

- **Home** (`/`): a single input with attachments (PDF, DOCX, PPTX, images; dropped, pasted or picked). There are no separate fields for
  visual direction, template or course settings: the session layer (notale-ts `src/session/`) reads them from the message and decides what each
  file is — material, a PPTX template, or a style reference — and asks back when it cannot tell.
- **Session** (`/s/[sessionId]`): the lecture on the left, the conversation on the right (messages, the reading the system went with,
  questions with option buttons, replies, one card per version), with a draggable divider between them. Every generation or change is a version (v1, v2 …, a change says what it was based
  on); the newest finished one is shown, and the version bar plus the `.notale` download sit bottom-left. While the first generation runs, the
  left side shows the progress view below; while a change runs, the fix agent's steps show in the conversation. A reload rebuilds everything
  from the session record and picks a running generation up again from its events.
- Sessions (`/notale-session/v1/…`) and runs (`/notale-api/…`: previews, events, downloads) are both proxied to the notale-ts server
  (`NOTALE_API_URL`, a build-time setting), started with `serve --sessions PATH`.
- `/runs/[runId]` still opens a single run directly (old links keep working).

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

Generation uses a TSX progress view based on viewer/progress-view.js: planned page squares, checking states and retries shown with the same active appearance as generation, completion counts, elapsed/estimated time, a progress sparkline, and the latest 60 activity entries. Generation is linear: no header, query, preview tabs, or page-preview actions while running. Completion opens the full-viewport original Reveal lecture shell with a corner download menu. Failed/cancelled runs retain their progress and error details. The menu downloads `.notale`, a versioned ZIP container holding the static lecture and existing editor document structure. The backend packs it after preview becomes ready and caches it; downloads wait for an active job. Both `/download` and `?format=notale` export v1; old ZIP export is removed. The editor remains unchanged and will be upgraded separately. Stable editor element IDs are added to the manifest's HTML copy, leaving generated files unchanged. Local `.notale` opening in Viewer is not part of this release.

For the local preview deployment, build with `NOTALE_API_URL=http://127.0.0.1:45400` and `NOTALE_LEGACY_PREVIEW_URL=http://127.0.0.1:45402`, then start on port 4177. The latter optional setting forwards existing `/experiments/...` lecture links to the preserved static preview service. Both origins are build-time settings. Keep the API running independently when restarting the Viewer.

The existing v1 API adds `plan.ready` (ordered pages), `page.progress` (page ID/state/message), and optional snapshot `pages`. `workflow.progress` adds deterministic Planner/Style Director stage observations; these notifications are queued without awaiting the Viewer, adding model calls, or changing parallel execution. Confirmed page squares appear as soon as Planner finishes, independently of Director completion. `page.ready` remains the delivery gate. Notifications observe existing tool results without changing generation, checks, or retries. Historical runs recover known page states from existing manifests/events/results; unavailable historical detail is not invented.

A PPTX attachment can be selected below the visual direction field, replaced or removed before submission. Upload errors remain in the form; successful submission saves a template ID with the task. Template conversion and dedicated Style Director progress appear in the existing detail feed. The production proxy accepts the backend's 50 MiB file limit plus multipart overhead; generation remains linear with no preview tab until completion.
