# Verification record

Run 2026-08-30 with local Playwright Chromium against `pages/index.html`.

## Canonical states and transitions

- All five states matched their canonical year/mode, median, China value, count above 35, focus band, selected control, and 100-glyph count: `2000 names 26.1 / 45.3 / 33`, `2000 values 26.1 / 45.3 / 33`, `2010 23.1 / 49.0 / 27`, `2015 22.7 / 49.5 / 24`, and `2023 21.3 / 32.0 / 24`.
- Every rendered x was compared with the value-to-pixel formula. Maximum absolute error across all states was 0.0049 px (computed-transform rounding); y was the only free layout coordinate.
- The 2000 name→value switch retained all 100 computed transforms exactly. At 300 ms, the central numeric band label opacity was 0.848 while the 750 ms-delayed outer label remained 0, confirming the source-matched stagger.
- The single focus rectangle changed continuously from `[x 455.76, w 172.71]` through `[591.45, 715.46]` to `[628.47, 863.53]`; the captured midpoint lies between both endpoints.
- For the first moving distribution, China moved `806.36 → 822.89 → 869.39` px; the captured frame is genuinely between endpoints.
- D3 collision-center audit found minimum separations of 29.03 px initially and 26.94 px finally with the source-matched 15 px collision radius, three collision iterations, and 300 offline ticks. Dense glyph overlap behavior is therefore disclosed rather than treated as a second y variable.
- Node identity was stable: all original mark references remained connected and index-identical, and exactly one focus rectangle remained. Reverse switching, rapid `[4,0,3,1,4,2,0,4]`, and Reset all ended in the correct complete state with 100 marks and no duplicate focus node.

## Playback, viewport, and fallbacks

- Playback observations: 100 ms `2000 names`; 2350 ms `2000 values`; 4350 ms `2010`; 6350 ms `2015`; 9150 ms `2023`; 10850 ms stopped at `2023`. These match the recording-derived 0/2.25/4.25/6.25/9.00/10.65 s schedule.
- No page error, console error, or failed request occurred.
- At 1200×900 the 1600×900 logical stage scaled to `[0,113,1200,675]`; body scroll size remained exactly 1200×900.
- With `prefers-reduced-motion: reduce`, a 20 ms switch produced the complete 2023 state and computed glyph transition duration `0s`.
- With JavaScript disabled, the fallback was visible and contained all five state values plus units and WHO boundaries.

## Render audit and artifacts

Notale `selfcheck.py` tested initial, each preset, reverse, rapid switching, and Reset. Every pass reported no runtime error, escaped element, clipped content, or text collision: 49 visible text blocks, 12 px minimum only for axis ticks, 14 px median, 36 px maximum, and 92% occupied cells. Its only reference notice was that optional `--pad-x` theme metadata is absent; this sample intentionally loads the required `base.css` plus local page tokens and has no `theme.css`.

`base.css` and `base.js` are byte-identical to existing chassis copies (SHA-256 `a10166ac…61f367` and `1d82ad5f…f84faa`). Authored `pages/index.html` is 9,997 Unicode characters (10,796 UTF-8 bytes).

Saved 1600×900 evidence:

- `screenshots/initial.png`
- `screenshots/transition-mid.png`
- `screenshots/final.png`
- `screenshots/reduced-motion.png`

Re-run with `python3 verify.py` and `python3 pages/assets/selfcheck.py pages/index.html`.
