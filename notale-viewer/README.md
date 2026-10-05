# Notale Viewer

A Next.js workspace for creating, organizing and revising interactive lectures. Start with a topic and attachments, follow real generation progress, refine the result through conversation, and open a selected version in the visual editor.

## Workspace

- **Home** (`/`): a unified composer, a few teaching examples that fill the draft, and recent lectures. Drop, paste or select PDF, DOCX, PPTX, PNG, JPG, WebP and video attachments. The session layer decides whether a file is material, a template or a reference, and asks for clarification when necessary. Video is supported as a revision reference, not generation material.
- **Library and archive** (`/library`, `/archive`): server-side history, title search, rename, archive and restore. **Cmd/Ctrl+K** opens the lecture switcher. Archiving preserves the conversation and generated files; active tasks must finish first.
- **Session** (`/s/[sessionId]`): adjustable lecture/conversation panels, page navigation, version selection, focus/fullscreen preview, download and editor entry. New results do not replace an older version you explicitly selected. On narrow screens, lecture and conversation use tabs.
- **Conversation**: safe Markdown, copy actions, clarification choices and collapsible task details. Scrolling upward keeps your reading position; return to the bottom or choose “Latest” to follow new output. Reopening a session recovers its transcript and follows a still-running turn.
- **Input recovery**: text and already uploaded attachment references are kept per session in the browser tab. Failed sends retain the draft; uncertain network outcomes are checked against server history before another submission. Files whose upload never completed must be selected again after a reload.
- **Language**: Simplified Chinese and English interface text. This setting does not change the language requested for the lecture.
- **Direct run** (`/runs/[runId]`): open a single run, inspect its real progress and view or download its completed lecture.

The visual system is documented in [design.md](design.md). [Reference adoption](REFERENCE-ADOPTION.md) maps the Lorien workflow ideas to Notale's independent components.

## Run locally

Start the backend with sessions enabled:

```bash
cd ../notale-ts
npm run dev -- serve --sessions .local/sessions
```

Then start the Viewer:

```bash
cd ../notale-viewer
npm ci
npm run dev
```

Open `http://localhost:3000`. Set `NOTALE_API_URL` if the backend is not at `http://127.0.0.1:4321`. In production, set it before `npm run build`: Next.js stores the proxy destination in the build. Changing only the environment for `npm run start` does not change that destination.

Sessions (`/notale-session/v1/…`) and runs (`/notale-api/…`) are proxied to that backend. The optional build-time `NOTALE_LEGACY_PREVIEW_URL` forwards preserved `/experiments/...` links to an existing static preview service. Backend and Viewer processes run independently.

The Viewer installs and builds independently. Its local protocol declarations describe the HTTP boundary; there is no `file:` dependency on `notale-ts` or the Lorien checkout.

## Session management API

The generator exposes these routes under the existing `/v1` API when `--sessions` is enabled:

| Route | Behavior |
| --- | --- |
| `POST /v1/sessions` | Create a conversation and return `{id}`. |
| `GET /v1/sessions?q=&archived=false&limit=50&cursor=` | Return `{items, nextCursor?}` ordered by latest update. Search matches titles; `archived=true` selects archived sessions. Limits are 1–100; pass `nextCursor` unchanged for the next page. |
| `PATCH /v1/sessions/:id` | Accept `{title?, archived?}` and return the updated summary. Titles must be nonempty and at most 300 characters. Running tasks can be renamed but return `409 SESSION_BUSY` for archive. |
| `GET /v1/sessions/:id` | Return the summary, entries, runs and attachment metadata for the transcript. |
| `POST /v1/sessions/:id/files` | Upload bytes as `application/octet-stream` with URI-encoded `x-file-name`; return the attachment reference. Maximum 100 MB per file, 10 attachments per message. |
| `GET /v1/sessions/:id/files/:fileId` | Read an attachment belonging to this session. Images, video and PDF are inline; other supported documents download. Video supports byte ranges. |
| `POST /v1/sessions/:id/turns` | Send `{text, fileIds}` and receive NDJSON events. An archived session returns `409 SESSION_ARCHIVED` until restored. |
| `GET /v1/sessions/:id/turn` | Replay and follow the live turn; `404` means no turn is running. |
| `POST /v1/sessions/:id/interrupt` | Request cancellation of the active turn. |

A summary contains `id`, `title`, `createdAt`, `updatedAt`, `archived`, `busy`, `versions` and optional `latestCompletedRunId`. `versions` counts recorded runs; the completed-run field identifies the latest successful result. A manual title takes precedence over the understood generation title and the first user message.

Session management writes a separate metadata file atomically and serializes updates with turn admission. Existing append-only JSONL transcripts remain intact. Listing or opening old sessions infers missing metadata without writing to disk. This standalone API does not add a user identity or authorization system.

## Generation and preview

The existing event protocol supplies planned pages, page state, retries, completion and failure details. Progress observes the backend's actual work; it does not make extra model calls. Historical runs recover known page states from existing manifests, events and results without inventing unavailable detail.

Completed pages can be inspected while work proceeds. Thumbnails load near the viewport with bounded concurrent preview work. A chosen lecture remains on screen during version replacement, and page changes use the existing player rather than remounting the whole workspace.

Downloads use `.notale`, a versioned archive containing the lecture and supported editor structure. The backend packs the archive once preview is ready. Local `.notale` import into the Viewer is not part of this release; import is available in the editor.

## Open in the editor

The editor button imports the selected `.notale` version once, then reopens that document so saved manual changes are preserved. Run the editor separately and configure `EDITOR_URL` (server address, default `http://127.0.0.1:4312`) and, when different, `EDITOR_PUBLIC_URL` (browser address). The server route reads these variables and `NOTALE_API_URL` at request time; keep the API origin consistent with the build-time proxy setting. `NOTALE_API_TOKEN`, if set, stays on the server.

The standalone entry uses one Viewer process and a persistent `.local` directory for its run-to-document mapping. A failed lookup does not import a replacement unless the document is confirmed missing. Hosted deployments with user identities must use authenticated resource and editor-entry adapters; see the root integration guidance before exposing the standalone services.

## Development checks

`npm test` checks types and runs the Viewer tests. `npm run build` performs the production build. Session persistence, read-only discovery, concurrent edits and attachment boundaries are covered by the generator's `test/session-management.test.ts`; CI also runs the existing turn and route tests.

UI delivery should check desktop/narrow-screen layout, keyboard and IME input, upload/send recovery, streaming reading position, reconnection, cancellation and chosen-version preservation. Root and independent scrollers use `overscroll-behavior: none`. Browser automation does not prove native phone or trackpad elastic-scroll behavior; record that separately when tested.
