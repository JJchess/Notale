# Source and data audit

## Target and commits

This sample recreates the `Explore` graphic from The Pudding's *The Naked Truth* as a fixed 1600 by 900 chart page.

- Visual and behavior reference: `/data1/home/zhuyifan/ws2/Notale/refs/foundation-names`, commit `fe53ae458c45415373723bce0e541360822793b3`.
- Data source: `/data1/home/zhuyifan/ws2/Notale/refs/pudding-data`, commit `7a5f4394bededfe8f255d7266ab4d2343c66d178`.
- Canonical input: `foundation-names/allCategories.csv`.
- Canonical input SHA-256: `a98652527e5039e81b3cdf371f28c8c589e3b7bb0db8defd6d1ce96a4d92abc4`.

The behavior study covered these upstream files:

- `src/components/Explore.svelte`
- `src/components/InteractiveWrapper.svelte`
- `src/components/InteractiveParent.svelte`
- `src/components/Interactive.svelte`
- `src/components/UI.svelte`
- `src/components/SwatchHistogram.svelte`
- `src/components/Gradient.svelte`
- `src/components/GradientAnnotation.svelte`
- `src/components/WordWall.svelte`
- `src/components/Table.svelte`
- `src/components/TooltipDisplay.svelte`

The upstream implementation repository has no explicit license file. Its code, bundled output, fonts, logos, and interface assets were therefore treated as inspection-only reference material. `pages/index.html` is a clean-room implementation using browser Canvas and semantic HTML. No Svelte, LayerCake, D3, upstream JavaScript, CSS, font file, logo, or media asset is included.

## Data rights

`pudding-data` is MIT-licensed, copyright The Pudding 2019. The complete notice is copied to `third-party/THE-PUDDING-MIT.txt`. The compact browser payload is a transformed copy of the 5,307 rows in `allCategories.csv`, so it remains inside that notice.

The upstream README says these rows are the foundation shades with word-based labels available from the US Sephora and Ulta sites in January 2021. Products that were out of stock on the collection dates can be present. Categories were assigned manually. The hex value is the most prevalent color extracted from the product swatch image, and `lightness` is the HSL lightness value from 0 to 1. The page does not extend those claims to current inventory or to all foundation sold in the US.

## Compact transform

Run:

```bash
python3 tools/build-data.py
```

The script validates the 5,307-row count and writes `pages/data/shades.js`. It retains every record and the fields needed by every view:

| Browser field | Source field | Transform |
|---|---|---|
| brand index | `brand` | Index into a case-insensitively sorted 93-value dictionary |
| product index | `product` | Index into a case-insensitively sorted product dictionary |
| name | `name` | Unchanged Unicode string |
| specific | `specific` | Unchanged, except source `NA` becomes an empty display value |
| color | `hex` | Leading `#` removed and hex letters uppercased |
| lightness | `lightness` | Rounded to integer millionths; maximum absolute error is 0.0000005 |
| categories | `categories` | The 17 category values become a bit mask; source `NA` is not a category |

`url` and `imgSrc` are not shipped because no runtime view uses links or product imagery. Omitting them also prevents accidental external requests. The original CSV remains the canonical record; `tests/data_check.py` reconstructs and compares every retained field row by row.

## Encodings and algorithms

The page contract is:

> The reader should understand that the 5,307 word-named shades concentrate in the lighter half of the observed range because every shade appears in a shared-lightness histogram and the page reports that 4,104 of 5,307 have lightness at or above 50%.

- Horizontal position encodes HSL lightness on the fixed domain `[0.15, 1.00]`.
- Vertical stack length encodes the number of shades in that lightness bin.
- Each rectangle is one canonical record and uses that record's extracted hex value.
- The initial 1,130px plot uses 94 bins. Filtered sets under 1,000 records switch from 10px to 20px blocks and recompute bin count, matching the upstream inspection behavior.
- The bottom gradient is a continuous dark-to-light notation for the horizontal variable.
- The outlined interval runs from the selected records' 10th to 90th lightness percentile, so its “80%” annotation is recomputed after every filter.
- Brand filtering is exact string equality. Category filtering checks the source category bit. When a brand changes, impossible category choices are removed from the category selector.
- “Compare to all shades” replaces the blocks with two lines. The all-shades bin proportions are multiplied by the selected row count, and both series use one vertical scale. This compares shape without pretending the selected set has the full dataset's magnitude.
- The names view sorts all selected records by lightness, then lays every name into a measured Canvas word wall. The all-data canvas is 7,798 logical pixels high and scrolls inside the fixed page.
- The table is a ten-record-per-page exact-value fallback. All 5,307 records are reachable across 531 pages.

The initial state is synchronous and deterministic. Filtering, view changes, reset, and compare use the same canonical array. No simulation, random value, interpolation of missing records, or decorative data mark is used.

## Source-aligned adaptation

The upstream Explore module is 1,200px wide and uses a full viewport-height plotting region. The sample retains its centered narrow title, two wide selectors, green segmented view control, checkbox, white editorial ground, vertical boundary lines, dense shade blocks, dark-to-light baseline, percentile bracket, names wall, and ten-row table. The vertical distances were compressed to fit the required 1600 by 900 page without shrinking the decisive marks.

The upstream publication fonts were not copied. The page uses local system condensed-sans and Georgia fallbacks while preserving the source sizes and weight relationships. The Pudding wordmark, navigation, article prose, download link, and publication chrome are absent. Screenshots under `screenshots/original-*` are review-only comparisons and are not loaded by the runtime page.

`pages/assets/base.css`, `base.js`, and `CHASSIS.md` are unchanged copies of the local Notale fixed-stage chassis. They contain no topic design or third-party visual asset.
