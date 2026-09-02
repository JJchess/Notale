# Source and adaptation

- Upstream: [the-pudding/motifs](https://github.com/the-pudding/motifs), pinned at `5e1e88ae0633f348c01ac7905403a6e7b9eda3b1`.
- Located chain: `Piano.svelte` → `PlayableText.svelte` → `audio.svelte.js` → `piano.svg`.
- The 600 px figure, 32 px transport buttons, 16 px gap, 842 × 360 piano viewBox, marker geometry, progress behavior, and both marker timestamp arrays follow that source. The Notale stage renders the figure at 1.5× because the supplied 1617 × 561 screenshot was captured at 144 dpi / 150% scaling.
- The piano raster is not shipped. Its 14 white keys and 10 black keys are rebuilt with authored CSS gradients, bevels, shadows, press travel, and note labels; every key is playable from C4 through B5.
- `marker-*.svg` and the play/pause icons are mechanically separated copies of upstream MIT assets. See `LICENSE.upstream`.
- The prediction, interval checking, local repair, transfer, deterministic reset, polyphonic pointer/touch/computer-keyboard paths, and Web Audio synthesizer are newly authored for this sample.
- No upstream MP3, hosted font, logo, or masthead is redistributed. System Arial/Helvetica replaces the restricted Atlas font; synthesized notes replace recorded musical-theatre audio.

The sparse audit clone is retained at `refs/the-pudding-motifs`.
