# Verification

## Upstream acquisition

The locked upstream was installed with `npm ci` and run with Vite 7.0.6 from a temporary copy. Playwright captured the running page at 1600×900 after image decode and after the ScrollSmoother 1.5 s settle period.

- Native upstream scroll range: 900 px.
- Upstream console errors: 0.
- Upstream failed requests: 0.
- Upstream external runtime requests: Adobe Typekit stylesheet plus three Adobe font resources.
- Six recorded states: initial `0`, early `.2`, middle `.5`, deep `.8`, end `1`, and reverse middle `.5` after first reaching `1`.
- Reverse-middle computed geometry, transforms, filters, opacity, and Z values matched forward-middle values.

## State-by-state visual and numeric comparison

`q` is the shared `power1.inOut` mapping that drives the full media scale and title separation. Bounds are in the fixed 1600×900 stage.

| Raw progress | Upstream `q` | Candidate `q` | Full media bounds in both | Title x, upstream `for the / planet` | Title x, candidate `for the / planet` | Layer check |
|---:|---:|---:|---|---|---|---|
| `0` | approximately `0` | `0` | centered `0×0` | `638.50 / 802.50` | `642.30 / 802.42` | foreground scales `1/.85/.6/.45/.3/.15`, blur `2px`, orbit Z `0` |
| `.2` | `.0800007` | `.08` | `x736 y414 128×72` | `566.50 / 874.90` | `569.99 / 875.10` | center-out Z values `103.68/151.38/208.08/273.78/348.48/348.48/...` match |
| `.5` | `.5000011` | `.5` | `x400 y225 800×450` | `188.50 / 1255.00` | `190.36 / 1256.72` | foreground scales `1/.898/.728/.626/.524/.422`; blur `2/2/2/1.9984/1.9856/1.96px` match |
| `.8` | `.9200002` | `.92` | `x64 y36 1472×828` | `-189.50 / 1635.10` | `-189.27 / 1638.33` | all foreground scales `1`; blur `.7744/.64/.5184/.4096/.3136/.2304px` match |
| `1` | `1` | `1` | `x0 y0 1600×900` | `-261.50 / 1707.50` | `-261.58 / 1711.02` | all foreground scales `1`, blur `0`, peripheral images outside the view |
| reverse `.5` | `.5000011` | `.5` | `x400 y225 800×450` | `188.50 / 1255.00` | `190.36 / 1256.72` | identical to forward `.5`; no directional branch or jump |

All six foreground layers keep opacity `1` in both implementations. Depth is expressed through scale, mask crop, blur, and DOM stacking rather than opacity fades.

The upstream leaves most animated elements at `z-index:auto`, with the media context at `-1` and the removed Codrops frame at `1000`. The candidate makes the same visual order explicit inside an isolated stage: media `1`, title `3`, peripheral field `4`; the background precedes the six foreground slices in DOM order. This avoids the deleted page frame's stacking context without changing visible occlusion.

## Timing and motion alignment

| Mechanism | Upstream | Candidate |
|---|---|---|
| Progress shape | ScrollTrigger scrub over one viewport; shared `power1.inOut` CSS progress | Owned clamped 0-1 target; same `power1.inOut` shared progress |
| Input smoothing | ScrollSmoother `smooth:1.5`, normalized scroll | GSAP retarget tween from `.55` to `1.5` s with `power3.out`, proportional to distance |
| Peripheral depth | `z:100vh`, duration `1`, `power1.inOut`, stagger amount `.2` from center | `z:900`, duration `1`, same ease and stagger on the fixed 900 px stage |
| Six-layer convergence | Starts at timeline `.6` plus `.1` delay, duration `1`, `power1.inOut` | Same start, delay, duration, ease, and initial scales |
| Blur clearing | Starts at `.6` plus `.4` delay, duration `1`, reverse-order stagger amount `.2` | Same start, delay, duration, ease, and stagger direction |
| Timeline span | 2.2 GSAP time units | 2.2 GSAP time units |
| Reverse behavior | Scroll-linked timeline reverses in place | The same paused timeline seeks backward through the current state; retargeting starts from the current rendered value |

## Functional test matrix

Automated browser tests used Chromium and Playwright against the delivered static files.

| Test | Result |
|---|---|
| 1600×900 at progress `0/.2/.5/.8/1` | Pass; stage bounds `0,0,1600,900`, no horizontal or vertical overflow |
| 1280×720 at progress `0/.2/.5/.8/1` | Pass; unchanged internal composition uniformly scales to `0,0,1280,720`, no overflow |
| Forward wheel/trackpad path | Pass; a 450 px normalized delta settled continuously at `.5` |
| Reverse wheel path | Pass; reverse delta settled from `.5` to `.25` with no snap |
| Fast forward then immediate reverse | Pass; sampled progress stayed in `[0,.217024]`, decreased monotonically, and settled at `0` |
| Touch drag | Pass; a 400 px upward drag settled at `.571429` |
| Keyboard | Pass; `End` reached `1`, `ArrowUp` reversed to `.88`, `Home` returned to `0`; arrows, Page Up/Down, Home, and End are handled |
| Resize | Pass; fixed stage recomputed from 1600×900 to 1280×720 and back without reflowing internal geometry |
| Destroy | Pass; after `destroy()`, wheel input did not change target or progress |
| Repeated initialization | Pass; two consecutive `init()` calls reset to `0`; one wheel delta changed target once to `.1`, proving listeners were not duplicated |
| `prefers-reduced-motion` | Pass; representative progress `0` rendered immediately, input remained locked at `0`, and normal input resumed after preference removal |
| Visibility lifecycle | Pass by implementation inspection; an owned active tween pauses while the document is hidden and resumes when visible |
| Network and runtime | Pass; 0 external requests, 0 failed requests, 0 console errors, 0 page errors |
| Static asset boundary | Pass; no video, GIF, screenshot sequence, node_modules, Vite cache, or remote font is present |

## Cover and anti-template review

- The initial state remains a complete editorial cover: one centered title, one quiet title field, and a controlled ring of ecology photographs.
- The single protagonist is the masked crab depth event. No added copy or interface competes with it.
- The page contains no navigation, instruction, scroll cue, progress number, cards, pills, numbered labels, gradient text, glow, or AI-style marketing language.
- Grayscale hierarchy remains legible because the image constellation frames rather than covers the title.
- The representative still is the exact reduced-motion still, so capture does not depend on watching an animation.

## Residual differences and risks

1. The upstream Adobe `area-normal` webfont is not legally portable from its Typekit delivery. The candidate uses a system sans stack calibrated with a horizontal scale. Measured title edges differ by roughly 0.2 to 4 px at the six checkpoints; glyph shapes and line metrics are not identical.
2. The fixed controller preserves the upstream 1.5 s maximum smoothing and timeline rhythm but does not instantiate ScrollSmoother or native document scroll. This is intentional for the single fixed cover and for touch/keyboard parity.
3. The upstream software license is unresolved because its advertised MIT file is absent. No upstream source code was copied, but the artistic arrangement and behavior remain an adaptation.
4. Individual Pexels photo IDs and creators are absent, and `mask.png` has no separate provenance record. The media chain must be resolved or replaced before promotion where a fully documented redistribution grant is required.
5. GSAP is under its Standard “No Charge” License, not an open-source license. Use in a competing visual animation builder requires a separate license review.

