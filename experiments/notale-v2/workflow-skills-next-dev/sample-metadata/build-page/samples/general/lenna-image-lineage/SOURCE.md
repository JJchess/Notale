# Sources

This sample is a local research adaptation of **Can Data Die? Tracking the Lenna Image**
by Jennifer Ding, with Jan Diehm and Michelle Pera-McGhee, published by The Pudding:
https://pudding.cool/2021/10/lenna/

Implementation reference:

- Repository: https://github.com/the-pudding/lenna
- Pinned commit: `5a70e912806291a4c350be17546daba1a3c4a25b`
- Studied files: `src/components/App.svelte`, `src/components/Screenshots.svelte`,
  `src/components/Lenna.svelte`, `src/utils/screenshots.js`, and
  `src/data/lennaPixels.json`

Reused local media from that pinned checkout:

- `static/assets/img/memes/pic1.jpg` through `pic20.jpg`
- `static/assets/img/screenshots/pic1.jpg` through `pic6.jpg`
- `src/data/lennaPixels.json`, converted directly into the included 84×84 RGB PNG without
  resizing or additional image data

Only the upstream pixelated portrait and blurred Lenna appearances inside screenshots are
present. No full-resolution or unprocessed Lenna image was added. Visible prose was newly
written for this sample and does not reproduce the article's paragraphs.

The upstream repository contains no `LICENSE` file at the pinned commit. This sample is for
local research and review only. The Pudding logo, wordmark, and upstream font files were not
copied; the page uses system fonts.
