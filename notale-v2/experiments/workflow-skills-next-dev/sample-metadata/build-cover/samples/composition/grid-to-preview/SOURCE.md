# Source record

## Upstream lock

- URL: https://github.com/gwen-bo/codrops-grid-to-preview
- Read-only clone: `/data1/home/zhuyifan/ws2/Notale/refs/codrops-grid-to-preview`
- Locked commit: `1027ebb60e38cbb4e7ee7d10ef045b5627a035c2`
- Project license: MIT. The complete upstream text is copied to `pages/assets/upstream-MIT-LICENSE.txt`.
- Creative credit in the upstream README: Gwen Bogaert, inspired by a concept by Gaetan Ferhah. The README credits the images as generated with DALL·E.
- The clone remained clean. Installation and Vite execution happened only in a temporary copy under `/tmp`.

## Files actually studied

- `README.md`, `LICENSE`, and `package.json`
- `src/index.html`
- `src/js/main.js`
- `src/js/product-grid.js`
- `src/js/product-preview.js`
- `src/js/utils.js`
- `src/styles/main.scss`
- `src/styles/reset.scss`
- `src/styles/global.scss`
- `src/styles/shop.scss`
- All 24 files under `static/assets/products/`
- `node_modules/gsap/package.json` and `node_modules/gsap/dist/gsap.min.js` for the exact bundled GSAP version and license header

## Frame contract

- Exact title: `Domestic Objects`
- Subject cue: the eight upstream household-object images
- Protagonist: the shared spatial event in which a two-by-two half of the grid yields to a masked full preview
- Supporting evidence: the seven surrounding objects and the active object's name
- Gaze path: title, eight-object field, active full preview, object name
- Title field: the quiet band above y=100 in the 1600×900 canvas
- Crop policy: every grid tile remains 307×344 with `object-fit: cover` and `object-position: 50% 50%`; the full canvas scales as one unit at smaller viewports
- Representative still: `.codex-shots/final/01-grid-1600x900.png`; reduced motion renders the complete selected preview terminal state immediately

## Reused material

- All 24 upstream WebP files are copied byte-for-byte to `pages/media/`. Their SHA-256 hashes match the locked clone.
- `pages/assets/gsap.min.js` is the upstream dependency's GSAP 3.13.0 browser build, including its original license header.
- The four-column/two-row grid, two opposite-side preview controllers, three layers per object, shared half-grid preview geometry, cross-shaped mask, coordinated four-tile displacement, hard layer exchange, and reversible GSAP timelines are source-derived.
- The upstream used unbundled Georgia. To keep runtime fonts local, this sample uses unmodified DejaVu Serif from the system package and preserves its full notice at `pages/assets/DejaVu-LICENSE.txt`.

## Removed and adapted content

| Upstream content | Final treatment |
|---|---|
| Product prices | Removed |
| Add-to-cart overlays | Removed |
| Category navigation and counts | Removed |
| Codrops title, article/archive/GitHub links, tags, and desktop hint | Removed |
| Eight product cards | Retained as eight domestic-object image fields; no visible catalogue metadata |
| Product names | Retained only in the active preview; wording follows the upstream `data-name` values |
| Ecommerce page identity | Semantically adapted to the single cover title `Domestic Objects` |
| Georgia system font | Replaced only because it could not be localized from the repository; local DejaVu Serif keeps the source's restrained serif register |
| Responsive breakpoint disclaimer | Replaced by deterministic scaling of the fixed 1600×900 stage |

## Animation correspondence

| Upstream mechanism | Final correspondence |
|---|---|
| Four columns, two rows, 5vw row/column gaps | At 1600 px, both gaps are the same 80 px. Tile x positions `66, 453, 840, 1227`, width `307`, height `344`, and both crop dimensions match upstream. The whole image system is translated down 34 px to reserve the title field. |
| Left/right routing by `index % 4` | Indices in columns 1-2 open the right preview; columns 3-4 open the left preview, matching `ProductGrid.getProductSide`. |
| 100 ms hover-intent timer | Same 100 ms desktop hover delay, with cancellation before activation. |
| GSAP timeline default duration and ease | Explicit `0.5 s` on every concurrent track with `power2.inOut`, matching GSAP's upstream default duration and declared ease. |
| Preview opacity plus scale | Separate concurrent opacity and scale tweens. The 694×768 preview scales to `(694-80)/694 = 0.884726` by `(768-80)/768 = 0.895833`. |
| `transformOrigin: center center` | Retained exactly. |
| Four surrounding products fade and move by `±2.5vw` | Retained as `±40 px` on the fixed 1600 px canvas, with top row moving down and bottom row moving up. |
| Twelve-point masked-preview polygon | Retained. The cross arm is 80 px (`5vw`) in both axes and collapses to the same zero-width cross. |
| Three preview images per object | Retained for all eight objects. The first base image and two detail layers use the upstream files and centered object position. |
| Repeating layer exchange | Same `repeat: -1`, hard opacity sets, and `0.5 s` hold per layer. No fade was substituted. |
| Product name timing | The name is assigned before `timeline.play()` and reveals through the parent preview's 0.5 s opacity track, as upstream. Prices are omitted. |
| Stagger | Upstream has no GSAP stagger; none was invented in the adaptation. |
| Mouse leave | Calls the same timeline's `reverse()` from its current progress. Re-entry plays forward from that progress. |
| Resize rebuild | The authored geometry stays fixed at 1600×900, so resize scales the complete stage instead of recomputing crops. Active and mid-flight timeline state is preserved. |
| Added input/lifecycle support | Keyboard focus, touch toggle/switch, Escape, reduced-motion terminal states, listener cancellation, resize fitting, and pagehide teardown wrap the same two preview timelines without changing their visual tracks. |

The delivered `pages/` directory has no Vite, package manager, `node_modules`, build output dependency, CDN, API, or remote runtime request.
