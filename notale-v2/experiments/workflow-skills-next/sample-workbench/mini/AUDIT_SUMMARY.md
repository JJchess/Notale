# Mini Sample Archive Audit

Updated: 2026-08-31

## Result

- Inventory: 19 promoted minis, 3 full samples already below 10k, 1 full-only sample, and 4 code-runtime author-layer samples with an explicit no-mini policy.
- Promoted author layer: 463,244 full chars → 188,608 mini chars, a reduction of 274,636 chars (59.3%).
- Auxiliary-eligible page set: 489,794 full chars → 215,158 usable chars after combining the 19 promoted minis with the 3 exempt full samples, a reduction of 56.1%.
- Every promoted mini is runnable, below 10,000 Unicode characters, at most 400 characters per author-source line, and independently cross-audited by a non-author.
- State: the user approved 19 minis on 2026-08-31. Their stable paths are `<category>/<sample>/mini/pages/`; staged candidates remain only as immutable audit sources.
- `interaction-general/future-climate-analogy` remains a formal full sample and may serve as a main sample, but its mini was rejected after visual review and is ineligible for auxiliary model context.

## Promoted minis

| Sample | Full | Mini | Cross-auditor |
|---|---:|---:|---|
| cover-composition/grid-to-preview | 12,760 | 9,957 | plan_mini_page |
| cover-composition/prism-light | 18,354 | 9,970 | plan_mini_page |
| cover-generative/magnetic-field | 17,909 | 9,917 | plan_mini_page |
| cover-generative/mycelium-growth | 18,660 | 9,995 | plan_mini_page |
| cover-generative/neural-signal-network | 21,895 | 9,982 | plan_mini_page |
| cover-generative/tactile-grid | 16,506 | 9,578 | plan_mini_page |
| interaction-general/lawn-path | 26,499 | 9,757 | plan_mini_cover |
| interaction-general/motif-match | 15,236 | 9,781 | plan_mini_cover |
| page-3d/gimbal | 54,993 | 9,999 | plan_mini_page |
| page-3d/population-mountains | 15,904 | 9,997 | plan_mini_interaction |
| page-chart/climate-zone-shift-map | 22,831 | 9,980 | plan_mini_cover |
| page-chart/lenna-scroll-bars | 28,429 | 9,997 | plan_mini_cover |
| page-chart/pollinator-network | 37,549 | 9,995 | plan_mini_cover |
| page-chart/solar-storage | 31,112 | 9,986 | plan_mini_interaction |
| page-chart/swarm-spectrum | 12,020 | 9,723 | plan_mini_interaction |
| page-general/escapement | 45,820 | 9,997 | plan_mini_interaction |
| page-general/lenna-image-lineage | 20,422 | 9,999 | plan_mini_interaction |
| page-general/neuron-to-formula | 29,643 | 9,999 | plan_mini_interaction |
| page-general/rain-paths | 16,702 | 9,999 | plan_mini_interaction |

## Gates actually run

- Static strict verifier: 19 pass, 0 fail, 0 pending; all promoted trees match their approved candidates byte-for-byte and retain exact author/reused-file hashes plus passing cross-audit evidence.
- Generic browser matrix: 19 formal minis × 3 profiles = 57/57 pass at 1600×900 normal, 1280×720 reduced motion, and same-page 1600→1280 resize.
- Exempt browser matrix: 3 full samples × the same 3 profiles = 9/9 pass; their author inventories are 9,660, 6,896, and 9,994 chars.
- Per-sample tests cover retained states and intermediate frames, real algorithms/data/simulations, repeated reset, fallback, resize/DPR, teardown, and clean reload.
- All author JS/MJS passes `node --check`; all three workflow skills pass `skill-creator` validation; both code-runtime generator contracts pass.

The dynamic-resize profile was intentionally added after ordinary fresh-load checks missed stale transformed-root overflow. It found and forced quality-neutral fixes in multiple candidates, plus a stage-transform transition bug in `rain-paths`. Cross-audit then found additional concrete regressions in `population-mountains`, `escapement`, and one stale Lenna character-ledger test.

## Review entry points

- Side-by-side full/formal-mini archive: `http://127.0.0.1:41031/sample-workbench/mini/`
- Strict static gate: `python3 experiments/workflow-skills-next/sample-workbench/mini/verify.py --base-url http://127.0.0.1:41031 --strict`
- Browser gate: `node experiments/workflow-skills-next/sample-workbench/mini/browser-check.mjs --base-url=http://127.0.0.1:41031`
- Exempt gate: `node experiments/workflow-skills-next/sample-workbench/mini/exempt-browser-check.mjs`
