# Lorien reference adoption

This update studies the local `lorien-od/apps/web` application as a reference for a complete creative workflow. Notale implements the relevant interactions in its own Next.js application and existing session/run protocols. The reference is not a runtime or build dependency.

## What was adopted

| Strength in the reference | Notale implementation | Boundary |
| --- | --- | --- |
| Clear entry navigation and recent projects (`EntryNavRail`, `RecentProjectsStrip`) | Shared `sidebar`, recent server sessions, library and archive screens, keyboard quick search | Lecture ownership follows the existing standalone server; no invented team or account system. |
| A composer that survives navigation and failures (`ChatComposer`, composer draft helpers) | Shared `composer`, session-scoped `composer-drafts`, a single pending first turn, attachment preview URLs and upload retry | Text and already uploaded file IDs survive within the browser tab. Unuploaded file bytes require picking the file again after reload. |
| Useful project actions | `library/session-actions` and server session metadata support rename, archive and restore | Archiving retains the transcript and artifacts; a running task must finish before archive. |
| Reading intent during streaming | `use-reading-follow` and `reading-intent` keep an upward-scrolling reader in place and expose an explicit return to latest | Native scrolling remains active. Lorien's diagnostic wheel takeover and global scroll interception were not imported. |
| Readable chat and visible task outcomes | Safe Markdown in `talk`, copy controls, clarification actions, real progress details, version cards, reconnection and stop states | The session transcript and live stream remain authoritative; uncertain sends are reconciled before retry. |
| A flexible project workspace | `session-view`, `lecture-pane` and shared generation views provide adjustable panels, page navigation, chosen-version preservation, focus/fullscreen and narrow-screen tabs | No terminal, generic file explorer or plugin marketplace is added to a lecture workflow. |
| Deferred preview work (`thumbnail-load-gate`, cover pipeline) | Page thumbnails load near the viewport; preview concurrency is bounded and the current lecture stays visible while its replacement loads | Existing Notale lecture runtime and generated assets remain the source of truth. |
| Consistent localization and dialog behavior | Shared `locale` context and native `ui/dialog` provide Chinese/English chrome, accessible names and focus handling | UI language is independent of generated content. |
| A recognizable creation surface | Notale's approved logo and purple-blue knowledge scene frame the unified input and teaching examples | Original lecture imagery and brand geometry; no forest, pixel wordmark or copied reference identity. |

## Implementation choices

The new shell, library, composer, session-state and reading helpers are independent Notale code. The reference's large `ChatComposer` and `ProjectView` components, account/billing/team modules, private contracts, assets and provider registry are not copied into this repository. No relative import reaches the neighboring Lorien checkout.

Shared controls and CSS tokens provide consistency across entry, library and workbench. Server session discovery uses existing JSONL records plus separately persisted metadata; reading history creates no files. The existing `/v1` generation and event boundaries remain in place.

See [the design rules](design.md) for presentation behavior and [the Viewer guide](README.md) for routes, setup and session API details. This document describes the adopted behavior and code boundaries; verification results belong to the actual test and build output for each delivery.
