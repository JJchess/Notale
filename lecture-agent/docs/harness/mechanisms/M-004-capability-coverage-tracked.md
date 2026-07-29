id: M-004
title: Capability coverage is telemetry-tracked and silent-zero is caught by a regression test
status: accepted
trigger: Any capability whose output is data-dependent and could degrade to an empty/no-op result without erroring (icons, media, variant coverage). Does NOT apply to capabilities whose absence throws an exception.
behavior_change: "Produced nothing" is no longer indistinguishable from "correctly produced nothing" — a regression test asserts a nonzero floor, and long-cold capabilities are made visible in an aggregated heatmap instead of hiding behind a green pipeline.
enforcement_point: tests/test_icons.py asserts list_icons() > 0; it runs in the CI `test` step (pytest) and a failure BLOCKS the merge. Complementarily, profile_deck + viewer/build_coverage.py aggregate results/ledger.jsonl into coverage.html so a capability stuck cold across runs is surfaced for audit.
enforcement_type: script
failure_mode: The regression test pins only the icons path; a different capability could silently zero out with no equivalent assertion. The heatmap catches it only if someone reads it. Mitigation: treat a newly-cold cell as the signal to add the next assertion.
scenarios: S-002
rejects_example: the real _icons_path() off-by-one that returned 0 icons across 39 runs — test_icons.py now fails on that state and the heatmap cell shows cold, so it cannot ship unnoticed.
cost: One assertion in the CI test step; the heatmap is an opt-in offline aggregation (zero runtime cost).
decision: D-004

## Notes
The founding failure S-002 was a real silent no-op across 39 runs. This mechanism is the "completeness critic made standing" pattern — a cold cell is the next scenario.
