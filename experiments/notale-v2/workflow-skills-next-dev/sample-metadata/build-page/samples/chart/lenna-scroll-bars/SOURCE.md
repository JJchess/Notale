# Source and page contract

Page contract: the learner should understand that a test image introduced in 1972 persisted across five decades of network infrastructure because the annual bars remain substantial through 2021 and the final stack shows its distribution across `.org`, `.edu`, `.com`, and other domains.

- Intended use: a standalone 1600×900 authored chart page for reviewing a complete scrollytelling state chain without document scrolling.
- Relationship: time-series magnitude followed by categorical composition, using a shared zero baseline and a fixed 1972–2021 x-domain.
- Canonical records: `pages/assets/data/data.csv`, copied byte-for-byte from the upstream repository at commit `5a70e912806291a4c350be17546daba1a3c4a25b`.
- Upstream repository: `/data1/home/zhuyifan/ws2/Notale/refs/lenna`.
- Upstream article: <https://pudding.cool/2021/10/lenna/>.
- Aggregation: rows with a numeric year greater than or equal to 1972 are counted by year. Domains ending in `.org`, `.edu`, or `.com` enter those categories; all remaining domains enter `other`. This matches `src/utils/barChart.js` at the fixed commit.
- Verified canonical totals: 4,801 dated records, 45 annual rows, a 287-instance peak in 1995, and a 2021 endpoint of 252.
- Authored states: 1972 → 1991 → 1995 → 2014 → 2019 → 2021 → domain stacks.
- Initial state: 1972 is fully visible with its axis, highlighted label, outlined bar, evidence image, and short claim.
- Decisive state: 1995 exposes the 287-instance peak.
- Final state: annual stacks preserve total heights and support `.org` / `.edu` / `.com` / `other` hover and focus isolation.
- Reduced motion: state changes resolve directly to the same complete evidence, while reset always restores the initial snapshot.

The Chinese prose is newly written for this sample. It paraphrases the chronology and does not reproduce the article text. Four low-resolution contextual story images were copied because they are necessary evidence for the 1972, 1991, 2014, and 2019 beats. No Pudding logo, Pudding font file, or standalone high-resolution Lenna image is included.
