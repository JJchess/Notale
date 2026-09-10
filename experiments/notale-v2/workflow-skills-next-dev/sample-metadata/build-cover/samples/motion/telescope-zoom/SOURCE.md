# Source record

## Upstream

- Repository: <https://github.com/joffreysp/telescope-zoom>
- Read-only clone: `/data1/home/zhuyifan/ws2/Notale/refs/telescope-zoom`
- Locked commit: `8a0e22d16bae84271a646e45e1a5e29a5f9c1328`
- Commit date: `2025-10-29T20:57:03Z`
- Codrops article: <https://tympanus.net/codrops/2025/10/29/building-a-layered-zoom-scroll-effect-with-gsap-scrollsmoother-and-scrolltrigger/>
- Published demo: <https://tympanus.net/Tutorials/TelescopeZoom/>

The locked checkout was installed and run from a temporary copy with its exact `package-lock.json`. The upstream was measured at 1600×900 across six states before this candidate was implemented. The read-only clone remains clean.

The upstream README labels the project “MIT” and links to `LICENSE`, but the locked tree has no `LICENSE`, `COPYING`, or `NOTICE` file. A scan of all 16 commits also found no such file. No software-license conclusion is inferred from the broken README link. See `THIRD_PARTY_NOTICES.md`.

## Cover contract

| Decision | Fixed answer |
|---|---|
| Category | `cover/motion` |
| Exact title | `for the planet` |
| Subject cue | A deconstructed ecology image field resolving into a masked crab photograph |
| Protagonist | The crab-shaped six-layer telescope reveal |
| Supporting evidence | The full-bleed background and nine unique peripheral ecology photographs, with `img-9.webp` intentionally shown twice as upstream does |
| Gaze path | Split title, central image aperture, outward photographic constellation |
| Title field | The quiet horizontal center of the white 1600×900 field |
| Crop policy | The internal stage never reflows or crops; it scales uniformly and letterboxes only on non-16:9 viewports |
| Representative still | Progress `0`, also used for reduced motion |
| Motion role | A single reversible 0-1 telescope zoom deepens the same cover composition; it does not introduce another section or narrative |

## Byte-identical reused files

The following upstream media files were copied without recompression or editing into `pages/assets/`:

- `img-1.webp`, `img-2.webp`, `img-3.webp`, `img-4.webp`
- `img-6.webp`, `img-7.webp`, `img-8.webp`, `img-9.webp`, `img-10.webp`
- `img-big.jpg`
- `mask.png`

`img-5.webp` is not used by the upstream composition and was not copied. All copied files were checked with `cmp` against the locked checkout. Their SHA-256 values are recorded in `THIRD_PARTY_NOTICES.md`.

`pages/assets/gsap.min.js` is the unmodified GSAP core 3.13.0 distribution selected by the upstream lockfile. Its license banner is intact. The candidate does not bundle ScrollTrigger, ScrollSmoother, imagesLoaded, Vite, or any npm cache.

## Reimplemented mechanism

No upstream HTML, CSS, or JavaScript file was copied. The following behavior was reconstructed from the running upstream, its source measurements, and the published Codrops explanation:

- the exact 1600×900 positions and sizes of the ten surrounding image instances;
- the 900 px perspective plane and center-out GSAP Z-axis stagger;
- one background image plus six masked foreground copies;
- foreground starting scales `1, .85, .6, .45, .3, .15`;
- foreground scale convergence, reverse-order blur clearing, offsets, durations, and `power1.inOut` easing;
- split title travel synchronized to the same eased progress as the central media scale;
- reversible smooth scrub behavior.

## Adaptation boundary

- Removed the Codrops frame, tutorial links, navigation, favicon, loading chrome, and all content outside the single composition.
- Replaced document scrolling, ScrollSmoother, and ScrollTrigger with a fixed stage and an owned 0-1 controller. Wheel, trackpad, touch/pointer drag, and direction keys update the same target. GSAP eases the current progress toward that target without discontinuities.
- Added uniform viewport fitting for the fixed 1600×900 stage, explicit lifecycle methods, resize handling, and a static reduced-motion state.
- Omitted the remotely loaded Adobe `area-normal` webfont. A local system sans stack is horizontally calibrated against the measured title geometry; no Adobe font file is downloaded or redistributed.
- Added no visible instructions, progress display, navigation, cards, labels, copy, gradient, glow, or decorative interface.
- Runtime resources are all local relative files. The delivered page makes no network request to Adobe Fonts, Codrops, Pexels, GSAP, or another origin.
