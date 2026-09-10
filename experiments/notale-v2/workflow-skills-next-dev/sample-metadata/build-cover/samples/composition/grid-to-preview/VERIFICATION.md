# Verification

## Result

- Status: PASS
- Browser: Chromium through Playwright 1.62.1
- Runtime: Node.js 20.20.2, Python static server
- Final automated run: `2026-08-30T15:03:41.196Z`
- Machine-readable result: `.codex-shots/final/verification.json`
- Page-specific runtime code: `8,798` characters (`index.html` 778, `style.css` 2,570, `app.js` 5,450). Local GSAP, font, images, notices, screenshots, and test harness are excluded.

## Browser matrix

| Check | 1600×900 | 1280×720 | Result |
|---|---:|---:|---|
| Fixed canvas fit and zero overflow | Native 1.0 scale | Deterministic 0.8 scale | PASS |
| Initial eight-object cover | Checked and captured | Checked and captured | PASS |
| Left card to right preview | Checked | Checked | PASS |
| Right card to left preview | Checked | Covered by identical fixed geometry | PASS |
| Preview intermediate frame | Checked and captured | Geometry-preserving scale | PASS |
| Rapid cross-side switch | Checked and captured | Geometry-preserving scale | PASS |
| Rapid same-side target switch | Correct title and `product-2` layer family | Geometry-preserving scale | PASS |
| Mid-flight reverse then re-enter | No jump or flash | Geometry-preserving scale | PASS |
| Exact reset after exit | Identity transforms, opacity restored | Identity transforms, opacity restored | PASS |

## Input and lifecycle checks

| Check | Result |
|---|---|
| Desktop hover with 100 ms intent | PASS |
| Keyboard focus opens the same preview timeline | PASS |
| Tab switches the target without a wrong image | PASS |
| Escape closes and restores all eight tiles | PASS |
| Touch tap opens, another target switches, second tap closes | PASS |
| Programmatic reset | PASS |
| `prefers-reduced-motion: reduce` opens the complete terminal composition immediately and keeps one stable base image | PASS |
| Resize during an active transition, 1600×900 to 1280×720 and back | PASS |
| Repeated enter, exit, switch, and reverse | PASS |
| Synthetic `pagehide` kills timelines, removes listeners, clears the public test hook, and restores preview opacity to zero | PASS |

## Geometry and network assertions

- Eight tiles: 307×344 each.
- Column x positions: 66, 453, 840, 1227.
- Row y positions: 100 and 524; the 80 px row and column gap matches upstream 5vw at 1600 px.
- Preview fields: 694×768, matching upstream dimensions; only the y origin is translated for the title band.
- `object-position` is 50% 50% for grid and preview images.
- Zero console errors.
- Zero failed requests or HTTP 4xx/5xx responses.
- Zero external requests. Fonts, 24 WebPs, CSS, JavaScript, and GSAP load from `pages/`.
- Source clone remained clean after research.

## Design re-audit

- Artifact profile, source-preserving rewrite depth.
- No P0 or P1 generic-AI pattern remains: no pill, badge, section number, decorative metadata, stock CTA, card chrome, glow, gradient headline, helper copy, or duplicated action.
- The page is locked to the upstream light field, sharp image geometry, real source imagery, and one serif register. The only authored addition is the necessary cover title.
- Every visible string was re-read. Visible copy consists only of `Domestic Objects` and the active upstream object name.

## Captures

- Upstream baseline: `.codex-shots/upstream/`
- Final states: `.codex-shots/final/`
- Upstream/final pairs: `.codex-shots/compare/`
- Initial pair: `.codex-shots/compare/01-initial-upstream-final.png`
- Left-preview pair: `.codex-shots/compare/02-left-preview-upstream-final.png`
- Right-preview pair: `.codex-shots/compare/03-right-preview-upstream-final.png`
- Required intermediate-frame pair: `.codex-shots/compare/04-midframe-upstream-final.png`

The screenshots also include keyboard focus, touch open/switch, reduced-motion terminal state, 1280×720 initial/preview, rapid switch crossing, and post-reversal restoration.
