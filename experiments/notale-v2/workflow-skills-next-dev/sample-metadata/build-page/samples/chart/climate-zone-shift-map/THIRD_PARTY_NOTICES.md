# Third-party notices

## The Pudding climate-zones project

Source and derived city data/palette are from the locked upstream climate-zones project. The page does not reproduce The Pudding logo or proprietary fonts.

MIT License

Copyright (c) 2022 The Pudding

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Köppen-Geiger scientific map data

Beck, H. E., Zimmermann, N. E., McVicar, T. R., Vergopolan, N., Berg, A., and Wood, E. F. (2018), “Present and future Köppen-Geiger climate classification maps at 1-km resolution,” *Scientific Data* 5:180214, <https://doi.org/10.1038/sdata.2018.214>. Dataset: <https://doi.org/10.6084/m9.figshare.6396959>.

The article and dataset are licensed CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/>. Changes in this sample include 5-arc-minute raster sampling, Natural Earth reprojection into a local categorical grid, palette application from the upstream Pudding project, browser-native Canvas rendering, major-class focus treatment, city overlay, and fixed-page composition.

## Map rendering and attribution

The deliverable does not ship Mapbox code, Mapbox-derived map images, vector tiles, glyphs, an API access token, OpenStreetMap data, or video. The Natural Earth 1 projection is evaluated directly in `assets/native-map.js`; scientific classification categories come from the Beck et al. files above. The visible footer credits the climate dataset and the Pudding city/palette adaptation.
