# Full-sample audit ledger

> Audit-only document. It is not part of any skill or sample context.

## Result

- Historical page optimization: **491,984 → 515,806 chars** (**+23,822**); 11 samples increased and 12 decreased. Increases are readable-compact source replacing semi-minified source, not added product scope.
- Approval state: all **23/23** improved full candidates were explicitly approved and promoted; current formal and candidate author layers are both **515,806 chars** and match file-for-file.
- All **23/23** page candidates pass cross-audit. The current auxiliary ledger contains **19 promoted minis**, three full samples used directly below 10k, and one full-only sample whose rejected mini is excluded from context.
- The four code-runtime samples are tracked separately: **65,797 → 66,087 author-layer chars** (**+290**) and retain their explicit no-mini exception.

## Page ledger

| Category | Sample | Historical source → full | Δ | Current formal → candidate | Cross-audit | Auxiliary availability |
|---|---|---:|---:|---:|:---:|:---:|
| cover-composition | climate-zones-title | 10,689 → 9,660 | −1,029 | 9,660 → 9,660 | PASS | Full direct |
| cover-composition | grid-to-preview | 8,798 → 12,760 | +3,962 | 12,760 → 12,760 | PASS | Promoted mini |
| cover-composition | prism-light | 19,223 → 18,354 | −869 | 18,354 → 18,354 | PASS | Promoted mini |
| cover-generative | lenna-pixel-field | 6,885 → 6,896 | +11 | 6,896 → 6,896 | PASS | Full direct |
| cover-generative | magnetic-field | 20,416 → 17,909 | −2,507 | 17,909 → 17,909 | PASS | Promoted mini |
| cover-generative | mycelium-growth | 20,408 → 18,660 | −1,748 | 18,660 → 18,660 | PASS | Promoted mini |
| cover-generative | neural-signal-network | 9,800 → 21,895 | +12,095 | 21,895 → 21,895 | PASS | Promoted mini |
| cover-generative | tactile-grid | 9,460 → 16,506 | +7,046 | 16,506 → 16,506 | PASS | Promoted mini |
| cover-motion | telescope-zoom | 7,802 → 9,994 | +2,192 | 9,994 → 9,994 | PASS | Full direct |
| interaction-general | future-climate-analogy | 18,174 → 26,012 | +7,838 | 26,012 → 26,012 | PASS | Full only; mini rejected |
| interaction-general | lawn-path | 27,722 → 26,499 | −1,223 | 26,499 → 26,499 | PASS | Promoted mini |
| interaction-general | motif-match | 10,112 → 15,236 | +5,124 | 15,236 → 15,236 | PASS | Promoted mini |
| page-3d | gimbal | 60,740 → 54,993 | −5,747 | 54,993 → 54,993 | PASS | Promoted mini |
| page-3d | population-mountains | 15,929 → 15,904 | −25 | 15,904 → 15,904 | PASS | Promoted mini |
| page-chart | climate-zone-shift-map | 23,491 → 22,831 | −660 | 22,831 → 22,831 | PASS | Promoted mini |
| page-chart | lenna-scroll-bars | 29,066 → 28,429 | −637 | 28,429 → 28,429 | PASS | Promoted mini |
| page-chart | pollinator-network | 42,262 → 37,549 | −4,713 | 37,549 → 37,549 | PASS | Promoted mini |
| page-chart | solar-storage | 35,526 → 31,112 | −4,414 | 31,112 → 31,112 | PASS | Promoted mini |
| page-chart | swarm-spectrum | 8,836 → 12,020 | +3,184 | 12,020 → 12,020 | PASS | Promoted mini |
| page-general | escapement | 50,580 → 45,820 | −4,760 | 45,820 → 45,820 | PASS | Promoted mini |
| page-general | lenna-image-lineage | 18,500 → 20,422 | +1,922 | 20,422 → 20,422 | PASS | Promoted mini |
| page-general | neuron-to-formula | 27,811 → 29,643 | +1,832 | 29,643 → 29,643 | PASS | Promoted mini |
| page-general | rain-paths | 9,754 → 16,702 | +6,948 | 16,702 → 16,702 | PASS | Promoted mini |

The historical column measures the actual source that entered this optimization pass. The current-formal column records the post-approval archive and therefore matches every candidate; it must not be interpreted as the historical before value.

## What the audit fixed

- **Fallback evidence:** renderer, asset, or data failures now preserve truthful core evidence instead of becoming blank, misleading, or silently incomplete.
- **Ownership and lifecycle:** partial-failure cleanup, listeners, RAF/timers, resources, and cached public APIs now have explicit ownership and inert-after-dispose behavior.
- **Readable-compact source:** semi-minified state, geometry, and compound template paths were separated into learnable semantic units while avoiding gratuitous expansion.

## Code-runtime exception

`tree-traversal`, `grid-bfs`, `edit-distance`, and `euclid-recursion` total **65,797 → 66,087 author-layer chars**. They are compact, subject-specific core-code examples designed to load together with `code.md` and `code-samples.md`; a second lossy mini layer would remove semantic traces, tests, or native views, so all four remain no-mini exceptions.

## Review and verification

- Live review: [http://127.0.0.1:41031/sample-workbench/improve/](http://127.0.0.1:41031/sample-workbench/improve/)
- Verify: `python3 experiments/workflow-skills-next/sample-workbench/improve/verify.py --base-url http://127.0.0.1:41031`
- Final full gate: **23/23 PASS**, the authoritative auxiliary ledger reports **19 promoted minis + 3 full direct + 1 full only**, and **46/46 baseline/candidate URLs returned HTTP 200**.

Promotion was performed only after explicit user approval of all 23 samples. Future candidate changes still require a new review decision.
