# Source and method

## Learning interaction

- Observable target: predict how a city's 2070 Köppen-style climate classification relates to its present classification and temperature, then explain the nearest present-day analogue.
- First meaningful action: select one of the 70 cities and commit to Cold, Temperate, Tropical, or Arid before the projection is shown.
- Canonical state: `phase`, `selectedId`, `prediction`, `unit`, and `attempts` in `pages/assets/app.js`. Layout, controls, motion, feedback, and the exposed inspection snapshot are derived from that state.
- Rule-based consequence: confirmation moves the selected city to its supplied 2070 subtype and projected annual average temperature, retains its prediction and origin, and computes a present-day analogue from all 70 records.
- Reset: cancels owned animation frames and timers, removes transient transforms, ghost, route, selection, prediction, attempt history, and unit choice, then recreates the exact initial state.

## Upstream

- Read-only repository: `/data1/home/zhuyifan/ws2/Notale/refs/climate-zones`
- Locked commit: `b75ff23010bd2da67a5d22f728c8c6875a2f90f6`
- Online visual/behavior reference: <https://pudding.cool/2024/06/climate-zones/>
- Studied source files:
  - `src/components/Board.svelte`: subtype order, four-zone geometry, city sorting, colors, chip styling, ghost/crossfade/FLIP behavior, duration/easing, and live connector bounds.
  - `src/components/ClassPopupText.svelte`: evidence-sentence structure and Celsius/Fahrenheit presentation.
  - `src/components/Canvas.svelte`: two-layer dashed route drawn from origin and destination bounds.
  - `src/components/data.svelte`: all 70 records.

## Data

`pages/assets/cities.js` is a direct copy of `src/components/data.svelte` with only its Svelte module wrapper changed to `window.CITIES = […]`. No record values were changed. Display-only whitespace in `Washington,  D.C.` is normalized when rendering; the source value remains intact.

Fields used:

- `id`: stable integer identity and first tie-breaker.
- `name`: city label and final tie-breaker.
- `type_2023`: complete present-day climate subtype.
- `type_2070`: complete projected 2070 climate subtype.
- `temp_2023`: present-day annual average temperature in °C.
- `temp_2070`: projected 2070 annual average temperature in °C.

The source also contains `color` and `clicked`; they are retained but are not authoritative in this adaptation.

## Analogue algorithm

The runtime implementation is `function analogue(c)` in `pages/assets/app.js`. On confirmation it filters the complete dataset by:

```text
candidate.type_2023 === selected.type_2070
```

It then sorts candidates by:

```text
abs(selected.temp_2070 - candidate.temp_2023)
```

Ties are resolved by numeric `id`, then `name`. The selected record is not specially excluded: it remains eligible whenever it satisfies the declared candidate condition. Computation always uses source Celsius values; °F is a display conversion only, including conversion of the reported absolute gap.

## Adaptation

- Recreated the desktop Explore board at a fixed logical 1600×900 with measured geometry: x positions 56/360/936/1240, widths 288/560/288/288, 16 px gaps, y=150, and 319 px initial board height.
- Preserved all four pastel regions, all 16 represented subtypes, their separator order, all 70 cities, subtype grouping, and descending-temperature order.
- A keyed DOM renderer keeps city identity stable. On reveal it inserts an origin ghost, reorders the selected city by `type_2070` and `temp_2070`, and applies the upstream Explore duration (2 s) with a quint-like FLIP transition to every displaced city. An SVG route is recalculated from live DOM bounds on every animation frame and after resize.
- Added the prediction commitment and data-derived analogue highlight in the same typographic and pastel vocabulary, below the board where the upstream Explore evidence sentence appears.
- Replaced the upstream proprietary font with Arial/Helvetica system fallbacks and optically calibrated spacing; no Pudding logo or brand sticker is included.
- No React, Vite build, CDN, Mapbox runtime, remote font, or runtime network request is used.

The projected classifications and temperatures are reproduced from the locked upstream dataset. This sample does not independently recalibrate or extend that climate model.
