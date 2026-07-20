id: S-007
title: A deterministic gate is computed but no consequence consumes it
kind: observed
context: domain/evaluation/completeness.py::gate() returns {pass, truncation, hero_offtopic, page_delta, ...}; it is framed as the zero-token pre-LLM-judge quality gate.
trigger: gate() is called only by eval/bench scripts (eval_matrix.py, bench_latency.py) to compute a score; it is not wired into the generation pipeline or CI, so its pass=False changes nothing about what ships.
bad_outcome: A doc that fails the completeness gate (truncated / off-topic / wrong length) is still emitted normally; the "gate" is a measurement, not a gate. (block_issues from the same module IS wired into per-block generation; the whole-doc gate() is not.)
why_it_matters: A checker with detection but no consequence is exactly the enforcement-theater pattern North warns against — the appearance of a gate without the punishment half. It invites false confidence that completeness is enforced.
status: open
addressed_by: M-007

## Notes
Defect #3. The detection half exists and is good; only the consequence half is missing.
