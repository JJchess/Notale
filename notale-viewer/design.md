# Design — Notale Viewer

The Viewer is a lecture workspace: start with a topic, work through a conversation, inspect a lecture, and hand the chosen version to the editor. Its identity belongs to Notale. The adopted interaction patterns and their implementation boundaries are recorded in [Reference adoption](REFERENCE-ADOPTION.md).

## Brand and foundations

- Use the approved Notale mark and lockup in `public/brand/`, with the same mark for the favicon. Do not redraw the logo as a pixel wordmark or substitute a reference product's identity.
- Default to light paper, white working surfaces, quiet rules and dark ink. Purple-blue is the action and focus accent; green communicates completion. Semantic values live in `app/tokens.css`; component styles use the shared tokens.
- Use the editor's Inter / PingFang SC / system sans-serif stack. Hierarchy comes from weight, size and spacing; tabular figures help with page counts and timings.
- Use the named four-point spacing scale. Icon controls have tooltips, accessible names, visible selected states and keyboard focus. Touch layouts give controls enough room to use reliably.
- Keep redundant borders, duplicate icon labels and empty-state instructions out of the interface. Real errors, conflict messages, search misses and necessary form labels remain explicit.

## Application surfaces

| Surface | Design and behavior |
| --- | --- |
| Shared shell | Approved logo; collapsible desktop navigation; mobile drawer; create, library, archive, quick search and language controls. Recent lectures come from the server. |
| Home `/` | A distinct Notale knowledge scene built from lecture pages, curves and structure diagrams. The composer is the clear primary action. A few teaching examples seed a draft and wait for the user to send. Recent lectures lead back into work. |
| Library `/library` and archive `/archive` | Searchable server history with rename, archive and restore actions. Preserve a natural empty list; only an active search with no matches needs a no-results message. |
| Session `/s/[sessionId]` | Lecture preview and conversation form a resizable workbench. Focus mode and fullscreen give the lecture more space. A selected old version stays selected when a new one finishes. |
| Run `/runs/[runId]` | Direct access to a generated run, using the same brand, controls and event-backed progress language. |

The home scene may use small pointer-driven depth on desktop. On touch devices, in a hidden tab and under `prefers-reduced-motion`, it stays static. The workspace keeps movement restrained so pages and reading remain stable. No forest, borrowed mascot, reference branding or ornamental pixel typography is part of the Notale direction.

## Input, reading and recovery

- Home and sessions share one composer: text, drag/drop, paste, file picking, upload state, retry, removal and attachment preview. Successful uploads retain server IDs; unavailable local `File` objects are never pretended to survive a reload.
- Drafts belong to a session; the home draft has its own key. Preserve text and uploaded references on failure and during navigation. Clear them only after the server has accepted the message. When the outcome is uncertain, recover the transcript before offering another submission.
- Chinese IME composition must finish without accidentally sending or triggering search shortcuts. Shift+Enter inserts a newline; Enter sends when composition is complete.
- Render assistant Markdown safely, with copy actions, real clarification options, result cards and collapsible work details. Keep local connection failures separate from task failures and cancellation.
- Following new output is a user choice. Scrolling upward releases follow; reaching the bottom or choosing “Latest” resumes it. Growing content does not steal the reader's position or keyboard focus.
- Progress labels and page states come from real events. Loading, reconnecting, stopping, failed and cancelled states must be distinguishable; percentages and successful results must not be invented.

## Navigation, preview and accessibility

- Cmd/Ctrl+K opens a searchable lecture switcher with arrow-key selection and Enter to open. The dialog focuses its input after `showModal()` and restores focus on close.
- Page thumbnails show the page itself. Titles live in tooltips and accessible names, without repeated captions around the canvas. Load thumbnails near the viewport and bound active preview frames; avoid running every lecture page at once.
- Keep the current lecture visible during version transitions. Changing a page, resizing the split or switching a narrow-screen tab preserves the work already on screen. Download and editor entry always refer to the chosen version.
- On narrow screens, lecture and conversation become tabs. Preserve mounted content and state when switching. The mobile navigation drawer can close through Escape, its close control or its backdrop.
- UI language is Simplified Chinese or English, saved as a browser preference and reflected in the document language. It does not rewrite prompts, translate user content or change generation language.
- Set `overscroll-behavior: none` on the root and every independent scroller, including navigation, transcript, thumbnail strip, menus, dialogs and textareas. Preserve native wheel, touch and keyboard scrolling; do not suppress events globally.

## Verification boundary

Use isolated data for session mutations. Check keyboard operation, IME input, failed uploads/sends, reading during streaming, reconnect/stop, version selection and narrow-screen switching. Browser checks can confirm dimensions and scroll positions; they do not establish native trackpad or phone elastic-scroll behavior. Report those device checks only when actually performed.
