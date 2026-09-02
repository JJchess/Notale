# Source record

## Upstream

- Repository: `/data1/home/zhuyifan/ws2/Notale/refs/climate-zones`
- Locked commit: `b75ff23010bd2da67a5d22f728c8c6875a2f90f6`
- Online initial-state reference: `https://pudding.cool/2024/06/climate-zones/`
- Upstream license copy: `pages/assets/climate-zones-MIT-LICENSE.txt`

## Reused and derived material

- `src/svg/title.svg` → `pages/media/title.svg`, copied byte-for-byte. This preserves the outlined CLIMATE lettering, the solid ZONES device, its masks, crisp-edge geometry, and native drop shadow without loading a proprietary font.
- `src/components/Scrolly.svelte` step 0 supplied the measured 1600×900 placement: the title SVG is 1200 px wide at `(200, 223.125)` and the upstream subtitle wrapper begins at y `767.078`. The bundled open font changes inline metrics, so the local wrapper is shifted up 2 px; its visible tape bounds remain pixel-aligned with the upstream frame.
- `src/components/TapeText.svelte` supplied the duplicated foreground/background tape construction, cloned line backgrounds, line height, arrow geometry, and 400 px text field. The proprietary Atlas Typewriter face was not copied; the BSD-licensed Go Mono fallback is bundled instead.
- `src/components/MapTitle.svelte` and `src/components/Mapbox.svelte` supplied the Natural Earth world projection, full-world crop, climate colors, and the staggered three-band fade used by the upstream title step.
- `pages/assets/map-data.js` is generated vector path data. Its climate polygons come from zoom-0 of the upstream public `dock4242.98ahoozo` Mapbox tileset (`present_vector_v12-azczh3`), transformed from Web Mercator tile coordinates into the same Natural Earth projection. The generator clips tile buffers, unions polygons by Köppen class, simplifies below the rendered pixel scale, and stores paths at the fixed 1600×900 stage coordinates.
- Country silhouettes and boundaries in `map-data.js` come from Natural Earth's public-domain `ne_110m_admin_0_countries` GeoJSON. Ocean labels are positioned from geographic coordinates with the same projection.
- `pages/assets/map.js` renders five native Canvas layers: ocean and land, three independent climate bands, and borders and labels. The climate canvases are rasterized from vector paths once; one owned animation frame only changes their compositing opacity.
- `vendor/chassis` was copied to `pages/assets` without modification. The page retains `#stage`, `assets/base.css`, and `assets/base.js`.

## Adaptation

The Pudding sticker, byline, navigation, explanatory copy, and proprietary webfonts were omitted. The original title, map scale and crop, overlap, negative space, subtitle location, pastel color relationships, and ambient climate-zone cadence were retained. Runtime rendering is fully offline and requests no Mapbox style, tile, CDN, video, GIF, or font resource. Reduced-motion mode immediately renders the representative vector frame and owns no animation frame.
