# Verification

Result: **PASS**

The pure chart segment remains visually and evidentially complete after removing all audio, GIF, video, remote font, and publication chrome. The sample does not need a conditional media fallback.

## Commands

```bash
python3 tests/extract_source_data.py
python3 tests/verify.py
```

The final machine-readable run is saved in `tests/results.json`.

## Browser coverage

- Chromium headless using `/data1/home/zhuyifan/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.
- 1600x900: all 18 states captured in `screenshots/final/state-00.png` through `state-17.png`.
- 1280x720: scale and overflow checked; screenshot saved as `screenshots/final/viewport-1280x720.png`.
- Reduced motion: state 13 resolves directly to all final marks; screenshot saved as `screenshots/final/reduced-motion.png`.

## Assertions passed

- 62 all-chart yearly line records and 62 Top-10 yearly circles load from local CSV.
- All 18 authored states settle at their exact index and keep a non-empty factual claim.
- Song-name states render 100, 200, 80, or 5 records as specified by the source-derived filters.
- Selected-year annotations, all 62 Top-10 circles, and the single 2019 emphasis ring appear only in the intended states.
- ArrowRight, ArrowLeft, `r`, Home, left/right pointer regions, and the reset control navigate the same state machine.
- Two resets produce identical state, path geometry, and copy.
- Resize preserves state and produces scale `1` at 1600x900 and `0.8` at 1280x720.
- No horizontal or vertical document overflow in any state at 1600x900 or at 1280x720.
- Reduced motion disables CSS transitions while preserving the same final evidence.
- Teardown cancels the owned animation, aborts pending fetches, and removes keyboard, resize, and pointer listeners.
- Console and page errors: zero.
- Runtime requests: only the local page, `states.json`, `avg.csv`, `avg_top.csv`, and `songs.csv`. External requests: zero.

## Size

- Core runtime: `pages/index.html`, 9,652 characters.
- Authored state content: `pages/data/states.json`, 2,142 characters.
- Runtime CSV subset: 19,563 characters across three files.
- Core runtime meets the requested 10,000-character target without reducing chart marks, state count, motion semantics, accessibility, or lifecycle handling.

## Deliberate boundary

The source's commercial Atlas Grotesk webfont is not redistributed. The page uses local Arial/Helvetica fallbacks with the same size, weight, line height, plot geometry, and information hierarchy. Original remote-media states are retained only as screenshots for internal comparison and are never part of runtime rendering.
