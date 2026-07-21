id: M-011
title: The batch experiment runner isolates per-topic/seed failures instead of crashing the whole run
status: advisory
trigger: Any exception raised by run_generation() inside scripts/run_experiment.py's topics × seeds loop.
behavior_change: The generation call for each (topic, seed) pair is wrapped in try/except; a failure is logged with the topic/seed/error and recorded in metrics.json's "runs" list as {"ok": false, "error": "..."}, then the loop continues to the next pair instead of propagating the exception and aborting the entire batch.
enforcement_point: None. scripts/ has no test coverage in this repo (no existing precedent — tests/ covers domain/agent/schema, not Hydra entry-point scripts), so this round did not add one. Verified manually only: re-running genre_routing after the fix completed all 15 topics instead of stopping at topic 2.
enforcement_type: none
failure_mode: Nothing blocks a future edit from removing the try/except and reintroducing the crash-the-whole-batch behavior — this is exactly why it stays advisory per the schema's own rule (enforcement_type: none → status: advisory, no exceptions). Promoting to accepted would need a unit test asserting _run() continues past a raising run_generation(), which first needs scripts/ to become importable/testable (not attempted this round — proportionate to the narrow, minimal fix the user asked for).
scenarios: S-011
rejects_example: n/a (advisory — no enforcement to defeat)
cost: One try/except per (topic, seed) iteration; no added runtime cost on the success path.
decision: D-011

## Notes
Deliberately narrow: does NOT fix the underlying root cause (S-011's un-validated skeleton scene shape in orchestrator.py) — only isolates its blast radius at the batch-runner boundary, per explicit user decision to keep this turn's fix minimal and not touch orchestrator.py. The root-cause fix (shape validation before the placeholder loop) remains open for a future round.
