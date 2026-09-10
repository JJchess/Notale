# Visual and interaction audit

Target: 1600×900 fixed canvas. Selected build-page reference: `general`.

## Authored states

| State | Visible evidence | 1600×900 capture |
|---|---|---|
| `five` | Five complete 200×200 thumbnails at the upstream coordinates, with 8px five-color borders | [state-0-five.png](screenshots/sample/state-0-five.png) |
| `sprout` | Copies move and scale outward from five small pixel-like origins with staggered entry | [state-1-sprout.png](screenshots/sample/state-1-sprout.png) |
| `field` | Twenty-five 200×200 images form a deterministic, ordered dense field | [state-2-field.png](screenshots/sample/state-2-field.png) |
| `exchange` | The field fades to 20% while five mint-bordered screenshots grow along the inherited paths | [state-3-exchange.png](screenshots/sample/state-3-exchange.png) |
| `contexts` | Five 200×200 technical screenshots settle at the upstream coordinates with 8px `#A5F2D5` borders | [state-4-contexts.png](screenshots/sample/state-4-contexts.png) |
| `gather` | Screenshots shrink to five colored anchors while the pixel portrait grows underneath | [state-5-gather.png](screenshots/sample/state-5-gather.png) |
| `portrait` | A native 84×84 image is enlarged with nearest-neighbor rendering to 588×588 at `(200,156)` | [state-6-portrait.png](screenshots/sample/state-6-portrait.png) |

The complete state sheet is [contact-sheet.png](screenshots/sample/contact-sheet.png). The four
direct upstream/sample comparisons are in
[comparison-contact-sheet.png](screenshots/comparison-contact-sheet.png). Upstream baseline
captures are retained in `screenshots/upstream/`; each is also 1600×900.

## Upstream alignment

- Initial geometry matches the upstream render exactly: `(174,30)`, `(846,80)`, `(510,350)`,
  `(174,620)`, and `(896,570)`, each 200×200 with an 8px border.
- Border roles match: `#F29F80`, `#D96666`, `#A64153`, `#586FA6`, and `#F2C299`; context
  screenshots use `#A5F2D5`.
- The propagation field contains 25 visible images, matching the upstream count. The sample
  replaces upstream runtime randomness with fixed, orderly destinations.
- Screenshot coordinates and dimensions match the upstream settled state exactly.
- The final 84×84 portrait is 588×588 at `(200,156)`, matching the upstream 7px-per-source-pixel
  rendering. All 7,056 RGB records were checked against `lennaPixels.json` with an exact match.
- Upstream uses 1.5s image transitions, a 1s growth delay, and a delayed 2s portrait fade. The
  sample preserves that cadence with 1.45s copy growth, 1.5s screenshot growth, staggered
  65–140ms object starts, and a 1.55s final portrait enlargement/fade.

After inspecting the rendered sheets, the caption panel's extra outline/shadow treatment was
removed because it competed with the evidence field and implied a stronger card boundary than
the upstream composition.

## Checks run

Final `selfcheck.py` run covered the initial state, all six forward states, five reverse states,
and deterministic reset: 13 measured states total. Results:

- JavaScript errors: 0
- failed resources: 0
- clipped elements: 0
- elements outside 1600×900: 0
- text overlaps: 0
- duplicate canvases/loops: 0 canvases and one owned GSAP timeline

The browser audit in [interaction-results.json](audit/interaction-results.json) also verified:

- Arrow-key forward order: `sprout → field → exchange → contexts → gather → portrait`
- Arrow-key reverse order: `gather → contexts → exchange → field → sprout → five`
- wheel forward and reverse
- touch swipe forward and reverse
- reset returns timeline time to 0 and exactly restores seed geometry and identity order
- `document` remains 1600×900 at scroll position `(0,0)` in every state
- no console errors, page errors, or failed requests
- reduced-motion advances through all seven states immediately, without animation, while
  preserving the same evidence

Full normal-state geometry is in [sample-metrics.json](audit/sample-metrics.json); reduced-motion
geometry is in [reduced-metrics.json](audit/reduced-metrics.json). Seven 1600×900 reduced-motion
captures are retained in `screenshots/sample/reduced/`.
