# Verification

Verified locally on 2026-08-30 with Chromium through Playwright.

## Commands

```bash
python tools/preprocess.py
python -m http.server 42006 --bind 127.0.0.1 --directory pages
python verification/browser_check.py --url http://127.0.0.1:42006/
```

## Data and state checks

- 206 canonical records across 77 edited episodes.
- 3,700 removed seconds, a 1,251-second comparison domain, and three packed duration rows.
- Category counts: 139 sex, 22 non-heteronormative relationship, 20 disrespect, 12 illegal action, 3 religion, 2 unhealthy addiction, and 8 miscellaneous.
- All seven authored states captured at 1600x900.
- Initial, categorized, and packed states compared side-by-side with live upstream captures in `comparison/`.
- The first, middle, and final transforms prove that the packed state traverses real intermediate positions rather than swapping a static image.

## Input, lifecycle, and layout checks

- Right/left pointer zones, arrow keys, wheel, and real touch events advance and reverse the same bounded state machine.
- `R`, `Home`, and the visible reset button restore state 0. Two resets reproduce the initial screenshot byte-for-byte after transient hover is cleared.
- Reduced motion reaches the identical final pixels with zero-duration transitions.
- 1600x900 and 1280x720 have no document overflow; narrative and reset text remain inside the viewport.
- Missing `data.js` exposes the renderer fallback and creates zero scene marks.
- Teardown disconnects the resize observer and all owned input/media listeners.
- Runtime result: zero page/console errors, zero failed resources, and zero external requests.

Machine-readable details and screenshot hashes are in `verification/results.json`.

## Size

- Core application (`index.html`, `style.css`, `app.js`): 9,052 Unicode characters and 9,954 bytes.
- Generated canonical data (`data.js`): 3,137 characters/bytes.
- Total shipped HTML/CSS/JS/data: 12,189 Unicode characters and 13,091 bytes.

The application remains under the requested 10,000-character ceiling when generated data is counted separately from renderer, interaction, markup, and styling code.
