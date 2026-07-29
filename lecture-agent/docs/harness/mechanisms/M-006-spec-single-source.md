id: M-006
title: The schema SPEC has a single source of truth; copies cannot silently drift
status: proposed
trigger: Any edit to a SPEC.md that exists in more than one location. Does NOT apply to genuinely independent docs (READMEs, per-skill contracts) that are not claimed to be synced.
behavior_change: One SPEC.md is canonical; the skill-local references/ copy is either generated from it or diff-checked against it, so a divergence is caught mechanically instead of rotting behind a "synced from viewer/schema/" claim.
enforcement_point: INTENDED (enforcement pending) — a CI diff/drift check fails when the canonical SPEC and the mirrored copy differ (or the copy is generated at build time so it cannot differ), blocking the merge. Until wired, status:proposed.
enforcement_type: workflow-gate
failure_mode: A manual copy-paste "sync" re-introduces drift between checks; only generation-from-source or a CI diff removes the manual step entirely.
scenarios: S-006
rejects_example: viewer/schema/SPEC.md saying runnable count is unlimited while references/SPEC.md says "至多一个" — the drift check fails CI until they agree.
cost: One CI diff step or a small generation script; run once per CI job.
decision: D-006

## Notes
Enforcement deferred (implementation pass). The scenario S-006 is real and open; this is the recorded remedy direction.
