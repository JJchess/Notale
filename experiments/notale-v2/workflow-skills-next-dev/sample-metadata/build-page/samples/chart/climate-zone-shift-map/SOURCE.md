# Climate-zone shift map — source record

## Page contract

The reader should understand that projected climate zones expand and move poleward by 2070, sharply reducing the number of sampled cities in cold climates, because the same Natural Earth map and the same 70 fixed city locations crossfade between present-day and future Köppen classifications.

Audience: a general reader viewing one 1600×900 explanatory chart. The initial frame is a complete present-day map with the comparison claims visible; the year control and category focus are inspection aids rather than prerequisites.

## Locked upstream

- Repository: `/data1/home/zhuyifan/ws2/Notale/refs/climate-zones`
- Commit: `b75ff23010bd2da67a5d22f728c8c6875a2f90f6`
- Live visual reference: <https://pudding.cool/2024/06/climate-zones/>
- Primary implementation references:
  - `src/components/Mapbox.svelte`: Mapbox style ID, Natural Earth map treatment, world-fit formula, 2,000 ms layer transitions, year labels, and city circle/symbol layers.
  - `src/components/Scrolly.svelte` and its step 6/7 state hand-off: future/present comparison followed by the same comparison with all cities visible.
  - `src/actions/getColor.js`: exact DN 0–30 subclass palette used for both exported states.
  - `src/actions/getColorSimp.js`: verified the five major-class DN ranges used by the optional focus treatment.
  - `static/assets/final_cities_v2.geojson`: canonical 70-city records.
  - `docs/_app/immutable/nodes/2.ScnC_TTg.js`, `docs/index.html`, and `docs/assets/final_cities_v2.geojson`: checked the deployed build against source behavior and data.

The `static/` and `docs/` city files are byte-identical. SHA-256: `193e0f371907f5e869cf88735982458b553a46018e5b25da70a7de80d3e95b59`.

## Canonical fields and claims

Stable city ID: `properties.name`. Used fields: coordinates, `clim_2023`, `clim_2070`, `type_2023`, `type_2070`, `type_2023_simp`, `type_2070_simp`, `temp_2023`, and `temp_2070` (temperature in °C).

- 45 of 70 cities change subclass: `clim_2023 != clim_2070`.
- 31 of 70 cities change one of the five major classes.
- Cold-class cities in this sample change from 16 present-day records to 1 projected record.

The UI follows the upstream labels “Present Day” and “2070.” The underlying Beck et al. maps represent 1980–2016 and projected 2071–2100 conditions under RCP8.5; future values are simulated ensemble classifications, not observations. Confidence rasters are not present in the upstream Mapbox layers and therefore are not invented here.

## Native map data build

The runtime contains no Mapbox, image, video, CDN, or API dependency. The browser draws the map from local scientific categories:

1. Download Figshare file `12407516`, `Beck_KG_V1.zip`, from the dataset DOI above. Extract `Beck_KG_V1_present_0p083.tif` and `Beck_KG_V1_future_0p083.tif`, the official 5-arc-minute unsigned 8-bit class rasters. Their SHA-256 hashes are `180cab4e5653624ae6179493bd598f71ca6e124441ae4eae52a9aa9719868c5f` and `15dfeb350430ba23ac8a2ce2765a78d289fb766330a9a52a6e879a77a8fab942`.
2. `tools/build-climate-grid.py` inverse-projects each center of the fixed 1584×900 Natural Earth 1 map into longitude and latitude, then samples the canonical GeoTIFF class value. It does not read a rendered screenshot. The fitted upstream world transform uses x/y scales `[300.2534121448773, 300.82036333324055]` and translation `[792.1181901144718, 450.0005585915445]`.
3. Each output cell stores only its Köppen `DN` value from 0 through 30. Rows are run-length encoded into `assets/data/climate-grid.js`; `climate-grid.meta.json` records dimensions, projection, source hashes, and per-class counts.
4. `assets/native-map.js` expands those categories into typed arrays and paints Canvas pixels with the upstream `getColor.js` subclass palette. It draws the Natural Earth boundary mathematically, draws collision-resolved city labels and ocean labels on a separate Canvas, and keeps all 70 city records as aligned semantic HTML buttons.
5. The five focus states do not load separate assets. The renderer redraws both canonical grids with the selected major-class range at opacity 1 and the remaining subclasses at 0.149.

The original PNG states remain only as pre-change review screenshots under `.codex-shots/`; no PNG is shipped in `pages/`.

## Adaptation

- Replaced scroll position with two semantic year buttons, left/right plus Home/End and 1/2 keyboard navigation, and touch-safe native controls.
- Preserved one fixed coordinate system for both classifications and cities. Only the future Canvas opacity changes during year comparison.
- Matched the upstream 2,000 ms linear comparison; rapid reversal continues from the current blended frame. Reduced motion resolves directly to the chosen complete state.
- Kept all 70 city dots and records. A deterministic four-anchor collision pass shows 58 labels at 1600×900; every city remains keyboard reachable and named through its aligned HTML button and tooltip.
- Added only one inspection behavior: hover, focus, or click a five-zone legend item to emphasize its true DN range while retaining the rest of the map as context.
- `window.ClimateChart` owns year, focus, reset, state inspection, readiness, and teardown. Teardown aborts listeners, unregisters resize callbacks, releases typed data, and shrinks Canvas backing stores.
- Added a textual fallback (title, findings, legend, state status, and city aria-labels) if local category data fails to initialize.

## Scientific source

Beck, H. E. et al. (2018), “Present and future Köppen-Geiger climate classification maps at 1-km resolution,” *Scientific Data* 5, 180214. <https://doi.org/10.1038/sdata.2018.214>. Dataset: <https://doi.org/10.6084/m9.figshare.6396959>.
