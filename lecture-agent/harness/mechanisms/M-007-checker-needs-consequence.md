id: M-007
title: Every deterministic checker must be wired to a consequence, or be labeled advisory
status: proposed
trigger: Any deterministic gate/checker that computes a pass/fail or quality verdict. Does NOT apply to checks explicitly filed as advisory/telemetry (which must say so).
behavior_change: completeness.gate's verdict is consumed as a consequence — it blocks eval acceptance / is surfaced as a hard warning in the generation report — instead of being computed and discarded; a checker with no consumer is either wired or relabeled advisory.
enforcement_point: INTENDED (enforcement pending) — the eval/generation path treats gate()==False as a failing outcome (nonzero exit / rejected acceptance), not just a logged number. Until wired, status:proposed.
enforcement_type: workflow-gate
failure_mode: The gate is "wired" to a warn-only log that nothing acts on — the same theater one rung down. The consequence must be observable (exit code / rejected artifact), not a printed line.
scenarios: S-007
rejects_example: completeness.gate returning pass=False for a truncated deck while the CLI still exits 0 and the deck ships — the wired consequence makes that outcome fail.
cost: Wiring one boolean into an existing exit-code/report path; negligible.
decision: D-007

## Notes
Note the asymmetry: block_issues (same module) IS already wired into per-block generation; only the whole-doc gate() is orphaned. This mechanism is about the orphaned verdict.
