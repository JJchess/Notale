# Source, transformation, and reference audit

## Page contract

Core question: among the 100 most populous economies with complete records, did annual PM2.5 exposure move toward the WHO guideline between 2000 and 2023, and did the fixed WHO target system move with it?

The initial state already shows the full 100-economy distribution, the fixed 0–85 µg/m³ axis, WHO bands, economy median, China, headline conclusion, and summaries of all five authored states. Playback is an optional reading sequence, not the only way to obtain the result.

## Canonical data and encoding

`pages/data/pm25.js` contains 100 arrays shaped as:

`[economy_id, economy_name, population_2023, value_2000, value_2010, value_2015, value_2023]`

- `economy_id` is the stable keyed-update identity. One persistent SVG sampler glyph represents one named economy; no glyph is a simulated person, percentile, or interpolated observation.
- The set is a declared purposive subset, not a statistical sample: non-aggregate economies with all four PM2.5 observations were ranked by 2023 population, the first 100 were retained, then records were sorted by ID for deterministic storage. Their combined 2023 population is 7,780,181,919, or 96.493% of the World Bank world total 8,062,923,417.
- Each PM2.5 value is a population-weighted mean annual exposure in µg/m³. Values are stored to 0.01 and displayed to 0.1. The retained range is 5.26–82.59, so the fixed `[0,85]` domain contains every value without clipping.
- X is the exact linear value position in every state. All nodes have fixed target x; D3 force simulation changes only y to reduce collisions. Y has no scale, axis, ordering, or analytical meaning.
- The median is the ordinary unweighted median of the 100 economy-level inputs. It is not a world-population-weighted median; the source value for each economy is already population weighted.
- China (`CHN`) is the persistent representative economy. State 0 derives the focus band from the median; states 1–4 derive it from China. Median, China value, focus interval, count above 35, accessible description, and explanatory copy all derive from the same canonical state.
- Annual WHO boundaries are fixed at 5 (AQG), 10 (IT-4), 15 (IT-3), 25 (IT-2), and 35 (IT-1). Only 0–35 is shaded; values above the loosest interim target remain visibly outside the colored system. The single orange focus rectangle can continuously tween to the unfilled 35–85 range.

State results, recomputed in the browser:

| State | Economy median | China | Above 35 |
|---|---:|---:|---:|
| 2000, target names | 26.1 | 45.3 | 33 / 100 |
| 2000, target values | 26.1 | 45.3 | 33 / 100 |
| 2010 | 23.1 | 49.0 | 27 / 100 |
| 2015 | 22.7 | 49.5 | 24 / 100 |
| 2023 | 21.3 | 32.0 | 24 / 100 |

## PM2.5 and population provenance

Primary delivery source: World Bank World Development Indicators (WDI), [`EN.ATM.PM25.MC.M3`](https://data.worldbank.org/indicator/EN.ATM.PM25.MC.M3), “PM2.5 air pollution, mean annual exposure (micrograms per cubic meter).” The indicator page identifies Global Burden of Disease Study 2023 air-pollution exposure estimates, GBD Collaborator Network / IHME, as the underlying source and labels the series CC BY 4.0.

API snapshots retrieved 2026-08-30; both indicator responses reported `lastupdated: 2026-07-13`:

- PM2.5: `https://api.worldbank.org/v2/country/all/indicator/EN.ATM.PM25.MC.M3?format=json&per_page=20000&date=2000:2023`
- 2023 population: `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=1000&date=2023`
- entity metadata used to remove aggregates: `https://api.worldbank.org/v2/country?format=json&per_page=400`

Canonical transformed-data SHA-256: `bc2e1c8a1eaf408de112e585a9bd9af5edc16f8e531d08926d30affdb6e57030`.

Threshold source: WHO, *Global air quality guidelines* (2021), Table 0.1 / Table 3.1. The annual PM2.5 sequence is IT-1 35, IT-2 25, IT-3 15, IT-4 10, and AQG 5 µg/m³. WHO describes interim targets as incremental steps for highly polluted areas; they are not legal limits. No WHO prose, chart, design, or logo is reproduced.

Limitations: the WDI series is modeled exposure, not readings from identical monitors. The page does not show source uncertainty intervals. Economy-level medians weight every retained economy equally. Population rank is fixed to 2023 and should not be read as a historical top-100 ranking for earlier states.

## GitHub and recording audit

The reference repository was cloned to ignored working reference `refs/the-pudding-womens-sizing` and inspected at commit [`03bcfaedd43ebd3374a4334022c4b3dd20d75ec2`](https://github.com/the-pudding/womens-sizing/commit/03bcfaedd43ebd3374a4334022c4b3dd20d75ec2).

The requested `V2Intro.svelte` is not the production component: it reads nonexistent `copy.intro` while the data key is `copy.introScroll`, and it contains debug red/green borders. `src/components/Index.svelte` imports `womens_sizes/IntroJD.svelte`; the rendered sequence is `<Intro startStage={8}/>` after the title page. Production component SHA-256: `f73324b7c2ba5dc954d42cea780e061bc32548e71ca153cae5b44e4dc854a56d`.

Stages 8–12 use one fixed `[20,60]` axis and `pointsData_JD.csv` across five conditions: age 14–15 with letter labels; the same distribution with numeric labels; ages 20–29; ages 30–39; and age 20+. The production point file has 101 rows: seven reported percentile anchors and 94 generated/interpolated rows, including extrapolated tails. Its SHA-256 is `602fb966c2a15fafddc4bac8adf9f936bd04eb7d7d260679a5135116d51077dc`. Upstream methods trace the anchors to U.S. NCHS/CDC anthropometric reports and category values to ASTM D5585/D6829; `tasks/generate-percentile-data.js` documents the interpolation. None of that topic data is used here.

Mechanics intentionally matched from `IntroJD.svelte`: stable point IDs; D3 x/y/collision simulation with x strength 1, y strength 0.1, collision iterations 3, alpha decay 0.02, and 300 offline ticks; a 500 ms cubic-in-out focus-range tween; 500 ms glyph transforms; per-object 0–200 ms delays; and symmetric band-label delays of 0.75/0.5/0.25/0/0.25/0.5 seconds. This sample pins every x exactly, a stricter truth-preserving adaptation of the upstream strong-x target.

The user-supplied recording is 2558×1400, 30 fps, 10.666646 seconds. Its relevant state triggers occur at approximately 0, 2.25, 4.25, 6.25, and 9.00 seconds; playback ends at 10.65 seconds. Those timings are reproduced. The recording and extracted analysis frames are not redistributed.

## Rights boundary

The upstream software is MIT licensed, copyright The Pudding 2022. Its README explicitly withholds permission to reproduce The Pudding logos or fonts. Project methods also credit third-party ransom-letter artwork, and the avatar system uses layered raster assets whose separate rights are not established by the repository README. This sample therefore uses none of the upstream Svelte scaffold, copy, data, people/avatar art, font files, letter art, grid, logo, or branding. The SVG air-sampler symbol, Chinese copy, palette, data transformation, and fixed-page composition are original. The abstract mechanics were re-expressed in plain SVG/D3; the upstream MIT notice is retained in `third-party/THE-PUDDING-MIT.txt` out of caution.

The repository chassis files `base.css` and `base.js` were copied unchanged. D3 v7.9.0 is redistributed under ISC; its complete notice is in `third-party/D3-ISC.txt`. See `THIRD_PARTY_NOTICES.md`.
