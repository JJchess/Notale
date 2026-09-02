# Vocal Register Timeline: source and transformation

## Sample contract

The learner should understand that the all-chart average vocal register peaked around the late 1980s, while 2019 becomes exceptional only after restricting the comparison to Billboard Top-10 hits, because the same 1958-2019 series, selected-year song records, and Top-10 yearly averages remain visible across 18 authored states.

This sample is classified as `page/chart`. Navigation advances predetermined evidence; it does not alter the model or generate a new outcome.

## Upstream

- Repository: `https://github.com/the-pudding/falsetto-story`
- Local reference: `/data1/home/zhuyifan/ws2/Notale/refs/falsetto-story`
- Audited commit: `6a261f974e09f86a1a7c66102c0326f6386acf0a`
- Upstream software license: MIT, copyright 2019 The Pudding. The full notice is in `THIRD_PARTY_NOTICES.md`.
- Primary implementation evidence:
  - `src/js/year.js`: scales, line, Top-10 circles, selected-year annotations, song-name filtering, cross-year comparison, register and peak-rank classes.
  - `src/js/graphic.js`: `year-0` through `year-17` state order and transition calls.
  - `src/css/story/story.styl`: orange and green state fields, 600px chart geometry, orange line, white-backed narrative copy, selected points, dense song labels, and Top-10 circles.
  - `src/assets/data/avg.csv`, `avg_top.csv`, and `songs.csv`: canonical records.
- Original 1600x900 states were rendered from `docs/index.html` and saved under `screenshots/original/state-00.png` through `state-17.png`. These files are calibration evidence and are never loaded by the sample runtime.

## Preserved behavior

- One stable 1958-2019 x-domain and stable yearly IDs.
- All-chart average line driven by all 62 rows of `avg.csv`.
- Top-10 yearly circles driven by all 62 rows of `avg_top.csv`.
- The source's exact y-domains: `[5.7226, 7.0807]` for all-chart averages and `[5.6727, 7.6]` for Top-10 averages.
- The source's orange chart field, green song field, orange line, black yearly ticks, white selected point, dark Top-10 circles, 2019 emphasis ring, 600x420 chart host, and 90%-wide song-name field.
- Song labels retain source order, source truncation behavior, register-7 filtering, `peak_rank <= 10` filtering, and the source-highlighted titles.
- State changes preserve mark identity. The line changes scale over 900ms, Top-10 dots fade in, song fields crossfade, and reduced motion resolves directly to the same evidence.

The editorial sentences are new factual summaries. They are not copied from the article.

## Data transformation

`tests/extract_source_data.py` performs the only preprocessing:

- `avg.csv` and `avg_top.csv` are byte-identical copies of the source files.
- `songs.csv` retains the first 100 source-ordered records for 1977, 1984, 1988, 2010, and 2017, plus all 80 available records for 2019.
- Other song years are excluded because no extracted song-name state renders them. Their yearly average marks remain in both 62-row average files.
- No values, titles, register scores, peak ranks, sort orders, or missing-value decisions are invented.

| Year | retained | register >= 7 | Top 10 | Top 10 and register >= 7 |
|---:|---:|---:|---:|---:|
| 1977 | 100 | 73 | 55 | 38 |
| 1984 | 100 | 70 | 63 | 45 |
| 1988 | 100 | 76 | 73 | 54 |
| 2010 | 100 | 50 | 23 | 15 |
| 2017 | 100 | 32 | 17 | 8 |
| 2019 | 80 | 33 | 5 | 4 |

The runtime parses these local CSVs, derives every scale position, filter, count, label class, and annotation from the records, and never embeds decorative or mock marks.

## State mapping

| State | Evidence |
|---:|---|
| 0-1 | All-chart line; 2019 then 1984 selected |
| 2-3 | 1984 songs; unfiltered then register >= 7 with `When Doves Cry` |
| 4 | 1984 and 2017 on the same compact song-name field |
| 5-6 | 1988 line point, then high-register songs with `Sweet Child O' Mine` |
| 7-8 | 1977 line point, then high-register songs and named hits |
| 9 | 1962 line point |
| 10-11 | 2010 line point, then high-register songs and named hits |
| 12 | 2019 all-chart point |
| 13-14 | All-chart line plus Top-10 yearly averages; then the 2019 Top-10 emphasis |
| 15-16 | All 80 songs from 2019; then only the five Top-10 records with `Talk` |
| 17 | Decisive all-chart versus Top-10 comparison |

## Media and brand exclusions

The runtime contains no image, audio, video, iframe, remote font, tracking script, or external request. Specifically excluded:

- Spotify preview audio from `p.scdn.co`;
- all Giphy GIF/MP4 backgrounds;
- the YouTube ending;
- Pudding logos, social icons, footer, author/about controls, favicon, and publication chrome;
- the remotely hosted Atlas Grotesk files.

The media states did not encode the chart values. After their removal, the selected point, narrative sentence, and following source-derived song evidence still carry the comparison. Arial/Helvetica is the local metric-compatible fallback for the licensed upstream typeface; no upstream font binary is redistributed.

## Rights boundary

The MIT notice covers the upstream software. It does not automatically grant rights to Spotify, Giphy, YouTube, Pandora, Billboard, or commercial typeface material, so none of those media/font assets are redistributed. The retained CSV records cite Pandora vocal-register data and Billboard Hot 100 chart data exactly as the source project does. Any use beyond this internal research sample should review the underlying data terms separately.

