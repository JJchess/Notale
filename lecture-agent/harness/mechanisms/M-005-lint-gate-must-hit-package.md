id: M-005
title: A lint/format gate must actually exercise the package it claims to check
status: proposed
trigger: Any CI/Makefile quality target that names a path glob. Does NOT apply to config-driven targets (e.g. mypy via packages=[...], which already resolves correctly).
behavior_change: The ruff target runs against the real package path (lecture_agent tests) instead of the nonexistent src/, and a guard fails the step if the lint command matched zero files — so a path that silently checks nothing can no longer report green.
enforcement_point: INTENDED (enforcement pending) — the CI `lint` step fails when ruff resolves zero files or a violation exists, blocking the merge. Until the Makefile/ci.yml edit lands, this record stays status:proposed and is NOT yet enforced.
enforcement_type: workflow-gate
failure_mode: A future rename re-breaks the path; the zero-file guard is the backstop, but only if it is added alongside the path fix (not the path fix alone).
scenarios: S-005
rejects_example: `ruff check src tests` when src/ does not exist — the zero-file guard makes the step fail instead of passing empty.
cost: One-line Makefile/ci.yml change plus a small zero-file guard; negligible per-run cost.
decision: D-005

## Notes
Filed per the user's "归档+决策,择机再改" choice: the fix direction is decided (D-005) but the production code change is deferred to an implementation pass, so the mechanism is honestly proposed, not accepted.
