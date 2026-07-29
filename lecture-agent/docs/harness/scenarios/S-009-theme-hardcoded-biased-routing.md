id: S-009
title: Theme selection is hardcoded in the prompt with discipline bias and no guard
kind: observed
context: The planner (domain/planning.py::_skeleton_spec) at the PLAN stage, deciding the deck's theme (color/font visual identity).
trigger: The 15 Theme enum members' "when to use" hints lived only as one hand-written Chinese f-string clause inside _skeleton_spec — no independent data source (unlike SkillEntry.description). That clause carried discipline bias ("lab 暗仪表理工实验", "cobalt-grid 研究公报", "monochrome 密集文本/考据") plus a directional nudge ("别总默认 cobalt-grid… 非可量化题材别选 lab"). Nothing linked the enum to that text, and the skeleton JSON example listed only the original 4 themes.
bad_outcome: Two coupled defects. (1) Bias: the description told the model which academic subject each theme "belongs to" and named a default to avoid — steering choice instead of letting the model judge topic↔mood fit. (2) Drift with no guard: 11 of 15 ported themes were absent from the skeleton example and had no test tying enum↔description, so a new theme could be added and stay invisible to the planner (icons-silently-zero class of regression).
why_it_matters: Same principle as S-008 — the description IS the decision surface — but here the description existed yet was biased and unguarded. A theme's visual identity should route on aesthetics alone; discipline tags and named defaults are exactly the hand-coded bias the description-driven approach removes.
status: addressed
addressed_by: M-009

## Notes
Distinct from S-004 (token-coherence: agent hardcodes colors bypassing theme tokens). This is about theme *selection* routing, not token adherence.
