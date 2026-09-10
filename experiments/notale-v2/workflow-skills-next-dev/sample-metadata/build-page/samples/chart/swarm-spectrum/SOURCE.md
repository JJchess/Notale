# Source and data audit

## Exact upstream target

This sample ports the desktop Swarm chart from [the-pudding/similes](https://github.com/the-pudding/similes), pinned in refs/similes at commit 90c43f98dfaa5b8836f5e873bdac74543290db48. The decisive files are:

- src/components/Swarm.svelte — selects the desktop component at 1024 px.
- src/components/Swarm.Desktop.svelte — encodings, dimensions, labels, legend, tooltip, and SveltePlot marks.
- src/data/simpson.csv — the 101 displayed aggregate records.
- src/components/Index.svelte — numeric parsing and topAdjectives splitting.
- properties/color.json, properties/font-size.json, and src/styles/app.css — color, type, and width tokens.

The source CSV is copied with CRLF normalized to LF; row values and order are unchanged. SHA-256: 851582a449b6b8bb5f49745d4ce68be3fa968f392be396ed6bcd23fe378d21bf. pages/data/simpson.js is a data-only string wrapper around the same CSV so the page also works from file://; layout and parsing logic remain in index.html.

## Fields, units, and direction

- vehicle: normalized comparison noun displayed on the circle.
- score: Simpson concentration index on [0,1]. Here it is the probability that two randomly selected occurrences for the noun use the same adjective. Low means a generalist; high means a specialist. The visual domain remains the complete 0–1, formatted as 0–100%.
- totalCount: number of extracted “as ___ as ___” simile occurrences for the noun. The desktop source filters at >= 200; all 101 shipped rows pass.
- adjectiveCount: number of distinct paired adjectives.
- topAdjectives: the five leading normalized adjective labels, pipe-delimited.

The source chart uses a square-root radius transform. Its responsive range is [container width × 0.005, container width × 0.03]; at the fixed 1600 logical width this is [8,48] px. Because the source adds a nonzero 8 px floor, displayed area is monotonic but not strictly proportional to count; this port retains that behavior for exact fidelity. The legend separately uses a zero-based square-root scale. stone is the maximum at 2,880 occurrences. hell is the score minimum at 0.04231077062560599; cucumber is the maximum at 0.9244745057232051. The 20–25% interval is densest at 13 nouns.

## Layout port

The page does not ship Svelte. It ports the upstream SveltePlot configuration into native SVG:

- chart content width 1568 px, maximum radius 48 px, and chart height 48 × 15 = 720 px; Runed 0.37.1 confirms ElementSize defaults to the 1600 px border box, while the container’s 16 px side padding leaves the 1568 px SVG content box;
- fixed score domain [0,1], 5% ticks, and the upstream inset/margin geometry;
- stable descending-radius order;
- SveltePlot dodgeY with middle anchor and 3 px padding, preserving the same tangent candidates and symmetric tie order;
- the upstream 12–20 px rounded label scale, fills, outlines, legend sizes, annotations, and tooltip fields.

The initial layout is synchronous and deterministic; there is no visible force simulation in either normal or reduced-motion mode. Keyboard focus and pointer/touch activation expose the same details. Escape, or activating the pinned noun again, resets selection.

## Data provenance and limits

The upstream article describes the corpus as about 200,000 “as ___ as ___” similes extracted from tens of thousands of English-language fiction books, limited to the 500 most-used adjectives. It documents grammatical filtering, three-LLM false-positive review, and normalization/aggregation. The authors describe the result as reliable in aggregate but imperfect at sentence level. This sample redistributes only the upstream aggregate CSV, not book text.

The repository does not provide book-level provenance in the selected files, so the sample does not assert representativeness beyond the upstream methodology. Counts are corpus occurrences, not population estimates; no uncertainty intervals are supplied.

## Rights boundary

The upstream repository is MIT-licensed, copyright The Pudding 2022. Its README separately states that The Pudding logos and fonts may not be reproduced without written permission. The sample therefore includes no logo, masthead, illustration, Atlas Grotesk, or Tiempos font file. It uses system font fallbacks while preserving the chart’s geometry and typographic sizes.

The collision code is a clean JavaScript port of SveltePlot 0.13.0’s ISC-licensed dist/transforms/dodge.js, which in turn notes portions ported from Observable Plot under ISC terms. Full notices are in THIRD_PARTY_NOTICES.md and third-party/.

pages/assets/base.css and pages/assets/base.js are the unchanged Notale chassis.
