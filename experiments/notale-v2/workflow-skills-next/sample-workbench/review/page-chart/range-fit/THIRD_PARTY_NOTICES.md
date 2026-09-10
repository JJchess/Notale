# Third-party notices

## World Bank WDI data

`pages/data/pm25.js` is a modified subset of World Bank World Development Indicators `EN.ATM.PM25.MC.M3` and `SP.POP.TOTL`, retrieved through the World Bank API on 2026-08-30. WDI is listed as [Creative Commons Attribution 4.0](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators); the [World Bank Data Catalog terms](https://datacatalog.worldbank.org/public-licenses) also apply.

Attribution: World Bank, World Development Indicators, “PM2.5 air pollution, mean annual exposure (micrograms per cubic meter)” and “Population, total.” The PM2.5 indicator credits Global Burden of Disease Study 2023 / GBD Collaborator Network / Institute for Health Metrics and Evaluation as its underlying source. Changes: aggregates and incomplete records were removed; the 100 highest-2023-population eligible economies were retained; PM2.5 values were rounded to 0.01; records were sorted by ID. No World Bank or IHME logo is used, and no endorsement is implied.

## WHO thresholds

Annual PM2.5 AQG and interim-target numbers are factual values from the [WHO global air quality guidelines (2021)](https://www.who.int/publications/i/item/9789240034228/). No WHO prose, chart, illustration, publication design, or logo is reproduced.

## D3

`pages/assets/lib/d3.min.js` is D3 v7.9.0, SHA-256 `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539`, copyright 2010–2023 Mike Bostock, distributed under the ISC license. The complete notice is in `third-party/D3-ISC.txt`.

## The Pudding reference

The reference repository is MIT licensed, copyright The Pudding 2022. This clean SVG/D3 implementation re-expresses its sequence mechanics but redistributes no upstream code, Svelte scaffold, prose, data, font, logo, person/avatar raster, or other branded artwork. Its README font/logo restriction and separately credited artwork were observed. The MIT notice is retained in `third-party/THE-PUDDING-MIT.txt`.
