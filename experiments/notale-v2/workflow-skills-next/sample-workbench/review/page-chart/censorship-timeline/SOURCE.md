# Source and extraction boundary

Page contract: the learner should understand that 206 removed scenes affected 77 of the first 100 episodes and total 61 minutes 40 seconds because the same canonical marks first appear on their episode timelines, then retain identity while categories and cumulative duration are revealed.

- Upstream repository: <https://github.com/the-pudding/censorship>, pinned locally at commit `0ef3fb3c7027da65347c19b816f2fcb64ca0e426`.
- Original article: <https://pudding.cool/2022/08/censorship/>.
- Upstream files studied: `src/components/Graphic.Scroll.svelte`, `src/components/Scroll.Figure.svelte`, `src/data/getEpisodes.js`, `src/routes/index.js`, `src/data/cuts.csv`, `src/data/copy.json`, `src/styles/app.css`, and `src/styles/variables.css`.
- License: upstream software is MIT licensed. The copyright and license text are preserved in `third-party/THE-PUDDING-MIT.txt`.
- Extraction boundary: only the seven-state, 100-episode removed-scene timeline is reproduced. Pudding branding, article navigation, videos, GIFs, stills, show posters, quoted sitcom dialogue, article-wide copy, and unrelated story sections are excluded.
- Visual boundary: the original dark field, 80%-width timeline, seven-pixel episode rows at 1600x900, category colors, overlaid narrative block, example callout geometry, and duration-packing transition are retained. The fixed-page input model replaces document scrolling without adding visible deck controls.

## Canonical data and transformation

`tools/preprocess.py` reads the pinned `cuts.csv` and emits only `[episodeIndex, startSeconds, stopSeconds, typeIndex]` into `pages/data.js`. The CSV's 1-based episode index is deliberately converted to 0-based before rendering so the episode 100 record remains inside the 100-row plot; the upstream route left the value 1-based while `getEpisodes.js` iterated rows 0-99. The script asserts 206 records, 77 edited episodes, 3,700 removed seconds, a 1,251-second maximum episode timestamp, and the seven real category counts.

At runtime, records are stably sorted by removed duration, matching `getEpisodes.js`. Each scene has two derived positions:

1. Episode view: `x = cut_start / 1251`, `y = episodeIndex`, `width = duration / 1251`.
2. Lost-time view: sorted widths are packed left-to-right into rows; a new row begins before a mark would exceed one episode-width.

The algorithm produces three packed rows because the records total 3,700 seconds, or 2.96 times the 1,251-second comparison width. Every state renders from the same canonical records; no decorative marks or invented values are present.

## Authored states

1. 100 episode baselines.
2. 206 removed scenes positioned within 77 episodes.
3. Three frequent categories colored while four smaller categories remain gray.
4. A data-derived sex-category example location.
5. A data-derived atypical-relationship example location.
6. A data-derived disrespect example location.
7. The same 206 marks packed into three rows to expose 61 minutes 40 seconds of removed duration.

Chinese narrative copy is newly written from the aggregate evidence. Example callouts show only episode, timestamp, and duration; copyrighted sitcom dialogue from the source dataset is not shipped.
