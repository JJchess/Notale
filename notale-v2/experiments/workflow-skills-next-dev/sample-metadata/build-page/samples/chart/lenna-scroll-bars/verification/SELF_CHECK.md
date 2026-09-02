# Verification summary

Final verification was run at a 1600×900 Chromium viewport on 2026-08-30.

## Chassis selfcheck

`pages/assets/selfcheck.py` inspected the initial state, all six subsequent authored states, and two final hover states (`.org` and `.com`). Across all nine probes:

- clipped elements: 0
- escaped elements: 0
- detected text overlaps: 0
- header/footer intrusions: 0
- JavaScript or console errors: 0
- failed resources: 0
- minimum rendered text size: 12px

## Interaction and rendering audit

`verification/capture_and_check.py` verified:

- the byte-derived aggregation contains 4,801 dated records and 45 annual rows;
- the 1995 maximum is 287 and the 2021 endpoint is 252;
- the x-band width is 27.0541px and the bar baseline is y=800;
- all annual stack totals equal their corresponding ordinary bar totals;
- wheel, touch swipe, arrow keys, reverse navigation, and reset work while `scrollY` remains 0;
- two independent reset paths produce the same screenshot SHA-256 as the initial frame;
- new-bar reveal delays advance in exact 80ms steps;
- the outgoing card travels upward, the incoming card begins below its resting point, and the image is still clipped during entry;
- reduced-motion navigation reaches the same complete state with zero reveal delays;
- legend hover and body-copy hover keep the selected category at opacity 1 and dim context to 0.28;
- all requests remain local, with zero page errors, console errors, failed requests, or external requests.

Full machine-readable measurements are in `results.json`. Native screenshots are in `../screenshots/upstream` and `../screenshots/candidate`; lossless side-by-side pairs are in `../screenshots/comparisons`.
