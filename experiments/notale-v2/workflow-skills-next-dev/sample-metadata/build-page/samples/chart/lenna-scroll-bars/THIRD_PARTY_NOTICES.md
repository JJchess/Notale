# Third-party notices

## The Pudding / Lenna upstream study

The data, chronology, implementation reference, and four contextual story images come from the local checkout of `the-pudding/lenna` at commit `5a70e912806291a4c350be17546daba1a3c4a25b`, corresponding to <https://pudding.cool/2021/10/lenna/>.

No `LICENSE`, `LICENCE`, or `COPYING` file is present in that fixed upstream tree. These materials are retained only for local research and sample review; no broader redistribution rights are asserted. The sample does not copy the Pudding logo or its webfonts, and it does not include a standalone high-resolution Lenna image.

Copied contextual files:

- `playboy.jpg`
- `journal.jpg`
- `silicon-valley.jpg`
- `losing-lena.jpg`
- `data.csv`

## Chassis and D3

`pages/assets` is a complete mechanical copy of this repository's `vendor/chassis`, as required by the sample contract. The page directly uses its local D3 7.9.0 UMD build (`pages/assets/lib/d3.min.js`). D3 is distributed under the ISC license; the remaining bundled chassis libraries are present but are not loaded by this page. See `pages/assets/lib/LIBS.md` for the chassis inventory and pinned versions.
