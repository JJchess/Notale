id: M-010
title: The sim eligibility gate is stated as a criterion (quantifiable/simulatable process), not a discipline blacklist
status: accepted
trigger: Any topic being planned for a sim/widget block. Applies to both domain/planning.py's hand-written gate and skills/create-sim/SKILL.md's description (the latter feeds plan_menu() directly).
behavior_change: The gate text no longer names disciplines ("人文/艺术/历史/思辨" / "humanities/history/opinion"); it states the real condition instead — a sim needs a quantifiable/mechanistic process with a real parameter to turn, otherwise it is decoration, not interaction. The positive half of the gate (quantifiable/simulatable/interactive processes should use sim boldly) is unchanged — only the negative half's phrasing moved from named-category to criterion.
enforcement_point: tests/test_planning.py::test_skeleton_prompt_drops_interactive_suppression asserts the skeleton prompt contains the new criterion phrase ("没有可量化") and contains none of the old discipline names ("人文"/"艺术"/"历史"). Runs in the CI `test` step (pytest); a failure BLOCKS the merge.
enforcement_type: script
failure_mode: The guard only checks for the specific old discipline words and the specific new criterion phrase — a differently-worded reintroduction of discipline bias (e.g. naming a different subject) would not be caught. Whether the criterion actually produces the right behavior on real topics is validated empirically via the genre_routing experiment (build_coverage.py's prose-group sim/runnable rate), not by this test alone.
scenarios: S-010
rejects_example: reverting the gate text to name any academic discipline (e.g. re-adding "非理工科不要用 sim") — the "人文"/"艺术"/"历史" absence assertion fails.
cost: One assertion inside an existing pytest module; no new test file, no runtime cost.
decision: D-010

## Notes
Direct continuation of M-009's principle applied to a different selection surface (sim eligibility rather than theme choice), found via a post-M-009 audit of remaining biased selection points.
