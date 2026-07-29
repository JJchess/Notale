id: S-002
title: Silent capability regression goes undetected across dozens of real runs
kind: observed
context: domain/media icon attachment; the deterministic attach_icons step in the fan-out/assemble stage of the orchestrator.
trigger: _icons_path() resolved one directory level off, so list_icons() returned 0 for every run — no error, no crash, just an empty result treated as "no icons matched".
bad_outcome: Icons were silently absent from 39 real generated decks; the capability looked wired but produced nothing, and nothing signaled the no-op.
why_it_matters: A capability that degrades to a no-op without any signal is worse than a missing one — the pipeline reports success while quietly shipping less. It stayed hidden until a coverage-heatmap audit noticed the cell was permanently cold.
status: addressed
addressed_by: M-004

## Notes
Recorded verbatim in tests/test_icons.py docstring as a real bug caught only by the heatmap audit. This is the founding observed failure for M-004.
