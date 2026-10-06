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
| Shared shell | A 236px navigation rail on the page background, with the approved logo, search and collapse controls together at the top. Quiet navigation rows lead to create, library and archive. A collapsible recent list provides lecture actions and cover previews; settings collect language and shortcut controls. |
| Home `/` | The approved 180px Notale lockup and one composer, separated by 32px and centered in the available main area. Input width is at most 720px, with 20px side padding on mobile. Recent lectures live in navigation and the library. Short screens scroll naturally. |
| Library `/library` and archive `/archive` | Searchable server history with rename, archive and restore actions. Preserve a natural empty list; only an active search with no matches needs a no-results message. |
| Session `/s/[sessionId]` | Lecture preview and conversation form a resizable workbench. Focus mode and fullscreen give the lecture more space. A selected old version stays selected when a new one finishes. |
| Run `/runs/[runId]` | Direct access to a generated run, using the same brand, controls and event-backed progress language. |

Home presents the creation input directly. Keep slogans, decorative lecture sheets, duplicate starting prompts and model infrastructure details out of this surface. The workspace keeps movement restrained so pages and reading remain stable; honor `prefers-reduced-motion` throughout.

The home logo also summons Valar, the original 66×75 pixel wizard, on click, Enter or Space. The short, single-play Easter egg appears near the logo, lights the star staff, hops onto the input edge and disappears behind it. It adds no persistent hint or decoration. Reduced motion shows a brief static pose; navigation, resizing or hiding the tab cancels and removes the animation. The character never intercepts input or file drops.

### Navigation details

- Use the page background without a separate panel border or shadow. Keep 12px horizontal rail padding, roughly 38px navigation rows, 12px corner radii and 2px row gaps. Navigation text is 13px/600; recent titles use 13px/500. Hover and selection use neutral fills; focus remains visible.
- The top row uses 34px icon buttons with 4px gaps. Desktop collapse closes the rail completely, leaving a top-left reopen control with dedicated room in page headers. Keep transitions around 200ms.
- Recent lectures scroll independently, with roughly 11 rows visible at full height and a smaller area on short screens. Use existing pagination for additional records. Show row actions on hover and keyboard focus, and always on touch devices. Rename and archive retain existing server constraints.
- Desktop hover previews are 216px wide with a 24px rail gap. Load the current cover on demand and close its preview when opening a row menu. Lectures without covers show their title.
- Keep one compact settings control at the bottom. Language and keyboard help belong in its menu; account and team controls require real corresponding features.

## Input, reading and recovery

- Home and sessions share one composer: text, drag/drop, paste, file picking, upload state, retry, removal and attachment preview. Successful uploads retain server IDs; unavailable local `File` objects are never pretended to survive a reload.
- Attachment limits appear only when a file is rejected, with its name and the specific format, size or count reason. Do not show the generic supported-format and quota paragraph. Mixed selections still add the accepted files; actual upload and send failures remain visible.
- Drafts belong to a session; the home draft has its own key. Preserve text and uploaded references on failure and during navigation. Clear them only after the server has accepted the message. When the outcome is uncertain, recover the transcript before offering another submission.
- Chinese IME composition must finish without accidentally sending or triggering search shortcuts. Shift+Enter inserts a newline; Enter sends when composition is complete.
- Render assistant Markdown safely, with copy actions, real clarification options, result cards and collapsible work details. Keep local connection failures separate from task failures and cancellation.
- Following new output is a user choice. Scrolling upward releases follow; reaching the bottom or choosing “Latest” resumes it. Growing content does not steal the reader's position or keyboard focus.
- Progress labels and page states come from real events. Loading, reconnecting, stopping, failed and cancelled states must be distinguishable; percentages and successful results must not be invented.

## Navigation, preview and accessibility

- Cmd/Ctrl+K opens a searchable lecture switcher with arrow-key selection and Enter to open. The dialog focuses its input after `showModal()` and restores focus on close.
- Cmd/Ctrl+B toggles desktop navigation outside text-entry controls. Persist navigation and recent-group expansion. Hidden navigation is inert; restore focus when collapsing or closing the drawer.
- Page thumbnails show the page itself. Titles live in tooltips and accessible names, without repeated captions around the canvas. Load thumbnails near the viewport and bound active preview frames; avoid running every lecture page at once.
- Keep the current lecture visible during version transitions. Changing a page, resizing the split or switching a narrow-screen tab preserves the work already on screen. Download and editor entry always refer to the chosen version.
- On narrow screens, lecture and conversation become tabs. Preserve mounted content and state when switching. The mobile navigation drawer can close through Escape, its close control or its backdrop.
- UI language is Simplified Chinese or English, saved as a browser preference and reflected in the document language. It does not rewrite prompts, translate user content or change generation language.
- Set `overscroll-behavior: none` on the root and every independent scroller, including navigation, transcript, thumbnail strip, menus, dialogs and textareas. Preserve native wheel, touch and keyboard scrolling; do not suppress events globally.

## Verification boundary

Use isolated data for session mutations. Check keyboard operation, IME input, failed uploads/sends, reading during streaming, reconnect/stop, version selection and narrow-screen switching. Browser checks can confirm dimensions and scroll positions; they do not establish native trackpad or phone elastic-scroll behavior. Report those device checks only when actually performed.
