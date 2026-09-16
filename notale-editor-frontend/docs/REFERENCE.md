# Reference and implementation direction

The user supplied `<workspace>/屏幕录制 2026-09-09 061109.mp4` and requested its overall form as the primary reference. The local video is 28.18 seconds, 2558 × 1346, 30 fps. Representative frames are in `reference/frames/` (4-second sampling, plus additional overview frames). This is implementation reference material, not a UI asset to redistribute inside the product.

Observed structure:

- Opening editing state: a dark, approximately 66-pixel tool rail on the left; white title/save/present header; compact secondary toolbar and rulers; a large native interactive scene occupying most of the remaining screen. Page, zoom and navigation controls sit in small groups near the bottom.
- Around 8–12 seconds: a resource/interaction drawer opens immediately beside the tool rail. It contains searchable categories and resource choices. The canvas keeps priority; the drawer can close again. The reference does not keep a large right inspector permanently open.
- Around 12–20 seconds: switching to preview dims surrounding editor tools and displays the scene within that context. A preview header and edit/preview toggle make the mode visible.
- Around 20–28 seconds: the scene's authored entrance animation plays, and draggable planets show interaction indicators. This demonstrates the desired continuity between authoring and actual interaction. It does not establish a complete specification for the underlying game or every editor feature.

Design tokens follow this reference: tool rail `#191a1f`, panel `#ffffff`, workspace `#eceef2`, text `#292a32`, purple action `#6638dc`, teaching-step accent `#b87418`. UI typography uses Avenir Next / PingFang SC / Microsoft YaHei / system fallback; numeric page and zoom information uses monospace. The signature is the dominant living slide surrounded by small controls, with editing drawers appearing only when needed.

Current implementation adapts this structure to real Notale lectures. It uses original vector tool icons and live lecture assets, not copied Genially branding, promotional badges, or the planets artwork. Resource choices actually insert content or open a local file picker. Interaction entries expose existing editable native scene parameters and reusable component states. Preview operates the original slide runtime.

Responsive behavior: below 800px the left drawer and right inspector overlay the canvas and remain explicitly dismissible. The canvas preserves its author aspect ratio. Zoom and hand panning affect only the view, not saved coordinates. No ornamental motion or mandatory autoplay is added by the shell. Existing lecture animations remain governed by the slide playback/step system.

Native page thumbnails and paginated overview are now implemented. Still open: richer contextual property controls, direct manipulation and drag-in asset library polish, consistent high-level interaction authoring, and a more complete preview experience. Existing advanced inspectors are functional integration UI and still expose technical fields; they need product-level redesign. These are tracked frontend work, not claims already fulfilled by the first shell.
