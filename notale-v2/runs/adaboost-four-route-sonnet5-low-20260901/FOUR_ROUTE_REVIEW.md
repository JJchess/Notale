# AdaBoost four-route smoke review

Date: 2026-09-01  
Model: AWS-Claude-Sonnet-5  
Effort: low for every Builder turn  
Run: `adaboost-four-route-sonnet5-low-20260901`

The Planner produced eight pages for a 20-minute AdaBoost lesson. The controlled Builder smoke selected one page from each route:

| Page | Route | Topic | End state |
|---|---|---|---|
| page-01 | build-cover | AdaBoosting 算法 | interrupted after anomalous diagnostic loop |
| page-03 | build-page | 样本权重与分类器权重 | natural stop |
| page-04 | build-interaction | 调节样本权重的模拟训练 | natural stop |
| page-06 | build-code | Python 实现一轮 AdaBoost | natural stop |

## Cost and behavior

Amounts below come directly from `trace.jsonl`. `input` includes cached input; no currency estimate is made because this proxy has no configured price.

| Page | Model turns | Tool calls | Wall time | Input | Cached | Fresh | Output | Check | Look |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| page-01 | 59 | 63 | 18m24s before kill | 4,750,321 | 4,323,790 | 426,531 | 35,012 | 16 | 8 |
| page-03 | 11 | 12 | 5m27s | 581,755 | 338,758 | 242,997 | 9,194 | 3 | 1 |
| page-04 | 30 | 32 | 12m20s | 2,046,786 | 1,792,941 | 253,845 | 15,611 | 15 | 6 |
| page-06 | 21 | 22 | 8m17s | 1,335,632 | 1,048,586 | 287,046 | 19,504 | 2 | 3 |

The three naturally completed pages alone used 62 model turns. Removing skeleton reads and workflow gates therefore removed the old source of waste but did not constrain autonomous visual iteration. Most excess work was repeated Check/Look, especially the 15 Checks and 36 returned images on page-04. The interrupted cover additionally drifted into Bash-based geometry diagnostics.

## Routing protocol

The code route followed the intended first response exactly: `code.md`, the combined four-sample bundle, and `CodeScaffold` in parallel.

The other routes exposed catalog-selection failures:

- page-01 loaded `magnetic-field.full` and `magnetic-field.mini` from the same row, then loaded another auxiliary sample in the next response;
- page-03 selected transferable mechanism samples, but loaded its third sample in a later response;
- page-04 loaded `lawn-path.full` and `lawn-path.mini` from the same row, then loaded another auxiliary sample later.

No page read an empty HTML skeleton. The ordinary pages each used one whole-page Write. The code page used one scaffold and then wrote or edited only lesson files.

## Quality review

### build-cover — reject

The interrupted artifact renders without a JavaScript error, but it is not a cover. It became a small AdaBoost training visualization with round counters, legend, explanatory copy, and a decision boundary. The independent check reports only 3% occupied evidence area and overridden stage padding. It also entered a long Check/Bash diagnostic loop. This route failed both category boundary and termination behavior.

### build-page — usable, visually ordinary

The page is correct and coherent: a stable sample set moves through authored states for error, alpha, and reweighting. It stays on the content-page side of the boundary because the controls reveal predetermined steps rather than changing a governing model. It renders without errors at 51% occupancy. The visual result is readable but still resembles a conventional panel-and-tab explainer more than the strongest reference samples.

### build-interaction — strongest result, inefficient

This page satisfies the central learning requirement. Threshold and direction change a real decision-stump model; weighted error, alpha, wrong-sample evidence, and the normalized next-round weights are derived from current state. Exact reset and keyboard/pointer controls exist. It renders cleanly at 57% occupancy and is the strongest of the completed outputs. Its weakness is execution cost: 30 model turns, 15 Checks, six Looks, and 36 visual inputs.

### build-code — runtime pass, learning task revise

The fixed workbench behaved correctly: Python execution, trace playback, tests, native view, timeout recovery, keyboard sash, reduced motion, and reset checks passed. The source/trace/view evidence chain is real. However, `starter.py` already contains the complete implementation and all tests pass on the first run. The learner is invited mostly to run and inspect rather than make a meaningful code edit, retry, or transfer. The platform route works; the authored learning contract does not yet meet the code-practice bar.

## Conclusion

The workflow split is useful: `build-interaction` produced a genuinely consequential simulation, `build-page` produced a valid authored explanation, and `build-code` successfully used the dedicated host. The experiment does not support declaring all four routes ready. `build-cover` failed, code needs a required learner edit, and Main/Aux selection plus stopping behavior remain unreliable.

The next iteration should stay prompt/reference-level rather than reintroducing a Builder state machine:

1. make a clean Check with no named defect an explicit stopping condition, and forbid checks that do not cover a new state or verify a concrete edit;
2. remove the Main/Aux same-row ambiguity from catalog presentation;
3. require code starters to contain a meaningful incomplete decision plus a transfer edit, rather than a fully passing solution;
4. restate the cover boundary operationally: no rounds, metrics, legends, training controls, or algorithm explanation on a title page.

